#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUDED = {".git", ".worktrees", "node_modules", "dist", "coverage"}

BACKEND = {
    "admin": "Administración de tenants, usuarios, superadmins y configuración BigQuery/OAuth.",
    "autenticacion-qlik": "Sesiones de usuario, OAuth Qlik, credenciales e identidades Qlik.",
    "automatizaciones": "Panel y copia/ejecución coordinada de automatizaciones Qlik.",
    "descargas": "Exploración y descarga privada de exportaciones almacenadas en GCS.",
    "flujos": "Consulta y clonado de Dataflows Qlik usados como fuente de reportes.",
    "google-cloud": "Resolución de configuración Google Cloud y estimación/metadata BigQuery.",
    "qlik": "Adaptador HTTP y proxy controlado hacia APIs de Qlik Cloud.",
    "reportes": "Creación, compilación, ejecución y sincronización de reportes Dataflow.",
    "setup": "Bootstrap funcional de la aplicación y configuración inicial.",
}

FRONTEND = {
    "admin": "Pantallas de configuración, tenants, usuarios, OAuth y BigQuery.",
    "autenticacion": "Login y estado de autenticación de la aplicación web.",
    "descargas": "Listado, progreso y descarga de partes exportadas.",
    "flujos": "Detalle técnico de Dataflows Qlik.",
    "inicio": "Landing autenticada y navegación inicial.",
    "reportes": "Listado, creación, detalle, preflight y ejecución de reportes.",
    "setup": "Wizard de configuración inicial.",
}

COMPILER_AREAS = {
    "parser-programa": "Parsea sentencias y control de flujo Qlik a AST de programa.",
    "analizador-semantico": "Convierte AST en plan semántico/IR, resolviendo cargas, proyecciones y lookups.",
    "expresiones-qlik": "Parseo y emisión semántica de expresiones y funciones Qlik.",
    "emisor-bigquery": "Convierte el plan semántico/IR a SQL BigQuery y CTEs.",
    "agregados-financieros": "Agregados avanzados, financieros y funciones de rango.",
    "estadistica": "Funciones estadísticas, distribuciones, regresión y pruebas.",
    "conformance-gates": "Gates de compatibilidad, calidad SQL y reportes de conformance.",
}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def files_in(path: Path, pattern: str = "*.ts") -> list[str]:
    return sorted(rel(p) for p in path.glob(pattern) if p.is_file())


def tests_in(path: Path) -> list[str]:
    return sorted(rel(p) for p in path.rglob("*.test.ts*") if not any(x in p.parts for x in EXCLUDED))


def internal_imports(path: Path) -> list[str]:
    found: set[str] = set()
    for file in path.rglob("*.ts*"):
        if any(x in file.parts for x in EXCLUDED):
            continue
        text = file.read_text(errors="ignore")
        for match in re.findall(r'from\s+["\']([^"\']+)["\']', text):
            if match.startswith(".") or match.startswith("@qlik/"):
                found.add(match)
    return sorted(found)

def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n")


def agent_doc(title: str, purpose: str, path: Path, extra: str = "") -> str:
    children = sorted(p.name for p in path.iterdir() if p.is_dir() and p.name not in EXCLUDED) if path.exists() else []
    tests = tests_in(path)[:12] if path.exists() else []
    imports = internal_imports(path)[:16] if path.exists() else []
    lines = [
        f"# AGENTS.md — {title}", "", purpose, "",
        "## Antes de modificar", "",
        "- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.",
        "- Busca consumidores y contratos antes de cambiar una firma pública.",
        "- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.",
        "- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.", "",
        "## Navegación local", "",
    ]
    if children:
        lines.append("Subdirectorios: " + ", ".join(f"`{x}/`" for x in children) + ".")
    if tests:
        lines += ["", "Tests cercanos:"] + [f"- `{x}`" for x in tests]
    if imports:
        lines += ["", "Imports internos frecuentes detectados:"] + [f"- `{x}`" for x in imports]
    lines += ["", "## Ver también", "", "- `docs/agents/CHANGE-MAP.md`", "- `docs/agents/DEPENDENCIES.md`", "- `docs/agents/NAVIGATION.json`"]
    if extra:
        lines += ["", extra.strip()]
    return "\n".join(lines)


def generate_root() -> None:
    text = """# AGENTS.md — Qlik Reportes Creator

## Propósito

Monorepo Bun para crear y ejecutar reportes basados en Qlik Dataflow, compilarlos a BigQuery y administrar descargas GCS. Antes de explorar código, usa `docs/agents/INDEX.md` y `docs/agents/CHANGE-MAP.md`.

## Workspaces

- `apps/web`: React/Vite, rutas y experiencia de usuario.
- `apps/api`: Hono, casos de uso, Qlik, BigQuery, GCS y persistencia.
- `packages/contratos`: esquemas/tipos compartidos frontend-backend.

## Regla principal para cambios

Empieza por la intención en `docs/agents/CHANGE-MAP.md`; después lee el `AGENTS.md` más cercano. Si cambias un contrato público, revisa consumidor frontend, ruta HTTP, caso de uso/adaptador y tests asociados.

## Comandos seguros

- `bun run agents:check`: valida navegación sin servicios externos.
- `bun run typecheck`: chequeo TypeScript.
- `bun run test`: suite local; puede requerir configuración según el test.
- `bun run verify`: lint + typecheck + tests + build.

No hagas consultas BigQuery reales para validar compilación; usa tests, fixtures, dry-run explícito cuando corresponda y dobles existentes.

## Mapas

- `docs/agents/ARCHITECTURE.md`
- `docs/agents/BACKEND.md`
- `docs/agents/FRONTEND.md`
- `docs/agents/CONTRACTS.md`
- `docs/agents/COMPILER.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`
"""
    write(ROOT / "AGENTS.md", text)

def generate_backend_agents() -> None:
    base = ROOT / "apps/api/src"
    write(base / "AGENTS.md", agent_doc("API src", "Composición de la API Hono. `app.ts` es el composition root; `entradas/` adapta runtimes, `modulos/` contiene negocio, `nucleo/` primitives y `plataforma/` infraestructura transversal.", base))
    modules = base / "modulos"
    write(modules / "AGENTS.md", agent_doc("Módulos backend", "Cada carpeta es un límite funcional. Prefiere dependencias mediante puertos/public APIs; evita imports cruzados a infraestructura de otro módulo.", modules))
    for name, purpose in BACKEND.items():
        path = modules / name
        if not path.exists():
            continue
        extra = "## Regla de capas\n\n`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias."
        write(path / "AGENTS.md", agent_doc(f"Backend / {name}", purpose, path, extra))
        for layer in ("aplicacion", "dominio", "http", "infraestructura"):
            layer_path = path / layer
            if layer_path.exists() and len(list(layer_path.rglob("*.ts"))) >= 4:
                layer_purpose = {
                    "aplicacion": "Casos de uso, servicios y puertos. No acoples esta capa a Hono ni a detalles Postgres/Qlik/GCS.",
                    "dominio": "Tipos, invariantes y reglas puras del módulo.",
                    "http": "Rutas/adaptadores HTTP. Valida entrada, resuelve contexto y delega; evita lógica de negocio aquí.",
                    "infraestructura": "Adaptadores concretos para Postgres, Qlik, Google Cloud u otros servicios.",
                }[layer]
                write(layer_path / "AGENTS.md", agent_doc(f"{name} / {layer}", layer_purpose, layer_path))

def generate_compiler_agents() -> None:
    base = ROOT / "apps/api/src/modulos/reportes/aplicacion/compilador-vnext"
    extra = """## Pipeline

`index.ts` → `parser-programa` → `analizador-semantico` → `optimizador-ir.ts` → `emisor-bigquery`.

Antes de añadir una función Qlik revisa `registro-funciones.ts`, el dispatcher de expresiones y los fixtures/tests de cobertura. Mantén el compilador legacy fuera de cambios nuevos salvo compatibilidad explícita.
"""
    write(base / "AGENTS.md", agent_doc("Compilador vNext", "Compilador activo Qlik → BigQuery. Es una zona de alta conectividad: un cambio de AST/IR suele requerir parser, semántica, emisor y tests.", base, extra))
    for name, purpose in COMPILER_AREAS.items():
        path = base / name
        if path.exists():
            write(path / "AGENTS.md", agent_doc(f"Compilador / {name}", purpose, path, "## Prueba mínima\n\nEjecuta primero los tests del subsistema y después los tests de conformance/corpus que puedan cubrir el cambio."))


def generate_frontend_agents() -> None:
    base = ROOT / "apps/web/src"
    write(base / "AGENTS.md", agent_doc("Web src", "Frontend React/Vite. `app/` compone navegación/providers; `compartido/` contiene UI/hooks reutilizables; `modulos/` agrupa funcionalidades.", base))
    for sub, purpose in {
        "app": "Shell, router, navegación, providers y layout global.",
        "compartido": "Cliente API, UI, feedback, hooks y utilidades reutilizables. No introduzcas dependencia hacia un módulo funcional concreto.",
        "modulos": "Features frontend. Cada módulo debe consumir contratos/API sin acoplarse a internals de otro módulo.",
    }.items():
        path = base / sub
        write(path / "AGENTS.md", agent_doc(f"Web / {sub}", purpose, path))
    modules = base / "modulos"
    for name, purpose in FRONTEND.items():
        path = modules / name
        if path.exists():
            extra = "## Flujo de cambio\n\nRevisa `api.ts` para transporte, `rutas.tsx` para entrada de navegación, páginas para orquestación y `componentes/` para presentación. Si cambia el payload, empieza en `packages/contratos`."
            write(path / "AGENTS.md", agent_doc(f"Frontend / {name}", purpose, path, extra))

def generate_contract_agents() -> None:
    base = ROOT / "packages/contratos/src"
    write(ROOT / "packages/contratos/AGENTS.md", agent_doc("Contratos workspace", "Fuente compartida de esquemas/tipos entre web y API. Los cambios aquí son potencialmente transversales.", ROOT / "packages/contratos"))
    write(base / "AGENTS.md", agent_doc("Contratos src", "Organiza contratos por dominio. Prefiere exports explícitos y compatibilidad consciente: web y API compilan contra estos tipos.", base))
    for path in sorted(p for p in base.iterdir() if p.is_dir()):
        write(path / "AGENTS.md", agent_doc(f"Contratos / {path.name}", f"Contratos compartidos del dominio `{path.name}`. Busca consumidores en `apps/web` y `apps/api` antes de cambiar campos, enums o schemas.", path))


def generate_other_agents() -> None:
    targets = {
        ROOT / "apps": ("Workspaces apps", "Aplicaciones ejecutables del monorepo. Web y API comparten contratos, pero no deben importar internals entre sí."),
        ROOT / "apps/api": ("API workspace", "Workspace Bun/Hono. Scripts locales están en `package.json`; el runtime se compone en `src/app.ts`."),
        ROOT / "apps/web": ("Web workspace", "Workspace React/Vite. Mantén componentes de feature en `src/modulos` y primitives reutilizables en `src/compartido`."),
        ROOT / "packages": ("Packages", "Paquetes compartidos del monorepo. Un cambio aquí puede impactar más de un workspace."),
        ROOT / "deploy": ("Deploy", "Configuración de Nginx/systemd. Cambios deben mantenerse compatibles con puertos y variables documentadas en README/setup."),
        ROOT / "scripts": ("Scripts", "Herramientas de mantenimiento/research. No deben convertirse en dependencias de runtime de la aplicación."),
        ROOT / "docs": ("Docs", "Documentación de producto, Qlik, arquitectura, investigación y Superpowers. Para navegación del código usa `docs/agents/`."),
        ROOT / "apps/api/src/nucleo": ("Núcleo backend", "Primitivas compartidas y contratos internos estables. Debe permanecer independiente de módulos e infraestructura concreta."),
        ROOT / "apps/api/src/plataforma": ("Plataforma backend", "Infraestructura transversal: configuración, contexto, HTTP, persistencia, seguridad y observabilidad."),
    }
    for path, (title, purpose) in targets.items():
        if path.exists():
            write(path / "AGENTS.md", agent_doc(title, purpose, path))

def generate_central_docs() -> None:
    docs = ROOT / "docs/agents"
    write(docs / "INDEX.md", """# Índice para agentes

Empieza aquí antes de explorar el repositorio.

- [Arquitectura](ARCHITECTURE.md): límites y flujo end-to-end.
- [Mapa de cambios](CHANGE-MAP.md): intención → archivos a revisar.
- [Backend](BACKEND.md): composition root, módulos y capas.
- [Frontend](FRONTEND.md): shell, módulos, API y UI compartida.
- [Contratos](CONTRACTS.md): frontera web/API.
- [Compilador](COMPILER.md): pipeline Qlik → BigQuery.
- [Dependencias](DEPENDENCIES.md): reglas y acoplamientos transversales.
- [Mantenimiento](MAINTENANCE.md): regenerar/verificar estos mapas.
- `NAVIGATION.json`: índice machine-readable generado.

Regla: lee primero el `AGENTS.md` raíz y después el `AGENTS.md` más cercano al archivo que vas a cambiar.
""")
    write(docs / "ARCHITECTURE.md", """# Arquitectura para agentes

## Flujo principal

`apps/web` → HTTP → `apps/api/src/app.ts` → módulo HTTP → aplicación → puerto → infraestructura → Qlik/BigQuery/GCS/Postgres.

Los tipos compartidos cruzan la frontera mediante `packages/contratos`. El frontend no importa implementación backend y los casos de uso backend no deberían depender de Hono o adaptadores concretos.

## Composition root

`apps/api/src/app.ts` ensambla repositorios, servicios, clientes Qlik/Google Cloud, middlewares y rutas. Si una dependencia concreta cambia, empieza aquí para entender cómo se inyecta.

## Persistencia

`apps/api/src/plataforma/persistencia/esquema.ts` define el esquema Drizzle/Postgres. Los repositorios concretos viven normalmente bajo `modulos/*/infraestructura`.

## Integraciones

- Qlik Cloud: `modulos/qlik` + consumidores en reportes/flujos/automatizaciones/admin.
- BigQuery: `modulos/google-cloud` + compilador/reportes.
- GCS: `modulos/descargas` y destino de exportación de reportes.
""")
    write(docs / "CHANGE-MAP.md", """# Mapa de cambios

| Quiero cambiar... | Empieza por | Revisa también |
|---|---|---|
| Login/sesión | `apps/web/src/modulos/autenticacion` | `packages/contratos/src/autenticacion`, `apps/api/src/modulos/autenticacion-qlik` |
| Configuración/tenants | `apps/web/src/modulos/admin` | `packages/contratos/src/admin`, `apps/api/src/modulos/admin` |
| Reportes | `apps/web/src/modulos/reportes` | `packages/contratos/src/reportes`, `apps/api/src/modulos/reportes` |
| Descargas | `apps/web/src/modulos/descargas` | `packages/contratos/src/descargas`, `apps/api/src/modulos/descargas` |
| Dataflows | `apps/web/src/modulos/flujos` | `packages/contratos/src/flujos`, `apps/api/src/modulos/flujos` |
| Proxy/API Qlik | `apps/api/src/modulos/qlik` | `docs/arquitectura/rutas-qlik.md`, consumidores del módulo |
| BigQuery/configuración | `apps/api/src/modulos/google-cloud` | `apps/api/src/modulos/admin`, `apps/api/src/modulos/reportes` |
| SQL generado | `apps/api/src/modulos/reportes/aplicacion/compilador-vnext` | parser → semántica → IR → emisor + corpus |
| Nueva función Qlik | `compilador-vnext/registro-funciones.ts` | `expresiones-qlik/dispatcher.ts`, emisor correspondiente, fixtures/tests |
| Esquema Postgres | `apps/api/src/plataforma/persistencia/esquema.ts` | repositorios afectados + `apps/api/drizzle` |
| Navegación global web | `apps/web/src/app` | `src/modulos/*/rutas.tsx` |
| Componente UI común | `apps/web/src/compartido` | todos sus consumidores antes de romper props |

Para cambios de payload, empieza por contratos; para cambios puramente visuales, evita tocar backend salvo necesidad real.
""")
    write(docs / "BACKEND.md", """# Backend

`apps/api/src/app.ts` es el composition root. Las entradas Bun/Node/Worker viven en `entradas/`.

## Capas esperadas

- `dominio`: reglas/tipos puros.
- `aplicacion`: casos de uso, servicios, puertos.
- `http`: Hono, validación/adaptación de solicitudes.
- `infraestructura`: Postgres, Qlik, Google Cloud y adaptadores concretos.

## Módulos

`admin`, `autenticacion-qlik`, `automatizaciones`, `descargas`, `flujos`, `google-cloud`, `qlik`, `reportes`, `setup`.

Antes de mover lógica entre módulos revisa imports cruzados en `NAVIGATION.json`. Prefiere `publico.ts`/puertos sobre imports profundos cuando exista esa frontera.
""")
    write(docs / "FRONTEND.md", """# Frontend

`apps/web/src/main.tsx` arranca la aplicación. `app/` define router, navegación, providers y layout. `compartido/` contiene cliente API, UI, hooks y utilidades sin dependencia hacia features.

## Módulos

`admin`, `autenticacion`, `descargas`, `flujos`, `inicio`, `reportes`, `setup`.

Dentro de una feature revisa normalmente en este orden: `rutas.tsx` → página → hooks/componentes → `api.ts`. Si cambia el contrato HTTP, busca primero el schema/tipo correspondiente en `packages/contratos`.

Evita trasladar reglas de negocio al frontend: presentación, estado de interacción y adaptación de respuesta sí; permisos/invariantes persistentes deben mantenerse en backend.
""")
    write(docs / "CONTRACTS.md", """# Contratos compartidos

`packages/contratos` es la frontera tipada entre frontend y API. Sus carpetas reflejan dominios funcionales y `src/index.ts` expone el paquete.

## Al cambiar un contrato

1. Busca todos los imports `@qlik/contratos/...`.
2. Actualiza productor backend y consumidor frontend en el mismo cambio cuando sea breaking.
3. Mantén schemas Zod y tipos inferidos alineados.
4. Ejecuta `bun run typecheck` y los tests del dominio afectado.

No uses contratos para compartir implementación o utilidades específicas de runtime.
""")
    write(docs / "COMPILER.md", """# Compilador Qlik → BigQuery

Punto de entrada activo: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/index.ts`.

## Pipeline

1. `parser-programa`: script → AST.
2. `analizador-semantico`: AST → plan/IR con semántica Qlik.
3. `optimizador-ir.ts`: transformaciones preservando semántica.
4. `emisor-bigquery`: plan → SQL BigQuery.

`expresiones-qlik` implementa expresiones/funciones; `registro-funciones.ts` controla cobertura; `fixtures/compiler-corpus` y conformance protegen compatibilidad.

No agregues funcionalidad nueva al compilador legacy `compilador-bigquery.ts` salvo una decisión explícita de compatibilidad.
""")
    write(docs / "DEPENDENCIES.md", """# Dependencias y límites

## Dirección preferida

`web feature` → `contratos` → HTTP → `backend http` → `aplicacion` → `puertos/dominio` → `infraestructura`.

`app.ts` puede conocer implementaciones concretas porque es el composition root. El dominio y la aplicación no deberían importar Hono ni Postgres directamente cuando existe un puerto.

## Dependencias transversales importantes

- `reportes` depende de Qlik, BigQuery/configuración Google Cloud, automatizaciones personales y descargas GCS.
- `admin` configura datos consumidos por autenticación, Qlik y Google Cloud.
- `flujos` consume Qlik Cloud para descubrir/clonar Dataflows.
- `packages/contratos` es consumido por web y API, por eso sus cambios tienen mayor radio.

Consulta `NAVIGATION.json` para imports detectados por área antes de cambiar una frontera.
""")
    write(docs / "MAINTENANCE.md", """# Mantenimiento de documentación para agentes

## Regenerar

`bun run agents:docs`

Genera los `AGENTS.md` curados y `docs/agents/NAVIGATION.json` desde el árbol actual. No escanea `.git`, `.worktrees`, `node_modules` ni `dist`.

## Validar

`bun run agents:check`

Comprueba cobertura esperada, JSON válido y referencias Markdown locales en la documentación para agentes.

## Cuándo actualizar

Actualiza `scripts/agents/generate-agent-docs.py` cuando aparezca un módulo, workspace o subsistema que merezca un límite propio. No copies contexto global en nuevos `AGENTS.md`: añade solo información local.
""")


def navigation_entry(path: Path, kind: str) -> dict:
    return {
        "path": rel(path),
        "kind": kind,
        "agents": rel(path / "AGENTS.md") if (path / "AGENTS.md").exists() else None,
        "tests": tests_in(path)[:30],
        "internalImports": internal_imports(path)[:80],
    }

def generate_navigation() -> None:
    areas: list[dict] = []
    for name in BACKEND:
        path = ROOT / "apps/api/src/modulos" / name
        if path.exists():
            areas.append(navigation_entry(path, "backend-module"))
    for name in FRONTEND:
        path = ROOT / "apps/web/src/modulos" / name
        if path.exists():
            areas.append(navigation_entry(path, "frontend-module"))
    for name in COMPILER_AREAS:
        path = ROOT / "apps/api/src/modulos/reportes/aplicacion/compilador-vnext" / name
        if path.exists():
            areas.append(navigation_entry(path, "compiler-subsystem"))
    for name in ("admin", "autenticacion", "automatizaciones", "comun", "descargas", "flujos", "qlik", "reportes"):
        path = ROOT / "packages/contratos/src" / name
        if path.exists():
            areas.append(navigation_entry(path, "contracts-domain"))
    payload = {
        "generatedBy": "scripts/agents/generate-agent-docs.py",
        "entrypoints": {
            "web": "apps/web/src/main.tsx",
            "apiCompositionRoot": "apps/api/src/app.ts",
            "compiler": "apps/api/src/modulos/reportes/aplicacion/compilador-vnext/index.ts",
            "contracts": "packages/contratos/src/index.ts",
            "databaseSchema": "apps/api/src/plataforma/persistencia/esquema.ts",
        },
        "areas": sorted(areas, key=lambda x: x["path"]),
    }
    write(ROOT / "docs/agents/NAVIGATION.json", json.dumps(payload, indent=2, ensure_ascii=False))


def main() -> None:
    generate_root()
    generate_other_agents()
    generate_backend_agents()
    generate_compiler_agents()
    generate_frontend_agents()
    generate_contract_agents()
    generate_central_docs()
    generate_navigation()
    print("Agent documentation generated")


if __name__ == "__main__":
    main()
