# Pendientes del avance

## Revisión del APF2 y reportes

Ver `docs/REVISION_CUMPLIMIENTO_APF2.md` para el recuento completo de las 24 operaciones y los requisitos transversales. S4 ya tiene sus cuatro operaciones REST, persistencia propia, integración ESB y portal; faltan la prueba en vivo y la actualización automática durable después de confirmar stock. S1, S2, S3 y S5 conservan diferencias contractuales detalladas en la revisión.

Las confirmaciones y ajustes de S2 ahora requieren MongoDB replica set. No utilizar una instancia standalone como prueba de atomicidad: devuelve 503. Verificar transacciones, fallos durante commit y recuperación antes de dar por cerrada la conformidad del servicio.

Este paquete conserva el estado funcional validado del avance; no incorpora las correcciones de notificaciones que se acordó dejar para después.

## Notificaciones

1. Corregir la ventana actual de dos minutos de cada recordatorio: un aviso puede omitirse si el servicio permanece apagado durante ese intervalo.
2. Definir qué aviso recuperar según el tiempo restante y qué hacer con plazos vencidos, evitando enviar juntos mensajes desactualizados.
3. Revisar los reintentos SMTP, sus límites y la conservación de tareas pendientes.
4. Verificar duplicados tras reinicios, caídas y confirmaciones SMTP inciertas. La aceptación SMTP no garantiza llegada a la bandeja del destinatario.
5. Verificar que una carga exitosa descarte avisos pendientes del ciclo anterior y recalcule el plazo.
6. Verificar cancelación/desactivación mientras existen avisos pendientes y posterior reactivación.
7. Verificar recuperación de la cola de sincronización al regresar el ESB y cómo reactivar operaciones que agotaron sus intentos.

Regla actual: avisos a 5, 3 y 1 día antes del vencimiento. El último día se interpreta como el día anterior a la fecha/hora límite. La periodicidad puede configurarse por proveedor; el flujo del proyecto usa 30 días por defecto. La nueva carga confirmada es la referencia para el nuevo ciclo.

Se comprobó envío SMTP de los tres tipos de aviso mediante registros temporales independientes. Esto no equivale a probar la evolución completa de un único proveedor durante un mes ni su recuperación tras una caída.

## Servicios adicionales y entrega

- El portal administrativo del proveedor REST usa identificación por RUC y rutas de demostración sin autenticación. El módulo del inventario solo consulta; agregar autenticación/autorización antes de habilitar públicamente operaciones administrativas del proveedor.
- Verificar la instalación completa en la computadora de otro integrante: Node, Python, MySQL, MongoDB y configuración propia.
- La copia contiene el código de todos los servicios en un único repositorio, sin datos ni cuentas de las bases utilizadas durante el desarrollo.
- Las instrucciones de instalación se encuentran en README.md; comprobar el arranque completo y los permisos de cada rol antes de la entrega final.
