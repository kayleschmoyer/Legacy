#!/usr/bin/env python3
"""
Agent harness measurement script.

Run from repo root:  python3 .claude/measure-agent-harness.py

Measures every input that flows into Claude's context on a typical session.
Token counts are exact only when ANTHROPIC_API_KEY is set; otherwise the
script falls back to tiktoken (close approximation) or a char/4 heuristic
(rough approximation, clearly labeled).

Token-counting strategy, in order of preference:
  1. ANTHROPIC_API_KEY in env  -> client.messages.count_tokens (ground truth, exact)
  2. tiktoken cl100k_base      -> close approximation, no network needed if cached
  3. char/4 fallback           -> last resort, clearly labeled as APPROX

Outputs:
  scratch/measure-agent-harness-data.json       (full detail incl. session UUIDs, gitignored)
  scratch/measure-agent-harness-data.anon.json  (anonymized, safe to commit as baseline)

For durable A/B baselines, copy the anonymized scratch JSON to
.claude/measurements/baseline-YYYY-MM-DD.json and commit it. Slim attempts
can then diff the new scratch output against the committed baseline to
prove the change actually moved the numbers. Never commit the non-anon
variant — it contains per-session UUID filenames and detailed usage totals.

Cross-platform notes:
  - Windows: JSONL session files are opened with encoding="utf-8" to avoid
    cp1252 decode errors. MCP server stdio spawning uses shell=True so pnpm
    (.CMD shim) resolves correctly.
  - Linux/macOS: Popen runs without a shell as usual.

Designed to be re-runnable: run it, slim AGENTS.md, run it again, diff JSON.
"""
from __future__ import annotations
import json
import os
import queue
import re
import subprocess
import sys
import threading
from pathlib import Path

# Timeout (seconds) for MCP stdio readline operations. Prevents the harness
# from hanging forever if an MCP server never responds to initialize or
# tools/list. Override via MEASURE_HARNESS_MCP_TIMEOUT.
MCP_RECV_TIMEOUT = float(os.environ.get("MEASURE_HARNESS_MCP_TIMEOUT", "10"))

REPO = Path(__file__).resolve().parent.parent
os.chdir(REPO)

# Model for Anthropic count_tokens API; override via MEASURE_HARNESS_MODEL.
MODEL = os.environ.get("MEASURE_HARNESS_MODEL", "claude-opus-4-5")


# ---------- Tokenizer setup ---------------------------------------------------

class Tokenizer:
    def __init__(self) -> None:
        self.mode = "approx"
        self._client = None
        self._enc = None
        self._cache: dict[str, int] = {}

        # 1. Try the Anthropic count_tokens API (ground truth)
        if os.environ.get("ANTHROPIC_API_KEY"):
            try:
                import anthropic  # type: ignore
                self._client = anthropic.Anthropic()
                # Smoke test
                r = self._client.messages.count_tokens(
                    model=MODEL,
                    messages=[{"role": "user", "content": "ping"}],
                )
                _ = r.input_tokens
                self.mode = "anthropic-api"
                return
            except Exception as e:
                print(f"[tokenizer] anthropic API unavailable: {e}", file=sys.stderr)

        # 2. Try tiktoken (close approximation)
        try:
            import tiktoken  # type: ignore
            self._enc = tiktoken.get_encoding("cl100k_base")
            self.mode = "tiktoken-cl100k_base"
            return
        except Exception as e:
            print(f"[tokenizer] tiktoken unavailable: {e}", file=sys.stderr)

        # 3. Fallback
        print("[tokenizer] FALLING BACK to char/4 approximation", file=sys.stderr)

    def count(self, text: str) -> int:
        if not text:
            return 0
        if text in self._cache:
            return self._cache[text]
        if self.mode == "anthropic-api":
            r = self._client.messages.count_tokens(  # type: ignore
                model=MODEL,
                messages=[{"role": "user", "content": text}],
            )
            n = r.input_tokens
        elif self.mode == "tiktoken-cl100k_base":
            n = len(self._enc.encode(text))  # type: ignore
        else:
            n = max(1, len(text) // 4)
        self._cache[text] = n
        return n


TOK = Tokenizer()


def file_stats(path: Path) -> dict:
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    return {
        "path": path.relative_to(REPO).as_posix(),
        "bytes": len(raw),
        "chars": len(text),
        "lines": text.count("\n") + 1,
        "tokens": TOK.count(text),
    }


# ---------- 1. Always-on root files ------------------------------------------

def measure_always_on() -> dict:
    files = ["AGENTS.md", "CLAUDE.md", ".claude/settings.json"]
    stats = [file_stats(REPO / f) for f in files if (REPO / f).exists()]
    return {
        "files": stats,
        "total_tokens": sum(s["tokens"] for s in stats),
        "total_bytes": sum(s["bytes"] for s in stats),
    }


# ---------- 2. AGENTS.md section breakdown -----------------------------------

def measure_agents_md_sections() -> list[dict]:
    text = (REPO / "AGENTS.md").read_text(encoding="utf-8")
    parts = re.split(r"(?m)^(## .+)$", text)
    sections: list[dict] = []
    preamble = parts[0]
    sections.append({
        "section": "<preamble>",
        "bytes": len(preamble.encode("utf-8")),
        "lines": preamble.count("\n") + 1,
        "tokens": TOK.count(preamble),
    })
    for i in range(1, len(parts), 2):
        header = parts[i].strip()
        body = parts[i + 1] if i + 1 < len(parts) else ""
        full = parts[i] + body
        sections.append({
            "section": header,
            "bytes": len(full.encode("utf-8")),
            "lines": full.count("\n") + 1,
            "tokens": TOK.count(full),
        })
    return sections


# ---------- 3. Skill descriptions (always-on auto-discovery index) -----------

def measure_skill_descriptions() -> list[dict]:
    out: list[dict] = []
    for skill_md in sorted((REPO / ".agents/skills").rglob("SKILL.md")):
        text = skill_md.read_text(encoding="utf-8")
        name = ""
        desc = ""
        in_fm = False
        fm_lines: list[str] = []
        for line in text.splitlines():
            if line.strip() == "---":
                if not in_fm:
                    in_fm = True
                    continue
                else:
                    break
            if in_fm:
                fm_lines.append(line)
        # naive YAML parse
        for line in fm_lines:
            if line.startswith("name:"):
                name = line[5:].strip()
            elif line.startswith("description:"):
                desc = line[len("description:") :].strip().strip("'\"")
        out.append({
            "name": name or skill_md.parent.name,
            "path": skill_md.relative_to(REPO).as_posix(),
            "body_bytes": len(text.encode("utf-8")),
            "body_tokens": TOK.count(text),
            "desc_chars": len(desc),
            "desc_tokens": TOK.count(desc),
        })
    out.sort(key=lambda r: -r["desc_tokens"])
    return out


# ---------- 4. Slash commands -------------------------------------------------

def measure_slash_commands() -> list[dict]:
    out: list[dict] = []
    for p in sorted((REPO / ".claude/commands").glob("*.md")):
        out.append(file_stats(p))
    return out


# ---------- 5. Hook outputs ---------------------------------------------------

def measure_hooks() -> list[dict]:
    out: list[dict] = []
    hook_dir = REPO / ".claude/hooks"
    if not hook_dir.exists():
        return out
    for hook in sorted(hook_dir.iterdir()):
        if not hook.is_file():
            continue
        error_msg: str | None = None
        try:
            r = subprocess.run(
                ["bash", str(hook)],
                input='{"tool_name":"Read","tool_input":{"file_path":"/tmp/x"}}',
                capture_output=True,
                text=True,
                timeout=10,
            )
            stdout = r.stdout
            stderr = r.stderr
            exit_code = r.returncode
        except Exception as e:
            stdout = stderr = ""
            exit_code = -1
            error_msg = f"{type(e).__name__}: {e}"
        row = {
            "hook": hook.relative_to(REPO).as_posix(),
            "stdout_bytes": len(stdout.encode("utf-8")),
            "stdout_tokens": TOK.count(stdout),
            "stderr_bytes": len(stderr.encode("utf-8")),
            "exit": exit_code,
            "stdout_first_200": stdout[:200],
            "stderr_first_200": stderr[:200],
        }
        if error_msg is not None:
            row["error"] = error_msg
        out.append(row)
    return out


# ---------- 6. MCP server tool schema sizes (THE BIG ONE) --------------------

def measure_mcp_tool_schemas() -> dict:
    """
    For each MCP server in .mcp.json, spawn it over stdio and call tools/list.
    Sum the JSON byte size of every tool schema. This is what Claude actually
    sees in its tool definitions block on every session.
    """
    mcp_path = REPO / ".mcp.json"
    if not mcp_path.exists():
        return {"error": ".mcp.json not found"}
    config = json.loads(mcp_path.read_text())
    servers = config.get("mcpServers", {})
    results: list[dict] = []

    for name, spec in servers.items():
        # On Windows, .cmd/.bat must go through the shell. Build a plain
        # command string using subprocess.list2cmdline for proper escaping
        # of paths containing spaces, quotes, and other special characters.
        use_shell = os.name == "nt"
        if use_shell:
            parts = [spec["command"], *spec.get("args", [])]
            cmd = subprocess.list2cmdline(parts)
        else:
            cmd = [spec["command"], *spec.get("args", [])]
        env = os.environ.copy()
        for k, v in spec.get("env", {}).items():
            # ${VAR:-} resolution
            m = re.match(r"\$\{([^:}]+)(?::-([^}]*))?\}", v or "")
            if m:
                env[k] = os.environ.get(m.group(1), m.group(2) or "")
            else:
                env[k] = v or ""

        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                cwd=str(REPO),
                shell=use_shell,
            )
        except Exception as e:
            results.append({"server": name, "error": f"spawn failed: {e}"})
            continue

        # MCP stdio protocol: send initialize, then tools/list.
        # readline() blocks forever if the server never writes, so we run the
        # reader in a background thread and pull lines off a queue with a
        # timeout. This prevents the harness from hanging on silent servers.
        line_q: "queue.Queue[str | None]" = queue.Queue()

        def _reader() -> None:
            assert proc.stdout is not None
            try:
                for line in proc.stdout:
                    line_q.put(line)
            finally:
                line_q.put(None)  # sentinel: EOF

        reader_thread = threading.Thread(target=_reader, daemon=True)
        reader_thread.start()

        def send(req: dict) -> None:
            assert proc.stdin is not None
            proc.stdin.write(json.dumps(req) + "\n")
            proc.stdin.flush()

        def recv(timeout: float = MCP_RECV_TIMEOUT) -> dict | None:
            try:
                line = line_q.get(timeout=timeout)
            except queue.Empty:
                return None
            if line is None or not line:
                return None
            try:
                return json.loads(line)
            except Exception:
                return None

        try:
            send({
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "measure", "version": "0"},
                },
            })
            init_resp = None
            for _ in range(20):
                r = recv()
                if r and r.get("id") == 1:
                    init_resp = r
                    break
            if init_resp is None:
                results.append({"server": name, "error": "no initialize response"})
                continue
            if "error" in init_resp:
                results.append({
                    "server": name,
                    "error": f"initialize failed: {init_resp['error']}",
                })
                continue
            send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
            send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
            tools_resp = None
            for _ in range(50):
                r = recv()
                if r and r.get("id") == 2:
                    tools_resp = r
                    break
            if tools_resp is None:
                results.append({"server": name, "error": "no tools/list response"})
                continue
            if "error" in tools_resp:
                results.append({
                    "server": name,
                    "error": f"tools/list failed: {tools_resp['error']}",
                })
                continue
            tools = tools_resp.get("result", {}).get("tools", [])
            tool_rows = []
            for t in tools:
                schema_json = json.dumps(t)
                tool_rows.append({
                    "name": t.get("name"),
                    "schema_bytes": len(schema_json.encode("utf-8")),
                    "schema_tokens": TOK.count(schema_json),
                    "desc_tokens": TOK.count(t.get("description") or ""),
                })
            tool_rows.sort(key=lambda r: -r["schema_tokens"])
            results.append({
                "server": name,
                "tool_count": len(tools),
                "total_schema_tokens": sum(r["schema_tokens"] for r in tool_rows),
                "total_schema_bytes": sum(r["schema_bytes"] for r in tool_rows),
                "tools": tool_rows,
            })
        except Exception as e:
            results.append({"server": name, "error": str(e)})
        finally:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                proc.kill()

    return {
        "servers": results,
        "grand_total_tokens": sum(
            s.get("total_schema_tokens", 0) for s in results if "error" not in s
        ),
        "total_tools": sum(
            s.get("tool_count", 0) for s in results if "error" not in s
        ),
    }


# ---------- 7. Real session usage from JSONL logs ---------------------------

def measure_session_usage() -> dict:
    """
    Walk ~/.claude/projects/, find every project directory whose name contains
    "legacy-sports", and pull `usage` blocks from each *.jsonl session file.
    Returns aggregate cache hit/miss numbers — REAL data.
    """
    candidates = [
        Path.home() / ".claude/projects",
    ]
    sessions: list[dict] = []
    for base in candidates:
        if not base.exists():
            continue
        for proj_dir in base.iterdir():
            if "legacy-sports" not in proj_dir.name:
                continue
            for jsonl in proj_dir.glob("*.jsonl"):
                turns = 0
                cache_create = 0
                cache_read = 0
                input_tok = 0
                output_tok = 0
                with jsonl.open(encoding="utf-8", errors="replace") as f:
                    for line in f:
                        try:
                            o = json.loads(line)
                        except Exception:
                            continue
                        usage = (
                            o.get("usage")
                            or o.get("message", {}).get("usage")
                            if isinstance(o.get("message"), dict)
                            else None
                        )
                        if usage and isinstance(usage, dict):
                            turns += 1
                            cache_create += usage.get("cache_creation_input_tokens", 0) or 0
                            cache_read += usage.get("cache_read_input_tokens", 0) or 0
                            input_tok += usage.get("input_tokens", 0) or 0
                            output_tok += usage.get("output_tokens", 0) or 0
                if turns:
                    total_in = input_tok + cache_create + cache_read
                    sessions.append({
                        "session": jsonl.name,
                        "turns_with_usage": turns,
                        "input_tokens": input_tok,
                        "cache_creation_tokens": cache_create,
                        "cache_read_tokens": cache_read,
                        "output_tokens": output_tok,
                        "cache_hit_rate": (
                            cache_read / total_in if total_in else 0
                        ),
                    })
    sessions.sort(key=lambda s: -s["cache_read_tokens"])
    if not sessions:
        return {"error": "no session JSONLs with usage blocks found"}
    agg_in = sum(s["input_tokens"] for s in sessions)
    agg_cc = sum(s["cache_creation_tokens"] for s in sessions)
    agg_cr = sum(s["cache_read_tokens"] for s in sessions)
    agg_out = sum(s["output_tokens"] for s in sessions)
    total_in = agg_in + agg_cc + agg_cr
    return {
        "sessions": sessions[:20],  # top 20 by cache reads (full detail)
        "session_count": len(sessions),
        "aggregate": {
            "input_tokens": agg_in,
            "cache_creation_tokens": agg_cc,
            "cache_read_tokens": agg_cr,
            "output_tokens": agg_out,
            "cache_hit_rate": agg_cr / total_in if total_in else 0,
        },
    }


def anonymize_session_usage(su: dict) -> dict:
    """
    Strip identifying per-session info from a session_usage block so the
    result is safe to commit as a baseline. Keeps only the aggregate stats
    (which have no PII/activity leakage) plus a summarized, anonymized
    session count. Session UUID filenames are replaced with sequential
    "session-NNN" ids.
    """
    if "aggregate" not in su:
        return su
    anon_sessions: list[dict] = []
    for idx, s in enumerate(su.get("sessions", []), start=1):
        anon_sessions.append({
            "session": f"session-{idx:03d}",
            "turns_with_usage": s.get("turns_with_usage"),
            "cache_hit_rate": s.get("cache_hit_rate"),
        })
    return {
        "session_count": su.get("session_count"),
        "aggregate": su["aggregate"],
        "sessions_anonymized": anon_sessions,
    }


# ---------- 8. Settings drift -----------------------------------------------

def measure_settings_drift() -> dict:
    s = json.loads((REPO / ".claude/settings.json").read_text())
    allow = s.get("permissions", {}).get("allow", [])
    enabled = set(s.get("enabledMcpjsonServers", []))
    allowed_servers = set()
    for a in allow:
        if a.startswith("mcp__"):
            allowed_servers.add(a.split("__")[1])
    return {
        "allow_entries": len(allow),
        "enabled_mcp_servers": sorted(enabled),
        "servers_in_allow_but_not_enabled": sorted(allowed_servers - enabled),
        "servers_enabled_but_not_in_allow": sorted(enabled - allowed_servers),
    }


# ---------- Run all ---------------------------------------------------------

def main() -> None:
    print(f"[tokenizer] mode = {TOK.mode}")
    data = {
        "tokenizer_mode": TOK.mode,
        "always_on": measure_always_on(),
        "agents_md_sections": measure_agents_md_sections(),
        "skill_descriptions": measure_skill_descriptions(),
        "slash_commands": measure_slash_commands(),
        "hooks": measure_hooks(),
        "mcp_tool_schemas": measure_mcp_tool_schemas(),
        "session_usage": measure_session_usage(),
        "settings_drift": measure_settings_drift(),
    }
    out_json = REPO / "scratch/measure-agent-harness-data.json"
    out_json.parent.mkdir(exist_ok=True)
    out_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"[done] wrote {out_json} (full detail, gitignored)")

    # Baseline-safe variant: anonymize session UUIDs and strip per-session
    # token detail. Safe to copy into .claude/measurements/ and commit.
    anon_data = dict(data)
    anon_data["session_usage"] = anonymize_session_usage(data["session_usage"])
    anon_json = REPO / "scratch/measure-agent-harness-data.anon.json"
    anon_json.write_text(json.dumps(anon_data, indent=2), encoding="utf-8")
    print(f"[done] wrote {anon_json} (anonymized, safe to commit as baseline)")

    # Brief stdout summary
    ao = data["always_on"]
    print(f"\nAlways-on root files: {ao['total_tokens']} tokens / {ao['total_bytes']} bytes")
    mcp = data["mcp_tool_schemas"]
    if "grand_total_tokens" in mcp:
        print(f"MCP tool schemas (all servers): {mcp['grand_total_tokens']} tokens, {mcp['total_tools']} tools")
    su = data["session_usage"]
    if "aggregate" in su:
        a = su["aggregate"]
        print(
            f"Session aggregate ({su['session_count']} sessions): "
            f"cache_hit_rate={a['cache_hit_rate']:.1%}, "
            f"cache_read={a['cache_read_tokens']:,}, "
            f"cache_create={a['cache_creation_tokens']:,}, "
            f"input={a['input_tokens']:,}, "
            f"output={a['output_tokens']:,}"
        )
    print(f"\nFull data: {out_json}")


if __name__ == "__main__":
    main()
