import React from "react";
import CinematicPosterCard from "./CinematicPosterCard";

export default function CinematicPosterGrid({
  movies = [],
  visibleCount = 12,
  onLoadMore,
  onSelectMovie
}) {
  const visible = movies.slice(0, visibleCount);
  const hasMore = movies.length > visibleCount;

  if (movies.length === 0) {
    return (
      <div className="empty-freeflow-state">
        <p>No cinematic matches found. Try refining your mood or asking for a specific director or theme.</p>
      </div>
    );
  }

  return (
    <div className="freeflow-grid-wrapper">
      {/* Free-flow responsive poster grid */}
      <div className="freeflow-poster-grid">
        {visible.map((movie, index) => (
          <CinematicPosterCard
            key={movie.id || `${movie.title}-${index}`}
            movie={movie}
            index={index}
            onSelect={onSelectMovie}
          />
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="freeflow-load-more-wrap">
          <button
            type="button"
            className="freeflow-load-more-btn"
            onClick={onLoadMore}
          >
            Load More Titles ({movies.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
