from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/agents"
REQUIRED = ["INDEX.md", "ARCHITECTURE.md", "CHANGE-MAP.md", "BACKEND.md", "FRONTEND.md", "CONTRACTS.md", "COMPILER.md", "DEPENDENCIES.md", "MAINTENANCE.md", "FEATURE-FLOWS.md", "HOTSPOTS.md", "NAVIGATION.json", "MODULE-GRAPH.json"]

errors: list[str] = []
for name in REQUIRED:
    if not (DOCS / name).exists(): errors.append(f"missing docs/agents/{name}")
graph = json.loads((DOCS / "MODULE-GRAPH.json").read_text())
areas = graph.get("areas", {})
if "apps" in areas: errors.append("module graph contains ambiguous area apps")
if len(areas) < 15: errors.append(f"module graph too small: {len(areas)} areas")
for current, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in (".git", ".worktrees", "node_modules", "dist", "coverage")]
    if "AGENTS.md" not in files: continue
    agent = Path(current) / "AGENTS.md"
    text = agent.read_text()
    if "docs/agents/FEATURE-FLOWS.md" not in text: errors.append(f"missing flow shortcut in {agent.relative_to(ROOT)}")
if errors:
    print("Agent quality check FAILED")
    print(chr(10).join(f"- {e}" for e in errors))
    raise SystemExit(1)
print(f"Agent quality check OK ({len(areas)} dependency areas)")
