# Mediador ESB de Quantic

Mediador académico Node.js que recibe JSON del servicio de mayoristas y lo traduce al contrato SOAP del servicio de notificaciones. Implementa autenticación entre servicios, validación básica, correlación, timeout y normalización de errores. No sustituye a un ESB comercial ni incorpora aún consola de administración, alta disponibilidad o almacenamiento propio.

## Configuración

1. Copia `.env.example` como `.env` y configura dos claves distintas de al menos 32 bytes:
   - `ESB_API_KEY`: debe coincidir con `INTEGRATION_ESB_KEY` del `.env` del servicio de mayoristas.
   - `NOTIFICATION_SERVICE_KEY`: debe coincidir con el token del consumidor `esb` en `SOAP_CLIENT_KEYS_JSON` del `.env` del servicio SOAP.
2. `NOTIFICATION_SERVICE_URL` debe apuntar al proveedor SOAP en `127.0.0.1:8002`.
3. Para el proveedor SOAP existente, agrega el consumidor `esb` y un token distinto a los tokens de otros sistemas. No compartas ni publiques archivos `.env`.

## Ejecutar en desarrollo

```powershell
cd "C:\Users\yarel\OneDrive\Escritorio\Ciclo 10\Arquitectura orientada a objetos\Proyecto-actualizado\Proyecto\STOCK CODE\integration-esb"
npm install
npm start
```

Escucha en `http://127.0.0.1:8003`. Comprueba `/health/live`. Operaciones autenticadas: `POST /v1/notifications/register`, `/update`, `/catalogUpdated`, `/cancel` y `/get`, con encabezado `X-ESB-Key`.

## Flujo integrado

El servicio de mayoristas persiste eventos en `NotificationOutbox`. Su worker procesa un evento por vez y reintenta errores temporales con espera exponencial hasta una hora. Un proveedor nuevo recibe una programación con fecha base igual a su última carga procesada o, si no tiene, su fecha de registro. Cada lote confirmado genera un evento idempotente `catalog:<batchId>` con el `processedAt` guardado. La desactivación produce cancelación. La cola no detiene el alta o la actualización del inventario.

El administrador puede revisar estados y editar el mensaje adicional desde el módulo **Notificaciones** del frontend. Un mensaje nuevo se envía al proveedor SOAP cuando el worker sincroniza la programación.
