# Microservicio de Consulta de Servicios Adicionales
**Proveedor:** Quantic Technology S.A.C.  
**Identificador Técnico:** SRV-G5202605  
**Dominio:** Comercial  
**Consumidor previsto:** Sistema principal de inventario y componentes de consulta comercial  

---

## 1. Descripción del Servicio
Este microservicio funciona como un **directorio publicitario e informativo centralizado** (catálogo tipo "páginas amarillas" tecnológicas para empresas en el Perú). Permite:
- Consultar empresas proveedoras tecnológicas verificadas y sus servicios complementarios (Soporte técnico, Redes e infraestructura, Ciberseguridad, Consultoría tecnológica).
- Filtrar por categoría, ciudad peruana (Lima, Arequipa, Trujillo, etc.) y modalidad de prestación (Presencial, Remoto, Híbrido).
- Precios referenciales expresados en Soles (`S/ PEN`) o modalidad cotización.
- Solicitar el registro de nuevas empresas y servicios bajo un flujo controlado (**estado inicial PENDIENTE**).
- **Portal de Empresas Proveedoras (Autogestión):** Cada empresa ingresa con su RUC oficial (11 dígitos) para modificar sus datos de contacto, dirección, teléfono/WhatsApp, actualizar el precio o modalidad de sus ofertas y pausar o reactivar servicios.
- **Panel Administrativo Operativo (Demostración):** Permite a los administradores evaluar solicitudes, aprobarlas, rechazarlas o inhabilitar proveedores completos o servicios específicos con un solo clic.

> **Importante:** Este servicio **no realiza pagos, reservas ni contrataciones transaccionales**. Es un directorio comercial informativo y de contacto directo.

---

## 2. Requisitos de Software y Programas Utilizados

Para ejecutar este microservicio en cualquier computadora con Windows, se requiere tener instalados:

| Programa / Herramienta | Versión Recomendada | ¿Para qué se utiliza? | Enlace de Descarga Oficial |
| :--- | :--- | :--- | :--- |
| **Node.js** | v18.0 o superior (LTS) | Entorno de ejecución de JavaScript para el backend y servidor Express. | [nodejs.org](https://nodejs.org/) |
| **MySQL Server** | v8.0 o superior (o XAMPP / WampServer) | Motor de base de datos relacional para la persistencia de empresas y servicios. | [mysql.com](https://dev.mysql.com/downloads/installer/) o [apachefriends.org](https://www.apachefriends.org/) |
| **MySQL Workbench** | v8.0 o superior (o phpMyAdmin) | Herramienta gráfica para importar el script SQL `database/schema.sql`. | Incluido en MySQL Installer |
| **Navegador Web** | Chrome, Edge, Firefox, Brave | Para visualizar la interfaz web del microservicio (`http://localhost:3002`). | - |
| **Editor de Código (Opcional)** | Visual Studio Code | Para revisar o editar el código fuente si se desea. | [code.visualstudio.com](https://code.visualstudio.com/) |

---

## 3. Instrucciones de Instalación y Ejecución Paso a Paso

### Paso 1: Configurar la Base de Datos en MySQL
1. Abra **MySQL Workbench** (o phpMyAdmin si usa XAMPP).
2. Abra el archivo `database/schema.sql` ubicado dentro del proyecto.
3. Ejecute el script completo (ícono del rayo ⚡ en MySQL Workbench).
   - Esto creará automáticamente la base de datos `quantic_servicios_db`, las tablas `empresas` y `servicios`, sus relaciones, claves foráneas y datos de prueba.

### Paso 2: Configurar las Credenciales en `.env`
1. En la carpeta raíz del proyecto, verifique el archivo `.env` (si no existe, copie `.env.example` y renómbrelo a `.env`).
2. Indique su contraseña de MySQL:
   ```env
   PORT=3002
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=tu_contraseña_aqui
   DB_NAME=quantic_servicios_db
   ```
   *(Si usa XAMPP sin contraseña, deje `DB_PASSWORD=` vacío).*

### Paso 3: Iniciar el Microservicio
Tiene dos opciones sencillas:

- **Opción A (Recomendada - 1 Clic):**
  Haga doble clic en el archivo **`iniciar.bat`**.
  *El script instalará automáticamente las dependencias si es la primera vez, iniciará el servidor y abrirá su navegador en `http://localhost:3002`.*

- **Opción B (Por consola de comandos):**
  Abra una terminal en la carpeta del proyecto y ejecute:
  ```bash
  npm install
  npm start
  ```
  Luego abra su navegador en: **`http://localhost:3002`**.

---

## 4. Estructura del Proyecto

```text
srv-servicios-adicionales/
├── database/
│   ├── schema.sql              # Script SQL maestro (Creación de BD, tablas, ENUMs y datos demo)
│   ├── migration.js            # Script utilitario de migración
│   └── seed.js                 # Script opcional para repoblar datos de prueba
├── public/                     # Frontend Web moderno y responsivo
│   ├── css/
│   │   └── styles.css          # Estilos profesionales (Azul noche, blanco, celeste y plateado)
│   ├── js/
│   │   └── app.js              # Lógica de cliente, conexión con API REST y portal de empresas
│   └── index.html              # Directorio comercial, portal de autogestión y panel de control
├── src/
│   ├── config/
│   │   └── db.js               # Conexión con pool de MySQL y modo fallback
│   ├── controllers/
│   │   ├── empresasController.js   # Manejadores de empresas (listar, buscar, perfil RUC, editar)
│   │   ├── serviciosController.js  # Manejadores de servicios (listar, filtrar, buscar, editar)
│   │   └── adminDemoController.js  # Lógica de control administrativo (aprobar, pausar, inhabilitar)
│   ├── models/
│   │   ├── empresaModel.js     # Acceso a datos de empresas en MySQL / memoria
│   │   └── servicioModel.js    # Acceso a datos de servicios en MySQL / memoria
│   ├── routes/
│   │   ├── empresasRoutes.js   # Rutas /api/v1/catalogo/empresas
│   │   ├── serviciosRoutes.js  # Rutas /api/v1/catalogo/servicios
│   │   └── adminDemoRoutes.js  # Rutas /api/v1/demo-admin
│   ├── app.js                  # Configuración de Express, middlewares y rutas
│   └── server.js               # Punto de entrada y arranque del servidor
├── .env                        # Variables de entorno locales
├── .env.example                # Plantilla de variables sin credenciales
├── iniciar.bat                 # Script de arranque automático para Windows
├── package.json                # Dependencias y scripts del proyecto
└── README.md                   # Documentación técnica completa
```

---

## 5. Contrato de la API REST

### Catálogo Público y Consultas
| Método | Endpoint | Descripción | Parámetros de Consulta |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/v1/salud` | Diagnóstico del microservicio y estado de conexión a MySQL | - |
| **GET** | `/api/v1/catalogo/servicios` | Listado de servicios autorizados y activos | `categoria`, `ciudad`, `tipo_servicio`, `q` |
| **GET** | `/api/v1/catalogo/servicios/:id` | Detalle completo de un servicio específico | - |
| **GET** | `/api/v1/catalogo/empresas` | Listado de empresas verificadas y activas | `ciudad`, `q` |
| **GET** | `/api/v1/catalogo/empresas/:id` | Ficha técnica de una empresa y sus servicios | - |

### Solicitudes Públicas de Registro
| Método | Endpoint | Descripción | Estado Inicial |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/catalogo/empresas` | Enviar solicitud de nueva empresa con servicios opcionales | `PENDIENTE` |
| **POST** | `/api/v1/catalogo/servicios` | Registrar nuevo servicio para una empresa existente | `PENDIENTE` |

### Portal de Empresas (Autogestión de Proveedores)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| **GET** | `/api/v1/catalogo/empresas/perfil/ruc/:ruc` | Consulta el perfil comercial y servicios de la empresa por su RUC |
| **PUT** | `/api/v1/catalogo/empresas/:id` | Actualiza datos comerciales (teléfono, ciudad, dirección, web, descripción) |
| **PUT** | `/api/v1/catalogo/servicios/:id` | Actualiza oferta técnica (nombre, categoría, modalidad, precio en S/, descripción) |

### Consola de Administración Operativa
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| **GET** | `/api/v1/demo-admin/solicitudes` | Lista todas las solicitudes registradas (filtro: `?estado=PENDIENTE`) |
| **PATCH** | `/api/v1/demo-admin/empresas/:id/estado` | Modifica estado de empresa (`APROBADO`, `INACTIVO`, `RECHAZADO`, `PENDIENTE`) |
| **PATCH** | `/api/v1/demo-admin/servicios/:id/estado` | Modifica estado de servicio individual (`APROBADO`, `INACTIVO`, `RECHAZADO`) |

---

## 6. Arquitectura e Integración Futura
- **Independencia del Microservicio:** Puede ejecutarse y probarse sin depender de los otros microservicios aún no desarrollados.
- **Integración con Servicio S1 (Control de Accesos y Auditoría):** El acceso al portal de empresas y al panel de administración se integrará posteriormente mediante tokens emitidos por S1. Actualmente se utiliza la identificación por RUC oficial para facilitar la validación funcional.
- **Integración con Sistema de Inventario:** El sistema principal consumirá `GET /api/v1/catalogo/servicios` y `GET /api/v1/catalogo/empresas` mediante llamadas REST HTTP con formato estándar JSON.

## Swagger UI

- Interfaz: http://localhost:3002/docs (`/api-docs` también redirige aquí).
- Contrato local: http://localhost:3002/openapi.json.
- Reiniciar este proceso después de actualizar el código.
- La interfaz carga Swagger UI 5.34.1 desde cdn.jsdelivr.net; el navegador necesita internet. El contrato JSON se sirve localmente.
- Las operaciones mantienen su autenticación y permisos; no se guardan credenciales en el contrato.
- [Autenticación y verificación de todos los servicios](../docs/SWAGGER.md).
