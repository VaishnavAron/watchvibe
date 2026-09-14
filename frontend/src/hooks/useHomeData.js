import { useState } from "react";
import { getHomeCollections, getMovies, getRecentlyWatched, getUserContext, getUserProfile } from "../api";
import { getSessionUserId } from "../utils/helpers";

function safeJsonParse(val, fallback = null) {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export default function useHomeData({
  getCurrentUser,
  clearRequestError,
  setFriendlyRequestError,
  setProfile,
  setUserContext,
  setRecentlyWatchedMovies
}) {
  const [collections, setCollections] = useState(null);
  const [allMovies, setAllMovies] = useState([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [movieCache, setMovieCache] = useState({});
  const [isBecauseRowLoading, setIsBecauseRowLoading] = useState(false);

  function buildProfileState(profileData, sessionUser = getCurrentUser()) {
    if (!profileData) return profileData;
    return {
      ...profileData,
      name: sessionUser?.name?.trim() || profileData.name,
      email: sessionUser?.email?.trim() || profileData.email
    };
  }

  function cacheMovies(nextMovies) {
    const entries = Array.isArray(nextMovies) ? nextMovies.filter(m => m?.id) : [];
    if (!entries.length) return;
    setMovieCache(prev => {
      const next = { ...prev };
      entries.forEach(m => { next[m.id] = m; });
      return next;
    });
  }

  async function refreshUserData(_userId, options = {}) {
    const { includeProfile, force = false, sessionUser = getCurrentUser() } = options;
    clearRequestError();

    // If collections already exist in memory and force reload is not requested, keep them without skeleton flash!
    if (collections && !force) {
      if (includeProfile) {
        getUserProfile().then(p => setProfile(buildProfileState(p, sessionUser))).catch(() => {});
        getUserContext().then(c => setUserContext(c)).catch(() => {});
      }
      return;
    }

    setLoadingHome(true);
    if (includeProfile) setLoadingProfile(true);

    try {
      // 1. Core catalog load: never block on user profile/context or AI calls
      const [homeResult, moviesResult] = await Promise.allSettled([
        getHomeCollections(),
        getMovies()
      ]);

      const homeData = homeResult.status === "fulfilled" ? homeResult.value : null;
      const moviesData = moviesResult.status === "fulfilled" && Array.isArray(moviesResult.value) ? moviesResult.value : [];

      if (!homeData) {
        throw homeResult.reason || new Error("Failed to load catalog collections");
      }

      setAllMovies(moviesData);

      // Handle personalizations from localStorage defensively
      let finalHomeData = { ...homeData };
      const coldStartActive = localStorage.getItem("cold-start-active") === "true";
      const lastWatchedMovie = safeJsonParse(localStorage.getItem("last-watched-movie"));

      if (coldStartActive) {
        const savedGenres = safeJsonParse(localStorage.getItem("cold-start-genres"), []);
        if (Array.isArray(savedGenres) && savedGenres.length) {
          // Asynchronously enrich cold-start row without blocking initial page render
          (async () => {
            try {
              const { askRecommendations } = await import("../api");
              const response = await askRecommendations(`recommend movies from genres: ${savedGenres.join(", ")}`);
              const movies = response.results || [];
              if (movies.length) {
                const coldRow = {
                  key: "because-you-watched",
                  title: "🔥 BECAUSE YOU CHOSE 🔥",
                  subtitle: `Movies based on your selected genres: ${savedGenres.join(", ")}`,
                  movies: movies.slice(0, 10)
                };
                setCollections(prev => prev ? { ...prev, becauseYouWatched: coldRow } : prev);
              }
            } catch (e) {
              console.warn("[HOMEDATA] Cold-start recommendation notice:", e);
            }
          })();
        }
        if (finalHomeData.recentlyWatched) finalHomeData.recentlyWatched.movies = [];
      } else if (lastWatchedMovie?.id) {
        const cacheKey = `recs-movie-${lastWatchedMovie.id}`;
        const cached = safeJsonParse(localStorage.getItem(cacheKey));
        let relatedMovies = null;

        if (cached && typeof cached.timestamp === "number" && Date.now() - cached.timestamp < 3600000) {
          relatedMovies = cached.movies;
        } else if (cached) {
          localStorage.removeItem(cacheKey);
        }

        if (relatedMovies && relatedMovies.length) {
          finalHomeData.becauseYouWatched = {
            key: "because-you-watched",
            title: `Because you watched ${lastWatchedMovie.title}`,
            subtitle: `More like ${lastWatchedMovie.title}`,
            movies: relatedMovies.slice(0, 10)
          };
        } else if (!isBecauseRowLoading) {
          finalHomeData.becauseYouWatched = {
            key: "because-you-watched",
            title: `Because you watched ${lastWatchedMovie.title}`,
            subtitle: "Finding recommendations...",
            movies: []
          };

          setIsBecauseRowLoading(true);
          (async () => {
            try {
              const { askRecommendations } = await import("../api");
              const response = await askRecommendations(`movies like ${lastWatchedMovie.title}`);
              const freshMovies = response.results || [];
              if (freshMovies.length) {
                localStorage.setItem(cacheKey, JSON.stringify({
                  movies: freshMovies,
                  timestamp: Date.now()
                }));
                const newRow = {
                  key: "because-you-watched",
                  title: `Because you watched ${lastWatchedMovie.title}`,
                  subtitle: `More like ${lastWatchedMovie.title}`,
                  movies: freshMovies.slice(0, 10)
                };
                setCollections(prev => prev ? { ...prev, becauseYouWatched: newRow } : prev);
              } else {
                setCollections(prev => prev ? ({
                  ...prev,
                  becauseYouWatched: { ...prev.becauseYouWatched, subtitle: "No similar movies found", movies: [] }
                }) : prev);
              }
            } catch (e) {
              console.warn("[HOMEDATA] Recommendation fetch notice:", e);
            } finally {
              setIsBecauseRowLoading(false);
            }
          })();
        }
      }

      // Immediately set catalog collections so page unblocks in < 250ms!
      setCollections(finalHomeData);
      setLoadingHome(false);

      // 2. Fetch profile, context, and watch history in background (resilient to guest sessions)
      if (includeProfile) {
        const [profileRes, contextRes] = await Promise.allSettled([
          getUserProfile(),
          getUserContext()
        ]);

        if (profileRes.status === "fulfilled" && profileRes.value) {
          setProfile(buildProfileState(profileRes.value, sessionUser));
        }
        if (contextRes.status === "fulfilled" && contextRes.value) {
          setUserContext(contextRes.value);
        }

        const sessionUserId = getSessionUserId(sessionUser);
        if (sessionUserId) {
          try {
            const recentPayload = await getRecentlyWatched(sessionUserId);
            const recentItems = Array.isArray(recentPayload?.items) ? recentPayload.items : [];
            setRecentlyWatchedMovies(recentItems);
          } catch {
            setRecentlyWatchedMovies([]);
          }
        }
      }
    } catch (err) {
      console.error("[HOMEDATA] Error refreshing catalog:", err);
      setFriendlyRequestError(err, () => refreshUserData(undefined, options));
    } finally {
      setLoadingHome(false);
      if (includeProfile) setLoadingProfile(false);
    }
  }

  return {
    collections,
    allMovies,
    loadingHome,
    loadingProfile,
    movieCache,
    setCollections,
    refreshUserData,
    cacheMovies,
    buildProfileState,
    isBecauseRowLoading,
  };
}