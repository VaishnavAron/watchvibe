// 6_reupsertBatchPinecone.js
// Place this file in src/core/ and run: node 6_reupsertBatchPinecone.js

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { embedTexts, pineconeIndex } from './2_config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const INPUT = path.join(__dirname, '..', '..', 'data', 'enriched_all_movies_final.json');
const CHECKPOINT_FILE = path.join(__dirname, '..', '..', 'data', 'reupsert_checkpoint.json');

const EMBED_BATCH_SIZE = 20;
const UPSERT_BATCH_SIZE = 100;       // upsert every 100 vectors

// ── Enriched chunk builder ──
function buildMovieChunkFromMeta(title, year, meta) {
  const safeTitle = title || 'Unknown';
  const safeYear = year ?? 'Unknown';
  const director = meta.director?.name || meta.director || 'Unknown';
  const writers = (meta.writers || []).join(', ') || 'Unknown';
  const cast = (meta.actors || []).join(', ') || 'Unknown';
  const genres = (meta.genres || []).join(', ') || 'Unknown';
  const themes = (meta.themes || []).join(', ');
  const overview = meta.overview || '';
  const rating = meta.rating ?? 0;
  const voteCount = meta.vote_count ?? 0;
  const runtime = meta.runtime ?? 0;
  const popularity = meta.popularity ?? 0;
  const adult = meta.adult ? 'Adult' : 'Family Friendly';
  const language = meta.original_language || 'Unknown';

  const lines = [
    `Movie Title: ${safeTitle}`,
    `Release Year: ${safeYear}`,
    `Director: ${director}`,
    `Writers: ${writers}`,
    `Cast: ${cast}`,
    `Genres: ${genres}`,
    `Themes: ${themes}`,
  ];

  if (meta.semantic_tags?.length) {
    lines.push(`Semantic Tags: ${meta.semantic_tags.join(', ')}`);
  }
  if (meta.mood?.length) {
    lines.push(`Mood: ${meta.mood.join(', ')}`);
  }
  if (meta.enriched_overview) {
    lines.push(`Enriched Overview: ${meta.enriched_overview}`);
  } else if (overview) {
    lines.push(`Overview: ${overview}`);
  }

  lines.push(
    `Rating: ${rating}/10 (${voteCount} votes)`,
    `Runtime: ${runtime} minutes`,
    `Popularity Score: ${popularity}`,
    `Audience: ${adult}`,
    `Original Language: ${language}`
  );

  return lines.join('\n');
}

function createDeterministicId(movie) {
  const title = movie.movie?.title || movie.title || 'unknown';
  const year = movie.movie?.year ?? movie.year ?? new Date().getFullYear();
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${cleanTitle}_${year}`;
}

// ── Upsert a single batch and save checkpoint ──
async function upsertBatch(vectors, startIdx, movies, checkpointFile) {
  await pineconeIndex.upsert({ records: vectors });
  const upsertedCount = startIdx + vectors.length;
  console.log(`Upserted ${Math.min(upsertedCount, movies.length)}/${movies.length} vectors`);
  fs.writeFileSync(checkpointFile, JSON.stringify({ lastIndex: startIdx + vectors.length - 1 }));
}

// ── Main ──
async function main() {
  console.log('🚀 Starting Pinecone re‑upsert (streaming mode)...\n');

  const movies = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  console.log(`Loaded ${movies.length} enriched movies.`);

  let lastUpsertedIndex = -1;
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const ck = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    lastUpsertedIndex = ck.lastIndex ?? -1;
    console.log(`Resuming after index ${lastUpsertedIndex}`);
  }

  const startIdx = lastUpsertedIndex + 1;
  const remaining = movies.slice(startIdx);
  console.log(`Processing ${remaining.length} movies (starting at index ${startIdx})...\n`);

  let embedBuffer = [];      // holds vectors from the current embed batch, before upsert
  let globalIdx = startIdx;  // current index in the original movies array

  for (let i = 0; i < remaining.length; i += EMBED_BATCH_SIZE) {
    const movieBatch = remaining.slice(i, i + EMBED_BATCH_SIZE);

    const texts = movieBatch.map(m => {
      const title = m.movie?.title || m.title;
      const year = m.movie?.year ?? m.year;
      return buildMovieChunkFromMeta(title, year, m);
    });

    const embeddings = await embedTexts(texts);

    embeddings.forEach((embedding, batchIndex) => {
      const movie = movieBatch[batchIndex];
      const genres = movie.genres || [];
      const themes = movie.themes || [];

      embedBuffer.push({
        id: createDeterministicId(movie),
        values: embedding,
        metadata: {
          title: movie.movie?.title || movie.title,
          year: movie.movie?.year ?? movie.year ?? 0,
          director: movie.director?.name || movie.director || 'Unknown',
          genres: Array.isArray(genres) ? genres : [],
          themes: Array.isArray(themes) ? themes : [],
          actors: (movie.actors || []).slice(0, 10),
          rating: movie.rating ?? 0,
          vote_count: movie.vote_count ?? 0,
          runtime: movie.runtime ?? 0,
          popularity: movie.popularity ?? 0,
          adult: movie.adult ?? false,
          original_language: movie.original_language || 'en',
          text: texts[batchIndex].substring(0, 2000),
          semantic_tags: movie.semantic_tags || [],
          mood: movie.mood || [],
          enriched_overview: movie.enriched_overview || '',
          poster_url: movie.poster_url || '',
        },
      });
    });

    globalIdx = startIdx + i + EMBED_BATCH_SIZE;
    console.log(`Embedded ${Math.min(globalIdx, movies.length)}/${movies.length} movies`);

    // Upsert immediately whenever we have enough vectors
    while (embedBuffer.length >= UPSERT_BATCH_SIZE) {
      const batch = embedBuffer.splice(0, UPSERT_BATCH_SIZE);
      await upsertBatch(batch, startIdx + i + EMBED_BATCH_SIZE - embedBuffer.length - batch.length, movies, CHECKPOINT_FILE);
    }
  }

  // Flush remaining vectors
  if (embedBuffer.length > 0) {
    await upsertBatch(embedBuffer, movies.length - embedBuffer.length, movies, CHECKPOINT_FILE);
  }

  console.log(`\n✅ All ${movies.length} movies upserted successfully!`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});