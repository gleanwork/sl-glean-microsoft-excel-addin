#!/usr/bin/env bash
set -euo pipefail

load_env() {
  local env_name="${1:-prod}"
  local env_file="deployment/config/${env_name}.env"
  if [[ ! -f "$env_file" ]]; then
    echo "Missing $env_file. Copy deployment/config/prod.env.example first." >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

aws_cmd() {
  AWS_PROFILE="${AWS_PROFILE}" AWS_REGION="${AWS_REGION}" aws "$@"
}
