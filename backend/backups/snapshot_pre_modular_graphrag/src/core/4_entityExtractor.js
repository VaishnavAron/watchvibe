// 4_entityExtractor.js - Normalizes movie objects (from CSV or JSON)
import fs from "fs";
import path from "path";
import { rootDir } from "../../src/core/2_config.js";

function toArray(value) {
  return Array.isArray(value)
    ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeMovie(movie) {
  const title = String(movie.movie?.title ?? movie.title ?? "").trim();
  const year = Number(movie.movie?.year ?? movie.year ?? null);

  // Director name
  let directorName = "Unknown";
  if (movie.director) {
    if (typeof movie.director === 'object' && movie.director.name) {
      directorName = String(movie.director.name).trim();
    } else if (typeof movie.director === 'string') {
      directorName = movie.director.trim();
    }
  }
  if (!directorName && movie.movie?.director) {
    if (typeof movie.movie.director === 'object' && movie.movie.director.name) {
      directorName = String(movie.movie.director.name).trim();
    } else if (typeof movie.movie.director === 'string') {
      directorName = movie.movie.director.trim();
    }
  }

  if (!title) return null;

  // Extract new fields
  const writers = toArray(movie.writers);
  const actors = toArray(movie.actors);
  const genres = toArray(movie.genres);
  const themes = toArray(movie.themes);
  const awards = toArray(movie.awards);
  const overview = String(movie.overview ?? "").trim();
  const rating = typeof movie.rating === 'number' ? movie.rating : 0;
  const voteCount = typeof movie.vote_count === 'number' ? movie.vote_count : 0;
  const runtime = typeof movie.runtime === 'number' ? movie.runtime : 0;
  const popularity = typeof movie.popularity === 'number' ? movie.popularity : 0;
  const adult = !!movie.adult;
  const originalLanguage = String(movie.original_language ?? "Unknown").trim();

  return {
    movie: { title, year: Number.isFinite(year) ? year : null },
    director: { name: directorName || "Unknown" },
    writers,
    actors,
    genres,
    themes,
    awards,
    overview,
    rating,
    vote_count: voteCount,
    runtime,
    popularity,
    adult,
    original_language: originalLanguage,
  };
}

function resolveJsonPath(inputPath) {
  const candidates = [
    inputPath,
    path.join(rootDir, "data", "movies.json"),
    path.join(rootDir, "Lecture 19", "data", "movies.json"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Could not find JSON dataset. Checked: ${candidates.join(", ")}`);
  return found;
}

async function extractAllEntities(jsonPath) {
  const resolvedPath = resolveJsonPath(jsonPath);
  console.log(`Loading movie data from: ${resolvedPath}`);
  const raw = fs.readFileSync(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("movies.json must contain an array.");
  const entities = parsed.map(normalizeMovie).filter(Boolean);
  console.log(`Loaded ${entities.length} movies.`);
  return entities;
}

export { extractAllEntities, normalizeMovie, resolveJsonPath };