// 5_graphBuilder.js - Fixed for null properties in MERGE
import { driver } from "../../src/core/2_config.js";

function normalizeEntity(entity) {
  if (entity?.movie?.title) return entity;
  return {
    movie: { 
      title: entity?.title ?? "", 
      year: entity?.year ?? null,
      tmdb_id: entity?.id ?? null
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
  };
}

async function buildGraph(entities) {
  console.log(`\nBuilding graph for ${entities.length} movies...`);
  const movies = entities.map(e => normalizeEntity(e));

  const session = driver.session();
  try {
    await session.run("CREATE INDEX IF NOT EXISTS FOR (m:Movie) ON (m.title)");
    await session.run("CREATE INDEX IF NOT EXISTS FOR (m:Movie) ON (m.tmdb_id)");
    await session.run("CREATE INDEX IF NOT EXISTS FOR (d:Director) ON (d.name)");
    await session.run("CREATE INDEX IF NOT EXISTS FOR (w:Writer) ON (w.name)");
    await session.run("CREATE INDEX IF NOT EXISTS FOR (a:Actor) ON (a.name)");
    await session.run("CREATE INDEX IF NOT EXISTS FOR (g:Genre) ON (g.name)");
    await session.run("CREATE INDEX IF NOT EXISTS FOR (t:Theme) ON (t.name)");
    await session.run("CREATE INDEX IF NOT EXISTS FOR (aw:Award) ON (aw.name, aw.category)");
    console.log("Indexes created.");
  } finally {
    await session.close();
  }

  const movieNodes = [];
  const directorNodes = new Map();
  const writerNodes = new Map();
  const actorNodes = new Map();
  const genreNodes = new Map();
  const themeNodes = new Map();
  const awardNodes = new Map();

  const directedRels = [], wroteRels = [], actedInRels = [];
  const belongsToRels = [], exploresRels = [], wonRels = [];

  for (const m of movies) {
    const title = m.movie.title;
    const year = m.movie.year ?? 0;
    const tmdb_id = m.movie.id;

    movieNodes.push({
      title, year, tmdb_id,
      poster_url: null,
      rating: m.rating,
      vote_count: m.vote_count,
      runtime: m.runtime,
      popularity: m.popularity,
      adult: m.adult,
      original_language: m.original_language,
      overview: m.overview,
    });

    if (m.director?.name && m.director.name !== "Unknown") {
      const dName = m.director.name;
      if (!directorNodes.has(dName)) directorNodes.set(dName, { name: dName });
      directedRels.push({ from: dName, to: title });
    }
    for (const w of m.writers) {
      if (!writerNodes.has(w)) writerNodes.set(w, { name: w });
      wroteRels.push({ from: w, to: title });
    }
    for (const a of m.actors) {
      if (!actorNodes.has(a)) actorNodes.set(a, { name: a });
      actedInRels.push({ from: a, to: title });
    }
    for (const g of m.genres) {
      if (!genreNodes.has(g)) genreNodes.set(g, { name: g });
      belongsToRels.push({ from: title, to: g });
    }
    for (const t of m.themes) {
      if (!themeNodes.has(t)) themeNodes.set(t, { name: t });
      exploresRels.push({ from: title, to: t });
    }
    for (const award of m.awards) {
      let awardType, category;
      const match = award.match(/^(.+?)\s*\((.+)\)$/);
      if (match) {
        awardType = match[1].trim();
        category = match[2].trim();
      } else {
        awardType = award.trim();
        category = "";
      }
      const key = `${awardType}|${category}`;
      if (!awardNodes.has(key)) awardNodes.set(key, { name: awardType, category });
      wonRels.push({ from: title, to: awardType, category });
    }
  }

  const tx = driver.session();
  try {
    // Movie: identifier = title, year (others set after)
    await batchInsert(tx, "Movie", movieNodes, 
      ["title", "year"],  // identifier properties
      ["tmdb_id", "poster_url", "rating", "vote_count", "runtime", "popularity", "adult", "original_language", "overview"]
    );
    // Other nodes: identifier = name
    await batchInsert(tx, "Director", Array.from(directorNodes.values()), ["name"], []);
    await batchInsert(tx, "Writer", Array.from(writerNodes.values()), ["name"], []);
    await batchInsert(tx, "Actor", Array.from(actorNodes.values()), ["name"], []);
    await batchInsert(tx, "Genre", Array.from(genreNodes.values()), ["name"], []);
    await batchInsert(tx, "Theme", Array.from(themeNodes.values()), ["name"], []);
    await batchInsert(tx, "Award", Array.from(awardNodes.values()), ["name", "category"], []);

    // Relationships (unchanged)
    await batchInsertRels(tx, "DIRECTED", "Director", "name", "Movie", "title", directedRels);
    await batchInsertRels(tx, "WROTE", "Writer", "name", "Movie", "title", wroteRels);
    await batchInsertRels(tx, "ACTED_IN", "Actor", "name", "Movie", "title", actedInRels);
    await batchInsertRels(tx, "BELONGS_TO", "Movie", "title", "Genre", "name", belongsToRels);
    await batchInsertRels(tx, "EXPLORES", "Movie", "title", "Theme", "name", exploresRels);
    await batchInsertRels(tx, "WON", "Movie", "title", "Award", "name", wonRels.map(r => ({ from: r.from, to: r.to })));

  } finally {
    await tx.close();
  }

  const statsSession = driver.session();
  try {
    const nodeCount = await statsSession.run("MATCH (n) RETURN count(n) AS count");
    const relCount = await statsSession.run("MATCH ()-[r]->() RETURN count(r) AS count");
    console.log("\nGraph built!");
    console.log(`Nodes: ${nodeCount.records[0].get("count")}`);
    console.log(`Relationships: ${relCount.records[0].get("count")}`);
  } finally {
    await statsSession.close();
  }
}

// Updated batchInsert: separate identifier props and optional props
async function batchInsert(tx, label, nodes, idProps, optionalProps = []) {
  if (nodes.length === 0) return;
  const chunkSize = 1000;
  for (let i = 0; i < nodes.length; i += chunkSize) {
    const chunk = nodes.slice(i, i + chunkSize);
    // Build MERGE pattern using only identifier properties
    const mergeProps = idProps.map(p => `${p}: node.${p}`).join(", ");
    // SET all properties (including identifiers, but that's fine)
    const setProps = [...idProps, ...optionalProps].map(p => `n.${p} = node.${p}`).join(", ");
    const query = `
      UNWIND $nodes AS node
      MERGE (n:${label} { ${mergeProps} })
      SET ${setProps}
    `;
    await tx.run(query, { nodes: chunk });
    console.log(`   ${label}: inserted ${Math.min(i + chunkSize, nodes.length)}/${nodes.length}`);
  }
}

// batchInsertRels remains the same
async function batchInsertRels(tx, relType, fromLabel, fromKey, toLabel, toKey, rels) {
  if (rels.length === 0) return;
  const chunkSize = 5000;
  for (let i = 0; i < rels.length; i += chunkSize) {
    const chunk = rels.slice(i, i + chunkSize);
    const query = `
      UNWIND $rels AS rel
      MATCH (a:${fromLabel} { ${fromKey}: rel.from })
      MATCH (b:${toLabel} { ${toKey}: rel.to })
      MERGE (a)-[:${relType}]->(b)
    `;
    await tx.run(query, { rels: chunk });
    console.log(`   ${relType}: inserted ${Math.min(i + chunkSize, rels.length)}/${rels.length}`);
  }
}

export { buildGraph };