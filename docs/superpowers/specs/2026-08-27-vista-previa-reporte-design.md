# Vista Previa de Reporte sin Costo de BigQuery

**Fecha:** 2026-08-27
**Estado:** Borrador

## Objetivo

Implementar una vista previa del resultado del reporte que:
- Muestra datos reales transformados (aliases, LEFT, concatenaciones, filtros, agregaciones, etc.)
- **NO ejecuta consultas BigQuery** (sin costo de análisis)
- Usa `HEAD` / `tabledata.list` para obtener muestras gratuitas

---

## Arquitectura General

```
Qlik Script
  → parser/IR existente
  → identificar fuentes
  → BigQuery HEAD/tabledata.list (filas de muestra)
  → evaluador local del IR
  → 10 filas finales
  → tabla de preview
```

---

## 1. Nuevo Endpoint de Preview

**Ruta:** `GET /api/reportes/:flujoId/preview`

**Responsabilidad:**
1. Obtener el script actual de Qlik
2. Pasarlo por el parser/analizador semántico del compilador vNext (sin ejecutar SQL)
3. Determinar las tablas y columnas necesarias
4. Obtener muestras mediante `tabledata.list`
5. Evaluar localmente las transformaciones del IR
6. Devolver 10 filas transformadas

**No hace:**
- No ejecuta `createQueryJob()`
- No calcula costos

---

## 2. Adaptador BigQuery: Lectura Gratuita

### Puerto BigQuery (nuevo)

```typescript
interface PuertoLecturaBigQuery {
  obtenerFilasPreview(
    tabla: string,
    opciones: { maxFilas?: number; columnas?: string[] }
  ): Promise<{ columnas: string[]; filas: string[][] }>;
}
```

### Implementación

**Archivo:** `apps/api/src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.ts`

Usa `@google-cloud/bigquery` método `table(...).getRows({ maxResults })`:
- 50-100 filas por fuente internamente (mostrar 10)
- Solo las columnas necesarias cuando sea posible
- **NUNCA** usa `SELECT * LIMIT 10`
- **NUNCA** usa `createQueryJob()`

---

## 3. Evaluador Local del IR

**Archivo:** `apps/api/src/modulos/reportes/aplicacion/evaluador-preview.ts`

Toma las filas de muestra y el `PlanCompilacionVNext` y aplica:

### Transformaciones soportadas

| Transformación | Comportamiento |
|---|---|
| Selección de campos | Proyecta solo las columnas del `project` |
| Aliases | Renombra columnas según `alias` |
| `LEFT()`, `RIGHT()`, concatenaciones | Aplica funciones de string a valores crudos |
| Operaciones matemáticas | +, -, *, / sobre valores numéricos |
| Conversiones | DATE, NUMERIC, STRING, etc. |
| Filtros | WHERE en memoria (condiciones simples) |
| Campos calculados | Expresiones Qlik evaluadas por muestra |
| Ordenamiento | `sort` del IR |
| Joins | Join en memoria usando claves del IR |
| SUM, AVG, COUNT, MIN, MAX | Calculados sobre la muestra |
| DATE, YEAR, MONTH, DAY, WEEK | Funciones de fecha |

### Agregaciones

- Se calculan **sobre la muestra**, no sobre millones de filas
- La UI debe indicar claramente que son valores de muestra

### Joins

- HEAD de cada tabla involucrada
- Join en memoria usando claves del IR
- Advertencia si las primeras filas no contienen coincidencias

---

## 4. Contrato de Respuesta

```typescript
interface RespuestaVistaPrevia {
  columnas: string[];
  filas: string[][];
  filasMuestreadas: number;
  fuentesMuestreadas: string[];
  contieneAgregaciones: boolean;
  advertencias: string[];
  esMuestra: true;
}
```

---

## 5. Frontend: Componente VistaPreviaReporte

**Archivo:** `apps/web/src/modulos/reportes/componentes/detalle/vista-previa-reporte.tsx`

### Diseño

Inspirado en `TablaColumnasReporte` de `bq_reportes_creator`:

- **Header:** "Vista previa del resultado" + "Primeras 10 filas de una muestra"
- **Tabla horizontal** con scroll
- **Columnas:** nombres compactos de los campos transformados
- **Celdas:** monoespaciadas, truncadas, tooltip con valor completo
- **Header sticky**
- **Hover por fila**
- **Estados:** carga, error, vacío
- ** Indicador de muestra + agregaciones**

### Integración

- Nuevo tab o sección en `pagina-detalle-reporte.tsx`
- Llamada a `GET /reportes/:flujoId/preview`
- Mostrar debajo de `PestanaScriptFlujo` o en tab separado

### Métrica de resumen

Mantener `53 campos incluidos` como métrica visible, pero ya no como lista vertical.

---

## 6. Cambios en PestanaScriptFlujo

La sección `Campos incluidos` (líneas 80-103) se reemplaza por:

- Enlace/botón "Vista previa"
- Al hacer clic, carga y muestra `VistaPreviaReporte`
- La lista vertical de campos puede mantenerse como colapsable para referencia rápida

---

## 7. Archivos a Crear/Modificar

### Backend

| Archivo | Acción | Propósito |
|---|---|---|
| `google-cloud/aplicacion/puerto-lectura-bigquery.ts` | Crear | Interfaz del puerto |
| `google-cloud/infraestructura/cliente-preview-bigquery.ts` | Crear | Implementación tabledata.list |
| `reportes/aplicacion/evaluador-preview.ts` | Crear | Evaluador local del IR |
| `reportes/aplicacion/vista-previa-dataflow.ts` | Crear | Caso de uso |
| `reportes/http/rutas-reportes-dataflow.ts` | Modificar | Añadir ruta preview |
| `reportes/aplicacion/preflight-dataflow.ts` | Modificar | Reutilizar lógica existente |

### Frontend

| Archivo | Acción | Propósito |
|---|---|---|
| `reportes/componentes/detalle/vista-previa-reporte.tsx` | Crear | Componente de preview |
| `reportes/api.ts` | Modificar | Añadir `obtenerVistaPreviaReporte` |
| `reportes/pagina-detalle-reporte.tsx` | Modificar | Integrar preview |

### Contratos

| Archivo | Acción | Propósito |
|---|---|---|
| `contratos/src/reportes/dataflow.ts` | Modificar | Añadir esquema de respuesta |

### Tests

| Archivo | Acción | Propósito |
|---|---|---|
| `reportes/aplicacion/evaluador-preview.test.ts` | Crear | Tests del evaluador |
| `reportes/http/rutas-reportes-dataflow.test.ts` | Modificar | Tests del endpoint |
| `google-cloud/infraestructura/cliente-preview-bigquery.test.ts` | Crear | Tests del cliente BQ |
| `reportes/componentes/detalle/vista-previa-reporte.test.tsx` | Crear | Tests del componente |

---

## 8. Tests Obligatorios

1. HEAD de una fuente y cero queries (verificar que no se llama `createQueryJob`)
2. Alias de columna
3. `LEFT(...)` y `RIGHT(...)`
4. Campo calculado
5. Filtro en memoria
6. Fechas (DATE, YEAR, MONTH, DAY)
7. Agregación AVG sobre muestra
8. Join de dos muestras en memoria
9. 53+ columnas con scroll horizontal
10. Dataflow incompatible (graceful error)
11. Tabla sin filas
12. Fallo de BigQuery en tabledata.list
13. Verificar con mocks que **jamás** se llama `createQueryJob()`
14. `bun run typecheck`
15. Tests de integración web y API
16. Build exitoso

---

## 9. Indicadores en UI

### Badge de muestra

> **Vista previa · datos de muestra**

### Advertencia de agregaciones (cuando aplique)

> "Los cálculos agregados se realizan sobre la muestra y pueden diferir del resultado completo."

### Advertencia de joins (cuando aplique)

> "La muestra no contiene suficientes coincidencias para representar completamente este join."

---

## 10. Restricciones Técnicas

- **No usar `SELECT ... LIMIT 10`** para preview
- **No usar `createQueryJob()`** para preview
- Usar `table.getRows({ maxResults })` del SDK de BigQuery
- El evaluador local opera solo sobre la muestra obtenida
- Máximo 10 filas en la respuesta, pero obtener 50-100 internamente

---

## Alternativas Consideradas

### Alternativa 1: `SELECT ... LIMIT 10` directamente
- **Rechazada:** BigQuery cobra por bytes procesados incluso en queries pequeñas
- El diseño del usuario específicamente requiere evitar este enfoque

### Alternativa 2: Segundo compilador SQL específico para preview
- **Rechazada:** Mantendría dos reglas de compilación
- El evaluador local reutiliza el IR existente

---

## Referencias

- [Best practices for cost optimization - BigQuery](https://cloud.google.com/bigquery/docs/best-practices-costs)
- `bq head` / `tabledata.list` como alternativa sin costo
