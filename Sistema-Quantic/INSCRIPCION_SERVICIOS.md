# Inscripción de empresas de servicios

El mayorista accede a **Ofrecer mis servicios** desde su menú de inventario. La página explica requisitos y revisión; el botón abre el formulario independiente en el servicio adicional, en /inscribir-empresa.html.

El formulario usa POST /api/v1/catalogo/empresas, mantiene la validación existente de RUC, correo y duplicados y registra solicitudes PENDIENTES. Permite adjuntar un primer servicio opcional. No contiene navegación al panel de aprobación ni aprueba solicitudes automáticamente. La aprobación existente sigue en el portal administrativo.

La dirección pública se configura mediante VITE_ADDITIONAL_SERVICES_URL en vite-project/.env (valor local predeterminado: http://localhost:3002). Reiniciar Vite tras cambiarla. No incluir credenciales. El servicio adicional debe estar encendido y conectado a MySQL para persistencia.

Los accesos del directorio y su nueva página están disponibles en la interfaz de inventario solo al mayorista. No se modificaron los permisos de la API de consulta ni la autenticación del portal adicional; separar el formulario no implementa seguridad nueva para el panel demo existente.

Verificación manual: entrar como admin y comprobar que no aparecen los enlaces; entrar como mayorista, abrir Ofrecer mis servicios y el formulario; enviar un RUC de prueba nuevo y comprobar estado PENDIENTE en administración; repetir el RUC y comprobar rechazo; comprobar que la empresa no aparece públicamente antes de aprobarla.
