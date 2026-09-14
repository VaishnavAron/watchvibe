/**
 * WatchVibe AI - Offline MovieLens 32M Co-Occurrence Processor
 * 
 * Purpose:
 * 1. Reads our 10,809 catalog movies from `enriched_all_movies_final.json`.
 * 2. Reads `links.csv` to map MovieLens movieId -> WatchVibe tmdbId.
 * 3. Streams `ratings.csv` (32M rows, 877MB) line-by-line without loading into RAM.
 * 4. Filters for genuine positive ratings (rating >= 4.0).
 * 5. Computes pairwise co-occurrences with normalized Cosine/Jaccard weights.
 * 6. Keeps the Top 12 strongest co-watched movies for each film (under 130k edges total).
 * 7. Exports `backend/data/movielens_cooccurrences.json`.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ==========================================
// Configuration & Paths
// ==========================================
const CATALOG_PATH = path.join(__dirname, '../data/enriched_all_movies_final.json');
const MOVIELENS_DIR = path.join(__dirname, '../data/movielens/ml-32m');
const LINKS_CSV = path.join(MOVIELENS_DIR, 'links.csv');
const RATINGS_CSV = path.join(MOVIELENS_DIR, 'ratings.csv');
const OUTPUT_JSON = path.join(__dirname, '../data/movielens_cooccurrences.json');

const MIN_RATING = 4.0;             // Only consider genuine positive ratings
const MAX_COWATCHED_PER_MOVIE = 12; // Top 12 neighbors (strictly under Neo4j free limits)
const MAX_USER_LIKES_CAP = 50;      // Cap per user to prevent mega-users from skewing stats

async function run() {
    console.log('====================================================');
    console.log('  WatchVibe: MovieLens 32M Stream Processor');
    console.log('====================================================\n');

    // --------------------------------------------------
    // Step 1: Load WatchVibe 10,809 Catalog Movies
    // --------------------------------------------------
    console.log('Step 1: Loading WatchVibe movie catalog...');
    if (!fs.existsSync(CATALOG_PATH)) {
        throw new Error(`Catalog not found at: ${CATALOG_PATH}`);
    }

    const catalogRaw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const catalogTmdbSet = new Set();
    const catalogTitleMap = new Map(); // tmdbId -> title

    for (const item of catalogRaw) {
        if (item.movie && item.movie.id) {
            const tmdbId = Number(item.movie.id);
            catalogTmdbSet.add(tmdbId);
            catalogTitleMap.set(tmdbId, item.movie.title || 'Untitled');
        }
    }
    console.log(`Loaded ${catalogTmdbSet.size} unique movies from WatchVibe catalog.\n`);

    // --------------------------------------------------
    // Step 2: Map MovieLens movieId -> WatchVibe tmdbId
    // --------------------------------------------------
    console.log('Step 2: Parsing links.csv to map MovieLens IDs...');
    if (!fs.existsSync(LINKS_CSV)) {
        throw new Error(`links.csv not found at: ${LINKS_CSV}`);
    }

    // mlMovieId -> tmdbId
    const mlToTmdbMap = new Map();
    const linksStream = readline.createInterface({
        input: fs.createReadStream(LINKS_CSV, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    let linksHeader = true;
    for await (const line of linksStream) {
        if (linksHeader) {
            linksHeader = false;
            continue;
        }
        // Format: movieId,imdbId,tmdbId
        const parts = line.split(',');
        if (parts.length >= 3) {
            const mlMovieId = parseInt(parts[0], 10);
            const tmdbId = parseInt(parts[2], 10);

            if (!isNaN(mlMovieId) && !isNaN(tmdbId) && catalogTmdbSet.has(tmdbId)) {
                mlToTmdbMap.set(mlMovieId, tmdbId);
            }
        }
    }

    console.log(`Successfully mapped ${mlToTmdbMap.size} MovieLens movies directly to our catalog.\n`);

    // --------------------------------------------------
    // Step 3: Stream ratings.csv & Accumulate Co-Occurrences
    // --------------------------------------------------
    console.log('Step 3: Streaming ratings.csv (32 Million rows)...');
    console.log(`Filtering: rating >= ${MIN_RATING}, movies in our catalog.`);

    // Data structures for counting:
    // movieWatchCounts: tmdbId -> total positive rating count
    const movieWatchCounts = new Map();
    // coOccurrenceMap: tmdbIdA -> Map(tmdbIdB -> count)
    const coOccurrenceMap = new Map();

    const ratingsStream = readline.createInterface({
        input: fs.createReadStream(RATINGS_CSV, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    let totalRows = 0;
    let retainedRatings = 0;
    let currentUser = null;
    let currentUserLikedMovies = [];

    const startTime = Date.now();

    function processUserBatch(likedMovies) {
        if (likedMovies.length < 2) return;

        // If user liked more than 50 movies, take a representative slice to avoid N^2 explosion
        const sample = likedMovies.length > MAX_USER_LIKES_CAP 
            ? likedMovies.slice(0, MAX_USER_LIKES_CAP) 
            : likedMovies;

        for (let i = 0; i < sample.length; i++) {
            const movieA = sample[i];
            let neighborMap = coOccurrenceMap.get(movieA);
            if (!neighborMap) {
                neighborMap = new Map();
                coOccurrenceMap.set(movieA, neighborMap);
            }

            for (let j = 0; j < sample.length; j++) {
                if (i === j) continue;
                const movieB = sample[j];
                const currentCount = neighborMap.get(movieB) || 0;
                neighborMap.set(movieB, currentCount + 1);
            }
        }
    }

    let isHeader = true;
    for await (const line of ratingsStream) {
        totalRows++;
        if (isHeader) {
            isHeader = false;
            continue;
        }

        // Fast parsing without regex
        // Line format: userId,movieId,rating,timestamp
        const comma1 = line.indexOf(',');
        const comma2 = line.indexOf(',', comma1 + 1);
        const comma3 = line.indexOf(',', comma2 + 1);

        const userId = parseInt(line.slice(0, comma1), 10);
        const mlMovieId = parseInt(line.slice(comma1 + 1, comma2), 10);
        const rating = parseFloat(line.slice(comma2 + 1, comma3));

        // Check if rating is a genuine like and movie is in our catalog
        if (rating >= MIN_RATING) {
            const tmdbId = mlToTmdbMap.get(mlMovieId);
            if (tmdbId !== undefined) {
                retainedRatings++;
                movieWatchCounts.set(tmdbId, (movieWatchCounts.get(tmdbId) || 0) + 1);

                if (userId === currentUser) {
                    currentUserLikedMovies.push(tmdbId);
                } else {
                    if (currentUser !== null) {
                        processUserBatch(currentUserLikedMovies);
                    }
                    currentUser = userId;
                    currentUserLikedMovies = [tmdbId];
                }
            }
        }

        // Progress logging every 4,000,000 lines
        if (totalRows % 4000000 === 0) {
            const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`  Processed ${(totalRows / 1000000).toFixed(0)}M rows (${elapsedSec}s elapsed)... Retained likes: ${retainedRatings}`);
        }
    }

    // Process last user in the file
    if (currentUserLikedMovies.length > 0) {
        processUserBatch(currentUserLikedMovies);
    }

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Finished streaming ${totalRows} rows in ${totalSeconds}s! Total retained likes: ${retainedRatings}\n`);

    // --------------------------------------------------
    // Step 4: Calculate Normalized Scores & Select Top K
    // --------------------------------------------------
    console.log(`Step 4: Computing normalized co-occurrence scores (Top ${MAX_COWATCHED_PER_MOVIE} per movie)...`);

    const finalGraph = {};
    let totalEdgesCreated = 0;

    for (const [movieA, neighbors] of coOccurrenceMap.entries()) {
        const countA = movieWatchCounts.get(movieA) || 1;
        const scoredNeighbors = [];

        for (const [movieB, coWatchCount] of neighbors.entries()) {
            if (coWatchCount < 3) continue; // Filter out random noise (minimum 3 co-watches)

            const countB = movieWatchCounts.get(movieB) || 1;
            // Cosine similarity: coWatch / sqrt(countA * countB)
            const cosineScore = coWatchCount / Math.sqrt(countA * countB);

            scoredNeighbors.push({
                tmdbId: movieB,
                title: catalogTitleMap.get(movieB) || 'Unknown',
                coWatchCount: coWatchCount,
                weight: parseFloat(cosineScore.toFixed(4))
            });
        }

        // Sort descending by weight, take Top K
        scoredNeighbors.sort((a, b) => b.weight - a.weight);
        const topNeighbors = scoredNeighbors.slice(0, MAX_COWATCHED_PER_MOVIE);

        if (topNeighbors.length > 0) {
            finalGraph[movieA] = {
                title: catalogTitleMap.get(movieA) || 'Unknown',
                watchCount: countA,
                coWatched: topNeighbors
            };
            totalEdgesCreated += topNeighbors.length;
        }
    }

    console.log(`Generated graph with ${Object.keys(finalGraph).length} movie nodes and ${totalEdgesCreated} collaborative edges.`);
    console.log(`Strict resource check: ${totalEdgesCreated} relationships << 400,000 Neo4j free limit.\n`);

    // --------------------------------------------------
    // Step 5: Save to Clean JSON
    // --------------------------------------------------
    console.log(`Step 5: Writing results to ${OUTPUT_JSON}...`);
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalGraph, null, 2), 'utf8');

    const outputStats = fs.statSync(OUTPUT_JSON);
    const fileSizeMB = (outputStats.size / (1024 * 1024)).toFixed(2);
    console.log(`Success! File size: ${fileSizeMB} MB`);
    console.log('Phase 1 completed successfully!\n');
}

run().catch(err => {
    console.error('Error during MovieLens processing:', err);
    process.exit(1);
});
