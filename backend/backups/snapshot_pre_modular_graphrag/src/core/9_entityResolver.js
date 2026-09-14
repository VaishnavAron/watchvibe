// =====================================================================
// 9_entityResolver.js - EXTRACT + RESOLVE ENTITIES
// =====================================================================
//
// This file does two jobs for every user query:
//   1. Ask the LLM which entity words are present in the question.
//   2. Resolve those words against Neo4j so later steps know whether
//      "Christopher Nolan" is a Director, Movie, Actor, etc.
//
// The extra JSON parsing helpers below exist because local LLMs often
// add friendly text such as "Here is the JSON:" before the real array.
// We strip that wrapper and keep only the valid JSON payload.
// =====================================================================

import { llm, driver } from "../../src/core/2_config.js";

const NODE_TYPES = [
  { label: "Movie", property: "title" },
  { label: "Director", property: "name" },
  { label: "Actor", property: "name" },
  { label: "Genre", property: "name" },
  { label: "Theme", property: "name" },
  { label: "Award", property: "name" },
];

function responseToText(content) {
  if (Array.isArray(content)) {
    return content
      .filter((block) => typeof block === "string" || block.type === "text")
      .map((block) => (typeof block === "string" ? block : block.text))
      .join("\n");
  }

  return String(content ?? "");
}

function extractFirstJsonBlock(text) {
  const cleaned = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  const startIndex = cleaned.search(/[\[{]/);

  if (startIndex === -1) {
    throw new Error("No JSON block found in model response.");
  }

  const opener = cleaned[startIndex];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;

    if (depth === 0) {
      return cleaned.slice(startIndex, i + 1);
    }
  }

  throw new Error("Incomplete JSON block in model response.");
}

function parseJsonArrayResponse(content) {
  const text = responseToText(content);
  const jsonBlock = extractFirstJsonBlock(text);
  const parsed = JSON.parse(jsonBlock);
  return Array.isArray(parsed) ? parsed : [];
}

async function extractEntities(query) {
  const response = await llm.invoke([
    {
      role: "system",
      content: `You extract entity names from movie-related queries.

Extract ALL names, titles, and specific terms from the query.
Do NOT extract generic words like "movies", "recommend", "find", "show".
Do NOT extract adjectives like "good", "best", "latest".
DO extract: person names, movie titles, genre names, theme names, award names.

Respond ONLY with a JSON array of strings. No markdown, no backticks.

Examples:
"Movies directed by Christopher Nolan" -> ["Christopher Nolan"]
"Action movies with Tom Hardy" -> ["Action", "Tom Hardy"]
"How is DiCaprio related to Nolan?" -> ["DiCaprio", "Nolan"]
"Tell me about Inception" -> ["Inception"]
"Movies like Inception" -> ["Inception"]
"Sci-fi movies that won Oscar" -> ["Sci-fi", "Oscar"]
"Recommend me a good thriller" -> ["thriller"]
"Movies about dreams and reality" -> ["dreams", "reality"]`,
    },
    { role: "human", content: query },
  ]);

  try {
    return parseJsonArrayResponse(response.content);
  } catch (err) {
    console.warn("Warning: entity extraction JSON parsing failed, returning empty array.");
    return [];
  }
}

async function resolveEntity(entityName) {
  const session = driver.session({ defaultAccessMode: "READ" });
  const matches = [];

  try {
    for (const { label, property } of NODE_TYPES) {
      const exactResult = await session.run(
        `MATCH (n:${label})
         WHERE toLower(n.${property}) = toLower($name)
         RETURN n.${property} AS nodeName, labels(n)[0] AS label
         LIMIT 5`,
        { name: entityName }
      );

      if (exactResult.records.length > 0) {
        for (const record of exactResult.records) {
          matches.push({
            searchTerm: entityName,
            label: record.get("label"),
            nodeName: record.get("nodeName"),
            matchType: "exact",
          });
        }
        continue;
      }

      const partialResult = await session.run(
        `MATCH (n:${label})
         WHERE toLower(n.${property}) CONTAINS toLower($name)
         RETURN n.${property} AS nodeName, labels(n)[0] AS label
         LIMIT 5`,
        { name: entityName }
      );

      for (const record of partialResult.records) {
        matches.push({
          searchTerm: entityName,
          label: record.get("label"),
          nodeName: record.get("nodeName"),
          matchType: "partial",
        });
      }
    }
  } finally {
    await session.close();
  }

  const exactMatches = matches.filter((match) => match.matchType === "exact");
  return exactMatches.length > 0 ? exactMatches : matches;
}

async function resolveQueryEntities(query) {
  console.log("   Step 1: Extracting entities from query...");
  const entityNames = await extractEntities(query);
  console.log(`   Found: [${entityNames.join(", ")}]`);

  if (entityNames.length === 0) {
    return { query, entities: [], unresolved: [] };
  }

  console.log("   Step 2: Resolving entities in Neo4j...");
  const resolved = [];
  const unresolved = [];

  for (const name of entityNames) {
    const matches = await resolveEntity(name);

    if (matches.length > 0) {
      for (const match of matches) {
        resolved.push(match);
        console.log(`   \"${name}\" -> ${match.label} (${match.nodeName}) [${match.matchType}]`);
      }
    } else {
      unresolved.push(name);
      console.log(`   \"${name}\" -> not found in graph`);
    }
  }

  return { query, entities: resolved, unresolved };
}

export { resolveQueryEntities, resolveEntity };
