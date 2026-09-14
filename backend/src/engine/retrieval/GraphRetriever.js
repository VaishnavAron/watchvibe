// backend/src/engine/retrieval/GraphRetriever.js
import { driver } from "../../core/2_config.js";
import { formatNeo4jMovie } from "../../services/movieData.js";

const GENRE_SYNONYMS = {
  "sci-fi": "science fiction",
  "scifi": "science fiction",
  "science-fiction": "science fiction",
  "sf": "science fiction",
  "rom-com": "romance",
  "romcom": "romance",
  "patriotic": "patriotism",
  "patriot": "patriotism",
  "superheroes": "superhero",
  "time-loop": "time loop",
  "timeloop": "time loop",
  "mind-bending": "mind bending",
  "mindbending": "mind bending",
  "psychological thriller": "psychological",
  "historical": "history",
  "dark historical": "history",
  "war movie": "war",
  "high octane": "action",
  "high-octane": "action",
  "blockbuster": "action",
  "blockbusters": "action",
  "cyborgs": "cyborg",
  "androids": "android",
  "robots": "robot",
  "artificial intelligence": "artificial intelligence (a.i.)",
  "ai": "artificial intelligence (a.i.)",
};

/**
 * Clean Neo4j graph retriever for entities, directors, actors, and tags
 */
export class GraphRetriever {
  /**
   * Find movies by tags and genres with ALL or ANY boolean logic, anchor protection, and dynamic scoring
   */
  static async findMoviesByTags(terms = [], matchAll = true, limit = 40, anchorTerms = [], filters = {}) {
    if (!terms.length) return [];
    const mappedTerms = terms.map(t => GENRE_SYNONYMS[t.toLowerCase()] || t.toLowerCase());
    const mappedAnchors = (anchorTerms || []).map(t => GENRE_SYNONYMS[t.toLowerCase()] || t.toLowerCase());
    const operator = matchAll ? "ALL" : "ANY";
    
    // Build pushdown predicate clauses on m directly
    const moviePredicates = [];
    const params = {
      terms: mappedTerms,
      anchors: mappedAnchors,
      limit
    };

    if (typeof filters?.yearMin === "number") {
      moviePredicates.push("m.year >= toInteger($yearMin)");
      params.yearMin = filters.yearMin;
    }
    if (typeof filters?.yearMax === "number") {
      moviePredicates.push("m.year <= toInteger($yearMax)");
      params.yearMax = filters.yearMax;
    }
    if (typeof filters?.ratingMin === "number") {
      moviePredicates.push("m.rating >= toFloat($ratingMin)");
      params.ratingMin = filters.ratingMin;
    }
    if (filters?.region === "india" || filters?.region === "indian") {
      moviePredicates.push("m.original_language IN ['hi', 'te', 'ta', 'ml', 'kn', 'bn', 'mr', 'pa']");
    } else if (filters?.region === "south") {
      moviePredicates.push("m.original_language IN ['te', 'ta', 'ml', 'kn']");
    } else if (filters?.region === "north" || filters?.region === "bollywood") {
      moviePredicates.push("m.original_language = 'hi'");
    }

    const movieWhere = moviePredicates.length > 0 ? `WHERE ${moviePredicates.join(" AND ")}` : "";

    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const cypher = `
        MATCH (m:Movie)
        ${movieWhere}
        OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
        OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
        WITH m, collect(DISTINCT toLower(g.name)) AS genres, collect(DISTINCT toLower(t.name)) AS themes
        WITH m, genres, themes, genres + themes AS tags
        WHERE ${operator}(term IN $terms WHERE term IN tags OR any(tag IN tags WHERE tag CONTAINS term OR term CONTAINS tag))
          ${mappedAnchors.length > 0 ? "AND any(anchor IN $anchors WHERE anchor IN tags OR any(tag IN tags WHERE tag CONTAINS anchor OR anchor CONTAINS tag))" : ""}
        OPTIONAL MATCH (m)-[:DIRECTED]-(d:Director)
        OPTIONAL MATCH (m)-[:ACTED_IN]-(a:Actor)
        WITH m, genres, themes, tags,
             collect(DISTINCT d.name) AS directors, 
             collect(DISTINCT a.name) AS actors,
             [term IN $terms WHERE term IN tags OR any(tag IN tags WHERE tag CONTAINS term OR term CONTAINS tag)] AS matchedTerms
        RETURN m {
          .*,
          genres: genres,
          themes: themes,
          directors: directors,
          actors: actors
        } AS movie,
        size(matchedTerms) AS matchCount,
        matchedTerms
        ORDER BY size(matchedTerms) DESC, m.popularity DESC
        LIMIT toInteger($limit)
      `;

      const result = await session.run(cypher, params);

      return result.records.map(r => {
        const m = formatNeo4jMovie(r.get("movie"));
        const rawCount = r.get("matchCount");
        const matchCount = typeof rawCount?.toNumber === "function" ? rawCount.toNumber() : (Number(rawCount) || 1);
        const overlapRatio = mappedTerms.length > 0 ? (matchCount / mappedTerms.length) : 0.8;
        const popBoost = Math.min(0.08, Math.log10(Math.max(1, m.popularity || 0)) * 0.02);
        const dynamicScore = Math.min(0.98, parseFloat((0.65 + (overlapRatio * 0.25) + popBoost).toFixed(2)));

        return {
          ...m,
          score: dynamicScore,
          ragSource: `graph_tags_${operator.toLowerCase()}`,
          scoreBreakdown: {
            semanticSimilarity: parseFloat((0.70 + (overlapRatio * 0.20)).toFixed(2)),
            graphScore: parseFloat((overlapRatio * 0.95).toFixed(2)),
            userPreference: 0.85,
            popularity: m.popularity || 0
          },
          explanation: [`Graph Tag Match: ${(r.get("matchedTerms") || mappedTerms).slice(0, 3).join(", ")}`],
        };
      });
    } catch (err) {
      console.error("[GraphRetriever] findMoviesByTags error:", err.message);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Find movies by Director
   */
  static async findMoviesByDirector(directorName, limit = 25) {
    if (!directorName) return [];
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run(`
        MATCH (d:Director)-[:DIRECTED]->(m:Movie)
        WHERE toLower(d.name) CONTAINS toLower($name)
        OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
        OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
        WITH m, d.name AS directorName, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes
        RETURN m { .*, directors: [directorName], genres: genres, themes: themes } AS movie
        ORDER BY m.popularity DESC
        LIMIT toInteger($limit)
      `, { name: directorName.trim(), limit });

      return result.records.map(r => {
        const m = formatNeo4jMovie(r.get("movie"));
        return {
          ...m,
          score: 0.95,
          ragSource: "director_graph_traversal",
          scoreBreakdown: {
            semanticSimilarity: 0.90,
            graphScore: 0.98,
            userPreference: 0.90,
            popularity: m.popularity || 0
          },
          explanation: [`Directed by ${directorName}`]
        };
      });
    } catch (err) {
      console.error("[GraphRetriever] findMoviesByDirector error:", err.message);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Find movies by Title Pattern (e.g. Franchise matches like "Spider-Man", "Batman")
   */
  static async findMoviesByTitlePattern(pattern, limit = 25) {
    if (!pattern) return [];
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run(`
        MATCH (m:Movie)
        WHERE toLower(m.title) CONTAINS toLower($pattern)
        OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
        OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
        WITH m, collect(DISTINCT g.name) AS genres, collect(DISTINCT t.name) AS themes
        RETURN m { .*, genres: genres, themes: themes } AS movie
        ORDER BY m.popularity DESC
        LIMIT toInteger($limit)
      `, { pattern: pattern.trim(), limit });

      return result.records.map(r => {
        const m = formatNeo4jMovie(r.get("movie"));
        return {
          ...m,
          score: 0.96,
          ragSource: "franchise_title_match",
          scoreBreakdown: {
            semanticSimilarity: 0.95,
            graphScore: 0.98,
            userPreference: 0.90,
            popularity: m.popularity || 0
          },
          explanation: [`Franchise Title Match: ${pattern}`]
        };
      });
    } catch (err) {
      console.error("[GraphRetriever] findMoviesByTitlePattern error:", err.message);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Find movies similar to a reference movie via shared themes and genres in Neo4j
   */
  static async findSimilarByGraph(referenceTitle, limit = 25) {
    if (!referenceTitle) return [];
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run(`
        MATCH (ref:Movie) WHERE toLower(ref.title) = toLower($title)
        MATCH (ref)-[:EXPLORES]->(t:Theme)<-[:EXPLORES]-(m:Movie)
        WHERE m.title <> ref.title
        OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
        WITH m, count(DISTINCT t) AS sharedThemes, collect(DISTINCT t.name) AS themes, collect(DISTINCT g.name) AS genres
        RETURN m { .*, genres: genres, themes: themes } AS movie, sharedThemes
        ORDER BY sharedThemes DESC, m.rating DESC
        LIMIT toInteger($limit)
      `, { title: referenceTitle.trim(), limit });

      return result.records.map(r => {
        const m = formatNeo4jMovie(r.get("movie"));
        const shared = r.get("sharedThemes");
        return {
          ...m,
          score: 0.94,
          ragSource: "neo4j_thematic_graph",
          scoreBreakdown: {
            semanticSimilarity: 0.92,
            graphScore: 0.96,
            userPreference: 0.90,
            popularity: m.popularity || 0
          },
          explanation: [`Shares ${shared} core theme(s) with ${referenceTitle}`]
        };
      });
    } catch (err) {
      console.error("[GraphRetriever] findSimilarByGraph error:", err.message);
      return [];
    } finally {
      await session.close();
    }
  }
}
