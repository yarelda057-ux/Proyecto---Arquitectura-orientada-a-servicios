                                                                                
                                                  
                                                          
                                                                                

const express = require('express');
const router = express.Router();
const ServiciosController = require('../controllers/serviciosController');

                                                                                                      
router.post('/', ServiciosController.registrarServicio);

                                                                 
                                                                   
router.get('/', ServiciosController.obtenerServicios);

                                                                         
router.get('/:id', ServiciosController.obtenerServicioPorId);

                                                                                                 
router.put('/:id', ServiciosController.actualizarServicio);

module.exports = router;
