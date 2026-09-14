import { useEffect, useMemo, useState } from "react";

const FALLBACK_POSTER = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80";

export default function HeroBanner({ movie, heroChoices = [], onPromptSelect, onNavigateToStudio }) {
  const selectableMovies = useMemo(() => {
    const pool = [movie, ...heroChoices].filter(Boolean);
    return pool.filter((entry, index, array) => array.findIndex((item) => item.id === entry.id) === index);
  }, [heroChoices, movie]);

  const [activeMovieId, setActiveMovieId] = useState(movie?.id ?? null);

  useEffect(() => {
    if (!selectableMovies.length) {
      return;
    }

    setActiveMovieId((current) => (selectableMovies.some((entry) => entry.id === current) ? current : selectableMovies[0].id));
  }, [selectableMovies]);

  useEffect(() => {
    if (selectableMovies.length <= 1) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveMovieId((current) => {
        const currentIndex = selectableMovies.findIndex((entry) => entry.id === current);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % selectableMovies.length : 0;
        return selectableMovies[nextIndex].id;
      });
    }, 5200);

    return () => window.clearInterval(intervalId);
  }, [selectableMovies]);

  const activeMovie = selectableMovies.find((entry) => entry.id === activeMovieId) ?? movie;

  function shiftMovie(direction) {
    if (selectableMovies.length <= 1) {
      return;
    }

    setActiveMovieId((current) => {
      const currentIndex = selectableMovies.findIndex((entry) => entry.id === current);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + direction + selectableMovies.length) % selectableMovies.length;
      return selectableMovies[nextIndex].id;
    });
  }

  if (!activeMovie) {
    return null;
  }

  return (
    <section
      className="hero hero--billboard"
      style={{ "--hero-accent": activeMovie.accent || "#ff6b2c" }}
    >
      {/* Spread poster artwork (freed from the box, fills the right side/hero background) */}
      <div className="hero__art-container">
        <img
          key={activeMovie.id}
          src={activeMovie.backdropUrl || activeMovie.posterUrl || FALLBACK_POSTER}
          alt=""
          className="hero__spread-art"
          onError={(e) => {
            if (e.currentTarget.src !== FALLBACK_POSTER) {
              e.currentTarget.src = FALLBACK_POSTER;
            }
          }}
        />
        {/* Dark cinema gradient: clean, solid dark on left for text readability; bleeds into art on right */}
        <div className="hero__gradient-overlay" />
      </div>

      {/* Left-anchored clean content with stable, non-shifting position */}
      <div className="hero__content">
        <p className="hero__kicker">Featured Spotlight</p>
        
        <h1 className="hero__title" title={activeMovie.title}>
          {activeMovie.title}
        </h1>

        <div className="hero__meta">
          {activeMovie.year && <span>{activeMovie.year}</span>}
          {activeMovie.rating && <span>★ {Number(activeMovie.rating).toFixed(1)} IMDb</span>}
          {activeMovie.genres?.length > 0 && <span>{activeMovie.genres.slice(0, 2).join(" • ")}</span>}
          <span className="hero__match-badge">🍅 {Math.round(activeMovie.rating * 10 || 94)}% Match</span>
        </div>

        <p className="hero__overview">
          {activeMovie.overview || "An exceptional feature from our curated AI Knowledge Graph catalog."}
        </p>

        <div className="hero__actions">
          {onNavigateToStudio && (
            <button
              className="hero__copilot-btn"
              type="button"
              onClick={onNavigateToStudio}
            >
              <span>✨</span> Refine with AI Copilot →
            </button>
          )}
          <button
            className="hero__secondary-btn"
            type="button"
            onClick={() =>
              onPromptSelect(`movies like ${activeMovie.title}`, {
                type: "hero_reference",
                movieId: activeMovie.id,
                source: "hero-primary"
              })
            }
          >
            Movies Like This
          </button>
        </div>

        {/* Minimal dot indicators */}
        {selectableMovies.length > 1 && (
          <div className="hero__indicators" aria-label="Featured movie switcher">
            {selectableMovies.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`hero__indicator-dot${entry.id === activeMovie.id ? " is-active" : ""}`}
                onClick={() => setActiveMovieId(entry.id)}
                aria-label={`Switch to ${entry.title}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Subtle edge carousel navigation controls */}
      {selectableMovies.length > 1 && (
        <>
          <button
            type="button"
            className="hero__edge-nav hero__edge-nav--left"
            onClick={() => shiftMovie(-1)}
            aria-label="Previous featured movie"
          >
            ‹
          </button>
          <button
            type="button"
            className="hero__edge-nav hero__edge-nav--right"
            onClick={() => shiftMovie(1)}
            aria-label="Next featured movie"
          >
            ›
          </button>
        </>
      )}
    </section>
  );
}
