#!/usr/bin/env python3
"""Sync GitHub labels from a labels.yml file using the gh CLI.

Usage: python3 sync-labels.py <labels-file>
       python3 sync-labels.py --check <labels-file>

--check validates the file alone (no network, no GH_TOKEN/GH_REPO needed) and
is what .github/checks/labels-config.sh runs pre-merge.

Requires GH_TOKEN and GH_REPO environment variables for a real sync.
Exits non-zero if validation fails or any create/update/delete operation fails.
"""

import json
import os
import subprocess
import sys
import yaml


# GitHub rejects a label description longer than this with a 422. That
# failure used to only surface post-merge, inside label-sync.yml (which fires
# only when labels.yml itself changes on main) — so an over-long description
# left the live label stuck on GitHub's auto-created defaults: grey `ededed`
# with a null description. `CI: Custom Checks` sat like that among red
# `e11d48` siblings, reading like a non-failure scope label rather than the
# CI failure it is. Validated pre-merge now so the file can never ship a
# description GitHub will refuse.
MAX_DESCRIPTION_LENGTH = 100


def validate_descriptions(desired):
    """Return a list of human-readable problems with the desired label set."""
    if not isinstance(desired, list):
        return [
            f"expected a top-level YAML list of labels, got {type(desired).__name__}"
        ]

    problems = []
    seen = set()
    for label in desired:
        if not isinstance(label, dict):
            problems.append(f"label entry is not a mapping: {label!r}")
            continue
        name = label.get("name")
        if not name:
            problems.append(f"label entry with no name: {label!r}")
            continue
        if name in seen:
            problems.append(f"{name!r}: duplicate entry")
        seen.add(name)
        if not label.get("color"):
            problems.append(f"{name!r}: missing required `color`")
        description = label.get("description") or ""
        if len(description) > MAX_DESCRIPTION_LENGTH:
            problems.append(
                f"{name!r}: description is {len(description)} characters; GitHub "
                f"rejects anything over {MAX_DESCRIPTION_LENGTH} with a 422, which "
                "leaves the live label on its grey auto-created defaults"
            )
    return problems


def gh(*args):
    """Run a gh CLI command and return (returncode, stdout, stderr)."""
    result = subprocess.run(["gh"] + list(args), capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def main():
    args = sys.argv[1:]
    check_only = "--check" in args
    args = [a for a in args if a != "--check"]
    if len(args) != 1:
        print(f"Usage: {sys.argv[0]} [--check] <labels-file>", file=sys.stderr)
        sys.exit(1)

    labels_file = args[0]
    repo = None
    if not check_only:
        repo = os.environ.get("GH_REPO") or os.environ.get("GITHUB_REPOSITORY")
        if not repo:
            print("Error: GH_REPO or GITHUB_REPOSITORY environment variable is required", file=sys.stderr)
            sys.exit(1)

    try:
        with open(labels_file) as f:
            desired = yaml.safe_load(f)
    except FileNotFoundError:
        print(f"Error: Labels file not found at {labels_file}", file=sys.stderr)
        sys.exit(1)
    except yaml.YAMLError as e:
        print(f"Error parsing labels file {labels_file}: {e}", file=sys.stderr)
        sys.exit(1)

    problems = validate_descriptions(desired)
    if problems:
        print(f"Error: {labels_file} is invalid:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        sys.exit(1)

    if check_only:
        print(f"{labels_file}: {len(desired)} label(s) valid")
        return

    desired_map = {d["name"]: d for d in desired}

    # Fetch all current labels via paginated API (avoids --limit truncation)
    rc, stdout, stderr = gh(
        "api",
        f"repos/{repo}/labels",
        "--paginate",
        "--jq", ".[]",
    )
    if rc != 0:
        print(f"Error fetching current labels: {stderr.strip()}", file=sys.stderr)
        sys.exit(1)

    current_list = [json.loads(line) for line in stdout.splitlines() if line.strip()]
    current_map = {label["name"]: label for label in current_list}

    created = updated = deleted = errors = 0

    # Create missing labels / update labels whose color or description differs
    for label in desired:
        name = label["name"]
        color = label["color"].lstrip("#")
        description = label.get("description") or ""

        if name not in current_map:
            rc, _, stderr = gh(
                "label", "create", name,
                "--repo", repo,
                "--color", color,
                "--description", description,
            )
            if rc == 0:
                created += 1
                print(f"+ Created: {name!r}")
            else:
                errors += 1
                print(f"✗ Failed to create {name!r}: {stderr.strip()}", file=sys.stderr)
        else:
            cur = current_map[name]
            cur_color = (cur.get("color") or "").lstrip("#").lower()
            cur_desc = cur.get("description") or ""
            if cur_color != color.lower() or cur_desc != description:
                rc, _, stderr = gh(
                    "label", "edit", name,
                    "--repo", repo,
                    "--color", color,
                    "--description", description,
                )
                if rc == 0:
                    updated += 1
                    print(f"~ Updated: {name!r}")
                else:
                    errors += 1
                    print(f"✗ Failed to update {name!r}: {stderr.strip()}", file=sys.stderr)

    # Delete labels not listed in labels.yml
    for name in current_map:
        if name not in desired_map:
            rc, _, stderr = gh(
                "label", "delete", name,
                "--repo", repo,
                "--yes",
            )
            if rc == 0:
                deleted += 1
                print(f"- Deleted: {name!r}")
            else:
                errors += 1
                print(f"✗ Failed to delete {name!r}: {stderr.strip()}", file=sys.stderr)

    summary = f"{created} created, {updated} updated, {deleted} deleted, {errors} errors"
    print(f"\nSync complete — {summary}")

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
