# Mantenimiento de documentación para agentes

## Regenerar

`bun run agents:docs`

Genera los `AGENTS.md` curados y `docs/agents/NAVIGATION.json` desde el árbol actual. No escanea `.git`, `.worktrees`, `node_modules` ni `dist`.

## Validar

`bun run agents:check`

Comprueba cobertura esperada, JSON válido y referencias Markdown locales en la documentación para agentes.

## Cuándo actualizar

Actualiza `scripts/agents/generate-agent-docs.py` cuando aparezca un módulo, workspace o subsistema que merezca un límite propio. No copies contexto global en nuevos `AGENTS.md`: añade solo información local.
