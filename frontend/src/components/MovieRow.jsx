import { useState, useRef } from "react";

const sessionStorageKey = "movie-intelligence-session";
const FALLBACK_POSTER = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80";

function isLoggedIn() {
  try {
    const rawSession = window.localStorage.getItem(sessionStorageKey);
    if (!rawSession) return false;
    const session = JSON.parse(rawSession);
    return Boolean(session && Object.keys(session).length > 0);
  } catch {
    return false;
  }
}

function MovieRowSkeleton() {
  return (
    <div className="row__track" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div className="movie-card movie-card--skeleton skeleton-panel" key={item}>
          <div className="movie-card__art skeleton-panel" />
          <div className="movie-card__copy">
            <span className="skeleton-block skeleton-block--kicker" />
            <span className="skeleton-block skeleton-block--title" />
            <span className="skeleton-block skeleton-block--copy" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThumbIcon({ direction = "up" }) {
  const isDown = direction === "down";
  return (
    <svg
      className={`thumb-icon thumb-icon--${direction}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={isDown ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export default function MovieRow({
  title,
  subtitle,
  movies = [],
  loading = false,
  likedMovieIds = [],
  emptyTitle = "No recommendations yet.",
  emptyCopy = "Try liking or asking for other moods.",
  onMoviePrompt,
  onLikeMovie,
  onDislikeMovie,
  onRequireLogin,
  onMovieSelect,
  onOpenDnaDrawer
}) {
  const trackRef = useRef(null);
  const [dismissedMovieIds, setDismissedMovieIds] = useState([]);
  const [localLikedMovieIds, setLocalLikedMovieIds] = useState([]);
  const [actionFeedback, setActionFeedback] = useState({});

  function scrollTrack(direction) {
    if (trackRef.current) {
      const scrollAmount = trackRef.current.clientWidth * 0.75;
      trackRef.current.scrollBy({
        left: direction * scrollAmount,
        behavior: "smooth"
      });
    }
  }

  const hasMovies = Array.isArray(movies) && movies.length > 0;
  const likedIds = new Set([...likedMovieIds, ...localLikedMovieIds].map(String));
  const visibleMovies = movies.filter((movie) => movie && !dismissedMovieIds.includes(movie.id));

  async function handleLikeClick(movie) {
    if (!isLoggedIn()) {
      onRequireLogin?.();
      return;
    }

    const isCurrentlyLiked = likedIds.has(String(movie.id));
    setActionFeedback((current) => ({ ...current, [movie.id]: isCurrentlyLiked ? "idle" : "like" }));

    try {
      await onLikeMovie?.(movie, title);
      setLocalLikedMovieIds((current) =>
        isCurrentlyLiked ? current.filter((movieId) => movieId !== movie.id) : [...current, movie.id]
      );
    } catch {
      setActionFeedback((current) => ({ ...current, [movie.id]: "error" }));
      window.setTimeout(() => {
        setActionFeedback((current) => ({ ...current, [movie.id]: undefined }));
      }, 700);
      return;
    }

    window.setTimeout(() => {
      setActionFeedback((current) => ({ ...current, [movie.id]: undefined }));
    }, 900);
  }

  async function handleDislikeClick(movie) {
    if (!isLoggedIn()) {
      onRequireLogin?.();
      return;
    }

    setActionFeedback((current) => ({ ...current, [movie.id]: "dislike" }));

    try {
      await onDislikeMovie?.(movie, title);
      setLocalLikedMovieIds((current) => current.filter((movieId) => movieId !== movie.id));
    } catch {
      setActionFeedback((current) => ({ ...current, [movie.id]: "error" }));
      window.setTimeout(() => {
        setActionFeedback((current) => ({ ...current, [movie.id]: undefined }));
      }, 700);
      return;
    }

    window.setTimeout(() => {
      setDismissedMovieIds((current) => [...current, movie.id]);
    }, 420);
  }

  return (
    <section className="row">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Catalog Rail</p>
          <h2>{title}</h2>
        </div>
        {subtitle && <p className="section-copy section-copy--compact">{subtitle}</p>}
      </div>

      {loading && <MovieRowSkeleton />}

      {!loading && hasMovies && visibleMovies.length > 0 && (
        <div className="row__track-wrapper">
          <button
            type="button"
            className="row__carousel-btn row__carousel-btn--left"
            onClick={() => scrollTrack(-1)}
            aria-label="Scroll left"
          >
            ‹
          </button>
          <div className="row__track" ref={trackRef}>
            {visibleMovies.map((movie, index) => {
              const matchScore = Math.min(99, Math.round((movie.rating || 9.4) * 10));
              return (
                <article
                  className={`movie-card movie-card--entry${actionFeedback[movie.id] ? ` movie-card--${actionFeedback[movie.id]}` : ""}`}
                  key={movie.id}
                  style={{ "--movie-accent": movie.accent }}
                >
                  <span className="movie-card__rank">{String(index + 1).padStart(2, "0")}</span>
                  
                  {/* Green circular match badge */}
                  <span className="movie-card__match-circle" title="Match Alignment">
                    {matchScore}%
                  </span>

                  <button 
                    type="button" 
                    className="movie-card__art movie-card__art-button" 
                    onClick={() => onMovieSelect?.(movie.id, movie)} 
                    aria-label={`Open ${movie.title}`}
                  >
                    <img 
                      src={movie.posterUrl || FALLBACK_POSTER} 
                      alt={`${movie.title} poster`} 
                      loading="lazy" 
                      onError={(e) => {
                        if (e.currentTarget.src !== FALLBACK_POSTER) {
                          e.currentTarget.src = FALLBACK_POSTER;
                        }
                      }}
                    />
                  </button>

                  <div className="movie-card__overlay">
                    <button type="button" className="movie-card__title-button" onClick={() => onMovieSelect?.(movie.id, movie)}>
                      {movie.title}
                    </button>
                    <div className="movie-card__meta">
                      <span>{movie.genres?.slice(0, 1).join(" / ") || "Film"}</span>
                      <span>{movie.rating} IMDb</span>
                    </div>
                    <div className="movie-card__actions" aria-label={`${movie.title} actions`}>
                      {/* Glowing Lightning Bolt DNA Button */}
                      <button
                        className="movie-card__dna-bolt-btn"
                        type="button"
                        title="Inspect Knowledge Graph & Vector DNA"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDnaDrawer?.(movie);
                        }}
                        aria-label="Inspect AI DNA"
                      >
                        ⚡
                      </button>

                      <button
                        className={likedIds.has(String(movie.id)) || actionFeedback[movie.id] === "like" ? "movie-card__icon-button movie-card__icon-button--liked" : "movie-card__icon-button"}
                        type="button"
                        aria-label={`I like ${movie.title}`}
                        aria-pressed={likedIds.has(String(movie.id))}
                        title="Like"
                        onClick={() => handleLikeClick(movie)}
                      >
                        <ThumbIcon direction="up" />
                      </button>
                      <button
                        className={actionFeedback[movie.id] === "dislike" ? "movie-card__icon-button movie-card__icon-button--active" : "movie-card__icon-button"}
                        type="button"
                        aria-label={`I do not like ${movie.title}`}
                        title="Not for me"
                        onClick={() => handleDislikeClick(movie)}
                      >
                        <ThumbIcon direction="down" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <button
            type="button"
            className="row__carousel-btn row__carousel-btn--right"
            onClick={() => scrollTrack(1)}
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      )}

      {!loading && (!hasMovies || visibleMovies.length === 0) && (
        <div className="row__empty surface surface--empty">
          <div className="empty-illustration" aria-hidden="true">
            <span className="empty-illustration__circle" />
            <span className="empty-illustration__line" />
          </div>
          <div>
            <h3>{emptyTitle}</h3>
            <p>{emptyCopy}</p>
          </div>
        </div>
      )}
    </section>
  );
}
