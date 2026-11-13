// =============================================================================
// RUTAS DE EMPRESAS (/api/v1/catalogo/empresas)
// Microservicio: SRV-G5202605 - Quantic Technology S.A.C.
// =============================================================================

const express = require('express');
const router = express.Router();
const EmpresasController = require('../controllers/empresasController');

// POST /api/v1/catalogo/empresas - Registrar una nueva empresa proveedora (queda en PENDIENTE)
router.post('/', EmpresasController.registrarEmpresa);

// GET /api/v1/catalogo/empresas - Consultar empresas verificadas y aprobadas (soporta ?q= y ?ciudad=)
router.get('/', EmpresasController.obtenerEmpresas);

// GET /api/v1/catalogo/empresas/perfil/ruc/:ruc - Acceso privado de empresa por RUC (Portal de Proveedor)
router.get('/perfil/ruc/:ruc', EmpresasController.obtenerPerfilPorRuc);

// GET /api/v1/catalogo/empresas/:id - Detalle de una empresa aprobada
router.get('/:id', EmpresasController.obtenerEmpresaPorId);

// PUT /api/v1/catalogo/empresas/:id - Actualizar datos comerciales de la empresa
router.put('/:id', EmpresasController.actualizarEmpresa);

module.exports = router;
