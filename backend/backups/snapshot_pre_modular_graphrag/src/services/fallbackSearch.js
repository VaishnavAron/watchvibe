// src/services/fallbackSearch.js
import { driver } from '../core/2_config.js';
import { formatNeo4jMovie } from './movieData.js';

export async function fallbackSearch(query) {
  if (!query) return [];
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      WHERE toLower(m.title) CONTAINS toLower($q) 
         OR toLower(m.overview) CONTAINS toLower($q)
      OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
      OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
      WITH m, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes
      RETURN m {
        .*,
        genres: genres,
        themes: themes
      } AS movie
      ORDER BY m.popularity DESC
      LIMIT 8
    `, { q: query.trim() });

    return result.records.map(r => formatNeo4jMovie(r.get('movie')));
  } catch (err) {
    console.error('[FALLBACK DB ERROR]', err);
    return []; // Returns empty array so .slice() won't crash
  } finally {
    await session.close();
  }
}

export async function getReferenceMovieFromQuery(query) {
  if (!query) return null;
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      WHERE toLower(m.title) CONTAINS toLower($q)
      RETURN m { .* } AS movie
      ORDER BY m.popularity DESC
      LIMIT 1
    `, { q: query.trim() });
    
    if (result.records.length === 0) return null;
    return formatNeo4jMovie(result.records[0].get('movie'));
  } catch (err) {
    console.error('[REF MOVIE DB ERROR]', err);
    return null;
  } finally {
    await session.close();
  }
}