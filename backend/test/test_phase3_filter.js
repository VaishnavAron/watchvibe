// backend/test/test_phase3_filter.js
import { SearchState } from "../src/engine/state/SearchState.js";
import { HybridRetriever } from "../src/engine/retrieval/index.js";
import { InvariantBarrier, ConstraintRelaxer } from "../src/engine/filter/index.js";

async function runTests() {
  console.log("==================================================================");
  console.log("🔍 WATCHVIBE PHASE 3 TEST: HARD INVARIANT BARRIER & ZERO LEAKAGE");
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

  // 1. Synthetic Dirty Pool Test
  console.log("--- 1. Testing Strict Invariant Barrier on Synthetic Dirty Pool ---");
  const state = new SearchState({
    filters: {
      yearMin: 1990,
      yearMax: 1999,
      ratingMin: 7.8,
      excludeGenres: ["comedy"]
    }
  });

  const dirtyPool = [
    { title: "Pulp Fiction", year: 1994, rating: 8.5, genres: ["crime", "drama"] },          // PASS
    { title: "Fight Club", year: 1999, rating: 8.4, genres: ["drama"] },                    // PASS
    { title: "The Dark Knight", year: 2008, rating: 9.0, genres: ["action", "crime"] },      // FAIL (Year 2008 > 1999)
    { title: "Whiplash", year: 2014, rating: 8.5, genres: ["drama"] },                      // FAIL (Year 2014 > 1999)
    { title: "Homeward Bound", year: 1993, rating: 7.0, genres: ["adventure", "family"] },  // FAIL (Rating 7.0 < 7.8)
    { title: "Clerks", year: 1994, rating: 8.0, genres: ["comedy"] },                       // FAIL (Comedy excluded)
  ];

  const strictlyFiltered = InvariantBarrier.enforce(dirtyPool, state);
  console.log("Strictly Filtered Count:", strictlyFiltered.length);
  strictlyFiltered.forEach(m => console.log(`   • ${m.title} (${m.year}) - Rating: ${m.rating}★`));

  assert(strictlyFiltered.length === 2, "Only exactly matching movies passed the barrier");
  assert(strictlyFiltered.some(m => m.title === "Pulp Fiction"), "Pulp Fiction passed");
  assert(strictlyFiltered.some(m => m.title === "Fight Club"), "Fight Club passed");
  assert(!strictlyFiltered.some(m => m.title === "The Dark Knight"), "The Dark Knight (2008) is mathematically blocked");
  assert(!strictlyFiltered.some(m => m.title === "Whiplash"), "Whiplash (2014) is mathematically blocked");
  assert(!strictlyFiltered.some(m => m.title === "Homeward Bound"), "Homeward Bound (7.0★) is mathematically blocked");
  assert(!strictlyFiltered.some(m => m.title === "Clerks"), "Excluded genre (comedy) is mathematically blocked");

  // 2. Principled Constraint Relaxation Test
  console.log("\n--- 2. Testing Principled Constraint Relaxation (Zero Result Pollution) ---");
  const candidatePool = [
    ...dirtyPool,
    { title: "Memento", year: 2000, rating: 8.4, genres: ["mystery", "thriller"] },
    { title: "American Psycho", year: 2000, rating: 7.6, genres: ["thriller", "drama"] }
  ];

  const evaluation = await ConstraintRelaxer.evaluate(candidatePool, state, 4);
  console.log(`Exact Matches: ${evaluation.exactMatches.length}`);
  console.log(`Relaxed Matches: ${evaluation.relaxedMatches.length}`);
  console.log(`Relaxation Summary: "${evaluation.relaxationSummary}"`);

  assert(evaluation.exactMatches.length === 2, "Exact matches bucket contains ONLY the 2 strict matches (Pulp Fiction, Fight Club)");
  assert(evaluation.relaxedMatches.length > 0, "Relaxed matches generated in separate bucket");
  assert(evaluation.relaxedMatches[0].isRelaxed === true, "Relaxed match is explicitly flagged with isRelaxed: true");
  assert(Boolean(evaluation.relaxedMatches[0].relaxationReason), "Relaxation reason is explicitly provided");

  // 3. Live End-to-End Retrieval + Barrier Enforcement
  console.log("\n--- 3. Live Pipeline Test: Retrieval + Barrier for 90s Thrillers > 7.8 ---");
  const liveState = new SearchState({
    entities: [
      { label: "Genre", name: "thriller" },
      { label: "Theme", name: "psychological" }
    ],
    filters: { yearMin: 1990, yearMax: 1999, ratingMin: 7.8 }
  });

  const rawLive = await HybridRetriever.retrieveCandidates(liveState, 30);
  const finalLive = InvariantBarrier.enforce(rawLive, liveState);

  console.log(`Live Sourced: ${rawLive.length} candidates -> Filtered: ${finalLive.length} exact matches.`);
  finalLive.forEach(m => {
    console.log(`   • ${m.title} (${m.year}) - Rating: ${m.rating}★ [${m.ragSource}]`);
  });

  assert(finalLive.length > 0, "Final verified set has matching titles");
  assert(finalLive.every(m => m.year >= 1990 && m.year <= 1999), "100% of final live titles are from the 1990s");
  assert(finalLive.every(m => m.rating >= 7.8), "100% of final live titles have rating >= 7.8");

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
