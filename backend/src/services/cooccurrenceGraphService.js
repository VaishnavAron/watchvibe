// backend/src/services/cooccurrenceGraphService.js
/**
 * Co-Occurrence Graph Service
 * 
 * Bridges MovieLens 32M collaborative intelligence with WatchVibe:
 * 1. Ultra-fast in-memory cache from movielens_cooccurrences.json (0ms lookup).
 * 2. Live driver connection to Secondary Neo4j instance (WatchVibe Co-Ocurrence).
 * 3. Provides collaborative filtering weights and explainability paths.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import neo4j from 'neo4j-driver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOCCURRENCE_JSON = path.join(__dirname, '../../data/movielens_cooccurrences.json');

// In-memory cache for 0ms sub-millisecond retrieval
let localGraphCache = null;
let titleToTmdbMap = new Map();

function initCache() {
  if (localGraphCache) return;
  try {
    if (fs.existsSync(COOCCURRENCE_JSON)) {
      const raw = fs.readFileSync(COOCCURRENCE_JSON, 'utf8');
      localGraphCache = JSON.parse(raw);
      for (const [tmdbIdStr, entry] of Object.entries(localGraphCache)) {
        if (entry && entry.title) {
          titleToTmdbMap.set(entry.title.toLowerCase().trim(), parseInt(tmdbIdStr, 10));
        }
      }
      console.log(`⚡ [CO-OCCURRENCE] Initialized in-memory graph cache (${Object.keys(localGraphCache).length} movies)`);
    } else {
      console.warn(`⚠️ [CO-OCCURRENCE] movielens_cooccurrences.json not found at ${COOCCURRENCE_JSON}`);
    }
  } catch (err) {
    console.error(`❌ [CO-OCCURRENCE CACHE ERROR]:`, err.message);
  }
}

// Lazy init
initCache();

// Secondary Neo4j Driver
const NEO4J_URI = process.env.NEO4J_COOCCURRENCE_URI || 'neo4j+s://8e7df96c.databases.neo4j.io';
const NEO4J_USER = process.env.NEO4J_COOCCURRENCE_USERNAME || '8e7df96c';
const NEO4J_PASS = process.env.NEO4J_COOCCURRENCE_PASSWORD || 'HS99JVFWv7Di3SYELZqiMUs8Vu9ioEnJNQkY9WBYTiI';

let driver = null;
try {
  driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS), {
    maxConnectionPoolSize: 20
  });
} catch (err) {
  console.error(`⚠️ [SECONDARY NEO4J INIT ERROR]:`, err.message);
}

/**
 * Get co-watched movies for a title (fast lookup)
 */
export function getCoWatchedMovies(title, limit = 10) {
  initCache();
  if (!localGraphCache) return [];

  const cleanTitle = (title || '').toLowerCase().trim();
  const tmdbId = titleToTmdbMap.get(cleanTitle);
  if (!tmdbId || !localGraphCache[tmdbId]) {
    // Try substring match if exact fails
    for (const [t, id] of titleToTmdbMap.entries()) {
      if (t.includes(cleanTitle) || cleanTitle.includes(t)) {
        const item = localGraphCache[id];
        return (item?.coWatched || []).slice(0, limit);
      }
    }
    return [];
  }

  return (localGraphCache[tmdbId]?.coWatched || []).slice(0, limit);
}

/**
 * Get collaborative affinity weight between source title and candidate title
 * Returns number between 0.0 and 1.0 (or default 0.0)
 */
export function getCoWatchedWeight(sourceTitle, candidateTitle) {
  initCache();
  if (!localGraphCache || !sourceTitle || !candidateTitle) return 0.0;

  const cleanSource = sourceTitle.toLowerCase().trim();
  const cleanCand = candidateTitle.toLowerCase().trim();

  let sourceId = titleToTmdbMap.get(cleanSource);
  if (!sourceId) {
    for (const [t, id] of titleToTmdbMap.entries()) {
      if (t.includes(cleanSource) || cleanSource.includes(t)) {
        sourceId = id;
        break;
      }
    }
  }

  if (!sourceId || !localGraphCache[sourceId]) return 0.0;

  const neighbors = localGraphCache[sourceId].coWatched || [];
  for (const n of neighbors) {
    const nTitle = (n.title || '').toLowerCase().trim();
    if (nTitle === cleanCand || nTitle.includes(cleanCand) || cleanCand.includes(nTitle)) {
      return n.weight || 0.0;
    }
  }

  return 0.0;
}

/**
 * Live Cypher query to secondary Neo4j (for deep paths or telemetry verification)
 */
export async function querySecondaryNeo4jCoWatched(title, limit = 10) {
  if (!driver) return [];
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Movie)-[r:CO_WATCHED]->(b:Movie)
       WHERE toLower(a.title) CONTAINS toLower($title)
       RETURN b.title AS title, b.tmdbId AS tmdbId, r.weight AS weight, r.coWatchCount AS coWatchCount
       ORDER BY r.weight DESC LIMIT toInteger($limit)`,
      { title, limit }
    );
    return result.records.map(r => ({
      title: r.get('title'),
      tmdbId: r.get('tmdbId')?.toNumber ? r.get('tmdbId').toNumber() : r.get('tmdbId'),
      weight: r.get('weight'),
      coWatchCount: r.get('coWatchCount')?.toNumber ? r.get('coWatchCount').toNumber() : r.get('coWatchCount')
    }));
  } catch (err) {
    console.error(`⚠️ [SECONDARY NEO4J QUERY ERROR]:`, err.message);
    return [];
  } finally {
    await session.close();
  }
}

export { driver as secondaryNeo4jDriver };
