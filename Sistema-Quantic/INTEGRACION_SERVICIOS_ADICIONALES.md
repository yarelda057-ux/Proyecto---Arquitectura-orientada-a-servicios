# Servicios adicionales: portal completo e integración REST

El módulo `/AdditionalServices` está disponible para cuentas `admin`, `user` y `mayorista`. Muestra el portal original de `srv-servicios-adicionales/public` en un iframe, conservando su HTML, CSS y JavaScript, sin duplicarlos en React.

Incluye las pantallas del proveedor: Explorar Catálogo, Proveedores, Inscribir Empresa, Nuevo Servicio, Portal Empresa y Gestion de empresas. El botón **Abrir en otra pestaña** permite usar el portal a pantalla completa.

## Independencia del servicio

El navegador carga la interfaz desde el proveedor (puerto 3002). Los formularios y consultas de esa interfaz usan su propia API `/api/v1` y su propia persistencia MySQL. No se copian datos a MongoDB ni se envían credenciales de la sesión del inventario al iframe.

La integración REST de consulta sigue disponible para otros consumidores:
backend del inventario (3000) → ESB (8003) → proveedor REST (3002) → MySQL.
Las acciones dentro del iframe usan directamente el proveedor; no pasan por ese flujo ni adquieren automáticamente la auditoría del backend principal.

## Configuración de la interfaz

En `vite-project/.env`, esta variable es opcional:

```dotenv
VITE_ADDITIONAL_SERVICES_URL=http://localhost:3002/
```

Sin valor, se usa el mismo protocolo y nombre de host del navegador con puerto 3002. Esto permite acceder por localhost o por la dirección del equipo. La URL debe ser accesible desde el navegador; en un despliegue HTTPS debe apuntar al portal HTTPS. Si se cambia una variable Vite, reiniciar el servidor de desarrollo o recompilar.

La variable solo contiene una URL pública, nunca claves. El servicio debe permitir la consulta de salud desde el origen del inventario y permitir su inclusión en un iframe. La configuración local ya habilita CORS. Si se despliega bajo un subdirectorio, el proxy también debe resolver las rutas absolutas `/api/v1` usadas por el portal original; se recomienda un origen dedicado.

## Arranque local

1. Ejecutar `node scripts/iniciar-prueba-local.cjs` desde la raíz y completar la creación del administrador si se solicita. Este comando inicia todos los componentes.
2. Esperar los mensajes de disponibilidad y abrir http://localhost:5173/AdditionalServices.
3. También se puede abrir directamente http://localhost:3002/ para ver la misma interfaz.
4. Confirmar que el portal indica MySQL conectado. En modo memoria, la página principal muestra una advertencia de que los cambios no son persistentes.

Si solo se necesita el portal independiente, ejecutar `npm start` desde `srv-servicios-adicionales`, con MySQL configurado y `PORT=3002`. No iniciar otra copia si el script de prueba ya ocupa ese puerto.

## Contrato REST conservado

En `server/.env`:

```dotenv
INTEGRATION_ESB_URL=http://127.0.0.1:8003
INTEGRATION_ESB_KEY=misma_clave_que_ESB_API_KEY_del_ESB
```

En `integration-esb/.env`:

```dotenv
ADDITIONAL_SERVICES_URL=http://127.0.0.1:3002
ADDITIONAL_SERVICES_TIMEOUT_MS=5000
```

El backend expone GET `/api/additional-services/servicios`, `/servicios/:id`, `/empresas` y `/empresas/:id`. Requiere sesión y rol admin, user o mayorista.

El ESB expone las mismas consultas bajo `/v1/additional-services/` y exige `X-ESB-Key`. Solo reenvía filtros admitidos a `/api/v1/catalogo/` del proveedor. Propaga un identificador de correlación. Las consultas realizadas a través del backend se registran con su mecanismo de auditoría existente.

## Registro y acceso unificados

Servicios adicionales es el registro maestro por RUC. Las empresas pueden ofrecer servicios, proveer equipos o ambas actividades. La gestion administrativa y los accesos se realizan desde este portal; el registro duplicado del inventario se retiro.

Las operaciones privadas requieren un token delegado desde la sesion del inventario y verifican el administrador o la propiedad de la empresa. Stock consulta la autorizacion vigente en el catalogo antes de aceptar cargas, confirmaciones y ajustes. Consulta `docs/EMPRESAS_UNIFICADAS.md` para la configuracion, vinculacion de proveedores existentes, limites y pruebas.

## Verificación

Desde `vite-project`, ejecutar `npm run build`.
Desde `server`, `node tests/additionalServices.integration.js` verifica el contrato REST conservado con un proveedor simulado, sin escribir en bases de datos.

Comprobación manual con el servicio activo: abrir las seis pestañas, probar filtros y contactos, verificar formularios, abrir la vista independiente y detener temporalmente el proveedor para comprobar el mensaje de indisponibilidad y el botón Reintentar. No confundir la compilación con una validación de todos los flujos contra MySQL.
