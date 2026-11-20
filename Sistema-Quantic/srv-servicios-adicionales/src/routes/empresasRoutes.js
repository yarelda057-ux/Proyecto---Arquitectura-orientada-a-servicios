                                                                                
                                                
                                                          
                                                                                

const express = require('express');
const router = express.Router();
const EmpresasController = require('../controllers/empresasController');

                                                                                               
router.post('/', EmpresasController.registrarEmpresa);

                                                                                                      
router.get('/', EmpresasController.obtenerEmpresas);

                                                                                                          
router.get('/perfil/ruc/:ruc', EmpresasController.obtenerPerfilPorRuc);

                                                                      
router.get('/:id', EmpresasController.obtenerEmpresaPorId);

                                                                                 
router.put('/:id', EmpresasController.actualizarEmpresa);

module.exports = router;
