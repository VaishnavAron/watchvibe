const allowedOriginPatterns = [
  /^http:\/\/localhost:5500$/,
  /^http:\/\/localhost:5502$/,
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/.+\.ngrok-free\.(app|dev)$/,
  /^https?:\/\/.+\.vercel\.app$/   
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOriginPatterns.some((pattern) => pattern.test(origin))) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
};

function getCookieOptions() {
  const useSecureCrossSiteCookie =
    process.env.USE_NGROK === 'true' || process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: useSecureCrossSiteCookie,
    sameSite: useSecureCrossSiteCookie ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function getClearCookieOptions() {
  const { maxAge, ...options } = getCookieOptions();
  return options;
}

export { corsOptions, getCookieOptions, getClearCookieOptions };
