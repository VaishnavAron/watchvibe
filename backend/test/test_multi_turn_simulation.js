// backend/test/test_multi_turn_simulation.js
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
  console.log("=== Multi-Turn Stress Test Simulation (10 Turns) ===");

  const turns = [
    { query: "dark psychological thrillers with mind bending plot twists", expect: "Psychological / Thriller" },
    { query: "make it critically acclaimed with rating above 7.8", expect: "Rating >= 7.8" },
    { query: "keep only titles from the 90s", expect: "1990-1999" },
    { query: "actually switch to funny buddy cop action comedies", expect: "Comedy / Action (Pivot)" },
    { query: "only 80s classics", expect: "1980-1989" },
    { query: "now switch to sci-fi space exploration like Interstellar", expect: "Sci-Fi Space (Pivot)" },
    { query: "only titles after 2010", expect: "Year >= 2010" },
    { query: "superhero movies where the hero saves the world from destruction but at the cost of a sacrifice", expect: "Superhero / Sacrifice (Pivot)" }
  ];

  let currentState = null;
  let conversationHistory = [];
  const stateSnapshots = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    console.log(`\n--- Turn ${i + 1}: "${turn.query}" [Expect: ${turn.expect}] ---`);
    
    const res = await postQuery(turn.query, conversationHistory, currentState);
    currentState = res.state;
    stateSnapshots.push({ turnIndex: i + 1, query: turn.query, state: currentState, topTitles: res.recommendations?.slice(0, 3).map(m => `${m.title} (${m.year})`) });

    conversationHistory.push({ role: "user", content: turn.query });
    conversationHistory.push({ role: "assistant", content: res.assistantMessage });

    console.log(`Interaction: ${res.parsedIntent?.interactionType}`);
    console.log(`Filters Active:`, JSON.stringify(res.state?.filters));
    console.log(`Top 3 Titles:`, res.recommendations?.slice(0, 3).map(m => `${m.title} (${m.year}) - ★${m.rating}`));
    console.log(`Assistant Summary: ${res.assistantMessage?.slice(0, 110)}...`);
  }

  console.log("\n=== Multi-Turn Memory Summary ===");
  stateSnapshots.forEach(s => {
    console.log(`Turn ${s.turnIndex}: "${s.query.slice(0, 35)}..." -> Top: ${s.topTitles?.join(", ")}`);
  });
}

run().catch(err => console.error("Simulation failed:", err));
