function FormFieldError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="form-field__error">{message}</p>;
}

export default function LoginView({
  loginForm,
  loginTouched,
  loginValidationErrors,
  loginError,
  loginLoading,
  isLoginValid,
  handleLoginChange,
  handleLoginSubmit,
  markLoginTouched,
  navigateTo
}) {
  return (
    <section className="login-page">
      <div className="login-page__content">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Member Access</p>
            <h2>Sign in to unlock your profile</h2>
          </div>
        </div>
        <p className="section-copy">
          Your profile stays hidden until you sign in. After login, the backend starts fetching user-specific rows, profile data, searches, and clicked-title history.
        </p>

        <div className="login-feature-list">
          <div className="login-feature-card">
            <span>Profile privacy</span>
            <strong>Your personal taste panel stays gated.</strong>
          </div>
          <div className="login-feature-card">
            <span>Tracked behavior</span>
            <strong>Searches and clicks now refresh user-specific data.</strong>
          </div>
          <div className="login-feature-card">
            <span>Backend functions</span>
            <strong>Session, context, and interaction APIs now power personalization.</strong>
          </div>
        </div>
      </div>

      <aside className="login-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Login</p>
            <h2>Welcome back</h2>
          </div>
        </div>

        <form className="login-form" onSubmit={handleLoginSubmit} noValidate>
          <label>
            <span>Name</span>
            <input name="name" type="text" value={loginForm.name} onChange={handleLoginChange} placeholder="Enter your name" />
          </label>
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              value={loginForm.email}
              onChange={handleLoginChange}
              onBlur={() => markLoginTouched("email")}
              placeholder="Enter your email"
            />
            <FormFieldError message={loginTouched.email ? loginValidationErrors.email : ""} />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              value={loginForm.password}
              onChange={handleLoginChange}
              onBlur={() => markLoginTouched("password")}
              placeholder="Enter your password"
            />
            <FormFieldError message={loginTouched.password ? loginValidationErrors.password : ""} />
          </label>

          {loginError && <div className="surface surface--error">{loginError}</div>}

          <button type="submit" disabled={!isLoginValid || loginLoading}>
            {loginLoading ? "Signing in..." : "Login and open profile"}
          </button>
        </form>

        <button className="inline-button inline-button--secondary auth-inline-link" onClick={() => navigateTo("/register")}>
          Need an account? Register
        </button>
      </aside>
    </section>
  );
}
