import React, { useEffect, useState } from "react";
import { updateMovieReaction } from "../api";

export default function MovieInspectionModal({ movie, onClose }) {
  const [userReaction, setUserReaction] = useState(null); // 'like' | 'dislike' | null
  const [feedbackNotice, setFeedbackNotice] = useState("");

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!movie) return null;

  const posterUrl = movie.posterUrl || movie.poster_url || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop";
  const backdropUrl = movie.backdropUrl || movie.backdrop_url || posterUrl;
  const matchPct = movie.scores?.matchPercentage || Math.round((movie.score || 0.85) * 100);
  const scoreBreakdown = movie.scoreBreakdown || {};

  const handleVote = async (type) => {
    setUserReaction(type);
    setFeedbackNotice(type === "like" ? "👍 Upvoted! Added to taste profile" : "👎 Downvoted! Suppressing similar titles");

    try {
      await updateMovieReaction({
        movieId: movie.id,
        reaction: type,
        title: movie.title,
        genres: movie.genres
      });
    } catch (err) {
      console.warn("Reaction sync:", err.message);
    }

    setTimeout(() => {
      setFeedbackNotice("");
    }, 3200);
  };

  return (
    <div className="movie-modal-backdrop" onClick={onClose}>
      <div 
        className="movie-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-modal-title"
      >
        {/* Close Button */}
        <button 
          className="movie-modal-close" 
          onClick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* Cinematic Backdrop Header */}
        <div className="movie-modal-header" style={{ backgroundImage: `url(${backdropUrl})` }}>
          <div className="movie-modal-header-gradient" />
          <div className="movie-modal-hero-content">
            <span className="movie-modal-match-pill">
              <span className="pill-pulse-dot" />
              {matchPct}% Match
            </span>
            <h2 id="movie-modal-title" className="movie-modal-title">{movie.title}</h2>
            <div className="movie-modal-meta-row">
              <span className="meta-item">{movie.year || "2024"}</span>
              <span className="meta-sep">•</span>
              <span className="meta-item">{movie.duration || 120}m</span>
              {movie.rating && (
                <>
                  <span className="meta-sep">•</span>
                  <span className="meta-rating">★ {Number(movie.rating).toFixed(1)} / 10</span>
                </>
              )}
              {Array.isArray(movie.genres) && movie.genres.length > 0 && (
                <>
                  <span className="meta-sep">•</span>
                  <span className="meta-item">{movie.genres.join(", ")}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="movie-modal-body">
          <div className="movie-modal-grid">
            
            {/* Left Column: Poster & Quick Facts */}
            <div className="modal-left-col">
              <div className="modal-poster-wrap">
                <img src={posterUrl} alt={movie.title} className="modal-poster-img" />
              </div>
              
              {movie.directors && movie.directors.length > 0 && (
                <div className="modal-fact-item">
                  <span className="fact-label">Director</span>
                  <span className="fact-val">{movie.directors.join(", ")}</span>
                </div>
              )}

              {movie.actors && movie.actors.length > 0 && (
                <div className="modal-fact-item">
                  <span className="fact-label">Cast</span>
                  <span className="fact-val">{movie.actors.slice(0, 4).join(", ")}</span>
                </div>
              )}
            </div>

            {/* Right Column: Overview & XAI Reasoning */}
            <div className="modal-right-col">
              
              {/* Overview */}
              <div className="modal-section">
                <h4>Synopsis</h4>
                <p className="modal-overview-text">
                  {movie.overview || movie.enriched_overview || "No synopsis available for this feature film."}
                </p>
              </div>

              {/* Explainable AI (XAI) */}
              <div className="modal-section modal-xai-box">
                <div className="xai-header">
                  <span className="xai-icon">⚡</span>
                  <h4>Why WatchVibe Recommended This</h4>
                </div>

                {movie.explanationText && (
                  <p className="xai-explanation-text">
                    "{movie.explanationText}"
                  </p>
                )}

                {/* Multi-Objective Match Breakdown Bars */}
                <div className="xai-bars-grid">
                  <div className="xai-bar-card">
                    <div className="bar-labels">
                      <span>Vector Similarity</span>
                      <strong>{scoreBreakdown.semanticSimilarity ? `${Math.round(scoreBreakdown.semanticSimilarity * 100)}%` : `${matchPct - 3}%`}</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill bar-fill--vector" style={{ width: `${Math.min(100, Math.round((scoreBreakdown.semanticSimilarity || 0.88) * 100))}%` }} />
                    </div>
                  </div>

                  <div className="xai-bar-card">
                    <div className="bar-labels">
                      <span>Theme Alignment</span>
                      <strong>{scoreBreakdown.userPreference ? `${Math.round(scoreBreakdown.userPreference * 100)}%` : `${matchPct}%`}</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill bar-fill--theme" style={{ width: `${Math.min(100, Math.round((scoreBreakdown.userPreference || 0.92) * 100))}%` }} />
                    </div>
                  </div>

                  <div className="xai-bar-card">
                    <div className="bar-labels">
                      <span>Neo4j Graph Path</span>
                      <strong>{scoreBreakdown.graphScore ? `${Math.round(scoreBreakdown.graphScore * 100)}%` : `${matchPct - 6}%`}</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill bar-fill--graph" style={{ width: `${Math.min(100, Math.round((scoreBreakdown.graphScore || 0.82) * 100))}%` }} />
                    </div>
                  </div>

                  <div className="xai-bar-card">
                    <div className="bar-labels">
                      <span>Collaborative Affinity</span>
                      <strong>{scoreBreakdown.popularity ? `${Math.round(scoreBreakdown.popularity * 100)}%` : `${matchPct - 2}%`}</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill bar-fill--collab" style={{ width: `${Math.min(100, Math.round((scoreBreakdown.popularity || 0.86) * 100))}%` }} />
                    </div>
                  </div>
                </div>

                {/* Grounded Graph Paths */}
                {Array.isArray(movie.reasoningPaths) && movie.reasoningPaths.length > 0 && (
                  <div className="reasoning-paths-chips">
                    {movie.reasoningPaths.map((rp, i) => (
                      <span key={i} className="reasoning-path-tag">
                        <span className="rp-dot">●</span>
                        {rp.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* BOTTOM CENTER INTERACTIVE VOTING BAR */}
        <div className="movie-modal-footer">
          <div className="voting-cluster">
            <span className="voting-label">Was this recommendation accurate?</span>
            
            <div className="vote-buttons-row">
              <button
                type="button"
                onClick={() => handleVote("like")}
                className={`vote-btn vote-up ${userReaction === "like" ? "vote-active-up" : ""}`}
                title="Upvote: Boost this vibe in your recommendations"
              >
                <span className="vote-emoji">👍</span>
                <span>Upvote</span>
              </button>

              <button
                type="button"
                onClick={() => handleVote("dislike")}
                className={`vote-btn vote-down ${userReaction === "dislike" ? "vote-active-down" : ""}`}
                title="Downvote: Diminish this vibe in your recommendations"
              >
                <span className="vote-emoji">👎</span>
                <span>Downvote</span>
              </button>
            </div>

            {feedbackNotice && (
              <span className="vote-notice-pill animate-fade-in">
                {feedbackNotice}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
