#!/usr/bin/env python3
"""Check that the github-actions deploy role policies fit under AWS limits.

AWS enforces:
  - Inline IAM role policies: 10,240 bytes.
  - Managed IAM policy versions: 6,144 bytes.

Both limits apply to the *serialized JSON* that AWS receives — the same string
`jsonencode({...})` produces in Terraform. This script extracts each policy's
`policy = jsonencode({...})` body, converts the HCL to a Python data structure,
and re-serializes as compact JSON before measuring length.

Terraform plan does NOT catch size violations — they only surface at apply,
which in this repo runs on `main` after merge, so this check has to be
faithful to what jsonencode() emits, not just an HCL approximation.

Usage:
  python scripts/check-iam-policy-size.py [path/to/github-actions-oidc.tf]

Exit codes:
  0 — both policies are within limits (with at least 240 bytes headroom)
  1 — one or more policies exceed (or are within 240 bytes of) their limit
  2 — script failed to parse the file (something changed shape; investigate)

Read .agents/skills/infrastructure/references/iam-policies.md for the
full convention (inline = closed, supplemental = default home for new
permissions, the resource-level gotchas, etc.).
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

# AWS hard limits for the serialized policy JSON.
INLINE_LIMIT = 10_240
MANAGED_LIMIT = 6_144
# Headroom we want to keep — flag as a near-miss if we're inside this window.
HEADROOM = 240

DEFAULT_TF = Path("terraform/main/github-actions-oidc.tf")

# Realistic substitutions for HCL interpolations so the byte count matches
# what jsonencode() produces in CI. Update if the locals change.
LOCAL_SUBS = {
    "${local.region}": "us-east-1",
    "${local.account_id}": "176661590736",
    "${local.name_prefix}": "legacy-sports-dev",
    "${data.aws_caller_identity.current.account_id}": "176661590736",
}


class ParseError(Exception):
    """Raised when the Terraform file isn't shaped the way this script expects."""


def find_policy_block(content: str, label: str) -> str:
    """Return the text of `policy = jsonencode({...})` for the given resource.

    `label` is the full resource declaration line, e.g.
    `resource "aws_iam_role_policy" "github_actions_additional"`.
    """
    start = content.find(label)
    if start < 0:
        raise ParseError(f"Could not locate resource: {label}")

    je_idx = content.find("policy = jsonencode(", start)
    if je_idx < 0:
        raise ParseError(f"Could not locate jsonencode block in: {label}")

    # Find the matching closing paren of jsonencode(...).
    depth = 0
    i = content.find("(", je_idx)
    body_start = i + 1
    while i < len(content):
        ch = content[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return content[body_start:i]
        i += 1
    raise ParseError(f"Unbalanced parens in: {label}")


def hcl_body_to_json(hcl_body: str) -> str:
    """Convert an HCL object body to compact JSON, returning the JSON string.

    The bodies we deal with here are restricted: pure data (strings, lists,
    objects), bare identifier keys, `=` between key and value, no commas, and
    `${local.x}` interpolations. We:

    1. Substitute HCL interpolations with realistic values (so the size we
       report matches what jsonencode emits at apply time).
    2. Strip line comments.
    3. Quote bare identifier keys: `Effect = ` -> `"Effect": `.
    4. Insert commas between adjacent values (`}{` -> `},{`, and between
       a value and the next key on a new line).
    5. Parse the result with `ast.literal_eval` (safe — pure data only).
    6. Re-serialize as compact JSON.

    Raises ParseError if the body can't be parsed (which means it has shape
    we don't yet handle — investigate before trusting any size estimate).
    """
    s = hcl_body
    for src, dst in LOCAL_SUBS.items():
        s = s.replace(src, dst)

    # Strip whole-line comments.
    s = re.sub(r"(?m)^\s*#.*$", "", s)
    # Strip end-of-line comments after non-string content. We don't have `#`
    # inside any string in these policies, so this is safe.
    s = re.sub(r"(?m)\s+#[^\n]*$", "", s)

    # Quote bare identifier keys preceding `=`.
    s = re.sub(r"(?m)([A-Za-z_]\w*)(\s*)=", r'"\1"\2:', s)

    # Insert commas:
    #   - between `}` and `{` (adjacent objects in a list)
    #   - between `}` / `]` / `"` and a following `"key"` on a new line
    s = re.sub(r"}(\s*){", r"},\1{", s)
    s = re.sub(r'(["\]\}])(\s*\n\s*)"', r'\1,\2"', s)

    try:
        parsed = ast.literal_eval(s)
    except (SyntaxError, ValueError) as exc:
        raise ParseError(
            f"HCL→JSON conversion produced invalid Python literal: {exc}"
        ) from exc

    return json.dumps(parsed, separators=(",", ":"))


def report(name: str, size: int, limit: int) -> bool:
    """Return True if OK, False if over limit or within headroom."""
    pct = size / limit * 100
    remaining = limit - size
    status = "OK"
    ok = True
    if size > limit:
        status = "OVER LIMIT"
        ok = False
    elif remaining < HEADROOM:
        status = f"NEAR LIMIT (<{HEADROOM} bytes headroom)"
        ok = False
    print(
        f"  {name:<40} {size:>6} / {limit} bytes  ({pct:5.1f}%) — {status}"
    )
    return ok


def measure_policy(content: str, resource_label: str) -> int:
    body = find_policy_block(content, resource_label)
    return len(hcl_body_to_json(body))


def main() -> int:
    tf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TF
    if not tf_path.exists():
        print(f"ERROR: file not found: {tf_path}", file=sys.stderr)
        return 2

    try:
        content = tf_path.read_text(encoding="utf-8")
        print(f"Checking IAM policy sizes in {tf_path}\n")

        inline_size = measure_policy(
            content, 'resource "aws_iam_role_policy" "github_actions_additional"'
        )
        managed_size = measure_policy(
            content, 'resource "aws_iam_policy" "github_actions_supplemental"'
        )
    except ParseError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print(
            "The Terraform file may have changed shape. Update this script "
            "before trusting any size estimate.",
            file=sys.stderr,
        )
        return 2

    inline_ok = report("github_actions_additional (inline)", inline_size, INLINE_LIMIT)
    managed_ok = report(
        "github_actions_supplemental (managed)", managed_size, MANAGED_LIMIT
    )

    print()
    if inline_ok and managed_ok:
        print("All policies fit with headroom. Safe to push.")
        return 0

    print(
        "Policy size check FAILED. Read "
        ".agents/skills/infrastructure/references/iam-policies.md for the "
        "convention (default new permissions to github_actions_supplemental)."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
