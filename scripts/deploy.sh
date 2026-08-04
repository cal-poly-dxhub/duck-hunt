#!/usr/bin/env bash
#
# Duck Hunt — full deployment helper.
#
# Run this AFTER `aws configure` (or with a named profile via -p). It will:
#   1. verify prerequisites and AWS credentials
#   2. resolve/persist UNIQUE_ID in .env
#   3. install dependencies and typecheck the CDK app
#   4. bootstrap CDK (idempotent) and deploy the stack
#   5. (optional) upload a game config and print the team/level URLs
#
# Usage:
#   ./scripts/deploy.sh -r us-west-2
#   ./scripts/deploy.sh -r us-west-2 -u dev-yourname -c ../config.json
#   ./scripts/deploy.sh -r us-east-1 -p my-aws-profile
#
# Flags:
#   -r <region>    AWS region to deploy into (required)
#   -u <id>        UNIQUE_ID for resource naming (default: from .env, else prompt)
#   -c <path>      Game config JSON to upload after deploy (optional)
#   -p <profile>   AWS CLI/SDK profile to use (optional)
#   -y             Non-interactive: assume "yes" and never prompt for approval
#   -h             Show this help

set -euo pipefail

# ------------ locate repo root (script lives in <root>/scripts) ------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ------------ colors ------------
if [[ -t 1 ]]; then
  BOLD="$(tput bold)"; RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"; BLUE="$(tput setaf 4)"; RESET="$(tput sgr0)"
else
  BOLD=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi
log()  { echo "${BLUE}${BOLD}==>${RESET} ${BOLD}$*${RESET}"; }
ok()   { echo "${GREEN}  ✓${RESET} $*"; }
warn() { echo "${YELLOW}  ! $*${RESET}"; }
die()  { echo "${RED}${BOLD}ERROR:${RESET} $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Duck Hunt — full deployment helper.

Run this AFTER `aws configure` (or with a named profile via -p). It will:
  1. verify prerequisites and AWS credentials
  2. resolve/persist UNIQUE_ID in .env
  3. install dependencies and typecheck the CDK app
  4. bootstrap CDK (idempotent) and deploy the stack
  5. (optional) upload a game config and print the team/level URLs

Usage:
  ./scripts/deploy.sh -r us-west-2
  ./scripts/deploy.sh -r us-west-2 -u dev-yourname -c ../config.json
  ./scripts/deploy.sh -r us-east-1 -p my-aws-profile

Flags:
  -r <region>    AWS region to deploy into (required)
  -u <id>        UNIQUE_ID for resource naming (default: from .env, else prompt)
  -c <path>      Game config JSON to upload after deploy (optional)
  -p <profile>   AWS CLI/SDK profile to use (optional)
  -y             Non-interactive: assume "yes" and never prompt for approval
  -h             Show this help
EOF
  exit "${1:-0}"
}

# ------------ parse flags ------------
REGION=""; UNIQUE_ID_ARG=""; CONFIG_PATH=""; PROFILE=""; ASSUME_YES=0
while getopts ":r:u:c:p:yh" opt; do
  case "${opt}" in
    r) REGION="${OPTARG}" ;;
    u) UNIQUE_ID_ARG="${OPTARG}" ;;
    c) CONFIG_PATH="${OPTARG}" ;;
    p) PROFILE="${OPTARG}" ;;
    y) ASSUME_YES=1 ;;
    h) usage 0 ;;
    :) die "Option -${OPTARG} requires an argument. See -h." ;;
    \?) die "Unknown option -${OPTARG}. See -h." ;;
  esac
done

[[ -n "${REGION}" ]] || die "Region is required. Example: ./scripts/deploy.sh -r us-west-2"

# Profile applies to every aws/cdk call below.
if [[ -n "${PROFILE}" ]]; then
  export AWS_PROFILE="${PROFILE}"
fi
# CDK resolves region from these; the stack is region-agnostic.
export AWS_REGION="${REGION}"
export AWS_DEFAULT_REGION="${REGION}"
export CDK_DEFAULT_REGION="${REGION}"

# ------------ 1. prerequisites ------------
log "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "node not found. Install Node.js v18+."
command -v aws  >/dev/null 2>&1 || die "aws CLI not found. Install and run 'aws configure'."
# Corepack activates the Yarn version pinned in package.json ("packageManager").
# Without it a globally-installed Yarn 1.x would run against a Yarn 4 lockfile.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable >/dev/null 2>&1 || true
command -v yarn >/dev/null 2>&1 || die "yarn not found. Enable it with: corepack enable"
case "$(yarn --version)" in
  4.*) ;;
  *) die "Expected Yarn 4.x (pinned in package.json), got $(yarn --version). Run: corepack enable" ;;
esac
ok "node $(node --version), yarn $(yarn --version), aws present"

# ------------ 2. verify credentials ------------
log "Verifying AWS credentials${PROFILE:+ (profile: ${PROFILE})}"
CALLER_JSON="$(aws sts get-caller-identity --output json 2>/dev/null)" \
  || die "AWS credentials not valid. Run 'aws configure'${PROFILE:+ --profile ${PROFILE}} first."
ACCOUNT_ID="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Account))' <<<"${CALLER_JSON}")"
export CDK_DEFAULT_ACCOUNT="${ACCOUNT_ID}"
ok "Account ${ACCOUNT_ID} in region ${REGION}"

# ------------ 3. resolve UNIQUE_ID -> .env ------------
log "Resolving UNIQUE_ID"
UNIQUE_ID=""
if [[ -n "${UNIQUE_ID_ARG}" ]]; then
  UNIQUE_ID="${UNIQUE_ID_ARG}"
elif [[ -f .env ]] && grep -q '^UNIQUE_ID=' .env; then
  UNIQUE_ID="$(grep '^UNIQUE_ID=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
fi
if [[ -z "${UNIQUE_ID}" ]]; then
  if [[ "${ASSUME_YES}" -eq 1 ]]; then
    die "UNIQUE_ID not set. Pass -u <id> or add it to .env."
  fi
  read -r -p "Enter a UNIQUE_ID (e.g. dev-$(whoami)): " UNIQUE_ID
  [[ -n "${UNIQUE_ID}" ]] || die "UNIQUE_ID cannot be empty."
fi
# UNIQUE_ID is interpolated into globally-unique S3 bucket names
# (photo-bucket-<id>, game-config-<id>), so it must satisfy S3 naming rules.
# Validating here turns an opaque mid-deploy CloudFormation failure into a
# clear message. 50 chars keeps "photo-bucket-" + id under the 63-char limit.
if [[ ! "${UNIQUE_ID}" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
  die "UNIQUE_ID must start and end with a lowercase letter or digit and contain only lowercase letters, digits and hyphens. Got: '${UNIQUE_ID}'"
fi
if (( ${#UNIQUE_ID} > 50 )); then
  die "UNIQUE_ID must be 50 characters or fewer (S3 bucket name limit). Got ${#UNIQUE_ID}."
fi
# Persist to .env (bin/duck-hunt.ts reads it via dotenv).
if [[ -f .env ]] && grep -q '^UNIQUE_ID=' .env; then
  tmp="$(mktemp)"; grep -v '^UNIQUE_ID=' .env > "${tmp}" || true
  { echo "UNIQUE_ID=${UNIQUE_ID}"; cat "${tmp}"; } > .env; rm -f "${tmp}"
else
  echo "UNIQUE_ID=${UNIQUE_ID}" >> .env
fi
export UNIQUE_ID
ok "UNIQUE_ID=${UNIQUE_ID} (written to .env)"

STACK_NAME="DuckHuntStack-${UNIQUE_ID}"

# ------------ 4. install + typecheck ------------
# Corepack downloads the pinned yarn (packageManager) non-interactively.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

log "Installing dependencies (yarn install)"
yarn install
ok "Dependencies installed"

log "Typechecking CDK app (yarn build)"
yarn build
ok "Typecheck passed"

# Build the static frontend locally. CDK's BucketDeployment (lib/frontend.ts)
# uploads frontend/out to the site bucket at deploy time, so this must run
# before `cdk deploy`. The API URL is injected at deploy time via env.js.
log "Building frontend (frontend/out)"
yarn --cwd frontend build
ok "Frontend built"

# ------------ 5. bootstrap (idempotent) ------------
log "Bootstrapping CDK environment aws://${ACCOUNT_ID}/${REGION}"
yarn cdk bootstrap "aws://${ACCOUNT_ID}/${REGION}"
ok "Bootstrap complete"

# ------------ 6. deploy ------------
log "Deploying ${STACK_NAME}"
OUTPUTS_FILE="$(mktemp)"
# Only bypass approval prompts when -y was passed; otherwise leave CDK's
# default so IAM / security-group changes are surfaced for review.
if [[ "${ASSUME_YES}" -eq 1 ]]; then
  yarn cdk deploy "${STACK_NAME}" --require-approval never --outputs-file "${OUTPUTS_FILE}"
else
  yarn cdk deploy "${STACK_NAME}" --outputs-file "${OUTPUTS_FILE}"
fi
ok "Stack deployed"

# Extract the config bucket name from stack outputs (key is set in the stack).
CONFIG_BUCKET="$(node -e '
  const fs=require("fs");
  const o=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const s=o[process.argv[2]]||{};
  const k=Object.keys(s).find(k=>/GameConfigBucketName/i.test(k));
  process.stdout.write(k?s[k]:"");
' "${OUTPUTS_FILE}" "${STACK_NAME}" 2>/dev/null || true)"
rm -f "${OUTPUTS_FILE}"

echo
log "Deployment summary"
echo "  Stack:         ${STACK_NAME}"
echo "  Region:        ${REGION}"
echo "  Config bucket: ${CONFIG_BUCKET:-<see CloudFormation outputs>}"

# ------------ 7. optional: upload game config + print URLs ------------
if [[ -n "${CONFIG_PATH}" ]]; then
  [[ -f "${CONFIG_PATH}" ]] || die "Config file not found: ${CONFIG_PATH}"
  [[ -n "${CONFIG_BUCKET}" ]] || die "Could not resolve game config bucket from stack outputs."

  log "Uploading game config: ${CONFIG_PATH}"
  aws s3 cp "${CONFIG_PATH}" "s3://${CONFIG_BUCKET}/$(basename "${CONFIG_PATH}")"
  ok "Uploaded. CreateGame Lambda is populating DynamoDB."

  log "Fetching team/level URLs + routes from CloudWatch (waiting ~15s for logs)"
  sleep 15
  LOG_GROUP="CreateGameLambdaLogGroup-${UNIQUE_ID}"
  OUT="$(aws logs tail "${LOG_GROUP}" --since 2m --format short 2>/dev/null \
    | sed -n '/Game ID:/,/====/p' \
    | sed -E 's/^[0-9T:.-]+ [0-9T:.-]+Z[[:space:]]+[a-f0-9-]+[[:space:]]+INFO(\t| )?//')"
  if [[ -n "${OUT}" ]]; then
    echo "${OUT}"
    ok "URLs + routes above. Full JSON (incl. team-id/level-id) is in log group ${LOG_GROUP}."
  else
    warn "Could not tail ${LOG_GROUP} yet. Check CloudWatch Logs in a minute."
  fi
else
  echo
  warn "No -c <config> provided. To start a game:"
  echo "    aws s3 cp <your-config.json> s3://${CONFIG_BUCKET:-<config-bucket>}/"
  echo "    then read team/level URLs from log group CreateGameLambdaLogGroup-${UNIQUE_ID}"
fi

echo
ok "${BOLD}Done.${RESET}"
