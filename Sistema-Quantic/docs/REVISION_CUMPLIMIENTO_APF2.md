# Revisión de cumplimiento del APF2 — Sistema Quantic

**Actualización 15/11/2026:** el diagnóstico de S4 de esta revisión histórica queda ampliado por [Reportes, dashboards y categorías automáticas](REPORTES_DASHBOARDS_2026-11-15.md). Ya se implementaron y probaron por HTTP real la actualización durable después de cada carga, snapshots históricos, reintentos por etapa y recuperación de auditoría. También se amplió el dashboard y se incorporaron categorías automáticas. El recuento original y las limitaciones de pruebas que siguen abajo corresponden al 13/11; no representan los resultados actuales de S4. La conformidad integral de los cinco servicios sigue requiriendo cerrar los pendientes de los demás contratos.

Fecha de revisión: 13 de noviembre de 2026 (Lima). Documento contrastado: **AvanceDeProyectoFinal2-Grupo 9 (APF2) (1)(2).pdf**, 53 páginas, versión aportada en esta conversación. Fuente: https://chatgpt.com/library?file_id=libfile_eac289a07fe08191b284b5b4d999c73c&account_id=personal

## Dictamen

**No se cumple TODO el documento.** Al iniciar esta revisión había cuatro servicios y faltaba S4. Se agregó S4 con las cuatro operaciones de la tabla 14, portal administrativo, integración REST mediante ESB y persistencia independiente. Los otros cuatro servicios tienen capacidades útiles, pero sus contratos o procesos todavía difieren del PDF. Tener una carpeta o una ruta no acredita el cumplimiento integral.

La verificación incluye código, contratos, reglas, separación entre servicios y pruebas ejecutables. No es una certificación de capacidad de carga: el PDF no establece concurrencia, peticiones por segundo, SLA o dimensionamiento. No se inventaron métricas de rendimiento ni porcentajes de disponibilidad.

## Recuento de las 24 operaciones

Leyenda: **I** = operación implementada con el comportamiento central del contrato en revisión de código; **P** = existe parte o una capacidad equivalente, con diferencias pendientes; **A** = operación pública ausente. I no equivale a prueba de despliegue completo. Los requisitos transversales se evalúan por separado.

| Servicio | Operaciones del PDF | I | P | A | Resultado integral |
| --- | ---: | ---: | ---: | ---: | --- |
| S1 Control de Accesos y Auditoría | 4 | 0 | 3 | 1 | Parcial; contrato y trazabilidad incompletos |
| S2 Gestión de Stock de Mayoristas | 7 | 2 | 5 | 0 | Parcial; publicación y recuperación requieren más validación |
| S3 Notificaciones | 4 | 0 | 2 | 2 | Parcial; API SOAP especializada, falta contrato REST genérico |
| S4 Reportes y Dashboards de Inventario | 4 | 4 | 0 | 0 | Operaciones agregadas; integración en vivo y automatización poscarga pendientes |
| S5 Consulta de Servicios Adicionales | 5 | 0 | 5 | 0 | Parcial; contratos y control de acceso difieren |
| **Total** | **24** | **6** | **15** | **3** | **No conforme integralmente** |

Antes de los cambios de esta revisión: 2 I, 15 P y 7 A. Después: 6 I, 15 P y 3 A. Esta cuenta mide operaciones; no pondera seguridad ni confiabilidad. Una brecha crítica no desaparece porque otras operaciones estén implementadas.

## S1 — Control de Accesos y Auditoría

Referencia: páginas 19 y 24–25. Evidencia: `audit-service/app/main.py`, `models.py`, `repository.py`; `server/services/auditDelivery.js` y `Middleware/logsMiddleware.js`.

| Operación | Estado | Evidencia y diferencia con el PDF |
| --- | --- | --- |
| registrarEventoAuditoria | P | POST `/v1/events`; registra actor, método, ruta, tiempo y estado HTTP. Idempotencia por sistema/event_id, 201/200 y conflicto 409. El PDF exige `/api/v1/audit/logs`, nombres en español, idOperacion/idLote/resultado y operaciones de negocio. event_id exige UUID; el ejemplo del PDF usa identificador de texto. |
| consultarRegistros | P | GET `/v1/events`, rango temporal y paginación por cursor. El PDF pide page/pageSize y totalLogs. La validación directa responde 422, no el 400 contratado. |
| filtrarActividades | P | Filtros actor_id/method/status_code. Faltan el contrato `/logs/search` y resultado EXITOSO/FALLIDO/PENDIENTE. |
| controlarTrazabilidad | A | Se guarda request_id, pero no hay GET `/api/v1/audit/trace/{idOperacion}` ni consulta que reconstruya una operación. |

Sí existen claves separadas de lectura/escritura, aislamiento por sistema de origen, registros sin edición por API, política de retención y una cola durable en el servidor central. S1 no emite tokens, lo que respeta su delimitación. Un actor puede ser nulo para solicitudes anónimas; esto no equivale al contrato de eventos de negocio que exige identificar usuario o sistema.

Los reintentos de la cola de auditoría no tienen el máximo de tres intentos del diseño. La captura general ocurre después de terminar la respuesta y una falla al insertar en la cola puede perder el evento. Para las nuevas consultas de S4 se agregó inserción esperada en la cola antes de devolver éxito, con parámetros analíticos permitidos, y se diferencia pendiente de entrega de registro confirmado en S1. El contrato general de S1 sigue pendiente de alineación.

## S2 — Gestión de Stock de Mayoristas

Referencia: páginas 20 y 25–26, 31–32, 43–44 y 49–52. Evidencia: `servicio-de-mayoristas/routes/wholesaleStockRoutes.js`, `models/stockBatch.js`, `models/stockVersion.js`, `Middleware/authMiddleware.js` y `server/routes/wholesaleStockRoutes.js`.

| Operación | Estado | Evidencia y diferencia con el PDF |
| --- | --- | --- |
| cargarArchivoExcel | P | Ruta y Base64/XLSX, límite 10 MiB/10000 filas, duplicados y pertenencia implementados. Sin embargo, valida sincrónicamente antes del 202 y responde RECIBIDO aunque ya guardó VALIDADO/RECHAZADO. No existe el procesamiento asíncrono durable especificado. |
| validarInformacion | I | GET `/upload/{idLote}/validate`, errores por fila, control de mayorista, 202 para estados intermedios y 200 para resultado. No modifica existencias. La carga actual no transita realmente por todo el flujo asíncrono. |
| confirmarLote | P | Exige lote VALIDADO, reclama PROCESANDO y recupera resultado de lote procesado. Se corrigió la publicación: stock y resultado del lote se confirman en una misma transacción y se eliminó escritura sin transacción. Falta demostrar recuperación ante caídas/commit incierto y completar orquestación. |
| consultarEstadoLote | I | GET `/lotes/{idLote}`, estado, versión y pertenencia. No existe recuperación automática de un lote atascado en PROCESANDO. |
| actualizarStock | P | Ajusta cantidad por producto y mayorista; ahora versión y cantidad se actualizan transaccionalmente. El control previo de versión y los errores aún difieren del contrato global: se comparan versiones por producto y parte de los conflictos devuelve 400. |
| consultarProductos | P | Consulta y filtros disponibles con paginación. El listado original devuelve `cantidad`, `descripcion` y versión del primer producto; no garantiza una versión global consistente. Se añadió `/snapshot` exclusivamente para resolver el consumo analítico de S4. |
| obtenerStockPorCategoria | P | Agrupa productos y unidades con alcance por mayorista. No valida la categoría contra un catálogo admitido como exige el PDF; un texto desconocido devuelve cero. |

La plantilla exige PartNumber, Descripción, QTY y Precio US$. Precio no es obligatorio en el PDF; el modelo no implementa Serial Number condicional ni características técnicas estructuradas. Categoría es opcional y se reemplaza por “Sin categoría”. Se rechazan fórmulas/macros detectadas y cantidades negativas; las cinco pruebas de Excel existentes pasan.

La nueva lectura `/snapshot` ejecuta lecturas con `readConcern=snapshot`, devuelve versión global y fecha, exige transacciones y no entrega inventario parcial. Bloquea si hay lotes FALLIDO/PROCESANDO pendientes de verificación. **MongoDB standalone ya no puede confirmar ni ajustar stock: devuelve 503.** Se requiere configurar un replica set. No se cambió ninguna base local ni se inicializó un replica set automáticamente.

El servidor central todavía envía las cargas directamente a S2, con timeout de 30 segundos. No se completaron los tres reintentos 1/2/4 segundos ni el estado durable PENDIENTE_VERIFICACION. Las cuentas, sesiones y permisos de mayoristas están en su propio servicio; no comparte base con inventario.

## S3 — Notificaciones

Referencia: páginas 21 y 27, 35 y 47. Evidencia: `notification-service/src/services/scheduleService.js`, `reminderWorker.js`, `reminderPolicy.js`, modelos y WSDL; `integration-esb/src/index.js` y `soapClient.js`.

| Operación | Estado | Evidencia y diferencia con el PDF |
| --- | --- | --- |
| registrarPlazo | P | RegisterSupplierSchedule registra proveedor, periodo y última actualización mediante SOAP. No implementa POST REST `/api/v1/notificaciones/plazos` con sistemaOrigen/tipoRecurso/recursoId/fechaLimite. |
| consultarVencimientos | A | GetSupplierSchedule consulta un proveedor, pero no existe búsqueda REST de plazos por sistema y rango de fechas inclusivo. La búsqueda interna del worker no sustituye esta operación pública. |
| programarRecordatorio | P | Planifica automáticamente hitos 5/3/1 días. No acepta idPlazo, fechaEnvio, destinatarios, asunto y mensaje mediante el contrato del PDF. |
| enviarCorreoElectronico | A | Hay envío interno del worker, pero falta API genérica de aceptación 202 EN_COLA reutilizable por soporte y otros sistemas. |

Tiene proceso, base MongoDB, WSDL y credenciales propios. No es todavía el servicio genérico de mensajería descrito: el modelo depende de proveedor y actualización de catálogo. El identificador de proveedor es global; registrar ConsumerSystem no basta para garantizar aislamiento entre sistemas con el mismo ID.

La selección del worker usa ventanas de dos minutos; un apagado puede perder el aviso aunque la función de política sepa elegir hitos. Los reintentos SMTP tienen backoff pero no límite máximo de intentos. No hay evidencia de una cola genérica de mensajes con estados de entrega ni auditoría en S1 para cada aceptación/entrega/fallo. Hay riesgos pendientes en cancelación concurrente, reinicios y confirmación SMTP incierta. Tres pruebas unitarias de política pasan; eso no demuestra recuperación del worker ni entrega real de correo. No se enviaron correos durante esta revisión.

## S4 — Reportes y Dashboards de Inventario

Referencia: páginas 12, 21–22, 28, 33 y 46. Evidencia: `reports-service/src/*`, `reports-service/openapi.json`, `tests/reports.test.js`, `integration-esb/src/reports.js`, `server/routes/reportsRoutes.js`, `vite-project/src/Routes/Reports.jsx`.

| Operación | Estado | Implementación agregada |
| --- | --- | --- |
| generarReporte | I | POST `/api/v1/inventario/reportes`; stockActual/JSON, filtros y versión obligatoria; respuesta 201 con ID, datos y fechas; guarda reporte en base propia. |
| consultarIndicadores | I | GET `/indicadores`; categoría opcional, total/con stock/sin stock y unidades; vacío explícito; validación estricta. |
| obtenerEstadisticasInventario | I | GET `/estadisticas?agruparPor=categoria`; filtro opcional; grupos y cantidades; rechaza agrupaciones desconocidas. |
| actualizarDashboard | I | PUT `/dashboards/{id}`; valida nombre, indicadores, filtros y versión, guarda configuración y resultado; 404 para ID desconocido. |

Se provisiona DASH-01 por cliente y se incluyen extensiones explícitas para crear dashboards y recuperar reportes históricos. Datos inválidos, duplicados, parciales o con versión distinta no se presentan como vigentes. Los resultados llevan versión y fecha de datos. No hay cargas Excel ni modificaciones del stock desde S4.

Autonomía: proceso propio (8004), paquete sin dependencias externas, base SQLite propia, configuración de clientes y secretos independientes, adaptador HTTP configurable. Reutilización: otro sistema puede consumir el mismo contrato con su propio emisor, scopes y credencial delegada de fuente; no importa código de Quantic. Los resultados guardados están aislados por sistema consumidor. La escala horizontal con múltiples discos SQLite independientes requiere cambiar el adaptador de persistencia; no se afirma que esté resuelta.

El portal de administradores permite elegir indicadores, filtrar por categoría, visualizar cantidades y distribución por categoría, actualizar configuración y descargar JSON. El coordinador pasa por ESB, obtiene versión de S2, la exige en S4 y conserva auditoría pendiente con actor, filtros y resultado. El servicio admite consumo directo autorizado, sin depender del portal.

**Pendientes para conformidad integral:** verificar el flujo real con MongoDB replica set, ESB, IAM y S1; compilar/verificar visualmente el portal en un entorno con dependencias completas; agregar actualización automática del dashboard después de confirmar cada lote, con cola durable de tareas posteriores; probar el caso en que la versión deje de estar disponible antes de ejecutar esa tarea. La actualización manual no sustituye la automatización de la sección 10.

## S5 — Consulta de Servicios Adicionales

Referencia: páginas 22–23, 29–30 y 37. Evidencia: `srv-servicios-adicionales/src/app.js`, controladores, rutas, modelos y `config/db.js`; `server/routes/additionalServicesRoutes.js`.

| Operación | Estado | Evidencia y diferencia con el PDF |
| --- | --- | --- |
| registrarEmpresa | P | Existe la ruta REST, pero requiere más datos y usa otros nombres/estructura de salida. El ejemplo contractual nombre/correo no es directamente compatible. |
| registrarServicio | P | Existe el registro asociado a empresa, pero espera su contrato propio y retorna un envoltorio distinto al idServicio/idEmpresa contratado. |
| consultarEmpresas | P | Lista empresas aprobadas con q/ciudad; no el filtro nombre y la lista directa especificados. |
| consultarServicios | P | q/categoria/ciudad/tipo_servicio; falta el contrato idEmpresa/texto. |
| filtrarResultadosPorCategoria | P | Existe filtro categoria, pero catálogo, estructura de respuesta y validación no coinciden íntegramente con el PDF. |

La responsabilidad informativa y la separación de MySQL son correctas. Sin embargo, registro, modificación, consulta de perfil por RUC y administración de demostración no exigen autenticación real en S5. Proteger el portal consumidor no protege esas rutas directas. El modo demo en memoria puede responder aunque MySQL no esté disponible, por lo que no acredita persistencia ni comportamiento 503 ante caída. Falta validación de los contratos exactos y autorización en el proveedor.

## Requisitos transversales y composición

| Exigencia del documento | Resultado |
| --- | --- |
| Cinco servicios independientes | Hay cinco después de agregar S4; cada uno tiene proceso y persistencia propia. |
| API REST/HTTPS/JSON interna | Parcial: S3 usa SOAP; desarrollo usa HTTP loopback; no se verificó despliegue TLS. |
| Contratos estandarizados y versionados | Parcial: APIs documentadas pero S1/S3/S5 y parte de S2 no coinciden con tablas 8–16. |
| Reutilización sin importar lógica ajena | S4 usa HTTP configurable; S1 admite clientes; S2 es autónomo. S3 sigue acoplado a recordatorios de proveedor y tiene riesgo de IDs entre consumidores. |
| Sin acceso directo a datos de otro servicio | Respetado en la integración nueva; S4 solo consulta interfaces HTTP. |
| ESB como punto de integración para cinco servicios | Parcial: ya enruta S4 y su fuente; carga/confirmación de S2 y S1 siguen directos. |
| IAM valida firma, emisor, audiencia y expiración | Parcial: verificación en S2 y S4; ESB usa clave compartida y no completa por sí mismo el contrato IAM del PDF. |
| Orquestador central con estados durables por etapa | No completo. Hay colas de auditoría/notificación, pero no el estado de proceso integral de la sección 10. |
| Confirmación de stock + auditoría + dashboard + recordatorio | Parcial: falta tarea automática durable S4 y estado STOCK_CONFIRMADO_CON_PENDIENTES. |
| Reportes: S2 → S4 → S1, versión y fecha | Código agregado; pendiente prueba en vivo. Versiones no disponibles producen error explícito. |
| Recordatorios: programación, aceptación, entrega y auditoría | Parcial: worker especializado, falta contrato genérico, estados y auditoría completa. |
| Catálogo: consulta y trazabilidad | Consulta por ESB y auditoría general disponibles; faltan filtros contractuales y trazas por operación. |
| Timeout 5000 ms y tres reintentos 1/2/4 s | No uniforme. Nuevas llamadas analíticas limitadas a 5 s; clientes antiguos usan otros tiempos, y las colas tienen políticas diferentes. |
| Recuperar confirmación incierta antes de repetir | Estado consultable disponible; no está automatizado PENDIENTE_VERIFICACION. |
| Idempotencia, atomicidad y concurrencia | Parcial: claves/huella/lotes disponibles; transacciones corregidas; falta prueba de fallos y recuperación en despliegue real. |
| Registro central de servicios y descubribilidad | Hay documentación por servicio; no se encontró catálogo central de descubrimiento operativo. |
| Protección de secretos en auditoría | Middleware excluye cookies, tokens, cuerpo completo y Excel. S4 agrega solo parámetros analíticos permitidos. |

## Pruebas y límites de la verificación

| Verificación | Resultado observado |
| --- | --- |
| `node --test reports-service/tests/*.test.js` | 19/19 pasan: contratos mediante manejador sin sockets, cálculos, JWT/scopes, dos sistemas consumidores, versiones, fallos de fuente, JSON y persistencia SQLite tras reinicio. |
| `node --test servicio-de-mayoristas/tests/*.test.js` | 5/5 pasan: lectura y presentación Excel. No cubren transacciones MongoDB. |
| `node --test notification-service/src/services/reminderPolicy.test.js` | 3/3 pasan: reglas y textos de hitos. No cubren entrega SMTP ni recuperación. |
| HTTP real de S4 | Intentado; las conexiones a 127.0.0.1 fallaron con EACCES en este entorno. Se conserva modo `REPORTS_HTTP_TESTS=true` para ejecutarlo localmente. |
| Dependencias/compilación completa | Instalación offline de mayoristas completada. Server/ESB/notificaciones/frontend no completaron instalación por EPERM o paquetes no disponibles en caché; no se acredita build del frontend. |
| Sintaxis JavaScript/JSX | Archivos JavaScript modificados comprobados con Node. App.jsx, Nav_P.jsx y Reports.jsx analizados correctamente con Babel parser 7.28.4; esto no sustituye compilación ni inspección visual. |
| Integración con MongoDB/MySQL/SMTP | No ejecutada contra bases reales. No se modificaron datos ni se enviaron mensajes. |
| Git | La lectura de estado falla al intentar acceder al directorio padre; no se realizaron commits ni push. |

## Orden de cierre recomendado

1. Preparar entorno reproducible con MongoDB replica set y dependencias; ejecutar los contratos nuevos por HTTP y el flujo S2/ESB/S4/S1, compilar y revisar el portal.
2. Completar publicación/recuperación de lotes de S2 y tareas posteriores durables, incluyendo S4. Conservar versión, correlación y resultado por etapa.
3. Alinear S1 con rutas, campos, estados y consulta de trazabilidad del PDF, manteniendo compatibilidad con consumidores actuales mediante adaptador versionado.
4. Exponer S3 REST genérico de plazos, vencimientos, recordatorios y correo; resolver aislamiento, duplicados, recuperación y límites de reintentos.
5. Proteger S5 y adaptar nombres, filtros y respuestas al contrato. Deshabilitar fallback demo en el despliegue que se evalúe como persistente.
6. Unificar seguridad, tiempos, reintentos, catálogo de servicios y pruebas de composición. Solo después declarar conformidad total.
