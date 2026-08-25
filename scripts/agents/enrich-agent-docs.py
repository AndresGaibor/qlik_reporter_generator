from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUDED = {".git", ".worktrees", "node_modules", "dist", "coverage"}
SOURCE_ROOTS = [ROOT / "apps/api/src", ROOT / "apps/web/src", ROOT / "packages/contratos/src"]
MARKER = "<!-- agent-enrichment -->"


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def source_files() -> list[Path]:
    files: list[Path] = []
    for base in SOURCE_ROOTS:
        files.extend(p for p in base.rglob("*.ts*") if not any(x in p.parts for x in EXCLUDED))
    return sorted(set(files))


def line_count(path: Path) -> int:
    return len(path.read_text(errors="ignore").splitlines())

def resolve_import(source: Path, spec: str) -> Path | None:
    if spec.startswith("@qlik/contratos"):
        suffix = spec.removeprefix("@qlik/contratos").lstrip("/")
        base = ROOT / "packages/contratos/src" / suffix
    elif spec.startswith("."):
        base = source.parent / spec
    else:
        return None
    candidates = [base, base.with_suffix(".ts"), base.with_suffix(".tsx"), base / "index.ts"]
    if base.suffix == ".js":
        candidates.extend([base.with_suffix(".ts"), base.with_suffix(".tsx")])
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.exists() and resolved.is_file() and ROOT in resolved.parents:
            return resolved
    return None


def imports_of(path: Path) -> list[Path]:
    text = path.read_text(errors="ignore")
    specs = re.findall(r'(?:from\s+|import\s*)["\']([^"\']+)["\']', text)
    resolved = [resolve_import(path, spec) for spec in specs]
    return sorted({p for p in resolved if p is not None})


def area_of(path: Path) -> str:
    rp = rel(path)
    if rp == "apps/api/src/app.ts" or rp.startswith("apps/api/src/entradas/"):
        return "apps/api/src"
    if rp == "apps/web/src/main.tsx":
        return "apps/web/src"
    if rp == "packages/contratos/src/index.ts":
        return "packages/contratos/src"
    for prefix in ("apps/api/src/modulos/", "apps/web/src/modulos/", "packages/contratos/src/"):
        if rp.startswith(prefix):
            tail = rp[len(prefix):]
            head = tail.split("/", 1)[0]
            return prefix.rstrip("/") + ("/" + head if "/" in tail else "")
    if rp.startswith("apps/api/src/plataforma/"):
        return "apps/api/src/plataforma"
    if rp.startswith("apps/api/src/nucleo/"):
        return "apps/api/src/nucleo"
    if rp.startswith("apps/web/src/compartido/"):
        return "apps/web/src/compartido"
    if rp.startswith("apps/web/src/app/"):
        return "apps/web/src/app"
    return str(Path(rp).parent)

def build_graph() -> tuple[dict[str, Counter[str]], Counter[str]]:
    graph: dict[str, Counter[str]] = defaultdict(Counter)
    importers: Counter[str] = Counter()
    for source in source_files():
        source_area = area_of(source)
        for target in imports_of(source):
            target_area = area_of(target)
            importers[rel(target)] += 1
            if source_area != target_area:
                graph[source_area][target_area] += 1
    return graph, importers


def entrypoints_for(directory: Path) -> list[str]:
    preferred = ["publico.ts", "index.ts", "api.ts", "rutas.ts", "rutas.tsx", "main.tsx", "app.ts"]
    result: list[str] = []
    for name in preferred:
        path = directory / name
        if path.exists():
            result.append(rel(path))
    return result[:6]

def append_enrichment(agent_path: Path, dependencies: Counter[str]) -> None:
    if not agent_path.exists():
        return
    original = agent_path.read_text()
    base = original.split(MARKER, 1)[0].rstrip()
    directory = agent_path.parent
    entries = entrypoints_for(directory)
    section = [MARKER, "", "## Atajos para agentes", ""]
    if entries:
        section += ["Entry points probables:"] + [f"- `{item}`" for item in entries] + [""]
    if dependencies:
        section += ["Dependencias externas a esta área:"]
        section += [f"- `{name}` ({count} imports detectados)" for name, count in dependencies.most_common(8)]
        section += [""]
    section += [
        "Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.",
        "Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.",
    ]
    agent_path.write_text(base + "\n\n" + "\n".join(section).rstrip() + "\n")

def generate_feature_flows() -> None:
    docs = ROOT / "docs/agents"
    text = """# Flujos funcionales end-to-end

Usa este mapa cuando la petición describe comportamiento y no un archivo.

## Autenticación Qlik

`apps/web/src/modulos/autenticacion` → `packages/contratos/src/autenticacion` → `apps/api/src/modulos/autenticacion-qlik/http/rutas.ts` → `servicio-autenticacion.ts` → repositorios/cliente OAuth.

## Configuración de tenant

`apps/web/src/modulos/admin` → `packages/contratos/src/admin` → `apps/api/src/modulos/admin/http` → casos de uso/admin → repositorios Postgres y configuración OAuth/BigQuery.

## Crear y listar reportes

`apps/web/src/modulos/reportes` → `packages/contratos/src/reportes` → `rutas-reportes-dataflow.ts` → Qlik/Dataflows + repositorio de ejecuciones.

## Preflight y compilación

`pagina-detalle-reporte.tsx` → API reportes → `preflight-dataflow.ts` → `compilador-vnext/index.ts` → parser → semántica/IR → emisor BigQuery → estimador BigQuery.

## Ejecutar reporte

Frontend reportes → `rutas-reportes-dataflow.ts` → `ejecutar-reporte.ts` → compilador/preflight → automatización personal → Qlik Automate/Talend → GCS.

## Descargas

`apps/web/src/modulos/descargas` → contratos descargas → `modulos/descargas/http` → `servicio-descargas.ts` → `cliente-gcs.ts` + historial de ejecuciones.
"""
    (docs / "FEATURE-FLOWS.md").write_text(text)

def generate_hotspots(importers: Counter[str]) -> None:
    files = source_files()
    rows = []
    for path in files:
        rp = rel(path)
        rows.append((importers[rp], line_count(path), rp))
    rows.sort(reverse=True)
    lines = [
        "# Hotspots para agentes", "",
        "Archivos con alto radio de cambio. Revísalos antes de editar y amplía tests cuando corresponda.", "",
        "| Importadores | Líneas | Archivo |", "|---:|---:|---|",
    ]
    for imports, lines_count, rp in rows[:30]:
        lines.append(f"| {imports} | {lines_count} | `{rp}` |")
    lines += ["", "Un archivo grande no implica un problema por sí mismo; la combinación de tamaño y muchos consumidores indica mayor riesgo de cambio transversal."]
    (ROOT / "docs/agents/HOTSPOTS.md").write_text("\n".join(lines) + "\n")


def generate_module_graph(graph: dict[str, Counter[str]]) -> None:
    payload = {
        "generatedBy": "scripts/agents/enrich-agent-docs.py",
        "areas": {
            source: [{"target": target, "imports": count} for target, count in targets.most_common()]
            for source, targets in sorted(graph.items())
        },
    }
    (ROOT / "docs/agents/MODULE-GRAPH.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

def enrich_index() -> None:
    path = ROOT / "docs/agents/INDEX.md"
    text = path.read_text().rstrip()
    text += "\n\n## Mapas avanzados\n\n"
    text += "- [Flujos funcionales](FEATURE-FLOWS.md): comportamiento → cadena de archivos.\n"
    text += "- [Hotspots](HOTSPOTS.md): archivos de alto radio de cambio.\n"
    text += "- `MODULE-GRAPH.json`: dependencias resueltas entre áreas.\n"
    path.write_text(text + "\n")


def main() -> None:
    graph, importers = build_graph()
    for current, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDED]
        if "AGENTS.md" not in files:
            continue
        agent_path = Path(current) / "AGENTS.md"
        append_enrichment(agent_path, graph.get(area_of(agent_path.parent), Counter()))
    generate_feature_flows()
    generate_hotspots(importers)
    generate_module_graph(graph)
    enrich_index()
    print(f"Agent documentation enriched ({len(graph)} dependency areas)")


if __name__ == "__main__":
    main()
