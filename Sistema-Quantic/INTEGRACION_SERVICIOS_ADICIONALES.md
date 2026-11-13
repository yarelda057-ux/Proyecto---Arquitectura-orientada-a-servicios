# Consulta de servicios adicionales

Flujo: navegador → backend del inventario (3000) → ESB (8003) → proveedor REST (3002) → MySQL del proveedor.

El módulo `/AdditionalServices` está disponible para cuentas `admin`, `user` y `mayorista`. Permite buscar servicios por texto, categoría, ciudad y modalidad, consultar empresas por texto y ciudad, y abrir los detalles y contactos. No registra ni aprueba empresas ni copia sus datos a MongoDB.

## Configuración

En `server/.env`:

```env
INTEGRATION_ESB_URL=http://127.0.0.1:8003
INTEGRATION_ESB_KEY=misma_clave_que_ESB_API_KEY_del_ESB
```

En `integration-esb/.env`:

```env
ADDITIONAL_SERVICES_URL=http://127.0.0.1:3002
ADDITIONAL_SERVICES_TIMEOUT_MS=5000
```

Las claves se conservan en los backends. No definir claves con prefijo `VITE_`.

## Arranque local

1. Iniciar MySQL y el proveedor con `npm start` desde `srv-servicios-adicionales`. Usar `PORT=3002` y comprobar que `/api/v1/salud` indica `CONECTADO`.
2. Ejecutar `npm start` desde `integration-esb`.
3. Ejecutar `npm start` desde `server`.
4. Ejecutar `npm run dev` desde `vite-project`.
5. Iniciar sesión en el inventario como administrador, operador o proveedor y abrir **Servicios adicionales**.

Si esos procesos estaban en ejecución al instalar la integración, reiniciar el backend y el ESB. Las variables y puertos deben corresponder a la instalación local.

## Contrato de consumo

El backend expone GET `/api/additional-services/servicios`, `/servicios/:id`, `/empresas` y `/empresas/:id`. Requiere sesión y rol admin, user o mayorista.

El ESB expone las mismas consultas bajo `/v1/additional-services/` y exige `X-ESB-Key`. Solo reenvía filtros admitidos a `/api/v1/catalogo/` del proveedor. Propaga un identificador de correlación. El backend registra las solicitudes mediante su mecanismo de auditoría existente.

La ausencia de resultados se muestra separada de la indisponibilidad. Una respuesta inválida, un error de conexión o un timeout produce un aviso con botón para reintentar. No hay reintentos automáticos ni operaciones de escritura en esta integración.

El portal administrativo original del proveedor sigue siendo una demostración sin autenticación. Esta integración no publica sus rutas administrativas ni cambia la seguridad del proveedor. El consumo es REST/JSON, no SOAP.

## Verificación

Desde `server`, ejecutar `node tests/additionalServices.integration.js`. La prueba usa servidores locales temporales y un proveedor simulado para comprobar filtros, permisos, autenticación, timeouts, recuperación y protección de detalles de empresas inactivas. No crea registros en bases de datos.

Desde `vite-project`, ejecutar `npm run build`.
