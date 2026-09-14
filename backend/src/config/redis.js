// import redis from 'redis';

// const redisclient = redis.createClient({
//   username: 'default',
//   password: process.env.REDIS_PASSWORD,
//   socket: {
//     host: process.env.REDIS_HOST,
//     port: parseInt(process.env.REDIS_PORT),
//   },
// });

// await redisclient.connect();
// console.log('Redis connected');
// export default redisclient;

import redis from 'redis';

const redisclient = redis.createClient({
  username: 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    // Infinite reconnect with exponential backoff (max 30 seconds)
    reconnectStrategy: (retries) => {
      const delay = Math.min(1000 * Math.pow(2, retries), 30000);
      console.log(`Redis reconnect attempt ${retries} in ${delay}ms`);
      return delay;
    }
  }
});

// Event listeners for visibility and crash prevention
redisclient.on('error', (err) => {
  if (err.code === 'ECONNRESET') {
    console.warn('Redis connection reset by peer – will auto-reconnect');
  } else {
    console.error('Redis error:', err);
  }
});

redisclient.on('ready', () => console.log('Redis client ready and connected'));
redisclient.on('end', () => console.warn('Redis connection ended – reconnecting...'));
redisclient.on('reconnecting', () => console.log('Redis reconnecting...'));

// Keep‑alive: prevent server-side idle timeouts
let pingInterval = null;

function startKeepAlive(intervalMs = 30000) {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(async () => {
    if (redisclient.isOpen) {
      try {
        await redisclient.ping();
      } catch (err) {
        console.warn('Keep-alive PING failed:', err.message);
      }
    }
  }, intervalMs);
}

function stopKeepAlive() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// Initial connection (non‑blocking – does not hang app startup)
redisclient.connect().catch((err) => {
  console.error('Initial Redis connection failed:', err.message);
});

startKeepAlive();

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  stopKeepAlive();
  try {
    await redisclient.quit();
    console.log('Redis connection closed.');
  } catch (err) {
    console.error('Error during Redis quit:', err);
  }
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default redisclient;