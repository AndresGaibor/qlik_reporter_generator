# Manejo Global De Errores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantizar que los errores de red, API, React Query y renderizado muestren mensajes seguros y accionables, nunca detalles técnicos.

**Architecture:** Un normalizador puro convierte `unknown` en mensajes y categorías seguros. El cliente HTTP crea errores tipados, las vistas llaman al normalizador y un límite global de React protege los fallos de renderizado fuera del router.

**Tech Stack:** React 18, TypeScript, TanStack React Query/Router, Vitest, Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-08-25-manejo-global-errores-design.md`

## Global Constraints

- Todo mensaje de usuario estará en español y contendrá una acción clara.
- Nunca presentar `Error.message` de excepciones no tipadas.
- Conservar códigos y estados de `ErrorClienteApi` para flujos que los distinguen.
- No alterar contratos HTTP del backend.
- No introducir dependencias nuevas.

---

## File Structure

- Create: `apps/web/src/compartido/errores/normalizar-error.ts` - clasificación pura y segura.
- Create: `apps/web/src/compartido/errores/normalizar-error.test.ts` - pruebas de clasificación.
- Create: `apps/web/src/compartido/errores/notificador-errores.ts` - puente para notificar fallos no capturados por React Query.
- Create: `apps/web/src/compartido/componentes/feedback/limite-errores.tsx` - recuperación global de errores de renderizado.
- Create: `apps/web/src/compartido/componentes/feedback/limite-errores.test.tsx` - pruebas de recuperación.
- Modify: `apps/web/src/compartido/api/cliente.ts` - códigos estables y respuestas no JSON seguras.
- Modify: `apps/web/src/compartido/api/cliente.test.ts` - cobertura HTTP de borde.
- Modify: `apps/web/src/modulos/autenticacion/api.ts` - reutilizar el normalizador para solicitudes OAuth.
- Modify: `apps/web/src/modulos/autenticacion/api.test.ts` - respuestas vacías y JSON inválido.
- Modify: `apps/web/src/app/proveedores.tsx` - caches de React Query con normalización global.
- Modify: `apps/web/src/main.tsx` - envolver la app con `LimiteErrores`.
- Modify: `apps/web/src/compartido/componentes/feedback/estado-error.tsx` - eliminar detalle técnico expandible.
- Modify: `apps/web/src/app/layout-principal.tsx`, `apps/web/src/modulos/reportes/pagina-reportes.tsx`, `apps/web/src/modulos/reportes/pagina-detalle-reporte.tsx`, `apps/web/src/modulos/admin/PaginaSuperadmins.tsx`, `apps/web/src/modulos/admin/componentes/seccion-configurar-automatizacion-base.tsx`, `apps/web/src/modulos/admin/componentes/seccion-bigquery.tsx`, `apps/web/src/modulos/admin/componentes/seccion-configurar-dataflow-base.tsx`, `apps/web/src/modulos/admin/componentes/seccion-oauth-qlik.tsx` - sustituir uso directo de `error.message`.

### Task 1: Normalizador Seguro De Errores

**Files:**
- Create: `apps/web/src/compartido/errores/normalizar-error.ts`
- Test: `apps/web/src/compartido/errores/normalizar-error.test.ts`

**Interfaces:**
- Consumes: `ErrorClienteApi` de `@/compartido/api/cliente`.
- Produces: `normalizarError(error: unknown): { mensaje: string; categoria: "conexion" | "sesion" | "permisos" | "validacion" | "no-encontrado" | "general" }`, `registrarNotificadorErrores(notificar: (error: unknown) => void): () => void` y `notificarErrorNoControlado(error: unknown): void`.

- [ ] **Step 1: Escribir pruebas que fallen**

```ts
expect(normalizarError(new ErrorClienteApi("interno", 503))).toEqual({
  mensaje: "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos.",
  categoria: "conexion",
});
expect(normalizarError(new Error("Unexpected end of JSON input"))).toEqual({
  mensaje: "Ocurrió un problema inesperado. Intenta nuevamente.",
  categoria: "general",
});
const notificar = vi.fn();
const limpiar = registrarNotificadorErrores(notificar);
notificarErrorNoControlado(new Error("interno"));
expect(notificar).toHaveBeenCalledOnce();
limpiar();
```

- [ ] **Step 2: Ejecutar la prueba y comprobar que falla**

Run: `bun run --cwd apps/web test:run src/compartido/errores/normalizar-error.test.ts`

- [ ] **Step 3: Implementar el clasificador mínimo**

```ts
export function normalizarError(error: unknown): ErrorNormalizado {
  if (error instanceof ErrorClienteApi && error.estado === 401) {
    return { mensaje: "Tu sesión expiró. Inicia sesión nuevamente.", categoria: "sesion" };
  }
  // Clasificar únicamente estado/código controlados; todo otro valor es general.
}
```

- [ ] **Step 4: Verificar la prueba**

Run: `bun run --cwd apps/web test:run src/compartido/errores/normalizar-error.test.ts`

- [ ] **Step 5: Commit**

Run: `git add apps/web/src/compartido/errores && git commit -m "feat: normalizar errores de interfaz"`

### Task 2: Cliente HTTP Y OAuth Seguros

**Files:**
- Modify: `apps/web/src/compartido/api/cliente.ts`
- Modify: `apps/web/src/compartido/api/cliente.test.ts`
- Modify: `apps/web/src/modulos/autenticacion/api.ts`
- Modify: `apps/web/src/modulos/autenticacion/api.test.ts`

**Interfaces:**
- Consumes: `normalizarError` de Task 1.
- Produces: toda solicitud rechazada es `ErrorClienteApi`; OAuth nunca llama `Response.json()` directamente.

- [ ] **Step 1: Escribir pruebas que fallen para cuerpo inválido**

```ts
globalThis.fetch = vi.fn(async () => new Response("<html>caído</html>", { status: 503 })) as typeof fetch;
await expect(new ClienteApi("/api").get("/estado")).rejects.toMatchObject({
  codigo: "RESPUESTA_INVALIDA",
  estado: 503,
});
```

- [ ] **Step 2: Ejecutar pruebas y comprobar el fallo esperado**

Run: `bun run --cwd apps/web test:run src/compartido/api/cliente.test.ts src/modulos/autenticacion/api.test.ts`

- [ ] **Step 3: Mantener el error tipado y seguro**

```ts
const contenido = await leerRespuesta<T>(respuesta);
// `leerRespuesta` transforma vacío/no JSON en ErrorClienteApi estable.
// `solicitarInicioSesion` delega texto/estado al mismo criterio, sin parseo directo.
```

- [ ] **Step 4: Verificar las pruebas**

Run: `bun run --cwd apps/web test:run src/compartido/api/cliente.test.ts src/modulos/autenticacion/api.test.ts`

- [ ] **Step 5: Commit**

Run: `git add apps/web/src/compartido/api apps/web/src/modulos/autenticacion && git commit -m "fix: proteger respuestas HTTP inválidas"`

### Task 3: Recuperación Global De Renderizado

**Files:**
- Create: `apps/web/src/compartido/componentes/feedback/limite-errores.tsx`
- Create: `apps/web/src/compartido/componentes/feedback/limite-errores.test.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/compartido/componentes/feedback/estado-error.tsx`

**Interfaces:**
- Consumes: `normalizarError` de Task 1 y `EstadoRuta` existente.
- Produces: `<LimiteErrores>{children}</LimiteErrores>` que muestra recuperación al capturar un error.

- [ ] **Step 1: Escribir prueba de límite de errores**

```tsx
function VistaFallida(): never { throw new Error("detalle interno"); }
render(<LimiteErrores><VistaFallida /></LimiteErrores>);
expect(screen.getByText("Ocurrió un problema inesperado. Intenta nuevamente.")).toBeVisible();
expect(screen.queryByText("detalle interno")).not.toBeInTheDocument();
```

- [ ] **Step 2: Ejecutar prueba y comprobar que falla**

Run: `bun run --cwd apps/web test:run src/compartido/componentes/feedback/limite-errores.test.tsx`

- [ ] **Step 3: Implementar el límite y eliminar detalles técnicos de estados**

```tsx
export class LimiteErrores extends Component<Props, State> {
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error ? <EstadoRuta tipo="error" onReintentar={this.reintentar} /> : this.props.children; }
}
```

En `main.tsx`, envolver `Proveedores`, `NotificacionesProvider` y `RouterProvider` con `LimiteErrores`. En `EstadoError`, retirar el bloque `<details>` que presenta `mensaje`.

- [ ] **Step 4: Verificar prueba y typecheck**

Run: `bun run --cwd apps/web test:run src/compartido/componentes/feedback/limite-errores.test.tsx && bun run --cwd apps/web typecheck`

- [ ] **Step 5: Commit**

Run: `git add apps/web/src/main.tsx apps/web/src/compartido/componentes/feedback && git commit -m "feat: recuperar errores globales de interfaz"`

### Task 4: Aplicar Política A React Query Y Vistas

**Files:**
- Modify: `apps/web/src/app/proveedores.tsx`
- Modify: `apps/web/src/compartido/componentes/feedback/notificaciones.tsx`
- Modify: `apps/web/src/compartido/errores/notificador-errores.ts`
- Modify: los ocho archivos de vistas enumerados en File Structure.
- Test: pruebas existentes junto a cada vista modificada.

**Interfaces:**
- Consumes: `normalizarError` de Task 1.
- Produces: ningún handler genérico pasa `error.message` a `mostrarError`.

- [ ] **Step 1: Escribir prueba de no filtración de excepción no tipada**

```tsx
const errorInterno = new Error("Unexpected end of JSON input");
// Simular la mutación fallida de la vista.
expect(mostrarError).toHaveBeenCalledWith("Ocurrió un problema inesperado. Intenta nuevamente.");
expect(mostrarError).not.toHaveBeenCalledWith(errorInterno.message);
```

- [ ] **Step 2: Ejecutar la prueba de la vista elegida y comprobar que falla**

Run: `bun run --cwd apps/web test:run src/modulos/reportes/pagina-reportes.test.tsx`

- [ ] **Step 3: Reemplazar handlers y configurar el fallback de React Query**

```ts
onError: (error) => mostrarError(normalizarError(error).mensaje)
```

En `notificaciones.tsx`, registrar al montar un notificador que llame a `mostrarError(normalizarError(error).mensaje)` y desregistrarlo al desmontar. En `proveedores.tsx`, definir `defaultOptions.queries.onError` y `defaultOptions.mutations.onError` para invocar ese notificador. React Query reemplaza el callback por defecto cuando una vista define su propio `onError`, por lo que los handlers explícitos no duplican avisos y las operaciones sin handler quedan protegidas.

- [ ] **Step 4: Auditar que no quedan filtraciones**

Run: `rg 'mostrarError\([^)]*\.message' apps/web/src`
Expected: sin resultados.

- [ ] **Step 5: Ejecutar pruebas web completas**

Run: `bun run --cwd apps/web test:run && bun run --cwd apps/web typecheck && bunx biome check apps/web/src`

- [ ] **Step 6: Commit**

Run: `git add apps/web/src && git commit -m "fix: estandarizar errores visibles al usuario"`

### Task 5: Verificación Final

**Files:**
- Modify: ninguno.

- [ ] **Step 1: Verificar que el frontend y API responden**

Run: `curl --silent --show-error --fail http://localhost:4523/api/setup/status`

- [ ] **Step 2: Ejecutar la verificación integral disponible**

Run: `bun run test:web && bun run --cwd apps/web typecheck && bun run lint`

- [ ] **Step 3: Revisar cambios previstos**

Run: `git diff --check && git status --short`

- [ ] **Step 4: Reportar bloqueos ajenos sin ocultarlos**

Indicar por archivo y error cualquier fallo previo del backend o trabajo concurrente; no modificarlo fuera de este alcance.

## Self-Review

- Cobertura: Tasks 1-2 cubren HTTP/OAuth; Task 3 cubre renderizado; Task 4 cubre React Query y vistas; Task 5 cubre la verificación requerida.
- Sin placeholders: cada tarea especifica archivos, interfaz, prueba, comando y cambio mínimo.
- Consistencia: todos los consumidores usan `normalizarError(error).mensaje`; `ErrorClienteApi` continúa siendo el tipo de transporte.
