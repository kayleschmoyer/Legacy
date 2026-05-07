#!/usr/bin/env python3
"""
Rewrite per-shard attachment paths in test-results.json after playwright merge-reports.

After `playwright merge-reports -c config.js ./all-blob-reports`, the JSON reporter
writes test-results.json with stale CI runner paths such as:
  /home/runner/work/.../all-blob-reports/resources/<sha>.<ext>

These paths 404 on the published GitHub Pages report because playwright merge-reports
stores attachments in playwright-report/data/<new-sha>.<ext> with different hashes.

The HTML report's embedded ZIP contains per-file JSON shards that carry the correct
post-merge paths (data/<sha>.<ext>). This script reads those shards, builds a lookup
table keyed by (file, title_path, project, retry), and rewrites the stale paths in
test-results.json in-place.

Usage:
  python3 scripts/rewrite-pw-attachment-paths.py [test-results.json] [playwright-report-dir]

Defaults:
  test-results.json   -> <repo-root>/test-results.json
  playwright-report   -> <repo-root>/playwright-report
"""

import sys
import base64
import zipfile
import io
import json
import os
import tempfile


def find_embedded_zip(html_path: str) -> zipfile.ZipFile:
    """Extract the base64-encoded ZIP from a Playwright HTML report's last <script> tag."""
    with open(html_path, "rb") as f:
        html = f.read()
    marker = b"data:application/zip;base64,"
    idx = html.find(marker)
    if idx == -1:
        raise ValueError(f"No embedded ZIP marker found in {html_path}")
    start = idx + len(marker)
    # The base64 payload ends at a closing quote or </script>
    end = html.find(b"</script>", start)
    if end == -1:
        end = len(html)
    raw = html[start:end].strip().rstrip(b"\"'")
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(raw)))


def parse_shard_map(zf: zipfile.ZipFile) -> dict:
    """
    Parse per-file JSON shards from the embedded ZIP and build a lookup table.

    Each shard (named <fileId>.json) contains tests with correct post-merge
    attachment paths (data/<sha>.<ext>).

    Returns: { (file_base, title_tuple, project, retry): [attachment_path, ...] }
    """
    mapping: dict = {}

    for entry_name in zf.namelist():
        if entry_name == "report.json" or not entry_name.endswith(".json"):
            continue
        try:
            data = json.loads(zf.read(entry_name).decode("utf-8"))
        except Exception:
            continue

        if not isinstance(data, dict) or "tests" not in data:
            continue

        file_base = os.path.basename(data.get("fileName", entry_name))

        for test in data.get("tests", []):
            # path[] is the full title breadcrumb: ["Suite", ..., "test title"]
            path = test.get("path", [])
            if not path:
                title = test.get("title", "")
                path = [title] if title else []

            project = test.get("projectName", "")

            for result in test.get("results", []):
                retry = result.get("retry", 0)
                attachments = result.get("attachments", [])
                if not attachments:
                    continue
                paths = [a.get("path") or "" for a in attachments]
                key = (file_base, tuple(path), project, retry)
                mapping[key] = paths

    return mapping


def collect_results(suite: dict, file_base: str, parent_titles: list, out: list) -> None:
    """
    Recursively walk the JSON reporter suite tree, collecting each test result
    with enough context to build a lookup key.

    JSON reporter top-level suite title == suite file path; we skip it so that
    the title tuple matches the HTML shard's test.path breadcrumb.
    """
    suite_file = suite.get("file", "")
    suite_title = suite.get("title", "")
    resolved_file_base = os.path.basename(suite_file or file_base)

    # The top-level suite has title == its file path — omit it from the breadcrumb
    if suite_file and suite_title == suite_file:
        current_titles = parent_titles[:]
    else:
        current_titles = parent_titles + ([suite_title] if suite_title else [])

    for spec in suite.get("specs", []):
        spec_title = spec.get("title", "")
        full_path = tuple(current_titles + [spec_title])

        for test_case in spec.get("tests", []):
            project = test_case.get("projectName", "")
            for result in test_case.get("results", []):
                retry = result.get("retry", 0)
                out.append(
                    {
                        "result": result,
                        "file_base": resolved_file_base,
                        "title": full_path,
                        "project": project,
                        "retry": retry,
                    }
                )

    for child in suite.get("suites", []):
        collect_results(child, resolved_file_base, current_titles, out)


def rewrite_paths(test_results_path: str, report_dir: str) -> None:
    html_path = os.path.join(report_dir, "index.html")

    if not os.path.exists(html_path):
        sys.exit(f"ERROR: index.html not found at {html_path}")
    if not os.path.exists(test_results_path):
        sys.exit(f"ERROR: test-results.json not found at {test_results_path}")

    print(f"Extracting shard data from {html_path} ...")
    try:
        zf = find_embedded_zip(html_path)
    except Exception as exc:
        sys.exit(f"ERROR extracting ZIP from index.html: {exc}")

    shard_map = parse_shard_map(zf)
    print(f"  Parsed {len(shard_map)} test-result entries from {len(zf.namelist())} ZIP entries")

    if not shard_map:
        print("  WARNING: No attachment data found in HTML shards — nothing to rewrite")
        return

    with open(test_results_path, "r", encoding="utf-8") as f:
        test_results = json.load(f)

    all_results: list = []
    for suite in test_results.get("suites", []):
        collect_results(suite, suite.get("file", ""), [], all_results)

    print(f"Processing {len(all_results)} test results ...")
    patched = 0
    unmatched = 0

    for entry in all_results:
        result = entry["result"]
        attachments = result.get("attachments", [])
        if not attachments:
            continue

        key = (entry["file_base"], entry["title"], entry["project"], entry["retry"])

        new_paths = shard_map.get(key)
        if new_paths is None:
            unmatched += 1
            continue

        if len(new_paths) != len(attachments):
            # Attachment count mismatch — leave stale rather than corrupt
            unmatched += 1
            continue

        for att, new_path in zip(attachments, new_paths):
            if new_path and "path" in att:
                att["path"] = new_path

        patched += 1

    dir_name = os.path.dirname(os.path.abspath(test_results_path))
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=dir_name, delete=False) as tmp:
        tmp_path = tmp.name
        json.dump(test_results, tmp, separators=(",", ":"))
    os.replace(tmp_path, test_results_path)

    print(f"  Patched {patched} results")
    if unmatched:
        print(f"  WARNING: {unmatched} results kept stale paths (match not found in HTML shards)")


if __name__ == "__main__":
    # Default to workspace root (two levels up from scripts/)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    results_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(repo_root, "test-results.json")
    report_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(repo_root, "playwright-report")
    rewrite_paths(results_path, report_dir)
