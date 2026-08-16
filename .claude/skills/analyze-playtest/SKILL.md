---
name: analyze-playtest
description: Analyze a tooth-fairy playtest session — locate exported tf-session files, transcribe voice notes with Whisper, merge into a marker timeline, and write a report. Use when asked to analyze a playtest, a session recording, a submission, or tf-session-* files.
---

# Analyze a playtest session

Turn a submitted playtest session (a `tf-session-<id>.jsonl` events file plus zero or more
voice recordings) into a report with the tester's spoken and typed commentary aligned to
gameplay markers.

## 0. The delay caveat — read this before you conclude anything

A tester describes something **after** it happens. `markerEnd` is when they stopped talking
or hit submit, not when the thing they are describing happened. Look **15–90 seconds earlier**
in that entry's trail before you decide where a complaint, a confusion, or a bug report
actually lands in the timeline.

Every entry carries a `trail` — a 180s rolling window of gameplay markers sampled every 2s,
ending at `markerEnd`. `scripts/playtest-merge.mjs` renders it as a table under each entry.
Read the trail, not just the marker, before writing a finding. This is the single most
important idea in this skill; treat every other step as scaffolding for getting it right.

## 1. Locate the session files

A session is one `tf-session-<id>.jsonl` plus zero or more audio files
`tf-session-<id>-v<k>.m4a` (or `.webm`). `<id>` matches `\d{13}-[a-z0-9]{4}`.

- If the user gave a path, use it.
- Else check for a local download first — the panel's file sink (used before infra exists,
  or whenever the broker is unreachable) downloads `<sessionId>.zip` containing the jsonl and
  every audio file, or a bare `<sessionId>.jsonl` when there is no audio:

      ls -t ~/Downloads/*.zip ~/Downloads/tf-session-*.jsonl 2>/dev/null
      unzip -d /tmp/tf-<id> ~/Downloads/<sessionId>.zip   # only if a .zip was found

- Else pull from S3 (see "S3 source" below).

## 2. Transcribe the voice notes

Skip this section when the session has no audio files.

Probe for a transcriber, in this order:

1. `mlx_whisper --help` — install with `pipx install mlx-whisper`; models download
   automatically on first use. Preferred on Apple Silicon.
2. `whisper-cli --help` — install with `brew install whisper-cpp`; it needs a model file once:
   `curl -L --create-dirs -o ~/.cache/whisper/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin`

If neither is present, ask the user which to install.

`scripts/transcribe.mjs` drives both backends and does the ffmpeg conversion step for you:

    node scripts/transcribe.mjs tf-session-<id>-v1.m4a --out /tmp/tf-<id> \
      --model mlx-community/whisper-base.en-mlx

It shells out to `ffmpeg`, **never `afconvert`**: despite the `.m4a` name, Chrome's
`MediaRecorder` writes a fragmented MP4 (`moof`/`mdat`) carrying OPUS, not AAC. CoreAudio
opens neither, so `afconvert` fails outright with `AudioFileOpenURL failed`. `ffmpeg` reads
both, and the same command handles `.webm` recordings too.

Pass `--model` explicitly. The `mlx_whisper` default (`whisper-tiny`) drops and mangles words
in ordinary playtest commentary — on one clip tiny gave "and just testing recording" where
`base.en` gave "And I'm just testing the recording." Step up to
`mlx-community/whisper-small.en-mlx` when the commentary is quiet or fast.

`scripts/transcribe.mjs` preserves the `-v<k>` suffix in its output filename — the merge
script recovers the entry index from it, so do not rename the transcript JSON.

## 3. Merge into a timeline

    node scripts/playtest-merge.mjs tf-session-<id>.jsonl [transcript.json ...] --out <file>

Reads both Whisper JSON shapes (`.transcription` with ms offsets from `whisper-cli -oj`,
`.segments` with second offsets from `mlx_whisper --output-format json`) and recovers each
transcript's entry index from the **last** `-v<digits>.` match in its filename — a session id
can itself contain a `-v`-looking substring, so the first match is not safe.

Each rendered entry carries the marker window (`t=…s … t=…s · act · night · teeth`) and, when
present, the trail table:

    | t | act | night | teeth | belief | stir |
    |---|---|---|---|---|---|

Read the whole timeline before analyzing.

## 4. Triage

Work through this checklist against the timeline. For every finding, quote the supporting
entry (voice transcript verbatim, or the text note) with its marker time, and re-check the
trail per the delay caveat above before you name where it lands.

| Category | What to look for |
|---|---|
| Friction | Negative or frustrated commentary near an event; repeated actions without progress. |
| Pacing | Gaps over 30s of trail with no progress (teeth/belief/stir flat) and no commentary. |
| Confusion | "what does X mean"; misread mechanics; a value the tester couldn't explain. |
| Bugs | Anything called out as broken, plus unexpected state in the trail. |
| Ideas | Feature wishes — quote verbatim, do not paraphrase. |
| Progression | One row per act/night reached, with the marker that first shows it. |
| Follow-ups | Concrete next actions, ranked. |

## 5. Write the report

Write `docs/playtests/<sessionId>-report.md`:

    # Playtest <sessionId> — <date>
    ## Summary        (3-6 sentences: what this session showed)
    ## Friction       (finding → evidence quote + trail-corrected timestamp → suggested change)
    ## Pacing
    ## Confusion
    ## Bugs
    ## Ideas
    ## Progression    (the act/night table)
    ## Follow-ups     (ranked)

Omit empty sections, but say in the Summary that they were empty. For a session with no
audio, still run the merge (step 3, no transcript files) — the rendered marker timeline beats
raw JSONL — and say in the Summary that the analysis is events-only.

## S3 source (optional)

When the user names a session id (or says "latest") and no local files match, pull from the
submissions bucket first:

    node scripts/submissions.mjs list
    node scripts/submissions.mjs pull <sessionId> --dest /tmp/tf-pull
    # or: node scripts/submissions.mjs pull --latest --dest /tmp/tf-pull

A row ending in 🎙 has voice notes; the file count tells you how many recordings came with it.

Config resolution, first hit wins: `SUBMISSION_BUCKET`/`SUBMISSION_REGION`/`SUBMISSION_PROFILE`
env vars, then `submission-broker/consumers/tooth-fairy/outputs.json` (only exists once
someone has run `submission-broker/run.sh tooth-fairy apply` — this has deliberately not been
done as of this writing), then `submission.config.json` at the repo root. If `list` fails with
`no bucket configured`, ask the owner for the bucket name — do not improvise AWS access or run
`terraform apply` yourself.

Then continue from step 2 with the pulled files.

### Delete a pulled submission — standing permission, checksum first

Delete a submission once it is pulled and reported, so the bucket does not accumulate personal
recordings. Do not ask first — this is standing permission. **But never delete on a checksum
mismatch** — the recording is the only copy, and a truncated pull that reads fine is not a
pull.

Compare the local MD5 and byte count against the object's ETag and ContentLength. A
single-part upload — which every submission is — has an ETag that IS the MD5, in quotes:

    md5 -q <file>
    aws s3api head-object --bucket "$SUBMISSION_BUCKET" \
      --key "submissions/<YYYY-MM-DD>/<sessionId>/<file>" \
      --profile "${SUBMISSION_PROFILE:-default}" \
      --query '[ETag,ContentLength]' --output text

Every file in the session must match on both values. If any does not, re-pull and compare
again; never delete on a mismatch. Once they all match:

    node scripts/submissions.mjs rm <sessionId>

Say in the report that the submission was verified and removed, and give the checksums.
