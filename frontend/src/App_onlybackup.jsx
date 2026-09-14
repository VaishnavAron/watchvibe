import { useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  askRecommendations,
  createUserSession,
  getHomeCollections,
  getMoviesByGenre,
  getMovies,
  getSearchSuggestions,
  getRecentlyWatched,
  getUserContext,
  getUserProfile,
  loginUser,
  recordRecentlyWatched,
  registerUser,
  searchMovies,
  trackInteraction,
  updateMovieReaction
} from "./api";
import Footer from "./components/Footer";
import GenrePage from "./components/GenrePage";
import HeroBanner from "./components/HeroBanner";
import LandingPage from "./components/LandingPage";
import MovieRow from "./components/MovieRow";
import MovieDetailPage from "./components/MovieDetailPage";
import PreferencePanel from "./components/PreferencePanel";
import RecommendationPanel from "./components/RecommendationPanel";
import SearchResultsPage from "./components/SearchResultsPage";

const starterPrompts = [
  "funny sci-fi movies",
  "action movies after 2020 rating above 7",
  "movies like Inception but less violent based on my preference",
  "recommend and explain why",
  "movies connected to Interstellar via actors"
];

const coldStartGenres = ["Action", "Comedy", "Drama", "Sci-Fi", "Thriller", "Romance", "Adventure", "Animation"];
const coldStartThemes = ["Mind-bending", "Feel-good", "Dark", "Inspiring", "Family", "Fast-paced", "Emotional", "Mystery"];
const genderOptions = ["male", "female", "Others"];
const categoryGenres = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Romance", "Thriller", "Animation", "Documentary"];

const sessionStorageKey = "movie-intelligence-session";
const guestQueryStorageKey = "movie-intelligence-guest-queries";
const recentSearchesStorageKey = "movie-intelligence-recent-searches";
const guestQueryLimit = 5;
const defaultRateLimitCountdown = 30;

function readCurrentRoute() {
  return {
    pathname: window.location.pathname,
    search: window.location.search
  };
}

function resolveViewFromPath(pathname) {
  if (pathname === "/") {
    return "landing";
  }

  if (pathname === "/discover") {
    return "discover";
  }

  if (pathname === "/search") {
    return "search";
  }

  if (pathname === "/profile") {
    return "profile";
  }

  if (pathname === "/login") {
    return "login";
  }

  if (pathname === "/register") {
    return "register";
  }

  if (pathname.startsWith("/genre/")) {
    return "genre";
  }

  if (pathname.startsWith("/movie/")) {
    return "movie";
  }

  return "discover";
}

function decodeRouteSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeSearchSuggestions(payload) {
  const rawSuggestions = Array.isArray(payload)
    ? payload
    : payload?.suggestions ?? payload?.results ?? payload?.items ?? payload?.data ?? [];

  if (!Array.isArray(rawSuggestions)) {
    return [];
  }

  return rawSuggestions
    .map((entry, index) => {
      if (typeof entry === "string") {
        return {
          id: `${entry}-${index}`,
          label: entry,
          value: entry
        };
      }

      const label = entry?.title || entry?.name || entry?.label || entry?.query || entry?.value || "";

      return label
        ? {
            id: entry?.id ?? `${label}-${index}`,
            label,
            value: label
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function getSessionUserId(session) {
  return session?.userId ?? session?.id ?? session?._id ?? session?.user?.id ?? session?.user?.userId ?? "";
}

function getMovieId(value) {
  return value?.movieId ?? value?.id ?? value?._id ?? value;
}

function getProfileGenres(profile) {
  const sources = [profile?.favoriteGenres, profile?.preferredGenres, profile?.genres];
  return sources.find((items) => Array.isArray(items) && items.length)?.filter(Boolean) ?? [];
}

function normalizeSessionUser(session) {
  if (!session) {
    return null;
  }

  const normalizedName =
    (typeof session.name === "string" && session.name.trim()) ||
    (typeof session.user?.name === "string" && session.user.name.trim()) ||
    "";
  const normalizedEmail =
    (typeof session.email === "string" && session.email.trim()) ||
    (typeof session.user?.email === "string" && session.user.email.trim()) ||
    "";

  return {
    ...session,
    name: normalizedName,
    email: normalizedEmail,
    userId: getSessionUserId(session)
  };
}

function readStoredJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeRecentSearches(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function mergeUniqueLabels(entries) {
  const seen = new Set();

  return entries.filter((entry) => {
    const normalized = entry.label.toLowerCase();

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateLoginForm(form) {
  const errors = {};

  if (!form.email.trim()) {
    errors.email = "Enter your email address.";
  } else if (!validateEmail(form.email.trim().toLowerCase())) {
    errors.email = "Use a valid email format.";
  }

  if (!form.password.trim()) {
    errors.password = "Enter your password.";
  } else if (form.password.trim().length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  return errors;
}

function validateRegisterForm(form) {
  const errors = {};
  const trimmedName = form.name.trim();
  const normalizedEmail = form.email.trim().toLowerCase();
  const password = form.password.trim();
  const confirmPassword = form.confirmPassword.trim();
  const age = Number(form.age);

  if (!trimmedName) {
    errors.name = "Enter your full name.";
  }

  if (!normalizedEmail) {
    errors.email = "Enter your email address.";
  } else if (!validateEmail(normalizedEmail)) {
    errors.email = "Use a valid email format.";
  }

  if (!password) {
    errors.password = "Create a password.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Confirm your password.";
  } else if (confirmPassword !== password) {
    errors.confirmPassword = "Password and confirm password must match.";
  }

  if (!form.age) {
    errors.age = "Enter your age.";
  } else if (Number.isNaN(age) || age < 13 || age > 100) {
    errors.age = "Age must be between 13 and 100.";
  }

  if (!form.gender) {
    errors.gender = "Select a gender option.";
  }

  return errors;
}

function getFriendlyApiMessage(error) {
  if (error instanceof ApiError) {
    return error.payload?.message || error.payload?.error || error.message || "The server could not complete this request.";
  }

  if (error instanceof TypeError) {
    return "Can't reach the server right now. Please check the backend or tunnel and try again.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

function HeroBannerSkeleton() {
  return (
    <section className="hero hero--skeleton" aria-hidden="true">
      <div className="hero-skeleton__content">
        <span className="skeleton-block skeleton-block--kicker" />
        <span className="skeleton-block skeleton-block--title" />
        <span className="skeleton-block skeleton-block--title skeleton-block--title-short" />
        <span className="skeleton-block skeleton-block--copy" />
        <span className="skeleton-block skeleton-block--copy skeleton-block--copy-short" />
        <div className="hero-skeleton__meta">
          <span className="skeleton-pill" />
          <span className="skeleton-pill" />
          <span className="skeleton-pill skeleton-pill--wide" />
        </div>
        <div className="hero-skeleton__callout">
          <span className="skeleton-block skeleton-block--copy" />
          <span className="skeleton-block skeleton-block--copy skeleton-block--copy-short" />
        </div>
      </div>
      <div className="hero-skeleton__poster">
        <div className="hero-skeleton__poster-frame skeleton-panel" />
        <div className="hero-skeleton__thumbs">
          {[0, 1, 2].map((item) => (
            <span className="skeleton-panel" key={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CatalogSkeleton() {
  return (
    <div className="catalog-shell" aria-hidden="true">
      {["Because You Watched", "Top Rated", "Explore"].map((title) => (
        <MovieRow key={title} title={title} subtitle="Loading curated titles..." loading />
      ))}
    </div>
  );
}

function ToastTray({ toasts, onDismiss }) {
  return (
    <div className="toast-tray" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast--${toast.type}`}>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button type="button" className="toast__dismiss" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            ×
          </button>
        </article>
      ))}
    </div>
  );
}

function FormFieldError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="form-field__error">{message}</p>;
}

export default function App() {
  const [collections, setCollections] = useState(null);
  const [allMovies, setAllMovies] = useState([]);
  const [profile, setProfile] = useState(null);
  const [userContext, setUserContext] = useState(null);
  const [query, setQuery] = useState("movies like Inception but less violent based on my preference");
  const [results, setResults] = useState(null);
  const [followUpRow, setFollowUpRow] = useState(null);
  const [explainedRowsCache, setExplainedRowsCache] = useState({});
  const [explainedRowsLoading, setExplainedRowsLoading] = useState({});
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingHome, setLoadingHome] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [route, setRoute] = useState(readCurrentRoute);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [loadingSearchSuggestions, setLoadingSearchSuggestions] = useState(false);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [recentlyWatchedMovies, setRecentlyWatchedMovies] = useState([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginForm, setLoginForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [loginTouched, setLoginTouched] = useState({});
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    age: "",
    gender: ""
  });
  const [registerTouched, setRegisterTouched] = useState({});
  const [registerError, setRegisterError] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [showColdStart, setShowColdStart] = useState(false);
  const [coldStartSelections, setColdStartSelections] = useState({
    genres: [],
    themes: []
  });
  const [coldStartLoading, setColdStartLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [guestQueryCount, setGuestQueryCount] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [movieCache, setMovieCache] = useState({});
  const [localDislikedMovieIds, setLocalDislikedMovieIds] = useState([]);
  const [preferenceMovies, setPreferenceMovies] = useState([]);

  const recommendationRef = useRef(null);
  const searchPanelRef = useRef(null);
  const topbarSearchRef = useRef(null);

  const activeView = useMemo(() => resolveViewFromPath(route.pathname), [route.pathname]);
  const routeSearchParams = useMemo(() => new URLSearchParams(route.search), [route.search]);
  const selectedGenreName = useMemo(() => {
    if (activeView !== "genre") {
      return "";
    }

    return decodeRouteSegment(route.pathname.replace("/genre/", ""));
  }, [activeView, route.pathname]);
  const selectedMovieId = useMemo(() => {
    if (activeView !== "movie") {
      return "";
    }

    return decodeRouteSegment(route.pathname.replace("/movie/", ""));
  }, [activeView, route.pathname]);
  const routedSearchQuery = useMemo(() => routeSearchParams.get("q")?.trim() ?? "", [routeSearchParams]);
  const loginValidationErrors = useMemo(() => validateLoginForm(loginForm), [loginForm]);
  const registerValidationErrors = useMemo(() => validateRegisterForm(registerForm), [registerForm]);
  const isLoginValid = Object.keys(loginValidationErrors).length === 0;
  const isRegisterValid = Object.keys(registerValidationErrors).length === 0;
  const guestQueriesRemaining = Math.max(0, guestQueryLimit - guestQueryCount);
  const guestLimitReached = !currentUser && guestQueryCount >= guestQueryLimit;
  const showGuestWarning = !currentUser && guestQueryCount === guestQueryLimit - 1;

  function navigateTo(path, options = {}) {
    const { replace = false, scroll = true } = options;
    const currentPath = `${window.location.pathname}${window.location.search}`;

    if (path !== currentPath) {
      const updateHistory = replace ? window.history.replaceState : window.history.pushState;
      updateHistory.call(window.history, null, "", path);
    }

    setRoute(readCurrentRoute());
    setCategoryMenuOpen(false);
    setUserMenuOpen(false);

    if (scroll) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBackNavigation() {
    setCategoryMenuOpen(false);
    setUserMenuOpen(false);

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    navigateTo("/discover", { replace: true });
  }

  function cacheMovies(nextMovies) {
    const entries = Array.isArray(nextMovies) ? nextMovies.filter((movie) => movie?.id) : [];

    if (!entries.length) {
      return;
    }

    setMovieCache((current) => {
      const nextCache = { ...current };

      entries.forEach((movie) => {
        nextCache[movie.id] = movie;
      });

      return nextCache;
    });
  }

  function applyRecentlyWatchedItems(items) {
    const nextItems = Array.isArray(items) ? items : [];
    setRecentlyWatchedMovies(nextItems);
    setCollections((currentCollections) =>
      currentCollections?.recentlyWatched
        ? {
            ...currentCollections,
            recentlyWatched: {
              ...currentCollections.recentlyWatched,
              movies: nextItems
            }
          }
        : currentCollections
    );
  }

  async function saveRecentlyWatched(movieId) {
    const userId = getSessionUserId(currentUser);

    if (!userId || !movieId || dislikedMovieIdSet.has(String(movieId))) {
      return;
    }

    try {
      const payload = await recordRecentlyWatched({
        userId,
        movieId,
        timestamp: new Date().toISOString()
      });

      applyRecentlyWatchedItems(payload?.items);
    } catch (error) {
      console.error("Failed to save recently watched movie", error);
    }
  }

  function handleMovieSelect(movieId, movie) {
    if (movie) {
      cacheMovies([movie]);
    }

    navigateTo(`/movie/${encodeURIComponent(movieId)}`);
  }

  function handleGenreSelect(genre) {
    navigateTo(`/genre/${encodeURIComponent(genre)}`);
  }

  function scrollToRecommendations() {
    requestAnimationFrame(() => {
      recommendationRef.current?.scrollIntoView({ block: "start" });
    });
  }

  function pushToast(type, title, message) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current, { id, type, title, message }]);
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function buildProfileState(profileData, sessionUser = currentUser) {
    if (!profileData) {
      return profileData;
    }

    return {
      ...profileData,
      name: sessionUser?.name?.trim() || profileData.name,
      email: sessionUser?.email?.trim() || profileData.email
    };
  }

  function persistRecentSearch(nextQuery) {
    const trimmedQuery = nextQuery.trim();

    if (!trimmedQuery) {
      return;
    }

    setRecentSearches((current) => {
      const nextSearches = sanitizeRecentSearches([trimmedQuery, ...current.filter((item) => item.toLowerCase() !== trimmedQuery.toLowerCase())]);
      window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(nextSearches));
      return nextSearches;
    });
  }

  function markLoginTouched(name) {
    setLoginTouched((current) => ({ ...current, [name]: true }));
  }

  function markRegisterTouched(name) {
    setRegisterTouched((current) => ({ ...current, [name]: true }));
  }

  function setFriendlyRequestError(error, retryAction) {
    if (error instanceof ApiError && error.status === 429) {
      const retryAfter = Number(error.payload?.retryAfter ?? error.payload?.retry_after ?? defaultRateLimitCountdown);
      setRateLimitCountdown(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : defaultRateLimitCountdown);
      setRequestError({
        message: "Too many requests for a moment. Please wait a little and try again.",
        retryAction
      });
      return;
    }

    setRateLimitCountdown(0);
    setRequestError({
      message: "Something went wrong. Try again.",
      details: error?.message,
      retryAction
    });
  }

  function clearRequestError() {
    setRequestError(null);
    setRateLimitCountdown(0);
  }

  function handleGuestLimitReached() {
    setRequestError({
      message: "Free guest searches are used up. Login for unlimited recommendations."
    });
    pushToast("info", "Guest limit reached", "Login to continue with unlimited searches and personalization.");
  }

  async function refreshUserData(_userId, options = {}) {
    const { includeProfile, sessionUser = currentUser } = options;

    clearRequestError();
    setLoadingHome(true);
    setLoadingProfile(includeProfile);

    try {
      const homePromise = getHomeCollections();
      const moviesPromise = getMovies().catch(() => []);

      if (!includeProfile) {
        const [homeData, moviesData] = await Promise.all([homePromise, moviesPromise]);
        setCollections(homeData);
        setAllMovies(Array.isArray(moviesData) ? moviesData : []);
        return;
      }

      const [homeData, profileData, contextData, moviesData] = await Promise.all([
        homePromise,
        getUserProfile(),
        getUserContext(),
        moviesPromise
      ]);
      setCollections(homeData);
      setProfile(buildProfileState(profileData, sessionUser));
      setUserContext(contextData);
      setAllMovies(Array.isArray(moviesData) ? moviesData : []);

      const sessionUserId = getSessionUserId(sessionUser);
      if (sessionUserId) {
        try {
          const recentPayload = await getRecentlyWatched(sessionUserId);
          setRecentlyWatchedMovies(Array.isArray(recentPayload?.items) ? recentPayload.items : []);
        } catch {
          setRecentlyWatchedMovies([]);
        }
      }
    } catch (loadError) {
      setFriendlyRequestError(loadError, () => refreshUserData(undefined, options));
    } finally {
      setLoadingHome(false);
      setLoadingProfile(false);
    }
  }

  async function syncPersonalization(interaction) {
    if (!currentUser) {
      return;
    }

    try {
      const contextData = await trackInteraction({
        ...interaction
      });

      setUserContext(contextData);
    } catch (interactionError) {
      setFriendlyRequestError(interactionError, () => syncPersonalization(interaction));
    }
  }

  function openLoginPrompt() {
    setShowLoginPrompt(true);
  }

  async function refreshRecentlyWatchedFromBackend(session = currentUser) {
    const userId = getSessionUserId(session);

    if (!userId) {
      setRecentlyWatchedMovies([]);
      return;
    }

    try {
      const payload = await getRecentlyWatched(userId);
      setRecentlyWatchedMovies(Array.isArray(payload?.items) ? payload.items : []);
    } catch {
      setRecentlyWatchedMovies([]);
    }
  }

  async function handleMovieReaction(movie, action, sourceTitle) {
    const userId = getSessionUserId(currentUser);

    if (!userId) {
      openLoginPrompt();
      return;
    }

    try {
      const payload = await updateMovieReaction({
        userId,
        movieId: movie.id,
        action
      });

      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              likedMovies: Array.isArray(payload?.likedMovies) ? payload.likedMovies : currentProfile.likedMovies,
              dislikedMovies: Array.isArray(payload?.dislikedMovies) ? payload.dislikedMovies : currentProfile.dislikedMovies
            }
          : currentProfile
      );

      if (action === "dislike") {
        setLocalDislikedMovieIds((current) => (current.includes(movie.id) ? current : [...current, movie.id]));
        setRecentlyWatchedMovies((current) => current.filter((item) => String(getMovieId(item)) !== String(movie.id)));
        return;
      }

      await saveRecentlyWatched(movie.id);

      await syncPersonalization({
        userId,
        type: "movie_liked",
        movieId: movie.id,
        source: sourceTitle,
        metadata: {
          movieTitle: movie.title,
          action
        }
      });
    } catch (reactionError) {
      pushToast("info", "Action not saved", "Can't reach the server right now. Please try again.");
      throw reactionError;
    }
  }

  async function handleMovieLike(movie, sourceTitle) {
    await handleMovieReaction(movie, "like", sourceTitle);
  }

  async function handleMovieDislike(movie, sourceTitle) {
    await handleMovieReaction(movie, "dislike", sourceTitle);
  }

  async function runRecommendation(nextQuery, options = {}) {
    const trimmedQuery = nextQuery.trim();

    if (!trimmedQuery) {
      setRequestError({ message: "Enter a search before asking for recommendations." });
      return false;
    }

    if (!currentUser && guestQueryCount >= guestQueryLimit) {
      handleGuestLimitReached();
      return false;
    }

    setQuery(trimmedQuery);
    setLoadingRecommendations(true);
    clearRequestError();
    persistRecentSearch(trimmedQuery);

    if (!currentUser) {
      const nextGuestCount = guestQueryCount + 1;
      setGuestQueryCount(nextGuestCount);
      window.localStorage.setItem(guestQueryStorageKey, JSON.stringify(nextGuestCount));
    }

    if (options.scrollToRecommendations !== false) {
      scrollToRecommendations();
    }

    try {
      const payload = await askRecommendations(trimmedQuery);

      if (options.asFollowUp) {
        setFollowUpRow({
          title: options.rowTitle,
          subtitle: `Generated from ${options.movieTitle}`,
          movies: payload.results
        });
      } else {
        setResults(payload);
        setFollowUpRow(null);
      }

      return true;
    } catch (requestFailure) {
      setFriendlyRequestError(requestFailure, () => runRecommendation(trimmedQuery, options));
      return false;
    } finally {
      setLoadingRecommendations(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedQuery = query.trim();
    const wasSuccessful = await runRecommendation(trimmedQuery);

    if (!wasSuccessful) {
      return;
    }

    await syncPersonalization({ type: "search_submitted", query: trimmedQuery, source: "search-form" });
  }

  async function handleTopbarSearchSubmit(event) {
    event.preventDefault();
    const trimmedQuery = searchInput.trim();

    if (!trimmedQuery) {
      setSearchError({ message: "Enter a movie search first." });
      return;
    }

    setShowSearchSuggestions(false);
    navigateTo(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  function applySearchSuggestion(nextQuery) {
    setSearchInput(nextQuery);
    setShowSearchSuggestions(false);
    navigateTo(`/search?q=${encodeURIComponent(nextQuery)}`);
  }

  async function handlePromptSelect(prompt, interaction = {}) {
    const wasSuccessful = await runRecommendation(prompt);

    if (!wasSuccessful) {
      return;
    }

    await syncPersonalization({
      type: interaction.type ?? "prompt_selected",
      query: prompt,
      movieId: interaction.movieId,
      source: interaction.source ?? "prompt-ui",
      metadata: interaction.metadata
    });
  }

  async function handleMovieReference(prompt, movie, sourceTitle) {
    const wasSuccessful = await runRecommendation(prompt);

    if (!wasSuccessful) {
      return;
    }

    if (movie?.id) {
      await saveRecentlyWatched(movie.id);
    }

    await syncPersonalization({
      type: "movie_reference_click",
      query: prompt,
      movieId: movie.id,
      source: sourceTitle,
      metadata: {
        movieTitle: movie.title
      }
    });
  }

  async function handleRecommendationAction(actionLabel, prompt, movie) {
    if (actionLabel === "Explain Similar Picks") {
      await loadExplainedSimilarMovies(movie);
      return;
    }

    const wasSuccessful = await runRecommendation(prompt, {
      asFollowUp: true,
      rowTitle: actionLabel,
      movieTitle: movie.title,
      scrollToRecommendations: false
    });

    if (!wasSuccessful) {
      return;
    }

    await syncPersonalization({
      type: "recommendation_action",
      query: prompt,
      movieId: movie.id,
      source: actionLabel,
      metadata: {
        movieTitle: movie.title
      }
    });
  }

  async function loadExplainedSimilarMovies(movie) {
    const cacheKey = movie.id ?? movie.title;

    if (explainedRowsCache[cacheKey]?.length || explainedRowsLoading[cacheKey]) {
      return;
    }

    if (!currentUser && guestQueryCount >= guestQueryLimit) {
      handleGuestLimitReached();
      return;
    }

    setExplainedRowsLoading((current) => ({ ...current, [cacheKey]: true }));

    try {
      if (!currentUser) {
        const nextGuestCount = guestQueryCount + 1;
        setGuestQueryCount(nextGuestCount);
        window.localStorage.setItem(guestQueryStorageKey, JSON.stringify(nextGuestCount));
      }

      const payload = await askRecommendations(`recommend and explain why like ${movie.title}`);
      setExplainedRowsCache((current) => ({
        ...current,
        [cacheKey]: payload.results ?? []
      }));
    } catch (requestFailure) {
      setFriendlyRequestError(requestFailure, () => loadExplainedSimilarMovies(movie));
      setExplainedRowsCache((current) => ({
        ...current,
        [cacheKey]: []
      }));
    } finally {
      setExplainedRowsLoading((current) => ({ ...current, [cacheKey]: false }));
    }
  }

  const heroChoices = collections
    ? [
        collections.hero,
        ...(collections.becauseYouWatched?.movies ?? []),
        ...(collections.recentlyWatched?.movies ?? [])
      ]
        .filter(Boolean)
        .filter((movie, index, array) => array.findIndex((entry) => entry.id === movie.id) === index)
        .slice(0, 6)
    : [];

  const movieCatalog = [
    ...allMovies,
    ...Object.values(movieCache),
    ...searchResults,
    ...(results?.results ?? []),
    ...(followUpRow?.movies ?? []),
    ...recentlyWatchedMovies,
    ...(collections
      ? [
          collections.hero,
          ...(collections.becauseYouWatched?.movies ?? []),
          ...(collections.recentlyWatched?.movies ?? []),
          ...(collections.topRated?.movies ?? collections.topRated ?? []),
          ...(collections.explore?.movies ?? collections.explore ?? []),
          ...(collections.drama?.movies ?? collections.drama ?? [])
        ]
      : [])
  ].filter(Boolean);

  const uniqueMovieCatalog = movieCatalog.filter(
    (movie, index, array) => movie?.id && array.findIndex((entry) => entry.id === movie.id) === index
  );
  const likedMovieIds = useMemo(
    () => (Array.isArray(profile?.likedMovies) ? profile.likedMovies.map(getMovieId).filter(Boolean).map(String) : []),
    [profile]
  );
  const dislikedMovieIdSet = useMemo(() => {
    const backendIds = Array.isArray(profile?.dislikedMovies) ? profile.dislikedMovies.map(getMovieId).filter(Boolean).map(String) : [];
    return new Set([...backendIds, ...localDislikedMovieIds.map(String)]);
  }, [localDislikedMovieIds, profile]);
  const filterBlockedMovies = (movies = []) => movies.filter((movie) => movie?.id && !dislikedMovieIdSet.has(String(movie.id)));
  const selectedMovie =
    uniqueMovieCatalog.find((movie) => String(movie.id) === String(selectedMovieId) && !dislikedMovieIdSet.has(String(movie.id))) ??
    (!dislikedMovieIdSet.has(String(selectedMovieId)) ? movieCache[selectedMovieId] : null) ??
    null;
  const likedMoviesForRow = (Array.isArray(profile?.likedMovies) ? profile.likedMovies : [])
    .map((entry) => {
      const movieId = getMovieId(entry);
      return entry?.posterUrl ? { ...entry, id: movieId } : uniqueMovieCatalog.find((movie) => String(movie.id) === String(movieId)) ?? movieCache[movieId];
    })
    .filter(Boolean)
    .filter((movie, index, array) => array.findIndex((entry) => String(entry.id) === String(movie.id)) === index);

  const discoverRows = collections
    ? [
        collections.becauseYouWatched && {
          key: "because-you-watched",
          title: collections.becauseYouWatched.title,
          subtitle: collections.becauseYouWatched.subtitle,
          movies: filterBlockedMovies(collections.becauseYouWatched.movies)
        },
        collections.recentlyWatched && {
          key: "recently-watched",
          title: collections.recentlyWatched.title,
          subtitle: collections.recentlyWatched.subtitle,
          movies: filterBlockedMovies(collections.recentlyWatched.movies)
        },
        {
          key: "top-rated",
          title: collections.topRated?.title ?? "Top Rated",
          subtitle: collections.topRated?.subtitle ?? "Highest-rated picks presented in a stronger discovery rail.",
          movies:
            collections.topRated?.movies ??
            collections.topRated ??
            [...uniqueMovieCatalog].sort((left, right) => right.rating - left.rating || right.popularity - left.popularity).slice(0, 6)
        },
        {
          key: "explore",
          title: collections.explore?.title ?? "Explore",
          subtitle: collections.explore?.subtitle ?? "A broader blend of titles to keep discovery feeling rich and fresh.",
          movies:
            collections.explore?.movies ??
            collections.explore ??
            [...uniqueMovieCatalog]
              .sort((left, right) => right.popularity + right.rating - (left.popularity + left.rating))
              .slice(0, 8)
        },
        {
          key: "drama",
          title: collections.drama?.title ?? "Drama",
          subtitle: collections.drama?.subtitle ?? "Emotion-forward films arranged into a cleaner cinematic rail.",
          movies:
            collections.drama?.movies ??
            collections.drama ??
            uniqueMovieCatalog
              .filter((movie) => movie.genres?.includes("Drama"))
              .sort((left, right) => right.rating - left.rating || right.popularity - left.popularity)
              .slice(0, 6)
        }
      ].filter(Boolean)
    : [];

  useEffect(() => {
    const savedSession = window.localStorage.getItem(sessionStorageKey);

    if (savedSession) {
      try {
        setCurrentUser(normalizeSessionUser(JSON.parse(savedSession)));
      } catch {
        window.localStorage.removeItem(sessionStorageKey);
      }
    }

    setGuestQueryCount(readStoredJson(guestQueryStorageKey, 0));
    setRecentSearches(sanitizeRecentSearches(readStoredJson(recentSearchesStorageKey, [])));
  }, []);

  useEffect(() => {
    function handlePopState() {
      setRoute(readCurrentRoute());
      setCategoryMenuOpen(false);
      setUserMenuOpen(false);
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setProfile(null);
      setUserContext(null);
      setRecentlyWatchedMovies([]);

      if (activeView === "profile") {
        navigateTo("/login", { replace: true, scroll: false });
      }

      refreshUserData(undefined, { includeProfile: false });
      return;
    }

    setGuestQueryCount(0);
    window.localStorage.setItem(guestQueryStorageKey, JSON.stringify(0));
    refreshUserData(undefined, { includeProfile: true });
  }, [activeView, currentUser]);

  useEffect(() => {
    if (activeView !== "search") {
      return undefined;
    }

    if (!routedSearchQuery) {
      setSearchInput("");
      setSearchResults([]);
      setSearchError(null);
      setLoadingSearch(false);
      return undefined;
    }

    let isActive = true;

    setSearchInput(routedSearchQuery);
    setLoadingSearch(true);
    setSearchError(null);

    searchMovies(routedSearchQuery)
      .then((payload) => {
        if (!isActive) {
          return;
        }

        const nextResults = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
        setSearchResults(nextResults);
        cacheMovies(nextResults);
        persistRecentSearch(routedSearchQuery);
      })
      .catch((searchRequestError) => {
        if (!isActive) {
          return;
        }

        setSearchResults([]);
        setSearchError({
          message: "Movie search failed.",
          details: searchRequestError.message
        });
      })
      .finally(() => {
        if (isActive) {
          setLoadingSearch(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeView, routedSearchQuery]);

  useEffect(() => {
    const trimmedQuery = searchInput.trim();

    if (trimmedQuery.length < 2) {
      setSearchSuggestions([]);
      setLoadingSearchSuggestions(false);
      return undefined;
    }

    let isActive = true;
    const debounceTimer = window.setTimeout(async () => {
      setLoadingSearchSuggestions(true);

      try {
        const payload = await getSearchSuggestions(trimmedQuery);

        if (!isActive) {
          return;
        }

        setSearchSuggestions(normalizeSearchSuggestions(payload));
      } catch {
        if (isActive) {
          setSearchSuggestions([]);
        }
      } finally {
        if (isActive) {
          setLoadingSearchSuggestions(false);
        }
      }
    }, 300);

    return () => {
      isActive = false;
      window.clearTimeout(debounceTimer);
    };
  }, [searchInput]);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!topbarSearchRef.current?.contains(event.target)) {
        setShowSearchSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);

    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  useEffect(() => {
    if (rateLimitCountdown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRateLimitCountdown((current) => (current > 1 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rateLimitCountdown]);

  useEffect(() => {
    if (!toasts.length) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      dismissToast(toasts[0].id);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 300);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleLoginChange(event) {
    const { name, value } = event.target;
    setLoginForm((currentForm) => ({ ...currentForm, [name]: value }));
    setLoginError("");
  }

  function handleRegisterChange(event) {
    const { name, value } = event.target;
    setRegisterForm((currentForm) => ({ ...currentForm, [name]: value }));
    setRegisterError("");
  }

  function toggleColdStartSelection(group, value) {
    setColdStartSelections((currentSelections) => {
      const currentGroup = currentSelections[group];
      const nextGroup = currentGroup.includes(value) ? currentGroup.filter((entry) => entry !== value) : [...currentGroup, value];

      return {
        ...currentSelections,
        [group]: nextGroup
      };
    });
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setLoginTouched({
      email: true,
      password: true
    });

    if (!isLoginValid) {
      setLoginError("Fix the highlighted fields to continue.");
      return;
    }

    const normalizedEmail = loginForm.email.trim().toLowerCase();
    const trimmedPassword = loginForm.password.trim();

    try {
      setLoginLoading(true);
      await loginUser({
        email: normalizedEmail,
        password: trimmedPassword
      });

      const sessionData = await createUserSession();
      const normalizedSession = normalizeSessionUser(sessionData.session);
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(normalizedSession));
      setCurrentUser(normalizedSession);
      setProfile(null);
      setUserContext(null);
      setShowLoginPrompt(false);
      setLoginForm((currentForm) => ({ ...currentForm, password: "" }));
      setLoginError("");
      navigateTo("/profile");
      await refreshUserData(getSessionUserId(normalizedSession), {
        includeProfile: true,
        sessionUser: normalizedSession
      });
      await refreshRecentlyWatchedFromBackend(normalizedSession);
      pushToast("success", "Welcome back", "Your personalized profile is ready.");
    } catch (sessionError) {
      const message = getFriendlyApiMessage(sessionError);
      setLoginError(message);
      pushToast("info", "Login unavailable", message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    setRegisterTouched({
      name: true,
      email: true,
      password: true,
      confirmPassword: true,
      age: true,
      gender: true
    });

    if (!isRegisterValid) {
      setRegisterError("Fix the highlighted fields to continue.");
      return;
    }

    const trimmedName = registerForm.name.trim();
    const normalizedEmail = registerForm.email.trim().toLowerCase();
    const trimmedPassword = registerForm.password.trim();

    const nextSession = {
      name: trimmedName,
      email: normalizedEmail,
      password: trimmedPassword,
      age: Number(registerForm.age),
      gender: registerForm.gender
    };

    try {
      setRegisterLoading(true);
      await registerUser(nextSession);
      await loginUser({
        email: normalizedEmail,
        password: trimmedPassword
      });

      const sessionData = await createUserSession();
      const normalizedSession = normalizeSessionUser(sessionData.session);
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(normalizedSession));
      setCurrentUser(normalizedSession);
      setProfile(null);
      setUserContext(null);
      setShowLoginPrompt(false);
      setRegisterForm({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        age: "",
        gender: ""
      });
      setRegisterTouched({});
      setLoginForm({
        name: "",
        email: normalizedEmail,
        password: ""
      });
      setRegisterError("");
      setLoginError("");
      navigateTo("/register", { scroll: false });
      setShowColdStart(true);
      pushToast("success", "Account created", "Tell us a little about your taste to start personalizing the catalog.");
    } catch (sessionError) {
      const message = sessionError instanceof TypeError ? getFriendlyApiMessage(sessionError) : "Registration failed. Please try again.";
      setRegisterError(message);
      pushToast("info", "Registration unavailable", message);
    } finally {
      setRegisterLoading(false);
    }
  }

  async function handleColdStartContinue() {
    if (!currentUser) {
      setShowColdStart(false);
      navigateTo("/profile");
      return;
    }

    setColdStartLoading(true);

    try {
      const userId = getSessionUserId(currentUser);
      if (coldStartSelections.genres.length || coldStartSelections.themes.length) {
        const contextData = await trackInteraction({
          userId,
          type: "cold_start_preferences",
          source: "register-onboarding",
          genres: coldStartSelections.genres,
          themes: coldStartSelections.themes,
          metadata: {
            selectedGenres: coldStartSelections.genres,
            selectedThemes: coldStartSelections.themes
          }
        });

        setUserContext(contextData);
      }

      const [homeData, profileData] = await Promise.all([getHomeCollections(), getUserProfile()]);
      setCollections(homeData);
      setProfile(buildProfileState(profileData));
      setShowColdStart(false);
      setColdStartSelections({
        genres: [],
        themes: []
      });
      navigateTo("/profile");
    } catch (coldStartError) {
      const message = getFriendlyApiMessage(coldStartError);
      setRegisterError(message);
      pushToast("info", "Preferences not saved", message);
    } finally {
      setColdStartLoading(false);
    }
  }

  function handleColdStartSkip() {
    setShowColdStart(false);
    navigateTo("/profile");
  }

  function handleLogout() {
    window.localStorage.removeItem(sessionStorageKey);
    setCurrentUser(null);
    setProfile(null);
    setUserContext(null);
    setRecentlyWatchedMovies([]);
    setShowLoginPrompt(false);
    setLoginError("");
    setLoginTouched({});
    setLoginForm({
      name: "",
      email: "",
      password: ""
    });
    setRegisterForm({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      age: "",
      gender: ""
    });
    setRegisterTouched({});
    setRegisterError("");
    setShowColdStart(false);
    setColdStartSelections({
      genres: [],
      themes: []
    });
    navigateTo("/discover");
    pushToast("success", "Logged out", "See you later!");
  }

  return (
    <div className={activeView === "landing" ? "app-shell app-shell--landing" : "app-shell"}>
      <ToastTray toasts={toasts} onDismiss={dismissToast} />

      {activeView !== "landing" && (
        <header className="topbar">
          <div className="topbar__inner">
            <div className="topbar__brand-group">
              <button
                type="button"
                className="nav-button nav-button--back"
                onClick={handleBackNavigation}
                aria-label="Go back to the previous page"
              >
                <span aria-hidden="true">{"\u2190"}</span>
                Back
              </button>

              <div className="brand">
                <span className="brand__mark">MI</span>
                <div>
                  <p className="brand__title">Movie Intelligence</p>
                  <p className="brand__subtitle">Discovery-first recommendation experience</p>
                </div>
              </div>
            </div>

            <div className="topbar__nav">
              <div className="topbar__dropdown">
                <button
                  type="button"
                  className={activeView === "genre" || categoryMenuOpen ? "nav-button nav-button--active" : "nav-button"}
                  onClick={() => {
                    setCategoryMenuOpen((current) => !current);
                    setUserMenuOpen(false);
                  }}
                >
                  Categories
                </button>
                {categoryMenuOpen && (
                  <div className="topbar__dropdown-menu">
                    {categoryGenres.map((genre) => (
                      <button key={genre} type="button" className="topbar__dropdown-item" onClick={() => handleGenreSelect(genre)}>
                        {genre}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button className={activeView === "discover" ? "nav-button nav-button--active" : "nav-button"} onClick={() => navigateTo("/discover")}>
                Discover
              </button>
              {!currentUser && (
                <button className={activeView === "register" ? "nav-button nav-button--active" : "nav-button"} onClick={() => navigateTo("/register")}>
                  Register
                </button>
              )}
            </div>

            <form className="topbar__search" onSubmit={handleTopbarSearchSubmit} ref={topbarSearchRef}>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setSearchError(null);
                  setShowSearchSuggestions(true);
                }}
                onFocus={() => setShowSearchSuggestions(true)}
                placeholder="Search movies"
                aria-label="Search movies"
              />
              <button type="submit" className="nav-button nav-button--search">
                Search
              </button>

              {showSearchSuggestions && (loadingSearchSuggestions || searchSuggestions.length > 0) && (
                <div className="topbar__search-suggestions">
                  {loadingSearchSuggestions ? (
                    <div className="topbar__search-suggestion topbar__search-suggestion--status">Finding matches...</div>
                  ) : (
                    searchSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="topbar__search-suggestion"
                        onClick={() => applySearchSuggestion(suggestion.value)}
                      >
                        {suggestion.label}
                      </button>
                    ))
                  )}
                </div>
              )}
            </form>

            <div className="topbar__status">
              {currentUser ? (
                <div className="topbar__dropdown topbar__dropdown--user">
                  <button
                    type="button"
                    className={userMenuOpen ? "topbar__user-menu topbar__user-menu--open" : "topbar__user-menu"}
                    onClick={() => {
                      setUserMenuOpen((current) => !current);
                      setCategoryMenuOpen(false);
                    }}
                  >
                    <span className="topbar__avatar">{(currentUser.name || currentUser.email || "U").slice(0, 1).toUpperCase()}</span>
                    <span>{currentUser.name}</span>
                  </button>
                  {userMenuOpen && (
                    <div className="topbar__dropdown-menu topbar__dropdown-menu--user">
                      <button type="button" className="topbar__dropdown-item" onClick={() => navigateTo("/profile")}>
                        Profile
                      </button>
                      <button type="button" className="topbar__dropdown-item" onClick={handleLogout}>
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="auth-switch">
                  <button className={activeView === "login" ? "nav-button nav-button--active" : "nav-button"} onClick={() => navigateTo("/login")}>
                    Login
                  </button>
                  <button className={activeView === "register" ? "nav-button nav-button--active" : "nav-button"} onClick={() => navigateTo("/register")}>
                    Register
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <main className="layout">
        {activeView === "landing" ? (
          <LandingPage
            collageMovies={uniqueMovieCatalog.length ? uniqueMovieCatalog : heroChoices}
            showcaseMovie={collections?.hero ?? heroChoices[0]}
            onGetStarted={() => {
              navigateTo("/discover");
            }}
          />
        ) : activeView === "discover" ? (
          <>
            <section className="masthead masthead--discover">
              {loadingHome && !collections ? (
                <HeroBannerSkeleton />
              ) : (
                <HeroBanner movie={collections?.hero} heroChoices={heroChoices} onPromptSelect={handlePromptSelect} />
              )}

              <section className="search-panel" ref={searchPanelRef}>
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Command Deck</p>
                    <h2>Discover beyond search</h2>
                  </div>
                </div>
                <p className="section-copy">
                  Start with search, then keep exploring through personalized rows, follow-up explanation buttons, and title-to-title discovery.
                </p>

                {!currentUser && (
                  <div className={`guest-banner${guestLimitReached ? " guest-banner--locked" : showGuestWarning ? " guest-banner--warning" : ""}`}>
                    <div>
                      <strong>{guestLimitReached ? "Free search limit reached" : `${guestQueriesRemaining} free quer${guestQueriesRemaining === 1 ? "y" : "ies"} left`}</strong>
                      <p>
                        {guestLimitReached
                          ? "Login to keep searching without limits and save your taste profile."
                          : showGuestWarning
                            ? "You have 1 free query left. Login for unlimited access."
                            : "Guests can explore up to 5 recommendation queries before signing in."}
                      </p>
                    </div>
                    <button type="button" className="inline-button inline-button--secondary guest-banner__action" onClick={() => navigateTo("/login")}>
                      {guestLimitReached ? "Login to continue" : "Unlock unlimited"}
                    </button>
                  </div>
                )}

                <form className="search-form" onSubmit={handleSubmit}>
                  <textarea
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      clearRequestError();
                    }}
                    placeholder="Try: movies like Inception but less violent based on my preference"
                    disabled={guestLimitReached}
                  />

                  <button type="submit" disabled={loadingRecommendations || guestLimitReached}>
                    {guestLimitReached ? "Login to search" : "Get recommendations"}
                  </button>
                </form>

                <div className="prompt-list">
                  {starterPrompts.map((prompt) => (
                    <button key={prompt} className="prompt-pill" onClick={() => handlePromptSelect(prompt, { type: "starter_prompt", source: "starter-prompts" })}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>
            </section>

            {loadingHome && !collections ? (
              <CatalogSkeleton />
            ) : (
              <div className="catalog-shell">
                {discoverRows.map((row) => (
                  <MovieRow
                    key={row.key}
                    title={row.title}
                    subtitle={row.subtitle}
                    movies={filterBlockedMovies(row.movies)}
                    loading={loadingHome}
                    likedMovieIds={likedMovieIds}
                    emptyTitle={row.key === "because-you-watched" ? "No more picks right now." : undefined}
                    emptyCopy={row.key === "because-you-watched" ? "You have cleared this rail. Come back later for refreshed recommendations." : undefined}
                    onMoviePrompt={handleMovieReference}
                    onLikeMovie={handleMovieLike}
                    onDislikeMovie={handleMovieDislike}
                    onRequireLogin={openLoginPrompt}
                    onMovieSelect={handleMovieSelect}
                  />
                ))}
              </div>
            )}

            <RecommendationPanel
              sectionRef={recommendationRef}
              data={results}
              loading={loadingRecommendations}
              error={requestError}
              rateLimitCountdown={rateLimitCountdown}
              onRetry={requestError?.retryAction}
              onPromptSelect={handlePromptSelect}
              onRecommendationAction={handleRecommendationAction}
              onLoadExplainedSimilar={loadExplainedSimilarMovies}
              explainedRowsCache={explainedRowsCache}
              explainedRowsLoading={explainedRowsLoading}
            />

            {followUpRow && (
              <MovieRow
                title={followUpRow.title}
                subtitle={followUpRow.subtitle}
                movies={filterBlockedMovies(followUpRow.movies)}
                likedMovieIds={likedMovieIds}
                onMoviePrompt={handleMovieReference}
                onLikeMovie={handleMovieLike}
                onDislikeMovie={handleMovieDislike}
                onRequireLogin={openLoginPrompt}
                onMovieSelect={handleMovieSelect}
              />
            )}
          </>
        ) : activeView === "genre" ? (
          <GenrePage genreName={selectedGenreName} onMovieSelect={handleMovieSelect} />
        ) : activeView === "movie" ? (
          <MovieDetailPage movie={selectedMovie} onRelatedGenreSelect={handleGenreSelect} />
        ) : activeView === "search" ? (
          <SearchResultsPage
            query={routedSearchQuery}
            results={searchResults}
            loading={loadingSearch}
            error={searchError}
            onMoviePrompt={handleMovieReference}
            onMovieSelect={handleMovieSelect}
          />
        ) : activeView === "login" ? (
          <section className="login-page">
            <div className="login-page__content">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Member Access</p>
                  <h2>Sign in to unlock your profile</h2>
                </div>
              </div>
              <p className="section-copy">
                Your profile stays hidden until you sign in. After login, the backend starts fetching user-specific rows, profile data, searches, and clicked-title history.
              </p>

              <div className="login-feature-list">
                <div className="login-feature-card">
                  <span>Profile privacy</span>
                  <strong>Your personal taste panel stays gated.</strong>
                </div>
                <div className="login-feature-card">
                  <span>Tracked behavior</span>
                  <strong>Searches and clicks now refresh user-specific data.</strong>
                </div>
                <div className="login-feature-card">
                  <span>Backend functions</span>
                  <strong>Session, context, and interaction APIs now power personalization.</strong>
                </div>
              </div>
            </div>

            <aside className="login-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Login</p>
                  <h2>Welcome back</h2>
                </div>
              </div>

              <form className="login-form" onSubmit={handleLoginSubmit} noValidate>
                <label>
                  <span>Name</span>
                  <input name="name" type="text" value={loginForm.name} onChange={handleLoginChange} placeholder="Enter your name" />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    value={loginForm.email}
                    onChange={handleLoginChange}
                    onBlur={() => markLoginTouched("email")}
                    placeholder="Enter your email"
                  />
                  <FormFieldError message={loginTouched.email ? loginValidationErrors.email : ""} />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    name="password"
                    type="password"
                    value={loginForm.password}
                    onChange={handleLoginChange}
                    onBlur={() => markLoginTouched("password")}
                    placeholder="Enter your password"
                  />
                  <FormFieldError message={loginTouched.password ? loginValidationErrors.password : ""} />
                </label>

                {loginError && <div className="surface surface--error">{loginError}</div>}

                <button type="submit" disabled={!isLoginValid || loginLoading}>
                  {loginLoading ? "Signing in..." : "Login and open profile"}
                </button>
              </form>

              <button className="inline-button inline-button--secondary auth-inline-link" onClick={() => navigateTo("/register")}>
                Need an account? Register
              </button>
            </aside>
          </section>
        ) : activeView === "register" ? (
          <section className="login-page">
            <div className="login-page__content">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">New Member</p>
                  <h2>Create your register profile</h2>
                </div>
              </div>
              <p className="section-copy">
                Register once to start saving your identity in the app, unlock personalized rows, and keep your recommendation history connected to your account.
              </p>

              <div className="login-feature-list">
                <div className="login-feature-card">
                  <span>Quick setup</span>
                  <strong>Create your access profile in one short step.</strong>
                </div>
                <div className="login-feature-card">
                  <span>Personalized rows</span>
                  <strong>New sessions can immediately power user-specific discovery.</strong>
                </div>
                <div className="login-feature-card">
                  <span>Seamless handoff</span>
                  <strong>After registration, you go straight into your profile view.</strong>
                </div>
              </div>
            </div>

            <aside className="login-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Register</p>
                  <h2>Create account</h2>
                </div>
              </div>

              <form className="login-form" onSubmit={handleRegisterSubmit} noValidate>
                <label>
                  <span>Name</span>
                  <input
                    name="name"
                    type="text"
                    value={registerForm.name}
                    onChange={handleRegisterChange}
                    onBlur={() => markRegisterTouched("name")}
                    placeholder="Enter your name"
                  />
                  <FormFieldError message={registerTouched.name ? registerValidationErrors.name : ""} />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    value={registerForm.email}
                    onChange={handleRegisterChange}
                    onBlur={() => markRegisterTouched("email")}
                    placeholder="Enter your email"
                  />
                  <FormFieldError message={registerTouched.email ? registerValidationErrors.email : ""} />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    name="password"
                    type="password"
                    value={registerForm.password}
                    onChange={handleRegisterChange}
                    onBlur={() => markRegisterTouched("password")}
                    placeholder="Create a password"
                  />
                  <FormFieldError message={registerTouched.password ? registerValidationErrors.password : ""} />
                </label>
                <label>
                  <span>Confirm Password</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={registerForm.confirmPassword}
                    onChange={handleRegisterChange}
                    onBlur={() => markRegisterTouched("confirmPassword")}
                    placeholder="Confirm your password"
                  />
                  <FormFieldError message={registerTouched.confirmPassword ? registerValidationErrors.confirmPassword : ""} />
                </label>
                <label>
                  <span>Age</span>
                  <input
                    name="age"
                    type="number"
                    min="13"
                    max="100"
                    value={registerForm.age}
                    onChange={handleRegisterChange}
                    onBlur={() => markRegisterTouched("age")}
                    placeholder="Your age"
                  />
                  <FormFieldError message={registerTouched.age ? registerValidationErrors.age : ""} />
                </label>

                <div className="gender-fieldset">
                  <span>Gender</span>
                  <div className="gender-options">
                    {genderOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={registerForm.gender === option ? "gender-option gender-option--selected" : "gender-option"}
                        onClick={() => {
                          setRegisterForm((currentForm) => ({ ...currentForm, gender: option }));
                          markRegisterTouched("gender");
                          setRegisterError("");
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <FormFieldError message={registerTouched.gender ? registerValidationErrors.gender : ""} />
                </div>

                {registerError && <div className="surface surface--error">{registerError}</div>}

                <button type="submit" disabled={!isRegisterValid || registerLoading}>
                  {registerLoading ? "Creating account..." : "Register and open profile"}
                </button>
              </form>

              <button className="inline-button inline-button--secondary auth-inline-link" onClick={() => navigateTo("/login")}>
                Already have an account? Login
              </button>
            </aside>
          </section>
        ) : (
          <section className="profile-page">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Profile</p>
                <h2>Your Taste Profile</h2>
              </div>
              <p className="section-copy section-copy--compact">
                Preferences, recent searches, clicked titles, and personalization signals now come from backend session functions.
              </p>
            </div>
            <div className="profile-page__toolbar">
              <div className="topbar__status">
                <span className="status-dot" />
                Signed in as {currentUser?.email}
              </div>
              <button className="inline-button inline-button--secondary" onClick={handleLogout}>
                Logout
              </button>
            </div>
            {(loadingProfile || (currentUser && !profile)) && <div className="surface">Preparing your profile...</div>}
            <PreferencePanel profile={profile} context={userContext} currentUser={currentUser} />
            {likedMoviesForRow.length > 0 && (
              <MovieRow
                title="Movies you liked"
                subtitle="Based on your reactions"
                movies={likedMoviesForRow}
                likedMovieIds={likedMovieIds}
                onMoviePrompt={handleMovieReference}
                onLikeMovie={handleMovieLike}
                onDislikeMovie={handleMovieDislike}
                onRequireLogin={openLoginPrompt}
                onMovieSelect={handleMovieSelect}
              />
            )}
          </section>
        )}

        <Footer />
      </main>

      {showLoginPrompt && (
        <div className="auth-popup-overlay" role="presentation" onClick={() => setShowLoginPrompt(false)}>
          <div className="auth-popup" role="dialog" aria-modal="true" aria-labelledby="auth-popup-title" onClick={(event) => event.stopPropagation()}>
            <p className="section-kicker">Login Required</p>
            <h2 id="auth-popup-title">You're not signed in. Please log in to like or dislike movies.</h2>
            <div className="auth-popup__actions">
              <button
                type="button"
                className="inline-button"
                onClick={() => {
                  setShowLoginPrompt(false);
                  navigateTo("/login");
                }}
              >
                Login
              </button>
              <button type="button" className="inline-button inline-button--secondary" onClick={() => setShowLoginPrompt(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackToTop && (
        <button type="button" className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
          ↑
        </button>
      )}

      {showColdStart && (
        <div className="cold-start-modal" role="dialog" aria-modal="true" aria-labelledby="cold-start-title">
          <div className="cold-start-modal__backdrop" />
          <div className="cold-start-panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Cold Start</p>
                <h2 id="cold-start-title">Pick your genres and themes</h2>
              </div>
            </div>
            <p className="section-copy">
              This helps the app start personalizing recommendations right after registration. You can choose a few now and continue.
            </p>

            <div className="cold-start-group">
              <p className="profile-label">Genres</p>
              <div className="prompt-list cold-start-list">
                {coldStartGenres.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    className={coldStartSelections.genres.includes(genre) ? "prompt-pill prompt-pill--selected" : "prompt-pill"}
                    onClick={() => toggleColdStartSelection("genres", genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            <div className="cold-start-group">
              <p className="profile-label">Themes</p>
              <div className="prompt-list cold-start-list">
                {coldStartThemes.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={coldStartSelections.themes.includes(theme) ? "prompt-pill prompt-pill--selected" : "prompt-pill"}
                    onClick={() => toggleColdStartSelection("themes", theme)}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            {registerError && <div className="surface surface--error">{registerError}</div>}

            <div className="cold-start-actions">
              <button className="inline-button inline-button--secondary" type="button" onClick={handleColdStartSkip} disabled={coldStartLoading}>
                Skip for now
              </button>
              <button className="inline-button" type="button" onClick={handleColdStartContinue} disabled={coldStartLoading}>
                {coldStartLoading ? "Saving..." : "Continue to profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
