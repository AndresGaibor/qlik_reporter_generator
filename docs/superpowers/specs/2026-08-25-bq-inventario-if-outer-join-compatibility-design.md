# Compatibilidad BQ_Inventario: If() y Outer Join

**Fecha:** 2026-08-25
**Tipo:** Corrección acotada del compilador Qlik → BigQuery
**Estado:** Aprobado para planificación

---

## 1. Objetivo

Corregir falsos negativos de compatibilidad detectados con el Dataflow `BQ_Inventario` sin modificar el Dataflow en Qlik y sin ejecutar consultas BigQuery con costo.

El compilador debe distinguir la función de expresión Qlik `If(condición, then, else)` de la sentencia procedural `IF condición THEN ... END IF`, y debe aceptar `OUTER JOIN` como la forma Qlik equivalente al join completo ya representado internamente como `join: "full"`.

## 2. Evidencia del script real

El script entregado contiene un campo calculado válido dentro de un `LOAD`:

```qlik
If(
    (NOM_TIPO_UOP <> 'SUBLUGAR DE TRABAJO'
     and NOM_TIPO_UOP <> 'DEPARTAMENTO'
     and NOM_TIPO_UOP <> 'INDUSTRIAS')
    or ID_LOCAL = 0,
    1,
    0
) AS [FILTRO_UOP]
```
El mismo script contiene otro `If()` válido al final:

```qlik
If(
    Not IsNull([Unidad Operativa Ventas]),
    'TIENE VENTAS ULTIMOS 5 DÍAS',
    'SIN VENTAS'
) AS [TIENE_VENTAS]
```

También contiene la rama generada por Qlik:

```qlik
OUTER JOIN([Unir 5])
LOAD
    [COD_PROVEEDOR] AS [RIGHT_COD_PROVEEDOR],
    [COD_ARTICULO] AS [RIGHT_COD_ARTICULO],
    [ID_ITEM_ACTUAL] AS [RIGHT_ID_ITEM_ACTUAL],
    ...
RESIDENT [Seleccionar campos 2];
```

## 3. Causa raíz confirmada

`scanner-qlik.ts` usa `lineaControl()` para separar sentencias de control al inicio de una línea. La expresión `^IF\b` también coincide con `If(` porque el límite de palabra existe entre `f` y `(`.
Al quedar separado del `LOAD`, `parsearSentenciaConBloque()` recibe una sentencia que empieza en `If(` y la deriva a `parsearIf()`. Ese parser exige la forma procedural `IF ... THEN`, por lo que produce exactamente `SYNTAX_INVALID_IF`.

La reproducción mínima actual falla con:

```text
SYNTAX_INVALID_IF
IF requiere una condición y THEN
snippet: If(...) AS [FILTRO_UOP]
```

No falta soporte de expresión: `expresiones-qlik/dispatcher.ts` ya baja `If()` a `CASE WHEN ... THEN ... ELSE ... END`, y las dos expresiones de BQ_Inventario se emiten correctamente cuando se prueban aisladas.

El segundo defecto está en `extraerPrefijoLoad()`: reconoce `JOIN`, `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN` y `FULL JOIN`, pero no la palabra Qlik `OUTER JOIN`. La representación interna y el emisor ya soportan `join: "full"`, por lo que no se requiere un nuevo tipo de AST/IR.

## 4. Decisiones de diseño

1. `If(...)` y `If (...)` dentro de un `LOAD` nunca deben clasificarse como inicio de control procedural.
2. Un `IF condición THEN` real debe conservar el comportamiento y diagnósticos actuales.
3. La corrección principal se hace en el scanner, donde nace la clasificación incorrecta.
4. `OUTER JOIN` se normaliza inmediatamente a `join: "full"` en el parser de prefijos.
5. No se añade `"outer"` al AST ni al IR: el resto del pipeline debe seguir viendo únicamente `inner | left | right | full`.
6. `OUTER KEEP` no se vuelve válido por accidente; los tipos de `KEEP` continúan limitados a los ya soportados.
7. El resumen de Dataflow debe dejar de marcar BQ_Inventario como incompatible cuando el compilador ya lo acepte.
8. `resumir-dataflow.ts` solo cambia si una regresión de resumen sigue fallando después de arreglar el compilador; no se parchea el copy para ocultar un error técnico.
9. La validación se hace con tests, fixtures y compilación local. No se ejecutan `SELECT`, `EXPORT DATA`, dry-runs facturables ni jobs BigQuery reales.

## 5. Alcance

Incluido:

- scanner de sentencias Qlik;
- parser de prefijos `LOAD`;
- fixtures/tests de scanner, parser, semántica relacional y emisión;
- regresión representativa de BQ_Inventario;
- prueba del resumen de compatibilidad mostrado al usuario.

Excluido:

- modificar el Dataflow de Qlik Cloud;
- cambiar la sintaxis de `If()` o reimplementar su emisor;
- crear un tipo `outer` nuevo en AST/IR;
- refactorizaciones generales del compilador;
- ejecutar BigQuery para verificar el cambio;
- cambiar la semántica de joins o filtros existentes.

## 6. Riesgos a controlar
- No romper `IF ... THEN ... END IF` real ni sus diagnósticos de sintaxis.
- No convertir una función `If (` con espacio antes del paréntesis en control procedural.
- No aceptar `OUTER KEEP` al ampliar el regex de prefijos.
- No cambiar la semántica del `JOIN` sin modificador, que actualmente se normaliza a `full`.
- No introducir cambios ajenos presentes en el working tree actual.

## 7. Criterios de aceptación

1. El scanner conserva un `LOAD` multilinea que contiene `If(...)` como una sola sentencia.
2. También conserva `If (...)` con espacios antes del paréntesis.
3. `IF condición THEN ... END IF` sigue parseándose como AST `type: "if"`.
4. El fragmento real de `FILTRO_UOP` deja de producir `SYNTAX_INVALID_IF`.
5. La expresión `TIENE_VENTAS` sigue bajando a `CASE WHEN NOT (... IS NULL) THEN ... ELSE ... END`.
6. `OUTER JOIN([tabla]) LOAD ...` produce `prefix: { type: "join", join: "full", target: "tabla" }`.
7. La compilación relacional de `OUTER JOIN` emite `FULL JOIN` y conserva las claves naturales.
8. `OUTER KEEP` no queda aceptado como `KEEP` válido.
9. Una regresión representativa de BQ_Inventario atraviesa parser → semántica → IR → emisor sin `SYNTAX_INVALID_IF` ni `UNSUPPORTED` por `OUTER`.
10. El resumen de Dataflow no muestra “Bifurcación” ni `SYNTAX_INVALID_IF` para ese caso válido.
11. Los tests focalizados, `bun run typecheck` y Biome pasan.
12. Consultas/jobs BigQuery ejecutados para esta corrección: 0.

## 8. Regla ante un tercer diagnóstico

Después de corregir estos dos defectos, el agente debe compilar la regresión completa localmente. Si aparece un diagnóstico distinto y reproducible, debe documentarlo con su snippet y detener la ampliación de alcance: ese nuevo problema requiere causa raíz y prueba propia antes de modificar producción.
