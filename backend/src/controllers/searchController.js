import { searchMoviesInDB } from '../services/movieData.js';

export async function searchMovies(req, res) {
  const query = req.query.q?.trim();
  console.log(`[SEARCH] Query: "${query}"`);

  if (!query) return res.json([]);

  try {
    const results = await searchMoviesInDB(query, 20);
    console.log(`[SEARCH] Found ${results.length} results from Neo4j`);
    res.json(results);
  } catch (err) {
    console.error('[SEARCH DB ERROR]', err);
    res.status(500).json({ error: 'Search failed' });
  }
}