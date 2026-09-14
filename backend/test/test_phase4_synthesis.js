// backend/test/test_phase4_synthesis.js
import { GroundedSynthesizer } from "../src/engine/synthesis/index.js";
import { SearchState } from "../src/engine/state/SearchState.js";
import { SearchEngine } from "../src/engine/SearchEngine.js";

async function runTests() {
  console.log("==================================================================");
  console.log("🔍 WATCHVIBE PHASE 4 TEST: GROUNDED POST-RETRIEVAL SYNTHESIZER");
  console.log("==================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
    }
  }

  // 1. Grounded Synthesis Test
  console.log("--- 1. Testing Grounded LLM Response Generation ---");
  const state = new SearchState({
    entities: [{ label: "Genre", name: "thriller" }, { label: "Theme", name: "psychological" }],
    filters: { yearMin: 1990, yearMax: 1999, ratingMin: 7.8 }
  });

  const verifiedMovies = [
    { title: "The Silence of the Lambs", year: 1991, rating: 8.35, genres: ["crime", "thriller"] },
    { title: "The Matrix", year: 1999, rating: 8.25, genres: ["action", "sci-fi"] },
    { title: "Se7en", year: 1995, rating: 8.38, genres: ["crime", "thriller"] }
  ];

  const response = await GroundedSynthesizer.synthesize({
    query: "keep only titles from the 90s",
    state,
    verifiedMovies,
    relaxedMatches: []
  });

  console.log("Grounded Assistant Message:\n", `"${response}"`);
  assert(response && response.length > 20, "Synthesizer produced non-empty message");
  assert(!response.includes("Homeward Bound"), "No hallucination of un-retrieved movies (Homeward Bound)");

  // 2. Zero-Match Honest Response
  console.log("\n--- 2. Testing Honest Zero-Match Handling ---");
  const emptyResponse = await GroundedSynthesizer.synthesize({
    query: "silent comedy thrillers from 1910",
    state: new SearchState({ filters: { yearMax: 1910 } }),
    verifiedMovies: [],
    relaxedMatches: []
  });

  console.log("Empty Response:\n", `"${emptyResponse}"`);
  assert(emptyResponse.toLowerCase().includes("couldn't find") || emptyResponse.toLowerCase().includes("no exact matches"), "Honest explanation when 0 movies match");

  // 3. End-to-End Unified SearchEngine Test
  console.log("\n--- 3. Testing Unified SearchEngine Pipeline (Phases 1-4) ---");
  const fullResult = await SearchEngine.search({
    query: "dark psychological thrillers with mind bending plot twists from the 90s",
    currentState: new SearchState()
  });

  console.log(`Pipeline Status:`);
  console.log(`   • Verified Movies: ${fullResult.results.length}`);
  console.log(`   • Assistant Message: "${fullResult.assistantMessage}"`);
  console.log(`   • Latency: ${fullResult.runtimeMetrics.latency}ms`);

  assert(fullResult.results.length > 0, "SearchEngine returned verified movies");
  assert(fullResult.results.every(m => m.year >= 1990 && m.year <= 1999), "100% of movies are from the 1990s");
  assert(Boolean(fullResult.assistantMessage), "Assistant message generated and grounded");

  console.log(`\n==================================================================`);
  console.log(`RESULTS: ${passed}/${total} assertions passed (${Math.round((passed/total)*100)}%)`);
  console.log(`==================================================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
