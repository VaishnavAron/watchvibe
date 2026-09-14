import { useState, useEffect } from "react";
import { categoryGenres } from "../constants";

export default function TopBar({
  activeView,
  categoryMenuOpen,
  setCategoryMenuOpen,
  userMenuOpen,
  setUserMenuOpen,
  currentUser,
  searchInput: externalSearchInput,
  setSearchInput: setExternalSearchInput,
  setSearchError,
  showSearchSuggestions,
  setShowSearchSuggestions,
  loadingSearchSuggestions,
  searchSuggestions,
  handleTopbarSearchSubmit,
  applySearchSuggestion,
  handleGenreSelect,
  navigateTo,
  handleLogout,
  handleBackNavigation,
  topbarSearchRef,
}) {
  // Localized search input for 0ms typing lag
  const [localSearch, setLocalSearch] = useState(externalSearchInput || "");

  useEffect(() => {
    setLocalSearch(externalSearchInput || "");
  }, [externalSearchInput]);

  const onSearchChange = (e) => {
    const val = e.target.value;
    setLocalSearch(val);
    setExternalSearchInput(val);
    setSearchError?.(null);
    setShowSearchSuggestions(true);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setExternalSearchInput(localSearch);
    handleTopbarSearchSubmit(e);
  };

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="topbar__brand-group">
          {/* Arrow-only back button */}
          <button
            type="button"
            className="nav-button nav-button--back"
            onClick={handleBackNavigation}
            aria-label="Go back to previous page"
            title="Go back"
          >
            <span aria-hidden="true">←</span>
          </button>

          <div 
            className="brand" 
            onClick={() => navigateTo("/")} 
            style={{ cursor: "pointer" }}
            title="WatchVibe Home"
          >
            <span className="brand__mark">WV</span>
            <div>
              <p className="brand__title">WatchVibe AI</p>
              <p className="brand__subtitle">Cinema Intelligence Platform</p>
            </div>
          </div>
        </div>

        {/* Clean Navigation Links */}
        <div className="topbar__nav">
          <button 
            className={activeView === "discover" || activeView === "catalog" ? "nav-button nav-button--active" : "nav-button"} 
            onClick={() => navigateTo("/discover")}
          >
            Discover
          </button>

          <button 
            className={activeView === "studio" ? "nav-button nav-button--active nav-button--studio" : "nav-button nav-button--studio"} 
            onClick={() => navigateTo("/studio")}
          >
            <span>💬</span> AI Studio
          </button>

          <div className="topbar__dropdown">
            <button
              type="button"
              className={activeView === "genre" || categoryMenuOpen ? "nav-button nav-button--active" : "nav-button"}
              onClick={() => {
                setCategoryMenuOpen((current) => !current);
                setUserMenuOpen(false);
              }}
            >
              Categories ▾
            </button>
            {categoryMenuOpen && (
              <div className="topbar__dropdown-menu">
                {categoryGenres.map((genre) => (
                  <button 
                    key={genre} 
                    type="button" 
                    className="topbar__dropdown-item" 
                    onClick={() => handleGenreSelect(genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!currentUser && (
            <button 
              className={activeView === "register" ? "nav-button nav-button--active" : "nav-button"} 
              onClick={() => navigateTo("/register")}
            >
              Register
            </button>
          )}
        </div>

        {/* Search Bar with Glass Magnifying Icon */}
        <form className="topbar__search" onSubmit={onSubmit} ref={topbarSearchRef}>
          <input
            type="search"
            value={localSearch}
            onChange={onSearchChange}
            onFocus={() => setShowSearchSuggestions(true)}
            placeholder="Search movies by title, director, keyword..."
            aria-label="Search movies"
          />
          <button type="submit" className="nav-button nav-button--search-icon" title="Search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
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

        {/* User Auth Menu */}
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
              <button className="nav-button nav-button--primary-glow" onClick={() => navigateTo("/register")}>
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
