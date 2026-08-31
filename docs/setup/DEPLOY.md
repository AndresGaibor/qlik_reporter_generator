# Despliegue en producción

Esta guía fue consolidada para evitar instrucciones duplicadas o históricas.

Usa la referencia canónica: [Levantar Qlik Reportes Creator desde cero](../despliegue/LEVANTAR-DESDE-CERO.md).

Puntos críticos actuales: el repositorio es `AndresGaibor/qlik_reporter_generator`, Nginx vive en el servicio `web`, las migraciones las ejecuta el servicio one-shot `migrate`, y el callback OAuth de producción se deriva de `FRONTEND_URL`.
