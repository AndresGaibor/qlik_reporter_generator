#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUDED = {".git", ".worktrees", "node_modules", "dist", "coverage"}
REQUIRED_DOCS = [
    "AGENTS.md",
    "docs/agents/INDEX.md",
    "docs/agents/ARCHITECTURE.md",
    "docs/agents/CHANGE-MAP.md",
    "docs/agents/BACKEND.md",
    "docs/agents/FRONTEND.md",
    "docs/agents/CONTRACTS.md",
    "docs/agents/COMPILER.md",
    "docs/agents/DEPENDENCIES.md",
    "docs/agents/MAINTENANCE.md",
    "docs/agents/NAVIGATION.json",
]
REQUIRED_AGENT_DIRS = [
    "apps/api/src",
    "apps/api/src/modulos",
    "apps/api/src/modulos/reportes",
    "apps/api/src/modulos/reportes/aplicacion/compilador-vnext",
    "apps/web/src",
    "apps/web/src/modulos",
    "packages/contratos",
    "packages/contratos/src",
]


def fail(errors: list[str], message: str) -> None:
    errors.append(message)



def agent_files() -> list[Path]:
    result: list[Path] = []
    for current, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDED]
        if "AGENTS.md" in files:
            result.append(Path(current) / "AGENTS.md")
    return result


def check_required(errors: list[str]) -> None:
    for rel in REQUIRED_DOCS:
        if not (ROOT / rel).exists():
            fail(errors, f"missing required doc: {rel}")
    for rel in REQUIRED_AGENT_DIRS:
        if not (ROOT / rel / "AGENTS.md").exists():
            fail(errors, f"missing AGENTS.md: {rel}")


def check_markdown_links(errors: list[str]) -> None:
    roots = [ROOT / "AGENTS.md", ROOT / "docs/agents"]
    files: list[Path] = []
    for item in roots:
        files.extend(item.rglob("*.md") if item.is_dir() else [item])
    for file in files:
        text = file.read_text(errors="ignore")
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            clean = target.split("#", 1)[0]
            if not clean:
                continue
            candidate = (file.parent / clean).resolve()
            if not candidate.exists():
                fail(errors, f"broken markdown link in {file.relative_to(ROOT)}: {target}")


def check_navigation(errors: list[str]) -> None:
    path = ROOT / "docs/agents/NAVIGATION.json"
    try:
        payload = json.loads(path.read_text())
    except Exception as exc:
        fail(errors, f"invalid NAVIGATION.json: {exc}")
        return
    for key, rel in payload.get("entrypoints", {}).items():
        if not (ROOT / rel).exists():
            fail(errors, f"missing navigation entrypoint {key}: {rel}")
    for area in payload.get("areas", []):
        area_path = ROOT / area["path"]
        if not area_path.exists():
            fail(errors, f"missing navigation area: {area['path']}")
        agents = area.get("agents")
        if agents and not (ROOT / agents).exists():
            fail(errors, f"missing navigation AGENTS: {agents}")

def check_exclusions(errors: list[str]) -> None:
    for name in EXCLUDED:
        direct = ROOT / name / "AGENTS.md"
        if direct.exists():
            fail(errors, f"AGENTS.md must not be generated in excluded tree: {direct.relative_to(ROOT)}")


def check_coverage(errors: list[str]) -> None:
    agents = agent_files()
    if len(agents) < 30:
        fail(errors, f"expected broad AGENTS coverage, found only {len(agents)} files")


def main() -> int:
    errors: list[str] = []
    check_required(errors)
    check_markdown_links(errors)
    check_navigation(errors)
    check_exclusions(errors)
    check_coverage(errors)
    if errors:
        print("Agent documentation check FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    count = len(agent_files())
    print(f"Agent documentation check OK ({count} AGENTS.md files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
