#!/usr/bin/env bash
# Refresh the demo: push a current Salesforce token to Vercel, redeploy, keep the stable URL.
#
# Salesforce access tokens expire, and this app holds a static SF_ACCESS_TOKEN with no refresh
# flow, so the hosted demo goes dead after a while. Run this shortly before a demo.
#
#   ./scripts/demo-refresh.sh
#
# The token is piped straight from the sf CLI into Vercel; it is never printed.
set -euo pipefail

ORG="${ORG:-cc-revenue-org}"
ALIAS="${ALIAS:-consultantcloud-revenue-agent.vercel.app}"
cd "$(dirname "$0")/.."

echo "==> Refreshing the CLI session for $ORG"
sf data query -o "$ORG" -q "SELECT Id FROM Organization LIMIT 1" --json >/dev/null

INSTANCE_URL=$(sf org display --target-org "$ORG" --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["instanceUrl"],end="")')
echo "==> Org instance: $INSTANCE_URL"

# Guard: some agent/CLI harnesses redact secrets in flight. Pushing a redacted token would
# leave the demo returning 401 with no obvious cause, so fail loudly instead.
TOKEN=$(sf org display --target-org "$ORG" --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["accessToken"],end="")')
case "$TOKEN" in
  *REDACTED*|"") echo "ERROR: the token came back redacted or empty. Run this in your own terminal, not inside an agent session." >&2; exit 1 ;;
esac
if [ "${#TOKEN}" -lt 60 ]; then echo "ERROR: token looks too short (${#TOKEN} chars) - refusing to push it." >&2; exit 1; fi

echo "==> Updating SF_INSTANCE_URL and SF_ACCESS_TOKEN on Vercel (production)"
printf '%s' "$INSTANCE_URL" | vercel env add SF_INSTANCE_URL production --force --yes >/dev/null
printf '%s' "$TOKEN" | vercel env add SF_ACCESS_TOKEN production --force --yes >/dev/null
unset TOKEN
echo "    done (token not displayed)"

echo "==> Deploying to production"
URL=$(vercel --prod --yes | tail -1)
echo "    deployed: $URL"

echo "==> Re-pointing $ALIAS at the new deployment"
vercel alias set "$URL" "$ALIAS" >/dev/null
echo
echo "Demo ready: https://$ALIAS"
echo "Note: if the link asks for a Vercel login, turn off Settings -> Deployment Protection."
