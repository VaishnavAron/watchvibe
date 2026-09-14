import jwt from 'jsonwebtoken';
import redisclient from '../config/redis.js';
import { User } from '../models/userSchema.js';
import { getClearCookieOptions } from '../config/cors.js';

export async function authenticate(req, res, next) {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check blacklist only if Redis is actively open and not explicitly skipped
    if (redisclient.isOpen && process.env.SKIP_REDIS_CACHE !== 'true') {
      try {
        const blacklisted = await redisclient.exists(`token:${token}`);
        if (blacklisted) throw new Error('Token revoked');
      } catch (redisErr) {
        if (redisErr.message === 'Token revoked') throw redisErr;
        // Non-blocking fallback: if Redis is unreachable, allow valid cryptographic JWT
      }
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) throw new Error('User not found');
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError' || err.message === 'Token revoked' || err.message === 'User not found') {
      res.clearCookie('token', getClearCookieOptions());
    }
    req.user = null;
    next();
  }
}
