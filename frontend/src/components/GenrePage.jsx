import { useEffect, useState } from "react";

import { getMoviesByGenre } from "../api";

const pageSize = 20;

export default function GenrePage({ genreName, onMovieSelect }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadFirstPage() {
      setLoading(true);
      setError(null);

      try {
        const payload = await getMoviesByGenre(genreName, 1, pageSize);

        if (!isActive) {
          return;
        }

        setMovies(Array.isArray(payload?.movies) ? payload.movies : []);
        setCurrentPage(Number(payload?.currentPage) || 1);
        setTotalPages(Number(payload?.totalPages) || 1);
        setTotalCount(Number(payload?.totalCount) || 0);
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        setError(requestError);
        setMovies([]);
        setCurrentPage(0);
        setTotalPages(0);
        setTotalCount(0);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadFirstPage();
    window.scrollTo({ top: 0, behavior: "smooth" });

    return () => {
      isActive = false;
    };
  }, [genreName]);

  async function handleLoadMore() {
    if (loadingMore || currentPage >= totalPages) {
      return;
    }

    const nextPage = currentPage + 1;
    setLoadingMore(true);

    try {
      const payload = await getMoviesByGenre(genreName, nextPage, pageSize);
      const nextMovies = Array.isArray(payload?.movies) ? payload.movies : [];

      setMovies((currentMovies) => [...currentMovies, ...nextMovies]);
      setCurrentPage(Number(payload?.currentPage) || nextPage);
      setTotalPages(Number(payload?.totalPages) || totalPages);
      setTotalCount(Number(payload?.totalCount) || totalCount);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoadingMore(false);
    }
  }

  const normalizedGenreName = genreName?.trim() || "Genre";
  const hasMovies = movies.length > 0;
  const canLoadMore = currentPage > 0 && currentPage < totalPages;

  return (
    <section className="genre-page">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Categories</p>
          <h2>{normalizedGenreName} Movies</h2>
        </div>
        <p className="section-copy section-copy--compact">
          {totalCount > 0 ? `${totalCount} titles available in ${normalizedGenreName}.` : `Curated ${normalizedGenreName} picks, streamed in the same cinematic style.`}
        </p>
      </div>

      {loading && <div className="surface">Loading {normalizedGenreName} movies...</div>}

      {!loading && error && (
        <div className="surface surface--error">
          <strong>Could not load {normalizedGenreName} movies.</strong>
          <p>{error.message}</p>
        </div>
      )}

      {!loading && !error && !hasMovies && (
        <div className="surface surface--empty">
          <p className="empty-title">No movies found.</p>
          <p className="section-copy section-copy--compact">Try another category from the top bar.</p>
        </div>
      )}

      {!loading && hasMovies && (
        <>
          <div className="genre-grid">
            {movies.map((movie) => (
              <article className="genre-card" key={movie.id} style={{ "--movie-accent": movie.accent }}>
                <button type="button" className="genre-card__poster" onClick={() => onMovieSelect(movie.id, movie)}>
                  <img src={movie.posterUrl} alt={`${movie.title} poster`} />
                </button>
                <div className="genre-card__body">
                  <button type="button" className="genre-card__title" onClick={() => onMovieSelect(movie.id, movie)}>
                    {movie.title}
                  </button>
                  <div className="genre-card__meta">
                    <span>{movie.rating} IMDb</span>
                    {movie.year && <span>{movie.year}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {canLoadMore && (
            <div className="genre-page__actions">
              <button type="button" className="inline-button genre-page__load-more" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
