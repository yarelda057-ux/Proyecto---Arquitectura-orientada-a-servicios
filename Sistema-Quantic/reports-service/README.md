# Servicio de Reportes y Dashboards de Inventario

**SRV-G5202604 · versión 1.0.0.** Implementa las cuatro operaciones de la tabla 14 (página 28) del APF2 y la consulta coherente de las páginas 22 y 33. El resultado es JSON; el portal representa los indicadores. No modifica existencias ni accede a bases de datos de otros servicios.

## Arranque independiente

Requiere Node.js >=22.13 con `node:sqlite`. No necesita paquetes npm. Desde esta carpeta:

```powershell
Copy-Item .env.example .env
# Configurar secretos, fuente y clientes autorizados en .env.
npm start
```

Puerto predeterminado: 8004. La base propia `data/reports.sqlite` conserva reportes y configuraciones después de reinicios. Respaldar el archivo mediante las herramientas de SQLite; no copiar una base abierta ignorando su WAL. Para varias réplicas del servicio, sustituir el adaptador de persistencia por una base compartida administrada; no distribuir copias independientes del archivo SQLite.

En una instalación nueva del proyecto, `node scripts/configurar-local.cjs` genera los secretos coherentes para S4, ESB e inventario. No ejecutar este configurador sobre una instalación existente. En una existente, agregar la misma clave aleatoria de al menos 32 bytes en `server/.env:REPORTS_INTEGRATION_KEY` y en `reports-service/.env:REPORTS_CLIENTS_JSON` para el cliente `inventory-gateway`. Copiar la clave ya existente del ESB a `SOURCE_ESB_KEY`. Configurar `REPORTS_SERVICE_URL=http://127.0.0.1:8004` y `WHOLESALE_SERVICE_URL=http://127.0.0.1:3001` en el ESB. Reiniciar los procesos afectados. Mantener `AUDIT_ENABLED=true` en el servidor central.

## Contrato público

Base: `/api/v1/inventario`. `openapi.json` describe los contratos y ejemplos.

| Método y recurso | Entrada | Salida |
| --- | --- | --- |
| POST `/reportes` | `tipo=stockActual`, `formato=JSON`, `filtros`, `versionInventario` | 201; `idReporte`, `datos`, versión y fechas |
| GET `/indicadores` | Categoría opcional; sin cuerpo | 200; total de productos, con/sin stock y unidades |
| GET `/estadisticas` | `agruparPor=categoria`; categoría opcional | 200; grupos, total de productos y unidades |
| PUT `/dashboards/{idDashboard}` | Nombre, indicadores, filtros y versión | 200; indicadores seleccionados, grupos, versión y fechas |

Se provisiona `DASH-01` para cada cliente configurado. Un PUT de un ID desconocido devuelve 404. Como extensiones para administrar el ciclo de vida se incluyen POST `/dashboards`, GET `/dashboards/{id}` y GET `/reportes/{id}`. Las lecturas de recursos guardados llevan `historico=true`: no afirman vigencia. No se admite PDF/Excel ni indicadores de ventas porque no están especificados en el contrato de S4.

Filtros admitidos: `categoria` y, como extensión, `idMayorista`. Los filtros se combinan con igualdad exacta. Agrupación admitida: `categoria`. Indicadores: `totalProductos`, `productosConStock`, `productosSinStock`, `unidadesDisponibles`. Se cuenta cada registro de producto por mayorista; no se deduplica por nombre o Part Number entre proveedores. Los filtros válidos sin coincidencias devuelven ceros/listas vacías y `sinRegistros=true`.

Todos los resultados calculados incluyen `versionInventario`, `actualizadoEn` (marca de la fuente) y `generadoEn` (momento del cálculo). Un cambio de versión devuelve 409 y exige refrescar. S2 conserva las versiones confirmadas desde la incorporación de snapshots históricos. Una versión anterior no conservada se rechaza; no se reconstruye a partir de datos actuales. Nunca reemplaza silenciosamente la versión pedida por otra.

## Autorización e integración en otros sistemas

Cada petición lleva:

- `Authorization: Bearer <JWT HS256>`: `iss` es un cliente configurado, `aud=reports-api`, `sub` identifica al actor, `iat` y `exp` limitan la vigencia a 60 segundos, y `scopes` contiene `reports:read` o `reports:write`. S4 verifica firma, vigencia, emisor, audiencia y permisos. Cada cliente tiene un secreto distinto y sus propios reportes y dashboards.
- `X-Stock-Authorization: Bearer <credencial de la fuente>`: la fuente valida el alcance del actor; S4 no sustituye este token por una cuenta administradora. Esta cabecera es necesaria para cálculos, no para consultar configuraciones históricas. No debe registrarse en logs.
- `X-Correlation-ID`: identificador opcional para enlazar la operación.

Un nuevo sistema registra su propio cliente y scopes en `REPORTS_CLIENTS_JSON`, consume el mismo contrato y proporciona credenciales válidas para su fuente. No necesita importar módulos de Quantic ni conocer MongoDB. `STOCK_SOURCE_URL` puede apuntar a otro proveedor HTTP que cumpla este contrato:

```json
{
  "versionInventario": "INV-106",
  "actualizadoEn": "2026-11-13T12:00:00Z",
  "total": 1,
  "productos": [{ "idProducto": "P-10", "idMayorista": "MAY-25", "nombre": "Switch", "categoria": "redes", "stock": 40 }]
}
```

La fuente debe entregar una imagen completa y consistente, limitada al alcance autorizado. No se aceptan páginas incompletas, duplicados, cantidades negativas, valores no enteros o respuestas sin fecha/versión. Límite del adaptador: 100000 productos y 32 MiB. Los parámetros `versionInventario` solicitan la versión exacta. En producción se exige URL HTTPS; HTTP solo se admite en loopback de desarrollo. TLS entrante requiere terminación HTTPS en el despliegue.

## Integración incluida en Quantic

Portal `/Reports` → servidor central `/api/v1/inventario` → ESB `/v1/reports` → S4. Para generar un reporte o actualizar un dashboard, el coordinador consulta primero S2 a través de `/v1/inventory-source`. S4 vuelve a obtener esa versión a través del ESB y rechaza un cambio concurrente. El servidor central exige rol administrador, conserva los parámetros y el resultado en la cola durable de auditoría antes de responder, y devuelve `auditoria=PENDIENTE_ENTREGA`. Este estado no afirma que S1 ya lo recibió.

S2 incorpora GET `/api/v1/stock/snapshot`, una extensión de lectura consistente. **Requiere MongoDB replica set**, incluso en desarrollo. Se retiró el fallback de confirmación sin transacción: las escrituras de stock y el resultado del lote se confirman juntos. Un MongoDB standalone devuelve 503 en confirmación, ajustes y snapshots; no se degrada a una escritura parcial. No se modificó ni migró ninguna base local. Los lotes antiguos FALLIDO/PROCESANDO bloquean snapshots hasta que un operador verifique su estado: esta entrega no inventa una recuperación de esos datos.

La actualización automática durable está conectada: S2 registra el evento y la imagen completa dentro de la transacción del stock; el coordinador consulta eventos por ESB y conserva una tarea por versión. S4 procesa la versión exacta de forma idempotente y S1 confirma la auditoría. Los reintentos son por etapa (1, 2 y 4 segundos); tras agotarlos el proceso queda pendiente de intervención, visible y recuperable desde el dashboard. Los otros contratos de S1/S2/S3/S5 todavía tienen diferencias, detalladas en `../docs/REVISION_CUMPLIMIENTO_APF2.md`.

## Verificación

```powershell
npm test
# Pruebas HTTP reales, en una máquina que permita sockets:
$env:REPORTS_HTTP_TESTS='true'
npm test
Remove-Item Env:REPORTS_HTTP_TESTS
```

Las pruebas por defecto ejercitan el manejador de solicitudes sin abrir puertos, el dominio, el adaptador HTTP con respuestas controladas y SQLite real con reinicio. El modo HTTP usa exactamente los mismos casos a través de un servidor temporal. Las pruebas con fuente controlada no acreditan la integración en vivo con MongoDB, ESB, IAM y S1.

## Actualización automática y categorías (15/11/2026)

- `POST /api/v1/inventario/actualizaciones`: extensión de S4 para consumidores coordinadores, cuerpo `{idOperacion, versionInventario}`. Solo modifica los dashboards del cliente autenticado. Conserva filtros, nombre e indicadores; el acuse y los resultados se guardan juntos en SQLite. Una entrega atrasada no sobrescribe una versión más reciente.
- `GET /api/v1/inventario/dashboards/{id}?actual=true`: calcula resultados vigentes con la configuración guardada. Devuelve grupos de disponibilidad, comparación por mayorista, clasificación y opciones de filtros. Sin ese parámetro se mantiene la consulta histórica del contrato anterior.
- S2 expone `GET /api/v1/stock/eventos-stock?despues=0` para el coordinador y `GET /api/v1/stock/snapshot?versionInventario=...`. La credencial técnica de fuente tiene acceso solo de lectura a esas dos operaciones.
- El sistema central conserva las tareas en su propia base, colección `analyticsjobs`. `GET /api/v1/inventario/procesos` y `POST /api/v1/inventario/procesos/{version}/reintentar` requieren administrador. `STOCK_CONFIRMADO_CON_PENDIENTES` no significa que haya que volver a subir el Excel. Solo `COMPLETO` acredita también el acuse de S1.
- La carga y confirmación del portal pasan ahora por el ESB. Una confirmación incierta se consulta antes de permitir repetirla.
- No hace falta añadir una columna al Excel. S2 respeta la categoría explícita; luego utiliza títulos de sección reconocibles y, en su ausencia, reglas por descripción. Distingue licencias y accesorios de los equipos. Los casos desconocidos permanecen sin clasificar. Las inferencias no son una garantía de exactitud.
- En el inventario anterior sin categoría se puede inferir desde la descripción al consultar; los títulos descartados por versiones antiguas del importador solo se recuperan al volver a cargar el archivo. Las categorías explícitas se conservan.
- La pantalla carga los indicadores al entrar y consulta cada 30 segundos mientras está visible y no hay cambios sin guardar. Ofrece disponibilidad con/sin stock, unidades por categoría, stock por proveedor, filtros y descarga JSON. No calcula ventas a partir de variaciones de existencias.

### Persistencia y límites

Cada nueva versión conserva un snapshot completo en S2, dividido en documentos de 500 productos, más su manifiesto/evento. El límite es 100 000 productos y 30 MiB de datos serializados por versión; superar el límite rechaza la transacción sin publicar stock parcial. La retención no borra automáticamente versiones: hay que dimensionar almacenamiento y definir una política de archivo antes de operar a gran escala. No se crean eventos retroactivos para cargas previas a esta actualización.

S4 mantiene el adaptador HTTP y SQLite; el coordinador no lee las bases de S2 ni de S4. Otro sistema puede reutilizar S4 con su cliente, su fuente compatible y la misma API. El portal de Quantic es un consumidor.

### Verificación real

Ejecutar desde la raíz: `node scripts/probar-reportes-integracion.cjs`. Requiere MySQL configurado, MongoDB replica set en 27018 y dependencias locales. Crea bases temporales, claves aleatorias y procesos propios en puertos libres; elimina únicamente esas bases al terminar. No envía correos.

Comprueba registro y acceso, carga y confirmación idempotente a través del ESB, categorías, caída de S4, tres reintentos, reinicio del coordinador, recuperación de versiones antiguas, reportes JSON, filtros, permisos, reinicio de SQLite y caída/recuperación de S1 sin duplicados. La prueba visual es optativa: establecer `QUANTIC_VISUAL_TESTS=true` antes de ejecutarlo. En esta revisión Chrome no logró arrancar por un fallo de Crashpad en el entorno; la revisión visual no se considera acreditada. El flujo HTTP y las bases reales sí se verificaron. Logs y resultado quedan en `tmp/reports-integration-<id>`.

Para aplicar en el entorno habitual: detener su ventana con Ctrl+C, abrir `INICIAR-QUANTIC.bat` y recargar el navegador. Se conservan las bases existentes. Esta revisión completa el trabajo de S4 descrito aquí; no certifica los contratos pendientes de otros servicios del PDF.

## Swagger UI

- Interfaz: http://localhost:8004/docs (`/api-docs` también redirige aquí).
- Contrato local: http://localhost:8004/openapi.json.
- Reiniciar este proceso después de actualizar el código.
- La interfaz carga Swagger UI 5.34.1 desde cdn.jsdelivr.net; el navegador necesita internet. El contrato JSON se sirve localmente.
- Las operaciones mantienen su autenticación y permisos; no se guardan credenciales en el contrato.
- [Autenticación y verificación de todos los servicios](../docs/SWAGGER.md).
- Este servicio está implementado como REST/JSON; no publica WSDL.
