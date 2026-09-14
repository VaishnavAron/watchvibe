import React, { useState } from "react";

export default function RecommendationCard2Col({ movie, index = 0, onOpenDnaDrawer }) {
  const [isWhyOpen, setIsWhyOpen] = useState(false);

  const title = movie.title || "Unknown Title";
  const year = movie.year || "N/A";
  
  // Genres / themes
  const genres = movie.genres?.length > 0
    ? movie.genres
    : String(movie.metadata || "").split(" / ").map(e => e.trim()).filter(Boolean);

  const tags = movie.tags?.length > 0 ? movie.tags.slice(0, 4) : genres.slice(0, 4);

  // Scores
  const rawScore = Number(movie.scores?.matchPercentage ?? (typeof movie.rating === "number" ? Math.round(movie.rating * 10) : 88));
  const score = Math.min(Math.max(rawScore, 10), 99);

  const rawConfidence = Number(movie.scores?.tasteAlignment ?? (typeof movie.rating === "number" ? Math.min(0.99, movie.rating / 10) : 0.89));
  const confidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;
  const alignmentPercent = Math.min(98, Math.round(confidence * 100));

  const posterUrl = movie.posterUrl || movie.backdropUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop";

  const explanation = movie.explanationText || 
    (Array.isArray(movie.explanation) ? movie.explanation.join(" ") : movie.explanation) ||
    "Selected based on high thematic resonance, semantic vector alignment, and graph co-occurrence patterns matching your taste profile.";

  // Score ring circumference: 2 * Math.PI * 48 ≈ 301.6
  const circumference = 302;
  const strokeDashoffset = circumference - (circumference * score) / 100;

  return (
    <article 
      className="recommendation-card glass-panel"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="poster-wrap">
        <img
          src={posterUrl}
          alt={`${title} poster`}
          className="poster-image"
          loading="lazy"
          onError={(e) => {
            const fallback = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80";
            if (e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback;
            }
          }}
        />
        
        {/* Top-Right DNA Button */}
        <button 
          type="button"
          className="card-dna-pill"
          title="Inspect Knowledge Graph & Vector DNA"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDnaDrawer?.(movie);
          }}
        >
          <span>⚡</span> DNA
        </button>

        {/* Circular SVG Match Ring */}
        <div className="poster-score">
          <svg viewBox="0 0 120 120" className="score-ring" aria-hidden="true">
            <circle cx="60" cy="60" r="48"></circle>
            <circle 
              cx="60" 
              cy="60" 
              r="48" 
              className="score-progress"
              style={{ strokeDashoffset }}
            ></circle>
          </svg>
          <div className="score-copy">
            <strong>{score}%</strong>
            <span>Match</span>
          </div>
        </div>
      </div>

      <div className="card-copy">
        <div className="card-head">
          <div>
            <div className="card-title-row">
              <h3>{title}</h3>
              {movie.wasAutoCorrected && (
                <span className="auto-correct-badge" title="Auto-corrected from query">
                  Auto-Corrected
                </span>
              )}
            </div>
            <p className="card-subtitle">
              {year} • {genres.slice(0, 2).join(" / ") || "Cinematic Pick"}
            </p>
          </div>

          <div className="alignment-meter">
            <span className="alignment-label">Taste Alignment</span>
            <div className="alignment-track">
              <div className="alignment-fill" style={{ width: `${alignmentPercent}%` }}></div>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="tag-row">
          {tags.map((tag, tIdx) => (
            <span key={tIdx} className="tag">{tag}</span>
          ))}
        </div>

        {/* Confidence & Similarity Pills */}
        <div className="confidence-row">
          <span className="confidence-pill">Confidence {confidence.toFixed(2)}</span>
          <span className="similarity-pill">Similarity {score}%</span>
        </div>

        {/* Expandable Socratic Reasoning */}
        <details 
          className="why-panel" 
          open={isWhyOpen} 
          onToggle={(e) => setIsWhyOpen(e.currentTarget.open)}
        >
          <summary>Why this recommendation?</summary>
          <div className="why-copy">
            <p>{explanation}</p>
          </div>
        </details>
      </div>
    </article>
  );
}
