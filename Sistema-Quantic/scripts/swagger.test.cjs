const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const folders = ['servicio-de-mayoristas', 'reports-service', 'srv-servicios-adicionales', 'integration-esb', 'server'];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const contract = folder => JSON.parse(read(folder + '/openapi.json'));
const importFile = file => import(pathToFileURL(path.join(root, file)).href);

// Use the real application middleware, without opening ports or databases.
function request(app, url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } });
    socket.remoteAddress = '127.0.0.1';
    const req = new IncomingMessage(socket);
    const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
    Object.assign(req, { method, url, headers: { host: 'localhost:3000', ...(bytes ? { 'content-length': String(bytes.length) } : {}), ...headers } });
    if (bytes) req.push(bytes);
    req.push(null);
    const res = new ServerResponse(req);
    const timer = setTimeout(() => reject(new Error('Application did not finish ' + url)), 2500);
    res.end = function (chunk) {
      clearTimeout(timer);
      resolve({ status: res.statusCode, headers: res.getHeaders(), text: chunk?.toString() || '' });
      return res;
    };
    const next = err => { clearTimeout(timer); reject(err || new Error('Unmatched route: ' + url)); };
    try {
      const result = app.handle ? app.handle(req, res, next) : app(req, res);
      if (result?.catch) result.catch(next);
    } catch (err) { next(err); }
  });
}

test('OpenAPI references, path parameters, auth schemes and operation IDs resolve', () => {
  for (const folder of [...folders, 'audit-service']) {
    const spec = contract(folder), ids = new Set();
    function walk(value) {
      if (!value || typeof value !== 'object') return;
      if (value.$ref) {
        assert.ok(value.$ref.startsWith('#/'), 'Only local refs: ' + value.$ref);
        let target = spec;
        for (const part of value.$ref.slice(2).split('/')) target = target?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
        assert.ok(target, folder + ': unresolved ' + value.$ref);
      }
      Object.values(value).forEach(walk);
    }
    walk(spec);
    for (const [url, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        assert.ok(op.responses && Object.keys(op.responses).length, folder + ': missing responses ' + url);
        assert.ok(op.operationId && !ids.has(op.operationId), folder + ': duplicate operation ID ' + op.operationId);
        ids.add(op.operationId);
        const params = [...(methods.parameters || []), ...(op.parameters || [])];
        const names = new Set();
        for (const p of params) {
          const key = p.in + ':' + p.name;
          assert.ok(!names.has(key), folder + ': duplicate parameter ' + key); names.add(key);
        }
        for (const [, name] of url.matchAll(/\{([^}]+)\}/g)) assert.ok(params.some(p => p.name === name && p.in === 'path' && p.required), folder + ': missing path parameter ' + name);
        for (const security of op.security ?? spec.security ?? []) {
          for (const name of Object.keys(security)) assert.ok(spec.components.securitySchemes[name], folder + ': undefined security ' + name);
        }
      }
    }
  }
});

test('Every explicitly declared REST route is represented in the provider contracts', () => {
  const cases = [
    ['servicio-de-mayoristas', 'servicio-de-mayoristas/routes/authRoutes.js', '/api/v1/auth'],
    ['servicio-de-mayoristas', 'servicio-de-mayoristas/routes/companyRoutes.js', '/api/v1/stock/empresas'],
    ['servicio-de-mayoristas', 'servicio-de-mayoristas/routes/wholesaleStockRoutes.js', '/api/v1/stock'],
    ['srv-servicios-adicionales', 'srv-servicios-adicionales/src/routes/empresasRoutes.js', '/api/v1/catalogo/empresas'],
    ['srv-servicios-adicionales', 'srv-servicios-adicionales/src/routes/serviciosRoutes.js', '/api/v1/catalogo/servicios'],
    ['srv-servicios-adicionales', 'srv-servicios-adicionales/src/routes/companyIntegrationRoutes.js', '/api/v1/integracion'],
    ['srv-servicios-adicionales', 'srv-servicios-adicionales/src/routes/adminDemoRoutes.js', '/api/v1/demo-admin'],
    ['server', 'server/routes/userRoutes.js', '/api/users'],
    ['server', 'server/routes/auditRoutes.js', '/api/audit']
  ];
  for (const [folder, file, prefix] of cases) {
    const spec = contract(folder);
    for (const [, method, route] of read(file).matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)) {
      const url = (prefix + (route === '/' ? '' : route)).replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      assert.ok(spec.paths[url]?.[method], file + ': undocumented ' + method + ' ' + url);
    }
  }
  for (const [url, method] of [['/api/v1/inventario/dashboards', 'post'], ['/api/v1/inventario/reportes/{idReporte}', 'get']]) assert.ok(contract('reports-service').paths[url]?.[method]);
  for (const url of ['/api/v1/stock/empresas/{ruc}/acceso', '/api/v1/stock/snapshot']) assert.equal(contract('server').paths[url], undefined, 'Gateway must not advertise routes rejected by ESB');
  assert.equal(contract('servicio-de-mayoristas').paths['/api/v1/stock/proveedores'].post.deprecated, true);
  assert.ok(contract('servicio-de-mayoristas').paths['/api/v1/stock/proveedores'].post.responses['410']);
});

test('Swagger initializer uses current origin, disables external validation and retains CSRF header', () => {
  for (const folder of folders) {
    const { createApiDocs } = require(path.join(root, folder, 'apiDocs.cjs'));
    const docs = createApiDocs({ specPath: path.join(root, folder, 'openapi.json'), title: '<Unsafe>', browserSession: folder === 'server' });
    let output, config;
    const res = { setHeader() {}, end(v) { output = v; } };
    assert.equal(docs({ method: 'GET', url: '/docs/swagger-initializer.js' }, res), true);
    const SwaggerUIBundle = value => { config = value; return {}; };
    SwaggerUIBundle.presets = { apis: {} };
    vm.runInNewContext(output, { SwaggerUIBundle, window: {} });
    assert.equal(config.url, '/openapi.json');
    assert.equal(config.validatorUrl, null);
    assert.equal(config.persistAuthorization, false);
    assert.equal(config.queryConfigEnabled, false);
    const req = config.requestInterceptor({ headers: {} });
    if (folder === 'server') assert.equal(req.headers['X-Requested-With'], 'QuanticWeb');
    assert.equal(docs({ method: 'POST', url: '/docs' }, res), false);
    assert.equal(docs({ method: 'GET', url: '/docs-unrelated' }, res), false);
    docs({ method: 'GET', url: '/docs?url=https://untrusted.invalid' }, res);
    assert.ok(output.includes('&lt;Unsafe&gt;') && !output.includes('untrusted.invalid'));
  }
});

test('Actual applications serve Swagger and preserve authentication and CSRF', async t => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
  process.env.INTEGRATION_KEY = 'test-only-integration-'.repeat(4);
  process.env.CLIENT_ORIGINS = 'http://localhost:5173';
  process.env.AUDIT_ENABLED = 'false';
  process.env.PORT = '3000';
  const stock = (await importFile('servicio-de-mayoristas/app.js')).createApp();
  const main = (await importFile('server/app.js')).createApp({ auditSink: async () => {} });
  const company = require(path.join(root, 'srv-servicios-adicionales/src/app.js'));
  const esb = (await importFile('integration-esb/src/app.js')).createApp({ apiKey: 'esb-test-'.repeat(8), soapKey: 'soap-test-'.repeat(8), soapUrl: 'http://127.0.0.1:8002/soap/notifications', timeoutMs: 500, consumerSystem: 'test' });
  const reports = (await importFile('reports-service/src/app.js')).createHandler({ clients: {}, repository: { ping() {} }, source: () => { throw new Error('Must not access stock'); } });
  for (const [folder, app] of [['servicio-de-mayoristas',stock],['reports-service',reports],['srv-servicios-adicionales',company],['integration-esb',esb],['server',main]]) {
    await t.test(folder + ': public documentation, local contract, HEAD and alias', async () => {
      for (const url of ['/docs', '/docs/', '/docs?url=https://untrusted.invalid']) {
        const r = await request(app, url);
        assert.equal(r.status,200);assert.match(r.headers['content-type'],/text\/html/);
        assert.match(r.text,/swagger-ui-dist@5\.34\.1\/swagger-ui-bundle.js/);
        assert.match(r.headers['content-security-policy'],/script-src 'self' https:\/\/cdn.jsdelivr.net/);
      }
      const r = await request(app,'/openapi.json');assert.equal(r.status,200);
      assert.deepEqual(JSON.parse(r.text).servers,[{url:'/',description:'Este servicio'}]);
      assert.deepEqual(JSON.parse(r.text).paths,contract(folder).paths);
      assert.equal((await request(app,'/docs',{method:'HEAD'})).text,'');
      const alias=await request(app,'/api-docs');assert.equal(alias.status,302);assert.equal(alias.headers.location,'/docs');
      const js=await request(app,'/docs/swagger-initializer.js');assert.equal(js.status,200);assert.match(js.headers['content-type'],/javascript/);
    });
  }
  for (const [app,url] of [[stock,'/api/v1/stock/products'],[main,'/api/users/profile'],[company,'/api/v1/mi-empresa'],[esb,'/v1/notifications/get'],[reports,'/api/v1/inventario/indicadores']]) {
    assert.equal((await request(app,url)).status,401,'Authentication must still protect '+url);
  }
  const headers={origin:'http://localhost:3000','x-requested-with':'QuanticWeb','content-type':'application/json'};
  // Invalid input stops before login could access a database. A 400 proves CSRF passed.
  assert.equal((await request(main,'/api/users/login',{method:'POST',headers,body:{}})).status,400);
  assert.equal((await request(main,'/api/users/login',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:{}})).status,403);
  assert.equal((await request(main,'/api/users/login',{method:'POST',headers:{...headers,'x-requested-with':''},body:{}})).status,403);
  process.env.NODE_ENV='production';
  process.env.CLIENT_ORIGINS='https://portal.example.test';
  const production=(await importFile('server/app.js')).createApp({auditSink:async()=>{}});
  assert.equal((await request(production,'/api/users/login',{method:'POST',headers,body:{}})).status,403,'Production must not add loopback origins');
  process.env.NODE_ENV='test';
});
