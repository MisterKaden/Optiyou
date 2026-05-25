#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN before running this script.}"

ZONE_NAME="${ZONE_NAME:-optiyou.co}"
API_BASE="${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}"
WORKER_TARGET_IP="${WORKER_TARGET_IP:-192.0.2.1}"

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ -n "$data" ]]; then
    curl -sS -X "$method" "$API_BASE$path" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -sS -X "$method" "$API_BASE$path" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json"
  fi
}

require_success() {
  local response="$1"
  local context="$2"

  if [[ "$(jq -r '.success' <<<"$response")" != "true" ]]; then
    echo "Cloudflare API failed during: $context" >&2
    jq '.errors' <<<"$response" >&2
    exit 1
  fi
}

zone_response="$(api GET "/zones?name=$ZONE_NAME")"
require_success "$zone_response" "zone lookup"

ZONE_ID="$(jq -r '.result[0].id // empty' <<<"$zone_response")"
if [[ -z "$ZONE_ID" ]]; then
  echo "Zone not found in Cloudflare: $ZONE_NAME" >&2
  exit 1
fi

upsert_record() {
  local type="$1"
  local name="$2"
  local content="$3"
  local payload
  local lookup
  local record_id
  local response

  payload="$(jq -n \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    '{type: $type, name: $name, content: $content, ttl: 1, proxied: true}')"

  lookup="$(api GET "/zones/$ZONE_ID/dns_records?type=$type&name=$name")"
  require_success "$lookup" "DNS lookup for $name"
  record_id="$(jq -r '.result[0].id // empty' <<<"$lookup")"

  if [[ -n "$record_id" ]]; then
    response="$(api PUT "/zones/$ZONE_ID/dns_records/$record_id" "$payload")"
    require_success "$response" "DNS update for $name"
    echo "Updated $type $name"
  else
    response="$(api POST "/zones/$ZONE_ID/dns_records" "$payload")"
    require_success "$response" "DNS create for $name"
    echo "Created $type $name"
  fi
}

set_zone_setting() {
  local setting="$1"
  local value="$2"
  local payload
  local response

  payload="$(jq -n --arg value "$value" '{value: $value}')"
  response="$(api PATCH "/zones/$ZONE_ID/settings/$setting" "$payload")"
  require_success "$response" "zone setting $setting"
  echo "Set $setting=$value"
}

upsert_record A "$ZONE_NAME" "$WORKER_TARGET_IP"
upsert_record CNAME "www.$ZONE_NAME" "$ZONE_NAME"

set_zone_setting ssl strict
set_zone_setting always_use_https on
set_zone_setting automatic_https_rewrites on
set_zone_setting brotli on
set_zone_setting http3 on
set_zone_setting min_tls_version 1.2

echo "Cloudflare DNS and zone baseline complete for $ZONE_NAME."

