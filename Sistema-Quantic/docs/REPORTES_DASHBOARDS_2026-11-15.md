# Reportes, dashboards y categorías automáticas

Revisión del 15 de noviembre de 2026. Referencia: APF2 del Grupo 9, páginas 22, 28 y 31–33, archivo entregado de nuevo el 15/11. Alcance: S4 y su integración con stock, ESB y auditoría; no certifica los contratos de los demás servicios.

## Resultado frente al PDF

| Requisito | Implementación y evidencia |
| --- | --- |
| Generar reporte JSON de stock | POST `/api/v1/inventario/reportes`; probado por HTTP con cuatro productos de prueba y versión confirmada. |
| Indicadores de disponibilidad | Totales, productos con/sin stock y unidades; pruebas de contratos, vacíos y filtros. |
| Estadísticas por categoría | GET `/estadisticas?agruparPor=categoria`, categorías y filtro opcional; también representadas en el portal. |
| Configurar dashboard | PUT `/dashboards/{id}` conserva nombre, indicadores y filtros; probado antes y después de reiniciar SQLite. |
| Fecha y versión de datos | Cada consulta incluye versión, fecha de la fuente y momento del cálculo; el portal usa hora de Perú. |
| Datos validados y alcance autorizado | S2 confirma transaccionalmente; S4 valida integridad y la credencial delegada. Empresa externa no puede consultar el dashboard administrativo. |
| No mostrar datos antiguos como vigentes ante fallos | GET de consulta vigente exige respuesta de S2; los históricos llevan `historico=true`. Pruebas de indisponibilidad y versiones ausentes. |
| S2 → ESB → S4 → S1 | Probado con servicios HTTP reales y persistencia MongoDB, MySQL y SQLite. El portal también envía la carga y confirmación a través del ESB. |
| Actualización después de confirmar | Snapshot y evento de S2 se guardan dentro de la transacción del stock. El coordinador detecta eventos y crea trabajos persistentes por versión. |
| Recuperar fallos sin repetir stock | Etapas separadas para S4 y S1, leases, acuses e idempotencia. Tres reintentos con esperas de 1, 2 y 4 segundos por etapa; después queda pendiente de intervención. Probadas caídas de S4/S1, reinicio del coordinador y nueva carga mientras había una anterior pendiente. |
| Estado de pendientes | El portal muestra `STOCK_CONFIRMADO_CON_PENDIENTES` de forma legible y permite reintentar solo las etapas faltantes. `COMPLETO` exige acuse real de auditoría. |
| Reutilización y autonomía | S4 conserva su API HTTP y SQLite propia, con aislamiento por consumidor. El coordinador consulta S2 y S4 por API; no lee sus bases. |

## Uso

1. Reiniciar el entorno con `INICIAR-QUANTIC.bat` después de detener la ventana anterior con Ctrl+C.
2. Entrar como administrador a **Reportes y dashboards**. Los datos se consultan al entrar y cada 30 segundos mientras la pestaña está visible. Guardar cambios de filtros para reanudar la consulta automática.
3. Consultar disponibilidad con/sin stock, unidades por categoría, stock por mayorista y detalle tabular. Descargar el reporte JSON de la versión mostrada.
4. Revisar **Actualizaciones automáticas**. Si se agotaron los reintentos, recuperar el servicio afectado y pulsar **Reintentar pendientes**. No es necesario volver a subir el Excel.

## Categorías sin agregar columnas obligatorias

Prioridad: categoría explícita opcional → sección reconocida en el Excel → coincidencia clara en descripción → **Sin categoría**. Los encabezados de sección pueden estar combinados o en una fila sin código, cantidad ni precio. Los encabezados desconocidos reinician la sección para no arrastrar una categoría equivocada.

Las reglas distinguen seguridad de red, redes, computadoras, servidores, almacenamiento, energía, accesorios, software/licencias, impresión y videovigilancia. No usan una marca sola como categoría. El servicio registra `categoriaOrigen` y la validación muestra el recuento por categoría antes de confirmar. El portal permite consultar la categoría de cada fila en su vista previa.

Los productos previos sin categoría se clasifican por descripción en las consultas analíticas y la vista previa, sin alterar sus cantidades ni reescribir su registro operativo. Los títulos que el importador anterior descartó no se pueden recuperar desde el registro del producto; se interpretan al volver a cargar el archivo. La columna opcional permite corregir una inferencia cuando sea necesario. No se usa un servicio externo ni se envía el Excel a terceros.

## Pruebas reproducibles

- `node --test reports-service/tests/*.test.js`: 24 pruebas de S4.
- Desde `servicio-de-mayoristas`: `node --test tests/*.test.js`: 17 pruebas, incluyendo cuatro de clasificación.
- Desde `server`: `node --test tests/*.test.js`: 17 pruebas existentes del servidor y regresiones de carga.
- `node scripts/probar-reportes-integracion.cjs`: prueba real con bases y procesos temporales; no toca los registros existentes. Resultado HTTP satisfactorio registrado en `tmp/reports-integration-ad5d27ce2e46/resultado.json`.
- Build y ESLint del frontend revisados. La prueba visual es optativa con `QUANTIC_VISUAL_TESTS=true`. Se intentó, pero Chrome no logró arrancar (Crashpad); no se acredita inspección visual en este entorno. Los resultados funcionales HTTP son independientes de esa limitación.

## Límites explícitos

- Se mide disponibilidad de inventario, no ventas. No se añadieron descuentos automáticos ni estadísticas semanales/mensuales/anuales de ventas.
- Las versiones completas se conservan desde esta actualización; no se inventan snapshots de cargas antiguas. Hasta 100 000 productos y 30 MiB serializados por versión, en documentos de 500 productos. Superar esos límites aborta la publicación sin escritura parcial.
- La conservación de versiones consume espacio. No se eliminan automáticamente versiones necesarias para recuperación; debe definirse retención y archivo para un despliegue de larga duración.
- Las credenciales técnicas y de usuarios siguen siendo distintas. El coordinador tiene un token de lectura de la fuente limitado a snapshots y eventos; el acceso de escritura a S4 está limitado al consumidor configurado.
- La recuperación aquí descrita cubre las etapas analíticas y su auditoría. Los pendientes del contrato completo de notificaciones y otras diferencias del PDF siguen fuera de esta entrega de S4.
