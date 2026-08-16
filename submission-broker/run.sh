#!/usr/bin/env bash
# Terraform wrapper for the submission broker. Runs terraform (or tofu) in
# consumers/<consumer>/ and writes git-ignored outputs.json there.
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  echo "usage: ./run.sh <consumer> init|plan|apply|outputs|destroy" >&2
  exit 64
}

CONSUMER="${1:-}"
CMD="${2:-}"
[ -n "$CONSUMER" ] && [ -n "$CMD" ] || usage

CONSUMER_DIR="consumers/$CONSUMER"
[ -d "$CONSUMER_DIR" ] || {
  echo "no such consumer: $CONSUMER_DIR" >&2
  exit 64
}

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing: $1 — install with: brew install $2" >&2
    exit 1
  }
}
need aws awscli
need node node

# Homebrew core no longer ships terraform (BSL relicense). OpenTofu is a
# drop-in replacement; use whichever is installed.
if command -v terraform >/dev/null 2>&1; then
  TF=terraform
elif command -v tofu >/dev/null 2>&1; then
  TF=tofu
else
  echo "missing: terraform or tofu — install with: brew install opentofu (or brew install hashicorp/tap/terraform)" >&2
  exit 1
fi

cd "$CONSUMER_DIR"

write_outputs() {
  # Non-sensitive outputs only: the analyst secret stays in terraform
  # state and is retrieved with `terraform output -raw ...`.
  "$TF" output -json | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; });
    process.stdin.on("end", () => {
      const all = JSON.parse(s);
      const keep = {};
      for (const k of ["bucket", "region", "function_url"]) {
        if (all[k]) keep[k] = all[k].value;
      }
      require("node:fs").writeFileSync("outputs.json", JSON.stringify(keep, null, 2) + "\n");
      console.log("wrote " + process.cwd() + "/outputs.json (non-sensitive outputs only)");
    });
  '
}

case "$CMD" in
  init)    "$TF" init ;;
  plan)    "$TF" plan ;;
  apply)   "$TF" apply; write_outputs ;;
  outputs) write_outputs ;;
  destroy) "$TF" destroy ;;
  *)       usage ;;
esac
