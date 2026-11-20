# Contratos de los servicios

Esta carpeta reúne las especificaciones disponibles para su revisión académica. Se pueden abrir sin ejecutar el sistema. Para probar solicitudes es necesario iniciar el servicio y configurar sus dependencias y credenciales localmente.

| Servicio | Contrato | Formato | Puerto local |
| --- | --- | --- | --- |
| S1 — Auditoría | [openapi.json](S1-auditoria/openapi.json) | OpenAPI / JSON | 8001 |
| S2 — Stock de mayoristas | [openapi.json](S2-stock-mayoristas/openapi.json) | OpenAPI / JSON | 3001 |
| S3 — Notificaciones | [notifications.wsdl](S3-notificaciones/notifications.wsdl) | WSDL / XML, SOAP | 8002 |
| S4 — Reportes | [openapi.json](S4-reportes/openapi.json) | OpenAPI / JSON | 8004 |
| S5 — Servicios adicionales | [contrato.md](S5-servicios-adicionales/contrato.md) | Documentación REST / JSON | 3002 |

## Consulta y prueba

- Los archivos OpenAPI pueden importarse en Postman para consultar las operaciones descritas.
- El WSDL contiene los tipos XML y operaciones de notificaciones. Con el servicio iniciado también está disponible en http://127.0.0.1:8002/soap/notifications?wsdl.
- Para servicios adicionales, consultar la tabla de endpoints y preparar las solicitudes en Postman. No existe una especificación OpenAPI en el servicio de origen.
- Las direcciones de los contratos son referencias locales y deben ajustarse al entorno de ejecución cuando corresponda. Las credenciales no se incluyen en esta carpeta.

## Origen y mantenimiento

Los archivos formales son copias de audit-service/openapi.json, servicio-de-mayoristas/openapi.json, notification-service/contract/notifications.wsdl y reports-service/openapi.json. El documento de S5 procede de srv-servicios-adicionales/README.md.

La creación de esta carpeta no modifica los contratos originales ni realiza una auditoría completa de su concordancia con todas las rutas actuales. Al modificar un servicio, actualizar su contrato original y renovar la copia de esta carpeta. Por ejemplo, comprobar que las nuevas operaciones auxiliares, como la descarga de plantilla, estén documentadas en el contrato de stock antes de una entrega definitiva.

El backend de inventario y el mediador ESB son componentes de integración; su documentación permanece en sus carpetas respectivas. Esta carpeta organiza los cinco servicios funcionales S1–S5.
