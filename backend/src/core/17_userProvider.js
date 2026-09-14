// 17_userProvider.js

async function getUserModel() {
  try {
    const module = await import('../models/userSchema.js');
    return module.User;
  } catch (err) {
    console.error('User profile database unavailable:', err.message);
    return null;
  }
}

export async function getUserProfile(userId) {
  const User = await getUserModel();
  if (!User) return null;

  const user = await User.findById(userId);
  if (!user) return null;

  const watchedKeys = new Set((user.watchedMovies || []).map(m => m.movieKey));
  const dislikedKeys = new Set((user.watchedMovies || []).filter(m => m.disliked).map(m => m.movieKey));
  const name = user.name || `${user.first_name} ${user.last_name}`.trim() || user.emailid;

  return {
    id: user._id.toString(),
    name,
    favoriteGenres: user.favoriteGenres || [],
    favoriteActors: user.favoriteActors || [],
    watchedKeys,
    dislikedKeys,
    searchHistory: user.searchHistory || []
  };
}

export async function addWatchedMovie(userId, movieKey, rating, liked, disliked, skipped) {
  const User = await getUserModel();
  if (!User) return;

  await User.findByIdAndUpdate(userId, {
    $push: { watchedMovies: { movieKey, rating, liked, disliked, skipped, timestamp: new Date() } }
  });
}

export async function recordSearch(userId, keyword) {
  const User = await getUserModel();
  if (!User) return;

  await User.findOneAndUpdate(
    { _id: userId, 'searchHistory.keyword': keyword },
    { $inc: { 'searchHistory.$.frequency': 1 }, $set: { 'searchHistory.$.lastUsed': new Date() } },
    { upsert: true }
  );
}
