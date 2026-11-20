const { readFileSync } = require('node:fs');

                                                                              
const SWAGGER_VERSION = '5.34.1';
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}`;

function createApiDocs({ specPath, title, browserSession = false }) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
                                                                                 
  const contract = JSON.stringify({ ...spec, servers: [{ url: '/', description: 'Este servicio' }] });
  const safeTitle = title.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle} — Swagger UI</title>
<link rel="stylesheet" href="${CDN}/swagger-ui.css"></head>
<body><div id="swagger-ui"><p>Cargando Swagger UI. Se necesita acceso a cdn.jsdelivr.net.</p>
<p>También puedes descargar el <a href="/openapi.json">contrato OpenAPI</a>.</p></div>
<script src="${CDN}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
<script src="/docs/swagger-initializer.js"></script></body></html>`;
  const initializer = `if (typeof SwaggerUIBundle === 'function') {
  window.ui = SwaggerUIBundle({
    url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true,
    validatorUrl: null, persistAuthorization: false, queryConfigEnabled: false,
    withCredentials: ${browserSession}, displayRequestDuration: true,
    presets: [SwaggerUIBundle.presets.apis], layout: 'BaseLayout',
    requestInterceptor: function (request) {
      ${browserSession ? "request.headers['X-Requested-With'] = 'QuanticWeb'; request.credentials = 'same-origin';" : ''}
      return request;
    }
  });
}`;
  return function apiDocs(req, res) {
    if (!['GET', 'HEAD'].includes(req.method)) return false;
    const path = new URL(req.url, 'http://docs.local').pathname;
    if (!['/docs', '/docs/', '/api-docs', '/api-docs/', '/openapi.json', '/docs/swagger-initializer.js'].includes(path)) return false;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (path === '/api-docs' || path === '/api-docs/') {
      res.statusCode = 302; res.setHeader('Location', '/docs'); res.end(); return true;
    }
                                                                              
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    const json = path === '/openapi.json';
    const script = path === '/docs/swagger-initializer.js';
    res.statusCode = 200;
    res.setHeader('Content-Type', json ? 'application/json; charset=utf-8' : script ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(req.method === 'HEAD' ? undefined : json ? contract : script ? initializer : html);
    return true;
  };
}

module.exports = { createApiDocs };
