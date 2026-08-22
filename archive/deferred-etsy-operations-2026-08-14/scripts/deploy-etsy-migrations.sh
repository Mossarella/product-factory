#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_REF=""
APPLY=0

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-etsy-migrations.sh --project-ref <ref> [--apply]

Behavior:
  Without --apply, performs preflight checks and prints the Supabase CLI commands
  that would be used. With --apply, links the local project to the supplied ref
  (if needed) and runs `supabase db push` after an explicit confirmation prompt.

Required environment for --apply:
  SUPABASE_ACCESS_TOKEN   Supabase CLI access token, or an already authenticated CLI.

This script never prints or accepts database passwords, service-role keys, or Etsy
OAuth secrets. Do not place those values in command-line arguments.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      [[ $# -ge 2 ]] || { echo "--project-ref requires a value" >&2; exit 2; }
      PROJECT_REF="$2"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "$PROJECT_REF" ]] || { echo "Missing --project-ref" >&2; usage >&2; exit 2; }
[[ "$PROJECT_REF" =~ ^[a-z0-9-]+$ ]] || { echo "Invalid Supabase project ref format" >&2; exit 2; }

for file in \
  supabase/migrations/0008_etsy_integration.sql \
  supabase/migrations/0009_etsy_webhooks.sql; do
  [[ -f "$file" ]] || { echo "Missing migration: $file" >&2; exit 1; }
done

command -v supabase >/dev/null 2>&1 || {
  echo "Supabase CLI is required. Install it before applying migrations." >&2
  exit 1
}

printf '%s\n' 'Etsy migration deployment preflight'
printf '%s\n' "Project ref: $PROJECT_REF"
printf '%s\n' 'Migrations:'
printf '%s\n' '  0008_etsy_integration.sql'
printf '%s\n' '  0009_etsy_webhooks.sql'
printf '%s\n' 'Dependency order: 0008 before 0009'

if [[ "$APPLY" -eq 0 ]]; then
  cat <<'EOF'

Dry-run only. No migration was applied.

After reviewing the checklist, run:
  scripts/deploy-etsy-migrations.sh --project-ref <ref> --apply
EOF
  exit 0
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is not set; use an authenticated Supabase CLI session or export the token." >&2
  exit 1
fi

printf '\nThis will apply all pending local migrations to Supabase project %s.\n' "$PROJECT_REF"
read -r -p 'Type APPLY-ETSY-MIGRATIONS to continue: ' confirmation
[[ "$confirmation" == 'APPLY-ETSY-MIGRATIONS' ]] || {
  echo 'Aborted; no migration was applied.'
  exit 0
}

supabase link --project-ref "$PROJECT_REF"
supabase migration list
supabase db push
supabase migration list

cat <<'EOF'

Migrations applied through Supabase CLI. Complete the post-deployment SQL checks
in docs/etsy-migrations-deployment-checklist.md before enabling Etsy OAuth/webhooks.
EOF
