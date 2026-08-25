# Agent Navigation System Design

## Objetivo

Convertir el repositorio en un código base que un agente pueda comprender y modificar con mínima exploración previa, sin duplicar documentación hasta volverla inmantenible.

## Estrategia

La documentación será jerárquica. `AGENTS.md` raíz define reglas globales; cada límite arquitectónico relevante añade contexto local. Los directorios generados, dependencias y fixtures masivos no reciben documentación propia.

Se añade una segunda capa en `docs/agents/` con mapas transversales para responder rápidamente preguntas como “¿dónde cambio X?”, “¿qué depende de Y?” y “¿qué frontend consume este endpoint?”.

## Cobertura

- raíz del monorepo y workspaces;
- backend: `app.ts`, núcleo, plataforma, módulos y capas internas relevantes;
- compilador vNext y sus subsistemas principales;
- frontend: app shell, compartido y módulos funcionales;
- contratos compartidos;
- scripts, despliegue y documentación;
- índices humano y machine-readable.

## Regla de proximidad

Un agente debe leer el `AGENTS.md` más cercano y heredar las reglas de sus ancestros. El archivo local no repite contexto global: documenta responsabilidades, entry points, dependencias, archivos que cambian juntos, invariantes, tests y recetas de modificación.
## Índices y mantenimiento

`docs/agents/NAVIGATION.json` se genera desde el filesystem y los imports TypeScript. Debe listar áreas, entry points, tests, `AGENTS.md` y dependencias internas detectables.

Un verificador comprobará rutas citadas, cobertura de límites arquitectónicos y consistencia básica de los índices. No inspeccionará `node_modules`, `dist`, `.git`, `.worktrees` ni artefactos generados.

## Seguridad de la intervención

La implementación no modifica lógica de negocio ni archivos actualmente editados del compilador. No hace pull/merge/rebase ni consultas BigQuery. Los cambios quedan restringidos a Markdown, JSON generado, scripts de navegación y scripts de `package.json` si son necesarios.

## Criterios de éxito

1. Un agente nuevo puede ubicar frontend, backend, contratos, persistencia, Qlik, BigQuery, descargas y compilador desde el índice raíz.
2. Cada módulo funcional importante tiene contexto local.
3. El cambio transversal frontend → contrato → API → infraestructura está documentado.
4. El índice machine-readable puede regenerarse.
5. La verificación detecta referencias locales rotas.
6. `bun run agents:check` termina correctamente sin ejecutar servicios externos.