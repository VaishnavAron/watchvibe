import { coldStartGenres, coldStartThemes } from "../constants";

export default function ColdStartModal({
  showColdStart,
  coldStartSelections,
  coldStartLoading,
  registerError,
  toggleColdStartSelection,
  handleColdStartContinue,
  handleColdStartSkip
}) {
  if (!showColdStart) {
    return null;
  }

  return (
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
  );
}
