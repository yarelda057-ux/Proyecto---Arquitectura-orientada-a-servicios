# Integración del inventario con mayoristas

El servicio ahora se ejecuta por separado en el puerto 3001 y persiste en la base mayoristas. Este servidor solo actúa como pasarela HTTP y mantiene el login único.

Mantener abiertos: MongoDB, servicio-de-mayoristas (npm start), server (npm start) y vite-project (npm run dev). Configuración: WHOLESALE_SERVICE_URL y WHOLESALE_INTEGRATION_KEY en .env.

Consultar ../servicio-de-mayoristas/README.md y su openapi.json para el contrato y despliegue autónomo.

Pruebas del consumidor: npm test y node tests/wholesaleGateway.integration.js.
