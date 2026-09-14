const allowedOriginPatterns = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/.+\.ngrok-free\.(app|dev)$/,
  /^https?:\/\/.+\.ngrok\.io$/,
  /^https?:\/\/.+\.vercel\.app$/,
  /^https?:\/\/.+\.netlify\.app$/
];

const corsOptions = {
  origin(origin, callback) {
    // 1. Allow non-browser callers (curl, postman, mobile native apps, server-to-server)
    if (!origin) return callback(null, true);

    // 2. Allow configured patterns (any localhost port, local LAN, ngrok, vercel)
    const isMatched = allowedOriginPatterns.some((pattern) => pattern.test(origin));
    if (isMatched) return callback(null, true);

    // 3. Fallback: allow explicit FRONTEND_URL or allow during non-production
    if (process.env.NODE_ENV !== 'production' || origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }

    // Cleanly deny without throwing an unhandled Express 500 error
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'ngrok-skip-browser-warning',
    'x-client-version'
  ],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
  maxAge: 86400 // Cache preflight for 24h
};

function getCookieOptions(req) {
  // If request is over HTTPS or forwarded by a reverse proxy (ngrok, cloudflare, load balancer)
  const isHttps = req
    ? Boolean(req.secure || req.headers?.['x-forwarded-proto'] === 'https')
    : (process.env.NODE_ENV === 'production' && process.env.USE_NGROK === 'true');

  return {
    httpOnly: true,
    // Browsers strictly reject 'SameSite=None' cookies unless 'Secure=true' over HTTPS
    // Over HTTP (e.g. localhost), cookies must be 'SameSite=Lax' and 'Secure=false'
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  };
}

function getClearCookieOptions(req) {
  const { maxAge, ...options } = getCookieOptions(req);
  return options;
}

export { corsOptions, getCookieOptions, getClearCookieOptions };
