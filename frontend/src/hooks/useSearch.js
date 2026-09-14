import { useEffect, useState } from "react";

import { getSearchSuggestions } from "../api";
import { normalizeSearchSuggestions } from "../utils/helpers";

export default function useSearch({ navigateTo }) {
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [loadingSearchSuggestions, setLoadingSearchSuggestions] = useState(false);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);

  function clearSearch() {
    setSearchInput("");
    setSearchResults([]);
    setSearchError(null);
    setLoadingSearch(false);
    setSearchSuggestions([]);
    setLoadingSearchSuggestions(false);
    setShowSearchSuggestions(false);
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

  return {
    searchInput,
    setSearchInput,
    searchResults,
    setSearchResults,
    loadingSearch,
    setLoadingSearch,
    searchError,
    setSearchError,
    searchSuggestions,
    loadingSearchSuggestions,
    showSearchSuggestions,
    setShowSearchSuggestions,
    handleTopbarSearchSubmit,
    applySearchSuggestion,
    clearSearch
  };
}
