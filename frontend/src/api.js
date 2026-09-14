const configuredApiUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const API_ROOT = configuredApiUrl.endsWith("/api") ? configuredApiUrl.slice(0, -4) : configuredApiUrl;
const sessionStorageKey = "movie-intelligence-session";

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildApiUrl(path) {
  if (!configuredApiUrl) {
    return `/api${path}`;
  }

  return path.startsWith("/auth") ? `${API_ROOT}${path}` : `${API_ROOT}/api${path}`;
}

function readStoredSession() {
  try {
    const rawSession = window.localStorage.getItem(sessionStorageKey);
    return rawSession ? JSON.parse(rawSession) : null;
  } catch {
    return null;
  }
}

function getAuthToken() {
  const session = readStoredSession();
  return session?.token ?? session?.accessToken ?? session?.authToken ?? "";
}

async function fetchJson(path, options = {}) {
  const { auth, headers: customHeaders, ...requestOptions } = options;
  const authToken = getAuthToken();
  const headers = {
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
    ...customHeaders
  };

  const response = await fetch(buildApiUrl(path), {
    credentials: "include",
    ...requestOptions,
    headers
  });

  if (!response.ok) {
    const payload = await readResponsePayload(response);
    const message = payload.message;
    throw new ApiError(`Request failed with status ${response.status}${message ? `: ${message}` : ""}`, response.status, payload.body);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`Expected JSON but received ${contentType || "unknown content type"}: ${text.slice(0, 120)}`);
  }

  return response.json();
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text().catch(() => "");

  if (!text) {
    return { message: "", body: null };
  }

  if (!contentType.includes("application/json")) {
    return { message: text.slice(0, 120), body: text };
  }

  try {
    const payload = JSON.parse(text);
    return {
      message: payload.error || payload.message || text.slice(0, 120),
      body: payload
    };
  } catch {
    return { message: text.slice(0, 120), body: text };
  }
}

export function createUserSession(session) {
  const hasSessionPayload = session && Object.keys(session).length > 0;
  const explicitToken = session?.token;

  return fetchJson("/user/session", {
    method: "POST",
    headers: explicitToken ? { Authorization: `Bearer ${explicitToken}` } : {},
    ...(hasSessionPayload ? { body: JSON.stringify(session) } : {})
  });
}

export function loginUser(credentials) {
  return fetchJson("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials)
  });
}

export function registerUser(payload) {
  return fetchJson("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function trackInteraction(interaction) {
  return fetchJson("/interactions", {
    method: "POST",
    body: JSON.stringify(interaction)
  });
}

export function getHomeCollections() {
  return fetchJson("/collections/home");
}

export function getMovies() {
  return fetchJson("/movies");
}

export function getMoviesByGenre(genre, page = 1, limit = 20) {
  const params = new URLSearchParams({
    genre,
    page: String(page),
    limit: String(limit)
  });

  return fetchJson(`/movies/by-genre?${params.toString()}`);
}

export function getUserProfile() {
  return fetchJson("/user/profile");
}

export function getUserContext() {
  return fetchJson("/user/context");
}

export function askRecommendations(query, options = {}) {
  return fetchJson("/recommendations/query", {
    method: "POST",
    body: JSON.stringify({ 
      query,
      conversationHistory: options.conversationHistory || [],
      userId: options.userId || "demo-user",
      state: options.state || null
    })
  });
}

export function getSearchSuggestions(query) {
  return fetchJson(`/search/suggest?q=${encodeURIComponent(query)}`);
}

export function searchMovies(query) {
  return fetchJson(`/search/movies?q=${encodeURIComponent(query)}`);
}

export function getRecentlyWatched(userId) {
  return fetchJson(`/user/recently-watched/${encodeURIComponent(userId)}`, {
    auth: true
  });
}

export function recordRecentlyWatched(payload) {
  return fetchJson("/user/recently-watched", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export function updateMovieReaction(payload) {
  return fetchJson("/user/like", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload)
  });
}
