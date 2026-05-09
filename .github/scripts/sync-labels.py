#!/usr/bin/env python3
"""Sync GitHub labels from a labels.yml file using the gh CLI.

Usage: python3 sync-labels.py <labels-file>

Requires GH_TOKEN and GH_REPO environment variables.
Exits non-zero if any create/update/delete operation fails.
"""

import json
import os
import subprocess
import sys
import yaml


def gh(*args):
    """Run a gh CLI command and return (returncode, stdout, stderr)."""
    result = subprocess.run(["gh"] + list(args), capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <labels-file>", file=sys.stderr)
        sys.exit(1)

    labels_file = sys.argv[1]
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
