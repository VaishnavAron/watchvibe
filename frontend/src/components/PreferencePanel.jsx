export default function PreferencePanel({ profile, context, currentUser }) {
  if (!profile) {
    return null;
  }

  const profileName = currentUser?.name?.trim() || profile.name?.trim() || "User";
  const profileEmail = currentUser?.email?.trim() || profile.email?.trim() || "";
  const preferredGenres = Array.isArray(profile.preferredGenres) ? profile.preferredGenres : [];
  const avoidedGenres = Array.isArray(profile.avoidedGenres) ? profile.avoidedGenres : [];
  const likedMovies = Array.isArray(profile.likedMovies) ? profile.likedMovies : [];
  const watchHistory = Array.isArray(profile.watchHistory) ? profile.watchHistory : [];
  const violenceTolerance = profile.violenceTolerance ?? "Not set";
  const durationPreference = profile.durationPreference ?? "Not set";

  return (
    <aside className="profile-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Personalization Layer</p>
          <h2>Your Taste Profile</h2>
        </div>
      </div>
      <div className="profile-identity">
        <div className="profile-avatar">{profileName.slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{profileName}</strong>
          <p>{profileEmail || "Live preference signals used by the ranking engine"}</p>
        </div>
      </div>
      <div className="profile-panel__group">
        <p className="profile-label">Preferred Genres</p>
        <div className="chip-list">
          {preferredGenres.map((genre) => (
            <span className="chip" key={genre}>
              {genre}
            </span>
          ))}
        </div>
      </div>
      <div className="profile-panel__group">
        <p className="profile-label">Avoided Genres</p>
        <div className="chip-list">
          {avoidedGenres.map((genre) => (
            <span className="chip chip--muted" key={genre}>
              {genre}
            </span>
          ))}
        </div>
      </div>
      <div className="profile-panel__stats">
        <div>
          <strong>{likedMovies.length}</strong>
          <span>Liked movies</span>
        </div>
        <div>
          <strong>{watchHistory.length}</strong>
          <span>Watch history</span>
        </div>
        <div>
          <strong>{violenceTolerance}</strong>
          <span>Violence tolerance</span>
        </div>
        <div>
          <strong>{profile.interactionCount ?? 0}</strong>
          <span>Tracked interactions</span>
        </div>
      </div>
      <div className="profile-summary">
        <div>
          <span>Ranking preference</span>
          <strong>{durationPreference}</strong>
        </div>
        <div>
          <span>Profile mode</span>
          <strong>Personalized</strong>
        </div>
      </div>
      {context?.recentSearches?.length > 0 && (
        <div className="profile-panel__group">
          <p className="profile-label">Recent Searches</p>
          <div className="chip-list">
            {context.recentSearches.map((query) => (
              <span className="chip" key={query}>
                {query}
              </span>
            ))}
          </div>
        </div>
      )}
      {context?.clickedMovies?.length > 0 && (
        <div className="profile-panel__group">
          <p className="profile-label">Recent Clicked Titles</p>
          <div className="chip-list">
            {context.clickedMovies.map((movie) => (
              <span className="chip chip--muted" key={movie.id}>
                {movie.title}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="profile-note">
        <span className="status-dot" />
        This panel is now refreshed from backend session, interaction, and profile functions.
      </div>
    </aside>
  );
}
