import { useEffect, useState } from "react";

import { ApiError, askRecommendations } from "../api";
import { defaultRateLimitCountdown, readStoredJson } from "../utils/helpers";

export default function useRecommendations({
  getCurrentUser,
  pushToast,
  syncPersonalization,
  guestQueryLimit,
  guestQueryStorageKey,
  scrollToRecommendations,
  persistRecentSearch
}) {
  const [query, setQuery] = useState("movies like Inception but less violent based on my preference");
  const [results, setResults] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [followUpRow, setFollowUpRow] = useState(null);
  const [explainedRowsCache, setExplainedRowsCache] = useState({});
  const [explainedRowsLoading, setExplainedRowsLoading] = useState({});
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [guestQueryCount, setGuestQueryCount] = useState(0);

  useEffect(() => {
    setGuestQueryCount(readStoredJson(guestQueryStorageKey, 0));
  }, [guestQueryStorageKey]);

  useEffect(() => {
    if (rateLimitCountdown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRateLimitCountdown((current) => (current > 1 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rateLimitCountdown]);

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

  async function runRecommendation(nextQuery, options = {}) {
    const currentUser = getCurrentUser();
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
      const payload = await askRecommendations(trimmedQuery, { 
        conversationHistory: options.conversationHistory,
        state: options.state || sessionState
      });

      if (options.asFollowUp) {
        setFollowUpRow({
          title: options.rowTitle,
          subtitle: `Generated from ${options.movieTitle}`,
          movies: payload.results || payload.recommendations
        });
      } else {
        setResults(payload);
        if (payload?.state) {
          setSessionState(payload.state);
        }
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
    const currentUser = getCurrentUser();
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

  function clearResults() {
    setResults(null);
    setSessionState(null);
    setFollowUpRow(null);
    setQuery("");
    clearRequestError();
  }

  return {
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
    handleGuestLimitReached,
    setFriendlyRequestError,
    clearRequestError,
    clearResults
  };
}
