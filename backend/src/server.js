// server.js – with global autoIndex disabled and error catching
import { bootstrap } from 'global-agent';
bootstrap();
import 'dotenv/config';
import mongoose from 'mongoose';
// 🔥 CRITICAL: Disable auto‑index creation globally BEFORE any model is loaded
mongoose.set('autoIndex', false);

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import redisclient from './config/redis.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import { getDiagnosticsJson, getDiagnosticsHtml, getNeo4jPing } from './controllers/diagnosticsController.js';
import { loadSampleMovies } from './services/movieData.js';
import { corsOptions } from './config/cors.js';
import swaggerUi from 'swagger-ui-express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const swaggerPath = path.join(projectRoot, 'swagger.json');

let swaggerDocument = null;
try {
  swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));
  console.log('✅ Swagger spec loaded');
} catch (err) {
  console.warn('⚠️ swagger.json not found. Run `npm run swagger` to generate it.');
}

const app = express();

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));
app.use(express.json());
app.use(cookieParser());
app.use(authenticate);

if (swaggerDocument) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    swaggerOptions: { persistAuthorization: true }
  }));
  console.log('📚 Swagger docs available at /api-docs');
} else {
  console.log('📚 Swagger documentation disabled (swagger.json missing)');
}

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/health/neo4j-ping', getNeo4jPing);
app.get('/api/health/neo4j-ping', getNeo4jPing);
app.get('/health/diagnostics', getDiagnosticsJson);
app.get('/health/diagnostics/html', getDiagnosticsHtml);
app.get('/api/health/diagnostics', getDiagnosticsJson);
app.get('/api/health/diagnostics/html', getDiagnosticsHtml);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB();
    loadSampleMovies();
    // Pre-warm base catalog cache in background for 0ms Discover page loads
    import('./services/collectionService.js')
      .then(cs => cs.buildHomeCollections('demo-user'))
      .then(() => console.log('⚡ Base catalog cache warmed for 0ms loads'))
      .catch(err => console.warn('⚠️ Base catalog pre-warm notice:', err.message));
    process.on('uncaughtException', (err) => {
      const msg = err?.message || '';
      if (
        msg.includes('Index key') || 
        msg.includes('duplicate key error') || 
        msg.includes('getaddrinfo') || 
        msg.includes('ECONNREFUSED') || 
        msg.includes('ETIMEDOUT') ||
        msg.includes('redis') ||
        msg.includes('neo4j')
      ) {
        console.warn('⚠️ Tolerated network/cache background error:', msg);
      } else {
        console.error('Uncaught Exception:', err);
      }
    });

    process.on('unhandledRejection', (reason) => {
      console.warn('⚠️ Unhandled Promise Rejection tolerated:', reason?.message || reason);
    });
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('❌ Server startup error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

start();