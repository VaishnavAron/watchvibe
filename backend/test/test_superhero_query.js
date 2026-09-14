// backend/test/test_superhero_query.js
import { SearchEngine } from "../src/engine/SearchEngine.js";
import { SearchState } from "../src/engine/state/SearchState.js";

async function run() {
  const query = "forget it i dont want to watch these give me something more like superhwroes and villains saving the world from destruction while the hero sacrifices in the end";
  console.log("Testing query on new modular SearchEngine (Phases 1-4)...");
  
  const result = await SearchEngine.search({
    query,
    currentState: new SearchState(),
    history: []
  });

  console.log("\nResults Count:", result.results.length);
  console.log("Assistant Message:\n", result.assistantMessage);
  console.log("\nTop 10 Movies from New Engine:");
  result.results.slice(0, 10).forEach((m, idx) => {
    console.log(`${idx + 1}. ${m.title} (${m.year}) - Rating: ${m.rating}★ [Genres: ${m.genres?.join(", ")}] [Source: ${m.ragSource}]`);
  });

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
