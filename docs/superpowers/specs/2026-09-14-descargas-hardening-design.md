# Descargas Hardening Design

## Objetivo

Cerrar las brechas detectadas en permisos, navegación y metadata de descargas sin cambiar el modelo de seguridad existente: un administrador real puede acceder a todas las ejecuciones de su organización; un usuario final solo a ejecuciones propias o compartidas.

## Diseño

1. **Vista de usuario final efectiva en backend.** El navegador sincroniza el modo de previsualización con una cookie de sesión `qlik_vista_usuario_final=1`. En rutas de descargas, esa cookie solo puede reducir privilegios: `admin + preview` se evalúa como usuario normal. Las descargas directas (ZIP/partes) quedan cubiertas porque el navegador envía cookies también en enlaces.
2. **Historial informativo.** El historial recibe los resúmenes de descargas accesibles, muestra `Ver archivos` únicamente cuando hay acceso y, para administradores reales, muestra metadata de archivos agrupados/registros junto a la ejecución.
3. **Metadata persistida.** `resultados_ejecuciones_reportes` será la fuente primaria para estado del resultado, tamaño, objetos fuente, partes agrupadas y máximo de filas aplicado. `ServicioDescargas` actualiza esta metadata al observar una ejecución completada y al preparar partes normalizadas. Para históricos sin fila persistida se conserva fallback desde `queryPlan`.
4. **Cero registros.** `0` registros produce `0` partes estimadas/persistidas cuando no hay archivos descargables; nunca se fuerza artificialmente a 1.
5. **Ruta canónica.** La URL pública canónica es `/descargas/ejecuciones/$ejecucionId`. `/descargas?ejecucion=...` se mantiene como compatibilidad de entrada, pero nuevas navegaciones usan la ruta canónica.

## Seguridad

- La cookie de preview no concede permisos; solo los reduce.
- Toda lectura por ejecución sigue resolviendo tenant, organización, usuario y rol en backend.
- Las URLs directas de ZIP/partes siguen pasando por `obtenerEjecucionDescarga`.

## Validación

- Tests API para admin real vs admin en preview, persistencia del resultado y cero registros.
- Tests Web para cookie, ruta canónica, historial y modo preview.
- Typecheck/build de API y Web, tests focales y `git diff --check` antes de integrar/desplegar.
