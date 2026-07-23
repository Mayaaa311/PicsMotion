#!/usr/bin/env bash
#
# check-secrets.sh — scan tracked files and pending changes for likely secrets.
#
# Prints only masked previews (never full matches) and file:line locations.
# Exit code:
#   0  no likely secrets found
#   1  likely secret(s) found
#
# Usage:
#   scripts/check-secrets.sh            # scan tracked files + staged/unstaged diff
#   scripts/check-secrets.sh --staged   # scan staged changes only (pre-commit)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Secret-shaped patterns. Keep these specific to avoid noisy false positives.
PATTERNS=(
  'sk-ant-api03-[A-Za-z0-9_-]{20,}'          # Anthropic
  'sk-proj-[A-Za-z0-9_-]{40,}'               # OpenAI project key
  'sk-[A-Za-z0-9]{40,}'                      # OpenAI classic key
  'bfl_[A-Za-z0-9]{20,}'                     # Black Forest Labs
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}'  # fal key:secret
  'AKIA[0-9A-Z]{16}'                         # AWS access key id
  '-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----'
)

REGEX=$(IFS='|'; echo "${PATTERNS[*]}")

STAGED_ONLY=0
[[ "${1:-}" == "--staged" ]] && STAGED_ONLY=1

# Build the file list to scan.
if [[ "$STAGED_ONLY" == "1" ]]; then
  mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM)
else
  # tracked files + files with unstaged/staged changes, de-duplicated
  mapfile -t FILES < <( { git ls-files; git diff --name-only; git diff --cached --name-only; } | sort -u )
fi

found=0
mask() {
  # Show only first 6 and last 4 chars of a match; redact the middle.
  local s="$1"
  local n=${#s}
  if (( n <= 12 )); then printf '****'; else printf '%s...%s' "${s:0:6}" "${s: -4}"; fi
}

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  # Skip this script itself and the example env (placeholders only).
  case "$f" in
    scripts/check-secrets.sh|.env.example) continue ;;
  esac
  # grep -n gives line numbers; -oE gives the match; combine via a loop.
  while IFS= read -r line; do
    lineno="${line%%:*}"
    match="${line#*:}"
    printf '  POSSIBLE SECRET  %s:%s  ->  %s\n' "$f" "$lineno" "$(mask "$match")"
    found=1
  done < <(grep -noE "$REGEX" "$f" 2>/dev/null || true)
done

if [[ "$found" == "1" ]]; then
  echo "check-secrets: likely secret(s) detected (masked above). Remove them before committing." >&2
  exit 1
fi

echo "check-secrets: no likely secrets found."
exit 0
