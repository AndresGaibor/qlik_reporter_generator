# Pulido final de Configuración

## Objetivo

Refinar `/configuracion` sin cambiar endpoints ni persistencia. La pantalla debe conservar su arquitectura progresiva, reducir duplicaciones y comunicar mejor la sección visible.

## Diseño aprobado

- El resumen superior será compacto cuando todas las secciones estén listas y permitirá expandir el detalle.
- Cuando exista una configuración pendiente o con error, el detalle permanecerá visible para mostrar qué requiere atención.
- La navegación lateral se actualizará automáticamente según la sección visible mediante `IntersectionObserver`, además de responder al hash y a clics.
- OAuth mostrará siempre un icono visible y coherente con el resto del sistema.
- Qlik Cloud mostrará alias humano y host normalizado una sola vez; la URL completa se reservará para una acción explícita.
- La plantilla base mostrará nombre de plantilla y nombre del entorno, sin repetir URL y host.
- General reducirá su altura y mantendrá las acciones avanzadas bajo demanda.
- `Volver a verificar` y `Probar conexión` usarán estilo secundario; el verde sólido se reservará para guardar, autorizar o crear.
- La copia de usuarios será `1 usuario autorizado` o `N usuarios autorizados`.
- Con un solo usuario se conservará una presentación compacta y legible, sin ampliar el alcance a un rediseño del backend.

## Accesibilidad y responsive

- El resumen expandible usará `aria-expanded` y un control con nombre accesible.
- La sección activa de la navegación usará `aria-current="location"`.
- El comportamiento por scroll no dependerá exclusivamente del color.
- Los controles mantendrán foco visible y objetivos táctiles adecuados.

## Pruebas

Se cubrirán: resumen compacto/expandido, activación por intersección, singular/plural de usuarios, normalización del host y ausencia de duplicaciones técnicas. Después se ejecutarán Vitest, Biome, TypeScript y build del monorepo.
