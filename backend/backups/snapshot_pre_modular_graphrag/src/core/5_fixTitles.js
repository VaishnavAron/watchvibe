// fixTitles.js
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

async function main() {
  const movies = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const session = driver.session();

  console.log(`Fixing titles for ${movies.length} movies...`);

  const BATCH = 500;
  for (let i = 0; i < movies.length; i += BATCH) {
    const batch = movies.slice(i, i + BATCH);
    const params = batch.map(m => ({
      tmdb_id: m.movie?.id || m.id,
      title: m.movie?.title || m.title,
      year: m.movie?.year ?? m.year ?? 0,
      rating: m.rating ?? 0,
      vote_count: m.vote_count ?? 0,
      runtime: m.runtime ?? 0,
      popularity: m.popularity ?? 0,
      adult: m.adult ?? false,
      language: m.original_language || 'en',
      overview: m.overview || '',
      semantic_tags: m.semantic_tags || [],
      mood: m.mood || [],
      enriched_overview: m.enriched_overview || '',
    }));

    await session.run(
      `UNWIND $params AS p
       MATCH (m:Movie {tmdb_id: p.tmdb_id})
       SET m.title = p.title,
           m.year = p.year,
           m.rating = p.rating,
           m.vote_count = p.vote_count,
           m.runtime = p.runtime,
           m.popularity = p.popularity,
           m.adult = p.adult,
           m.original_language = p.language,
           m.overview = p.overview,
           m.semantic_tags = p.semantic_tags,
           m.mood = p.mood,
           m.enriched_overview = p.enriched_overview`,
      { params }
    );
    console.log(`   Fixed ${Math.min(i + BATCH, movies.length)}/${movies.length}`);
  }

  await session.close();
  await driver.close();
  console.log('✅ All movie titles corrected!');
}

main().catch(console.error);