#!/usr/bin/env python3
"""Extract all Bash tool_use calls from a Claude Code session transcript.

Parses JSONL session files (parent + subagent) to produce a structured report
of every Bash command executed during the session. Designed to be invoked by
the MCP gap audit (Phase 1) so the audit sees the *complete* session history
regardless of context-window compaction.

Usage:
    # Auto-detect current session (most recently modified JSONL in project dir)
    python scripts/audit-session-bash.py

    # Explicit session ID
    python scripts/audit-session-bash.py --session-id <uuid>

    # Explicit project slug
    python scripts/audit-session-bash.py --project D--code-legacy-sports

    # JSON output for programmatic consumption
    python scripts/audit-session-bash.py --format json

    # Include MCP tool calls (overflows/failures) in the report
    python scripts/audit-session-bash.py --include-mcp

    # Compact gap-focused output (one line per unique pattern, <5 KB)
    python scripts/audit-session-bash.py --gaps-only
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


def find_claude_projects_dir() -> Path:
    """Locate the ~/.claude/projects directory."""
    home = Path.home()
    candidates = [
        home / ".claude" / "projects",
    ]
    for p in candidates:
        if p.is_dir():
            return p
    print("Error: could not find ~/.claude/projects/", file=sys.stderr)
    sys.exit(1)


def detect_project_slug(projects_dir: Path) -> str:
    """Auto-detect the project slug from CWD.

    Converts the current working directory to the slug format Claude Code uses:
    e.g., D:\\code\\legacy-sports -> D--code-legacy-sports
    """
    cwd = Path.cwd().resolve()
    # Claude Code slug format: drive letter + -- + path segments joined by -
    # On Windows: D:\code\legacy-sports -> D--code-legacy-sports
    # On Linux: /home/user/project -> -home-user-project
    cwd_str = str(cwd)
    if len(cwd_str) >= 2 and cwd_str[1] == ":":
        # Windows path: D:\code\foo -> D--code-foo
        drive = cwd_str[0]
        rest = cwd_str[2:].replace("\\", "-").replace("/", "-").lstrip("-")
        slug = f"{drive}--{rest}"
    else:
        # Unix path: /home/user/foo -> -home-user-foo
        slug = cwd_str.replace("/", "-").replace("\\", "-")

    slug_dir = projects_dir / slug
    if slug_dir.is_dir():
        return slug

    # Fallback: try matching on partial name
    for d in sorted(projects_dir.iterdir()):
        if d.is_dir() and d.name.startswith(slug[:10]):
            return d.name

    print(f"Error: could not find project directory for CWD {cwd}", file=sys.stderr)
    print(f"  Expected slug: {slug}", file=sys.stderr)
    print(f"  Projects dir:  {projects_dir}", file=sys.stderr)
    sys.exit(1)


def find_latest_session(project_dir: Path) -> str:
    """Find the most recently modified JSONL file and return its session ID."""
    jsonl_files = sorted(
        project_dir.glob("*.jsonl"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    if not jsonl_files:
        print(f"Error: no JSONL files found in {project_dir}", file=sys.stderr)
        sys.exit(1)
    return jsonl_files[0].stem


def find_session_by_pid(pid: int) -> str | None:
    """Look up session ID from ~/.claude/sessions/{PID}.json."""
    sessions_dir = Path.home() / ".claude" / "sessions"
    pid_file = sessions_dir / f"{pid}.json"
    try:
        data = json.loads(pid_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data.get("sessionId")


def extract_bash_calls(jsonl_path: Path, source: str = "parent") -> list[dict]:
    """Extract Bash tool_use calls from a JSONL file."""
    results = []
    if not jsonl_path.exists():
        return results

    with open(jsonl_path, encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not isinstance(record, dict):
                continue

            msg = record.get("message", {})
            if not isinstance(msg, dict):
                continue

            content = msg.get("content", [])
            if not isinstance(content, list):
                continue

            timestamp = record.get("timestamp", "")
            session_id = record.get("sessionId", "")

            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") != "tool_use":
                    continue
                if block.get("name") != "Bash":
                    continue

                inp = block.get("input")
                if not isinstance(inp, dict):
                    inp = {}
                command = inp.get("command", "")
                description = inp.get("description", "")

                results.append({
                    "command": command,
                    "description": description,
                    "timestamp": timestamp,
                    "source": source,
                    "session_id": session_id,
                    "tool_use_id": block.get("id", ""),
                    "line": line_num,
                })

    return results


def extract_mcp_calls(jsonl_path: Path, source: str = "parent") -> list[dict]:
    """Extract non-Bash tool_use calls that resulted in overflows or errors from a JSONL file."""
    results = []
    if not jsonl_path.exists():
        return results

    # Also look for tool_result blocks that indicate overflow/failure
    tool_calls: dict[str, dict[str, Any]] = {}
    tool_results: dict[str, dict[str, Any]] = {}

    with open(jsonl_path, encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not isinstance(record, dict):
                continue

            msg = record.get("message", {})
            if not isinstance(msg, dict):
                continue

            content = msg.get("content", [])
            if not isinstance(content, list):
                continue

            timestamp = record.get("timestamp", "")

            for block in content:
                if not isinstance(block, dict):
                    continue

                if block.get("type") == "tool_use" and block.get("name") != "Bash":
                    tool_id = block.get("id", "")
                    if not tool_id:
                        continue
                    tool_calls[tool_id] = {
                        "name": block.get("name", ""),
                        "input": block.get("input", {}),
                        "timestamp": timestamp,
                        "source": source,
                        "tool_use_id": tool_id,
                        "line": line_num,
                    }

                if block.get("type") == "tool_result":
                    tool_id = block.get("tool_use_id", "")
                    text = ""
                    result_content = block.get("content", "")
                    if isinstance(result_content, str):
                        text = result_content
                    elif isinstance(result_content, list):
                        text = " ".join(
                            b.get("text", "")
                            for b in result_content
                            if isinstance(b, dict)
                        )
                    tool_results[tool_id] = {
                        "text": text[:500],  # Truncate for summary
                        "is_error": block.get("is_error", False),
                    }

    # Match calls with results, flag overflows and errors
    for tool_id, call in tool_calls.items():
        result = tool_results.get(tool_id, {})
        text = result.get("text", "")
        is_error = result.get("is_error", False)

        is_overflow = (
            "exceeds maximum allowed tokens" in text
            or "Output has been saved to" in text
        )

        if is_overflow or is_error:
            results.append({
                **call,
                "is_overflow": is_overflow,
                "is_error": is_error,
                "error_snippet": text[:200] if is_error else "",
                "overflow_snippet": text[:200] if is_overflow else "",
            })

    return results


def format_text(
    bash_calls: list[dict],
    mcp_issues: list[dict],
    session_id: str,
) -> str:
    """Format results as human-readable text."""
    lines = []
    lines.append(f"Session: {session_id}")
    lines.append(f"Total Bash commands: {len(bash_calls)}")
    lines.append("")

    if not bash_calls and not mcp_issues:
        lines.append("No Bash commands or MCP issues found.")
        return "\n".join(lines)

    # Group by source
    parent_cmds = [c for c in bash_calls if c["source"] == "parent"]
    subagent_cmds = [c for c in bash_calls if c["source"] != "parent"]

    if parent_cmds:
        lines.append(f"=== Parent session ({len(parent_cmds)} commands) ===")
        lines.append("")
        for i, cmd in enumerate(parent_cmds, 1):
            ts = cmd["timestamp"][:19] if cmd["timestamp"] else "?"
            lines.append(f"  [{i}] {ts}")
            lines.append(f"      $ {cmd['command']}")
            if cmd["description"]:
                lines.append(f"      # {cmd['description']}")
            lines.append("")

    if subagent_cmds:
        # Group by source (subagent file)
        sources: dict[str, list[dict]] = {}
        for cmd in subagent_cmds:
            sources.setdefault(cmd["source"], []).append(cmd)

        for source_name, cmds in sources.items():
            lines.append(f"=== Subagent: {source_name} ({len(cmds)} commands) ===")
            lines.append("")
            for i, cmd in enumerate(cmds, 1):
                ts = cmd["timestamp"][:19] if cmd["timestamp"] else "?"
                lines.append(f"  [{i}] {ts}")
                lines.append(f"      $ {cmd['command']}")
                if cmd["description"]:
                    lines.append(f"      # {cmd['description']}")
                lines.append("")

    if mcp_issues:
        overflows = [m for m in mcp_issues if m.get("is_overflow")]
        errors = [m for m in mcp_issues if m.get("is_error") and not m.get("is_overflow")]

        if overflows:
            lines.append(f"=== MCP Overflows ({len(overflows)}) ===")
            lines.append("")
            for m in overflows:
                lines.append(f"  Tool: {m['name']}")
                lines.append(f"  Snippet: {m['overflow_snippet']}")
                lines.append("")

        if errors:
            lines.append(f"=== MCP Failures ({len(errors)}) ===")
            lines.append("")
            for m in errors:
                lines.append(f"  Tool: {m['name']}")
                lines.append(f"  Error: {m['error_snippet']}")
                lines.append("")

    # Summary
    lines.append("=== Summary ===")
    lines.append(f"  Parent Bash commands:   {len(parent_cmds)}")
    lines.append(f"  Subagent Bash commands: {len(subagent_cmds)}")
    if mcp_issues:
        lines.append(f"  MCP overflows:          {len([m for m in mcp_issues if m.get('is_overflow')])}")
        lines.append(f"  MCP failures:           {len([m for m in mcp_issues if m.get('is_error') and not m.get('is_overflow')])}")
    lines.append(f"  Total:                  {len(bash_calls)}")

    return "\n".join(lines)


# Command prefixes whose functionality is covered by an MCP tool.
# Format: (prefix_to_match, mcp_tool_name)
_MCP_COVERED_PREFIXES: list[tuple[str, str]] = [
    # worktree MCP server
    ("git -c ", "worktree-mcp"),
    ("git -C ", "worktree-mcp"),
    ("git --git-dir", "worktree-mcp"),
    ("git add", "worktree-mcp"),
    ("git commit", "worktree-mcp"),
    ("git push", "worktree-mcp"),
    ("git fetch", "worktree-mcp"),
    ("git rebase", "worktree-mcp"),
    ("git status", "worktree-mcp"),
    ("git log", "worktree-mcp"),
    ("git diff", "worktree-mcp"),
    ("git branch", "worktree-mcp"),
    ("git show", "worktree-mcp"),
    ("git rev-parse", "worktree-mcp"),
    ("git merge-base", "worktree-mcp"),
    ("git stash", "worktree-mcp"),
    ("git checkout", "worktree-mcp"),
    ("git worktree", "worktree-mcp"),
    ("twig ", "worktree-mcp"),
    # make MCP server
    ("make ", "make-mcp"),
    # nx MCP server
    ("pnpm exec nx ", "nx-mcp"),
    ("npx nx ", "nx-mcp"),
    # github MCP server
    ("gh pr ", "github-mcp"),
    ("gh api ", "github-mcp"),
    ("gh run ", "ci-mcp"),
    ("gh issue ", "github-mcp"),
    # ci MCP server
    ("python scripts/audit-session-bash", "ci-mcp"),
    # db MCP server
    ("pnpm --prefix lib/db-client run db:", "db-mcp"),
]


def _classify_command(cmd: str) -> tuple[str, str]:
    """Return ('covered', tool_name) or ('gap', '')."""
    stripped = cmd.strip()
    for prefix, tool in _MCP_COVERED_PREFIXES:
        for candidate in (stripped, stripped.lower()):
            p = prefix if candidate is stripped else prefix.lower()
            if candidate.startswith(p):
                # Boundary check: the character immediately after the prefix must be
                # a space, a flag ('-'), or end-of-string.  This prevents "git add"
                # from matching "git address", "git diff" from matching "git diff-index", etc.
                # Prefixes that already end with a non-word character (space, '-', ':')
                # are exempt from the extra check.
                after = candidate[len(p) :]
                if p[-1] in (" ", "-", ":", "/") or not after or after[0] in (" ", "-"):
                    return "covered", tool
    return "gap", ""


def _command_pattern(cmd: str) -> str:
    """Normalise a command to a short scannable pattern (first 3 tokens max)."""
    parts = cmd.strip().split()
    if not parts:
        return "(empty)"
    # For pnpm exec nx keep 4 tokens (pnpm exec nx <target>)
    if parts[:3] == ["pnpm", "exec", "nx"] and len(parts) > 3:
        return " ".join(parts[:4])
    return " ".join(parts[:3])


def format_gaps_only(bash_calls: list[dict], session_id: str) -> str:
    """Compact gap-focused output: one line per unique command pattern.

    Groups all Bash commands by normalised pattern, separates MCP-covered
    commands from genuine gaps, and emits a frequency table that fits in
    well under 5 KB for a typical 30–60 minute session.
    """
    pattern_counts: Counter[str] = Counter()
    pattern_sample: dict[str, str] = {}
    pattern_classification: dict[str, tuple[str, str]] = {}

    for call in bash_calls:
        cmd = call["command"]
        pat = _command_pattern(cmd)
        pattern_counts[pat] += 1
        pattern_sample.setdefault(pat, cmd)
        if pat not in pattern_classification:
            pattern_classification[pat] = _classify_command(cmd)

    gaps: list[tuple[str, int, str]] = []
    covered: list[tuple[str, int, str]] = []

    for pat, count in pattern_counts.most_common():
        status, tool = pattern_classification[pat]
        sample = pattern_sample[pat][:80].replace("\n", " ")
        if status == "gap":
            gaps.append((pat, count, sample))
        else:
            covered.append((pat, count, tool))

    lines: list[str] = [
        f"Session: {session_id}",
        f"Total Bash commands: {sum(pattern_counts.values())}  |  "
        f"Unique patterns: {len(pattern_counts)}  |  "
        f"Gap patterns: {len(gaps)}",
        "",
    ]

    if gaps:
        lines.append(f"=== Potential MCP gaps ({len(gaps)} patterns) ===")
        for pat, count, sample in gaps:
            lines.append(f"  {count:3d}x  {pat:<40s}  e.g.: {sample}")
        lines.append("")

    if covered:
        lines.append(f"=== MCP-covered ({len(covered)} patterns) ===")
        for pat, count, tool in covered:
            lines.append(f"  {count:3d}x  {pat:<40s}  [{tool}]")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    # On Windows the default stdout codec is cp1252, which cannot encode common
    # non-ASCII characters (e.g., U+2192 RIGHTWARDS ARROW) that show up inside
    # transcript command/description fields. Reconfigure to UTF-8 with replace
    # so the script never crashes mid-print on a stray glyph.
    if sys.platform == "win32":
        for stream in (sys.stdout, sys.stderr):
            reconfigure = getattr(stream, "reconfigure", None)
            if callable(reconfigure):
                reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        description="Extract Bash commands from a Claude Code session transcript."
    )
    parser.add_argument(
        "--session-id",
        help="Session UUID. If omitted, uses the most recently modified JSONL.",
    )
    parser.add_argument(
        "--project",
        help="Project slug (e.g., D--code-legacy-sports). Auto-detected from CWD if omitted.",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text).",
    )
    parser.add_argument(
        "--include-mcp",
        action="store_true",
        help="Include MCP tool overflows and failures in the report.",
    )
    parser.add_argument(
        "--pid",
        type=int,
        help="Process ID to look up session ID from ~/.claude/sessions/.",
    )
    parser.add_argument(
        "--gaps-only",
        action="store_true",
        help=(
            "Compact gap-focused output: one line per unique command pattern. "
            "Separates potential MCP gaps from already-covered commands."
        ),
    )
    args = parser.parse_args()

    projects_dir = find_claude_projects_dir()

    # Resolve project slug
    if args.project:
        project_slug = args.project
    else:
        project_slug = detect_project_slug(projects_dir)

    project_dir = projects_dir / project_slug
    if not project_dir.is_dir():
        print(f"Error: project directory not found: {project_dir}", file=sys.stderr)
        sys.exit(1)

    # Resolve session ID
    session_id = args.session_id
    if not session_id and args.pid:
        session_id = find_session_by_pid(args.pid)
        if not session_id:
            print(f"Error: no session found for PID {args.pid}", file=sys.stderr)
            sys.exit(1)
    if not session_id:
        session_id = find_latest_session(project_dir)

    # Parse parent JSONL
    parent_jsonl = project_dir / f"{session_id}.jsonl"
    bash_calls = extract_bash_calls(parent_jsonl, source="parent")

    mcp_issues: list[dict] = []
    if args.include_mcp:
        mcp_issues = extract_mcp_calls(parent_jsonl, source="parent")

    # Parse subagent JSONLs
    subagent_dir = project_dir / session_id / "subagents"
    if subagent_dir.is_dir():
        for sa_file in sorted(subagent_dir.glob("*.jsonl")):
            source_name = sa_file.stem
            bash_calls.extend(extract_bash_calls(sa_file, source=source_name))
            if args.include_mcp:
                mcp_issues.extend(extract_mcp_calls(sa_file, source=source_name))

    # Sort all by timestamp
    bash_calls.sort(key=lambda c: c.get("timestamp", ""))
    mcp_issues.sort(key=lambda c: c.get("timestamp", ""))

    # Output
    if args.gaps_only:
        print(format_gaps_only(bash_calls, session_id))
    elif args.format == "json":
        output = {
            "session_id": session_id,
            "project": project_slug,
            "bash_commands": bash_calls,
            "total": len(bash_calls),
        }
        if args.include_mcp:
            output["mcp_issues"] = mcp_issues
        print(json.dumps(output, indent=2))
    else:
        print(format_text(bash_calls, mcp_issues, session_id))


if __name__ == "__main__":
    main()
