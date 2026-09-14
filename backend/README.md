{
  "success": true,
  "metadata": {
    "requestId": "req-98765-xyz",       // FUTURE: For distributed tracing/debugging
    "timestamp": "2026-05-25T19:52:08Z",
    "apiVersion": "v2.0"
  },

  "parsedIntent": {
    "genres": ["sci-fi", "drama"],
    "moods": ["cinematic", "emotional"],
    "reference": "semantic blend",
    "ragSource": "hybrid-graph-vector",
    "flags": {                          // FUTURE: To handle complex UI routing later
      "isComplexQuery": true,
      "requiresVectorEnrichment": false
    }
  },

  "userContext": {                      // FUTURE: For Live Updates & Cold Starts
    "userId": "69ecf833b015535",
    "isGuest": false,
    "activeBoosts": [
      {"type": "genre", "value": "Sci-Fi", "weight": "+0.15"}
    ],
    "tasteProfileSnapshot": {           // FUTURE: When you build the LTR (Learn to Rank) system
      "topActors": ["Matthew McConaughey"],
      "recentSearches": ["space travel", "dark themes"]
    }
  },

  "runtimeMetrics": {
    "cacheHit": false,
    "retrievalLatencyMs": 128,
    "estimatedLlmTokens": 1900,
    "estimatedApiCostUsd": 0.012,
    "nodesTraversed": 14205             // FLEX: Good to show off Neo4j depth on the UI
  },

  "systemLogs": {
    "gpuUtilization": "63%",            // Simulated for UI flex
    "tokenThroughput": "92 tok/s",      // Simulated for UI flex
    "contextWindowSize": "8k",
    "similarityConfidence": 0.88
  },

  "recommendations": [
    {
      "id": "12345",
      "title": "Interstellar",
      "year": 2014,
      "posterUrl": "https://placehold.co/320x480/1f2937/f9fafb?text=Interstellar",
      "backdropUrl": null,              // FUTURE: If you add hero banners later
      "metadata": "Sci-Fi / Drama",
      "tags": ["Sci-Fi", "Drama", "Emotional", "Epic"],
      "scores": {
        "matchPercentage": 91,
        "tasteAlignment": 0.85,
        "confidence": "89%",
        "rawBreakdown": {               // FUTURE: If the judge wants to see the exact math
          "vectorSimilarity": 0.82,
          "graphCoOccurrence": 0.45,
          "personalizationBoost": 0.20
        }
      },
      "explanationText": "High emotional gravity Signal tags: Sci-Fi, Drama...",
      "reasoningPaths": [               // FUTURE: To draw actual visual Graph Nodes on the UI
        {"type": "SAME_DIRECTOR", "value": "Christopher Nolan"},
        {"type": "USER_FAV_GENRE", "value": "Sci-Fi"}
      ]
    }
  ],

  "pagination": {                       // FUTURE: For infinite scrolling on the Discover page
    "currentPage": 1,
    "totalPages": 5,
    "totalResults": 42,
    "hasNextPage": true
  }
}