import { useState } from "react";
import { getRecentlyWatched, recordRecentlyWatched } from "../api";
import { getMovieId, getSessionUserId } from "../utils/helpers";

export default function useRecentlyWatched(getCurrentUser) {
  const [recentlyWatchedMovies, setRecentlyWatchedMovies] = useState([]);
  const [localDislikedMovieIds, setLocalDislikedMovieIds] = useState([]);

  function applyRecentlyWatchedItems(items) {
    setRecentlyWatchedMovies(Array.isArray(items) ? items : []);
  }

  async function saveRecentlyWatched(movie) {
    const movieId = getMovieId(movie);
    const userId = getSessionUserId(getCurrentUser());

    if (!userId || !movieId) {
      return;
    }

    // Store last watched movie in localStorage
    localStorage.setItem('last-watched-movie', JSON.stringify(movie));

    // Optimistic update (frontend only)
    setRecentlyWatchedMovies((prev) => {
      if (prev.some((m) => getMovieId(m) === movieId)) return prev;
      return [movie, ...prev];
    });

    // Attempt to sync with backend, but handle 404 gracefully
    try {
      const payload = await recordRecentlyWatched({
        userId,
        movieId,
        timestamp: new Date().toISOString(),
      });
      applyRecentlyWatchedItems(payload?.items);
    } catch (error) {
      // Check if the error is a 404 (backend route missing)
      const isBackendMissing = error?.status === 404 || error?.message?.includes("404");
      if (isBackendMissing) {
        // Do not revert the optimistic update. Show a silent toast or do nothing.
        console.warn("Backend save endpoint (POST /api/user/recently-watched) is missing. Keeping frontend update only.");
        return;
      }
      
      // For other errors (network, server issues), revert the optimistic update
      setRecentlyWatchedMovies((prev) =>
        prev.filter((m) => getMovieId(m) !== movieId)
      );
      console.error("Failed to save recently watched movie", error);
    }
  }

  async function refreshRecentlyWatchedFromBackend(session = getCurrentUser()) {
    const userId = getSessionUserId(session);
    if (!userId) {
      setRecentlyWatchedMovies([]);
      return;
    }
    try {
      const payload = await getRecentlyWatched(userId);
      applyRecentlyWatchedItems(payload?.items);
    } catch (error) {
      // Silently fail if the GET endpoint is also missing
      console.warn("Could not fetch recently watched items from backend", error);
      setRecentlyWatchedMovies([]);
    }
  }

  function filterBlockedMovies(movies = []) {
    return movies.filter((movie) => {
      const movieId = getMovieId(movie);
      return movieId && !localDislikedMovieIds.includes(String(movieId));
    });
  }

  return {
    recentlyWatchedMovies,
    setRecentlyWatchedMovies,
    localDislikedMovieIds,
    setLocalDislikedMovieIds,
    applyRecentlyWatchedItems,
    saveRecentlyWatched,
    refreshRecentlyWatchedFromBackend,
    filterBlockedMovies,
  };
}