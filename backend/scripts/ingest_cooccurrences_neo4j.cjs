/**
 * WatchVibe AI - Secondary Neo4j Co-Occurrence Ingestion
 * 
 * Target: WatchVibe Co-Ocurrence (2nd Neo4j Aura Instance)
 * URI: neo4j+s://8e7df96c.databases.neo4j.io
 * 
 * Safety Limits:
 * - Free tier allows up to 200k nodes, 400k relationships.
 * - This script ingests ~9,500 nodes and ~110,000 CO_WATCHED edges (well below limits).
 */

const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');

const COOCCURRENCE_JSON = path.join(__dirname, '../data/movielens_cooccurrences.json');

const NEO4J_URI = process.env.NEO4J_COOCCURRENCE_URI || 'neo4j+s://8e7df96c.databases.neo4j.io';
const NEO4J_USER = process.env.NEO4J_COOCCURRENCE_USER || '8e7df96c';
const NEO4J_PASS = process.env.NEO4J_COOCCURRENCE_PASS || 'HS99JVFWv7Di3SYELZqiMUs8Vu9ioEnJNQkY9WBYTiI';

async function ingest() {
    console.log('====================================================');
    console.log('  WatchVibe: Secondary Neo4j Ingestion');
    console.log('====================================================\n');

    if (!fs.existsSync(COOCCURRENCE_JSON)) {
        throw new Error(`Co-occurrence file not found: ${COOCCURRENCE_JSON}`);
    }

    console.log('Loading co-occurrence data...');
    const data = JSON.parse(fs.readFileSync(COOCCURRENCE_JSON, 'utf8'));
    const sourceIds = Object.keys(data);
    console.log(`Loaded ${sourceIds.length} movie records from JSON.\n`);

    const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    const session = driver.session();

    try {
        // --------------------------------------------------
        // Step 1: Create Index / Constraints
        // --------------------------------------------------
        console.log('Step 1: Setting up indexes & constraints in secondary Neo4j...');
        try {
            await session.run('CREATE CONSTRAINT movie_tmdb_unique IF NOT EXISTS FOR (m:Movie) REQUIRE m.tmdbId IS UNIQUE');
            console.log('  Constraint created: (m:Movie).tmdbId IS UNIQUE');
        } catch (e) {
            console.log('  Notice on constraint creation:', e.message);
        }

        // --------------------------------------------------
        // Step 2: Ingest Movie Nodes in Batches
        // --------------------------------------------------
        console.log('\nStep 2: Ingesting Movie nodes...');
        const nodesBatch = [];
        for (const tmdbIdStr of sourceIds) {
            const item = data[tmdbIdStr];
            nodesBatch.push({
                tmdbId: parseInt(tmdbIdStr, 10),
                title: item.title,
                watchCount: item.watchCount || 0
            });
        }

        const NODE_BATCH_SIZE = 1000;
        for (let i = 0; i < nodesBatch.length; i += NODE_BATCH_SIZE) {
            const chunk = nodesBatch.slice(i, i + NODE_BATCH_SIZE);
            await session.run(
                `UNWIND $batch AS row
                 MERGE (m:Movie {tmdbId: row.tmdbId})
                 SET m.title = row.title, m.watchCount = row.watchCount`,
                { batch: chunk }
            );
            console.log(`  Ingested ${Math.min(i + NODE_BATCH_SIZE, nodesBatch.length)} / ${nodesBatch.length} movie nodes`);
        }

        // --------------------------------------------------
        // Step 3: Ingest CO_WATCHED Edges in Batches
        // --------------------------------------------------
        console.log('\nStep 3: Ingesting CO_WATCHED relationships...');
        const edgesBatch = [];
        for (const tmdbIdStr of sourceIds) {
            const sourceTmdbId = parseInt(tmdbIdStr, 10);
            const neighbors = data[tmdbIdStr].coWatched || [];

            for (const n of neighbors) {
                edgesBatch.push({
                    sourceTmdbId: sourceTmdbId,
                    targetTmdbId: n.tmdbId,
                    weight: n.weight,
                    coWatchCount: n.coWatchCount
                });
            }
        }

        console.log(`Total relationships to insert: ${edgesBatch.length}`);
        const EDGE_BATCH_SIZE = 2000;
        for (let i = 0; i < edgesBatch.length; i += EDGE_BATCH_SIZE) {
            const chunk = edgesBatch.slice(i, i + EDGE_BATCH_SIZE);
            await session.run(
                `UNWIND $batch AS row
                 MATCH (a:Movie {tmdbId: row.sourceTmdbId})
                 MATCH (b:Movie {tmdbId: row.targetTmdbId})
                 MERGE (a)-[r:CO_WATCHED]->(b)
                 SET r.weight = row.weight, r.coWatchCount = row.coWatchCount`,
                { batch: chunk }
            );
            console.log(`  Ingested ${Math.min(i + EDGE_BATCH_SIZE, edgesBatch.length)} / ${edgesBatch.length} edges`);
        }

        // --------------------------------------------------
        // Step 4: Verification Queries
        // --------------------------------------------------
        console.log('\nStep 4: Verifying database counts against Free Tier limits...');
        const nodeCountRes = await session.run('MATCH (m:Movie) RETURN count(m) AS totalNodes');
        const edgeCountRes = await session.run('MATCH ()-[r:CO_WATCHED]->() RETURN count(r) AS totalEdges');

        const totalNodes = nodeCountRes.records[0].get('totalNodes').toNumber();
        const totalEdges = edgeCountRes.records[0].get('totalEdges').toNumber();

        console.log(`  Total Nodes in Neo4j: ${totalNodes} (Limit: 200,000 -> ${((totalNodes / 200000) * 100).toFixed(1)}% used)`);
        console.log(`  Total Edges in Neo4j: ${totalEdges} (Limit: 400,000 -> ${((totalEdges / 400000) * 100).toFixed(1)}% used)`);

        // Test sample query
        const sampleRes = await session.run(
            `MATCH (a:Movie)-[r:CO_WATCHED]->(b:Movie)
             WHERE a.title CONTAINS 'Inception' OR a.title CONTAINS 'Interstellar'
             RETURN a.title AS fromMovie, b.title AS toMovie, r.weight AS similarity
             ORDER BY r.weight DESC LIMIT 5`
        );

        console.log('\nSample Co-Watched Recommendations from Neo4j:');
        for (const record of sampleRes.records) {
            console.log(`  - "${record.get('fromMovie')}" ──[weight: ${record.get('similarity')}]──> "${record.get('toMovie')}"`);
        }

        console.log('\nPhase 2 Ingestion Complete!\n');

    } finally {
        await session.close();
        await driver.close();
    }
}

ingest().catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
});
