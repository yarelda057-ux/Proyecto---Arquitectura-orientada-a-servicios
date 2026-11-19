# Swagger y contratos de los servicios

Cada proceso REST publica su propia documentación. Las direcciones siguientes
corresponden a los puertos del arranque local `INICIAR-QUANTIC.bat`.

| Componente | Swagger UI | Contrato OpenAPI |
| --- | --- | --- |
| Backend del inventario | http://localhost:3000/docs | http://localhost:3000/openapi.json |
| S2 — Stock de Mayoristas | http://localhost:3001/docs | http://localhost:3001/openapi.json |
| S5 — Servicios Adicionales | http://localhost:3002/docs | http://localhost:3002/openapi.json |
| S1 — Accesos y Auditoría | http://localhost:8001/docs | http://localhost:8001/openapi.json |
| ESB | http://localhost:8003/docs | http://localhost:8003/openapi.json |
| S4 — Reportes y Dashboards | http://localhost:8004/docs | http://localhost:8004/openapi.json |

En los cinco procesos Node también se puede abrir `/api-docs`, que redirige a
`/docs`. Cada documentación utiliza el origen desde el que se abrió: cambiar
HOST/PORT no requiere editar el contrato. Si se despliega detrás de un proxy,
publicar estas rutas en la raíz del origen del servicio.

S3 — Notificaciones sigue siendo SOAP. Su WSDL está en
http://localhost:8002/soap/notifications?wsdl y recibe solicitudes en
`POST /soap/notifications`. El ESB documenta sus adaptadores HTTP/JSON a SOAP;
no es un segundo proveedor WSDL. S4 actualmente es REST/JSON.

## Inicio y conexión a internet

Reiniciar los procesos que ya estaban ejecutándose para cargar las nuevas rutas.
No hay paquetes npm nuevos ni cambios de base de datos para esta implementación.
Swagger UI de los procesos Node carga JavaScript y CSS de
`https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.1/`. El navegador necesita
internet o acceso a esa CDN. Si la CDN no carga, la página conserva un enlace al
contrato `/openapi.json`, servido localmente. Auditoría utiliza la interfaz
Swagger que ya proporciona FastAPI, también con recursos externos.

La documentación y los contratos se pueden leer sin autenticación. Las llamadas
a las operaciones conservan la seguridad de cada API. No se incluyen claves,
tokens de trabajo ni contraseñas en los ejemplos. La autorización introducida
en Swagger no se persiste entre recargas y el validador remoto está desactivado.

## Probar operaciones

| API | Autenticación y uso |
| --- | --- |
| Inventario (3000) | Ejecutar `POST /api/users/login` con correo y contraseña. El navegador guarda las cookies HttpOnly y las envía en las llamadas siguientes. No copiar cookies al botón Authorize. Swagger agrega `X-Requested-With: QuanticWeb`; los roles se siguen comprobando. |
| Mayoristas (3001) | Ejecutar `POST /api/v1/auth/login`, copiar `access_token` y pegarlo en Authorize sin el prefijo Bearer. También admite los JWT delegados autorizados de integración. Las rutas marcadas como admin requieren ese rol. |
| Servicios Adicionales (3002) | Las consultas públicas y la solicitud de registro de empresa no necesitan token. Para las operaciones protegidas, obtener `token` con `POST /api/additional-services/portal-session` en 3000 tras iniciar sesión y pegarlo en Authorize de 3002. Caduca en 60 segundos; obtener uno nuevo al vencer. |
| Auditoría (8001) | Authorize recibe una clave de consumidor, no un JWT de usuario. Requiere `events:read` para consultar o `events:write` para registrar; cada clave queda limitada a su origen. |
| Reportes (8004) | Authorize recibe un JWT emitido por un consumidor registrado, con audiencia `reports-api` y los scopes correspondientes. Las operaciones que consultan stock requieren además `X-Stock-Authorization` con su valor completo `Bearer <token>`. El backend 3000 obtiene estas credenciales en su integración normal; no existe un login propio de reportes. |
| ESB (8003) | Introducir la clave `X-ESB-Key` en Authorize. Las rutas de stock/reportes requieren además el Bearer delegado; las de reportes que consultan stock requieren `X-Stock-Authorization`. La clave SOAP del proveedor nunca se introduce en Swagger: la mantiene el ESB. |

En el backend del inventario se aceptan los orígenes exactos
`http://localhost:<PORT>` y `http://127.0.0.1:<PORT>` únicamente fuera de
producción, para probar desde su propia documentación. En producción, agregar
explícitamente el origen HTTPS de la API a `CLIENT_ORIGINS` para habilitar las
escrituras desde Swagger. No se permite un origen arbitrario ni se elimina el
control del encabezado CSRF. Para cookies, usar el mismo hostname al iniciar
sesión y al consultar la documentación.

`Try it out` ejecuta operaciones reales: usar registros de prueba para cargas,
cambios de estado y eliminación de inventario.

## Mantenimiento y comprobación

Los archivos `openapi.json` están dentro de cada servicio y pueden importarse
directamente en herramientas compatibles con OpenAPI. `apiDocs.cjs` es local a
cada servicio Node, sin importaciones a carpetas de otros servicios. Los
contratos del backend y del ESB documentan las rutas efectivamente encaminadas;
no anuncian las rutas del proveedor que esos intermediarios rechazan.

Las operaciones antiguas de creación de proveedores/cuentas que responden 410
están marcadas como retiradas. Los reemplazos se documentan en el servicio de
empresas. La copia OpenAPI de auditoría fue regenerada con sus esquemas de
contexto analítico; su endpoint HTTP continúa generándose desde FastAPI.

Desde la raíz:

```powershell
node --test scripts/swagger.test.cjs
```

Esta prueba valida referencias, parámetros, autenticación documentada, cobertura
de rutas explícitas y respuestas de los manejadores reales para `/docs`,
`/openapi.json`, el inicializador y el alias. También verifica que las APIs
protegidas siguen rechazando solicitudes sin credenciales y que el backend
rechaza escrituras de orígenes no autorizados. No abre puertos, usa bases de datos
ni envía correos. No sustituye una prueba visual en navegador ni una prueba
funcional de las operaciones con datos.
