// Exercise Express middleware and routes without opening a TCP port.
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
module.exports = function request(app, { method = 'GET', url, token, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    let output = '';
    const socket = new Duplex({ read() {}, write(chunk, _encoding, done) { output += chunk.toString(); done(); } });
    const req = new IncomingMessage(socket);
    req.complete = true;
    req.method = method; req.url = url; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
    req.headers = { host: 'localhost', connection: 'close', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers };
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    if (payload) Object.assign(req.headers, { 'content-type': 'application/json', 'content-length': String(payload.length) });
    const res = new ServerResponse(req); res.assignSocket(socket);
    const timer = setTimeout(() => reject(new Error('In-memory request timeout: ' + url)), 5000);
    res.on('finish', () => {
      clearTimeout(timer);
      const raw = output.slice(output.indexOf('\r\n\r\n') + 4);
      try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, raw }); }
      socket.destroy();
    });
    req.on('error', reject); res.on('error', reject);
    app.handle(req, res);
    if (payload) req.push(payload);
    req.push(null);
  });
};
