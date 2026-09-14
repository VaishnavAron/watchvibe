import React, { useRef } from "react";

export default function CinematicPosterCard({ movie, index, onSelect }) {
  const cardRef = useRef(null);
  const rafId = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    if (rafId.current) cancelAnimationFrame(rafId.current);

    rafId.current = requestAnimationFrame(() => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -7;
      const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 7;
      cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(1)}deg) rotateY(${rotateY.toFixed(1)}deg) translateY(-8px) scale3d(1.025, 1.025, 1.025)`;
    });
  };

  const handleMouseEnter = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = "transform 0.08s ease-out";
  };

  const handleMouseLeave = () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    if (!cardRef.current) return;
    cardRef.current.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
    cardRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale3d(1, 1, 1)";
  };

  // Calibrate display match percentage: normalize normalized similarity >= 0.60 to 82%-99%
  const calculateDisplayMatch = () => {
    if (movie.scores?.matchPercentage) return movie.scores.matchPercentage;
    const raw = typeof movie.similarityScore === "number" ? movie.similarityScore : (typeof movie.score === "number" ? movie.score : null);
    if (raw !== null) {
      if (raw >= 1) return 99;
      // Rescale [0.60, 1.0] -> [82, 99]
      const scaled = Math.round(82 + Math.max(0, (raw - 0.60) / 0.40) * 17);
      return Math.min(99, Math.max(78, scaled));
    }
    return 91;
  };

  const matchPct = calculateDisplayMatch();
  const posterUrl = movie.posterUrl || movie.poster_url || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop";
  const genres = Array.isArray(movie.genres) ? movie.genres.slice(0, 2) : [];

  // Step 3: Graph Explainability Reason
  const graphExplanation = movie.isDirectTagMatch 
    ? "Direct Graph Match"
    : (movie.cooccurrenceScore ? "Collaborative Cluster" : null);

  return (
    <div
      ref={cardRef}
      className="cinematic-card-wrapper"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onSelect?.(movie)}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${movie.title}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(movie); }}
    >
      <div className="cinematic-poster-frame">
        {/* Specular Glare Effect Layer */}
        <div className="specular-highlight-layer" />

        {/* Poster Image */}
        <img
          src={posterUrl}
          alt={movie.title}
          className="cinematic-poster-img"
          loading="lazy"
          onError={(e) => {
            const fallback = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80";
            if (e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback;
            }
          }}
        />

        {/* Top Match Badge Pill */}
        <div className="card-top-badges">
          {movie.isRelaxed ? (
            <span className="match-badge-pill match-relaxed" title={movie.relaxationReason}>
              <span className="match-badge-dot match-badge-dot--amber" />
              {movie.relaxationReason || "Adjacent"}
            </span>
          ) : (
            <span className={`match-badge-pill ${matchPct >= 85 ? "match-high" : "match-mid"}`} title={graphExplanation || `${matchPct}% Match`}>
              <span className="match-badge-dot" />
              {graphExplanation || `${matchPct}% Match`}
            </span>
          )}
          {movie.rating && (
            <span className="rating-badge-pill">
              ★ {Number(movie.rating).toFixed(1)}
            </span>
          )}
        </div>

        {/* Bottom Ambient Vignette & Quick Metadata */}
        <div className="cinematic-card-overlay">
          <h3 className="cinematic-card-title">{movie.title}</h3>
          <div className="cinematic-card-meta">
            <span>{movie.year || "2024"}</span>
            {genres.length > 0 && <span>• {genres.join(" / ")}</span>}
          </div>
          {movie.explanationText ? (
            <p className="cinematic-card-snippet">{movie.explanationText}</p>
          ) : Array.isArray(movie.directMatchTags) && movie.directMatchTags.length > 0 ? (
            <p className="cinematic-card-snippet">Direct match in Neo4j for {movie.directMatchTags.slice(0, 3).join(", ")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
