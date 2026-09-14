// backend/test/test_user_exact_seq.js
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
  console.log("=== Testing User Exact 3-Turn Sequence ===");

  // Turn 1
  console.log("\n1. 'dark psychological thrillers with mind bending plot twists'");
  const t1 = await postQuery("dark psychological thrillers with mind bending plot twists");
  console.log("T1 Assistant:", t1.assistantMessage);
  console.log("T1 Top 4:", t1.recommendations?.slice(0, 4).map(m => `${m.title} (${m.year}) - ★${m.rating}`));

  // Turn 2
  console.log("\n2. 'make it critically acclaimed with rating above 7.8'");
  const h2 = [
    { role: "user", content: "dark psychological thrillers with mind bending plot twists" },
    { role: "assistant", content: t1.assistantMessage }
  ];
  const t2 = await postQuery("make it critically acclaimed with rating above 7.8", h2, t1.state);
  console.log("T2 Assistant:", t2.assistantMessage);
  console.log("T2 State ratingMin:", t2.state?.filters?.ratingMin);
  console.log("T2 Top 5:", t2.recommendations?.slice(0, 5).map(m => `${m.title} (${m.year}) - ★${m.rating}`));

  // Turn 3
  console.log("\n3. 'keep only titles from the 90s'");
  const h3 = [
    ...h2,
    { role: "user", content: "make it critically acclaimed with rating above 7.8" },
    { role: "assistant", content: t2.assistantMessage }
  ];
  const t3 = await postQuery("keep only titles from the 90s", h3, t2.state);
  console.log("T3 Assistant:", t3.assistantMessage);
  console.log("T3 State filters:", t3.state?.filters);
  console.log("T3 Recommendations (" + t3.recommendations?.length + "):");
  t3.recommendations?.forEach(m => console.log(`  - ${m.title} (${m.year}) - ★${m.rating}`));

  // Assertions for Turn 3
  const anyUnder78 = t3.recommendations?.filter(m => m.rating < 7.8);
  const anyNon90s = t3.recommendations?.filter(m => m.year < 1990 || m.year > 1999);

  if (anyUnder78?.length > 0) {
    console.error("FAIL: Rating invariant breached:", anyUnder78.map(m => `${m.title} (${m.rating})`));
    process.exit(1);
  }
  if (anyNon90s?.length > 0) {
    console.error("FAIL: Year invariant breached:", anyNon90s.map(m => `${m.title} (${m.year})`));
    process.exit(1);
  }

  console.log("\n✅ 100% SUCCESS: All titles strictly satisfy year in [1990, 1999] AND rating >= 7.8!");
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
