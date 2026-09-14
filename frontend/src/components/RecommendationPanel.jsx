import { useState } from "react";

function SimilarMoviesRail({
  items,
  loading,
  isOpen,
  onToggle,
  onMoviePrompt,
  emptyText,
  contentOnly = false
}) {
  return (
    <div
      className={`similar-rail${isOpen ? " is-open" : ""}${contentOnly ? " similar-rail--content-only" : ""}`}
      style={contentOnly ? { marginTop: 0, width: "100%", maxWidth: "100%" } : undefined}
    >
      {!contentOnly && (
        <button type="button" className="similar-rail__toggle" onClick={onToggle} aria-expanded={isOpen}>
          <span className="similar-rail__toggle-copy">
            <strong>Movies Like This</strong>
            <small>{isOpen ? "Tap to collapse related titles" : "Tap to open related titles"}</small>
          </span>
          <span className={`similar-rail__chevron${isOpen ? " is-open" : ""}`} aria-hidden="true" />
        </button>
      )}

      {isOpen && (
        <div className="similar-rail__body">
          {loading && (
            <div className="similar-rail__loading" aria-live="polite">
              {[0, 1, 2, 3].map((item) => (
                <div className="similar-rail__skeleton" key={item}>
                  <span />
                  <strong />
                  <small />
                </div>
              ))}
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="similar-rail__track">
              {items.map((movie) => (
                <article className="similar-rail__card" key={movie.id} style={{ "--movie-accent": movie.accent }}>
                  <div className="similar-rail__poster">
                    <img src={movie.posterUrl} alt={`${movie.title} poster`} />
                  </div>
                  <div className="similar-rail__meta">
                    <p>
                      {movie.year} / {movie.duration}m
                    </p>
                    <h4>{movie.title}</h4>
                    <span>{movie.genres.slice(0, 2).join(" / ")}</span>
                    <button
                      type="button"
                      onClick={() => onMoviePrompt(`movies like ${movie.title}`, { type: "similar_rail_prompt", source: "similar-rail" })}
                    >
                      Use as reference
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && items.length === 0 && <p className="similar-rail__empty">{emptyText}</p>}
        </div>
      )}
    </div>
  );
}

export default function RecommendationPanel({
  data,
  loading,
  error,
  rateLimitCountdown,
  onRetry,
  onPromptSelect,
  onRecommendationAction,
  sectionRef,
  onLoadExplainedSimilar,
  explainedRowsCache,
  explainedRowsLoading,
  onOpenDnaDrawer
}) {
  const [openExplainedRows, setOpenExplainedRows] = useState({});
  const interpretedIntent = data
    ? [
        data.parsedQuery.genres.length > 0 ? data.parsedQuery.genres.join(", ") : null,
        data.parsedQuery.moods.length > 0 ? data.parsedQuery.moods.join(", ") : null,
        data.parsedQuery.lessViolent ? "lower violence" : null,
        data.referenceMovie ? `similar to ${data.referenceMovie.title}` : null
      ]
        .filter(Boolean)
        .join(" / ")
    : "";

  return (
    <section className="recommendations" ref={sectionRef}>
      <div className="section-heading">
        <div>
          <p className="section-kicker">Ranking Output</p>
          <h2>Explainable Recommendations</h2>
        </div>
      </div>

      {loading && (
        <div className="recommendation-loading" aria-hidden="true">
          {[0, 1].map((item) => (
            <div className="recommendation-card recommendation-card--skeleton" key={item}>
              <div className="recommendation-card__poster recommendation-card__poster--skeleton">
                <span className="recommendation-skeleton recommendation-skeleton--poster" />
              </div>
              <div className="recommendation-card__main">
                <div className="recommendation-card__body">
                  <div className="recommendation-card__topline">
                    <span className="recommendation-skeleton recommendation-skeleton--pill" />
                    <span className="recommendation-skeleton recommendation-skeleton--pill" />
                    <span className="recommendation-skeleton recommendation-skeleton--pill" />
                  </div>
                  <div className="recommendation-card__header">
                    <div>
                      <span className="recommendation-skeleton recommendation-skeleton--title" />
                      <span className="recommendation-skeleton recommendation-skeleton--copy recommendation-skeleton--copy-short" />
                    </div>
                  </div>
                  <span className="recommendation-skeleton recommendation-skeleton--copy" />
                  <span className="recommendation-skeleton recommendation-skeleton--copy recommendation-skeleton--copy-short" />
                  <div className="recommendation-card__actions">
                    <span className="recommendation-skeleton recommendation-skeleton--button" />
                  </div>
                </div>
                <aside className="recommendation-card__sidebar">
                  <span className="recommendation-skeleton recommendation-skeleton--score" />
                  <span className="recommendation-skeleton recommendation-skeleton--sidebar" />
                  <span className="recommendation-skeleton recommendation-skeleton--sidebar" />
                </aside>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="surface surface--error error-banner">
          <div>
            <strong>{error.message}</strong>
            {error.details && <p>{error.details}</p>}
            {rateLimitCountdown > 0 && <p>Retry available in {rateLimitCountdown}s.</p>}
          </div>
          {onRetry && (
            <button type="button" className="inline-button inline-button--secondary error-banner__action" onClick={onRetry} disabled={rateLimitCountdown > 0}>
              {rateLimitCountdown > 0 ? `Retry in ${rateLimitCountdown}s` : "Retry"}
            </button>
          )}
        </div>
      )}

      {!loading && !error && !data && (
        <div className="surface surface--empty">
          <p className="empty-title">Run a query to see the ranking engine at work.</p>
          <p className="section-copy section-copy--compact">
            The result area will show candidate movies, explanation chips, score breakdowns, and follow-up discovery buttons.
          </p>
          <div className="prompt-list">
            {[
              "funny sci-fi movies",
              "movies like Inception but less violent based on my preference",
              "movies connected to Interstellar via actors"
            ].map((prompt) => (
              <button
                key={prompt}
                className="prompt-pill"
                onClick={() => onPromptSelect(prompt, { type: "empty_state_prompt", source: "empty-state" })}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="recommendations__content">
          <div className="surface recommendation-summary">
            <div>
              <p className="result-query">Query</p>
              <h3>{data.query}</h3>
              {interpretedIntent && <p className="recommendation-summary__intent">Interpreted as: {interpretedIntent}</p>}
            </div>
            <div className="recommendation-summary__meta">
              <div className="chip-list">
                {(data.parsedQuery?.genres || data.parsedQuery?.canonicalGenres || []).map((genre) => (
                  <span className="chip" key={genre}>
                    {genre}
                  </span>
                ))}
                {(data.parsedQuery?.moods || data.parsedQuery?.modifiers?.more || []).map((mood) => (
                  <span className="chip" key={mood}>
                    {mood}
                  </span>
                ))}
                {data.referenceMovie && <span className="chip">Reference: {data.referenceMovie.title}</span>}
              </div>
              <div className="summary-stats">
                <div>
                  <span>Results</span>
                  <strong>{data.results?.length || data.recommendations?.length || 0}</strong>
                </div>
                <div>
                  <span>RAG source</span>
                  <strong>{data.ragContext?.source === "remote-rag" ? "Remote" : "Fallback"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="recommendation-grid">
            {(data.results || data.recommendations || []).map((movie, index) => {
              const matchScore = (
                (Number(movie.scoreBreakdown?.semanticSimilarity ?? 0.8) + Number(movie.scoreBreakdown?.graphScore ?? 0.8)) /
                2
              ).toFixed(2);
              const tasteScore = (
                (Number(movie.scoreBreakdown?.userPreference ?? 0.75) + Number(movie.scoreBreakdown?.popularity ?? 0.75)) /
                2
              ).toFixed(2);
              const scoreTone = (value) => {
                const score = Number(value);
                if (score >= 0.72) return "#32d583";
                if (score >= 0.45) return "#fdb022";
                return "#f04438";
              };
              const isExplainedOpen = Boolean(openExplainedRows[movie.id]);

              return (
                <div className="recommendation-stack" key={movie.id} style={{ "--movie-accent": movie.accent }}>
                  <article
                    className="recommendation-card"
                    style={{ "--movie-backdrop": `url(${movie.backdropUrl ?? movie.posterUrl})` }}
                  >
                    <div className="recommendation-card__poster">
                      <span className="recommendation-card__rank">#{String(index + 1).padStart(2, "0")}</span>
                      <img src={movie.posterUrl} alt={`${movie.title} poster`} />
                    </div>

                    <div className="recommendation-card__main">
                      <div className="recommendation-card__body">
                        <div className="recommendation-card__topline">
                          <span>{movie.year}</span>
                          <span>{movie.duration}m</span>
                          <span>{movie.rating} IMDb</span>
                        </div>

                        <div className="recommendation-card__header">
                          <div>
                            <h3>{movie.title}</h3>
                          </div>
                        </div>

                        <p className="recommendation-card__tagline">{movie.tagline}</p>

                        <div className="explanation-list">
                          {movie.explanation.map((reason) => (
                            <span className="chip" key={reason}>
                              {reason}
                            </span>
                          ))}
                        </div>

                        <div className="recommendation-card__actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="inline-button inline-button--primary"
                            style={{ background: "linear-gradient(135deg, #ff6b2c, #e11d48)", border: 0, padding: "8px 14px", fontWeight: 700 }}
                            onClick={() => onOpenDnaDrawer?.(movie)}
                          >
                            <span>⚡ Recommendation DNA</span>
                          </button>
                          <button
                            className={`inline-button inline-button--secondary inline-button--dropdown${
                              isExplainedOpen ? " is-open" : ""
                            }`}
                            onClick={() => {
                              setOpenExplainedRows((current) => {
                                const nextOpen = !current[movie.id];

                                if (nextOpen) {
                                  onRecommendationAction("Explain Similar Picks", `recommend and explain why like ${movie.title}`, movie);
                                }

                                return {
                                  ...current,
                                  [movie.id]: nextOpen
                                };
                              });
                            }}
                          >
                            <span>Explain Similar Picks</span>
                            <span className={`inline-button__chevron${isExplainedOpen ? " is-open" : ""}`} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <aside className="recommendation-card__sidebar">
                        <div className="recommendation-card__score">
                          <span className="recommendation-card__score-label">Recommendation score</span>
                          <strong>{movie.score}</strong>
                        </div>

                        <div className="score-grid">
                          {[
                            ["Match", matchScore],
                            ["Taste", tasteScore]
                          ].map(([label, value]) => (
                            <div
                              className="score-meter"
                              key={label}
                              style={{
                                "--score-value": Number(value),
                                "--score-percent": `${Number(value) * 100}%`,
                                "--score-color": scoreTone(value)
                              }}
                            >
                              <div className="score-meter__ring">
                                <strong>{value}</strong>
                              </div>
                              <span>{label}</span>
                            </div>
                          ))}
                        </div>
                      </aside>
                    </div>
                  </article>

                  <div className="recommendation-card__rail-row">
                    <SimilarMoviesRail
                      items={explainedRowsCache[movie.id] ?? []}
                      loading={Boolean(explainedRowsLoading[movie.id])}
                      isOpen={isExplainedOpen}
                      onToggle={() => {
                        setOpenExplainedRows((current) => {
                          const nextOpen = !current[movie.id];

                          if (nextOpen) {
                            onLoadExplainedSimilar(movie);
                          }

                          return {
                            ...current,
                            [movie.id]: nextOpen
                          };
                        });
                      }}
                      onMoviePrompt={onPromptSelect}
                      emptyText="No explained similar picks were returned for this title."
                      contentOnly
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

