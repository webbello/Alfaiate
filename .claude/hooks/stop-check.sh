#!/bin/sh
# Stop: once a package.json with a "check" script exists, require it to pass before finishing.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
[ -f package.json ] && grep -q '"check"' package.json || exit 0
# A deploy is running (npm run deploy:*): `npm run check` rebuilds dist/ and would break it, so skip.
[ -f .deploy.lock ] && kill -0 "$(cat .deploy.lock)" 2>/dev/null && exit 0
# Avoid loop: if Claude is already continuing because of this hook, let it stop.
grep -q '"stop_hook_active" *: *true' <&0 2>/dev/null && exit 0
out=$(npm run -s check 2>&1) || { echo "npm run check failed:" >&2; echo "$out" | tail -30 >&2; exit 2; }
exit 0
