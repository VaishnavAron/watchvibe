// backend/test/test_phase2_retrieval.js
import { SearchState } from "../src/engine/state/SearchState.js";
import { 
  buildPineconeFilter, 
  extractSemanticQuery,
  GraphRetriever,
  HybridRetriever 
} from "../src/engine/retrieval/index.js";

async function runTests() {
  console.log("==================================================================");
  console.log("🔍 WATCHVIBE PHASE 2 TEST: MULTI-STAGE RETRIEVAL & PUSHDOWN FILTERS");
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

  // 1. Pushdown filter test
  console.log("--- 1. Testing Native Pinecone Pushdown Predicates ---");
  const filter90s = buildPineconeFilter({ yearMin: 1990, yearMax: 1999, ratingMin: 7.8 });
  assert(filter90s.year?.$gte === 1990 && filter90s.year?.$lte === 1999, "Pinecone pushdown filter contains exact 1990-1999 range");
  assert(filter90s.rating?.$gte === 7.8, "Pinecone pushdown filter contains rating >= 7.8");

  // 2. Semantic query extraction test (NEVER embed commands)
  console.log("\n--- 2. Testing Semantic Query Extraction (Command Isolation) ---");
  const stateWithRefinement = new SearchState({
    entities: [
      { label: "Genre", name: "thriller" },
      { label: "Theme", name: "psychological" },
      { label: "Theme", name: "dark" }
    ],
    modifiers: { more: ["mind-bending"], less: [] },
    intentSummary: "keep only titles from the 90s",
    filters: { yearMin: 1990, yearMax: 1999, ratingMin: 7.8 }
  });

  const extracted = extractSemanticQuery(stateWithRefinement);
  console.log("Extracted Semantic Query for Vectors:", `"${extracted}"`);
  assert(!extracted.includes("keep only") && !extracted.includes("from the 90s"), "Command filler ('keep only', '90s') stripped from vector text");
  assert(extracted.includes("thriller") && extracted.includes("psychological"), "Persistent semantic entities retained for vector query");

  // 3. Neo4j Graph Retrieval test
  console.log("\n--- 3. Testing Neo4j Tag Traversal ---");
  const graphMovies = await GraphRetriever.findMoviesByTags(["crime", "mystery"], false, 5);
  assert(graphMovies.length > 0, `Neo4j returned ${graphMovies.length} movies for crime/mystery`);
  console.log(`Neo4j Sample: "${graphMovies[0]?.title}" (${graphMovies[0]?.year})`);

  // 4. Multi-Stage Hybrid Candidate Sourcing for 90s Psychological Thrillers > 7.8
  console.log("\n--- 4. Live Sourcing: 90s Psychological Thrillers (Rating ≥ 7.8) ---");
  const candidates = await HybridRetriever.retrieveCandidates(stateWithRefinement, 20);
  console.log(`Retrieved ${candidates.length} candidates.`);

  assert(candidates.length > 0, "Retrieved candidate pool is non-empty");

  // Verify no Disney family talking-dog movies (Homeward Bound)
  const hasHomewardBound = candidates.some(m => m.title?.toLowerCase().includes("homeward bound"));
  assert(!hasHomewardBound, "Homeward Bound (Disney talking dog) is physically eliminated from candidates!");

  // Verify returned candidates respect the 90s boundary
  const validYears = candidates.filter(m => m.year >= 1990 && m.year <= 1999);
  console.log(`Candidates in 1990-1999: ${validYears.length}/${candidates.length}`);
  validYears.slice(0, 5).forEach(m => {
    console.log(`   • ${m.title} (${m.year}) - Rating: ${m.rating}★ [${m.ragSource}]`);
  });

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
