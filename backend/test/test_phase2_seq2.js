// backend/test/test_phase2_seq2.js
import { SearchState } from "../src/engine/state/SearchState.js";
import { HybridRetriever } from "../src/engine/retrieval/index.js";

async function runTest() {
  console.log("==================================================================");
  console.log("🔍 WATCHVIBE PHASE 2 TEST: SEQUENCE 2 (GRITTY CRIME PRE-2000)");
  console.log("==================================================================\n");

  const state = new SearchState({
    entities: [
      { label: "Genre", name: "crime" },
      { label: "Genre", name: "mystery" },
      { label: "Theme", name: "gritty" }
    ],
    modifiers: { more: ["new york city"], less: [] },
    intentSummary: "keep only classic titles before the year 2000",
    filters: { yearMax: 1999 }
  });

  const candidates = await HybridRetriever.retrieveCandidates(state, 30);
  console.log(`Retrieved ${candidates.length} candidates.`);

  const pre2000Crime = candidates.filter(m => 
    (!m.year || m.year <= 1999) && 
    (m.genres?.some(g => ["crime", "mystery", "thriller"].includes(g.toLowerCase())))
  );

  console.log(`\nVerified Pre-2000 Crime/Mystery candidates: ${pre2000Crime.length}`);
  pre2000Crime.slice(0, 8).forEach(m => {
    console.log(`   • ${m.title} (${m.year}) - Rating: ${m.rating}★ [Genres: ${m.genres?.join(", ")}]`);
  });

  // Verify that erotic drama (Damage) is NOT in top crime recommendations
  const hasDamage = candidates.slice(0, 5).some(m => m.title?.toLowerCase() === "damage");
  if (!hasDamage) {
    console.log("\n✅ PASS: Damage (erotic romance) is NOT in top crime recommendations!");
  } else {
    console.log("\n❌ FAIL: Damage appeared in top recommendations");
  }

  process.exit(0);
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
