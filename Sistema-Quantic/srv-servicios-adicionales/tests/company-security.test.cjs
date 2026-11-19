const test=require('node:test'),assert=require('node:assert/strict');
const {sign,verify,companyAccess}=require('../src/companySecurity');
const accounts=require('../src/localAccounts'),db=require('../src/config/db');
const key='test-secret-'.repeat(4);
test('only internal portal roles can federate; stock cannot access by matching RUC',()=>{
  const c={sub:'admin-1',iss:'inventory-gateway',aud:'company-api',role:'admin'};
  assert.equal(verify(sign(c,key),key).role,'admin');
  for(const role of ['mayorista','empresa','integration'])assert.throws(()=>verify(sign({...c,role},key),key));
  assert.throws(()=>verify(sign(c,key),key+'wrong'));
  assert.throws(()=>verify(sign(c,key),key,Math.floor(Date.now()/1000)+61));
});
test('pending applicant sees own profile but cannot publish or access another company',async()=>{
  const req={identity:{role:'empresa',companyId:1}}, company={id:1,ruc:'20601234561',estado_verificacion:'PENDIENTE',ofrece_servicios:true};
  assert.equal(await companyAccess(req,company),company);
  await assert.rejects(companyAccess(req,company,{services:true}),{status:403});
  await assert.rejects(companyAccess(req,{...company,id:2}),{status:403});
  await assert.rejects(companyAccess({identity:{role:'mayorista',ruc:company.ruc}},company),{status:403});
});
test('independent passwords, session expiration through logout, reset revocation and ownership',async t=>{
  const rows=new Map();t.mock.method(db,'isMySQLConnected',()=>true);
  t.mock.method(db,'query',async(sql,args)=>{
    if(sql.startsWith('SELECT'))return rows.has(args[0])?[rows.get(args[0])]:[];
    if(sql.startsWith('INSERT'))rows.set(args[0],{email:args[0],empresa_id:args[1],password_hash:args[2]});
    return [];
  });
  await accounts.save(1,'owner@example.test','strong-password-123');
  assert.ok(!rows.get('owner@example.test').password_hash.includes('strong-password'));
  const first=await accounts.login('owner@example.test','strong-password-123');
  assert.equal(accounts.session(first.token).companyId,1);
  await accounts.save(1,'owner@example.test','another-password-123');assert.equal(accounts.session(first.token),null);
  await assert.rejects(accounts.login('owner@example.test','strong-password-123'),{status:401});
  const second=await accounts.login('owner@example.test','another-password-123');accounts.logout(second.token);assert.equal(accounts.session(second.token),null);
  await assert.rejects(accounts.save(2,'owner@example.test','third-password-123'),{status:409});
});
