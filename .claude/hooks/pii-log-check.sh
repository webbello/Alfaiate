#!/bin/sh
# PostToolUse(Write|Edit): flag log statements that mention customer fields.
f=$(cat | sed -n 's/.*"file_path" *: *"\([^"]*\)".*/\1/p')
case "$f" in
  */src/*|*/tests/*) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0
hits=$(grep -nE 'console\.(log|info|warn|error|debug)\(.*(customer_name|contact_number|phone|notes|customerName|whatsapp)' "$f")
if [ -n "$hits" ]; then
  echo "PII risk (AGENTS.md privacy rule, SEC-05): log statement mentions customer fields in $f:" >&2
  echo "$hits" >&2
  exit 2
fi
exit 0
