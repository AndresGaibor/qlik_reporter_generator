# P0 CI y baseline de calidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conseguir que un único comando raíz ejecute el runner correcto para cada workspace y que lint, typecheck, tests y build sean gates reproducibles tanto localmente como en GitHub Actions.

**Architecture:** Bun Test seguirá cubriendo API/contratos/tests raíz; Vitest+jsdom seguirá cubriendo React. El root package sólo orquesta ambos runners, sin intentar ejecutar tests Vitest con Bun. CI consumirá exactamente el mismo comando canónico que desarrollo.

**Tech Stack:** Bun 1.3.10 en CI, Bun Test, Vitest 4, jsdom, React 18, Biome, TypeScript, Vite, GitHub Actions.

## Global Constraints

- No cambiar comportamiento de negocio en este plan.
- No deshabilitar tests, lint rules ni warnings para obtener un falso verde.
- No ejecutar BigQuery, Qlik ni otras integraciones reales desde los tests.
- Conservar los runners existentes: Bun Test para backend; Vitest para frontend.
- Los tests de estructura deben ser independientes del directorio desde el cual se lanza Vitest.
- El comando final `bun run verify` debe poder ejecutarse desde la raíz.

---

## File Map
**Create:**
- `apps/web/vitest.setup.ts` — configuración global de entorno React para tests.

**Modify:**
- `package.json` — scripts `test:backend`, `test:web`, `test`, `verify`.
- `.github/workflows/ci.yml` — usar `bun run verify`.
- `apps/web/vitest.config.ts` — cargar setup global.
- `apps/web/postcss.config.js` — retirar `//x` y dejar formato Biome.
- `apps/web/src/modulos/tablas/pagina-tablas-destino.test.ts`
- `apps/web/src/modulos/flujos/pagina-detalle-flujo-conexiones.test.ts`
- `apps/web/src/modulos/reportes/pagina-nueva-bigquery.test.ts`
- `apps/web/src/modulos/admin/configuracion-sin-conexiones.test.ts`

### Task 1: Corregir el gate de lint sin tocar reglas

**Files:** `apps/web/postcss.config.js`

- [ ] **Step 1: Reproduce RED**

Run: `bun run lint`
Expected before change: non-zero; Biome reporta `apps/web/postcss.config.js` y el residuo `//x`/formato.

- [ ] **Step 2: Make the minimal edit**

Eliminar exclusivamente la línea `//x`. Ejecutar `bunx biome format --write apps/web/postcss.config.js` si Biome todavía solicita formato; no cambiar la configuración de lint.
- [ ] **Step 3: Verify GREEN and commit**

Run: `bun run lint`
Expected: exit 0.
Commit: `chore(web): limpiar configuracion postcss`

### Task 2: Separar Bun Test y Vitest desde la raíz

**Files:** `package.json`

**Interfaces:**
- `bun run test:backend` ejecuta únicamente suites Bun compatibles.
- `bun run test:web` delega a `apps/web test:run`.
- `bun run test` ejecuta ambos en serie y falla si cualquiera falla.

- [ ] **Step 1: Reproduce the current root-runner failure**

Run: `bun test`
Expected before change: FAIL con síntomas como `vi.hoisted is not a function`, `vi.stubGlobal is not a function` o `document is not defined` al intentar correr frontend con Bun.

- [ ] **Step 2: Replace root scripts**

Usar exactamente:
```json
"test:backend": "bun test apps/api/src packages/contratos/src tests",
"test:web": "bun run --cwd apps/web test:run",
"test": "bun run test:backend && bun run test:web",
"verify": "bun run lint && bun run typecheck && bun run test && bun run build"
```
Mantener los demás scripts sin cambios.
- [ ] **Step 3: Verify each runner independently**

Run:
```bash
bun run test:backend
bun run test:web
```
Expected: ambos terminan con exit 0. El backend no descubre archivos `apps/web/**/*.test.*`; Vitest sí ejecuta las suites web.

- [ ] **Step 4: Verify orchestration and commit**

Run: `bun run test`
Expected: exit 0.
Commit: `chore(test): separar runners backend y frontend`

### Task 3: Eliminar dependencia de `process.cwd()` en tests web

**Files:**
- `apps/web/src/modulos/tablas/pagina-tablas-destino.test.ts`
- `apps/web/src/modulos/flujos/pagina-detalle-flujo-conexiones.test.ts`
- `apps/web/src/modulos/reportes/pagina-nueva-bigquery.test.ts`
- `apps/web/src/modulos/admin/configuracion-sin-conexiones.test.ts`

- [ ] **Step 1: Characterize the failure from the wrong cwd**

Run:
```bash
cd apps/web && bunx vitest run
cd ../.. && bunx vitest --config apps/web/vitest.config.ts run
```
Before the fix, the second form must expose the fragile source-reading paths where `process.cwd()` points at the repository root.
- [ ] **Step 2: Resolve paths relative to each test module**

En cada test sustituir `process.cwd()` por `import.meta.url`. Patrón:
```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const ruta = resolve(aqui, "pagina-tablas-destino.tsx");
```
Para archivos en otro módulo usar rutas relativas desde `aqui`, por ejemplo `resolve(aqui, "../origenes/pagina-catalogo-origen.tsx")`. No codificar rutas absolutas de `/Users/andresgaibor`.

- [ ] **Step 3: Verify both cwd forms**

Run:
```bash
bun run --cwd apps/web test:run
bunx vitest --config apps/web/vitest.config.ts run
```
Expected: ambas formas pasan.
Commit: `test(web): hacer rutas de fixtures independientes del cwd`

### Task 4: Configurar correctamente React `act` en Vitest

**Files:**
- Create: `apps/web/vitest.setup.ts`
- Modify: `apps/web/vitest.config.ts`

- [ ] **Step 1: Capture the current warning**

Run: `bun run --cwd apps/web test:run 2>&1 | tee /tmp/qlik-web-tests.log`
Expected before change: el log contiene `not configured to support act`.
- [ ] **Step 2: Add the Vitest setup**

`apps/web/vitest.setup.ts`:
```ts
(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;
```

En `vitest.config.ts`:
```ts
test: {
  environment: "jsdom",
  globals: true,
  setupFiles: ["./vitest.setup.ts"],
},
```

- [ ] **Step 3: Verify tests and warning removal**

Run:
```bash
bun run --cwd apps/web test:run 2>&1 | tee /tmp/qlik-web-tests.log
! grep -F "not configured to support act" /tmp/qlik-web-tests.log
```
Expected: tests exit 0 y el `grep` no encuentra el warning de configuración. Si aparecen warnings `act(...)` distintos que indican actualizaciones realmente no envueltas, corregir el test que los origina; no ocultarlos globalmente.

- [ ] **Step 4: Commit**

Commit: `test(web): configurar entorno react act`
### Task 5: Hacer que GitHub Actions consuma el mismo gate local

**Files:** `.github/workflows/ci.yml`

- [ ] **Step 1: Replace duplicated quality steps**

Después de `bun audit`, reemplazar:
```yaml
- run: bun run lint
- run: bun run typecheck
- run: bun test
- run: bun run build
```
por:
```yaml
- run: bun run verify
```
Mantener `docker compose config` y ambos `docker build` después del gate.

- [ ] **Step 2: Validate workflow-facing commands locally**

Run:
```bash
bun install --frozen-lockfile
bun audit
bun run verify
docker compose config >/dev/null
```
Expected: exit 0. No ejecutar `docker compose up` ni servicios externos.

- [ ] **Step 3: Commit**

Commit: `ci: usar gate canonico de verificacion`

### Task 6: Baseline final reproducible

- [ ] **Step 1: Run the canonical gate fresh**

Run: `bun run verify`
Expected: lint, typecheck, backend tests, frontend tests and build all exit 0.
- [ ] **Step 2: Verify Docker definitions without starting integrations**

```bash
docker compose config >/dev/null
docker build --target api .
docker build --target web .
```
Expected: exit 0. Estos comandos construyen artefactos; no deben iniciar Qlik, BigQuery ni GCS.

- [ ] **Step 3: Verify repository state**

Run:
```bash
git diff --check
git status --short
```
Expected: sólo cambios del baseline/CI pendientes del commit final.

## Exit Criteria

- `bun run lint` pasa sin deshabilitar reglas.
- `bun run typecheck` pasa.
- `bun run test:backend` sólo ejecuta suites Bun y pasa.
- `bun run test:web` ejecuta Vitest/jsdom y pasa.
- `bun run test` orquesta ambos correctamente.
- `bun run build` pasa.
- `bun run verify` es el gate canónico y pasa desde la raíz.
- Los cuatro tests estructurales web ya no dependen de `process.cwd()`.
- El warning de entorno React `act` desaparece sin silenciar warnings reales de tests.
- GitHub Actions usa el mismo `bun run verify` que desarrollo local.
- Ningún paso de test realiza consultas BigQuery reales.
