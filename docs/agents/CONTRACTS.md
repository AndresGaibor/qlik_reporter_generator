# Contratos compartidos

`packages/contratos` es la frontera tipada entre frontend y API. Sus carpetas reflejan dominios funcionales y `src/index.ts` expone el paquete.

## Al cambiar un contrato

1. Busca todos los imports `@qlik/contratos/...`.
2. Actualiza productor backend y consumidor frontend en el mismo cambio cuando sea breaking.
3. Mantén schemas Zod y tipos inferidos alineados.
4. Ejecuta `bun run typecheck` y los tests del dominio afectado.

No uses contratos para compartir implementación o utilidades específicas de runtime.
