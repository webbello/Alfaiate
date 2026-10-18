#!/bin/sh
# PreToolUse(Bash): block git add/commit that would stage secrets, DBs or uploads.
cmd=$(cat | sed -n 's/.*"command" *: *"\(.*\)".*/\1/p')
case "$cmd" in
  *"git add"*|*"git commit"*) ;;
  *) exit 0 ;;
esac
bad=$(git ls-files -co --exclude-standard 2>/dev/null | grep -E '(^|/)(\.env(\..*)?|\.dev\.vars|.*\.(sqlite|db)|uploads/.*)$' | grep -v '\.dev\.vars\.example$')
if [ -n "$bad" ]; then
  echo "Blocked: secrets/DB/uploads would be committed:" >&2
  echo "$bad" >&2
  exit 2
fi
exit 0
