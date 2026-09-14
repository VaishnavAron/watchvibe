// src/controllers/genreController.js
import { getMoviesByGenre as getMoviesByGenreFromDB } from '../services/movieData.js';

export async function getMoviesByGenre(req, res) {
  const genre = req.query.genre?.trim();
  const limit = parseInt(req.query.limit) || 20;

  if (!genre) {
    return res.status(400).json({ error: 'Genre parameter is required' });
  }

  try {
    const movies = await getMoviesByGenreFromDB(genre, limit);
    console.log(`[GENRE] Fetched ${movies.length} movies for "${genre}" from Neo4j`);
    res.json({
      movies,
      totalCount: movies.length,
      currentPage: 1,
      totalPages: 1,
    });
  } catch (err) {
    console.error('[GENRE DB ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch movies by genre' });
  }
}