import express from 'express';
import { userSession, interactions, userProfile, userContext } from '../controllers/userController.js';
import { homeCollections } from '../controllers/collectionController.js';
import { recommend } from '../controllers/recommendationController.js';
import { authenticate } from '../middleware/auth.js';
import { guestRateLimiter } from '../middleware/rateLimiter.js';
import { register } from '../controllers/authController.js';
import { getAllMovies, getMovieById } from '../services/movieData.js';
import { searchMovies } from '../controllers/searchController.js';
import {
  addRecentlyWatched,
  getRecentlyWatched,
  likeOrDislike,
} from '../controllers/personalisationController.js';
import { getMoviesByGenre } from '../controllers/genreController.js';

// 🔥 Hackathon demo bypass – when BYPASS_AUTH=true, skip login and inject demo user
const hackathonBypass = (req, res, next) => {
  if (process.env.BYPASS_AUTH === 'true') {
    req.user = { _id: 'demo-user', role: 'user' };
    console.log('[BYPASS] Auth skipped – using demo user');
    return next();
  }
  return authenticate(req, res, next);
};

const router = express.Router();
const recommendLimiter = guestRateLimiter(60, 100);
router.get('/movies', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const movies = await getAllMovies(limit);
    res.json(movies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movies from graph' });
  }
});



// User session – needs to read cookies so authenticate runs first
router.post('/user/session', authenticate, userSession);
router.post('/interactions', authenticate, interactions);
router.get('/user/profile', authenticate, userProfile);
router.get('/user/context', authenticate, userContext);
router.get('/search/suggest', searchMovies);
router.get('/search/movies', searchMovies); // same as /search/suggest
router.get('/movies/by-genre', getMoviesByGenre);
router.post('/register', register);

router.get('/movies/:id', async (req, res) => {
  try {
    const movie = await getMovieById(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movie' });
  }
});



/**
 * @swagger
 * /api/collections/home:
 *   get:
 *     summary: Get homepage movie rows
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Optional user ID (default demo-user)
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hero: { type: object }
 *                 trending: { type: object }
 *                 topRated: { type: object }
 *                 action: { type: object }
 *                 comedy: { type: object }
 *                 drama: { type: object }
 *                 explore: { type: object }
 */
router.get('/collections/home', authenticate, homeCollections);

/**
 * @swagger
 * /api/recommendations/query:
 *   post:
 *     summary: Get movie recommendations from natural language query
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query: { type: string, example: "funny sci-fi movies" }
 *               userId: { type: string, example: "demo-user" }
 *     responses:
 *       200:
 *         description: List of recommended movies
 *       429:
 *         description: Rate limit exceeded (guests only)
 */
router.post('/recommendations/query', hackathonBypass,recommendLimiter, recommend);

// Personalisation
router.post('/user/recently-watched', authenticate, addRecentlyWatched);
router.get('/user/recently-watched', authenticate, getRecentlyWatched);
// Also support path with userId (frontend compatibility)
router.get('/user/recently-watched/:userId', authenticate, getRecentlyWatched);

router.post('/user/like', authenticate, likeOrDislike);

export default router;