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
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

# Allow-list for caller-supplied project slugs. Mirrors assertSafeSlug in session-files.ts.
_SAFE_SLUG_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_project_slug(slug: str) -> str:
    """Validate a caller-supplied project slug against a strict allow-list.

    Mirrors assertSafeSlug in tools/mcp/ci-server/src/session-files.ts.
    Rejects absolute paths, path separators, '..', and any character outside
    [A-Za-z0-9._-] to prevent path-traversal outside ~/.claude/projects/.
    """
    # os.path.basename strips leading separators; if the result differs from
    # the input the caller smuggled in a directory component (e.g. "../foo").
    safe = os.path.basename(slug)
    if not safe or safe in (".", "..") or safe != slug or not _SAFE_SLUG_RE.match(safe):
        print(
            f"Error: invalid project slug {slug!r}. "
            "Must match /^[A-Za-z0-9._-]+$/ with no path separators or '..' components.",
            file=sys.stderr,
        )
        sys.exit(1)
    return safe


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
    e.g., D:\\code\\legacy-sports              -> D--code-legacy-sports
          D:\\code\\legacy-sports\\.claude\\worktrees\\name -> D--code-legacy-sports--claude-worktrees-name

    Claude Code replaces path separators with '-' and '.' with '-', then prefixes
    Windows drive letters with an extra '-' (colon becomes '--').
    """
    cwd = Path.cwd().resolve()
    cwd_str = str(cwd)
    if len(cwd_str) >= 2 and cwd_str[1] == ":":
        # Windows path: D:\code\foo -> D--code-foo
        # Dots in directory names (e.g. .claude) become '-' so \.claude -> --claude
        drive = cwd_str[0]
        rest = (
            cwd_str[2:]
            .replace("\\", "-")
            .replace("/", "-")
            .replace(".", "-")
            .lstrip("-")
        )
        slug = f"{drive}--{rest}"
    else:
        # Unix path: /home/user/.claude/worktrees/foo -> -home-user--claude-worktrees-foo
        slug = cwd_str.replace("/", "-").replace("\\", "-").replace(".", "-")

    slug_dir = projects_dir / slug
    if slug_dir.is_dir():
        return slug

    # Fallback: scan all sibling directories whose name starts with the same
    # prefix and pick the one with the most recently modified JSONL file.
    # This handles edge cases (e.g. projects created before the dot-fix) and
    # avoids the old alphabetical tie-break that always returned the main project
    # dir instead of the active worktree session directory.
    prefix = slug[:10]
    best_mtime: float = -1.0
    best_name: str | None = None
    for d in projects_dir.iterdir():
        if not d.is_dir() or not d.name.startswith(prefix):
            continue
        jsonl_files = list(d.glob("*.jsonl"))
        if not jsonl_files:
            continue
        mtime = max(f.stat().st_mtime for f in jsonl_files)
        if mtime > best_mtime:
            best_mtime = mtime
            best_name = d.name

    if best_name:
        return best_name

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


def extract_scratch_subprocess_calls(repo_root: Path) -> list[dict]:
    """Scan scratch/*.py files for subprocess/os.system calls."""
    scratch_dir = repo_root / "scratch"
    if not scratch_dir.is_dir():
        return []

    results = []
    subprocess_re = re.compile(
        r"subprocess\.(run|Popen|call|check_output|check_call)\s*\(|os\.system\s*\("
    )

    for py_file in sorted(scratch_dir.glob("*.py")):
        try:
            content = py_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line_num, line in enumerate(content.splitlines(), 1):
            if subprocess_re.search(line):
                results.append(
                    {
                        "file": str(py_file.relative_to(repo_root)),
                        "line": line_num,
                        "command_preview": re.sub(r'(["\']).*?\1', r'\1...\1', line.strip())[:100],
                    }
                )
    return results


def format_text(
    bash_calls: list[dict],
    mcp_issues: list[dict],
    session_id: str,
    scratch_calls: list[dict] | None = None,
) -> str:
    """Format results as human-readable text."""
    lines = []
    lines.append(f"Session: {session_id}")
    lines.append(f"Total Bash commands: {len(bash_calls)}")
    lines.append("")

    if not bash_calls and not mcp_issues and not scratch_calls:
        if scratch_calls is not None:
            lines.append("No Bash commands, MCP issues, or scratch subprocess calls found.")
        else:
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

    if scratch_calls is not None:
        lines.append(f"=== scratch/*.py subprocess calls ({len(scratch_calls)}) ===")
        lines.append("")
        for entry in scratch_calls:
            lines.append(f"  {entry['file']}:{entry['line']}")
            lines.append(f"      {entry['command_preview']}")
            lines.append("")

    # Summary
    lines.append("=== Summary ===")
    lines.append(f"  Parent Bash commands:   {len(parent_cmds)}")
    lines.append(f"  Subagent Bash commands: {len(subagent_cmds)}")
    if mcp_issues:
        lines.append(f"  MCP overflows:          {len([m for m in mcp_issues if m.get('is_overflow')])}")
        lines.append(f"  MCP failures:           {len([m for m in mcp_issues if m.get('is_error') and not m.get('is_overflow')])}")
    if scratch_calls is not None:
        lines.append(f"  scratch subprocess calls: {len(scratch_calls)}")
    lines.append(f"  Total Bash commands:    {len(bash_calls)}")

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
    stripped = _strip_cd_prefix(cmd.strip())
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


def _strip_cd_prefix(cmd: str) -> str:
    """Strip leading 'cd <dir> &&' prefix to get the actual command."""
    stripped = cmd.strip()
    # Match: cd <path> && <actual command> or cd <path> ; <actual command>
    # Supports quoted paths (single/double), escaped spaces, and unquoted paths.
    m = re.match(
        r'cd\s+'
        r'(?:"[^"]*"|\'[^\']*\'|\S+)'  # quoted or unquoted path
        r'\s*(?:&&|;)\s*(.*)',
        stripped,
    )
    if m:
        return m.group(1).strip()
    return stripped


def _command_pattern(cmd: str) -> str:
    """Normalise a command to a short scannable pattern (first 3 tokens max)."""
    actual = _strip_cd_prefix(cmd)
    parts = actual.split()
    if not parts:
        return "(empty)"
    # For pnpm exec nx keep 4 tokens (pnpm exec nx <target>)
    if parts[:3] == ["pnpm", "exec", "nx"] and len(parts) > 3:
        return " ".join(parts[:4])
    return " ".join(parts[:3])


# Patterns that are almost always one-off investigative commands (noise).
# Matched against the normalized command pattern (first 3 tokens).
_NOISE_PATTERNS: set[str] = {
    "ls",
    "ls -la",
    "ls -l",
    "ls -1",
    "dir",
    "pwd",
    "echo",
    "cat",
    "head",
    "tail",
    "wc -l",
    "type",
    "which",
    "where",
    "whoami",
    "hostname",
    "date",
    "env",
    "set",
    "printenv",
}

# Patterns that look investigative but are actually recurring workflow gaps.
# These should NOT be filtered as noise.
_RECURRING_INVESTIGATIVE: dict[str, dict[str, str]] = {
    "git show origin": {
        "gap_type": "missing-tool",
        "server": "worktree",
        "reason": "Remote ref:path reads have no MCP equivalent",
    },
    "git ls-tree": {
        "gap_type": "missing-tool",
        "server": "worktree",
        "reason": "Listing files on remote branches has no MCP equivalent",
    },
    "find .": {
        "gap_type": "missing-awareness",
        "server": "n/a",
        "reason": "Should use Glob tool instead of find",
    },
    "find $wt": {
        "gap_type": "missing-awareness",
        "server": "n/a",
        "reason": "Should use Glob tool instead of find",
    },
    "grep -r": {
        "gap_type": "missing-awareness",
        "server": "n/a",
        "reason": "Should use Grep tool instead of grep",
    },
    "grep -rl": {
        "gap_type": "missing-awareness",
        "server": "n/a",
        "reason": "Should use Grep tool instead of grep",
    },
}

def _is_recurring_investigative(pattern: str, sample: str) -> bool:
    """Check if a pattern matches any recurring investigative prefix."""
    stripped = _strip_cd_prefix(sample.strip())
    for rec_pat in _RECURRING_INVESTIGATIVE:
        if pattern.startswith(rec_pat) or stripped.startswith(rec_pat):
            return True
    return False


# Gap type to Jira summary prefix mapping.
_SUMMARY_PREFIX: dict[str, str] = {
    "missing-tool": "feat(mcp):",
    "missing-feature": "feat(mcp):",
    "missing-awareness": "docs(skills):",
}


def _classify_gap_type(cmd: str, pattern: str) -> dict[str, Any]:
    """Classify a gap command into a gap type with confidence and draft ticket info.

    Returns a dict with:
      - gap_type: missing-tool | missing-feature | missing-awareness
      - confidence: high | medium | low
      - server: target MCP server name
      - reason: why this is a gap
      - draft_summary: draft Jira ticket summary
    """
    stripped = _strip_cd_prefix(cmd.strip())

    # Check recurring investigative patterns first (high confidence)
    for rec_pat, info in _RECURRING_INVESTIGATIVE.items():
        if pattern.startswith(rec_pat) or stripped.startswith(rec_pat):
            prefix = _SUMMARY_PREFIX.get(info["gap_type"], "feat(mcp):")
            if info["gap_type"] == "missing-awareness":
                tool_name = "Glob" if "find" in rec_pat else "Grep"
                draft = f'{prefix} guide agents to use {tool_name} instead of `{pattern}`'
            else:
                draft = f'{prefix} add `{pattern.replace(" ", "_")}` support to {info["server"]}'
            return {
                "gap_type": info["gap_type"],
                "confidence": "high",
                "server": info["server"],
                "reason": info["reason"],
                "draft_summary": draft,
            }

    # Heuristic classification based on command structure
    # Commands that invoke tools we have MCP servers for but with uncovered subcommands
    if stripped.startswith("gh "):
        return {
            "gap_type": "missing-feature",
            "confidence": "medium",
            "server": "legacy-sports-github or legacy-sports-ci",
            "reason": f"gh subcommand not covered by MCP: `{pattern}`",
            "draft_summary": f"feat(mcp): add support for `{pattern}`",
        }

    if stripped.startswith("pnpm ") and "nx" not in stripped:
        return {
            "gap_type": "missing-tool",
            "confidence": "medium",
            "server": "legacy-sports-make or legacy-sports-nx",
            "reason": f"pnpm command not covered by MCP: `{pattern}`",
            "draft_summary": f"feat(mcp): add support for `{pattern}`",
        }

    if stripped.startswith("terraform "):
        return {
            "gap_type": "missing-tool",
            "confidence": "medium",
            "server": "legacy-sports-aws",
            "reason": f"Terraform command not covered by MCP: `{pattern}`",
            "draft_summary": f"feat(mcp): add `terraform` support to aws MCP server",
        }

    if stripped.startswith("docker "):
        return {
            "gap_type": "missing-tool",
            "confidence": "low",
            "server": "new server or legacy-sports-ci",
            "reason": f"Docker command not covered by MCP: `{pattern}`",
            "draft_summary": f"feat(mcp): add `docker` support",
        }

    # Generic fallback — low confidence, needs human review
    return {
        "gap_type": "missing-tool",
        "confidence": "low",
        "server": "unknown",
        "reason": f"Uncategorized Bash command: `{pattern}`",
        "draft_summary": f"feat(mcp): investigate MCP coverage for `{pattern}`",
    }


def format_audit(
    bash_calls: list[dict],
    mcp_issues: list[dict],
    session_id: str,
    scratch_calls: list[dict] | None = None,
) -> str:
    """Produce a structured JSON audit report with pre-classifications.

    The output is designed to minimize LLM reasoning — the agent only needs to
    review items flagged as uncertain and approve/reject proposed tickets.
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

    # Build gap items with full classification
    gaps: list[dict[str, Any]] = []
    covered: list[dict[str, Any]] = []
    noise: list[dict[str, Any]] = []

    for pat, count in pattern_counts.most_common():
        status, tool = pattern_classification[pat]
        sample = pattern_sample[pat]

        if status == "covered":
            covered.append({
                "pattern": pat,
                "count": count,
                "mcp_tool": tool,
                "sample": sample[:120],
            })
            continue

        # Check if this is a known noise pattern (curated allowlist only).
        # Singletons (count==1) are NOT auto-filtered — they become low-confidence
        # gaps so the reviewer can decide. Recurring investigative patterns are
        # always promoted to gaps regardless of count.
        is_recurring = _is_recurring_investigative(pat, sample)

        if pat in _NOISE_PATTERNS and not is_recurring:
            noise.append({
                "pattern": pat,
                "count": count,
                "sample": sample[:120],
                "reason": "known noise pattern",
            })
            continue

        # Classify the gap
        gap_info = _classify_gap_type(sample, pat)
        gaps.append({
            "pattern": pat,
            "count": count,
            "sample": sample[:120],
            **gap_info,
        })

    # Classify MCP overflows and failures
    overflow_items: list[dict[str, Any]] = []
    failure_items: list[dict[str, Any]] = []

    for issue in mcp_issues:
        if issue.get("is_overflow"):
            overflow_items.append({
                "tool": issue["name"],
                "snippet": issue.get("overflow_snippet", "")[:200],
                "params": _summarize_params(issue.get("input", {})),
                "fix_type": "needs-review",
                "note": "Check if agent should have used limiting params (agent-error) or if tool lacks them (missing-parameter/bad-default)",
            })
        elif issue.get("is_error"):
            failure_items.append({
                "tool": issue["name"],
                "error": issue.get("error_snippet", "")[:200],
                "params": _summarize_params(issue.get("input", {})),
                "fix_type": "needs-review",
                "note": "Classify as permission-gap, bug, config-issue, or expected-limitation",
            })

    report: dict[str, Any] = {
        "session_id": session_id,
        "summary": {
            "total_bash_commands": sum(pattern_counts.values()),
            "unique_patterns": len(pattern_counts),
            "gaps_found": len(gaps),
            "noise_filtered": len(noise),
            "covered_patterns": len(covered),
            "mcp_overflows": len(overflow_items),
            "mcp_failures": len(failure_items),
        },
        "action_required": {
            "gaps_to_review": [g for g in gaps if g["confidence"] != "high"],
            "gaps_auto_classified": [g for g in gaps if g["confidence"] == "high"],
            "overflows": overflow_items,
            "failures": failure_items,
        },
        "informational": {
            "noise_filtered": noise,
            "covered_commands": covered,
        },
    }

    if scratch_calls is not None:
        report["scratch_subprocess_calls"] = scratch_calls

    # Add instructions for the reviewing agent
    report["instructions"] = (
        "Review 'action_required' section. For 'gaps_to_review' (medium/low confidence): "
        "verify the gap_type and draft_summary, then approve or skip. "
        "For 'gaps_auto_classified' (high confidence): these are pre-approved unless you disagree. "
        "For overflows/failures: classify the fix_type. "
        "Then create Jira tickets for approved gaps under the current MCP gaps bucket epic."
    )

    return json.dumps(report, indent=2)


def _summarize_params(params: dict[str, Any]) -> str:
    """Produce a compact one-line summary of tool parameters."""
    if not params:
        return "(none)"
    parts = []
    for k, v in params.items():
        val_str = str(v)
        if len(val_str) > 40:
            val_str = val_str[:37] + "..."
        parts.append(f"{k}={val_str}")
    return ", ".join(parts)


def format_gaps_only(
    bash_calls: list[dict],
    session_id: str,
    scratch_calls: list[dict] | None = None,
) -> str:
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

    if scratch_calls is not None:
        lines.append(f"=== scratch/*.py subprocess calls ({len(scratch_calls)}) ===")
        for entry in scratch_calls:
            lines.append(f"  {entry['file']}:{entry['line']}  {entry['command_preview']}")
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
    parser.add_argument(
        "--audit",
        action="store_true",
        help=(
            "Structured audit mode: produces a JSON report with pre-classified gaps, "
            "confidence scores, draft ticket summaries, noise filtering, and overflow/failure "
            "triage. Designed to minimize LLM reasoning — the agent reviews and approves "
            "rather than doing the full classification. Implies --include-mcp."
        ),
    )
    parser.add_argument(
        "--scan-scratch",
        action="store_true",
        help=(
            "Also scan scratch/*.py files for subprocess.run/Popen/call/check_output/"
            "check_call and os.system patterns. Results are included in the JSON output "
            "under 'scratch_subprocess_calls' or appended as a section in text/gaps-only output."
        ),
    )
    args = parser.parse_args()

    projects_dir = find_claude_projects_dir()

    # Resolve project slug
    if args.project:
        project_slug = validate_project_slug(args.project)
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

    # --audit implies --include-mcp
    if args.audit:
        args.include_mcp = True

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

    # Scan scratch/*.py for subprocess calls if requested
    scratch_calls: list[dict] | None = None
    if args.scan_scratch:
        repo_root = Path(__file__).resolve().parent.parent
        scratch_calls = extract_scratch_subprocess_calls(repo_root)

    # Output
    if args.audit:
        print(format_audit(bash_calls, mcp_issues, session_id, scratch_calls=scratch_calls))
    elif args.gaps_only:
        print(format_gaps_only(bash_calls, session_id, scratch_calls=scratch_calls))
    elif args.format == "json":
        output = {
            "session_id": session_id,
            "project": project_slug,
            "bash_commands": bash_calls,
            "total": len(bash_calls),
        }
        if args.include_mcp:
            output["mcp_issues"] = mcp_issues
        if scratch_calls is not None:
            output["scratch_subprocess_calls"] = scratch_calls
        print(json.dumps(output, indent=2))
    else:
        print(format_text(bash_calls, mcp_issues, session_id, scratch_calls=scratch_calls))


if __name__ == "__main__":
    main()
