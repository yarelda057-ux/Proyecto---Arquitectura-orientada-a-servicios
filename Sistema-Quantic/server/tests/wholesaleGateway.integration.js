process.env.AUDIT_ENABLED = 'false';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { mongoose as serviceMongo } from '../../servicio-de-mayoristas/dependencies.js';
import { createApp as gatewayApp } from '../app.js';
import { createApp as serviceApp } from '../../servicio-de-mayoristas/app.js';
import User from '../models/user.js';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.INTEGRATION_KEY = process.env.WHOLESALE_INTEGRATION_KEY = randomBytes(48).toString('hex');
process.env.CLIENT_ORIGINS = 'http://localhost:5173';
const suffix = randomBytes(8).toString('hex');
const db = 'gateway_test_' + suffix, serviceDb = 'service_gateway_test_' + suffix;
let service, gateway;
try {
 await mongoose.connect('mongodb://127.0.0.1:27017', { dbName: db });
 await serviceMongo.connect('mongodb://127.0.0.1:27017', { dbName: serviceDb });
 await Promise.all([...Object.values(mongoose.models), ...Object.values(serviceMongo.models)].map(m=>m.init()));
 await User.create({ email:'admin@test.local',password:'admin test long password',role:'admin' });
 service=serviceApp().listen(0,'127.0.0.1');await new Promise(r=>service.once('listening',r));
 process.env.WHOLESALE_SERVICE_URL='http://127.0.0.1:'+service.address().port;
 gateway=gatewayApp().listen(0,'127.0.0.1');await new Promise(r=>gateway.once('listening',r));
 const base='http://127.0.0.1:'+gateway.address().port+'/api';
 let cookie='';
 const request=(path,method='GET',body)=>fetch(base+path,{method,headers:{Origin:'http://localhost:5173','X-Requested-With':'QuanticWeb','Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
 const cookies=response=>response.headers.getSetCookie().map(v=>v.split(';')[0]).filter(v=>!v.endsWith('=')).join('; ');
 let response=await request('/users/login','POST',{email:'admin@test.local',password:'admin test long password'});
 assert.equal(response.status,200);cookie=cookies(response);const adminCookie=cookie;
 response=await request('/v1/stock/proveedores','POST',{nombre:'Gateway supplier',correoContacto:'supplier@test.local'});
 assert.equal(response.status,201);const {proveedor}=await response.json();
 response=await request('/v1/stock/proveedores/'+proveedor.idMayorista+'/usuarios','POST',{email:'supplier@test.local',password:'supplier test long password'});
 assert.equal(response.status,201);const {usuario}=await response.json();
 cookie='';
 response=await request('/users/login','POST',{email:usuario.email,password:'supplier test long password'});
 assert.equal(response.status,200);cookie=cookies(response);const supplierCookie=cookie;
 assert.equal((await request('/users/profile')).status,200);
 assert.equal((await request('/devices/allDevices')).status,403);
 assert.equal((await request('/v1/stock/products')).status,200);
 assert.equal((await request('/v1/stock/upload','POST',{})).status,400);
 cookie=adminCookie;
 assert.equal((await request('/v1/stock/proveedores/'+proveedor.idMayorista+'/usuarios/'+usuario.id+'/password','PUT',{password:'supplier changed long password'})).status,200);
 cookie=supplierCookie;assert.equal((await request('/users/profile')).status,401);
 console.log('PASS: dos bases independientes, pasarela HTTP, login único, permisos y revocación remota.');
} finally {
 for(const server of [gateway,service])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(mongoose.connection.name===db)await mongoose.connection.dropDatabase();
 if(serviceMongo.connection.name===serviceDb)await serviceMongo.connection.dropDatabase();
 await mongoose.disconnect();await serviceMongo.disconnect();
}
