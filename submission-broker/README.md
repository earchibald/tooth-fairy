# submission-broker

A small, reusable product: give a browser a one-shot, token-gated write into
a private S3 prefix. Nothing more.

A browser that knows a shared secret token can ask the broker (a Lambda
behind a public Function URL) for a presigned S3 POST. The broker validates
the request against a schema — is the session id well-formed? is the
filename one this consumer expects? is it under the size cap? is the content
type right? — and, only if everything checks out, hands back a one-shot
upload grant scoped to exactly one key. The browser then uploads straight
to S3. The Lambda's own AWS credentials can only `PutObject` under
`submissions/*`; it never sees the uploaded bytes.

This is not tied to any one product. `consumers/` holds the Terraform for
each thing that uses it. `modules/broker/` is the reusable part and knows
nothing about any consumer.

## Layout

```
submission-broker/
  README.md                      this file
  EXTRACTING.md                  how to break this out into its own repo
  run.sh                         run.sh <consumer> init|plan|apply|outputs|destroy
  modules/broker/                the reusable Terraform module
    main.tf variables.tf outputs.tf
    lambda/broker.mjs            handler: validate -> presigned POST
    lambda/schema.mjs            parse + validate a SUBMISSION_SCHEMA document
    lambda/validate.mjs          pure grant validation, schema-driven
  consumers/tooth-fairy/         first consumer
    main.tf terraform.tfvars.example schema.json
```

## Using it as a consumer

1. Add a directory under `consumers/<name>/` with a `main.tf` that declares
   an `aws` provider and one `module "broker" { source = "../../modules/broker" ... }`
   block. See `consumers/tooth-fairy/main.tf` for the shape.
2. Write your own `schema.json` — see "The submission schema" below — and
   point `schema = file("${path.module}/schema.json")` at it.
3. Copy `terraform.tfvars.example` to `terraform.tfvars` (git-ignored) and
   fill in `submit_token`.
4. `./run.sh <name> init`, then `plan`, then (your call, not automated)
   `apply`. `./run.sh <name> outputs` writes the non-sensitive outputs to
   `consumers/<name>/outputs.json`.

## The module interface (`modules/broker/variables.tf`)

| Variable | Type | Notes |
|---|---|---|
| `name` | string | Resource name prefix, e.g. `tooth-fairy`. Used for the Lambda, its role, and the analyst user. |
| `bucket_name` | string | Globally unique. |
| `allowed_origins` | list(string) | Browser origins allowed to POST. |
| `submit_token` | string, sensitive | Shared secret the browser presents. |
| `schema` | string | The JSON submission schema document (below). Passed to the Lambda as `SUBMISSION_SCHEMA`. |
| `expire_days` | number, default 90 | Lifecycle expiry on `submissions/`. |
| `create_analyst_user` | bool, default true | Emit a read/delete IAM user + access key for retrieval. |

Outputs: `bucket`, `region`, `function_url`, `analyst_access_key_id`,
`analyst_secret_access_key` (sensitive).

Resources: a private S3 bucket (full public-access block, AES256 SSE,
lifecycle expiry on `submissions/` plus abort-incomplete-multipart at 7
days), a bucket policy denying `s3:*` when `aws:SecureTransport` is false,
CORS (`POST` only, `allowed_origins`), a `nodejs22.x` Lambda (10s timeout,
env `BUCKET` + `SUBMIT_TOKEN` + `SUBMISSION_SCHEMA`) whose role may only
`s3:PutObject` under `submissions/*`, a Function URL with
`authorization_type = "NONE"` and matching CORS, and (when
`create_analyst_user` is true) an IAM user restricted to
`GetObject`/`DeleteObject` on `submissions/*` plus `ListBucket` conditioned
on that prefix.

## The submission schema

The Lambda's validation logic never changes per consumer — a new consumer
supplies a schema document, not code. Example (`consumers/tooth-fairy/schema.json`):

```json
{
  "prefix": "tf-session",
  "sessionIdPattern": "^\\d{13}-[a-z0-9]{4}$",
  "keyTemplate": "submissions/{date}/{sessionId}/{filename}",
  "files": [
    { "suffix": ".jsonl",      "contentTypes": ["text/plain", "application/x-ndjson"], "maxBytes": 26214400 },
    { "suffix": "-v{n}.m4a",   "contentTypes": ["audio/mp4"],   "maxBytes": 209715200 },
    { "suffix": "-v{n}.webm",  "contentTypes": ["audio/webm"],  "maxBytes": 209715200 }
  ]
}
```

`lambda/schema.mjs` compiles this document once, at Lambda cold start:

- In a `files[].suffix`, the token `{n}` expands to `\d+`; every other
  character is regex-escaped.
- The filename regex for that file entry is
  `^<prefix>-<sessionId><suffixPattern>$`, where `<sessionId>` is
  `sessionIdPattern` with its own `^`/`$` stripped (it is written
  self-anchored so it also works standalone).
- `{date}` in `keyTemplate` is the UTC `YYYY-MM-DD` of the request.

**Security:** the session id is interpolated into the S3 key, so it is
matched against `sessionIdPattern` *before* it touches the key. A
`sessionIdPattern` that could match a string containing `/`, `\`, or `..`
is rejected at schema-compile time — a consumer cannot configure a
path-traversing schema, only supply one that's safe by construction. The
same check applies to `prefix`. This means a bad schema fails the whole
Lambda at cold start rather than silently accepting an unsafe request.

`lambda/validate.mjs` exposes `validateGrant(body, { expectedToken, schema, date })`,
returning `{ ok:true, key, maxBytes, contentType }` or `{ ok:false, status, reason }`.
Token comparison is constant-time over SHA-256 digests, so differing
lengths cannot throw. Refusals: 503 submissions disabled (no token
configured) · 403 bad token · 400 bad session id · 400 bad filename ·
413 too large · 415 bad content type.

## Testing

`test/broker-schema.test.js` and `test/broker-validate.test.js` (at the
repo root — see `EXTRACTING.md` for where they move on extraction) are
plain `node --test` over the two Lambda modules. No Terraform, no AWS.

## Safety

`run.sh` never runs `apply` or `destroy` on its own. Applying creates a
publicly reachable Function URL and a real S3 bucket — that's a deliberate
human decision, not something a script should do for you.
