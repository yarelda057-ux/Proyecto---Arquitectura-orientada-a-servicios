# Servicio de Notificaciones

Proveedor SOAP independiente para programar recordatorios de actualización de catálogos de mayoristas. El inventario y el sistema de catálogos pueden consumir el mismo contrato.

## Inicio local en Windows

Requisitos: Node.js 20 o posterior y MongoDB activo en `127.0.0.1:27017`.

Desde esta carpeta:

```powershell
npm install
Copy-Item .env.example .env
```

En `.env`, configura `SOAP_CLIENT_KEYS_JSON` con un token aleatorio de al menos 32 caracteres para cada consumidor. Por ejemplo, el valor de desarrollo incluye `inventory` y `catalogos`; reemplaza ambos tokens y entrega cada uno solo al backend del sistema correspondiente. El nombre enviado en `ConsumerSystem` debe coincidir con la identidad asociada a ese token. Para una prueba local, `MAIL_MODE=console` registra una vista previa en la terminal y no envía correos. Para enviar correos reales, configura `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y `MAIL_FROM` con los datos de un proveedor SMTP.

Luego inicia el servicio:

```powershell
npm start
```

Para una comprobación SOAP de extremo a extremo (requiere MongoDB local activo), ejecuta `npm run test:smoke`. La prueba crea una base temporal con prefijo `quantic_notifications_smoke_`, verifica las operaciones y la autenticación, y elimina únicamente esa base temporal al finalizar.

- WSDL: `http://127.0.0.1:8002/soap/notifications?wsdl`
- Endpoint SOAP: `http://127.0.0.1:8002/soap/notifications`
- Salud del proceso: `http://127.0.0.1:8002/health/live`
- Disponibilidad de MongoDB: `http://127.0.0.1:8002/health/ready`

El servicio usa la base `quantic_notifications`, independiente de la base de inventario y de la base del servicio de auditoría.

## Operaciones del contrato v1

- `RegisterSupplierSchedule`: crea o actualiza el contacto, el intervalo en días, la última fecha de carga y un mensaje adicional opcional (texto plano, máximo 500 caracteres). Calcula el próximo vencimiento.
- `ReportCatalogUpdate`: el sistema de catálogos llama esta operación después de aceptar una carga; recalcula el siguiente vencimiento.
- `GetSupplierSchedule`: consulta el estado y las fechas de la programación.
- `CancelSupplierSchedule`: desactiva futuros recordatorios.

Las fechas deben usar ISO 8601 con zona horaria. El servicio envía tres recordatorios por ciclo: 5 días, 3 días y 1 día antes del vencimiento. Cada hito se registra por separado para evitar duplicados. El worker reintenta errores temporales de correo con espera exponencial; los reintentos conservan el hito pendiente. Si el servicio no estuvo disponible durante la ventana de un hito, ese aviso se omite y los hitos posteriores siguen activos. La entrega SMTP puede ser de tipo al menos una vez si el proveedor acepta un mensaje pero se pierde la confirmación; por eso los consumidores deben tratar el servicio como una integración externa y no como parte de la misma transacción que la carga del catálogo.

Las solicitudes SOAP POST requieren `Authorization: Bearer <token-del-sistema>`. La descarga del WSDL por GET es pública para que los consumidores puedan generar clientes. Cada token se valida contra la identidad `ConsumerSystem`; las claves solo deben guardarse en los backends consumidores, nunca en el navegador.

El contrato XML está en `contract/notifications.wsdl`. Este servicio no cambia el backend actual ni el servicio de auditoría.
