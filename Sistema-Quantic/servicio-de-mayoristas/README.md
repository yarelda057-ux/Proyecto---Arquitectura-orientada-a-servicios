# Servicio de Gestión de Stock de Mayoristas

API autónoma Node.js/Express en puerto 3001, MongoDB propio (base mayoristas), dependencias, usuarios, sesiones, configuración y pruebas propias. Copia esta carpeta a otro proyecto: no requiere server, React ni el inventario Quantic para arrancar.

## Inicio independiente
1. Instalar Node.js 22+ y tener MongoDB disponible.
2. Ejecutar npm ci en esta carpeta.
3. Copiar .env.example a .env. Configurar MONGODB_URI y un JWT_SECRET aleatorio de al menos 32 bytes. No reutilizar secretos.
4. Ejecutar npm run create-admin para crear el administrador del servicio.
5. Ejecutar npm start.
6. GET /health/live comprueba el proceso; GET /health/ready comprueba la conexión.

También se incluye Dockerfile. Construir desde esta carpeta; proporcionar las variables con --env-file y una conexión MongoDB accesible desde el contenedor. No se incluyen secretos en la imagen.

## Autenticación y consumo
POST /api/v1/auth/login con JSON {"email":"administrador@empresa.com","password":"contraseña asignada"} devuelve access_token, token_type y expires_in (3600 segundos).
Enviar Authorization: Bearer TOKEN en las operaciones. No necesita cookies ni encabezados exclusivos de Quantic.
GET /api/v1/auth/profile devuelve identidad y vencimiento.
POST /api/v1/auth/logout invalida la sesión.
Administradores registran proveedores y sus cuentas. Mayoristas solo ven y modifican sus propios productos. El cambio de contraseña invalida sesiones anteriores.
Usar HTTPS en despliegues remotos. Guardar los tokens en el servidor consumidor o en memoria; no publicarlos en código.

## API
Contrato machine-readable: openapi.json.
Todas las rutas de stock comienzan con /api/v1/stock:
- GET /proveedores: lista visible.
- POST /proveedores: administrador; nombre, correoContacto, ruc opcional y periodoActualizacionDias opcional.
- PUT /proveedores/{idMayorista}: administrador; actualiza datos y activo.
- POST /proveedores/{idMayorista}/usuarios: administrador; email y password (15 caracteres mínimo, 72 bytes máximo).
- PUT /proveedores/{idMayorista}/usuarios/{idUsuario}/password: administrador; password.
- POST /upload: idMayorista, formato "XLSX", archivoBase64. Cabecera Idempotency-Key obligatoria.
- GET /upload/{idLote}/validate: resultado de validación.
- GET /lotes/{idLote}: estado.
- POST /lotes/{idLote}/confirmacion: publica el lote; Idempotency-Key obligatorio, idOperacion opcional.
- GET /products: filtros idMayorista, codigo, nombre, categoria; page y pageSize (máximo 100).
- GET /categories: categorías y sumas.
- PUT /products/{idProducto}: idMayorista, stockNuevo, motivo y versionEsperada.

XLSX: primera hoja; se busca la primera cabecera completa en las primeras 100 filas: PartNumber, Descripción, QTY, Precio US$. Se omiten cabeceras repetidas y subtítulos combinados. Máximo 10 MB y 10000 productos. Sin macros ni fórmulas. Actualiza productos incluidos; los omitidos se conservan. Cantidad cero retira existencias.
Errores: 400 validación, 401 sesión, 403 permisos, 404 no encontrado, 409 conflicto, 413 tamaño, 429 límite de login, 500 fallo interno.
Con MongoDB replica set se usan transacciones para publicar productos. MongoDB standalone tiene alternativa sin atomicidad del lote completo; un fallo puede dejar escrituras parciales. Para producción utilizar replica set.

## Integración con el inventario actual
La interfaz está en vite-project y es un consumidor. server/routes/wholesaleStockRoutes.js es una pasarela HTTP: no ejecuta lógica ni accede a las colecciones de mayoristas.
server autentica administradores/operarios y delega sus solicitudes con tokens de 60 segundos. Configurar WHOLESALE_SERVICE_URL y WHOLESALE_INTEGRATION_KEY en server; la segunda debe coincidir con INTEGRATION_KEY del servicio. Esta clave autoriza a la pasarela a actuar como administrador: solo compartir con sistemas de confianza. No es aislamiento multiempresa entre consumidores; para organizaciones independientes desplegar instancias/bases separadas.
Los mayoristas se autentican contra este servicio desde el login único del inventario. Sus sesiones usan una cookie HttpOnly del servidor consumidor.

El proyecto consumidor incluye server/scripts/configure-wholesale.js para preparar la integración local sin imprimir secretos. No forma parte del servicio ni interviene en su arranque autónomo.
Para probar la interfaz, mantener abiertos MongoDB, este servicio (npm start), server (npm start), vite-project (npm run dev); auditoría conserva su proceso adicional.

## Migración
npm run migrate copia proveedores, productos, lotes, versiones y cuentas mayoristas desde SOURCE_MONGODB_URI (por defecto inventario local) hacia MONGODB_URI. Mantiene IDs y hashes de contraseñas. No copia sesiones ni cuentas internas. Solo inserta IDs faltantes; nunca elimina ni sobrescribe datos originales o destino. Detener cargas y cambios de cuenta durante la copia y el cambio de servicio. Tras migrar, usar exclusivamente el nuevo servicio; los datos viejos quedan como respaldo y no se sincronizan.
En otro sistema no ejecutar migración: crear su administrador y proveedores propios.

## Pruebas
npm test: lectura de Excel y validación.
npm run test:integration: inicia la API sin el servidor principal y prueba permisos, cuentas, carga, publicación, aislamiento y contraseñas con una base temporal eliminada al terminar.

## Swagger UI

- Interfaz: http://localhost:3001/docs (`/api-docs` también redirige aquí).
- Contrato local: http://localhost:3001/openapi.json.
- Reiniciar este proceso después de actualizar el código.
- La interfaz carga Swagger UI 5.34.1 desde cdn.jsdelivr.net; el navegador necesita internet. El contrato JSON se sirve localmente.
- Las operaciones mantienen su autenticación y permisos; no se guardan credenciales en el contrato.
- [Autenticación y verificación de todos los servicios](../docs/SWAGGER.md).
