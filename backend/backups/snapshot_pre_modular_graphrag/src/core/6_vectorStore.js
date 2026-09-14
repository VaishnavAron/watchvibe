// =====================================================================
// 6_vectorStore.js - JSON movies -> Ollama embeddings -> Pinecone
// =====================================================================
//
// ADJUSTED FOR YOUR DATA (no keywords/themes)
//   - genres stored as array (enables $in filter)
//   - deterministic ID = title_year
//   - full text chunk embedded + stored in metadata
// =====================================================================

import fs from "fs";
import { embedTexts, pineconeIndex } from "../../src/core/2_config.js";
import { normalizeMovie, resolveJsonPath } from "../../src/core/4_entityExtractor.js";

const EMBED_BATCH_SIZE = 20;
const UPSERT_BATCH_SIZE = 100;

/**
 * Build the text chunk that will be embedded.
 */
function buildMovieChunk(movie) {
  const title = movie.movie.title;
  const year = movie.movie.year ?? "Unknown";
  const director = movie.director?.name || "Unknown";
  const cast = movie.cast?.length > 0 ? movie.cast.join(", ") : "Unknown";
  const genres = movie.genres?.length > 0 ? movie.genres.join(", ") : "Unknown";
  const overview = movie.overview || `${title} is a ${genres} movie.`;
  
  const rating = movie.rating ?? movie.vote_average ?? 0;
  const runtime = movie.runtime ?? 0;
  const writers = movie.writers?.length > 0 ? movie.writers.join(", ") : "Unknown";
  const popularity = movie.popularity ?? 0;
  const adult = movie.adult ? "Adult" : "Family Friendly";
  const language = movie.original_language ?? "Unknown";
  const voteCount = movie.vote_count ?? 0;

  return [
    `Movie Title: ${title}`,
    `Release Year: ${year}`,
    `Director: ${director}`,
    `Writers: ${writers}`,
    `Cast: ${cast}`,
    `Genres: ${genres}`,
    `Overview: ${overview}`,
    `Rating: ${rating}/10 (${voteCount} votes)`,
    `Runtime: ${runtime} minutes`,
    `Popularity Score: ${popularity}`,
    `Audience: ${adult}`,
    `Original Language: ${language}`,
  ].join("\n");
}

/**
 * Deterministic ID: title_year (sanitized)
 * Example: "inception_2010"
 */
function createDeterministicId(movie) {
  const title = movie.movie.title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const year = movie.movie.year ?? "unknown";
  return `${title}_${year}`;
}

async function loadMovies(dataSource) {
  if (Array.isArray(dataSource)) {
    return dataSource.map(normalizeMovie).filter(Boolean);
  }
  const jsonPath = resolveJsonPath(dataSource);
  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("movies.json must contain an array of movie objects.");
  }
  return parsed.map(normalizeMovie).filter(Boolean);
}

async function buildVectorStore(dataSource) {
  const movies = await loadMovies(dataSource);
  console.log(`\nBuilding vector store for ${movies.length} movies...`);

  const movieDocuments = movies.map(buildMovieChunk);
  const vectors = [];

  for (let i = 0; i < movieDocuments.length; i += EMBED_BATCH_SIZE) {
    const textBatch = movieDocuments.slice(i, i + EMBED_BATCH_SIZE);
    const movieBatch = movies.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embedTexts(textBatch);

    embeddings.forEach((embedding, batchIndex) => {
      const movie = movieBatch[batchIndex];
      const text = textBatch[batchIndex];

      // --- Convert genres to array (critical) ---
      let genresArray = movie.genres || [];
      if (typeof genresArray === "string") {
        genresArray = genresArray.split(",").map(g => g.trim());
      }
      if (!Array.isArray(genresArray)) genresArray = [];

      // Top 3 actors for metadata (optional)
      const topActors = movie.cast?.slice(0, 3) || [];

      vectors.push({
        id: createDeterministicId(movie),
        values: embedding,
        metadata: {
          title: movie.movie.title,
          year: movie.movie.year ?? 0,
          director: movie.director?.name || "Unknown",
          genres: genresArray,          // ✅ ARRAY – enables $in filter
          actors: topActors,            // array of strings
          rating: movie.rating ?? movie.vote_average ?? 0,
          runtime: movie.runtime ?? 0,
          popularity: movie.popularity ?? 0,
          adult: movie.adult ?? false,
          language: movie.original_language ?? "",
          text: text.substring(0, 2000), // full chunk truncated
        },
      });
    });

    console.log(
      `Embedded ${Math.min(i + EMBED_BATCH_SIZE, movieDocuments.length)}/${movieDocuments.length} movies`
    );
  }

  // Upsert in batches
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    if (batch.length === 0) continue;
    await pineconeIndex.upsert({ records: batch });
    console.log(
      `Upserted ${Math.min(i + UPSERT_BATCH_SIZE, vectors.length)}/${vectors.length} vectors`
    );
  }

  const stats = await pineconeIndex.describeIndexStats();
  console.log(`Vector store ready. Pinecone total vectors: ${stats.totalRecordCount || 0}`);
}

export { buildVectorStore, buildMovieChunk };