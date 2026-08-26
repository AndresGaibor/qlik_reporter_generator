# BQ_Inventario If() + Outer Join Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que BQ_Inventario deje de ser rechazado falsamente por `SYNTAX_INVALID_IF` y `OUTER JOIN`, preservando la semántica Qlik y sin ejecutar BigQuery.

**Architecture:** Corregir la clasificación en la frontera más temprana: el scanner debe distinguir `If()` de `IF ... THEN`, y el parser de prefijos debe normalizar `OUTER JOIN` al tipo interno existente `full`. Mantener AST, IR, analizador semántico y emisor sin nuevos tipos; proteger el comportamiento con regresiones de scanner, parser, join relacional, compilación completa y resumen de usuario.

**Tech Stack:** Bun, TypeScript, bun:test, parser/AST/IR propio Qlik, emisor GoogleSQL BigQuery.

**Spec:** `docs/superpowers/specs/2026-08-25-bq-inventario-if-outer-join-compatibility-design.md`

## Global Constraints

- No ejecutar consultas BigQuery, `SELECT`, `EXPORT DATA`, dry-runs remotos ni crear jobs; todo se valida localmente.
- Trabajar sobre el compilador activo `compilador-vnext`; no añadir funcionalidad al legacy `compilador-bigquery.ts`.
- Aplicar TDD estricto: escribir la prueba, verla fallar por la causa esperada, implementar el mínimo y volver a ejecutar.
- No cambiar el Dataflow de Qlik Cloud para rodear el bug.
- No añadir `outer` al AST/IR; `OUTER JOIN` debe convertirse a `join: "full"` en el parser.
- No aceptar `OUTER KEEP` accidentalmente.
- No romper `IF ... THEN ... END IF` procedural ni sus diagnósticos existentes.
- No revertir ni incluir en commits cambios ajenos del working tree; nunca usar `git add .`.
- `apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.ts` ya tiene cambios no relacionados: tratarlo como archivo sensible y no editarlo bajo este plan.
## File Structure

**Modificar:**

- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.ts`: distinguir inicio de control procedural de llamada `If()`.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts`: regresiones de tokenización multilinea.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts`: comprobar que el `LOAD` completo llega al AST.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa/sentencias.ts`: reconocer y normalizar `OUTER JOIN`.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts`: matriz de prefijos y protección de `OUTER KEEP`.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`: demostrar emisión `FULL JOIN`.
- `apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts`: regresión de estado visible para el usuario.

**Crear:**

- `apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/qlik-outer-join.qlik`: equivalente a `qlik-full-join.qlik` usando sintaxis Qlik `OUTER JOIN`.
- `apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik`: caso representativo que combina ambos defectos.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts`: prueba end-to-end parser → semántica → IR → emisor.

**Verificar, no modificar:**

- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik/dispatcher.ts`: ya implementa `If()` como `CASE WHEN`.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ast.ts`: `join` ya usa `inner | left | right | full`.
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/relacional.ts`: ya emite semántica de `full`.
---

### Task 1: Corregir la frontera scanner `If()` vs `IF ... THEN`

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.ts` (`lineaControl`, `modoControlCompleto`)
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts`

**Interfaces:**
- Consumes: texto Qlik arbitrario y `SentenciaCruda[]` existente.
- Produces: exactamente la misma API `escanearSentenciasQlik(script): SentenciaCruda[]`; cambia solo qué líneas se consideran control procedural.
- Invariant: cualquier `IF` procedural continúa llegando a `parsearIf()`; cualquier `If(...)` dentro de `LOAD` permanece dentro de la sentencia `load`.

- [ ] **Step 1: Capturar baseline sin editar producción**

Run:
```bash
cd ~/code/javascript/qlik_reportes_creator
bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts
```

Expected: suite actual PASS. Guardar `git status --short` para no confundir cambios previos con los de esta tarea.
- [ ] **Step 2: Escribir primero la regresión RED del scanner**

Añadir en `scanner-qlik.test.ts` un caso parametrizado que cubra `If(` y `If (`:

```ts
it.each(["If(", "If ("])(
  "no separa %s como IF procedural dentro de LOAD",
  (ifStart) => {
    const script = `[Calcular campos 1]:\nNOCONCATENATE\nLOAD\n  [ID_LOCAL],\n  ${ifStart}\n    [ID_LOCAL] = 0,\n    1,\n    0\n  ) AS [FILTRO_UOP];\nSELECT ID_LOCAL FROM \`p.d.uop\`;`;
    const statements = escanearSentenciasQlik(script);

    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toContain("NOCONCATENATE");
    expect(statements[0]?.text).toContain("AS [FILTRO_UOP]");
    expect(statements[0]?.text).toContain(ifStart);
    expect(statements[1]?.text).toStartWith("SELECT ID_LOCAL");
  },
);
```

Añadir además una regresión donde un argumento contiene el literal `'THEN'`, para proteger `modoControlCompleto()`:

```ts
const statements = escanearSentenciasQlik("[A]: LOAD id, If(flag, 'THEN', 'ELSE') AS texto; SELECT id, flag FROM `p.d.t`;");
expect(statements).toHaveLength(2);
```
- [ ] **Step 3: Ejecutar RED y verificar la causa correcta**

Run:
```bash
bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts
```

Expected antes del fix: el caso `If(`/`If (` obtiene más de 2 sentencias, o el `LOAD` queda truncado antes de `AS [FILTRO_UOP]`. No continuar si falla por sintaxis del propio test.

- [ ] **Step 4: Añadir la regresión de parser de programa**

En `parser-programa.test.ts`, usar un `LOAD` multilinea con el fragmento real simplificado y afirmar:

```ts
const program = parsearProgramaQlik(script);
expect(program.statements.map((item) => item.type)).toEqual(["load", "native_sql"]);
const load = program.statements[0];
expect(load?.type).toBe("load");
if (load?.type !== "load") throw new Error("load esperado");
expect(load.body).toContain("If(");
expect(load.body).toContain("AS [FILTRO_UOP]");
```

Run:
```bash
bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts
```

Expected antes del fix: `SYNTAX_INVALID_IF` con mensaje `IF requiere una condición y THEN`.
- [ ] **Step 5: Implementar el mínimo en el scanner**

En `scanner-qlik.ts`, hacer que las dos detecciones de IF procedural excluyan explícitamente una llamada de función con o sin espacio antes del paréntesis. La forma recomendada es reutilizar el mismo patrón negativo:

```ts
// IF de control exige que después de IF no venga opcionalmente espacio + "(".
const ifControl = String.raw`IF\b(?!\s*\()`;
```

No construir el regex dinámicamente si vuelve menos legible el código. Es válido aplicar directamente la misma condición en los dos regex existentes:

```ts
IF\b(?!\s*\()
```

Aplicarla en:
- `lineaControl()`, que actualmente usa `IF\b`;
- `modoControlCompleto()`, que actualmente usa `IF\b[\s\S]*\bTHEN`.

El resto de alternativas (`ELSEIF`, `ELSE`, `END IF`, `SWITCH`, etc.) debe permanecer idéntico.

No modificar `parsearIf()` ni el dispatcher de expresiones para resolver este bug.

- [ ] **Step 6: Ejecutar GREEN focalizado**

Run:
```bash
bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/control-flow.test.ts
```
Expected: todos PASS, incluyendo los tests existentes de `IF ... THEN ... END IF`.

- [ ] **Step 7: Revisar diff y commit focalizado**

Run:
```bash
git diff -- \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts
```

Confirmar que no hay cambios fuera del comportamiento descrito. Después:

```bash
git add \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts
git commit -m "fix(compilador): distinguish If expression from control flow"
```

---

### Task 2: Aceptar `OUTER JOIN` sin ampliar AST/IR

**Files:**
- Create: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/qlik-outer-join.qlik`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa/sentencias.ts` (`extraerPrefijoLoad`)
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`

**Interfaces:**
- Consumes: `extraerPrefijoLoad(text)` y el `LoadPrefix` existente.
- Produces: `OUTER JOIN` → `{ type: "join", join: "full", target? }`.
- Invariant: downstream nunca recibe `join: "outer"`; `JOIN` sin modificador y `FULL JOIN` siguen representándose como `full`.

- [ ] **Step 1: Crear fixture de sintaxis Qlik real**

Crear `qlik-outer-join.qlik` con contenido completo:

```qlik
LIB CONNECT TO [Google BigQuery:Prod];
[A]: LOAD id, valor; SQL SELECT id, valor FROM `p.d.a`;
OUTER JOIN ([A]) LOAD id, nombre; SQL SELECT id, nombre FROM `p.d.b`;
[Salida]: NoConcatenate LOAD * RESIDENT [A];
```

No añadirlo a manifests que cambien expectativas globales salvo que una suite exija explícitamente registrar cada fixture.

- [ ] **Step 2: Escribir RED en la matriz de prefijos**

En `parser-cargas.test.ts`, añadir a `it.each`:

```ts
["qlik-outer-join.qlik", { type: "join", join: "full", target: "A" }],
```
Añadir también una prueba negativa para que ampliar el regex no habilite `OUTER KEEP`:

```ts
it("no acepta OUTER KEEP como KEEP válido", () => {
  const program = parsearProgramaQlik(`
    [A]: LOAD id; SELECT id FROM \`p.d.a\`;
    OUTER KEEP([A]) LOAD id; SELECT id FROM \`p.d.b\`;
  `);
  const statement = program.statements.find(
    (item) => item.type === "unsupported" && item.keyword === "OUTER",
  );
  expect(statement).toBeDefined();
});
```

- [ ] **Step 3: Ejecutar RED**

Run:
```bash
bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts
```

Expected antes del fix: `qlik-outer-join.qlik` no produce un `load` con prefijo `full`; el negativo de `OUTER KEEP` debe seguir comportándose como unsupported.

- [ ] **Step 4: Implementar normalización mínima**

En `extraerPrefijoLoad()`, ampliar únicamente el modificador de `JOIN|KEEP` para leer `OUTER`:

```ts
/^(?:(INNER|LEFT|RIGHT|FULL|OUTER)\s+)?(JOIN|KEEP).../i
```
Normalizar antes del cast a la unión interna:

```ts
const operation = joinKeep[2]?.toLowerCase();
const rawSide = joinKeep[1]?.toLowerCase();
const side = (
  rawSide === "outer"
    ? "full"
    : rawSide ?? (operation === "join" ? "full" : "inner")
) as "inner" | "left" | "right" | "full";
```

Conservar la protección ya existente:

```ts
if (operation === "keep" && side === "full") return undefined;
```

Así `OUTER KEEP` se normaliza a `full` y es rechazado por la misma regla que ya impide `FULL KEEP`.

No modificar `ast.ts`, `ir.ts`, `analizador-semantico` ni `emisor-bigquery` para introducir un caso `outer`.

- [ ] **Step 5: Escribir la regresión relacional**

En `relacional.test.ts`:

```ts
it("normaliza OUTER JOIN de Qlik a FULL JOIN BigQuery", async () => {
  const result = await compile("qlik-outer-join.qlik");
  expect(result.sql).toContain("FULL JOIN");
  expect(result.sql).toContain("l.`id` = r.`id`");
  expect(result.sql).not.toContain("OUTER JOIN");
});
```
- [ ] **Step 6: Ejecutar GREEN de parser y relacional**

Run:
```bash
bun test \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/metadata-ir-campos.test.ts
```

Expected: PASS. `metadata-ir-campos.test.ts` protege que la nulabilidad de `full` continúe intacta.

- [ ] **Step 7: Revisar diff y commit focalizado**

Run:
```bash
git diff -- \
  apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/qlik-outer-join.qlik \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa/sentencias.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts
```

Stage solo esos archivos y commit:

```bash
git add apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/qlik-outer-join.qlik \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa/sentencias.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts
git commit -m "fix(compilador): support Qlik outer join prefix"
```
---

### Task 3: Añadir regresión end-to-end representativa de BQ_Inventario

**Files:**
- Create: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts`

**Interfaces:**
- Consumes: `parsearProgramaQlik()` y `compilarDataflowVNext()` públicos del compilador vNext.
- Produces: una prueba de aceptación que combina `If()` multilinea, filtro `RESIDENT`, `OUTER JOIN` y `If(Not IsNull(...))`.
- Invariant: el fixture no accede a BigQuery; los `SELECT` del fixture son texto para el compilador local.

- [ ] **Step 1: Crear un fixture mínimo fiel a la sintaxis problemática**

El fixture debe usar una fuente `p.d.uop`, calcular `FILTRO_UOP` con las tres comparaciones de `NOM_TIPO_UOP` más `ID_LOCAL = 0`, filtrar `FILTRO_UOP = 1`, construir una tabla izquierda, aplicarle `OUTER JOIN` por `ID_UOP` y terminar con `If(Not IsNull([LEFT_TIPO]), 'TIENE VENTAS ULTIMOS 5 DÍAS', 'SIN VENTAS') AS [TIENE_VENTAS]`.
Contenido recomendado del primer tramo del fixture:

```qlik
LIB CONNECT TO [Google BigQuery:Prod];
[Calcular campos 1]:
NOCONCATENATE
LOAD
  [ID_LOCAL],
  [NOM_TIPO_UOP],
  If(
    ([NOM_TIPO_UOP] <> 'SUBLUGAR DE TRABAJO'
     and [NOM_TIPO_UOP] <> 'DEPARTAMENTO'
     and [NOM_TIPO_UOP] <> 'INDUSTRIAS')
    or [ID_LOCAL] = 0,
    1,
    0
  ) AS [FILTRO_UOP];
SELECT ID_LOCAL, NOM_TIPO_UOP FROM `p.d.uop`;

[Seleccionar campos 2]:
NOCONCATENATE
LOAD [ID_LOCAL] AS [ID_UOP], [NOM_TIPO_UOP]
RESIDENT [Calcular campos 1]
WHERE [FILTRO_UOP] = 1;
```
Segundo tramo del fixture:

```qlik
[Unir 5]:
NOCONCATENATE
LOAD [ID_UOP], [NOM_TIPO_UOP] AS [LEFT_TIPO]
RESIDENT [Seleccionar campos 2]
WHERE [ID_UOP] = 100;

OUTER JOIN([Unir 5])
LOAD [ID_UOP], [NOM_TIPO_UOP] AS [RIGHT_TIPO]
RESIDENT [Seleccionar campos 2];

[Salida]:
NOCONCATENATE
LOAD
  [ID_UOP],
  [LEFT_TIPO],
  [RIGHT_TIPO],
  If(
    Not IsNull([LEFT_TIPO]),
    'TIENE VENTAS ULTIMOS 5 DÍAS',
    'SIN VENTAS'
  ) AS [TIENE_VENTAS]
RESIDENT [Unir 5];
```

No añadir `STORE` al fixture: esta regresión debe aislar los dos defectos confirmados, no probar transporte SFTP/GCS.
- [ ] **Step 2: Crear prueba de aceptación del AST y de la compilación**

En `regresion-bq-inventario.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { parsearProgramaQlik } from "./parser-programa.js";

const fixture = new URL(
  "../../fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik",
  import.meta.url,
);

describe("regresión BQ_Inventario", () => {
  it("preserva If() como expresión y normaliza OUTER JOIN", async () => {
    const script = await Bun.file(fixture).text();
    const program = parsearProgramaQlik(script);
    const filtro = program.statements.find(
      (item) => item.type === "load" && item.body.includes("FILTRO_UOP"),
    );
    expect(filtro?.type).toBe("load");
    expect(filtro?.type === "load" ? filtro.body : "").toContain("If(");
```
```ts
    const outer = program.statements.find(
      (item) =>
        item.type === "load" &&
        item.prefix.type === "join" &&
        item.prefix.target === "Unir 5",
    );
    expect(outer?.type).toBe("load");
    if (outer?.type !== "load") throw new Error("OUTER JOIN esperado");
    expect(outer.prefix).toEqual({
      type: "join",
      join: "full",
      target: "Unir 5",
    });

    const result = compilarDataflowVNext(script);
    expect(result.sql).toContain("CASE WHEN");
    expect(result.sql).toContain("FULL JOIN");
    expect(result.sql).toContain("TIENE VENTAS ULTIMOS 5 DÍAS");
    expect(result.sql).not.toContain("If(");
  });
});
```

Esta prueba es un lock de aceptación posterior a Tasks 1-2; no requiere un nuevo cambio de producción si ya queda verde.
- [ ] **Step 3: Ejecutar la aceptación completa**

Run:
```bash
bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts
```

Expected después de Tasks 1-2: PASS y cero accesos de red.

Si aparece un tercer `ErrorCompilacionVNext`, registrar antes de cualquier cambio:
- `diagnostic.code`;
- `diagnostic.category`;
- `diagnostic.message`;
- `diagnostic.snippet`;
- etapa donde falla: scanner, parser, semántica o emisor.

No arreglar ese tercer diagnóstico dentro de este plan. Abrir una investigación separada porque ya no sería consecuencia directa de los dos defectos confirmados.

- [ ] **Step 4: Commit de la regresión de aceptación**

```bash
git add \
  apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts
git commit -m "test(compilador): cover BQ Inventario compatibility regression"
```

---

### Task 4: Proteger el resumen visible al usuario contra el falso “Bifurcación”
**Files:**
- Test: `apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts`
- Verify only: `apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.ts`

**Interfaces:**
- Consumes: `resumirDataflowParaUsuario()` que internamente llama `compilarDataflowVNext()`.
- Produces: evidencia de que un `If()` válido no genera estado `script_no_compatible` ni el mensaje de “Bifurcación”.
- Invariant: un `IF` procedural realmente malformado sí puede seguir mostrando `SYNTAX_INVALID_IF`/“Bifurcación”.

- [ ] **Step 1: Añadir regresión del caso válido usando el mismo fixture**

En `resumir-dataflow.test.ts`:

```ts
it("no confunde If() válido con una Bifurcación procedural", async () => {
  const script = await Bun.file(
    new URL(
      "../../reportes/fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik",
      import.meta.url,
    ),
  ).text();
  const resumen = resumir(script);

  expect(resumen.estado).toBe("analizado");
  expect(resumen.advertencias.join(" ")).not.toContain("Bifurcación");
  expect(resumen.advertencias.join(" ")).not.toContain("SYNTAX_INVALID_IF");
});
```
- [ ] **Step 2: Mantener una prueba del error procedural real**

Añadir un caso pequeño que pruebe que no se “arregló” el problema ocultando todos los errores `IF`:

```ts
it("mantiene diagnóstico accionable para un IF procedural malformado", () => {
  const resumen = resumir(`${encabezado}
    [base]: LOAD id; SELECT id FROM \`p.d.t\`;
    IF id = 1;
  `);

  expect(resumen.estado).toBe("script_no_compatible");
  expect(resumen.advertencias.join(" ")).toContain("Bifurcación");
});
```

- [ ] **Step 3: Ejecutar la prueba de resumen**

Run:
```bash
bun test apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts
```

Expected: PASS después de Tasks 1-3.

No editar `resumir-dataflow.ts` si este resultado ya es verde. El mensaje engañoso era una consecuencia del diagnóstico falso, no una razón para cambiar copy.

Si el test válido sigue rojo con un nuevo diagnóstico del compilador, aplicar la regla de “tercer diagnóstico” de la especificación y detener el alcance.
- [ ] **Step 4: Commit solo del test de resumen**

```bash
git diff -- apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts
git add apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts
git commit -m "test(flujos): prevent false bifurcation warning for If expression"
```

No stagear `resumir-dataflow.ts`; contiene trabajo previo ajeno a este plan.

---

### Task 5: Verificación integral del compilador sin BigQuery

**Files:**
- Verify only: todos los archivos modificados en Tasks 1-4.

**Interfaces:**
- Consumes: suites locales de Bun, TypeScript y Biome.
- Produces: evidencia reproducible de que el fix es correcto y aislado.

- [ ] **Step 1: Ejecutar la batería focalizada completa**

```bash
bun test \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/control-flow.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/metadata-ir-campos.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts \
  apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts
```
Expected: todas PASS.

- [ ] **Step 2: Ejecutar toda la suite del compilador vNext**

```bash
bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext
```

Expected: PASS. Cualquier fallo nuevo en funciones, control flow, metadata o conformance se considera regresión del cambio hasta demostrar lo contrario.

- [ ] **Step 3: Ejecutar backend completo**

```bash
bun run test:backend
```

Expected: PASS. Si existe un fallo preexistente fuera de las rutas modificadas, registrar el test y comprobar con `git diff` que no fue causado por este trabajo; no modificar módulos ajenos para conseguir verde artificialmente.

- [ ] **Step 4: Ejecutar typecheck**

```bash
bun run typecheck
```

Expected: PASS. La normalización de `OUTER` no debe ampliar la unión TypeScript de `LoadPrefix.join`.
- [ ] **Step 5: Ejecutar Biome solo sobre el alcance de este cambio**

```bash
bunx biome check \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/scanner-qlik.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa/sentencias.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-cargas.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts \
  apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts \
  apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts
```

Expected: PASS sin reformatar archivos ajenos.

- [ ] **Step 6: Revisar aislamiento del working tree**

```bash
git status --short
git diff --stat
git diff --name-only
```

Confirmar que los commits de este plan nunca incluyeron los cambios preexistentes de trazabilidad BigQuery, descargas, esquema, rutas o `resumir-dataflow.ts`.
- [ ] **Step 7: Registrar evidencia final**

El reporte de implementación debe incluir:

```text
scanner If()/IF control: PASS
OUTER JOIN -> full: PASS
OUTER KEEP sigue unsupported: PASS
regresión BQ_Inventario: PASS
resumen sin falso Bifurcación: PASS
control-flow procedural: PASS
suite compilador vNext: PASS
test:backend: PASS
typecheck: PASS
Biome: PASS
consultas/jobs BigQuery ejecutados: 0
```

Si una suite amplia falla por trabajo preexistente, sustituir únicamente la línea afectada por `FAIL preexistente: <test> — <causa comprobada>` y adjuntar la evidencia; no declarar verde lo que no se ejecutó.

---

## Criterios de aceptación de la implementación

- [ ] `If(` y `If (` dentro de `LOAD` no generan una nueva `SentenciaCruda`.
- [ ] Un literal `THEN` dentro de los argumentos de `If()` tampoco activa control procedural.
- [ ] `IF condición THEN ... END IF` continúa cubierto por `control-flow.test.ts`.
- [ ] El fragmento `FILTRO_UOP` de BQ_Inventario compila como expresión.
- [ ] `If(Not IsNull(...))` se emite como `CASE WHEN NOT (... IS NULL) ...`.
- [ ] `OUTER JOIN` se representa internamente como `join: "full"`.
- [ ] BigQuery emitido contiene `FULL JOIN`, no un nuevo tipo interno `outer`.
- [ ] `OUTER KEEP` continúa rechazado.
- [ ] El fixture combinado atraviesa `parsearProgramaQlik` y `compilarDataflowVNext` sin los dos errores confirmados.
- [ ] El resumen de usuario queda en `analizado` y no menciona “Bifurcación” para el fixture válido.
- [ ] Un `IF` procedural malformado sigue generando un aviso accionable.
- [ ] No se modificó `resumir-dataflow.ts` para maquillar el diagnóstico.
- [ ] No se modificó el compilador legacy.
- [ ] No se ejecutó BigQuery.
- [ ] No se stagearon ni revirtieron cambios ajenos.

## Archivos que NO deberían cambiar

Si la solución necesita modificar cualquiera de estos archivos, detenerse y justificar una ampliación de alcance antes de hacerlo:

```text
apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ast.ts
apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ir.ts
apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik/dispatcher.ts
apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/relacional.ts
apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.ts
apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.ts
```

La necesidad de tocar uno de ellos indicaría que la hipótesis de “clasificación + normalización” era incompleta y exige volver a investigación de causa raíz.
## Handoff para el siguiente agente

Antes de implementar:

```text
1. Leer AGENTS.md raíz.
2. Leer apps/api/AGENTS.md.
3. Leer compilador-vnext/AGENTS.md y parser-programa/AGENTS.md.
4. Leer la spec indicada en el encabezado de este plan.
5. Ejecutar git status --short y preservar todo cambio previo.
6. Usar superpowers:subagent-driven-development o superpowers:executing-plans.
7. Ejecutar Task 1 → Task 5 en orden; no saltar RED/GREEN.
```

Contexto de causa raíz que no debe redescubrir:

```text
If(...) ya está soportado por el dispatcher de expresiones.
El error SYNTAX_INVALID_IF nace porque scanner-qlik.ts separa If( del LOAD.
^IF\b coincide con If( y con If (.
OUTER JOIN actualmente queda type=unsupported keyword=OUTER.
JOIN y FULL JOIN ya se normalizan a join=full.
El analizador, metadata y emisor ya tienen semántica full join.
El mensaje “Bifurcación” del resumen es consecuencia del diagnóstico falso.
```

No ejecutar el reporte real como mecanismo de prueba hasta que las validaciones locales hayan pasado; este plan no requiere ni autoriza una consulta BigQuery real.
