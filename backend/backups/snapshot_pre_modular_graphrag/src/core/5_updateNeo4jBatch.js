// ensureAllMoviesInNeo4j.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const INPUT = path.resolve(__dirname, '../../data/enriched_all_movies_final.json');

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const moviesRaw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  console.log(`Loaded ${moviesRaw.length} movies. Building normalized list...`);

  // Normalize each movie
  const movies = moviesRaw.map(entity => {
    if (entity?.movie?.title) return entity;
    return {
      movie: {
        title: entity?.title ?? "",
        year: entity?.year ?? null,
        id: entity?.id ?? null,
      },
      director: { name: entity?.director ?? entity?.director?.name ?? "Unknown" },
      writers: Array.isArray(entity?.writers) ? entity.writers : [],
      actors: Array.isArray(entity?.actors) ? entity.actors : [],
      genres: Array.isArray(entity?.genres) ? entity.genres : [],
      themes: Array.isArray(entity?.themes) ? entity.themes : [],
      awards: Array.isArray(entity?.awards) ? entity.awards : [],
      overview: entity?.overview ?? "",
      rating: entity?.rating ?? 0,
      vote_count: entity?.vote_count ?? 0,
      runtime: entity?.runtime ?? 0,
      popularity: entity?.popularity ?? 0,
      adult: entity?.adult ?? false,
      original_language: entity?.original_language ?? "Unknown",
      semantic_tags: entity?.semantic_tags || [],
      mood: entity?.mood || [],
      enriched_overview: entity?.enriched_overview || "",
    };
  });

  const session = driver.session();

  // ── 1. Indexes ──
  console.log('Creating indexes...');
  const indexQueries = [
    "CREATE INDEX IF NOT EXISTS FOR (m:Movie) ON (m.tmdb_id)",
    "CREATE INDEX IF NOT EXISTS FOR (m:Movie) ON (m.title)",
    "CREATE INDEX IF NOT EXISTS FOR (d:Director) ON (d.name)",
    "CREATE INDEX IF NOT EXISTS FOR (w:Writer) ON (w.name)",
    "CREATE INDEX IF NOT EXISTS FOR (a:Actor) ON (a.name)",
    "CREATE INDEX IF NOT EXISTS FOR (g:Genre) ON (g.name)",
    "CREATE INDEX IF NOT EXISTS FOR (t:Theme) ON (t.name)",
  ];
  for (const q of indexQueries) {
    await session.run(q).catch(() => {});
  }
  console.log('Indexes ready.\n');

  // ── 2. MERGE all Movie nodes in batches ──
  console.log('Creating/Updating Movie nodes...');
  const BATCH = 500;
  for (let i = 0; i < movies.length; i += BATCH) {
    const batch = movies.slice(i, i + BATCH);
    const params = batch.map(m => ({
      tmdb_id: m.movie.id,
      title: m.movie.title,
      year: m.movie.year,
      rating: m.rating,
      vote_count: m.vote_count,
      runtime: m.runtime,
      popularity: m.popularity,
      adult: m.adult,
      language: m.original_language,
      overview: m.overview,
      semantic_tags: m.semantic_tags,
      mood: m.mood,
      enriched_overview: m.enriched_overview,
    }));

    await session.run(
      `UNWIND $params AS p
       MERGE (m:Movie {tmdb_id: p.tmdb_id})
       ON CREATE SET m.title = p.title, m.year = p.year, m.rating = p.rating,
                     m.vote_count = p.vote_count, m.runtime = p.runtime,
                     m.popularity = p.popularity, m.adult = p.adult,
                     m.original_language = p.language, m.overview = p.overview,
                     m.semantic_tags = p.semantic_tags, m.mood = p.mood,
                     m.enriched_overview = p.enriched_overview
       ON MATCH SET m.semantic_tags = p.semantic_tags, m.mood = p.mood,
                   m.enriched_overview = p.enriched_overview`,
      { params }
    );
    console.log(`   Movies ${Math.min(i + BATCH, movies.length)}/${movies.length}`);
  }

  // ── 3. Build relationship data ──
  console.log('\nCollecting relationship data...');
  const directedRels = [], wroteRels = [], actedInRels = [], belongsToRels = [], exploresRels = [];
  const directorsSet = new Set(), writersSet = new Set(), actorsSet = new Set(), genresSet = new Set(), themesSet = new Set();

  for (const m of movies) {
    const tid = m.movie.id;
    if (m.director?.name && m.director.name !== "Unknown") {
      directorsSet.add(m.director.name);
      directedRels.push({ name: m.director.name, tmdb_id: tid });
    }
    for (const w of m.writers) {
      writersSet.add(w);
      wroteRels.push({ name: w, tmdb_id: tid });
    }
    for (const a of m.actors) {
      actorsSet.add(a);
      actedInRels.push({ name: a, tmdb_id: tid });
    }
    for (const g of m.genres) {
      genresSet.add(g);
      belongsToRels.push({ name: g, tmdb_id: tid });
    }
    for (const t of m.themes) {
      themesSet.add(t);
      exploresRels.push({ name: t, tmdb_id: tid });
    }
  }

  // ── 4. Create related nodes in bulk ──
  const nodeTypes = [
    ['Director', [...directorsSet].map(name => ({ name }))],
    ['Writer', [...writersSet].map(name => ({ name }))],
    ['Actor', [...actorsSet].map(name => ({ name }))],
    ['Genre', [...genresSet].map(name => ({ name }))],
    ['Theme', [...themesSet].map(name => ({ name }))],
  ];

  for (const [label, nodes] of nodeTypes) {
    console.log(`Creating ${nodes.length} ${label} nodes...`);
    for (let i = 0; i < nodes.length; i += BATCH) {
      await session.run(
        `UNWIND $nodes AS n
         MERGE (x:${label} {name: n.name})`,
        { nodes: nodes.slice(i, i + BATCH) }
      );
    }
  }

  // ── 5. Create relationships in bulk ──
  console.log('\nCreating relationships...');
  const relConfigs = [
    ['Director', 'DIRECTED', directedRels],
    ['Writer', 'WROTE', wroteRels],
    ['Actor', 'ACTED_IN', actedInRels],
    ['Genre', 'BELONGS_TO', belongsToRels],
    ['Theme', 'EXPLORES', exploresRels],
  ];

  for (const [label, relType, rels] of relConfigs) {
    console.log(`Creating ${relType} relationships (${rels.length} total)...`);
    for (let i = 0; i < rels.length; i += BATCH) {
      const batch = rels.slice(i, i + BATCH);
      await session.run(
        `UNWIND $rels AS r
         MATCH (a:${label} {name: r.name})
         MATCH (m:Movie {tmdb_id: r.tmdb_id})
         MERGE (a)-[:${relType}]->(m)`,
        { rels: batch }
      );
    }
    console.log(`   ${relType} relationships done.`);
  }

  await session.close();
  await driver.close();
  console.log('\n✅ All movies and relationships ensured in Neo4j!');
}

main().catch(console.error);