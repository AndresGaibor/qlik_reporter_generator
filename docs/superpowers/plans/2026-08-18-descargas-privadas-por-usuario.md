# Descargas privadas por usuario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aislar las descargas por propietario, mantener capacidades administrativas y hacer la página de descargas más intuitiva.

**Architecture:** Persistir `creadoPorUsuarioId` en cada ejecución y usarlo como frontera de autorización en repositorio/API. Las nuevas rutas GCS se segmentan por usuario; la UI consume endpoints diferenciados para vista personal y administración, sin confiar en ocultamiento visual para seguridad.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, React, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-descargas-privadas-por-usuario-design.md`

## Global Constraints

- Preservar todos los cambios no confirmados existentes.
- No hacer commits automáticos.
- TDD obligatorio: test rojo antes de cada cambio funcional.
- Usuario final nunca puede leer manifiestos de otro propietario.
- Histórico sin propietario permanece accesible únicamente a administradores.

---

### Task 1: Persistencia de propietario y ruta GCS

**Files:** `apps/api/src/plataforma/persistencia/esquema.ts`, migración Drizzle, `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`, tests asociados.

- [ ] Escribir test que exija persistir `creadoPorUsuarioId` y ruta `usuarios/<uuid>/...`.
- [ ] Ejecutar test y confirmar fallo por propiedad/ruta inexistente.
- [ ] Añadir columna nullable con FK a `usuarios.id` y pasar `usuarioId` al repositorio.
- [ ] Generar/aplicar migración local sin borrar datos.
- [ ] Ejecutar tests de reportes y confirmar verde.
### Task 2: Autorización de descargas

**Files:** `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`, `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`, `apps/api/src/modulos/descargas/http/rutas-descargas.ts`, tests HTTP/repositorio.

- [ ] Escribir tests: usuario solo lista/abre lo suyo; otro usuario recibe 404/403; admin puede consultar histórico y usuarios.
- [ ] Ejecutar tests y confirmar fallos esperados.
- [ ] Extender consultas con `usuarioId` y contexto administrativo.
- [ ] Añadir endpoint administrativo separado para no mezclar vista personal con global.
- [ ] Ejecutar tests de descargas y confirmar verde.

### Task 3: Contratos y cliente web

**Files:** `packages/contratos/src/descargas/index.ts`, `apps/web/src/modulos/descargas/api.ts`, tests de contratos/API.

- [ ] Escribir tests de nuevos campos/respuestas administrativas.
- [ ] Ejecutar y confirmar rojo.
- [ ] Añadir contratos mínimos para propietario y colección administrativa.
- [ ] Actualizar cliente web con llamadas personal/admin.
- [ ] Ejecutar tests y confirmar verde.
### Task 4: Interfaz intuitiva de Descargas

**Files:** `apps/web/src/modulos/descargas/pagina-descargas.tsx`, `apps/web/src/modulos/descargas/componentes/tarjeta-ejecucion-descarga.tsx`, `apps/web/src/compartido/componentes/ui/icon.tsx`, tests de página.

- [ ] Escribir tests de UI para usuario final y administrador.
- [ ] Ejecutar y confirmar rojo por secciones/iconos ausentes.
- [ ] Añadir iconos de carpeta/descarga/archivo/reloj/usuario y reorganizar la página.
- [ ] Evitar petición al explorador GCS para usuarios no administradores.
- [ ] Mostrar administración por usuario e histórico sin propietario solo a administradores.
- [ ] Ejecutar tests web y confirmar verde.

### Task 5: Verificación integral

- [ ] Ejecutar `bun run typecheck`.
- [ ] Ejecutar `bun run test`.
- [ ] Ejecutar `bun run build`.
- [ ] Revisar `git diff` para detectar cambios accidentales.
- [ ] Verificar migración y arranque sin eliminar la base existente.
- [ ] Documentar resultado y cualquier limitación externa de GCS/IAM.