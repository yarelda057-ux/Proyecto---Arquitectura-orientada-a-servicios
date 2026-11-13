// =============================================================================
// RUTAS DE DEMOSTRACIÓN ADMINISTRATIVA (/api/v1/demo-admin)
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const express = require('express');
const router = express.Router();
const AdminDemoController = require('../controllers/adminDemoController');

// GET /api/v1/demo-admin/solicitudes - Listar todas las solicitudes (pendientes, aprobadas, rechazadas)
router.get('/solicitudes', AdminDemoController.listarSolicitudes);

// PATCH /api/v1/demo-admin/empresas/:id/estado - Aprobar o rechazar empresa
router.patch('/empresas/:id/estado', AdminDemoController.actualizarEstadoEmpresa);

// PATCH /api/v1/demo-admin/servicios/:id/estado - Aprobar o rechazar servicio
router.patch('/servicios/:id/estado', AdminDemoController.actualizarEstadoServicio);

module.exports = router;
