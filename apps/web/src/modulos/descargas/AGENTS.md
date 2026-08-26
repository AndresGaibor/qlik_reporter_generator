# AGENTS.md — Frontend / descargas

Listado, progreso y descarga de partes exportadas.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `componentes/`.

Tests cercanos:
- `apps/web/src/modulos/descargas/componentes/descarga-ejecucion.test.tsx`
- `apps/web/src/modulos/descargas/componentes/tarjeta-ejecucion-descarga.test.tsx`
- `apps/web/src/modulos/descargas/descargador-navegador.test.ts`
- `apps/web/src/modulos/descargas/descargador-secuencial.test.ts`
- `apps/web/src/modulos/descargas/navegacion.test.ts`
- `apps/web/src/modulos/descargas/pagina-descargas.test.tsx`
- `apps/web/src/modulos/descargas/use-descarga-ejecucion-hook.test.tsx`
- `apps/web/src/modulos/descargas/use-descarga-ejecucion.test.tsx`

Imports internos frecuentes detectados:
- `../presentacion-ejecucion`
- `../use-descarga-ejecucion`
- `./api`
- `./descarga-ejecucion`
- `./descargador-navegador`
- `./descargador-secuencial`
- `./pagina-descargas`
- `./presentacion-ejecucion`
- `./rutas`
- `./tarjeta-ejecucion-descarga`
- `./use-descarga-ejecucion`
- `@qlik/contratos/descargas`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Flujo de cambio

Revisa `api.ts` para transporte, `rutas.tsx` para entrada de navegación, páginas para orquestación y `componentes/` para presentación. Si cambia el payload, empieza en `packages/contratos`.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/web/src/modulos/descargas/publico.ts`
- `apps/web/src/modulos/descargas/api.ts`
- `apps/web/src/modulos/descargas/rutas.tsx`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
