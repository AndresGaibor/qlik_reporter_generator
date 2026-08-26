# Agent Navigation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Crear una navegación jerárquica y verificable para que agentes encuentren rápidamente dónde modificar cualquier funcionalidad del monorepo.

**Architecture:** `AGENTS.md` cercanos al código aportan contexto local; `docs/agents/` concentra mapas transversales. Scripts reproducibles derivan navegación e imports desde el filesystem y validan referencias sin acceder a servicios externos.

**Tech Stack:** Markdown, JSON, Python 3 estándar, Bun scripts, TypeScript monorepo.

**Spec:** `docs/superpowers/specs/2026-08-25-agent-navigation-system-design.md`

## Global Constraints

- No modificar lógica de negocio.
- No alterar los cambios sin commit existentes del compilador.
- No hacer pull, merge o rebase.
- No ejecutar consultas BigQuery ni otras operaciones con coste.
- Excluir `.git`, `.worktrees`, `node_modules`, `dist` y fixtures masivos de la cobertura local.

---

### Task 1: Jerarquía AGENTS

**Files:** raíz, workspaces, módulos backend/frontend, contratos y subsistemas complejos del compilador.

**Interfaces:** cada archivo hereda reglas del `AGENTS.md` ancestro y enlaza los mapas centrales en `docs/agents/`.
- [x] Generar `AGENTS.md` raíz global con comandos, arquitectura, reglas y mapa inicial.
- [x] Generar contexto local en límites arquitectónicos y módulos funcionales.
- [x] Documentar especialmente `compilador-vnext` y sus subsistemas.
- [x] Confirmar que no se crean archivos bajo directorios excluidos.

### Task 2: Mapas transversales

**Files:** `docs/agents/*.md`, `docs/agents/NAVIGATION.json`.

**Interfaces:** los mapas apuntan a rutas reales; `CHANGE-MAP.md` conecta intención de cambio con frontend, contrato, backend y tests.

- [x] Crear índice general y mapas de arquitectura, backend, frontend, contratos, compilador, dependencias y mantenimiento.
- [x] Corregir referencias históricas erróneas en la guía de agentes existente.
- [x] Generar `NAVIGATION.json` con áreas, archivos clave, tests e imports internos.

### Task 3: Generadores y verificación

**Files:** `scripts/agents/generate-agent-index.py`, `scripts/agents/check-agent-docs.py`, `package.json`.

**Interfaces:** `bun run agents:index` regenera navegación; `bun run agents:check` valida documentación y ejecuta primero la regeneración.- [x] Implementar generador determinista sin dependencias Python externas.
- [x] Implementar verificador de rutas Markdown y cobertura esperada.
- [x] Añadir scripts Bun de mantenimiento.
- [x] Ejecutar ambos scripts y corregir cualquier fallo.

### Task 4: Verificación final

**Files:** todos los archivos creados/modificados por este plan.

**Interfaces:** no cambia interfaces de runtime.

- [x] Revisar `git diff --check`.
- [x] Ejecutar `bun run agents:check`.
- [x] Ejecutar `bun run typecheck` para demostrar que `package.json` sigue íntegro.
- [x] Comparar `git status` con el estado inicial y confirmar que los archivos de negocio preexistentes no fueron tocados por esta tarea.
- [x] Resumir cobertura, comandos y cualquier limitación restante.

## Resultado de verificación

- `bun run agents:check`: OK, 66 AGENTS.md.
- `bun run typecheck`: OK en contratos, API y web.
- `git diff --check`: OK.
- `bun run test`: 653 pass / 3 fail; los tres fallos están en `compilador-vnext/tipado-bigquery.test.ts`, archivo de trabajo concurrente no modificado por esta tarea.
