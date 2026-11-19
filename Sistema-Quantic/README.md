# Quantic — Inventario e integración de servicios

Avance académico: inventario, stock de mayoristas, auditoría, notificaciones SOAP y consulta de servicios adicionales REST. El repositorio reúne el código; cada servicio mantiene su proceso, API y base de datos independiente.

## Iniciar todo con doble clic (Windows)

Con la instalacion y los archivos `.env` ya preparados, abrir **INICIAR-QUANTIC.bat** desde la carpeta principal. Ejecuta el arranque local existente: MongoDB de prueba, los siete procesos de backend y la interfaz. MySQL debe estar encendido previamente. Si es la primera ejecucion, la consola solicita crear el administrador; en los siguientes arranques conserva la cuenta y las bases del entorno de prueba.

Al terminar el arranque, abrir http://localhost:5173. Mantener la ventana abierta y detener con **Ctrl+C**. Antes de volver a iniciar, detener la copia anterior. Si hay un error, la ventana permanece abierta para leerlo; los logs estan en `tmp/prueba-local`.

## Reportes y categorías automáticas

Reportes carga los indicadores al entrar, compara disponibilidad y existencias por categoría y mayorista, y muestra los trabajos pendientes. La categoría del Excel es opcional: se detecta por sección o descripción. La actualización posterior a cada carga es durable, con reintentos y auditoría. Consulta [la revisión de S4 del 15/11](docs/REPORTES_DASHBOARDS_2026-11-15.md) para alcance, pruebas y límites. Reinicia con `INICIAR-QUANTIC.bat` para activar los nuevos procesos.

## Documentación Swagger

Las APIs REST publican Swagger UI en `/docs` y su contrato en `/openapi.json`.
Puertos locales: inventario **3000**, mayoristas **3001**, servicios adicionales
**3002**, auditoría **8001**, ESB **8003** y reportes **8004**. Reiniciar los
procesos para cargar las rutas. La interfaz Swagger necesita acceso a internet
para sus recursos visuales. Consultar [docs/SWAGGER.md](docs/SWAGGER.md) para
autenticación, pruebas y configuración de producción. Notificaciones conserva
su WSDL en `http://localhost:8002/soap/notifications?wsdl`.

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
| `reports-service` | Servicio de Reportes y Dashboards de Inventario REST | 8004 | SQLite propia: data/reports.sqlite |

## Revisión frente al PDF y nuevo servicio de reportes

La evaluación requisito por requisito está en [docs/REVISION_CUMPLIMIENTO_APF2.md](docs/REVISION_CUMPLIMIENTO_APF2.md). **El conjunto todavía no cumple íntegramente el PDF.** S4 incorpora las cuatro operaciones de la tabla 14 y una vista de administradores en `/Reports`. Su contrato y configuración independiente están en [reports-service/README.md](reports-service/README.md).

Para S4 se requiere Node.js **22.13 o posterior**. El servicio no requiere instalar paquetes; iniciar con `npm start` desde `reports-service` después de configurar su `.env`. El configurador de instalaciones nuevas ya incluye este servicio. Para configuraciones existentes, seguir el README de S4 sin sobrescribir secretos.

**Cambio de requisito de MongoDB:** confirmación de lotes, ajustes y snapshots analíticos requieren un **replica set**. Se eliminó la escritura sin transacción que permitía cargas parciales en standalone. El stock y el resultado confirmado del lote ahora se guardan en una transacción; sin soporte transaccional se responde 503. Esta revisión no configuró ni migró la base local. El listado antiguo de productos se conserva y el análisis usa la nueva interfaz consistente `/api/v1/stock/snapshot`.

Flujo nuevo: portal → servidor central → ESB → S4; la consulta versionada de S2 también pasa por ESB. S4 no lee MongoDB ni importa código de los demás servicios. Las tareas automáticas posteriores a cada carga siguen pendientes según la revisión.

Las solicitudes de notificaciones siguen mayoristas → ESB → SOAP. Las consultas adicionales siguen inventario → ESB → REST. Mayoristas y auditoría conservan sus conexiones actuales desde el backend; no todas las integraciones pasan por el ESB.

## Requisitos

- Node.js 22.13 o posterior compatible con los archivos package-lock.json.
- Python 3.12 o posterior para auditoría.
- MongoDB local en 127.0.0.1:27017, configurado como replica set para transacciones de stock y lecturas analíticas.
- MySQL y una herramienta como MySQL Workbench.
- PowerShell y un navegador.

La entrega no incluye credenciales, bases de datos de trabajo, usuarios existentes, node_modules ni entornos Python. El script SQL incluye únicamente los ejemplos de demostración del proveedor de servicios adicionales.

## Primera instalación

### Instalación y prueba local guiada

Desde la raíz, ejecutar `node scripts/preparar-prueba.cjs`. Instala dependencias Node/Python, conserva los `.env` existentes, ejecuta las 27 pruebas sin bases de datos y compila el frontend. Si algo falla, se detiene con el error.

Configurar `DB_USER` y `DB_PASSWORD` de MySQL en `srv-servicios-adicionales/.env` y ejecutar `node scripts/iniciar-prueba-local.cjs`. El arranque crea una instancia MongoDB de prueba con replica set en **27018**, una base MySQL nueva `quantic_prueba_<marcaTemporal>` y un archivo SQLite de prueba. No cambia el MongoDB existente en 27017 ni usa su inventario. La cuenta MySQL necesita permiso para crear esa nueva base. Los datos y logs quedan en `tmp/prueba-local`; la base MySQL queda conservada con su nombre en `ultima-prueba.json`.

La primera vez pide crear un administrador exclusivo de prueba. Comprueba puertos libres y salud HTTP de cada componente antes de indicar que el arranque terminó; rechaza el modo demo sin persistencia de MySQL. Mantener la terminal abierta y usar Ctrl+C para detener los procesos iniciados por esta prueba. Abrir `http://localhost:5173`. Las pruebas de login, carga/confirmación de Excel y generación de reportes deben hacerse después: el arranque exitoso por sí solo no certifica esos flujos.

Los scripts están preparados para ejecutarse desde PowerShell local. El entorno del asistente bloquea conexiones a loopback, por lo que aquí se comprobó su sintaxis, no su ejecución completa contra las bases.

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
| `reports-service` | `npm start` |
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

Administradores, operadores y empresas pueden abrir **Servicios adicionales** para consultar el portal completo. El registro unico por RUC, las actividades (servicios/equipos) y la gestion de accesos se realizan alli. Solo las empresas aprobadas para proveer equipos pueden cargar stock. Consulta `docs/EMPRESAS_UNIFICADAS.md` para aplicar la actualizacion y vincular los proveedores existentes sin perder su historial.

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
| `reports-service` | `npm test` | Contratos de S4, cálculos, permisos y persistencia propia |
| `notification-service` | `npm test` | Reglas de fechas y textos |
| `notification-service` | `npm run test:smoke` | Requiere MongoDB; crea y elimina una base temporal |
| `vite-project` | `npm run build` | Compilación de la interfaz |

Otros contratos y pruebas están descritos en el README de cada componente.

## Trabajo en equipo

Cada integrante debe generar su propia configuración local. Antes de subir cambios, revisar `git status` para comprobar que solo se incluyen código, plantillas y documentación. Usar ramas para cada tarea y conservar los package-lock.json. Los `.env` se comparten mediante configuración local, no mediante commits.

Ver `INTEGRACION_SERVICIOS_ADICIONALES.md` para los endpoints y `PENDIENTES.md` para las limitaciones del avance.
