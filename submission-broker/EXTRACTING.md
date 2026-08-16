# Extracting submission-broker into its own repo

This directory is self-contained on purpose. Moving it out costs one `git mv`
and one `git init` — no code edit required.

## Steps

1. From the parent repo (`tooth-fairy`), decide on a destination, e.g.
   `~/Code/submission-broker`.
2. Move the directory and re-home it as its own repo:

   ```sh
   git mv submission-broker ../submission-broker
   cd ../submission-broker
   git init
   git add -A
   git commit -m "Extract submission-broker from tooth-fairy"
   ```

3. Move the two test files that exercise it — they live at the parent
   repo's `test/` root today because that repo's test runner only looks
   there:

   ```sh
   mkdir test
   git mv ../tooth-fairy/test/broker-schema.test.js test/
   git mv ../tooth-fairy/test/broker-validate.test.js test/
   ```

   Update their `import` paths: they currently read
   `../submission-broker/modules/broker/lambda/...`; in the extracted repo
   that becomes `../modules/broker/lambda/...`.

4. Add a minimal `package.json` (`{"type":"module","scripts":{"test":"node --test"}}`)
   if the extracted repo needs one to run `npm test`.
5. In the *old* repo (tooth-fairy), point at the new repo instead of a
   subdirectory: either vendor it back in as a git submodule, or just keep
   consuming the deployed broker's Function URL — tooth-fairy's `js/submit/`
   client only needs a URL and a token, never the Terraform.

## What a second consumer must supply

Nothing in `modules/` changes. A second consumer adds:

- `consumers/<name>/main.tf` — provider block + one `module "broker"` call
  (see `consumers/tooth-fairy/main.tf` as the template): `name`,
  `bucket_name`, `allowed_origins`, `submit_token`, `schema`.
- `consumers/<name>/schema.json` — its own `SUBMISSION_SCHEMA` document
  (prefix, sessionIdPattern, keyTemplate, files). See README.md's
  "The submission schema" section for the compilation rules and the
  safety constraints on `sessionIdPattern` and `prefix`.
- `consumers/<name>/terraform.tfvars.example` — a template for the
  git-ignored `terraform.tfvars` holding that consumer's `submit_token`.

Nothing under `modules/broker/` may name a consumer, a product, or a
domain-specific term — that is the property this extraction depends on,
and what makes reuse by a second consumer (or a second, unrelated project)
free of edits to the shared module.
