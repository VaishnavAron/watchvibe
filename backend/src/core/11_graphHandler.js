// =====================================================================
// 11_graphHandler.js - UNIFIED GRAPH QUERY HANDLER (with structured output)
// =====================================================================

import { driver, llm } from "../../src/core/2_config.js";
import { buildCypher } from "../../src/core/8_cypherTemplates.js";

function responseToText(content) {
  if (Array.isArray(content)) {
    return content
      .filter((block) => typeof block === "string" || block.type === "text")
      .map((block) => (typeof block === "string" ? block : block.text))
      .join("\n");
  }
  return String(content ?? "");
}

function extractFirstJsonObject(text) {
  const cleaned = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  const startIndex = cleaned.indexOf("{");
  if (startIndex === -1) throw new Error("No JSON object found.");
  let depth = 0, inString = false, isEscaped = false;
  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      if (isEscaped) isEscaped = false;
      else if (char === "\\") isEscaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return cleaned.slice(startIndex, i + 1);
  }
  throw new Error("Incomplete JSON object.");
}

// function normalizePlan(plan) {
//   const normalizedSteps = Array.isArray(plan?.steps)
//     ? plan.steps.map((step) => {
//         if (!step?.type) return step;
//         const normalizedType = step.type === "project" ? "projection" : step.type;
//         return { ...step, type: normalizedType };
//       })
//     : [];
//   return { steps: normalizedSteps };
// }

function normalizePlan(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps.map(step => {
    if (!step?.type) return step;

    const normalized = { ...step };

    // ----- Fix sort steps: convert 'order' to 'direction' and uppercase -----
    if (step.type === "sort") {
      if (step.order !== undefined && step.direction === undefined) {
        normalized.direction = String(step.order).toUpperCase();
        delete normalized.order;
      }
      if (normalized.direction) {
        normalized.direction = normalized.direction.toUpperCase();
        // Ensure direction is valid (ASC/DESC)
        if (!["ASC", "DESC"].includes(normalized.direction)) {
          normalized.direction = "ASC";
        }
      }
    }

    // ----- For traversal steps: no direction validation needed (buildCypher uses ->) -----
    // ----- Other step types remain unchanged -----
    return normalized;
  }) : [];

  return { steps };
}

async function createQueryPlan(query, resolvedEntities) {
  const entityContext = resolvedEntities.entities
    .map((entity) => `- ${entity.label} with ${entity.label === "Movie" ? "title" : "name"} = "${entity.nodeName}" (user said "${entity.searchTerm}")`)
    .join("\n");
  const unresolvedContext = resolvedEntities.unresolved.length > 0
    ? `\nNOT FOUND in database: ${resolvedEntities.unresolved.join(", ")}`
    : "";

  const prompt = `You are a query planner for a movie knowledge graph.

RESOLVED ENTITIES (already verified in the database):
${entityContext}${unresolvedContext}

IMPORTANT:
- Use the exact node names shown above.
- Return ONLY JSON.
- Do not explain the plan.
- Do not prefix the answer with any prose.

- For traversal steps, "from" and "to" must be node LABELS from the schema (Movie, Director, Actor, Genre, Theme, Award).
- Do NOT use entity names (like "Jawan") as labels.
- To filter on a specific entity, add a separate filter step using the correct property (e.g., Movie.title = "Jawan").

GRAPH SCHEMA:
Nodes: Movie(title,year), Director(name), Actor(name), Genre(name), Theme(name), Award(name,category)
Relationships: Director-[:DIRECTED]->Movie, Actor-[:ACTED_IN]->Movie, Movie-[:BELONGS_TO]->Genre, Movie-[:EXPLORES]->Theme, Movie-[:WON]->Award

OUTPUT a JSON plan using ONLY these step types:
1. traversal
2. filter
3. projection
4. aggregation
5. sort
6. limit
7. describe
8. path

Examples:
{"steps":[
  {"type":"traversal","from":"Director","rel":"DIRECTED","to":"Movie"},
  {"type":"filter","field":"Director.name","op":"=","value":"Christopher Nolan"},
  {"type":"projection","fields":["Movie.title","Movie.year"],"distinct":true}
]}

{"steps":[
  {"type":"traversal","from":"Movie","rel":"DIRECTED","to":"Director"},
  {"type":"filter","field":"Movie.title","op":"=","value":"Inception"},
  {"type":"projection","fields":["Director.name"]}
]}`;

  const response = await llm.invoke([
    { role: "system", content: prompt },
    { role: "human", content: query },
  ]);

  try {
    const rawText = responseToText(response.content);
    const jsonObject = extractFirstJsonObject(rawText);
    const parsed = JSON.parse(jsonObject);
    const normalized = normalizePlan(parsed);
    if (!Array.isArray(normalized.steps) || normalized.steps.length === 0) {
      throw new Error("Planner returned no executable steps.");
    }
    return normalized;
  } catch (err) {
    const rawText = responseToText(response.content);
    console.error("Failed to parse plan:", rawText.substring(0, 400));
    throw new Error("Query planning failed. Please rephrase your question.");
  }
}

async function executeDescribe(label, name) {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    let cypher, params = { name };
    switch (label) {
      case "Movie":
      cypher = `
        MATCH (m:Movie {title: $name})
        OPTIONAL MATCH (d:Director)-[:DIRECTED]->(m)
        OPTIONAL MATCH (a:Actor)-[:ACTED_IN]->(m)
        OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
        OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
        OPTIONAL MATCH (m)-[:WON]->(aw:Award)
        RETURN m.title AS title, m.year AS year, m.poster_url AS poster_url,
              collect(DISTINCT d.name) AS directors,
              collect(DISTINCT a.name) AS actors,
              collect(DISTINCT g.name) AS genres,
              collect(DISTINCT t.name) AS themes,
              collect(DISTINCT {name: aw.name, category: aw.category}) AS awards`;
      break;
      case "Director":
        cypher = `
          MATCH (d:Director {name: $name})-[:DIRECTED]->(m:Movie)
          OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
          OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
          OPTIONAL MATCH (m)-[:WON]->(aw:Award)
          OPTIONAL MATCH (a:Actor)-[:ACTED_IN]->(m)
          RETURN d.name AS name,
                 collect(DISTINCT {title: m.title, year: m.year}) AS movies,
                 collect(DISTINCT g.name) AS genres,
                 collect(DISTINCT t.name) AS themes,
                 collect(DISTINCT a.name) AS collaborators,
                 collect(DISTINCT {name: aw.name, category: aw.category}) AS awards`;
        break;
      case "Actor":
        cypher = `
          MATCH (a:Actor {name: $name})-[:ACTED_IN]->(m:Movie)
          OPTIONAL MATCH (d:Director)-[:DIRECTED]->(m)
          OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
          OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
          OPTIONAL MATCH (m)-[:WON]->(aw:Award)
          RETURN a.name AS name,
                 collect(DISTINCT {title: m.title, year: m.year}) AS movies,
                 collect(DISTINCT d.name) AS directors,
                 collect(DISTINCT g.name) AS genres,
                 collect(DISTINCT t.name) AS themes,
                 collect(DISTINCT {name: aw.name, category: aw.category}) AS awards`;
        break;
      case "Genre":
        cypher = `
          MATCH (m:Movie)-[:BELONGS_TO]->(g:Genre {name: $name})
          OPTIONAL MATCH (d:Director)-[:DIRECTED]->(m)
          RETURN g.name AS name,
                 collect(DISTINCT {title: m.title, year: m.year}) AS movies,
                 collect(DISTINCT d.name) AS directors`;
        break;
      case "Theme":
        cypher = `
          MATCH (m:Movie)-[:EXPLORES]->(t:Theme {name: $name})
          OPTIONAL MATCH (d:Director)-[:DIRECTED]->(m)
          RETURN t.name AS name,
                 collect(DISTINCT {title: m.title, year: m.year}) AS movies,
                 collect(DISTINCT d.name) AS directors`;
        break;
      case "Award":
        cypher = `
          MATCH (m:Movie)-[:WON]->(aw:Award {name: $name})
          OPTIONAL MATCH (d:Director)-[:DIRECTED]->(m)
          RETURN aw.name AS name,
                 collect(DISTINCT {title: m.title, year: m.year, category: aw.category}) AS movies,
                 collect(DISTINCT d.name) AS directors`;
        break;
      default:
        return [];
    }
    console.log(`   Describe Cypher: ${cypher.replace(/\s+/g, " ").trim()}`);
    const result = await session.run(cypher, params);
    return result.records.map((record) => {
      const obj = {};
      record.keys.forEach((key) => {
        const value = record.get(key);
        obj[key] = typeof value === "object" && value?.toNumber ? value.toNumber() : value;
      });
      return obj;
    });
  } finally {
    await session.close();
  }
}

async function executePath(fromLabel, fromName, toLabel, toName) {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const cypher = `
      MATCH (a:${fromLabel} {${fromLabel === "Movie" ? "title" : "name"}: $fromName}),
            (b:${toLabel} {${toLabel === "Movie" ? "title" : "name"}: $toName}),
            path = shortestPath((a)-[*..6]-(b))
      RETURN [node IN nodes(path) | {
        labels: labels(node),
        name: coalesce(node.name, node.title),
        year: node.year
      }] AS pathNodes,
      [rel IN relationships(path) | type(rel)] AS pathRels`;
    console.log(`   Path Cypher: ${cypher.replace(/\s+/g, " ").trim()}`);
    const result = await session.run(cypher, { fromName, toName });
    if (result.records.length === 0) {
      return [{ error: `No connection found between ${fromName} and ${toName}` }];
    }
    return result.records.map((record) => ({
      pathNodes: record.get("pathNodes"),
      pathRels: record.get("pathRels"),
    }));
  } finally {
    await session.close();
  }
}

async function executeTemplateCypher(plan) {
  const { cypher, params } = buildCypher(plan);
  console.log(`   Cypher: ${cypher}`);
  console.log("   Params:", params);
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => {
      const obj = {};
      record.keys.forEach((key) => {
        const value = record.get(key);
        obj[key] = typeof value === "object" && value?.toNumber ? value.toNumber() : value;
      });
      return obj;
    });
  } finally {
    await session.close();
  }
}

// *** MODIFIED: accepts options { returnStructured } ***
async function handleGraphQuery(query, resolvedEntities, options = { returnStructured: false }) {
  // ----- PRE-PLANNING RULE: Single movie entity -> direct describe -----
  const movieEntities = resolvedEntities.entities.filter(e => e.label === "Movie");
  const otherEntities = resolvedEntities.entities.filter(e => e.label !== "Movie");
  if (movieEntities.length === 1 && otherEntities.length === 0 && resolvedEntities.unresolved.length === 0) {
    console.log(`   Single movie entity detected → using describe plan for "${movieEntities[0].nodeName}"`);
    const describeRecords = await executeDescribe("Movie", movieEntities[0].nodeName);
    if (options.returnStructured) {
      return { type: "graph", data: describeRecords };
    } else {
      // For CLI: summarize with LLM (keep existing behaviour)
      const responsePrompt = `Given the question and database results, provide a clear, natural language answer.
Do NOT mention databases, Cypher, JSON, or technical details.
Do NOT return any JSON. Only return plain English text.
Be informative and thorough and include the useful details from the results.

Question: ${query}

Database Results:
${JSON.stringify(describeRecords.slice(0, 50), null, 2)}
${describeRecords.length > 50 ? `\n... and ${describeRecords.length - 50} more results` : ""}`;
      const response = await llm.invoke([
        { role: "system", content: "You are a helpful movie assistant. Respond only in plain English text. Never respond with JSON or code." },
        { role: "human", content: responsePrompt },
      ]);
      return responseToText(response.content).trim();
    }
  }

  // ----- Otherwise, use the LLM planner for complex queries -----
  console.log("   Creating query plan...");
  const plan = await createQueryPlan(query, resolvedEntities);
  console.log("   Plan:", JSON.stringify(plan, null, 2));

  let records;
  const firstStep = plan.steps[0];

  if (firstStep.type === "describe") {
    console.log(`   Describing ${firstStep.label}: \"${firstStep.name}\"...`);
    records = await executeDescribe(firstStep.label, firstStep.name);
  } else if (firstStep.type === "path") {
    console.log(`   Finding path: ${firstStep.fromName} -> ${firstStep.toName}...`);
    records = await executePath(
      firstStep.fromLabel,
      firstStep.fromName,
      firstStep.toLabel,
      firstStep.toName
    );
  } else {
    console.log("   Querying Neo4j...");
    records = await executeTemplateCypher(plan);
  }

  console.log(`   Got ${records.length} results`);

  if (records.length === 0 || records[0]?.error) {
    const errorMsg = records[0]?.error || "No results found";
    if (options.returnStructured) {
      return { type: "graph", data: [], error: errorMsg };
    } else {
      return `I couldn't find an answer: ${errorMsg}`;
    }
  }

  if (options.returnStructured) {
    // Return raw structured data (array of objects)
    return { type: "graph", data: records };
  } else {
    // Use LLM to generate natural language answer for CLI
    const responsePrompt = `Given the question and database results, provide a clear, natural language answer.
Do NOT mention databases, Cypher, JSON, or technical details.
Do NOT return any JSON. Only return plain English text.
Be informative and thorough and include the useful details from the results.

Question: ${query}

Database Results:
${JSON.stringify(records.slice(0, 50), null, 2)}
${records.length > 50 ? `\n... and ${records.length - 50} more results` : ""}`;

    const response = await llm.invoke([
      {
        role: "system",
        content: "You are a helpful movie assistant. Respond only in plain English text. Never respond with JSON or code.",
      },
      { role: "human", content: responsePrompt },
    ]);
    const answer = responseToText(response.content).trim();
    return answer;
  }
}

export  {handleGraphQuery};