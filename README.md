# 🎬 WatchVibe: Enterprise Multi-Channel Hybrid Recommendation Engine

> **A resilient, production-grade recommendation architecture combining Vector ANN, Knowledge Graph traversal, Collaborative Behavioral Co-occurrence, and LLM Intent Compilation.**

[![System Status](https://img.shields.io/badge/System-Operational%20Resilient-emerald?style=for-the-badge)](#system-diagnostics--self-healing-architecture)
[![Architecture](https://img.shields.io/badge/Architecture-4--Phase%20Hybrid%20GraphRAG-blue?style=for-the-badge)](#system-architecture)
[![Database](https://img.shields.io/badge/Neo4j%20%7C%20Pinecone%20%7C%20MongoDB-Multi--Cloud-purple?style=for-the-badge)](#technology-stack)

---

## 📌 Executive Summary

Traditional recommendation systems fail under real-world conditions:
- **Pure Collaborative Filtering (CF)** suffers from the *cold-start problem* and cannot interpret nuanced natural language intent like *"mind-bending psychological thrillers with an unexpected twist from the 2010s"*.
- **Pure Vector Similarity (ANN)** suffers from *semantic drift* and *popularity collapse*, returning superficially similar synopses while ignoring verified cinematic relationships (shared directors, co-actor chemistry, user co-watching behavior).
- **Hardcoded Knowledge Graphs** cannot understand conversational nuances, synonyms, or open-ended mood queries.

**WatchVibe** solves these limitations by implementing an **Enterprise 4-Phase Hybrid Intelligence Pipeline**. It concurrently queries multiple retrieval channels (Dense Vectors, Knowledge Graph nodes, and Behavioral Co-occurrence matrices), fuses them using **Reciprocal Rank Fusion (RRF)**, applies **real-time user personalization**, and generates transparent, conversational explanations.

---

## 🏗️ System Architecture

WatchVibe routes every query through a 4-phase non-blocking pipeline designed for ultra-low latency (<1.5s P50) and zero single points of failure.

```
                           [ User Query / Context ]
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │    PHASE 1: Structured Intent Compilation       │
             │   - Entity Extraction (Titles, Directors, Cast) │
             │   - Mood & Temporal Constraints Parsing         │
             │   - Fast LLM Compilation (Groq Qwen/Llama)      │
             └────────────────────────┬────────────────────────┘
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │ PHASE 2: Multi-Channel Retrieval Barrier (Async)│
             ├─────────────────────────────────────────────────┤
             │ 1. Vector ANN Store (Pinecone, 1024-dim Qwen3)  │
             │ 2. Knowledge Graph (Neo4j Aura Cypher Traversal)│
             │ 3. Collaborative Co-occurrence (MovieLens 32M)  │
             │ 4. Local Catalog Fallback (10,800+ In-Memory)   │
             └────────────────────────┬────────────────────────┘
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │     PHASE 3: Reciprocal Rank Fusion & Rerank    │
             │   - Multi-Channel Consensus Boosting            │
             │   - Dynamic User Affinity & Dislike Filtering   │
             │   - Deduplication & Diversity Scoring           │
             └────────────────────────┬────────────────────────┘
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │       PHASE 4: Contextual Explanation           │
             │   - Transparent "Why This Movie" Attribution    │
             │   - Real-time Structured API Response Payload   │
             └─────────────────────────────────────────────────┘
```

---

## ⚙️ The 4-Phase Engine in Detail

### Phase 1: Structured Intent Compilation
- Transforms natural language into an executable query plan.
- Extracts explicit cinematic entities:
  - Reference Titles (e.g., *"Inception"*, *"Interstellar"*)
  - Directors & Crew (e.g., *"Christopher Nolan"*)
  - Actors & Characters
  - Year/Decade Constraints (e.g., `after: 2010`, `before: 2020`)
  - Moods & Tones (e.g., *"dark"*, *"philosophical"*, *"suspenseful"*)
- Converts user input into a strongly-typed JSON schema with regex fallback protection if LLM output requires repair.

### Phase 2: Multi-Channel Concurrent Retrieval Barrier
All channels execute in parallel with strict timeout barriers (`Promise.allSettled`):
1. **Vector ANN Channel (`Pinecone` + AWS EC2 Ollama `qwen3-embedding:0.6b`)**:
   Generates a 1024-dimensional semantic embedding to retrieve conceptually aligned titles beyond direct keyword matching.
2. **Knowledge Graph Channel (`Neo4j Aura`)**:
   Executes Cypher graph traversals across `:DIRECTED_BY`, `:ACTED_IN`, `:IN_GENRE`, and `:HAS_THEME` edges to discover structurally connected cinema.
3. **Behavioral Co-Occurrence Channel (`MovieLens 32M Graph`)**:
   Leverages user co-watching probabilities to identify films that actual audiences watch in tandem with the reference titles.
4. **Resilient Local Catalog (`In-Memory 10,800+ Titles`)**:
   High-speed RAM index for instant token-based and genre-based candidate sourcing.

### Phase 3: Reciprocal Rank Fusion (RRF) & Dynamic Personalization
Candidates from all channels are normalized and fused using **Reciprocal Rank Fusion**:

$$\text{RRF Score}(d) = \sum_{c \in \text{Channels}} \frac{w_c}{k + r_c(d)}$$

Where:
- $r_c(d)$ is the rank position of movie $d$ in channel $c$.
- $k = 60$ (smoothing constant preventing top ranks from eclipsing consensus).
- $w_c$ is the channel confidence weight.

**Personalization Adjustments:**
- **Consensus Multiplier**: Movies appearing in multiple distinct retrieval channels receive an exponential boost ($1.25\times - 1.5\times$).
- **User Preference Alignment**: Movies matching the user's favorite genres receive positive affinity weight.
- **Negative Feedback Elimination**: Disliked movies and suppressed genres are stripped from candidate pools.

### Phase 4: Contextual Explanation & Attribution
Each movie returned is paired with human-readable rationale:
- Transparent source attribution (e.g., *"Multi-Channel Sourced (cowatched_reference + graph_tags_all)"*).
- Highlighted connective tissue (e.g., *"Shares director Christopher Nolan and themes of reality distortion"*).

---

## 🛡️ Enterprise Diagnostics & Self-Healing Architecture

A core design principle of WatchVibe is **Zero Panic on 3rd-Party Downtime**. Cloud APIs can rate-limit, networks can drop packets, and Redis caches can restart. WatchVibe detects and bypasses faults automatically.

### Automated Fault Tolerance
| Dependency | Failure Scenario | WatchVibe Resilient Defense |
|---|---|---|
| **Redis Cloud** | DNS failure / connection timeout | Automatic non-blocking fallback to in-memory caching and cryptographic JWT verification. User auth never breaks. |
| **AWS EC2 Ollama** | Instance restart / IP change | Immediate fallback to Voyage AI Cloud and token-based lexical matching. |
| **Neo4j Aura** | Maintenance / credit exhaustion | Vector ANN and MovieLens Co-occurrence channels absorb retrieval load. |
| **Groq Cloud LLM** | Rate limit / model update | Automatic cascade through `GROQ_FALLBACK_MODELS` down to deterministic regex-based rule parser. |

### Real-Time Diagnostics API & Visual Dashboard
WatchVibe exposes production health inspection tools:
- **Interactive Web Dashboard**: `http://localhost:4000/api/health/diagnostics/html`
- **JSON Diagnostic Telemetry**: `GET /api/health/diagnostics`
- **CLI Terminal Audit**: `npm run test:system`

```bash
$ npm run test:system

============================================================
      WATCHVIBE ENTERPRISE SYSTEM HEALTH CHECK & AUDIT       
============================================================

Overall Status: ✔ HEALTHY (Diagnostic latency: 789ms)

SERVICE STATUS BREAKDOWN:
  ✔ [HEALTHY] MongoDB Atlas (144ms) - 26 registered users
  ✔ [HEALTHY] Neo4j Aura Graph DB (726ms) - 12,040 nodes
  ✔ [HEALTHY] Pinecone Vector DB (2394ms) - 1024-dim, 1,506 records
  ✔ [HEALTHY] AWS EC2 Ollama Embeddings (581ms) - Qwen3 1024-dim
  ✔ [HEALTHY] Groq Cloud LLM (334ms) - Qwen 27B model
  ✔ [HEALTHY] In-Memory Movie Catalog (0ms) - 10,809 movies
  ⚠ [DEGRADED] Redis Cloud Cache - Non-blocking graceful fallback active
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js v18+ (tested on Node v20/v24)
- MongoDB Atlas cluster
- Pinecone Index (1024 dimensions)
- Neo4j Aura DB instance

### 1. Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd WatchVibe_Redesigned

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Configuration
Duplicate the provided `.env.example` templates:

```bash
# Backend configuration
cd backend
cp .env.example .env
```

Fill in your respective API keys in `backend/.env` (Pinecone, Neo4j, Groq, MongoDB).

### 3. Run System Health Audit
Verify all external clouds and models before booting:
```bash
cd backend
npm run test:system
```

### 4. Start the Application
```bash
# Terminal 1: Backend Server (Port 4000)
cd backend
npm run start

# Terminal 2: Frontend Client (Port 5500)
cd frontend
npm run dev
```

Visit the application at `http://localhost:5500` or the health dashboard at `http://localhost:4000/api/health/diagnostics/html`.

---

## 🔑 Key API Endpoints

### Authentication & User Session
- `POST /auth/register` — Create account with initial taste onboarding.
- `POST /auth/login` — Authenticate and receive dual-mode session (Cookie + Bearer token).
- `GET /api/user/profile` — Fetch user's genre preferences, watch history, and liked titles.

### Recommendations & Discovery
- `POST /api/recommendations/query` — Execute 4-Phase Hybrid search from natural language query.
  ```json
  {
    "query": "philosophical sci-fi movies like Blade Runner 2049",
    "userId": "69ecf833b0155353548917c5"
  }
  ```
- `GET /api/collections/home` — Fetch curated home rows (Hero, Trending, Because You Watched, Top Rated).
- `GET /api/search/suggest?q=nolan` — Real-time prefix autocomplete across 10,800+ titles.

### System Observability
- `GET /health` — Lightweight liveness probe.
- `GET /api/health/diagnostics` — Deep dependency health report (JSON).
- `GET /api/health/diagnostics/html` — Real-time browser status dashboard.

---

## 📊 Evaluation & Interview Talking Points

1. **Why Hybrid over pure Vector?**  
   Dense vector embeddings only understand semantic textual closeness of synopses. They cannot capture behavioral collaborative signals (*"people who enjoyed The Prestige also loved Memento"*) or hard structural constraints (*"movies directed by Denis Villeneuve released between 2015 and 2021"*). WatchVibe unifies all three paradigms.

2. **How does RRF prevent single-channel bias?**  
   Reciprocal Rank Fusion relies on ranking positions rather than raw uncalibrated float scores. Because vector cosine similarity scales differently from Cypher hop weights, RRF normalizes diverse channels into a single equitable consensus ranking.

3. **How does the system ensure enterprise high availability?**  
   Every third-party network dependency is bounded by asynchronous timeout controllers. If any cloud provider goes offline (e.g., Redis or Pinecone), WatchVibe's graceful fallback matrix keeps the user experience completely intact without throwing unhandled 500 errors.

---

## 📄 License
MIT License. Developed for advanced cinema discovery and production agentic architecture.
