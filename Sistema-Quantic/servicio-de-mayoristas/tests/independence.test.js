import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from './http-memory.cjs';
import Supplier from '../models/supplier.js';
import User from '../models/user.js';
import Session from '../models/session.js';
import { createApp } from '../app.js';
process.env.JWT_SECRET='local-stock-secret-'.repeat(4);
process.env.INTEGRATION_KEY='gateway-key-'.repeat(4);
const app=createApp();
const token=jwt.sign({role:'admin'},process.env.INTEGRATION_KEY,{subject:'0123456789abcdef01234567',issuer:'inventory-gateway',audience:'wholesale-api',expiresIn:60});
test('registers a stock supplier even if S5 is offline',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('Stock must not call S5'));
  t.mock.method(Supplier,'exists',async()=>null);
  t.mock.method(Supplier,'create',async data=>data);
  const r=await request(app,{method:'POST',url:'/api/v1/stock/proveedores',token,body:{nombre:'Empresa propia',ruc:'20601234561',correoContacto:'stock@example.test',periodoActualizacionDias:30}});
  assert.equal(r.status,201);assert.match(r.body.proveedor.idMayorista,/^MAY-/);
});
test('supplier session derives company identity from its own database',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('Stock must not call S5'));
  t.mock.method(Session,'findOne',async()=>({}));
  t.mock.method(User,'findById',()=>({select:async()=>({_id:'0123456789abcdef01234567',email:'stock@example.test',role:'mayorista',supplierId:'MAY-TEST1234'})}));
  t.mock.method(Supplier,'findOne',async()=>({supplierId:'MAY-TEST1234',nombre:'Local',ruc:'20601234561',activo:true}));
  const local=jwt.sign({},process.env.JWT_SECRET,{subject:'0123456789abcdef01234567',jwtid:'local-session',issuer:'wholesale-stock',audience:'wholesale-api',expiresIn:3600});
  const r=await request(app,{url:'/api/v1/auth/profile',token:local});
  assert.equal(r.status,200);assert.equal(r.body.company.nombre,'Local');assert.equal(r.body.company.proveeEquipos,true);
});
test('reset scopes account lookup to the selected supplier and revokes sessions',async t=>{
  let filter,revoked;
  t.mock.method(User,'findOne',async q=>{filter=q;return {_id:'0123456789abcdef01234567',save:async()=>{}};});
  t.mock.method(Session,'deleteMany',async q=>{revoked=q;});
  const r=await request(app,{method:'PUT',url:'/api/v1/stock/proveedores/MAY-TEST1234/usuarios/0123456789abcdef01234567/password',token,body:{password:'strong-new-password-123'}});
  assert.equal(r.status,200);assert.equal(filter.supplierId,'MAY-TEST1234');assert.equal(filter.role,'mayorista');assert.equal(revoked.userId,'0123456789abcdef01234567');
});
test('old company linking endpoint is no longer mounted',async()=>{
  const r=await request(app,{method:'POST',url:'/api/v1/stock/empresas/20601234561/acceso',token,body:{}});assert.equal(r.status,404);
});
