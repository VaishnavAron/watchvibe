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
    const blacklisted = await redisclient.exists(`token:${token}`);
    if (blacklisted) throw new Error('Token revoked');
    const user = await User.findById(decoded.id).select('-password');
    if (!user) throw new Error('User not found');
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token', getClearCookieOptions());
    req.user = null;
    next();
  }
}
