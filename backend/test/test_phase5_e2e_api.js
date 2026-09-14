// backend/test/test_phase5_e2e_api.js
import fetch from "node-fetch";

const BASE_URL = "http://localhost:4000/api/recommendations/query";

async function postQuery(query, history = [], state = null) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, conversationHistory: history, state, userId: "demo-user" })
  });
  return res.json();
}

async function run() {
  console.log("=== Testing Phase 5: Live API Route Integration ===");

  // TURN 1
  console.log("\n--- Turn 1: 'dark psychological thrillers with mind bending plot twists' ---");
  const turn1 = await postQuery("dark psychological thrillers with mind bending plot twists");
  console.log("Success:", turn1.success);
  console.log("Assistant Message:", turn1.assistantMessage);
  console.log("Total Recommendations:", turn1.recommendations?.length);
  console.log("Top 5 Titles:", turn1.recommendations?.slice(0, 5).map(m => `${m.title} (${m.year}) - ★${m.rating}`));
  console.log("Parsed Intent:", JSON.stringify(turn1.parsedIntent));
  console.log("Runtime Metrics:", JSON.stringify(turn1.runtimeMetrics));

  // Verify Turn 1
  if (!turn1.recommendations || turn1.recommendations.length === 0) {
    throw new Error("Turn 1 returned no recommendations");
  }

  // TURN 2: Refinement with state
  console.log("\n--- Turn 2: 'keep only titles from the 90s' ---");
  const history = [
    { role: "user", content: "dark psychological thrillers with mind bending plot twists" },
    { role: "assistant", content: turn1.assistantMessage }
  ];
  const turn2 = await postQuery("keep only titles from the 90s", history, turn1.state);
  console.log("Success:", turn2.success);
  console.log("Assistant Message:", turn2.assistantMessage);
  console.log("Total Recommendations:", turn2.recommendations?.length);
  const titles90s = turn2.recommendations?.map(m => `${m.title} (${m.year}) - ★${m.rating}`) || [];
  console.log("Titles returned:", titles90s);

  // Check 90s invariant
  const non90s = turn2.recommendations?.filter(m => m.year < 1990 || m.year > 1999) || [];
  if (non90s.length > 0) {
    console.error("FAIL: Non-90s movies leaked:", non90s.map(m => `${m.title} (${m.year})`));
    process.exit(1);
  } else {
    console.log("✅ INVARIANT PRESERVED: 100% of returned titles are strictly from the 1990s!");
  }

  // Check for any junk movies
  const junkTitles = ["Homeward Bound", "Blockers", "The Kissing Booth", "Damage", "Battle: Los Angeles", "Ultraman: Rising"];
  const returnedTitles = (turn2.recommendations || []).map(m => m.title);
  const foundJunk = returnedTitles.filter(t => junkTitles.includes(t));
  if (foundJunk.length > 0) {
    console.error("FAIL: Junk titles found:", foundJunk);
    process.exit(1);
  } else {
    console.log("✅ ZERO JUNK: None of the notorious bad matches leaked into the results!");
  }

  // TURN 3: Superhero Query
  console.log("\n--- Turn 3: 'superhero movies like Avengers or Spider-Man' ---");
  const turn3 = await postQuery("superhero movies like Avengers or Spider-Man");
  console.log("Assistant Message:", turn3.assistantMessage);
  console.log("Top 5 Titles:", turn3.recommendations?.slice(0, 5).map(m => `${m.title} (${m.year}) - ★${m.rating}`));
  
  console.log("\n🎉 ALL PHASE 5 END-TO-END API TESTS PASSED SUCCESSFULLY!");
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
