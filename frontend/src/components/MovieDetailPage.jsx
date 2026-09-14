export default function MovieDetailPage({ movie, onRelatedGenreSelect }) {
  if (!movie) {
    return (
      <section className="movie-detail-page">
        <div className="surface surface--empty">
          <p className="empty-title">Movie not found.</p>
          <p className="section-copy section-copy--compact">The selected movie could not be loaded from the current catalog.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="movie-detail-page">
      <div className="movie-detail-hero" style={{ "--movie-accent": movie.accent }}>
        <div className="movie-detail-hero__poster">
          <img src={movie.posterUrl} alt={`${movie.title} poster`} />
        </div>
        <div className="movie-detail-hero__content">
          <p className="section-kicker">Movie Detail</p>
          <h1>{movie.title}</h1>
          <div className="movie-detail-hero__meta">
            {movie.year && <span>{movie.year}</span>}
            {movie.duration && <span>{movie.duration}m</span>}
            {movie.rating && <span>{movie.rating} IMDb</span>}
          </div>
          <p className="movie-detail-hero__overview">{movie.overview || "No overview is available for this title yet."}</p>
          <div className="chip-list">
            {(movie.genres ?? []).map((genre) => (
              <button key={`${movie.id}-${genre}`} type="button" className="chip chip--button" onClick={() => onRelatedGenreSelect(genre)}>
                {genre}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
