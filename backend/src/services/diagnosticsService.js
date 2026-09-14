import mongoose from 'mongoose';
import Groq from 'groq-sdk';
import { driver, pineconeIndex } from '../core/2_config.js';
import redisclient from '../config/redis.js';
import { User } from '../models/userSchema.js';
import { sampleMovies, movieIndex } from './movieData.js';

function withTimeout(promise, ms, timeoutMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${timeoutMessage} after ${ms}ms`)), ms))
  ]);
}

export async function checkMongoDB() {
  const start = Date.now();
  try {
    const readyStateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const stateName = readyStateMap[mongoose.connection.readyState] || 'unknown';

    if (mongoose.connection.readyState !== 1) {
      throw new Error(`MongoDB is in '${stateName}' state (not ready)`);
    }

    await withTimeout(mongoose.connection.db.admin().ping(), 4000, 'MongoDB ping');
    const userCount = await withTimeout(User.countDocuments(), 4000, 'User count query').catch(() => null);

    return {
      name: 'MongoDB Atlas',
      category: 'Primary Database',
      status: 'HEALTHY',
      critical: true,
      latencyMs: Date.now() - start,
      details: {
        database: mongoose.connection.name || 'default',
        registeredUsers: userCount,
        readyState: stateName
      }
    };
  } catch (err) {
    return {
      name: 'MongoDB Atlas',
      category: 'Primary Database',
      status: 'DOWN',
      critical: true,
      latencyMs: Date.now() - start,
      error: err.message,
      recommendation: 'Verify db_connection_string in .env, check MongoDB Atlas Network Access IP Whitelist (add 0.0.0.0/0 for testing), and check cluster status.'
    };
  }
}

export async function checkNeo4j() {
  const start = Date.now();
  try {
    const movieCount = await withTimeout((async () => {
      const session = driver.session();
      try {
        const result = await session.run('MATCH (m:Movie) RETURN count(m) AS count LIMIT 1');
        const count = result.records[0]?.get('count');
        return count?.toNumber ? count.toNumber() : Number(count) || 0;
      } finally {
        await session.close();
      }
    })(), 8000, 'Neo4j query');

    return {
      name: 'Neo4j Aura Graph DB',
      category: 'Knowledge Graph (Phase 2)',
      status: 'HEALTHY',
      critical: false,
      latencyMs: Date.now() - start,
      details: {
        nodeCount: movieCount,
        uri: process.env.NEO4J_URI ? process.env.NEO4J_URI.split('@').pop() : 'configured'
      }
    };
  } catch (err) {
    return {
      name: 'Neo4j Aura Graph DB',
      category: 'Knowledge Graph (Phase 2)',
      status: 'DEGRADED',
      critical: false,
      latencyMs: Date.now() - start,
      error: err.message,
      fallbackActive: 'In-Memory Graph Co-occurrence & Semantic Vector Channel',
      recommendation: 'Check NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD in .env. Verify Neo4j Aura cloud instance is running.'
    };
  }
}

export async function checkPinecone() {
  const start = Date.now();
  try {
    if (!pineconeIndex) throw new Error('Pinecone index client not initialized');
    const stats = await withTimeout(pineconeIndex.describeIndexStats(), 15000, 'Pinecone describeIndexStats');

    return {
      name: 'Pinecone Vector DB',
      category: 'ANN Vector Store (Phase 2)',
      status: 'HEALTHY',
      critical: false,
      latencyMs: Date.now() - start,
      details: {
        indexName: process.env.PINECONE_INDEX_NAME,
        dimension: stats.dimension,
        totalRecordCount: stats.totalRecordCount,
        namespaces: Object.keys(stats.namespaces || {})
      }
    };
  } catch (err) {
    return {
      name: 'Pinecone Vector DB',
      category: 'ANN Vector Store (Phase 2)',
      status: 'DEGRADED',
      critical: false,
      latencyMs: Date.now() - start,
      error: err.message,
      fallbackActive: 'In-memory BM25 lexical search & Graph channel',
      recommendation: 'Verify PINECONE_API_KEY and PINECONE_INDEX_NAME in .env. Ensure index is in Ready state on app.pinecone.io.'
    };
  }
}

export async function checkOllamaEC2() {
  const start = Date.now();
  const host = process.env.OLLAMA_HOST || 'http://3.110.176.31:11434';
  const model = process.env.OLLAMA_EMBED_MODEL || 'qwen3-embedding:0.6b';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const tagsRes = await fetch(`${host}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!tagsRes.ok) {
      throw new Error(`Ollama returned HTTP status ${tagsRes.status}`);
    }

    const tagsData = await tagsRes.json();
    const modelFound = tagsData.models?.some(m => m.name.includes('qwen3-embedding') || m.name.includes(model));

    // Test a real embedding probe
    const embedController = new AbortController();
    const embedTimeout = setTimeout(() => embedController.abort(), 8000);
    const embedRes = await fetch(`${host}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'health probe query' }),
      signal: embedController.signal
    });
    clearTimeout(embedTimeout);

    let vectorDim = null;
    if (embedRes.ok) {
      const embedData = await embedRes.json();
      vectorDim = embedData.embedding?.length || null;
    }

    return {
      name: 'AWS EC2 Ollama Embeddings',
      category: 'Neural Embeddings (Phase 2)',
      status: 'HEALTHY',
      critical: false,
      latencyMs: Date.now() - start,
      details: {
        host,
        targetModel: model,
        modelLoaded: modelFound,
        vectorDimension: vectorDim
      }
    };
  } catch (err) {
    return {
      name: 'AWS EC2 Ollama Embeddings',
      category: 'Neural Embeddings (Phase 2)',
      status: 'DEGRADED',
      critical: false,
      latencyMs: Date.now() - start,
      error: err.message,
      fallbackActive: 'Voyage AI Cloud Fallback & Lexical Matching',
      recommendation: 'Check EC2 instance state at AWS Console (ensure instance is running). In EC2 Security Groups, verify Inbound Rule allows TCP port 11434 from 0.0.0.0/0. If EC2 public IP changed, update OLLAMA_HOST in .env.'
    };
  }
}

export async function checkGroqLLM() {
  const start = Date.now();
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not defined in .env');

    const activeModel = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
    const groq = new Groq({ apiKey });
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: activeModel,
        messages: [{ role: 'user', content: 'respond with OK' }],
        max_completion_tokens: 5
      }),
      8000,
      'Groq LLM ping'
    );

    const reply = completion.choices[0]?.message?.content?.trim() || 'OK';

    return {
      name: 'Groq Cloud LLM',
      category: 'Query Intent & Synthesis (Phase 1 & 4)',
      status: 'HEALTHY',
      critical: true,
      latencyMs: Date.now() - start,
      details: {
        primaryModel: activeModel,
        probeResponse: reply
      }
    };
  } catch (err) {
    return {
      name: 'Groq Cloud LLM',
      category: 'Query Intent & Synthesis (Phase 1 & 4)',
      status: 'DEGRADED',
      critical: true,
      latencyMs: Date.now() - start,
      error: err.message,
      fallbackActive: 'Rule-based Intent Parser & Template Explanation Generator',
      recommendation: 'Check GROQ_API_KEY in .env. Verify rate limit (TPM/RPM) on console.groq.com. GROQ_FALLBACK_MODELS will automatically attempt alternative models.'
    };
  }
}

export async function checkRedis() {
  const start = Date.now();
  try {
    if (!redisclient.isOpen) {
      return {
        name: 'Redis Cloud Cache',
        category: 'Session Blacklist & Query Caching',
        status: 'DEGRADED (GRACEFUL_FALLBACK)',
        critical: false,
        latencyMs: Date.now() - start,
        error: 'Redis connection is closed or DNS lookup failed',
        fallbackActive: 'Non-blocking in-memory cache & Cryptographic JWT verification (Active)',
        recommendation: 'System is running normally without Redis. To re-enable Redis Cloud, update REDIS_HOST and REDIS_PASSWORD in .env. To permanently suppress reconnect warnings, set SKIP_REDIS_CACHE=true.'
      };
    }

    await withTimeout(redisclient.ping(), 2000, 'Redis ping');

    return {
      name: 'Redis Cloud Cache',
      category: 'Session Blacklist & Query Caching',
      status: 'HEALTHY',
      critical: false,
      latencyMs: Date.now() - start,
      details: {
        connected: true,
        host: process.env.REDIS_HOST
      }
    };
  } catch (err) {
    return {
      name: 'Redis Cloud Cache',
      category: 'Session Blacklist & Query Caching',
      status: 'DEGRADED (GRACEFUL_FALLBACK)',
      critical: false,
      latencyMs: Date.now() - start,
      error: err.message,
      fallbackActive: 'Non-blocking in-memory cache & Cryptographic JWT verification (Active)',
      recommendation: 'System operates normally with fallback cache. Update Redis Cloud connection or set SKIP_REDIS_CACHE=true in .env.'
    };
  }
}

export function checkMovieCatalog() {
  const start = Date.now();
  const count = sampleMovies?.length || 0;
  const indexSize = movieIndex?.size || 0;

  return {
    name: 'In-Memory Movie Knowledge Base',
    category: 'Local Catalog & Cold-Start Fallback',
    status: count >= 1000 ? 'HEALTHY' : 'DEGRADED',
    critical: true,
    latencyMs: Date.now() - start,
    details: {
      loadedTitles: count,
      indexedKeys: indexSize,
      targetCatalogSize: 10510
    }
  };
}

export function getSystemRuntimeMetrics() {
  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const memory = process.memoryUsage();

  return {
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    uptimeSeconds,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    environment: process.env.NODE_ENV || 'development',
    memoryUsage: {
      rssMb: Math.round(memory.rss / (1024 * 1024)),
      heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
      heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024))
    }
  };
}

export async function runFullDiagnostics() {
  const startTime = Date.now();

  const [
    mongoResult,
    neo4jResult,
    pineconeResult,
    ollamaResult,
    groqResult,
    redisResult
  ] = await Promise.all([
    checkMongoDB(),
    checkNeo4j(),
    checkPinecone(),
    checkOllamaEC2(),
    checkGroqLLM(),
    checkRedis()
  ]);

  const catalogResult = checkMovieCatalog();
  const systemMetrics = getSystemRuntimeMetrics();

  const services = [
    mongoResult,
    neo4jResult,
    pineconeResult,
    ollamaResult,
    groqResult,
    redisResult,
    catalogResult
  ];

  const hasCriticalFailure = services.some(s => s.critical && s.status === 'DOWN');
  const hasDegraded = services.some(s => s.status.includes('DEGRADED') || s.status === 'DOWN');

  let overallStatus = 'HEALTHY';
  if (hasCriticalFailure) {
    overallStatus = 'CRITICAL';
  } else if (hasDegraded) {
    overallStatus = 'OPERATIONAL (DEGRADED_RESILIENT)';
  }

  return {
    overallStatus,
    timestamp: new Date().toISOString(),
    totalDiagnosticLatencyMs: Date.now() - startTime,
    summary: {
      totalServicesChecked: services.length,
      healthyCount: services.filter(s => s.status === 'HEALTHY').length,
      degradedOrDownCount: services.filter(s => s.status !== 'HEALTHY').length
    },
    systemMetrics,
    services
  };
}
