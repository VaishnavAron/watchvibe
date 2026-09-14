import { createSession, getUserProfilePayload, getUserContextPayload, ensureInteractionState } from '../services/userService.js';
import { clean } from '../utils/helpers.js';
import { User } from '../models/userSchema.js';

const demoUserId = 'demo-user';

export async function userSession(req, res) {
  let userId, name, email;
  if (req.user) {
    userId = req.user._id.toString();
    name = req.user.name || `${req.user.first_name} ${req.user.last_name || ''}`;
    email = req.user.emailid;
  } else {
    userId = demoUserId;
    name = req.body.name || 'Demo User';
    email = req.body.email || '';
  }
  const session = createSession(userId, name, email);
  const context = await getUserContextPayload(userId);
  res.json({
    session,
    profile: context.profile,
    context
  });
}

export async function interactions(req, res) {
  const userId = req.user ? req.user._id.toString() : clean(req.body.userId) || demoUserId;
  const state = ensureInteractionState(userId);
  const query = clean(req.body.query);
  const movieId = clean(req.body.movieId);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    type: clean(req.body.type) || 'interaction',
    query: query || null,
    movieId: movieId || null,
    source: clean(req.body.source) || 'frontend',
    metadata: req.body.metadata || {},
    timestamp: new Date().toISOString()
  };
  state.recentInteractions = [entry, ...state.recentInteractions].slice(0,20);
  if (query) {
    state.recentSearches = [...new Set([query, ...state.recentSearches])].slice(0,8);
  }
  if (movieId) {
    state.clickedMovieIds = [...new Set([movieId, ...state.clickedMovieIds])].slice(0,10);
  }

  // Cold-start preferences: store in database
if (entry.type === 'cold_start_preferences') {
  const genres = entry.metadata?.selectedGenres || [];
  const themes = entry.metadata?.selectedThemes || [];
  if (genres.length || themes.length) {
    try {
      await User.findByIdAndUpdate(userId, {
        $addToSet: { favoriteGenres: { $each: genres }, favoriteThemes: { $each: themes } }
      });
      console.log(`[COLD-START] Saved preferences for user ${userId}`);
    } catch (err) {
      console.error('[COLD-START] Failed to save preferences:', err);
    }
  }
}


  res.json(await getUserContextPayload(userId));
}

// 👇 Add async and await
export async function userProfile(req, res) {
  const userId = req.user ? req.user._id.toString() : clean(req.query.userId) || demoUserId;
  const profile = await getUserProfilePayload(userId);
  res.json(profile);
}

export async function userContext(req, res) {
  const userId = req.user ? req.user._id.toString() : clean(req.query.userId) || demoUserId;
  res.json(await getUserContextPayload(userId));
}
