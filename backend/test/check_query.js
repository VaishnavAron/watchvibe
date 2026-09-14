import { SearchEngine } from "../src/engine/SearchEngine.js";

async function test() {
  const query = "hello give me some movies to watch today on independence day india";
  console.log("Testing query:", query);
  const result = await SearchEngine.search({ query });
  console.log("Parsed Intent:", JSON.stringify(result.parsedIntent, null, 2));
  console.log("Assistant Message:", result.assistantMessage);
  console.log("Top 10 Recommendations:", result.recommendations.slice(0, 10).map(m => `${m.title} (${m.year}) - [${m.genres?.join(', ')}] - ragSource: ${m.ragSource}`));
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
