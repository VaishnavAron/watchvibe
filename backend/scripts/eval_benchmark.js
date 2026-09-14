// backend/scripts/eval_benchmark.js
import { performance } from 'perf_hooks';

const API_ENDPOINT = 'http://localhost:4000/api/recommendations/query';

const BENCHMARK_SUITE = [
  // 1. Core Reference Queries
  { id: 1, category: "Core Reference", query: "movies like Inception", expectedGenres: ["Science Fiction", "Action", "Thriller"], minRating: 7.0 },
  { id: 2, category: "Core Reference", query: "films similar to Interstellar with emotional depth", expectedGenres: ["Science Fiction", "Drama"], minRating: 7.5 },
  { id: 3, category: "Core Reference", query: "movies like The Dark Knight psychological crime", expectedGenres: ["Action", "Crime", "Drama"], minRating: 7.5 },
  { id: 4, category: "Core Reference", query: "atmospheric mystery like Shutter Island", expectedGenres: ["Mystery", "Thriller", "Drama"], minRating: 7.0 },
  { id: 5, category: "Core Reference", query: "mind-bending sci fi like The Matrix", expectedGenres: ["Science Fiction", "Action"], minRating: 7.5 },

  // 2. Director & Auteur Graph Queries
  { id: 6, category: "Director Graph", query: "Christopher Nolan directed films", expectedDirectors: ["Christopher Nolan"] },
  { id: 7, category: "Director Graph", query: "Denis Villeneuve atmospheric sci-fi", expectedDirectors: ["Denis Villeneuve"] },
  { id: 8, category: "Director Graph", query: "Quentin Tarantino dialogue-heavy crime", expectedDirectors: ["Quentin Tarantino"] },
  { id: 9, category: "Director Graph", query: "David Fincher dark psychological thrillers", expectedDirectors: ["David Fincher"] },

  // 3. Negative Constraints & Modifiers
  { id: 10, category: "Negative Constraints", query: "sci-fi thrillers but less violent", expectedGenres: ["Science Fiction", "Thriller"], excludeGenres: ["Horror"] },
  { id: 11, category: "Negative Constraints", query: "intense mystery without jump scares or gore", expectedGenres: ["Mystery", "Thriller"], excludeGenres: ["Horror"] },
  { id: 12, category: "Negative Constraints", query: "cerebral sci-fi with zero comedy", expectedGenres: ["Science Fiction"], excludeGenres: ["Comedy"] },

  // 4. Time Period & Era Constraints
  { id: 13, category: "Era Constraints", query: "nostalgic 90s action thrillers", expectedGenres: ["Action", "Thriller"], yearMin: 1990, yearMax: 1999 },
  { id: 14, category: "Era Constraints", query: "classic 80s sci fi adventure", expectedGenres: ["Science Fiction", "Adventure"], yearMin: 1980, yearMax: 1989 },
  { id: 15, category: "Era Constraints", query: "modern post-2020 cyberpunk thrillers", expectedGenres: ["Science Fiction"], yearMin: 2020 },

  // 5. Complex Mood & Thematic Blends
  { id: 16, category: "Mood Blend", query: "slow burn neo-noir detective mystery", expectedGenres: ["Mystery", "Crime", "Drama"] },
  { id: 17, category: "Mood Blend", query: "philosophical space exploration with loneliness", expectedGenres: ["Science Fiction", "Drama"] },
  { id: 18, category: "Mood Blend", query: "dystopian artificial intelligence existential crisis", expectedGenres: ["Science Fiction", "Drama"] },
  { id: 19, category: "Mood Blend", query: "high octane heist movies with smart twists", expectedGenres: ["Action", "Crime", "Thriller"] },
  { id: 20, category: "Mood Blend", query: "deep psychological drama with unreliable narrator", expectedGenres: ["Drama", "Thriller"] },

  // 6. Conversational Turns & Recruiter Stress Tests
  { id: 21, category: "Recruiter Stress", query: "recommend me something for tonight with high ratings", minRating: 7.8 },
  { id: 22, category: "Recruiter Stress", query: "films exploring memory loss and altered perception", expectedGenres: ["Mystery", "Thriller", "Science Fiction"] },
  { id: 23, category: "Recruiter Stress", query: "nonlinear storytelling time travel paradoxes", expectedGenres: ["Science Fiction", "Thriller"] },
  { id: 24, category: "Recruiter Stress", query: "understated indie sci-fi with philosophical dialogue", expectedGenres: ["Science Fiction", "Drama"] },
  { id: 25, category: "Recruiter Stress", query: "crime thrillers with great plot twists", expectedGenres: ["Crime", "Thriller", "Mystery"] }
];

function evaluateRelevance(movie, spec) {
  let score = 0;
  let checks = 0;

  if (spec.minRating && movie.rating) {
    checks++;
    if (Number(movie.rating) >= spec.minRating - 0.5) score++;
  }

  if (spec.yearMin && movie.year) {
    checks++;
    const yr = Number(movie.year);
    if (yr >= spec.yearMin && (!spec.yearMax || yr <= spec.yearMax + 1)) score++;
  }

  if (spec.expectedGenres?.length && movie.genres?.length) {
    checks++;
    const hasAnyGenre = spec.expectedGenres.some(g => 
      movie.genres.some(mg => typeof mg === 'string' && mg.toLowerCase().includes(g.toLowerCase()))
    );
    if (hasAnyGenre) score++;
  }

  if (spec.expectedDirectors?.length) {
    checks++;
    const movieDirectors = Array.isArray(movie.directors) ? movie.directors : [];
    const hasDirector = spec.expectedDirectors.some(d =>
      movieDirectors.some(md => typeof md === 'string' && md.toLowerCase().includes(d.toLowerCase())) ||
      (Array.isArray(movie.reasoningPaths) && movie.reasoningPaths.some(rp => rp.value?.toLowerCase().includes(d.toLowerCase()))) ||
      (Array.isArray(movie.explanation) && movie.explanation.some(e => typeof e === 'string' && e.toLowerCase().includes(d.toLowerCase())))
    );
    if (hasDirector) score++;
  }

  if (spec.excludeGenres?.length && movie.genres?.length) {
    checks++;
    const hasForbidden = spec.excludeGenres.some(fg => 
      movie.genres.some(mg => typeof mg === 'string' && mg.toLowerCase().includes(fg.toLowerCase()))
    );
    if (!hasForbidden) score++;
  }

  if (checks === 0) return true;
  return (score / checks) >= 0.5;
}

async function runBenchmark() {
  console.log("================================================================================");
  console.log("🚀 STARTING WATCHVIBE AI PRECISION@10 & MAP EVALUATION BENCHMARK (25 PROMPTS)");
  console.log("================================================================================\n");

  const results = [];

  for (const testCase of BENCHMARK_SUITE) {
    process.stdout.write(`Evaluating [${testCase.id}/25] "${testCase.query.slice(0, 36)}"... `);
    const start = performance.now();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testCase.query,
          userId: 'benchmark-evaluator'
        })
      });

      const data = await response.json();
      const latency = Math.round(performance.now() - start);

      const recs = (data.recommendations || data.results || []).slice(0, 10);
      let relevantCount = 0;
      let runningSumOfPrecision = 0;

      recs.forEach((rec, idx) => {
        const isRel = evaluateRelevance(rec, testCase);
        if (isRel) {
          relevantCount++;
          runningSumOfPrecision += (relevantCount / (idx + 1));
        }
      });

      const pAt10 = recs.length > 0 ? (relevantCount / recs.length) : 0;
      const averagePrecision = relevantCount > 0 ? (runningSumOfPrecision / relevantCount) : 0;

      results.push({
        id: testCase.id,
        category: testCase.category,
        query: testCase.query,
        count: recs.length,
        pAt10,
        ap: averagePrecision,
        latency,
        assistantMsg: data.assistantMessage ? data.assistantMessage.slice(0, 45) + "..." : "OK"
      });

      console.log(`P@10: ${(pAt10 * 100).toFixed(0)}% | MAP: ${averagePrecision.toFixed(2)} | Latency: ${latency}ms`);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      results.push({
        id: testCase.id,
        category: testCase.category,
        query: testCase.query,
        count: 0,
        pAt10: 0,
        ap: 0,
        latency: 0,
        assistantMsg: "ERROR"
      });
    }
  }

  const avgP10 = results.reduce((acc, r) => acc + r.pAt10, 0) / results.length;
  const meanAveragePrecision = results.reduce((acc, r) => acc + r.ap, 0) / results.length;
  const avgLatency = Math.round(results.reduce((acc, r) => acc + r.latency, 0) / results.length);

  console.log("\n================================================================================");
  console.log("📊 BENCHMARK EVALUATION SUMMARY (N=25)");
  console.log("================================================================================");
  console.log(`Mean Precision@10:              ${(avgP10 * 100).toFixed(1)}%`);
  console.log(`Mean Average Precision (MAP):   ${meanAveragePrecision.toFixed(3)}`);
  console.log(`Average Latency:                ${avgLatency} ms`);
  console.log(`Success Rate:                   ${results.filter(r => r.count > 0).length} / 25 (${((results.filter(r => r.count > 0).length / 25) * 100).toFixed(0)}%)`);
  console.log("================================================================================\n");

  console.log("| ID | Category | Query | P@10 | AP | Latency |");
  console.log("|---|---|---|---|---|---|");
  results.forEach(r => {
    console.log(`| ${r.id} | ${r.category} | ${r.query} | ${(r.pAt10 * 100).toFixed(0)}% | ${r.ap.toFixed(2)} | ${r.latency}ms |`);
  });
}

runBenchmark();
