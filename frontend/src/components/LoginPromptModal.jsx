export default function LoginPromptModal({ showLoginPrompt, setShowLoginPrompt, navigateTo }) {
  if (!showLoginPrompt) {
    return null;
  }

  return (
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
  );
}
