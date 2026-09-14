import { useEffect, useMemo, useRef, useState } from "react";

import {
  getHomeCollections,
  getUserProfile,
  searchMovies,
  trackInteraction,
  updateMovieReaction
} from "./api";
import ColdStartModal from "./components/ColdStartModal";
import Footer from "./components/Footer";
import GenrePage from "./components/GenrePage";
import LandingPage from "./components/LandingPage";
import LoginPromptModal from "./components/LoginPromptModal";
import MovieDetailPage from "./components/MovieDetailPage";
import SearchResultsPage from "./components/SearchResultsPage";
import ToastTray from "./components/ToastTray";
import TopBar from "./layouts/TopBar";
import RecommendationDnaDrawer from "./components/RecommendationDnaDrawer";
import CopilotWidget from "./components/CopilotWidget";
import ErrorBoundary from "./components/ErrorBoundary";
import DiscoverView from "./views/DiscoverView";
import StudioView from "./views/StudioView";
import LoginView from "./views/LoginView";
import ProfileView from "./views/ProfileView";
import RegisterView from "./views/RegisterView";
import useAuth from "./hooks/useAuth";
import useHomeData from "./hooks/useHomeData";
import useRecentlyWatched from "./hooks/useRecentlyWatched";
import useRecommendations from "./hooks/useRecommendations";
import useSearch from "./hooks/useSearch";
import {
  getFriendlyApiMessage,
  getSessionUserId,
  getMovieId,
  readStoredJson,
  sanitizeRecentSearches,
  decodeRouteSegment,
  resolveViewFromPath,
  readCurrentRoute,
  guestQueryStorageKey,
  recentSearchesStorageKey,
  guestQueryLimit
} from "./utils/helpers";
import { starterPrompts, coldStartGenres, coldStartThemes, genderOptions, categoryGenres } from './constants';

export default function App() {
  const [profile, setProfile] = useState(null);
  const [userContext, setUserContext] = useState(null);
  const [route, setRoute] = useState(readCurrentRoute);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dnaDrawerMovie, setDnaDrawerMovie] = useState(null);
  const [showPipelineInspector, setShowPipelineInspector] = useState(false);
  const recommendationRef = useRef(null);
  const searchPanelRef = useRef(null);
  const topbarSearchRef = useRef(null);

  const activeView = useMemo(() => resolveViewFromPath(route.pathname), [route.pathname]);
  const routeSearchParams = useMemo(() => new URLSearchParams(route.search), [route.search]);
  const selectedGenreName = useMemo(() => {
    if (activeView !== "genre") return "";
    return decodeRouteSegment(route.pathname.replace("/genre/", ""));
  }, [activeView, route.pathname]);
  const selectedMovieId = useMemo(() => {
    if (activeView !== "movie") return "";
    return decodeRouteSegment(route.pathname.replace("/movie/", ""));
  }, [activeView, route.pathname]);
  const routedSearchQuery = useMemo(() => routeSearchParams.get("q")?.trim() ?? "", [routeSearchParams]);

  const search = useSearch({ navigateTo });

  function getCurrentUser() { return auth.currentUser; }

  const recentlyWatched = useRecentlyWatched(getCurrentUser);
  const {
    recentlyWatchedMovies,
    setRecentlyWatchedMovies,
    saveRecentlyWatched,
    refreshRecentlyWatchedFromBackend,
    filterBlockedMovies
  } = recentlyWatched;

  const recommendations = useRecommendations({
    getCurrentUser,
    pushToast,
    syncPersonalization,
    guestQueryLimit,
    guestQueryStorageKey,
    scrollToRecommendations,
    persistRecentSearch
  });

  const {
    query,
    setQuery,
    results,
    sessionState,
    followUpRow,
    explainedRowsCache,
    explainedRowsLoading,
    loadingRecommendations,
    requestError,
    rateLimitCountdown,
    guestQueryCount,
    setGuestQueryCount,
    runRecommendation,
    handleSubmit,
    handlePromptSelect,
    handleRecommendationAction,
    loadExplainedSimilarMovies,
    setFriendlyRequestError,
    clearRequestError,
    clearResults
  } = recommendations;

  const home = useHomeData({
    getCurrentUser,
    clearRequestError,
    setFriendlyRequestError,
    setProfile,
    setUserContext,
    setRecentlyWatchedMovies
  });

  const {
    collections,
    allMovies,
    loadingHome,
    loadingProfile,
    movieCache,
    setCollections,
    refreshUserData,
    cacheMovies,
    buildProfileState,
    isBecauseRowLoading
  } = home;

  const auth = useAuth({
    navigateTo,
    pushToast,
    refreshUserData,
    refreshRecentlyWatchedFromBackend,
    buildProfileState,
    setCollections,
    setProfile,
    setUserContext,
    setRecentlyWatchedMovies,
    setShowLoginPrompt
  });

  const {
    currentUser,
    showColdStart,
    coldStartSelections,
    coldStartLoading,
    registerForm,
    registerTouched,
    registerError,
    registerLoading,
    loginForm,
    loginTouched,
    loginError,
    loginLoading,
    loginValidationErrors,
    registerValidationErrors,
    isLoginValid,
    isRegisterValid,
    setRegisterForm,
    setRegisterError,
    handleLoginChange,
    handleRegisterChange,
    handleLoginSubmit,
    handleRegisterSubmit,
    handleColdStartContinue,
    handleColdStartSkip,
    toggleColdStartSelection,
    handleLogout,
    markLoginTouched,
    markRegisterTouched
  } = auth;

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
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
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

  function handleMovieSelect(movieId, movie) {
    if (movie) cacheMovies([movie]);
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

  function persistRecentSearch(nextQuery) {
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery) return;
    setRecentSearches((current) => {
      const nextSearches = sanitizeRecentSearches([trimmedQuery, ...current.filter((item) => item.toLowerCase() !== trimmedQuery.toLowerCase())]);
      window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(nextSearches));
      return nextSearches;
    });
  }

  async function syncPersonalization(interaction) {
    if (!currentUser) return;
    try {
      const contextData = await trackInteraction({ ...interaction });
      setUserContext(contextData);
      await refreshUserData(undefined, { includeProfile: true });
    } catch (interactionError) {
      setFriendlyRequestError(interactionError, () => syncPersonalization(interaction));
    }
  }

  function openLoginPrompt() {
    setShowLoginPrompt(true);
  }

  async function handleMovieReaction(movie, action, sourceTitle) {
    const userId = getSessionUserId(currentUser);
    if (!userId) {
      openLoginPrompt();
      return;
    }
    try {
      const payload = await updateMovieReaction({ userId, movieId: movie.id, action });
      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              likedMovies: Array.isArray(payload?.likedMovies) ? payload.likedMovies : currentProfile.likedMovies,
              dislikedMovies: Array.isArray(payload?.dislikedMovies) ? payload.dislikedMovies : currentProfile.dislikedMovies
            }
          : currentProfile
      );
      if (action === "like") {
        await saveRecentlyWatched(movie);
      }
      await syncPersonalization({
        userId,
        type: action === "like" ? "movie_liked" : "movie_disliked",
        movieId: movie.id,
        source: sourceTitle,
        metadata: { movieTitle: movie.title, action }
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

  async function handleMovieReference(prompt, movie, sourceTitle) {
    setQuery(prompt);
    navigateTo(`/studio?q=${encodeURIComponent(prompt)}`);
    const wasSuccessful = await runRecommendation(prompt);
    if (!wasSuccessful) return;
    const userId = getSessionUserId(currentUser);
    if (userId && movie?.id) {
      try {
        await saveRecentlyWatched(movie);
      } catch { }
    }
    await syncPersonalization({
      type: "movie_reference_click",
      query: prompt,
      movieId: movie.id,
      source: sourceTitle,
      metadata: { movieTitle: movie.title }
    });
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
    ...search.searchResults,
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

  const uniqueMovieCatalog = useMemo(() => {
    const map = new Map();
    for (const movie of movieCatalog) {
      if (movie && movie.id && !map.has(String(movie.id))) {
        map.set(String(movie.id), movie);
      }
    }
    return Array.from(map.values());
  }, [movieCatalog]);
  const likedMovieIds = useMemo(
    () => (Array.isArray(profile?.likedMovies) ? profile.likedMovies.map(getMovieId).filter(Boolean).map(String) : []),
    [profile]
  );
  const selectedMovie = uniqueMovieCatalog.find((movie) => String(movie.id) === String(selectedMovieId)) ?? movieCache[selectedMovieId] ?? null;
  const likedMoviesForRow = (Array.isArray(profile?.likedMovies) ? profile.likedMovies : [])
    .map((entry) => {
      const movieId = getMovieId(entry);
      return entry?.posterUrl ? { ...entry, id: movieId } : uniqueMovieCatalog.find((movie) => String(movie.id) === String(movieId)) ?? movieCache[movieId];
    })
    .filter(Boolean)
    .filter((movie, index, array) => array.findIndex((entry) => String(entry.id) === String(movie.id)) === index);

  const isColdStartActive = localStorage.getItem('cold-start-active') === 'true';
  const discoverRows = collections
    ? [
        collections.becauseYouWatched && {
          key: "because-you-watched",
          title: collections.becauseYouWatched.title,
          subtitle: collections.becauseYouWatched.subtitle,
          movies: collections.becauseYouWatched.movies
        },
        collections.trending && {
          key: "trending",
          title: collections.trending?.title ?? "Trending Now",
          subtitle: collections.trending?.subtitle ?? "Most popular movies right now across the AI Knowledge Graph.",
          movies: collections.trending?.movies ?? []
        },
        {
          key: "top-rated",
          title: collections.topRated?.title ?? "Top Rated",
          subtitle: collections.topRated?.subtitle ?? "Highest-rated picks presented in a stronger discovery rail.",
          movies:
            collections.topRated?.movies ??
            collections.topRated ??
            [...uniqueMovieCatalog].sort((left, right) => right.rating - left.rating || right.popularity - left.popularity).slice(0, 8)
        },
        collections.action && {
          key: "action",
          title: collections.action?.title ?? "Action & Thrills",
          subtitle: collections.action?.subtitle ?? "High-octane thrill rides and kinetic cinematic adventures.",
          movies: collections.action?.movies ?? []
        },
        {
          key: "drama",
          title: collections.drama?.title ?? "Critically Acclaimed Dramas",
          subtitle: collections.drama?.subtitle ?? "Emotion-forward films arranged into a cleaner cinematic rail.",
          movies:
            collections.drama?.movies ??
            collections.drama ??
            uniqueMovieCatalog
              .filter((movie) => movie.genres?.includes("Drama"))
              .sort((left, right) => right.rating - left.rating || right.popularity - left.popularity)
              .slice(0, 8)
        },
        {
          key: "explore",
          title: collections.explore?.title ?? "Explore & Hidden Gems",
          subtitle: collections.explore?.subtitle ?? "A broader blend of titles to keep discovery feeling rich and fresh.",
          movies:
            collections.explore?.movies ??
            collections.explore ??
            [...uniqueMovieCatalog]
              .sort((left, right) => right.popularity + right.rating - (left.popularity + left.rating))
              .slice(0, 8)
        },
        !isColdStartActive && (collections.recentlyWatched?.movies?.length > 0 || recentlyWatchedMovies.length > 0) && {
          key: "recently-watched",
          title: collections.recentlyWatched?.title ?? "Recently Watched",
          subtitle: collections.recentlyWatched?.subtitle ?? "Titles you viewed or interacted with during your sessions.",
          movies: (collections.recentlyWatched?.movies?.length ? collections.recentlyWatched.movies : recentlyWatchedMovies).slice(0, 8)
        },
        collections.collaborative && collections.collaborative.movies?.length > 0 && {
          key: "collaborative",
          title: collections.collaborative.title,
          subtitle: collections.collaborative.subtitle,
          movies: collections.collaborative.movies
        }
      ].filter(Boolean)
    : [];

  useEffect(() => {
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
    if (!currentUser && activeView === "profile") {
      navigateTo("/login", { replace: true, scroll: false });
    }
  }, [activeView, currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setProfile(null);
      setUserContext(null);
      setRecentlyWatchedMovies([]);
      refreshUserData(undefined, { includeProfile: false });
      return;
    }
    setGuestQueryCount(0);
    window.localStorage.setItem(guestQueryStorageKey, JSON.stringify(0));
    refreshUserData(undefined, { includeProfile: true });
  }, [currentUser]);

  useEffect(() => {
    if (activeView !== "search") return undefined;
    if (!routedSearchQuery) {
      search.setSearchInput("");
      search.setSearchResults([]);
      search.setSearchError(null);
      search.setLoadingSearch(false);
      return undefined;
    }
    let isActive = true;
    search.setSearchInput(routedSearchQuery);
    search.setLoadingSearch(true);
    search.setSearchError(null);
    searchMovies(routedSearchQuery)
      .then((payload) => {
        if (!isActive) return;
        const nextResults = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
        search.setSearchResults(nextResults);
        cacheMovies(nextResults);
        persistRecentSearch(routedSearchQuery);
      })
      .catch((err) => {
        if (!isActive) return;
        search.setSearchResults([]);
        search.setSearchError({ message: "Movie search failed.", details: err.message });
      })
      .finally(() => {
        if (isActive) search.setLoadingSearch(false);
      });
    return () => { isActive = false; };
  }, [activeView, routedSearchQuery]);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!topbarSearchRef.current?.contains(event.target)) {
        search.setShowSearchSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timer = window.setTimeout(() => { dismissToast(toasts[0].id); }, 3600);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    function onScroll() { setShowBackToTop(window.scrollY > 300); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (recentlyWatchedMovies.length > 0 && localStorage.getItem('cold-start-active') === 'true') {
      localStorage.removeItem('cold-start-active');
      localStorage.removeItem('cold-start-genres');
      refreshUserData(undefined, { includeProfile: true });
    }
  }, [recentlyWatchedMovies]);

  return (
    <div className={activeView === "landing" ? "app-shell app-shell--landing" : "app-shell"}>
      <ToastTray toasts={toasts} onDismiss={dismissToast} />

      <TopBar
        activeView={activeView}
        categoryMenuOpen={categoryMenuOpen}
        setCategoryMenuOpen={setCategoryMenuOpen}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        currentUser={currentUser}
        searchInput={search.searchInput}
        setSearchInput={search.setSearchInput}
        setSearchError={search.setSearchError}
        showSearchSuggestions={search.showSearchSuggestions}
        setShowSearchSuggestions={search.setShowSearchSuggestions}
        loadingSearchSuggestions={search.loadingSearchSuggestions}
        searchSuggestions={search.searchSuggestions}
        handleTopbarSearchSubmit={search.handleTopbarSearchSubmit}
        applySearchSuggestion={search.applySearchSuggestion}
        handleGenreSelect={handleGenreSelect}
        navigateTo={navigateTo}
        handleLogout={handleLogout}
        handleBackNavigation={handleBackNavigation}
        topbarSearchRef={topbarSearchRef}
      />

      <main className={`layout${activeView === "landing" ? " layout--landing" : ""}${activeView === "studio" ? " layout--studio" : ""}`}>
        <ErrorBoundary onReset={() => navigateTo("/discover")}>
        {activeView === "landing" ? (
          <LandingPage
            collageMovies={uniqueMovieCatalog.length ? uniqueMovieCatalog : heroChoices}
            showcaseMovie={collections?.hero ?? heroChoices[0]}
            onGetStarted={() => navigateTo("/discover")}
            onLaunchStudio={(initialPrompt) => {
              if (initialPrompt === "customize") {
                navigateTo("/studio?customize=true");
              } else if (initialPrompt && typeof initialPrompt === "string") {
                setQuery(initialPrompt);
                navigateTo(`/studio?q=${encodeURIComponent(initialPrompt)}`);
                runRecommendation(initialPrompt);
              } else {
                navigateTo("/studio");
              }
            }}
          />
        ) : activeView === "studio" ? (
          <StudioView
            query={query || routedSearchQuery}
            results={results}
            loadingRecommendations={loadingRecommendations}
            onRunQuery={(q, history, customState) => runRecommendation(q, { conversationHistory: history, state: customState || sessionState })}
            onResetSession={clearResults}
            onOpenDnaDrawer={(movie) => setDnaDrawerMovie(movie)}
            navigateTo={navigateTo}
          />
        ) : activeView === "discover" ? (
          <DiscoverView
            collections={collections}
            loadingHome={loadingHome}
            heroChoices={heroChoices}
            currentUser={currentUser}
            query={query}
            setQuery={setQuery}
            clearRequestError={clearRequestError}
            loadingRecommendations={loadingRecommendations}
            guestLimitReached={guestLimitReached}
            guestQueriesRemaining={guestQueriesRemaining}
            showGuestWarning={showGuestWarning}
            handleSubmit={handleSubmit}
            handlePromptSelect={handlePromptSelect}
            requestError={requestError}
            rateLimitCountdown={rateLimitCountdown}
            results={results}
            followUpRow={followUpRow}
            likedMovieIds={likedMovieIds}
            handleMovieReference={handleMovieReference}
            handleMovieLike={handleMovieLike}
            handleMovieDislike={handleMovieDislike}
            openLoginPrompt={openLoginPrompt}
            handleMovieSelect={handleMovieSelect}
            recommendationRef={recommendationRef}
            searchPanelRef={searchPanelRef}
            onLoadExplainedSimilar={loadExplainedSimilarMovies}
            explainedRowsCache={explainedRowsCache}
            explainedRowsLoading={explainedRowsLoading}
            navigateTo={navigateTo}
            discoverRows={discoverRows}
            handleRecommendationAction={handleRecommendationAction}
            isBecauseRowLoading={isBecauseRowLoading}
            onOpenDnaDrawer={(movie) => setDnaDrawerMovie(movie)}
          />
        ) : activeView === "genre" ? (
          <GenrePage genreName={selectedGenreName} onMovieSelect={handleMovieSelect} />
        ) : activeView === "movie" ? (
          <MovieDetailPage movie={selectedMovie} onRelatedGenreSelect={handleGenreSelect} />
        ) : activeView === "search" ? (
          <SearchResultsPage
            query={routedSearchQuery}
            results={search.searchResults}
            loading={search.loadingSearch}
            error={search.searchError}
            onMoviePrompt={handleMovieReference}
            onMovieSelect={handleMovieSelect}
          />
        ) : activeView === "login" ? (
          <LoginView
            loginForm={loginForm}
            loginTouched={loginTouched}
            loginValidationErrors={loginValidationErrors}
            loginError={loginError}
            loginLoading={loginLoading}
            isLoginValid={isLoginValid}
            handleLoginChange={handleLoginChange}
            handleLoginSubmit={handleLoginSubmit}
            markLoginTouched={markLoginTouched}
            navigateTo={navigateTo}
          />
        ) : activeView === "register" ? (
          <RegisterView
            registerForm={registerForm}
            registerTouched={registerTouched}
            registerValidationErrors={registerValidationErrors}
            registerError={registerError}
            registerLoading={registerLoading}
            isRegisterValid={isRegisterValid}
            handleRegisterChange={handleRegisterChange}
            handleRegisterSubmit={handleRegisterSubmit}
            markRegisterTouched={markRegisterTouched}
            navigateTo={navigateTo}
            setRegisterForm={setRegisterForm}
            setRegisterError={setRegisterError}
          />
        ) : (
          <ProfileView
            loadingProfile={loadingProfile}
            currentUser={currentUser}
            profile={profile}
            userContext={userContext}
            likedMoviesForRow={likedMoviesForRow}
            likedMovieIds={likedMovieIds}
            handleMovieReference={handleMovieReference}
            handleMovieLike={handleMovieLike}
            handleMovieDislike={handleMovieDislike}
            openLoginPrompt={openLoginPrompt}
            handleMovieSelect={handleMovieSelect}
            handleLogout={handleLogout}
            navigateTo={navigateTo}
          />
        )}
        </ErrorBoundary>
        <Footer />
      </main>

      {activeView !== "studio" && (
        <CopilotWidget onOpenStudio={() => navigateTo("/studio")} />
      )}

      <LoginPromptModal showLoginPrompt={showLoginPrompt} setShowLoginPrompt={setShowLoginPrompt} navigateTo={navigateTo} />
      {showBackToTop && (
        <button type="button" className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>
      )}
      <ColdStartModal
        showColdStart={showColdStart}
        coldStartSelections={coldStartSelections}
        coldStartLoading={coldStartLoading}
        registerError={registerError}
        toggleColdStartSelection={toggleColdStartSelection}
        handleColdStartContinue={handleColdStartContinue}
        handleColdStartSkip={handleColdStartSkip}
      />

      <RecommendationDnaDrawer
        isOpen={Boolean(dnaDrawerMovie)}
        onClose={() => setDnaDrawerMovie(null)}
        movie={dnaDrawerMovie}
        runtimeMetrics={results?.runtimeMetrics}
        query={query}
      />
    </div>
  );
}