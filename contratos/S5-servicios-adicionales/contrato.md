# S5 — Servicios adicionales

Contrato documental REST/JSON. Dirección local: http://localhost:3002.

Extraído del README del servicio y contrastado con sus rutas. No corresponde a una especificación OpenAPI ni a un contrato WSDL.

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


La identificación por RUC no constituye autenticación. El panel demo no implementa autenticación propia.

