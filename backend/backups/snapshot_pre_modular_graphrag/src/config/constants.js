import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const palette = ['#ff7a45', '#6aa9ff', '#c78cff', '#69d8ff', '#f0b46e', '#94b9ff', '#ff9254', '#8fa5ff'];
export const demoUserId = 'demo-user';
// export const backendDemoUserId = process.env.FRONTEND_DEMO_BACKEND_USER_ID || '69ecf833b0155353548917c5';
export const backendDemoUserId = process.env.FRONTEND_DEMO_BACKEND_USER_ID ;
// export const backendDemoUserId = null;
export const sampleMoviesPath = path.join(__dirname, '..', '..', 'data', 'enriched_all_movies_final.json');
