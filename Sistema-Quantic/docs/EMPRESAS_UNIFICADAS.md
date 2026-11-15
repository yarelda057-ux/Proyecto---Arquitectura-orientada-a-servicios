# Registro único de empresas

Servicios adicionales es el registro de empresas por RUC. Una empresa puede ofrecer servicios, proveer equipos o realizar ambas actividades. El administrador revisa su solicitud y gestiona las actividades y credenciales desde **Servicios adicionales → Gestión de empresas**.

| Empresa aprobada | Publicar servicios | Cargar y confirmar Excel |
| --- | --- | --- |
| Servicios | Sí | No |
| Equipos | No | Sí |
| Ambas actividades | Sí | Sí |
| Pendiente, rechazada o inactiva | No | No |

La aprobación de la empresa no elimina la revisión de sus ofertas. Una empresa puede pausar ofertas propias o enviarlas a revisión; solo el administrador puede aprobarlas.

## Aplicar la actualización

La configuración local de esta copia ya se actualizó sin cambiar las contraseñas de las bases. En otra copia con los `.env` existentes, ejecutar una vez:

```powershell
node scripts/configurar-empresas.cjs
```

Para una instalación nueva, `scripts/configurar-local.cjs` también prepara las claves de empresas. Las claves no se muestran ni se publican en el navegador.

Reiniciar desde la terminal que inició el entorno con Ctrl+C y luego:

```powershell
node scripts/iniciar-prueba-local.cjs
```

El arranque reutiliza la base MySQL registrada en `tmp/prueba-local/ultima-prueba.json`; no ejecuta nuevamente las semillas sobre una base existente. Si esa referencia está corrupta o la base fue eliminada, se detiene para revisión. MongoDB de prueba y SQLite también se conservan.

Servicios adicionales agrega al iniciar las columnas `ofrece_servicios` y `provee_equipos` si faltan. Necesita permiso ALTER sobre su base. Las empresas antiguas del catálogo conservan servicios habilitados y equipos deshabilitados hasta revisión del administrador. No se ejecutó una migración sobre la base en uso durante la edición del código.

## Empresas nuevas

1. En **Inscribir Empresa**, seleccionar servicios, equipos o ambas actividades. El RUC debe ser único.
2. El administrador revisa y aprueba la solicitud desde Gestión de empresas.
3. Seleccionar la empresa, revisar sus actividades y guardar los cambios.
4. Crear su acceso con correo y contraseña de 15 caracteres como mínimo (máximo 72 bytes). Usar un correo de empresa distinto de las cuentas internas del inventario.
5. La empresa inicia sesión desde el login principal. Las empresas de servicios acceden a Servicios adicionales; las de equipos también ven la carga Excel. Las empresas mixtas disponen de ambas opciones.

## Proveedores existentes

**Importar proveedores existentes** consulta el servicio de stock por API. Importa empresas con RUC válido como solicitudes pendientes y no duplica los RUC ya registrados. No cambia sus IDs MAY, contraseñas ni lotes anteriores.

Revisar y aprobar cada empresa, confirmando si provee equipos. Los proveedores ya identificados con el mismo RUC conservan sus accesos. No crear otro acceso si ya existe; usar la opción explícita de cambio de contraseña cuando corresponda.

Para un proveedor sin RUC: registrar y aprobar la empresa, seleccionarla en Gestión de empresas y utilizar **Vincular un proveedor existente sin RUC** con su ID MAY. Se conserva su historial. Los RUC duplicados o que ya corresponden a otra empresa se rechazan y requieren revisión; no se fusionan registros automáticamente.

El antiguo menú Registro se retiró y `/Suppliers` redirige a Servicios adicionales. Las antiguas rutas de alta de proveedores y credenciales responden 410. No se borran empresas ni sus stocks.

## Contratos e independencia

- Servicios adicionales mantiene el registro maestro en MySQL.
- Stock mantiene en MongoDB sus identidades, sesiones, proyección del proveedor, lotes y productos. Consulta la aprobación y las actividades por API usando el RUC; no lee MySQL directamente.
- Cada carga, confirmación y ajuste de stock consulta los permisos actuales. También se valida la empresa en cada solicitud autenticada como proveedor. La indisponibilidad del registro impide conceder permisos; nunca se autoriza stock desde datos de demostración en memoria.
- El inventario entrega al iframe un token de 60 segundos, con audiencia exclusiva para el catálogo. Se renueva mientras la sesión principal siga vigente. `postMessage` valida el origen y la ventana emisora. El token se mantiene en memoria, no en URLs ni almacenamiento local.
- Las operaciones privadas del catálogo validan administrador o propiedad de la empresa. Conocer un RUC ya no permite modificar sus datos. La revocación de la sesión principal puede tardar hasta 60 segundos en invalidar el último token del catálogo; la inactivación de la empresa se consulta al operar.
- La API REST de consulta existente por ESB se conserva. Las operaciones directas del portal tienen autorización, pero todavía no incluyen entrega de eventos a S1; esta actualización no implica cumplimiento total del PDF.

Configuración: `COMPANY_INTEGRATION_KEY` coincide en inventario, stock y Servicios adicionales. `WHOLESALE_INTEGRATION_KEY` del catálogo coincide con `INTEGRATION_KEY` de stock. `COMPANY_SERVICE_URL`, `WHOLESALE_SERVICE_URL` y `VITE_ADDITIONAL_SERVICES_URL` permiten ubicar cada servicio. `PORTAL_ORIGINS` permite los orígenes exactos del frontend; para HTTPS o acceso por otra IP hay que configurarlos explícitamente. La vista independiente sigue permitiendo consulta e inscripción pública; para gestionar se entra desde la sesión del inventario.

## Verificación

```powershell
node --test srv-servicios-adicionales/tests/*.test.cjs
node --test servicio-de-mayoristas/tests/*.test.js
```

Las pruebas cubren firmas, expiración, audiencia, propiedad de empresas, revisión, actividades, bloqueo de cargas/confirmaciones/ajustes por API directa, caída del registro, reutilización del ID del proveedor y protección de cuentas al cambiar contraseñas. Las pruebas de rutas usan Express sin abrir puertos y repositorios de prueba o sustitutos; no sustituyen la validación final contra MySQL y MongoDB tras el reinicio.
