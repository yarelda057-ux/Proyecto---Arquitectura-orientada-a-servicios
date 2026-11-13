// =============================================================================
// RUTAS DE SERVICIOS (/api/v1/catalogo/servicios)
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const express = require('express');
const router = express.Router();
const ServiciosController = require('../controllers/serviciosController');

// POST /api/v1/catalogo/servicios - Registrar un servicio asociado a una empresa (queda en PENDIENTE)
router.post('/', ServiciosController.registrarServicio);

// GET /api/v1/catalogo/servicios - Consultar servicios aprobados
// Soporta: ?categoria=..., ?q=..., ?ciudad=..., ?tipo_servicio=...
router.get('/', ServiciosController.obtenerServicios);

// GET /api/v1/catalogo/servicios/:id - Detalle de un servicio específico
router.get('/:id', ServiciosController.obtenerServicioPorId);

// PUT /api/v1/catalogo/servicios/:id - Actualizar datos de un servicio (precio, modalidad, etc.)
router.put('/:id', ServiciosController.actualizarServicio);

module.exports = router;
