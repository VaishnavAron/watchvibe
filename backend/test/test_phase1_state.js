// backend/test/test_phase1_state.js
import { SearchState, compileIntent, compileDeterministicFilters } from "../src/engine/state/index.js";

async function runTests() {
  console.log("==================================================================");
  console.log("🔍 WATCHVIBE PHASE 1 TEST: SEARCH STATE MACHINE & INTENT COMPILER");
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

  // Unit Test 1: Deterministic filter parser on tricky natural language
  console.log("--- 1. Testing Deterministic Natural Language Parsing ---");
  const parsed90s = compileDeterministicFilters("keep only titles from the 90s");
  assert(parsed90s.filters.yearMin === 1990 && parsed90s.filters.yearMax === 1999, 'Decade "90s" parsed to [1990, 1999]');

  const parsedBefore = compileDeterministicFilters("keep only classic titles before the year 2000");
  assert(parsedBefore.filters.yearMax === 1999 || parsedBefore.filters.yearMax === 2000, '"before the year 2000" parsed yearMax');

  const parsedRating = compileDeterministicFilters("make it critically acclaimed with rating above 7.8");
  assert(parsedRating.filters.ratingMin === 7.8, '"rating above 7.8" parsed ratingMin: 7.8');

  // Unit Test 2: Sequence 1 Multi-turn State Transitions
  console.log("\n--- 2. Simulating Sequence 1 (Thrillers -> 7.8 -> 90s) ---");
  let state = SearchState.createInitial();

  // Turn 1
  const a1 = await compileIntent("dark psychological thrillers with mind bending plot twists", state, []);
  state = state.applyAction(a1);
  console.log("Turn 1 State:", state.toHumanDescription());
  assert(state.entities.some(e => e.name.toLowerCase().includes("thriller")), "Turn 1 captured thriller entity");

  // Turn 2
  const a2 = await compileIntent("make it critically acclaimed with rating above 7.8", state, [
    { role: "user", content: "dark psychological thrillers with mind bending plot twists" }
  ]);
  state = state.applyAction(a2);
  console.log("Turn 2 State:", state.toHumanDescription());
  assert(state.filters.ratingMin === 7.8, "Turn 2 captured ratingMin: 7.8");

  // Turn 3
  const a3 = await compileIntent("keep only titles from the 90s", state, [
    { role: "user", content: "dark psychological thrillers with mind bending plot twists" },
    { role: "user", content: "make it critically acclaimed with rating above 7.8" }
  ]);
  state = state.applyAction(a3);
  console.log("Turn 3 State:", state.toHumanDescription());
  assert(state.filters.yearMin === 1990 && state.filters.yearMax === 1999, "Turn 3 captured yearMin: 1990 and yearMax: 1999");
  assert(state.filters.ratingMin === 7.8, "Turn 3 retained ratingMin: 7.8 from Turn 2");

  // Unit Test 3: Sequence 2 (Topic Switch -> Crime NYC -> before 2000)
  console.log("\n--- 3. Simulating Sequence 2 (Topic Switch to NYC Crime -> before 2000) ---");
  const aSeq2_1 = await compileIntent("gritty crime mysteries set in new york city", state, []);
  let seq2State = state.applyAction(aSeq2_1);
  console.log("Seq 2 Turn 1 State:", seq2State.toHumanDescription());
  assert(seq2State.filters.yearMin === null, "Topic switch reset previous yearMin");

  const aSeq2_2 = await compileIntent("keep only classic titles before the year 2000", seq2State, [
    { role: "user", content: "gritty crime mysteries set in new york city" }
  ]);
  seq2State = seq2State.applyAction(aSeq2_2);
  console.log("Seq 2 Turn 2 State:", seq2State.toHumanDescription());
  assert(seq2State.filters.yearMax !== null && seq2State.filters.yearMax <= 2000, "Seq 2 captured yearMax <= 2000");

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
