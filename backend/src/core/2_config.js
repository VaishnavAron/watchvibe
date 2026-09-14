// =====================================================================
// 2_config.js - USING GROQ (llama-3.1-8b-instant) for LLM
// =====================================================================

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import neo4j from "neo4j-driver";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const rootEnvPath = path.join(rootDir, ".env");

dotenv.config({ path: rootEnvPath });

function getEnv(name, fallback = "") {
  return (process.env[name] ?? fallback).trim();
}

function getRequiredEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Check ${rootEnvPath}`);
  }
  return value;
}

// ========== GROQ (cloud LLM) ==========
const groqClient = new Groq({
  apiKey: getRequiredEnv("GROQ_API_KEY"),
});
const GROQ_MODEL = getEnv("GROQ_MODEL", "qwen/qwen3.8-27b");


// ========== NEO4J ==========
let driver;
try {
  driver = neo4j.driver(
    getRequiredEnv("NEO4J_URI"),
    neo4j.auth.basic(
      getRequiredEnv("NEO4J_USERNAME"),
      getRequiredEnv("NEO4J_PASSWORD")
    )
  );
  console.log("✅ Neo4j driver created");
} catch (err) {
  console.error("❌ Failed to create Neo4j driver:", err.message);
  throw err;
}

// ========== PINECONE ==========
let pinecone;
let pineconeIndex;
try {
  pinecone = new Pinecone({ apiKey: getRequiredEnv("PINECONE_API_KEY") });
  pineconeIndex = pinecone.index(getRequiredEnv("PINECONE_INDEX_NAME"));
  console.log("✅ Pinecone index ready");
} catch (err) {
  console.error("❌ Failed to initialize Pinecone:", err.message);
  throw err;
}

// ========== LLM – Groq with Automatic Fallback Models ==========
const GROQ_FALLBACK_MODELS = Array.from(new Set([
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  GROQ_MODEL,
  "openai/gpt-oss-120b"
].filter(Boolean)));

const llm = {
  async invoke(messages) {
    const groqMessages = messages.map(msg => ({
      role: msg.role === "human" ? "user" : msg.role,
      content: msg.content
    }));

    let lastError = null;
    for (const model of GROQ_FALLBACK_MODELS) {
      try {
        const completion = await groqClient.chat.completions.create({
          model,
          messages: groqMessages,
          temperature: 0.3,
          max_completion_tokens: 800,
          stream: false,
        });
        return { content: completion.choices[0].message.content };
      } catch (err) {
        lastError = err;
        console.warn(`[llm.invoke] Model '${model}' failed: ${err.message}. Trying next available fallback...`);
      }
    }
    throw lastError;
  },
  async *stream(messages) {
    const groqMessages = messages.map(msg => ({
      role: msg.role === "human" ? "user" : msg.role,
      content: msg.content
    }));

    let lastError = null;
    for (const model of GROQ_FALLBACK_MODELS) {
      try {
        const stream = await groqClient.chat.completions.create({
          model,
          messages: groqMessages,
          temperature: 0.3,
          max_completion_tokens: 800,
          stream: true,
        });
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) yield content;
        }
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[llm.stream] Model '${model}' failed: ${err.message}. Trying next available fallback...`);
      }
    }
    throw lastError;
  }
};

// ========== EMBEDDINGS via AWS EC2 Ollama (qwen3-embedding:0.6b) with LRU Cache ==========
const OLLAMA_HOST = getEnv("OLLAMA_HOST", "http://3.110.176.31:11434");
const OLLAMA_EMBED_MODEL = getEnv("OLLAMA_EMBED_MODEL", "qwen3-embedding:0.6b");
const VOYAGE_API_KEY = getEnv("VOYAGE_API_KEY", "pa-ibQuipMoWUtpAxwBMGX9qO1Z_ArdnW3TTvfTLThB0u4");
const VOYAGE_EMBED_MODEL = getEnv("VOYAGE_EMBED_MODEL", "voyage-4");

const embeddingCache = new Map();
const MAX_CACHE_ENTRIES = 1000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function embedText(text) {
  if (!text || typeof text !== "string") return null;
  const cleanKey = text.slice(0, 500).trim().toLowerCase();
  if (embeddingCache.has(cleanKey)) {
    return embeddingCache.get(cleanKey);
  }

  // Primary: AWS EC2 Ollama (qwen3-embedding:0.6b - exact vector space of Pinecone index)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        prompt: text.slice(0, 4000)
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const vec = data.embedding;
      if (vec && Array.isArray(vec) && vec.length > 0) {
        if (embeddingCache.size >= MAX_CACHE_ENTRIES) {
          const oldestKey = embeddingCache.keys().next().value;
          embeddingCache.delete(oldestKey);
        }
        embeddingCache.set(cleanKey, vec);
        return vec;
      }
    }
  } catch (err) {
    console.warn(`[embedText] Primary EC2 Ollama failed: ${err.message}. Trying Voyage fallback...`);
  }

  // Fallback: Voyage AI Cloud
  if (VOYAGE_API_KEY) {
    try {
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VOYAGE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text.slice(0, 4000),
          model: VOYAGE_EMBED_MODEL,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const vec = data.data?.[0]?.embedding || null;
        if (vec && Array.isArray(vec)) {
          if (embeddingCache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = embeddingCache.keys().next().value;
            embeddingCache.delete(oldestKey);
          }
          embeddingCache.set(cleanKey, vec);
          return vec;
        }
      }
    } catch (voyageErr) {
      console.warn(`[embedText] Voyage fallback failed: ${voyageErr.message}`);
    }
  }

  console.warn("[embedText] Embedding unavailable, skipping vector channel cleanly.");
  return null;
}

async function embedTexts(texts) {
  if (!texts || !texts.length) return [];
  const results = [];
  for (const t of texts) {
    const vec = await embedText(t);
    results.push(vec);
  }
  return results;
}

async function closeConnections() {
  if (driver) await driver.close();
  console.log("All connections closed.");
}

const genai = null;

// For backward compatibility (other files may import OLLAMA_MODEL)
const OLLAMA_MODEL = undefined;
const OLLAMA_BASE_URL = OLLAMA_HOST;

export {
  driver,
  pinecone,
  pineconeIndex,
  llm,
  genai,
  embedText,
  embedTexts,
  closeConnections,
  rootDir,
  rootEnvPath,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,      // now defined as undefined
  OLLAMA_EMBED_MODEL,
};