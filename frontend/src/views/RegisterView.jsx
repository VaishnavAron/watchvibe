import { genderOptions } from "../constants";

function FormFieldError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="form-field__error">{message}</p>;
}

export default function RegisterView({
  registerForm,
  registerTouched,
  registerValidationErrors,
  registerError,
  registerLoading,
  isRegisterValid,
  handleRegisterChange,
  handleRegisterSubmit,
  markRegisterTouched,
  navigateTo,
  setRegisterForm,
  setRegisterError
}) {
  return (
    <section className="login-page">
      <div className="login-page__content">
        <div className="section-heading">
          <div>
            <p className="section-kicker">New Member</p>
            <h2>Create your register profile</h2>
          </div>
        </div>
        <p className="section-copy">
          Register once to start saving your identity in the app, unlock personalized rows, and keep your recommendation history connected to your account.
        </p>

        <div className="login-feature-list">
          <div className="login-feature-card">
            <span>Quick setup</span>
            <strong>Create your access profile in one short step.</strong>
          </div>
          <div className="login-feature-card">
            <span>Personalized rows</span>
            <strong>New sessions can immediately power user-specific discovery.</strong>
          </div>
          <div className="login-feature-card">
            <span>Seamless handoff</span>
            <strong>After registration, you go straight into your profile view.</strong>
          </div>
        </div>
      </div>

      <aside className="login-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Register</p>
            <h2>Create account</h2>
          </div>
        </div>

        <form className="login-form" onSubmit={handleRegisterSubmit} noValidate>
          <label>
            <span>Name</span>
            <input
              name="name"
              type="text"
              value={registerForm.name}
              onChange={handleRegisterChange}
              onBlur={() => markRegisterTouched("name")}
              placeholder="Enter your name"
            />
            <FormFieldError message={registerTouched.name ? registerValidationErrors.name : ""} />
          </label>
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              value={registerForm.email}
              onChange={handleRegisterChange}
              onBlur={() => markRegisterTouched("email")}
              placeholder="Enter your email"
            />
            <FormFieldError message={registerTouched.email ? registerValidationErrors.email : ""} />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              value={registerForm.password}
              onChange={handleRegisterChange}
              onBlur={() => markRegisterTouched("password")}
              placeholder="Create a password"
            />
            <FormFieldError message={registerTouched.password ? registerValidationErrors.password : ""} />
          </label>
          <label>
            <span>Confirm Password</span>
            <input
              name="confirmPassword"
              type="password"
              value={registerForm.confirmPassword}
              onChange={handleRegisterChange}
              onBlur={() => markRegisterTouched("confirmPassword")}
              placeholder="Confirm your password"
            />
            <FormFieldError message={registerTouched.confirmPassword ? registerValidationErrors.confirmPassword : ""} />
          </label>
          <label>
            <span>Age</span>
            <input
              name="age"
              type="number"
              min="13"
              max="100"
              value={registerForm.age}
              onChange={handleRegisterChange}
              onBlur={() => markRegisterTouched("age")}
              placeholder="Your age"
            />
            <FormFieldError message={registerTouched.age ? registerValidationErrors.age : ""} />
          </label>

          <div className="gender-fieldset">
            <span>Gender</span>
            <div className="gender-options">
              {genderOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={registerForm.gender === option ? "gender-option gender-option--selected" : "gender-option"}
                  onClick={() => {
                    setRegisterForm((currentForm) => ({ ...currentForm, gender: option }));
                    markRegisterTouched("gender");
                    setRegisterError("");
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
            <FormFieldError message={registerTouched.gender ? registerValidationErrors.gender : ""} />
          </div>

          {registerError && <div className="surface surface--error">{registerError}</div>}

          <button type="submit" disabled={!isRegisterValid || registerLoading}>
            {registerLoading ? "Creating account..." : "Register and open profile"}
          </button>
        </form>

        <button className="inline-button inline-button--secondary auth-inline-link" onClick={() => navigateTo("/login")}>
          Already have an account? Login
        </button>
      </aside>
    </section>
  );
}
