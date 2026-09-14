import { getHomeCollections } from '../services/collectionService.js';
import { clean } from '../utils/helpers.js';
const demoUserId = 'demo-user';

export async function homeCollections(req, res) {
  const userId = req.user ? req.user._id.toString() : clean(req.query.userId) || demoUserId;
  const data = await getHomeCollections(userId);
  res.json(data);
}
