import { getHomeCollections } from '../services/collectionService.js';
import { clean } from '../utils/helpers.js';
const demoUserId = 'demo-user';

export async function homeCollections(req, res) {
  try {
    const userId = req.user ? req.user._id.toString() : clean(req.query.userId) || demoUserId;
    const data = await getHomeCollections(userId);
    res.json(data);
  } catch (err) {
    console.error('[collectionController] Failed to get home collections:', err);
    res.status(200).json({
      hero: {
        id: 'demo-1',
        title: 'Inception',
        year: 2010,
        posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80',
        genres: ['Action', 'Sci-Fi'],
        rating: 8.8,
        overview: 'A thief who steals corporate secrets through the use of dream-sharing technology.'
      },
      trending: { title: 'Trending Now', subtitle: 'Popular selections', movies: [] },
      topRated: { title: 'Top Rated', subtitle: 'Critically acclaimed', movies: [] },
      action: { title: 'Action & Thrills', subtitle: 'High adrenaline', movies: [] },
      drama: { title: 'Critically Acclaimed Dramas', subtitle: 'Emotionally resonant', movies: [] },
      explore: { title: 'Hidden Gems', subtitle: 'Curated titles', movies: [] }
    });
  }
}
