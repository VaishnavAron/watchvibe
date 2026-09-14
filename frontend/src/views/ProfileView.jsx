import MovieRow from "../components/MovieRow";
import PreferencePanel from "../components/PreferencePanel";

export default function ProfileView({
  loadingProfile,
  currentUser,
  profile,
  userContext,
  likedMoviesForRow,
  likedMovieIds,
  handleMovieReference,
  handleMovieLike,
  handleMovieDislike,
  openLoginPrompt,
  handleMovieSelect,
  handleLogout,
  navigateTo
}) {
  return (
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
  );
}
