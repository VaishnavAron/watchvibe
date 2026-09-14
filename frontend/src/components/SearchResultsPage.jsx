import { useEffect, useState } from "react";

function formatReleaseDate(movie) {
  return movie.releaseDate || movie.release_date || movie.release || movie.year || "Not available";
}

function resolvePosterUrl(movie) {
  const candidate =
    movie.posterUrl ||
    movie.posterURL ||
    movie.posterPath ||
    movie.poster_path ||
    movie.poster ||
    movie.image ||
    movie.imageUrl ||
    "";

  if (!candidate) {
    return "";
  }

  if (/^https?:\/\//i.test(candidate) || candidate.startsWith("data:")) {
    return candidate;
  }

  if (candidate.startsWith("/")) {
    return `https://image.tmdb.org/t/p/w500${candidate}`;
  }

  return candidate;
}

function formatRuntime(movie) {
  return movie.runtime || movie.duration ? `${movie.runtime ?? movie.duration} min` : "Not available";
}

function getCastSummary(movie) {
  const castList = Array.isArray(movie.cast)
    ? movie.cast
    : Array.isArray(movie.actors)
      ? movie.actors
      : Array.isArray(movie.crew)
        ? movie.crew
        : [];

  return castList.slice(0, 4).join(", ") || "Not available";
}

function getDirectorSummary(movie) {
  if (typeof movie.director === "string" && movie.director.trim()) {
    return movie.director;
  }

  const directors = Array.isArray(movie.directors)
    ? movie.directors
    : Array.isArray(movie.crew)
      ? movie.crew.filter((entry) => typeof entry === "string")
      : [];

  return directors.slice(0, 2).join(", ") || "Not available";
}

export default function SearchResultsPage({ query, results, loading, error, onMoviePrompt, onMovieSelect }) {
  const [hoveredMovieId, setHoveredMovieId] = useState(null);
  const [dialogStyle, setDialogStyle] = useState({});

  function handleCardEnter(event, movieId) {
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedDialogHeight = 208;
    const gap = 12;
    const viewportPadding = 16;
    const preferredWidth = rect.width;
    const nextLeft = Math.min(
      Math.max(rect.left + rect.width / 2 - preferredWidth / 2, viewportPadding),
      window.innerWidth - preferredWidth - viewportPadding
    );
    const preferredTop = rect.bottom + gap;
    const nextTop = Math.min(
      Math.max(preferredTop, viewportPadding),
      window.innerHeight - estimatedDialogHeight - viewportPadding
    );

    setDialogStyle((current) => ({
      ...current,
      [movieId]: {
        position: "fixed",
        top: `${nextTop}px`,
        left: `${nextLeft}px`,
        width: `${preferredWidth}px`
      }
    }));
    setHoveredMovieId(movieId);
  }

  useEffect(() => {
    function closeDialog() {
      setHoveredMovieId(null);
    }

    window.addEventListener("scroll", closeDialog, { passive: true });
    window.addEventListener("resize", closeDialog);

    return () => {
      window.removeEventListener("scroll", closeDialog);
      window.removeEventListener("resize", closeDialog);
    };
  }, []);

  return (
    <section className="search-results-page">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Movie Search</p>
          <h2>Search Results</h2>
        </div>
        {query && <p className="section-copy section-copy--compact">Query: {query}</p>}
      </div>

      {loading && <div className="surface">Searching movies...</div>}

      {!loading && error && (
        <div className="surface surface--error">
          <strong>{error.message ?? "Search failed."}</strong>
          {error.details && <p>{error.details}</p>}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="surface surface--empty">
          <p className="empty-title">No movies matched that search.</p>
          <p className="section-copy section-copy--compact">Try a title, actor, director, or genre keyword.</p>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="search-results-grid">
          {results.map((movie) => {
            const genres = Array.isArray(movie.genres) ? movie.genres : [];
            const isDialogOpen = hoveredMovieId === movie.id;

            return (
              <article
                className={isDialogOpen ? "genre-card search-result-card search-result-card--dialog-open" : "genre-card search-result-card"}
                key={movie.id}
                style={{ "--movie-accent": movie.accent }}
                onMouseEnter={(event) => handleCardEnter(event, movie.id)}
                onMouseLeave={() => setHoveredMovieId(null)}
              >
                <button type="button" className="genre-card__poster search-result-card__poster-button" onClick={() => onMovieSelect?.(movie.id, movie)}>
                  {resolvePosterUrl(movie) ? (
                    <img src={resolvePosterUrl(movie)} alt={`${movie.title} poster`} />
                  ) : (
                    <div className="search-result-card__poster-fallback" aria-hidden="true">
                      <span>{movie.title?.slice(0, 1)?.toUpperCase() || "M"}</span>
                    </div>
                  )}
                </button>
                <div className="genre-card__body search-result-card__body">
                  <button type="button" className="genre-card__title search-result-card__title" onClick={() => onMovieSelect?.(movie.id, movie)}>
                    {movie.title}
                  </button>
                  <div className="genre-card__meta search-result-card__meta">
                    <span>{movie.rating ?? "N/A"} IMDb</span>
                    {movie.year && <span>{movie.year}</span>}
                  </div>
                </div>
                <div
                  className="search-result-card__dialog search-result-card__dialog--below"
                  style={dialogStyle[movie.id]}
                  aria-hidden={!isDialogOpen}
                >
                  <div className="search-result-card__dialog-meta">
                    <span>{formatReleaseDate(movie)}</span>
                    <span>{movie.rating ?? "N/A"} IMDb</span>
                    <span>{formatRuntime(movie)}</span>
                  </div>
                  <p className="search-result-card__dialog-overview">{movie.overview || "No overview available."}</p>
                  <p className="search-result-card__dialog-detail"><strong>Genres:</strong> {genres.join(", ") || "Not available"}</p>
                  <p className="search-result-card__dialog-detail"><strong>Cast:</strong> {getCastSummary(movie)}</p>
                  <p className="search-result-card__dialog-detail"><strong>Director:</strong> {getDirectorSummary(movie)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
