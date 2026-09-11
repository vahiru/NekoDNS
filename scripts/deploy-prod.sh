#!/usr/bin/env bash
# POSIX-shell equivalent of deploy-prod.ps1, for macOS and Linux.
# Reads configuration from the environment, falling back to a repo-root .env.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31mError: %s\033[0m\n' "$1" >&2; exit 1; }

# .env never overrides something already exported.
load_dotenv() {
  local file="$1" line name value
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in ""|\#*) continue ;; *=*) ;; *) continue ;; esac
    name="${line%%=*}"
    value="${line#*=}"
    name="$(printf '%s' "$name" | tr -d '[:space:]')"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    [ -n "$name" ] || continue
    [ -n "${!name:-}" ] || export "$name=$value"
  done < "$file"
}

require_env() {
  [ -n "${!1:-}" ] || fail "Missing required environment variable: $1"
}

# Rewrites `key = "value"` in wrangler.toml, appending the pair when absent.
upsert_toml() {
  local key="$1" value="$2"
  python3 - "$key" "$value" <<'PY'
import pathlib, re, sys
key, value = sys.argv[1], sys.argv[2]
path = pathlib.Path("wrangler.toml")
text = path.read_text()
pattern = re.compile(rf'^{re.escape(key)}\s*=\s*"[^"]*"', re.MULTILINE)
replacement = f'{key} = "{value}"'
path.write_text(pattern.sub(replacement, text) if pattern.search(text) else f"{text}\n{replacement}\n")
PY
}

set_worker_name() {
  python3 - "$1" <<'PY'
import pathlib, re, sys
path = pathlib.Path("wrangler.toml")
text = path.read_text()
pattern = re.compile(r'^name\s*=\s*"[^"]*"', re.MULTILINE)
replacement = f'name = "{sys.argv[1]}"'
path.write_text(pattern.sub(replacement, text, count=1) if pattern.search(text) else f"{replacement}\n{text}")
PY
}

wrangler_or_fail() {
  local message="$1"; shift
  npx wrangler "$@" || fail "$message
If this is an auth failure, set WRANGLER_API_TOKEN with Workers/D1/Queues permissions,
and CLOUDFLARE_ACCOUNT_ID if the token is account-scoped."
}

put_secret() {
  printf '%s' "$2" | npx wrangler secret put "$1" >/dev/null || fail "Failed to upload secret: $1"
  echo "Uploaded secret: $1"
}

ensure_queue() {
  local queue="$1" listing
  listing="$(npx wrangler queues list 2>&1)" || fail "Failed to list queues:
$listing"
  if printf '%s' "$listing" | grep -qF "$queue"; then
    echo "Queue already exists: $queue"
    return 0
  fi
  echo "Creating queue: $queue"
  wrangler_or_fail "Failed to create queue: $queue" queues create "$queue"
}

# Echoes the database uuid on stdout; all chatter goes to stderr so it stays capturable.
ensure_d1() {
  local db="$1" listing uuid created
  listing="$(npx wrangler d1 list --json 2>/dev/null)" || fail "Failed to list D1 databases."
  uuid="$(printf '%s' "$listing" | python3 -c "
import json, sys
name = sys.argv[1]
try:
    rows = json.load(sys.stdin)
except json.JSONDecodeError:
    rows = []
print(next((row.get('uuid', '') for row in rows if row.get('name') == name), ''))
" "$db")"
  if [ -n "$uuid" ]; then
    echo "D1 already exists: $db ($uuid)" >&2
    printf '%s' "$uuid"
    return 0
  fi

  echo "Creating D1 database: $db" >&2
  created="$(npx wrangler d1 create "$db" 2>&1)" || fail "Failed to create D1 database:
$created"
  uuid="$(printf '%s' "$created" | grep -oE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' | head -1)"
  [ -n "$uuid" ] || fail "Could not parse D1 create output:
$created"
  printf '%s' "$uuid"
}

resolve_account_id_from_zone() {
  if [ -z "${CF_ZONE_ID:-}" ] || [ -z "${CF_API_TOKEN:-}" ]; then return 0; fi
  curl -fsS "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" 2>/dev/null |
    python3 -c "
import json, sys
try:
    body = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)
if body.get('success'):
    print(body.get('result', {}).get('account', {}).get('id', ''))
" || true
}

load_dotenv "$REPO_ROOT/.env"

if [ -n "${WRANGLER_API_TOKEN:-}" ]; then export CLOUDFLARE_API_TOKEN="$WRANGLER_API_TOKEN"; fi
if [ -z "${CF_ZONE_ID:-}" ] && [ -n "${CLOUDFLARE_ZONE_ID:-}" ]; then export CF_ZONE_ID="$CLOUDFLARE_ZONE_ID"; fi
if [ -z "${CF_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then export CF_API_TOKEN="$CLOUDFLARE_API_TOKEN"; fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  resolved="$(resolve_account_id_from_zone)"
  if [ -n "$resolved" ]; then
    export CLOUDFLARE_ACCOUNT_ID="$resolved"
    echo "Auto-resolved CLOUDFLARE_ACCOUNT_ID from CF_ZONE_ID."
  fi
fi

WORKER_NAME="${WORKER_NAME:-nekodns}"
DATABASE_NAME="${DATABASE_NAME:-nekodns}"
QUEUE_NAME="${QUEUE_NAME:-nekodns-jobs}"

step "Checking required environment variables"
require_env CLOUDFLARE_API_TOKEN
require_env TURNSTILE_SECRET_KEY
require_env CF_ZONE_ID
require_env CF_API_TOKEN

EMAIL_FROM="${EMAIL_FROM:-noreply@example.com}"
APP_ORIGIN="${APP_ORIGIN:-https://${WORKER_NAME}.workers.dev}"
PARENT_DOMAIN="${PARENT_DOMAIN:-is-cute.cat}"
TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-1x00000000000000000000AA}"
MAIL_DESTINATION="${MAIL_DESTINATION:-admin@example.com}"

step "Ensuring Cloudflare resources"
ensure_queue "$QUEUE_NAME"
DB_ID="$(ensure_d1 "$DATABASE_NAME")"

step "Updating wrangler.toml bindings"
set_worker_name "$WORKER_NAME"
upsert_toml database_name "$DATABASE_NAME"
upsert_toml database_id "$DB_ID"
upsert_toml queue "$QUEUE_NAME"
upsert_toml destination_address "$MAIL_DESTINATION"
upsert_toml PARENT_DOMAIN "$PARENT_DOMAIN"
upsert_toml EMAIL_FROM "$EMAIL_FROM"
upsert_toml APP_ORIGIN "$APP_ORIGIN"
upsert_toml TURNSTILE_SITE_KEY "$TURNSTILE_SITE_KEY"

step "Building frontend"
npm run build

step "Applying D1 migrations"
wrangler_or_fail "D1 migration failed." d1 migrations apply "$DATABASE_NAME" --remote

step "Uploading worker secrets"
put_secret TURNSTILE_SECRET_KEY "$TURNSTILE_SECRET_KEY"
put_secret CF_ZONE_ID "$CF_ZONE_ID"
put_secret CF_API_TOKEN "$CF_API_TOKEN"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then put_secret TELEGRAM_BOT_TOKEN "$TELEGRAM_BOT_TOKEN"; fi
if [ -n "${TELEGRAM_GROUP_CHAT_ID:-}" ]; then put_secret TELEGRAM_GROUP_CHAT_ID "$TELEGRAM_GROUP_CHAT_ID"; fi
if [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then put_secret TELEGRAM_WEBHOOK_SECRET "$TELEGRAM_WEBHOOK_SECRET"; fi

step "Dry-run deploy"
wrangler_or_fail "Dry-run deploy failed." deploy --dry-run --outdir dist/worker

step "Deploying to production"
wrangler_or_fail "Production deploy failed." deploy

step "Deployment complete"
echo "Worker:         https://${WORKER_NAME}.workers.dev"
echo "D1 database id: ${DB_ID}"
