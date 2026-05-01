#!/usr/bin/env bash
# verify-spec.sh — sanity-check the x402 scheme spec files
# Ensures all sections required by the x402 foundation specs/CONTRIBUTING.md are present.
set -e

SPEC_DIR="$(dirname "$0")/../specs/schemes/randpay"
FAIL=0

check_section() {
  local file="$1"
  local pattern="$2"
  if grep -qE "^#{2,3} (Phase [0-9]+: )?$pattern" "$file"; then
    echo "  ✓ $pattern"
  else
    echo "  ✗ missing section: $pattern"
    FAIL=1
  fi
}

echo "─── scheme_randpay.md ────────────────────────────────"
F="$SPEC_DIR/scheme_randpay.md"
[ -f "$F" ] || { echo "MISSING: $F"; exit 1; }
check_section "$F" "Summary"
check_section "$F" "Use Cases"
check_section "$F" "Security Properties"
check_section "$F" "Appendix"

echo ""
echo "─── scheme_randpay_emc.md ───────────────────────────"
F="$SPEC_DIR/scheme_randpay_emc.md"
[ -f "$F" ] || { echo "MISSING: $F"; exit 1; }
check_section "$F" "Summary"
check_section "$F" "Verification"
check_section "$F" "Settlement"
check_section "$F" "Security Considerations"
check_section "$F" "Appendix"

echo ""
if [ $FAIL -eq 0 ]; then
  echo "✓ all spec sections present"
  exit 0
else
  echo "✗ spec verification failed"
  exit 1
fi
