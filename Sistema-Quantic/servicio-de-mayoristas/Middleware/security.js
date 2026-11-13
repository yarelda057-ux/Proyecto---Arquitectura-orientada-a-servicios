export function securityHeaders(req, res, next) {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}
export function protectWrites(origins) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!origins.includes(req.get('origin')) || req.get('x-requested-with') !== 'QuanticWeb') return res.status(403).json({ message: 'Origen de solicitud no permitido.' });
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ message: 'Se requiere application/json.' });
    next();
  };
}
export function loginLimiter({ limit = 10, windowMs = 900000 } = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + windowMs };
    if (attempts.size >= 10000 && !attempts.has(key)) return res.status(429).json({ message: 'Demasiados intentos. Inténtalo más tarde.' });
    attempts.set(key, entry);
    if (++entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return res.status(429).json({ message: 'Demasiados intentos. Inténtalo más tarde.' });
    }
    next();
  };
}
