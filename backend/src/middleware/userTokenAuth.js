// middleware/userTokenAuth.js
import jwt from 'jsonwebtoken';
import { User } from '../models/userSchema.js';
// import redisclient from '../config/redis.js';   // your CommonJS redis client (works with import) ## not working

// Instead, use:
import * as redisModule from '../config/redis.js';
const redisclient = redisModule.default; // or redisModule itself if it's the client

const userTokenAuth = async (req, res, next) => {
  try {
    const { user } = req.cookies;
    if (!user) {
      return res.status(401).json({ error: 'Token does not exist' });
    }

    const payload = jwt.verify(user, process.env.SECRET_KEY);
    const { id } = payload;
    if (!id) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const result = await User.findById(id);
    if (!result) {
      return res.status(401).json({ error: 'User does not exist' });
    }

    const isBlocked = await redisclient.exists(`token:${user}`);
    if (isBlocked) {
      return res.status(401).json({ error: 'Token is blacklisted' });
    }

    req.result = result;   // attach full user document
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: err.message });
  }
};

export default userTokenAuth;