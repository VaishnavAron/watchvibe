import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function RecommendationDnaDrawer({ isOpen, onClose, movie, runtimeMetrics, query }) {
  if (!isOpen || !movie) return null;

  const rawScore = Number(movie.score || (movie.scores?.matchPercentage ? movie.scores.matchPercentage / 100 : 0.88));
  const matchPct = movie.scores?.matchPercentage || Math.min(Math.round(rawScore > 1 ? rawScore : rawScore * 100), 100);

  const atmosphericScore = Math.round(Number(movie.scores?.tasteAlignment || movie.scoreBreakdown?.userPreference || 0.89) * 100);
  const narrativeScore = Math.round(Number(movie.scores?.vectorSimilarity || movie.scoreBreakdown?.semanticSimilarity || 0.84) * 100);
  const directorialScore = Math.round(Number(movie.scores?.graphScore || movie.scoreBreakdown?.graphScore || 0.78) * 100);

  const explanation = movie.explanationText || 
    (Array.isArray(movie.explanation) ? movie.explanation.join(" • ") : movie.explanation) ||
    "Selected based on high thematic resonance, emotional intensity, and shared storytelling DNA matching your cinematic preferences.";

  // Clean human-readable film connection chips
  const reasoningPaths = (movie.reasoningPaths && movie.reasoningPaths.length > 0)
    ? movie.reasoningPaths.map(p => {
        const cleanType = String(p.type || "").replace(/^(SAME_|USER_|VECTOR_|GRAPH_)/i, "").replace(/_/g, " ").toLowerCase();
        return { label: cleanType ? cleanType.charAt(0).toUpperCase() + cleanType.slice(1) : "Film Element", value: p.value };
      })
    : [
        { label: "Narrative Mood", value: movie.genres?.[0] || "Sci-Fi Thriller" },
        { label: "Visual Style", value: "Atmospheric & High Suspense" },
        { label: "Directorial Tone", value: "Immersive & Character-Driven" }
      ];

  const posterUrl = movie.posterUrl || movie.backdropUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop";

  return (
    <AnimatePresence>
      <div className="dna-drawer-overlay" onClick={onClose}>
        <motion.aside 
          className="dna-drawer glass-panel"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="dna-drawer__header">
            <div className="dna-drawer__badge">
              <span className="dna-drawer__pulse"></span>
              <span>Cinematic DNA & Taste Resonance</span>
            </div>
            <button className="dna-drawer__close" onClick={onClose} aria-label="Close Drawer">
              ✕
            </button>
          </div>

          {/* Hero Film Spotlight */}
          <div className="dna-drawer__hero">
            <img 
              src={posterUrl} 
              alt={movie.title} 
              className="dna-drawer__poster"
            />
            <div className="dna-drawer__hero-info">
              <div className="dna-drawer__match-pill">
                <strong>{matchPct}%</strong>
                <span>Taste Match</span>
              </div>
              <h2 className="dna-drawer__title">{movie.title}</h2>
              <p className="dna-drawer__meta">
                {movie.year || 2024} • {movie.duration ? `${movie.duration}m` : "Feature Film"} • {movie.genres?.slice(0, 2).join(" / ") || "Cinematic Pick"}
              </p>
              <div className="dna-drawer__tags">
                {(movie.tags || movie.genres || []).slice(0, 4).map((tag, idx) => (
                  <span key={idx} className="dna-drawer__tag">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="dna-drawer__scrollable">
            
            {/* Curator Recommendation Spotlight */}
            <section className="dna-drawer__section">
              <div className="dna-section-title">
                <span className="dna-icon">✨</span>
                <h3>Why You&rsquo;ll Love This Film</h3>
              </div>
              <div className="dna-card dna-card--quote">
                <p>&ldquo;{explanation}&rdquo;</p>
                <div className="dna-card__footer">
                  <span>Curated for your emotional and thematic preferences</span>
                </div>
              </div>
            </section>

            {/* Cinematic Harmony Breakdown (Client-Pitch Presentation) */}
            <section className="dna-drawer__section">
              <div className="dna-section-title">
                <span className="dna-icon">🎯</span>
                <h3>Cinematic Harmony Breakdown</h3>
              </div>

              <div className="dna-metric-bars">
                
                {/* Metric 1 */}
                <div className="dna-metric-bar">
                  <div className="dna-metric-bar__label">
                    <span>Atmospheric & Emotional Pacing</span>
                    <strong>{atmosphericScore}%</strong>
                  </div>
                  <div className="dna-progress-track">
                    <motion.div 
                      className="dna-progress-fill dna-progress-fill--cyan"
                      initial={{ width: 0 }}
                      animate={{ width: `${atmosphericScore}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="dna-metric-bar">
                  <div className="dna-metric-bar__label">
                    <span>Thematic Depth & Narrative Chemistry</span>
                    <strong>{narrativeScore}%</strong>
                  </div>
                  <div className="dna-progress-track">
                    <motion.div 
                      className="dna-progress-fill dna-progress-fill--purple"
                      initial={{ width: 0 }}
                      animate={{ width: `${narrativeScore}%` }}
                      transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="dna-metric-bar">
                  <div className="dna-metric-bar__label">
                    <span>Directorial Vision & Tone Alignment</span>
                    <strong>{directorialScore}%</strong>
                  </div>
                  <div className="dna-progress-track">
                    <motion.div 
                      className="dna-progress-fill dna-progress-fill--emerald"
                      initial={{ width: 0 }}
                      animate={{ width: `${directorialScore}%` }}
                      transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    />
                  </div>
                </div>

              </div>
            </section>

            {/* Shared Storytelling Connections */}
            <section className="dna-drawer__section">
              <div className="dna-section-title">
                <span className="dna-icon">🎞️</span>
                <h3>Storytelling & Filmmaking Connections</h3>
              </div>

              <div className="dna-path-list">
                {reasoningPaths.map((path, idx) => (
                  <div key={idx} className="dna-path-item">
                    <span className="dna-path-tag">{path.label}</span>
                    <span className="dna-path-value">{path.value}</span>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
