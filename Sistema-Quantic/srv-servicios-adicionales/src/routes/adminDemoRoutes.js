                                                                                
                                                            
                                                          
                                                                                

const express = require('express');
const router = express.Router();
const AdminDemoController = require('../controllers/adminDemoController');

                                                                                                        
router.get('/solicitudes', AdminDemoController.listarSolicitudes);

                                                                            
router.patch('/empresas/:id/estado', AdminDemoController.actualizarEstadoEmpresa);

                                                                              
router.patch('/servicios/:id/estado', AdminDemoController.actualizarEstadoServicio);

module.exports = router;
