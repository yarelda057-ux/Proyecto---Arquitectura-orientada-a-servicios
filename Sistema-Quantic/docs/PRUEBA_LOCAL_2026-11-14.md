# Prueba local — 14 de noviembre de 2026

## Resultado

**No se pudo validar el sistema completo sin errores.** Se generaron las configuraciones locales, arrancó S4 y pasaron las 27 pruebas disponibles sin conexiones de red. El resto del arranque está bloqueado por dependencias incompletas y restricciones de conexión del entorno de ejecución.

## Acciones realizadas

- Se ejecutó `node scripts/configurar-local.cjs`: creó ocho `.env` y el registro privado de clientes de auditoría. No sobrescribió configuraciones previas ni imprimió secretos.
- Se comprobó que están instalados Node.js, Python 3.14.6, MongoDB 8.3.8 y MySQL 8.0.46. Que el ejecutable exista no demuestra que el servidor de base de datos esté activo.
- Se inició `reports-service` mediante `npm start`. Emitió el mensaje de escucha en el puerto 8004 y creó su SQLite propia. No se pudo verificar su endpoint por HTTP desde este entorno.
- Se intentó iniciar los demás componentes con procesos temporales de diagnóstico. No se dejaron como servicios activos aquellos que fallaron o quedaron esperando conexiones.
- Se reintentó instalar dependencias del backend mediante `npm ci`; npm terminó con `Exit handler never called!`. La instalación sigue incompleta.
- Se comprobó la conexión real de Mongoose: `MongooseServerSelectionError`, con causa `EACCES`.
- Se añadió `scripts/verificar-local.cjs`, un diagnóstico de solo lectura que revisa configuración, dependencias, puertos, soporte de transacciones de MongoDB y endpoints de salud, sin mostrar contraseñas.

## Pruebas ejecutadas

| Prueba | Resultado |
| --- | --- |
| S4: contratos, cálculos, filtros, autorización y SQLite | 19/19 aprobadas |
| S2: importación y presentación de Excel | 5/5 aprobadas |
| S3: selección y textos de recordatorios | 3/3 aprobadas |
| Total | **27/27 aprobadas** |

Estas pruebas no acreditan la integración por HTTP entre servicios, la confirmación transaccional contra MongoDB real, la persistencia de MySQL, el login en el navegador o la entrega SMTP.

## Resultado de arranque

| Componente | Resultado observado |
| --- | --- |
| Reportes | Proceso iniciado en puerto 8004; HTTP no verificable por EACCES |
| Inventario | Arranque falló por dependencias ausentes; instalación posterior incompleta |
| Mayoristas | Esperó conexión; diagnóstico posterior confirmó MongoDB bloqueado por EACCES |
| Auditoría | Python funciona; faltan uvicorn, FastAPI, PyMongo y demás paquetes |
| Notificaciones | Arranque falló por dependencia express ausente |
| ESB | Arranque falló por dependencia express ausente |
| Servicios adicionales | Arranque falló por dependencia dotenv ausente |
| Frontend | No está instalado el ejecutable de Vite |

Todos los intentos de conexión TCP a 127.0.0.1 (27017, 3306, 3000, 3001, 3002, 8001, 8002, 8003, 8004 y 5173) recibieron EACCES. Ese resultado impide determinar desde aquí si los puertos de la computadora anfitriona están abiertos o cerrados. No se intentó eludir esa restricción mediante otra herramienta.

## Continuación reproducible

En una terminal local con acceso a los servidores, desde la raíz del proyecto:

```powershell
node scripts/verificar-local.cjs
```

Completar la instalación de dependencias según README.md, configurar MySQL en su `.env` y habilitar un replica set de MongoDB para S2. No volver a ejecutar el generador de configuración: los `.env` ya existen. Después iniciar los componentes con los comandos del README y repetir el diagnóstico. Los endpoints de salud no sustituyen la prueba funcional posterior de login, carga/validación/confirmación de lote, dashboard, reporte y auditoría.

No se modificaron bases de datos MongoDB/MySQL existentes ni se enviaron correos.
