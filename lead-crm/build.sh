#!/usr/bin/env bash
# Builds dist/Code.gs: every .gs file joined into one, for a single copy-paste install.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
{
  echo "// GENERATED FILE — do not edit. Source: lead-crm/apps-script/*.gs (run lead-crm/build.sh)."
  for f in apps-script/*.gs; do
    printf '\n// ===== %s =====\n\n' "$(basename "$f")"
    cat "$f"
  done
} > dist/Code.gs
cp apps-script/FollowUpDialog.html dist/FollowUpDialog.html
