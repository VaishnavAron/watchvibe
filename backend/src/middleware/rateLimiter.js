import redisclient from '../config/redis.js';

// Sliding window rate limiter for guests only
// windowSize: seconds, maxRequests: number of allowed requests per window
export const guestRateLimiter = (windowSize = 60, maxRequests = 2) => {
  return async (req, res, next) => {
    // Skip rate limiting for logged‑in users
    if (req.user) {
      return next();
    }

    const key = `rate:guest:${req.ip}`;
    const now = Date.now() / 1000; // seconds
    const windowStart = now - windowSize;

    try {
      // Remove requests outside the sliding window
      await redisclient.zRemRangeByScore(key, 0, windowStart);
      // Count remaining requests in the window
      const requestCount = await redisclient.zCard(key);

      if (requestCount >= maxRequests) {
        return res.status(429).json({
          error: `Too many requests. Please wait ${windowSize} seconds before trying again.`
        });
      }

      // Add current request with timestamp as score
      await redisclient.zAdd(key, { score: now, value: `${now}:${Math.random()}` });
      // Set key expiration to windowSize (cleanup)
      await redisclient.expire(key, windowSize);

      next();
    } catch (err) {
      console.error('Rate limiter error:', err);
      // On Redis error, allow the request to proceed (fail open)
      next();
    }
  };
};