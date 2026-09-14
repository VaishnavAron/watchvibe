// backend/test/industrial_recsys_benchmark.js
import fetch from "node-fetch";

const BASE_URL = "http://localhost:4000/api/recommendations/query";

async function runQuery(query, history = [], state = null, userId = "benchmark-suite-runner") {
  const start = Date.now();
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, conversationHistory: history, state, userId })
  });
  const data = await res.json();
  const latency = Date.now() - start;
  return { ...data, clientLatency: latency };
}

async function runBenchmarkSuite() {
  console.log("================================================================================");
  console.log("  WATCHVIBE vs TIER-1 INDUSTRIAL RECSYS: 10-BENCHMARK STRESS TEST SUITE");
  console.log("================================================================================\n");

  const results = [];

  // ---------------------------------------------------------------------------
  // BENCHMARK 1: Sparse Semantic Anchor with Broad Genre (The Patriotism / Drama Failure)
  // ---------------------------------------------------------------------------
  console.log("[RUNNING] Benchmark 1: Sparse Semantic Anchor with Broad Genre ('celebrating my nation')");
  try {
    const res1 = await runQuery("give me picks for the occasion of celebrating my nation");
    const recs1 = res1.recommendations || [];
    const titles1 = recs1.map(m => m.title);
    
    // Violation check: Check if explicit non-patriotic / adult movies are returned
    const leakedJunk = recs1.filter(m => {
      const lower = m.title.toLowerCase();
      return lower.includes("nymphomaniac") || 
             lower.includes("how to have sex") || 
             lower.includes("straight a's to xxx") || 
             lower.includes("devil wears prada");
    });

    const patrioticCount = recs1.filter(m => {
      const tags = [...(m.themes || []), ...(m.genres || [])].map(t => t.toLowerCase());
      return tags.some(t => t.includes("patriot") || t.includes("nation") || t.includes("soldier") || t.includes("war") || t.includes("independence"));
    }).length;

    const precision1 = recs1.length > 0 ? (patrioticCount / recs1.length) : 0;
    const passed1 = leakedJunk.length === 0 && precision1 >= 0.7;

    results.push({
      benchmark: "1. Sparse Semantic Anchor ('celebrating my nation')",
      pass: passed1,
      totalReturned: recs1.length,
      precision: `${Math.round(precision1 * 100)}%`,
      violations: leakedJunk.map(m => `${m.title} (${m.score})`),
      sampleTitles: titles1.slice(0, 5)
    });
    console.log(`  -> Passed: ${passed1} | Precision: ${Math.round(precision1 * 100)}% | Leaked Junk: ${leakedJunk.length}`);
  } catch (err) {
    results.push({ benchmark: "1. Sparse Semantic Anchor", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 2: High-Constraint Temporal Decade + Quality Baseline Invariant
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 2: High-Constraint Temporal Decade + Quality Baseline Invariant ('90s psychological thrillers rating > 7.8')");
  try {
    const res2 = await runQuery("critically acclaimed 90s psychological thrillers with mind bending plot twists rating above 7.8");
    const recs2 = res2.recommendations || [];
    const yearBreaches = recs2.filter(m => m.year < 1990 || m.year > 1999);
    const ratingBreaches = recs2.filter(m => m.rating < 7.8);
    const passed2 = recs2.length > 0 && yearBreaches.length === 0 && ratingBreaches.length === 0;

    results.push({
      benchmark: "2. Temporal Decade + Quality Invariant (90s, rating >= 7.8)",
      pass: passed2,
      totalReturned: recs2.length,
      yearBreaches: yearBreaches.map(m => `${m.title} (${m.year})`),
      ratingBreaches: ratingBreaches.map(m => `${m.title} (${m.rating})`),
      sampleTitles: recs2.slice(0, 5).map(m => `${m.title} (${m.year}, ★${m.rating})`)
    });
    console.log(`  -> Passed: ${passed2} | Count: ${recs2.length} | Year Breaches: ${yearBreaches.length} | Rating Breaches: ${ratingBreaches.length}`);
  } catch (err) {
    results.push({ benchmark: "2. Temporal + Quality Invariant", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 3: Cross-Domain Entity Synergy / Director Traversal
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 3: Director Synergy ('Christopher Nolan mind-bending sci-fi')");
  try {
    const res3 = await runQuery("Christopher Nolan mind-bending sci-fi movies");
    const recs3 = res3.recommendations || [];
    const nolanMovies = recs3.filter(m => (m.directors || []).some(d => d.toLowerCase().includes("nolan")));
    const precision3 = recs3.length > 0 ? (nolanMovies.length / Math.min(recs3.length, 5)) : 0;
    const passed3 = nolanMovies.length >= 3;

    results.push({
      benchmark: "3. Director Traversal (Christopher Nolan)",
      pass: passed3,
      totalReturned: recs3.length,
      nolanCount: nolanMovies.length,
      precisionTop5: `${Math.round(precision3 * 100)}%`,
      sampleTitles: recs3.slice(0, 5).map(m => `${m.title} (Dir: ${(m.directors || []).join(",")})`)
    });
    console.log(`  -> Passed: ${passed3} | Nolan Titles Found: ${nolanMovies.length}`);
  } catch (err) {
    results.push({ benchmark: "3. Director Traversal", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 4: Negative Constraint / Anti-Genre Filtering
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 4: Negative Constraint ('superhero movies without comedy')");
  try {
    const res4 = await runQuery("superhero movies without comedy or funny humor");
    const recs4 = res4.recommendations || [];
    const comedyLeakers = recs4.filter(m => (m.genres || []).map(g => g.toLowerCase()).includes("comedy"));
    const passed4 = comedyLeakers.length === 0 && recs4.length > 0;

    results.push({
      benchmark: "4. Negative Constraint Filtering (without comedy)",
      pass: passed4,
      totalReturned: recs4.length,
      comedyLeakers: comedyLeakers.map(m => m.title),
      sampleTitles: recs4.slice(0, 5).map(m => `${m.title} [${(m.genres || []).join(",")}]`)
    });
    console.log(`  -> Passed: ${passed4} | Comedy Breaches: ${comedyLeakers.length}`);
  } catch (err) {
    results.push({ benchmark: "4. Negative Constraint", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 5: Niche Sub-Genre Specificity ('time loop paradox')
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 5: Niche Sub-Genre ('time loop paradox repeating same day')");
  try {
    const res5 = await runQuery("time loop paradox movies where the protagonist repeats the same day");
    const recs5 = res5.recommendations || [];
    const timeLoopKeywords = ["loop", "repeat", "day", "edge of tomorrow", "groundhog", "palm springs", "source code", "paradox", "time"];
    const relevantCount = recs5.filter(m => {
      const desc = `${m.title} ${m.overview || ""} ${(m.themes || []).join(" ")}`.toLowerCase();
      return timeLoopKeywords.some(kw => desc.includes(kw));
    }).length;
    const precision5 = recs5.length > 0 ? (relevantCount / recs5.length) : 0;
    const passed5 = precision5 >= 0.7;

    results.push({
      benchmark: "5. Niche Sub-Genre Specificity (Time Loop)",
      pass: passed5,
      totalReturned: recs5.length,
      precision: `${Math.round(precision5 * 100)}%`,
      sampleTitles: recs5.slice(0, 5).map(m => m.title)
    });
    console.log(`  -> Passed: ${passed5} | Precision: ${Math.round(precision5 * 100)}%`);
  } catch (err) {
    results.push({ benchmark: "5. Niche Sub-Genre", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 6: Conversational Pivot / Topic Switch (Clean State Purge)
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 6: Conversational Topic Switch ('switch to dark historical war movies')");
  try {
    const turn1 = await runQuery("romantic comedies set in New York");
    const history1 = [
      { role: "user", content: "romantic comedies set in New York" },
      { role: "assistant", content: turn1.assistantMessage }
    ];
    const turn2 = await runQuery("actually switch to dark historical war movies", history1, turn1.state);
    const recs6 = turn2.recommendations || [];
    
    // Must NOT contain rom-coms
    const romcomLeakers = recs6.filter(m => {
      const g = (m.genres || []).map(x => x.toLowerCase());
      return g.includes("comedy") && !g.includes("war") && !g.includes("history");
    });
    const warMatches = recs6.filter(m => {
      const g = (m.genres || []).map(x => x.toLowerCase());
      const t = (m.themes || []).map(x => x.toLowerCase());
      return g.includes("war") || g.includes("history") || t.includes("war") || t.includes("military");
    });
    const passed6 = romcomLeakers.length === 0 && warMatches.length >= 2;

    results.push({
      benchmark: "6. Conversational Topic Switch (RomCom -> War)",
      pass: passed6,
      actionType: turn2.state?.interactionType,
      romcomLeakers: romcomLeakers.map(m => m.title),
      warCount: warMatches.length,
      sampleTitles: recs6.slice(0, 5).map(m => `${m.title} [${(m.genres || []).join(",")}]`)
    });
    console.log(`  -> Passed: ${passed6} | Romcom Leaks: ${romcomLeakers.length} | War Titles: ${warMatches.length}`);
  } catch (err) {
    results.push({ benchmark: "6. Conversational Topic Switch", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 7: Quality Threshold Hard Boundary (Rating >= 8.2)
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 7: High Quality Cutoff ('action movies rated above 8.2')");
  try {
    const res7 = await runQuery("action movies rated above 8.2");
    const recs7 = res7.recommendations || [];
    const ratingViolations = recs7.filter(m => m.rating < 8.2);
    const passed7 = recs7.length > 0 && ratingViolations.length === 0;

    results.push({
      benchmark: "7. Quality Threshold Hard Boundary (rating >= 8.2)",
      pass: passed7,
      totalReturned: recs7.length,
      violations: ratingViolations.map(m => `${m.title} (${m.rating})`),
      sampleTitles: recs7.slice(0, 5).map(m => `${m.title} (★${m.rating})`)
    });
    console.log(`  -> Passed: ${passed7} | Violations: ${ratingViolations.length}`);
  } catch (err) {
    results.push({ benchmark: "7. Quality Threshold", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 8: Cultural / Regional Traversal ('Indian high octane action blockbusters')
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 8: Cultural / Regional Traversal ('Indian high octane action blockbusters')");
  try {
    const res8 = await runQuery("Indian high octane action blockbusters");
    const recs8 = res8.recommendations || [];
    const indianLangs = ["hi", "te", "ta", "ml", "kn", "bn", "mr", "pa"];
    const indianTitles = ["rrr", "baahubali", "kgf", "pushpa", "jawan", "pathaan", "dangal", "war", "gadar", "maidaan", "sholay", "dhoom", "don", "singham", "ra.one", "bang bang", "saaho", "dhurandhar", "commando", "kantara", "mission raniganj"];
    const indianMatches = recs8.filter(m => {
      const t = m.title.toLowerCase();
      const overview = (m.overview || "").toLowerCase();
      const lang = (m.original_language || "").toLowerCase();
      return indianLangs.includes(lang) || indianTitles.some(k => t.includes(k)) || overview.includes("india") || overview.includes("hindi") || overview.includes("tamil");
    });
    const precision8 = recs8.length > 0 ? (indianMatches.length / recs8.length) : 0;
    const passed8 = recs8.length > 0 && precision8 >= 0.7;

    results.push({
      benchmark: "8. Cultural / Regional Traversal (Indian Action)",
      pass: passed8,
      totalReturned: recs8.length,
      precision: `${Math.round(precision8 * 100)}%`,
      sampleTitles: recs8.slice(0, 5).map(m => `${m.title} (${m.original_language || 'lang'})`)
    });
    console.log(`  -> Passed: ${passed8} | Count: ${recs8.length} | Precision: ${Math.round(precision8 * 100)}%`);
  } catch (err) {
    results.push({ benchmark: "8. Regional Traversal", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 9: Content Safety Guardrail Under Ambiguous Family Prompt
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 9: Family Safety Guardrail ('celebrate holiday with kids and family')");
  try {
    const res9 = await runQuery("movies to celebrate national holiday with young kids and entire family");
    const recs9 = res9.recommendations || [];
    const adultExplicitList = ["nymphomaniac", "how to have sex", "straight a's to xxx", "fifty shades", "secretary"];
    const explicitLeakers = recs9.filter(m => adultExplicitList.some(bad => m.title.toLowerCase().includes(bad)));
    const passed9 = explicitLeakers.length === 0 && recs9.length > 0;

    results.push({
      benchmark: "9. Family Safety & SafeSearch Guardrail",
      pass: passed9,
      totalReturned: recs9.length,
      explicitLeakers: explicitLeakers.map(m => m.title),
      sampleTitles: recs9.slice(0, 5).map(m => `${m.title} [${(m.genres || []).join(",")}]`)
    });
    console.log(`  -> Passed: ${passed9} | Explicit Leaks: ${explicitLeakers.length}`);
  } catch (err) {
    results.push({ benchmark: "9. Family Safety Guardrail", pass: false, error: err.message });
  }

  // ---------------------------------------------------------------------------
  // BENCHMARK 10: Multi-Turn Constraint Compounding (4-Turn Invariant Stress Test)
  // ---------------------------------------------------------------------------
  console.log("\n[RUNNING] Benchmark 10: 4-Turn Compounding Invariant Stress Test");
  try {
    // Turn 1
    const t1 = await runQuery("sci-fi movies");
    // Turn 2
    const h2 = [{ role: "user", content: "sci-fi movies" }, { role: "assistant", content: t1.assistantMessage }];
    const t2 = await runQuery("keep only titles from the 80s", h2, t1.state);
    // Turn 3
    const h3 = [...h2, { role: "user", content: "keep only titles from the 80s" }, { role: "assistant", content: t2.assistantMessage }];
    const t3 = await runQuery("make it critically acclaimed with rating above 7.8", h3, t2.state);
    // Turn 4
    const h4 = [...h3, { role: "user", content: "make it critically acclaimed with rating above 7.8" }, { role: "assistant", content: t3.assistantMessage }];
    const t4 = await runQuery("focus on cyborgs, androids or artificial intelligence", h4, t3.state);

    const exact10 = t4.exactMatches || [];
    const relaxed10 = t4.relaxedMatches || [];
    const allRecs10 = t4.recommendations || [];

    const yearBreaches10 = exact10.filter(m => m.year < 1980 || m.year > 1989);
    const ratingBreaches10 = exact10.filter(m => m.rating < 7.8);
    const hasRelaxedSafely = relaxed10.length > 0 && relaxed10.every(m => m.isRelaxed === true);
    const passed10 = (exact10.length > 0 && yearBreaches10.length === 0 && ratingBreaches10.length === 0) || (exact10.length === 0 && hasRelaxedSafely);

    results.push({
      benchmark: "10. 4-Turn Compounding Invariant (80s + Rating >= 7.8 + AI/Cyborg)",
      pass: passed10,
      exactReturned: exact10.length,
      relaxedReturned: relaxed10.length,
      yearBreaches: yearBreaches10.map(m => `${m.title} (${m.year})`),
      ratingBreaches: ratingBreaches10.map(m => `${m.title} (${m.rating})`),
      sampleTitles: allRecs10.slice(0, 5).map(m => `${m.title} (${m.year}, ★${m.rating})${m.isRelaxed ? ' [RELAXED: ' + m.relaxationReason + ']' : ''}`)
    });
    console.log(`  -> Passed: ${passed10} | Exact: ${exact10.length} | Relaxed: ${relaxed10.length}`);
  } catch (err) {
    results.push({ benchmark: "10. Multi-Turn Compounding", pass: false, error: err.message });
  }

  console.log("\n================================================================================");
  console.log("                           BENCHMARK SUITE SUMMARY");
  console.log("================================================================================");
  console.table(results.map(r => ({
    Benchmark: r.benchmark,
    Pass: r.pass ? "✅ PASS" : "❌ FAIL",
    Count: r.totalReturned ?? 0,
    Precision: r.precision || r.precisionTop5 || "N/A"
  })));

  console.log("\nDETAILED BENCHMARK RESULTS (JSON):");
  console.log(JSON.stringify(results, null, 2));
}

runBenchmarkSuite().catch(console.error);
