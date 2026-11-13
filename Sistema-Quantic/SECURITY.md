# Seguridad y operación — Quantic Inventory

Referencia: OWASP Application Security Verification Standard 5.0.0, edición mayo 2025, PDF proporcionado por el usuario. Esta entrega aplica controles concretos; no constituye certificación ni verificación completa de nivel ASVS.

## Controles implementados

| ASVS 5.0.0 | Cambio | Evidencia |
| --- | --- | --- |
| 2.2.1–2.2.3 | Validación en servidor por lista de campos, tipos, límites, estados, ubicación, series únicas y cantidad derivada. Se rechazan operadores MongoDB y asignación de campos adicionales. | Pruebas de validación y CRUD real. |
| 3.3.1–3.3.4 | Cookie HttpOnly, SameSite=Strict, Path=/, Secure y prefijo __Host- en producción. El JWT nunca se devuelve en JSON ni se almacena en localStorage. | Pruebas de cookies y revisión del código. HTTPS debe configurarse en despliegue. |
| 3.4.2, 3.5 | Orígenes CORS exactos; escrituras requieren Origin permitido, cabecera X-Requested-With: QuanticWeb y JSON. Esto cubre login y logout frente a CSRF. | Rechazo de origen ajeno, formulario simple y cabecera ausente. |
| 6.3.1 | Diez solicitudes de login por IP cada 15 minutos; respuesta 429 y Retry-After. | Prueba del limitador. |
| 6.3.8 (parcial) | Mismo mensaje y estado para cuenta inexistente, contraseña incorrecta o usuario inactivo; comparación bcrypt también si la cuenta no existe. | Prueba de respuestas genéricas. Hashes históricos con coste diferente pueden presentar diferencias temporales. |
| 7.2.1, 7.2.4 | Verificación de sesión en backend. La reautenticación genera un JWT nuevo y revoca la sesión anterior del navegador. | Prueba de rotación y rechazo del token anterior. |
| 7.3.2, 7.4.1, 7.4.4 | Máximo absoluto de una hora por defecto; cierre visible y revocación persistente en MongoDB. El contador no renueva el token. | Logout seguido de replay rechazado. Prueba visual de expiración. |
| 8.2.1, 8.2.3 | Registro privado reservado al administrador; cuentas nuevas siempre con rol user. Perfil/rol se consultan en DB; cuentas inexistentes o inactivas se rechazan. | Pruebas 401/403 y creación sin elevación de rol. |
| 9.1.1–9.1.2, 9.2.1, 9.2.3 | JWT firmado, algoritmo HS256 permitido explícitamente, emisor, audiencia, exp, sub y jti; secreto requerido de al menos 32 bytes. | Pruebas de manipulación, expiración, algoritmo y audiencia. |
| 16.2.1, 16.2.5, 16.3 (parcial) | Logs JSON en stdout con fecha UTC, identificador, método, ruta sin query y resultado; sin cuerpos, contraseñas ni cookies. Errores internos no se envían al cliente. | Revisión y pruebas HTTP. |

La autorización del inventario conserva el modelo compartido existente: user y admin pueden leer y modificar equipos y transceptores. No existe separación por organización ni propietario. Solo admin puede crear cuentas. El contador muestra vencimiento absoluto; no se implementó renovación silenciosa.

## Configuración y arranque

1. En `server`, conservar `.env` existente o copiar `.env.example`. Configurar `JWT_SECRET`, `MONGODB_URI`, `CLIENT_ORIGINS` y `SESSION_TTL_SECONDS` (por defecto 3600, entre 60 y 86400). Generar un secreto aleatorio, por ejemplo con `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`, y guardarlo fuera del repositorio.
2. Desde `server`, ejecutar `npm ci` si faltan dependencias y `npm start`.
3. Desde `vite-project`, ejecutar `npm ci` si faltan dependencias y `npm run dev`. Abrir `http://localhost:5173`. El proxy `/api` conecta con `http://127.0.0.1:3000`. `CLIENT_ORIGINS` debe coincidir exactamente con la URL usada en el navegador; no usar comodines.
4. Para crear el primer administrador, ejecutar `npm run create-admin` desde `server`. Solicita correo y contraseña sin mostrarla. No modifica cuentas existentes. En la revisión local no había administradores; las cuentas existentes conservan su acceso al inventario.
5. `POST /api/users/register` permite al administrador crear operadores con correo y contraseña de 15 caracteres como mínimo y hasta 72 bytes (límite de bcrypt). No existe formulario público de registro ni elevación de roles por el cliente.

Al actualizar, las sesiones antiguas necesitan iniciar sesión nuevamente: los nuevos tokens requieren audiencia/emisor y una sesión persistente. La colección sessions elimina documentos vencidos mediante TTL; la autenticación también comprueba expiración sin depender de la demora del proceso TTL.

Los índices únicos `{p_n, marca, state}` en ambos inventarios evitan duplicados incluso con escrituras simultáneas. El inicio espera la creación de índices. Se comprobó que los datos locales no tenían grupos duplicados. Si otra base tiene duplicados, el administrador debe revisarlos antes de crear índices; no se borran ni fusionan automáticamente.

## Producción y límites pendientes

- Servir frontend y `/api` por HTTPS bajo el mismo sitio. Definir NODE_ENV=production, el origen HTTPS exacto y un proxy inverso. No publicar Vite como servidor de producción.
- Las cabeceras de seguridad actuales se aplican a la API. Configurar también CSP, frame-ancestors, nosniff, Referrer-Policy y HSTS en el servidor que entrega el frontend. CSP debe permitir los estilos necesarios para Bootstrap; revisarla en el despliegue real.
- El limitador está en memoria por proceso y se reinicia al reiniciar el servidor. Para varias instancias o un proxy, implementar almacenamiento compartido y configurar explícitamente la cadena de proxies confiables; no habilitar trust proxy global indiscriminadamente.
- Pendientes de un análisis de riesgo ASVS completo: timeout por inactividad (7.3.1), MFA, recuperación/cambio de contraseña, lista de contraseñas comprometidas, administración/revocación de todas las sesiones, separación por organización si aplica y revisión de permisos por operación.
- La política nueva de longitud se aplica a cuentas nuevas. No se cambian contraseñas existentes. Revisar las cuentas antiguas y sus hashes según la política acordada.
- El archivo histórico `server/Middleware/cambios.log` pudo registrar contraseñas con el middleware anterior; el código también contenía una credencial de ejemplo en UserContext, retirada. Revisar y rotar credenciales afectadas, restringir acceso al log y decidir su retención/borrado. No se eliminó el registro histórico sin una decisión de retención.
- Configurar permisos de MongoDB, TLS de base de datos cuando corresponda, backups/restauración, gestión/rotación de secretos y envío/retención de logs con controles de acceso. Las pruebas locales no verifican la infraestructura de producción.
- No se garantiza ausencia total de fallos ni cumplimiento integral ASVS. La auditoría de paquetes es una fotografía de los avisos conocidos por el registro en el momento de ejecución.

## Verificación reproducible

- `npm test` en `server`: ocho pruebas de seguridad, HTTP y sesión; usan dobles de persistencia, sin tocar datos reales.
- `npm run test:integration` en `server`: usa MongoDB real con una base aleatoria `quantic_test_*`; comprueba login, altas/edición/eliminación, duplicados, roles y replay tras logout. Elimina únicamente esa base de prueba al terminar.
- `npm run lint` y `npm run build` en `vite-project`.
- `npm audit --omit=dev` en `server` y `npm audit` en `vite-project`: sin avisos conocidos en esta ejecución.
- Para revisión visual reproducible: detener la API normal y ejecutar `node tests/ui-preview.js` desde `server`, y Vite desde `vite-project`. Usa una base separada `quantic_ui_test_*`, credenciales ficticias impresas en consola y sesiones de 120 segundos. Escribir `stop` o Ctrl+C limpia la base; también se cierra automáticamente a los 15 minutos. No usar este servidor de prueba para datos reales ni desplegarlo. Si el proceso se mata abruptamente, revisar las bases de prueba que pudieron quedar.

La revisión visual cubrió login correcto/incorrecto, cuenta y contador, inventario de equipos, búsqueda vacía, validación de series repetidas, alta con confirmación, presentación móvil y expiración automática.

## Actualización: servicio de auditoría Python

La auditoría del inventario ahora se almacena en el servicio independiente de `audit-service/`, con MongoDB, claves de escritura/lectura por consumidor, registros sin modificación por API, filtros y paginación. El inventario conserva una cola durable de reintentos y expone consultas únicamente a administradores. Se registran también los GET exitosos y la identidad confirmada al cerrar sesión.

Consultar `audit-service/README.md` para el contrato, configuración, retención y límites: la captura tras la respuesta no es transaccional con las operaciones del inventario; una caída antes de persistir la cola puede perder eventos. Los cambios amplían las pruebas a doce pruebas Node y siete pruebas Python, además de integración de ambos servicios. La revisión ASVS integral sigue pendiente.
