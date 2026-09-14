import { useState, useEffect } from "react";
import { starterPrompts } from "../constants";
import HeroBanner from "../components/HeroBanner";
import MovieRow from "../components/MovieRow";

function HeroBannerSkeleton() {
  return (
    <section className="hero hero--billboard hero--skeleton" aria-hidden="true">
      <div className="hero__content">
        <span className="skeleton-block skeleton-block--kicker" style={{ width: "120px", height: "14px" }} />
        <span className="skeleton-block skeleton-block--title" style={{ width: "320px", height: "36px", margin: "12px 0" }} />
        <div className="hero__meta" style={{ display: "flex", gap: "8px", margin: "14px 0" }}>
          <span className="skeleton-pill" style={{ width: "50px", height: "24px", borderRadius: "6px" }} />
          <span className="skeleton-pill" style={{ width: "70px", height: "24px", borderRadius: "6px" }} />
          <span className="skeleton-pill" style={{ width: "90px", height: "24px", borderRadius: "6px" }} />
        </div>
        <span className="skeleton-block skeleton-block--copy" style={{ width: "420px", height: "16px", margin: "8px 0" }} />
        <span className="skeleton-block skeleton-block--copy skeleton-block--copy-short" style={{ width: "280px", height: "16px", margin: "8px 0" }} />
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

export default function DiscoverView({
  collections,
  loadingHome,
  heroChoices,
  currentUser,
  query,
  setQuery,
  clearRequestError,
  loadingRecommendations,
  guestLimitReached,
  guestQueriesRemaining,
  showGuestWarning,
  handleSubmit,
  handlePromptSelect,
  requestError,
  rateLimitCountdown,
  results,
  followUpRow,
  likedMovieIds,
  handleMovieReference,
  handleMovieLike,
  handleMovieDislike,
  openLoginPrompt,
  handleMovieSelect,
  recommendationRef,
  searchPanelRef,
  onLoadExplainedSimilar,
  explainedRowsCache,
  explainedRowsLoading,
  navigateTo,
  discoverRows,
  handleRecommendationAction,
  isBecauseRowLoading,
  onOpenDnaDrawer
}) {
  // Localized query state for 0ms typing response without App-level re-render lag
  const [localQuery, setLocalQuery] = useState(query || "");

  useEffect(() => {
    setLocalQuery(query || "");
  }, [query]);

  const onLocalSubmit = (e) => {
    e.preventDefault();
    setQuery(localQuery);
    handleSubmit(e);
  };

  return (
    <>
      <section className="masthead masthead--discover">
        {loadingHome && !collections ? (
          <HeroBannerSkeleton />
        ) : (
          <HeroBanner 
            movie={collections?.hero} 
            heroChoices={heroChoices} 
            onPromptSelect={(prompt, interaction) => {
              setQuery(prompt);
              navigateTo(`/studio?q=${encodeURIComponent(prompt)}`);
              handlePromptSelect(prompt, interaction);
            }} 
            onNavigateToStudio={() => navigateTo("/studio")}
          />
        )}

        <section className="discover-action-strip" ref={searchPanelRef}>
          <div className="discover-action-strip__main">
            <form className="discover-search-form" onSubmit={(e) => {
              e.preventDefault();
              if (localQuery.trim()) {
                setQuery(localQuery);
                navigateTo("/studio");
                handleSubmit(e);
              }
            }}>
              <span className="discover-search-icon">🔍</span>
              <input
                type="text"
                value={localQuery}
                onChange={(event) => {
                  setLocalQuery(event.target.value);
                  clearRequestError();
                }}
                placeholder="Ask by mood, tone, or director blend (e.g. 'noir thriller', 'Inception with mystery')..."
                disabled={guestLimitReached}
              />
              <button type="submit" className="discover-search-btn" disabled={loadingRecommendations || guestLimitReached || !localQuery.trim()}>
                Ask Copilot →
              </button>
            </form>

            <div className="discover-action-strip__actions">
              <button
                type="button"
                className="discover-strip-btn discover-strip-btn--calibrate"
                onClick={() => navigateTo("/studio?customize=true")}
                title="Calibrate your personal cinematic taste without creating an account"
              >
                <span>✨</span> Calibrate Taste
              </button>

              <button 
                type="button" 
                className="discover-strip-btn discover-strip-btn--studio"
                onClick={() => navigateTo("/studio")}
                title="Open Conversational AI Copilot"
              >
                <span>💬</span> Studio Copilot
              </button>
            </div>
          </div>

          <div className="prompt-list prompt-list--discover">
            {starterPrompts.slice(0, 5).map((prompt) => (
              <button 
                key={prompt} 
                className="prompt-pill" 
                onClick={() => {
                  setLocalQuery(prompt);
                  setQuery(prompt);
                  navigateTo(`/studio?q=${encodeURIComponent(prompt)}`);
                  handlePromptSelect(prompt, { type: "starter_prompt", source: "starter-prompts" });
                }}
              >
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
          {discoverRows.map((row) => {
            if (row.key === 'because-you-watched' && isBecauseRowLoading) {
              return (
                <MovieRow
                  key="because-skeleton"
                  title="Because You Watched"
                  subtitle="Finding movies like your last watch..."
                  loading
                />
              );
            }
            return (
              <MovieRow
                key={row.key}
                title={row.title}
                subtitle={row.subtitle}
                movies={row.movies}
                loading={loadingHome}
                likedMovieIds={likedMovieIds}
                emptyTitle={row.key === "because-you-watched" ? "No more picks right now." : undefined}
                emptyCopy={row.key === "because-you-watched" ? "You have cleared this rail. Come back later for refreshed recommendations." : undefined}
                onMoviePrompt={handleMovieReference}
                onLikeMovie={handleMovieLike}
                onDislikeMovie={handleMovieDislike}
                onRequireLogin={openLoginPrompt}
                onMovieSelect={handleMovieSelect}
                onOpenDnaDrawer={onOpenDnaDrawer}
              />
            );
          })}
        </div>
      )}

    </>
  );
}