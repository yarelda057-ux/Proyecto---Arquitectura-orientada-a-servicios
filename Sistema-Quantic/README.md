# Quantic — Inventario e integración de servicios

Avance académico: inventario, stock de mayoristas, auditoría, notificaciones SOAP y consulta de servicios adicionales REST. El repositorio reúne el código; cada servicio mantiene su proceso, API y base de datos independiente.

## Componentes

| Carpeta | Función | Puerto local | Persistencia |
| --- | --- | --- | --- |
| `vite-project` | Interfaz de inventario y portal de proveedores | 5173 | Consume el backend |
| `server` | Backend del inventario y sesión del usuario | 3000 | MongoDB: inventario |
| `servicio-de-mayoristas` | Proveedores, cuentas de proveedores y stock | 3001 | MongoDB: mayoristas |
| `audit-service` | Auditoría de operaciones | 8001 | MongoDB: quantic_audit |
| `notification-service` | Programaciones y correos de recordatorio SOAP | 8002 | MongoDB: quantic_notifications |
| `integration-esb` | Mediador para notificaciones y consultas adicionales | 8003 | Sin base propia |
| `srv-servicios-adicionales` | Directorio de empresas y servicios REST | 3002 | MySQL: quantic_servicios_db |

Las solicitudes de notificaciones siguen mayoristas → ESB → SOAP. Las consultas adicionales siguen inventario → ESB → REST. Mayoristas y auditoría conservan sus conexiones actuales desde el backend; no todas las integraciones pasan por el ESB.

## Requisitos

- Node.js 22 o posterior compatible con los archivos package-lock.json.
- Python 3.12 o posterior para auditoría.
- MongoDB local en 127.0.0.1:27017.
- MySQL y una herramienta como MySQL Workbench.
- PowerShell y un navegador.

La entrega no incluye credenciales, bases de datos de trabajo, usuarios existentes, node_modules ni entornos Python. El script SQL incluye únicamente los ejemplos de demostración del proveedor de servicios adicionales.

## Primera instalación

Abrir PowerShell en la raíz de esta carpeta. Instalar dependencias:

```powershell
$componentes = 'server','servicio-de-mayoristas','integration-esb','notification-service','srv-servicios-adicionales','vite-project'
foreach ($componente in $componentes) {
    Push-Location $componente
    npm ci
    $resultado = $LASTEXITCODE
    Pop-Location
    if ($resultado -ne 0) { throw "Falló la instalación en $componente" }
}
```

Preparar Python desde la raíz:

```powershell
py -3 -m venv audit-service/.venv
audit-service/.venv/Scripts/python.exe -m pip install -r audit-service/requirements.txt
```

El Python elegido debe ser 3.12 o posterior. Consultar las instalaciones disponibles con `py --list` si fuera necesario.

Generar la configuración local una sola vez:

```powershell
node scripts/configurar-local.cjs
```

Este comando crea los siete `.env` y `audit-service/clients.local.json`, con claves aleatorias y pares de integración coherentes. No imprime claves ni modifica bases de datos. Se detiene si ya existe alguno de esos archivos. No ejecutar además los configuradores antiguos de auditoría o mayoristas: el configurador raíz prepara esas conexiones.

Abrir `srv-servicios-adicionales/.env` y completar el usuario y contraseña propios de MySQL. En MySQL Workbench ejecutar `srv-servicios-adicionales/database/schema.sql` para crear la base, tablas y ejemplos. El puerto HTTP de ese servicio debe ser **3002**, porque 3000 corresponde al inventario.

Iniciar MongoDB. Crear el administrador del inventario:

```powershell
cd server
npm run create-admin
cd ..
```

El comando pide correo y contraseña de al menos 15 caracteres. Esta cuenta permite entrar al inventario y administrar proveedores mediante la integración existente. Las cuentas del otro equipo no vienen en el repositorio. No ejecutar migraciones para una instalación nueva sin datos previos.

## Iniciar el proyecto

Mantener MongoDB y MySQL activos. Abrir una terminal por componente y ejecutar desde la carpeta indicada:

| Carpeta de la terminal | Comando |
| --- | --- |
| `audit-service` | `.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8001 --no-access-log` |
| `notification-service` | `npm start` |
| `srv-servicios-adicionales` | `npm start` |
| `integration-esb` | `npm start` |
| `servicio-de-mayoristas` | `npm start` |
| `server` | `npm start` |
| `vite-project` | `npm run dev` |

Abrir http://localhost:5173 y usar la cuenta creada. El portal independiente de servicios adicionales está en http://localhost:3002.

Los servicios usan dotenv desde su carpeta de trabajo: ejecutar los comandos desde las carpetas de la tabla. Si se modifica un `.env`, reiniciar el proceso correspondiente. No ejecutar a la vez copias antiguas y nuevas de un servicio en el mismo puerto.

## Verificaciones rápidas

- Auditoría: http://127.0.0.1:8001/health/ready
- Notificaciones: http://127.0.0.1:8002/health/ready y http://127.0.0.1:8002/soap/notifications?wsdl
- ESB: http://127.0.0.1:8003/health/live
- Servicios adicionales: http://127.0.0.1:3002/api/v1/salud; debe indicar `CONECTADO`. `MODO_DEMO_MEMORIA` significa que los cambios no se guardan en MySQL.
- Inventario: http://127.0.0.1:3000/api/health

Administradores, operadores y proveedores pueden abrir **Servicios adicionales**. Las consultas permiten buscar empresas, servicios, detalles y contactos. El registro y la aprobación de empresas siguen en el portal independiente.

## Correos

La configuración generada utiliza `MAIL_MODE=console`, para desarrollar sin enviar correos. Para SMTP real, completar en `notification-service/.env` los campos SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD y MAIL_FROM, y cambiar MAIL_MODE a smtp. Las contraseñas de aplicación y claves pertenecen a cada instalación; no subirlas al repositorio.

Desde `notification-service`, este comando envía tres correos reales al destinatario indicado y usa una base temporal de prueba:

```powershell
node scripts/smtp-reminders-test.js --to "tu-correo@example.com"
```

La variante `node scripts/smtp-reminders-test.js --console` no envía correos. Las limitaciones pendientes de los recordatorios están documentadas en `PENDIENTES.md`.

## Pruebas disponibles

| Carpeta | Comando | Observación |
| --- | --- | --- |
| `server` | `node tests/additionalServices.integration.js` | Servidores temporales; sin escrituras en bases de datos |
| `integration-esb` | `npm test` | Contrato SOAP y errores del cliente |
| `notification-service` | `npm test` | Reglas de fechas y textos |
| `notification-service` | `npm run test:smoke` | Requiere MongoDB; crea y elimina una base temporal |
| `vite-project` | `npm run build` | Compilación de la interfaz |

Otros contratos y pruebas están descritos en el README de cada componente.

## Trabajo en equipo

Cada integrante debe generar su propia configuración local. Antes de subir cambios, revisar `git status` para comprobar que solo se incluyen código, plantillas y documentación. Usar ramas para cada tarea y conservar los package-lock.json. Los `.env` se comparten mediante configuración local, no mediante commits.

Ver `INTEGRACION_SERVICIOS_ADICIONALES.md` para los endpoints y `PENDIENTES.md` para las limitaciones del avance.
