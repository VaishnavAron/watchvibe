import { ApiError } from "../api";

export const sessionStorageKey = "movie-intelligence-session";
export const guestQueryStorageKey = "movie-intelligence-guest-queries";
export const recentSearchesStorageKey = "movie-intelligence-recent-searches";
export const guestQueryLimit = 5;
export const defaultRateLimitCountdown = 30;

export function isValidObjectId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

export function readCurrentRoute() {
  return {
    pathname: window.location.pathname,
    search: window.location.search
  };
}

export function resolveViewFromPath(pathname) {
  if (pathname === "/") {
    return "landing";
  }

  if (pathname === "/discover" || pathname === "/catalog") {
    return "discover";
  }

  if (pathname === "/studio" || pathname === "/copilot") {
    return "studio";
  }

  if (pathname === "/search") {
    return "search";
  }

  if (pathname === "/profile") {
    return "profile";
  }

  if (pathname === "/login") {
    return "login";
  }

  if (pathname === "/register") {
    return "register";
  }

  if (pathname.startsWith("/genre/")) {
    return "genre";
  }

  if (pathname.startsWith("/movie/")) {
    return "movie";
  }

  return "discover";
}

export function decodeRouteSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normalizeSearchSuggestions(payload) {
  const rawSuggestions = Array.isArray(payload)
    ? payload
    : payload?.suggestions ?? payload?.results ?? payload?.items ?? payload?.data ?? [];

  if (!Array.isArray(rawSuggestions)) {
    return [];
  }

  return rawSuggestions
    .map((entry, index) => {
      if (typeof entry === "string") {
        return {
          id: `${entry}-${index}`,
          label: entry,
          value: entry
        };
      }

      const label = entry?.title || entry?.name || entry?.label || entry?.query || entry?.value || "";

      return label
        ? {
            id: entry?.id ?? `${label}-${index}`,
            label,
            value: label
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 8);
}

export function getSessionUserId(session) {
  const candidate = session?.userId ?? session?.id ?? session?._id ?? session?.user?.id ?? session?.user?.userId ?? "";
  if (isValidObjectId(candidate)) return candidate;
  return null;
}

export function getMovieId(value) {
  return value?.movieId ?? value?.id ?? value?._id ?? value;
}

// export function normalizeSessionUser(session) {
//   if (!session) {
//     return null;
//   }

//   const normalizedName =
//     (typeof session.name === "string" && session.name.trim()) ||
//     (typeof session.user?.name === "string" && session.user.name.trim()) ||
//     "";
//   const normalizedEmail =
//     (typeof session.email === "string" && session.email.trim()) ||
//     (typeof session.user?.email === "string" && session.user.email.trim()) ||
//     "";

//   return {
//     ...session,
//     name: normalizedName,
//     email: normalizedEmail,
//     userId: getSessionUserId(session)
//   };
// }

export function normalizeSessionUser(session) {
  if (!session) return null;
  const userId = getSessionUserId(session);
  return {
    ...session,
    name: session.name?.trim() || session.user?.name?.trim() || "",
    email: session.email?.trim() || session.user?.email?.trim() || "",
    userId: userId // ensure we use the validated ID (could be null)
  };
}

export function readStoredJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function sanitizeRecentSearches(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

export function mergeUniqueLabels(entries) {
  const seen = new Set();

  return entries.filter((entry) => {
    const normalized = entry.label.toLowerCase();

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateLoginForm(form) {
  const errors = {};

  if (!form.email.trim()) {
    errors.email = "Enter your email address.";
  } else if (!validateEmail(form.email.trim().toLowerCase())) {
    errors.email = "Use a valid email format.";
  }

  if (!form.password.trim()) {
    errors.password = "Enter your password.";
  } else if (form.password.trim().length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  return errors;
}

export function validateRegisterForm(form) {
  const errors = {};
  const trimmedName = form.name.trim();
  const normalizedEmail = form.email.trim().toLowerCase();
  const password = form.password.trim();
  const confirmPassword = form.confirmPassword.trim();
  const age = Number(form.age);

  if (!trimmedName) {
    errors.name = "Enter your full name.";
  }

  if (!normalizedEmail) {
    errors.email = "Enter your email address.";
  } else if (!validateEmail(normalizedEmail)) {
    errors.email = "Use a valid email format.";
  }

  if (!password) {
    errors.password = "Create a password.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Confirm your password.";
  } else if (confirmPassword !== password) {
    errors.confirmPassword = "Password and confirm password must match.";
  }

  if (!form.age) {
    errors.age = "Enter your age.";
  } else if (Number.isNaN(age) || age < 13 || age > 100) {
    errors.age = "Age must be between 13 and 100.";
  }

  if (!form.gender) {
    errors.gender = "Select a gender option.";
  }

  return errors;
}

export function getFriendlyApiMessage(error) {
  if (error instanceof ApiError) {
    return error.payload?.message || error.payload?.error || error.message || "The server could not complete this request.";
  }

  if (error instanceof TypeError) {
    return "Can't reach the server right now. Please check the backend or tunnel and try again.";
  }

  return error?.message || "Something went wrong. Please try again.";
}
