import { useEffect, useMemo, useState } from "react";
import { createUserSession, getHomeCollections, getUserProfile, loginUser, registerUser, trackInteraction } from "../api";
import {
  getFriendlyApiMessage,
  getSessionUserId,
  normalizeSessionUser,
  sessionStorageKey,
  validateLoginForm,
  validateRegisterForm
} from "../utils/helpers";

export default function useAuth({
  navigateTo,
  pushToast,
  refreshUserData,
  refreshRecentlyWatchedFromBackend,
  buildProfileState,
  setCollections,
  setProfile,
  setUserContext,
  setRecentlyWatchedMovies,
  setShowLoginPrompt
}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ name: "", email: "", password: "" });
  const [loginTouched, setLoginTouched] = useState({});
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", confirmPassword: "", age: "", gender: "" });
  const [registerTouched, setRegisterTouched] = useState({});
  const [registerError, setRegisterError] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [showColdStart, setShowColdStart] = useState(false);
  const [coldStartSelections, setColdStartSelections] = useState({ genres: [], themes: [] });
  const [coldStartLoading, setColdStartLoading] = useState(false);

  const loginValidationErrors = useMemo(() => validateLoginForm(loginForm), [loginForm]);
  const registerValidationErrors = useMemo(() => validateRegisterForm(registerForm), [registerForm]);
  const isLoginValid = Object.keys(loginValidationErrors).length === 0;
  const isRegisterValid = Object.keys(registerValidationErrors).length === 0;

  useEffect(() => {
    const savedSession = window.localStorage.getItem(sessionStorageKey);
    if (savedSession) {
      try {
        setCurrentUser(normalizeSessionUser(JSON.parse(savedSession)));
      } catch {
        window.localStorage.removeItem(sessionStorageKey);
      }
    }
  }, []);

  function markLoginTouched(name) { setLoginTouched(prev => ({ ...prev, [name]: true })); }
  function markRegisterTouched(name) { setRegisterTouched(prev => ({ ...prev, [name]: true })); }
  function handleLoginChange(e) { const { name, value } = e.target; setLoginForm(prev => ({ ...prev, [name]: value })); setLoginError(""); }
  function handleRegisterChange(e) { const { name, value } = e.target; setRegisterForm(prev => ({ ...prev, [name]: value })); setRegisterError(""); }
  function toggleColdStartSelection(group, value) {
    setColdStartSelections(prev => {
      const current = prev[group];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [group]: next };
    });
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setLoginTouched({ email: true, password: true });
    if (!isLoginValid) { setLoginError("Fix fields."); return; }
    const normalizedEmail = loginForm.email.trim().toLowerCase();
    const trimmedPassword = loginForm.password.trim();
    try {
      setLoginLoading(true);
      const loginRes = await loginUser({ email: normalizedEmail, password: trimmedPassword });
      const sessionData = await createUserSession(loginRes?.token ? { token: loginRes.token } : undefined);
      const normalizedSession = normalizeSessionUser(sessionData?.session || loginRes?.user);
      if (loginRes?.token) {
        normalizedSession.token = loginRes.token;
      }
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(normalizedSession));
      setCurrentUser(normalizedSession);
      setProfile(null);
      setUserContext(null);
      setShowLoginPrompt(false);
      setLoginForm(prev => ({ ...prev, password: "" }));
      setLoginError("");
      navigateTo("/profile");
      await refreshUserData(getSessionUserId(normalizedSession), { includeProfile: true, sessionUser: normalizedSession });
      await refreshRecentlyWatchedFromBackend(normalizedSession);
      pushToast("success", "Welcome back", "Your personalized profile is ready.");
    } catch (err) {
      setLoginError(getFriendlyApiMessage(err));
      pushToast("info", "Login unavailable", getFriendlyApiMessage(err));
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    setRegisterTouched({ name: true, email: true, password: true, confirmPassword: true, age: true, gender: true });
    if (!isRegisterValid) { setRegisterError("Fix fields."); return; }
    const trimmedName = registerForm.name.trim();
    const normalizedEmail = registerForm.email.trim().toLowerCase();
    const trimmedPassword = registerForm.password.trim();
    const nextSession = {
      name: trimmedName,
      email: normalizedEmail,
      password: trimmedPassword,
      age: Number(registerForm.age),
      gender: registerForm.gender
    };
    try {
      setRegisterLoading(true);
      const regRes = await registerUser(nextSession);
      const loginRes = await loginUser({ email: normalizedEmail, password: trimmedPassword });
      const sessionToken = loginRes?.token || regRes?.token;
      const sessionData = await createUserSession(sessionToken ? { token: sessionToken } : undefined);
      const normalizedSession = normalizeSessionUser(sessionData?.session || loginRes?.user || regRes?.user);
      if (sessionToken) {
        normalizedSession.token = sessionToken;
      }
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(normalizedSession));
      setCurrentUser(normalizedSession);
      setProfile(null);
      setUserContext(null);
      setShowLoginPrompt(false);
      setRegisterForm({ name: "", email: "", password: "", confirmPassword: "", age: "", gender: "" });
      setRegisterTouched({});
      setLoginForm({ name: "", email: normalizedEmail, password: "" });
      setRegisterError("");
      setLoginError("");
      navigateTo("/register", { scroll: false });
      setShowColdStart(true);
      pushToast("success", "Account created", "Tell us about your taste.");
    } catch (err) {
      const message = err instanceof TypeError ? getFriendlyApiMessage(err) : "Registration failed.";
      setRegisterError(message);
      pushToast("info", "Registration unavailable", message);
    } finally {
      setRegisterLoading(false);
    }
  }

  async function handleColdStartContinue() {
    console.log("[COLDSTART] Starting...");
    if (!currentUser) {
      setShowColdStart(false);
      navigateTo("/profile");
      return;
    }
    setColdStartLoading(true);
    try {
      const userId = getSessionUserId(currentUser);
      const selectedGenres = coldStartSelections.genres;
      console.log("[COLDSTART] Genres:", selectedGenres);
      // Save flag and genres for the home data override
      if (selectedGenres.length) {
        localStorage.setItem('cold-start-active', 'true');
        localStorage.setItem('cold-start-genres', JSON.stringify(selectedGenres));
      }
      // Save preferences to backend (if userId valid)
      if ((selectedGenres.length || coldStartSelections.themes.length) && userId) {
        await trackInteraction({
          userId,
          type: "cold_start_preferences",
          source: "register-onboarding",
          genres: selectedGenres,
          themes: coldStartSelections.themes,
          metadata: { selectedGenres, selectedThemes: coldStartSelections.themes }
        });
      }
      // Fetch home data (we will override the row manually)
      const [homeData, profileData] = await Promise.all([getHomeCollections(), getUserProfile()]);
      console.log("[COLDSTART] homeData.becauseYouWatched originally:", homeData.becauseYouWatched?.title);
      // Create custom row
      let customRow = null;
      if (selectedGenres.length) {
        try {
          const { askRecommendations } = await import('../api');
          const response = await askRecommendations(`recommend movies from genres: ${selectedGenres.join(', ')}`);
          const movies = response.results || [];
          if (movies.length) {
            customRow = {
              key: "because-you-watched",
              title: "🔥 BECAUSE YOU CHOSE 🔥",
              subtitle: `Movies based on your selected genres: ${selectedGenres.join(', ')}`,
              movies: movies.slice(0, 10)
            };
            console.log("[COLDSTART] Created custom row with", movies.length, "movies");
          }
        } catch (e) { console.warn(e); }
      }
      // Override the homeData.becauseYouWatched if custom row exists
      if (customRow) {
        homeData.becauseYouWatched = customRow;
      }
      // Update all state
      setCollections(homeData);
      setProfile(buildProfileState(profileData, currentUser));
      setRecentlyWatchedMovies([]);
      await refreshRecentlyWatchedFromBackend(currentUser); // ensures empty
      setShowColdStart(false);
      setColdStartSelections({ genres: [], themes: [] });
      // Navigate to Discover to see the custom row immediately
      navigateTo("/discover");
      console.log("[COLDSTART] Finished, custom row should be visible now.");
    } catch (err) {
      console.error("[COLDSTART] Error:", err);
      setRegisterError(getFriendlyApiMessage(err));
      pushToast("info", "Preferences not saved", getFriendlyApiMessage(err));
    } finally {
      setColdStartLoading(false);
    }
  }

  function handleColdStartSkip() {
    setShowColdStart(false);
    navigateTo("/profile");
  }

  function handleLogout() {
    window.localStorage.removeItem(sessionStorageKey);
    window.localStorage.removeItem('cold-start-active');
    window.localStorage.removeItem('cold-start-genres');
    setCurrentUser(null);
    setProfile(null);
    setUserContext(null);
    setRecentlyWatchedMovies([]);
    setShowLoginPrompt(false);
    setLoginError("");
    setLoginTouched({});
    setLoginForm({ name: "", email: "", password: "" });
    setRegisterForm({ name: "", email: "", password: "", confirmPassword: "", age: "", gender: "" });
    setRegisterTouched({});
    setRegisterError("");
    setShowColdStart(false);
    setColdStartSelections({ genres: [], themes: [] });
    navigateTo("/discover");
    pushToast("success", "Logged out", "See you later!");
  }

  return {
    currentUser,
    showColdStart,
    coldStartSelections,
    coldStartLoading,
    registerForm,
    registerTouched,
    registerError,
    registerLoading,
    loginForm,
    loginTouched,
    loginError,
    loginLoading,
    loginValidationErrors,
    registerValidationErrors,
    isLoginValid,
    isRegisterValid,
    setRegisterForm,
    setRegisterError,
    handleLoginChange,
    handleRegisterChange,
    handleLoginSubmit,
    handleRegisterSubmit,
    handleColdStartContinue,
    handleColdStartSkip,
    toggleColdStartSelection,
    handleLogout,
    markLoginTouched,
    markRegisterTouched
  };
}