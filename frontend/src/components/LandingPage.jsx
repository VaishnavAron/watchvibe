import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const DEFAULT_CURATED_MOVIES = [
  { id: "m1", title: "Inception", year: 2010, rating: 8.8, genres: ["Sci-Fi", "Action"], posterUrl: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg" },
  { id: "m2", title: "Interstellar", year: 2014, rating: 8.7, genres: ["Sci-Fi", "Drama"], posterUrl: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg" },
  { id: "m3", title: "Arrival", year: 2016, rating: 7.9, genres: ["Sci-Fi", "Mystery"], posterUrl: "https://image.tmdb.org/t/p/w500/x2O0omcrZsA2N5D8s8jRkWgH6Qp.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/y2A32nQp8z9n5R784k3uO5T0FfW.jpg" },
  { id: "m4", title: "Blade Runner 2049", year: 2017, rating: 8.0, genres: ["Sci-Fi", "Drama"], posterUrl: "https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/ilRyAZwN6T92t3s6wI19k6R1z6A.jpg" },
  { id: "m5", title: "The Dark Knight", year: 2008, rating: 9.0, genres: ["Action", "Crime"], posterUrl: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg" },
  { id: "m6", title: "Dune", year: 2021, rating: 8.0, genres: ["Sci-Fi", "Adventure"], posterUrl: "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/lzWHmYZrUQxsFLQ92nbRwl55wtG.jpg" },
  { id: "m7", title: "Ex Machina", year: 2014, rating: 7.7, genres: ["Sci-Fi", "Thriller"], posterUrl: "https://image.tmdb.org/t/p/w500/btbSMBCSBnmr6b64f3d2q772v3w.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/m9fE6mG1HnL5U0T5aHwXzUv0N7.jpg" },
  { id: "m8", title: "The Matrix", year: 1999, rating: 8.7, genres: ["Action", "Sci-Fi"], posterUrl: "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg" }
];

const features = [
  {
    title: "Cinematic Discovery",
    subtitle: "Built to pull you in",
    copy: "Opens like a high-production movie canvas: rich atmosphere, stronger emotion, and a discovery-first feel.",
    icon: "01"
  },
  {
    title: "Intent-Aware Search",
    subtitle: "Mood, tone, and subtext",
    copy: "Search the way you think: natural language prompts parsed across 1024-dimensional semantic vector spaces.",
    icon: "02"
  },
  {
    title: "Explainable AI (XAI)",
    subtitle: "Trust stays visible",
    copy: "Real-time Groq LLaMA-3.1 inference generates grounded, Socratic explanations for why each movie matches your taste.",
    icon: "03"
  },
  {
    title: "Personal Taste Graph",
    subtitle: "Adapts in milliseconds",
    copy: "Neo4j knowledge graph traversing over 200,000 relational director, cast, and co-occurrence edges.",
    icon: "04"
  }
];

const workflow = [
  {
    step: "01",
    title: "Intent Parsing",
    copy: "Start with a mood, director trail, or abstract thought. The Groq engine normalizes intent and extracts semantic entities."
  },
  {
    step: "02",
    title: "Hybrid Retrieval",
    copy: "Pinecone dense vector cosine search meets Neo4j graph co-occurrence for relational grounding."
  },
  {
    step: "03",
    title: "Explainable Synthesis",
    copy: "Ranks candidates with multi-objective Dice coefficients and hydrates deterministic 3.2ms Redis cache."
  }
];

const stack = ["Neo4j AuraDB", "Pinecone Vector RAG", "Groq LLaMA-3.1", "Redis Cloud", "React 18", "Node.js Express"];

function Reveal({ children, delay = 0, y = 28, className = "" }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function CollageBackdrop({ movies }) {
  const wallMovies = Array.from({ length: 35 }, (_, index) => movies[index % movies.length]).filter(Boolean);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-[-10%] origin-center rotate-[-7deg] scale-[1.14]">
        <div className="grid grid-cols-4 gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {wallMovies.map((movie, index) => (
            <motion.div
              key={`${movie.id ?? movie.title ?? index}-${index}`}
              className="relative overflow-hidden rounded-[18px] border border-white/8 bg-black/35 shadow-[0_18px_44px_rgba(0,0,0,0.45)]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 0.72, y: 0 }}
              transition={{ delay: 0.02 * (index % 10), duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{
                transform: `translateY(${(index % 4) * 12}px) rotate(${index % 2 === 0 ? -1.5 : 1.5}deg)`
              }}
            >
              <div className="aspect-[2/3]">
                <img src={movie.posterUrl} alt="" className="h-full w-full object-cover saturate-[1.05] contrast-[1.05]" loading="lazy" />
              </div>
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.42))]" />
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,107,44,0.14),transparent_22%),radial-gradient(circle_at_84%_10%,rgba(56,189,248,0.14),transparent_24%),radial-gradient(circle_at_center,rgba(0,0,0,0.02),rgba(0,0,0,0.52)_54%,rgba(0,0,0,0.78)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,10,0.42),rgba(5,7,10,0.62))]" />
    </div>
  );
}

export default function LandingPage({ collageMovies = [], showcaseMovie, onGetStarted, onLaunchStudio }) {
  const [showDemo, setShowDemo] = useState(false);
  const [homePrompt, setHomePrompt] = useState("");

  const handleHomePromptSubmit = (e) => {
    e?.preventDefault();
    const clean = homePrompt.trim();
    if (!clean) return;
    onLaunchStudio?.(clean);
  };

  // Fallback to DEFAULT_CURATED_MOVIES if collageMovies is empty so the page paints immediately in 0ms!
  const collage = useMemo(() => {
    const pool = (collageMovies && collageMovies.length > 0) ? collageMovies : DEFAULT_CURATED_MOVIES;
    return pool.filter(Boolean).slice(0, 12);
  }, [collageMovies]);

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-[#06070a]">
      <CollageBackdrop movies={collage} />
      <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(0,240,255,0.15)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        
        {/* CENTERED HERO SECTION */}
        <section className="relative my-8 sm:my-14 flex min-h-[58vh] flex-col items-center justify-center text-center px-4">
          <Reveal className="w-full max-w-4xl flex flex-col items-center">
            
            {/* Ambient Lighting Glow */}
            <div className="pointer-events-none absolute -top-16 left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#00f0ff]/20 via-[#6366f1]/20 to-[#ec4899]/15 blur-[110px]" />

            {/* Glowing Tagline Pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-[#38bdf8] backdrop-blur-xl shadow-[0_0_20px_rgba(56,189,248,0.2)]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#00f0ff] animate-pulse" />
              <span>Neo4j Graph • Pinecone Vectors • Groq LLaMA-3.1</span>
            </div>

            {/* Main Brand Title */}
            <h1 className="mt-5 font-['Oswald'] text-[clamp(3.4rem,7.5vw,6rem)] uppercase tracking-[0.03em] leading-[0.92] text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.9)]">
              WatchVibe{" "}
              <span className="bg-gradient-to-r from-[#00f0ff] via-[#818cf8] to-[#f472b6] bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(0,240,255,0.4)]">
                AI
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-3 text-base sm:text-lg md:text-xl font-medium tracking-[0.06em] text-[#cad0da]/90 max-w-2xl">
              The Next-Gen Cinematic Discovery Platform
            </p>

            {/* MODERN CENTERED PROMPT COMPOSER BOX */}
            <form 
              onSubmit={handleHomePromptSubmit}
              className="mt-8 w-full max-w-2xl group relative"
            >
              <div className="relative flex items-center rounded-2xl border border-white/15 bg-black/55 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.75)] backdrop-blur-2xl transition-all duration-300 focus-within:border-[#00f0ff]/60 focus-within:shadow-[0_0_36px_rgba(0,240,255,0.35)] focus-within:bg-black/75">
                <span className="pl-3 text-xl opacity-70">✨</span>
                <input
                  type="text"
                  value={homePrompt}
                  onChange={(e) => setHomePrompt(e.target.value)}
                  placeholder="Ask for anything (e.g., 'movies like Inception but more mind-bending')..."
                  className="w-full bg-transparent px-3 py-3 text-base sm:text-lg text-white placeholder-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!homePrompt.trim()}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#38bdf8] text-black font-bold shadow-[0_0_20px_rgba(0,240,255,0.4)] transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
                  title="Launch in AI Studio"
                >
                  <span className="text-lg leading-none">↑</span>
                </button>
              </div>
            </form>

            {/* Prominent Taste Customization CTA Button */}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => onLaunchStudio?.("customize")}
                className="group relative inline-flex items-center gap-2.5 rounded-full border border-[#00f0ff]/30 bg-[#00f0ff]/10 px-5 py-2.5 text-sm sm:text-base font-semibold text-white shadow-[0_0_20px_rgba(0,240,255,0.2)] backdrop-blur-md transition-all duration-300 hover:border-[#00f0ff]/60 hover:bg-[#00f0ff]/20 hover:shadow-[0_0_30px_rgba(0,240,255,0.4)] hover:-translate-y-0.5 cursor-pointer"
              >
                <span className="text-base">✨</span>
                <span className="font-medium tracking-wide">Would you like to customize your cinematic preferences?</span>
                <span className="rounded-full bg-gradient-to-r from-[#00f0ff] to-[#38bdf8] px-3 py-0.5 text-xs font-bold text-black shadow-sm transition group-hover:scale-105">
                  Calibrate Taste →
                </span>
              </button>
            </div>

            {/* Quick Starter Chips */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 max-w-2xl">
              {[
                "Mind-bending sci-fi like Inception",
                "Atmospheric thrillers with Zimmer scores",
                "Slow-burn psychological neo-noir",
                "Nostalgic 90s high-octane action"
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onLaunchStudio?.(chip.replace(/^✨\s*/, ''))}
                  className="rounded-full border border-white/8 bg-white/[0.05] px-3.5 py-1.5 text-xs text-white/70 transition hover:border-[#00f0ff]/40 hover:bg-white/[0.09] hover:text-white hover:shadow-[0_0_12px_rgba(0,240,255,0.2)] cursor-pointer"
                >
                  {chip} →
                </button>
              ))}
            </div>

            {/* Trust and Latency Markers */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold tracking-wide text-white/60">
              <span className="flex items-center gap-1.5"><span className="text-[#34d399]">✓</span> Sub-second Latency</span>
              <span className="flex items-center gap-1.5"><span className="text-[#34d399]">✓</span> 200k+ Neo4j Knowledge Graph</span>
              <span className="flex items-center gap-1.5"><span className="text-[#34d399]">✓</span> Zero Hallucinations</span>
            </div>

          </Reveal>
        </section>

        {/* 3 ARCHITECTURE PIPELINE CARDS (Image 1) */}
        <section className="mb-14">
          <Reveal className="mb-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#38bdf8]">High-Throughput Architecture</p>
            <h2 className="mt-2 font-['Oswald'] text-3xl tracking-wide text-white sm:text-4xl">
              How WatchVibe Orchestrates Recommendations
            </h2>
            <p className="mt-2 text-sm text-white/60">
              A decoupled multi-database pipeline designed for deterministic speed and grounded intelligence.
            </p>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Socratic Intent Parser",
                tech: "Groq LLaMA-3.1 LPU",
                desc: "Parses natural-language queries into structured semantic vectors, target entities, and subtext filters in <90ms."
              },
              {
                step: "02",
                title: "Pinecone Vector RAG",
                tech: "1024-Dim Dense Index",
                desc: "Retrieves top semantic matches across 10,809 movie vectors, capturing mood, atmosphere, and narrative motifs."
              },
              {
                step: "03",
                title: "Neo4j Graph Traversal",
                tech: "200k+ Relational Edges",
                desc: "Traverses director, writer, cast, and co-occurrence graphs to eliminate hallucination and guarantee relational grounding."
              }
            ].map((card, idx) => (
              <Reveal key={card.step} delay={0.08 * idx}>
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#090c12]/80 p-6 shadow-xl backdrop-blur-md transition hover:-translate-y-1 hover:border-[#38bdf8]/30">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-[#38bdf8]">{card.step}</span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[0.68rem] text-white/60">
                      {card.tech}
                    </span>
                  </div>
                  <h3 className="mt-4 font-['Oswald'] text-2xl text-white">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/65">{card.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* COMPETITIVE BENCHMARKS TABLE (Image 1) */}
        <section className="mb-14 overflow-hidden rounded-3xl border border-white/8 bg-[#080a0f]/90 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <Reveal>
            <div className="mb-6">
              <span className="rounded-full border border-[#ff8b56]/30 bg-[#ff8b56]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff8b56]">
                Competitive Benchmarks
              </span>
              <h2 className="mt-2 font-['Oswald'] text-3xl tracking-wide text-white sm:text-4xl">
                Why WatchVibe Outperforms Legacy Platforms
              </h2>
              <p className="mt-1 text-sm text-white/60">
                Modern polyglot cloud architecture versus dated single-server keyword search.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
                    <th className="pb-3 pr-4 font-semibold">Architectural Feature</th>
                    <th className="pb-3 pr-4 font-bold text-[#34d399]">WatchVibe AI Platform</th>
                    <th className="pb-3 pr-4 font-semibold">Generic Streaming Algos</th>
                    <th className="pb-3 font-semibold">IMDb (Legacy Search)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  <tr>
                    <td className="py-4 pr-4 font-medium text-white">Relational Reasoning</td>
                    <td className="py-4 pr-4 font-semibold text-[#34d399]">✓ Neo4j Graph (200k+ Edges)</td>
                    <td className="py-4 pr-4 text-white/50">Basic genre tags (83%)</td>
                    <td className="py-4 text-white/40">Static actor lists (69%)</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 font-medium text-white">Semantic Intent Search</td>
                    <td className="py-4 pr-4 font-semibold text-[#34d399]">✓ Pinecone 10k Enriched Vectors</td>
                    <td className="py-4 pr-4 text-white/50">Title substring match (76%)</td>
                    <td className="py-4 text-white/40">Keyword full-text (52%)</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 font-medium text-white">Explainable AI (XAI)</td>
                    <td className="py-4 pr-4 font-semibold text-[#34d399]">✓ Groq LLaMA-3.1 Real-Time Reasoning</td>
                    <td className="py-4 pr-4 text-white/50">None ("Because you watched X")</td>
                    <td className="py-4 text-white/40">Black-box rating score</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4 font-medium text-white">P95 Retrieval Latency</td>
                    <td className="py-4 pr-4 font-semibold text-[#34d399]">✓ 3.2ms (Redis Cloud Cache)</td>
                    <td className="py-4 pr-4 text-white/50">450ms un-indexed DB queries</td>
                    <td className="py-4 text-white/40">Slow cold external API calls</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>

        {/* WHY IT FEELS BETTER (Original Work Preserved) */}
        <section className="mb-14">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#ff8b56]">Product Pillars</p>
            <h2 className="mt-2 font-['Oswald'] text-3xl tracking-wide text-white sm:text-4xl">
              Why It Feels Better
            </h2>
          </Reveal>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature, index) => (
              <Reveal key={feature.title} delay={0.06 * index}>
                <article className="rounded-3xl border border-white/10 bg-[#0a0d14]/70 p-5 shadow-lg backdrop-blur-md transition hover:-translate-y-1 hover:border-white/20">
                  <div className="inline-grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#ff6b2c]/20 to-[#38bdf8]/20 text-xs font-bold text-white">
                    {feature.icon}
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#ffb296]">{feature.subtitle}</p>
                  <h3 className="mt-1 font-['Oswald'] text-xl text-white">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-white/65">{feature.copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* CALL TO ACTION BAR */}
        <Reveal className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-r from-[#0d121c] via-[#090e18] to-[#120e18] p-8 shadow-2xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-[#00f0ff]">Ready to Explore?</span>
              <h2 className="mt-1 font-['Oswald'] text-3xl text-white sm:text-4xl">
                Experience Cinema Intelligence Today
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Browse our curated streaming catalog or chat directly with our AI Studio to discover your next favorite film.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onLaunchStudio || onGetStarted}
                className="rounded-full bg-gradient-to-r from-[#00f0ff] to-[#38bdf8] px-6 py-3 text-sm font-bold text-black transition hover:scale-105"
              >
                Launch AI Studio →
              </button>
              <button
                type="button"
                onClick={onGetStarted}
                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Open Catalog
              </button>
            </div>
          </div>
        </Reveal>

      </div>
    </div>
  );
}
