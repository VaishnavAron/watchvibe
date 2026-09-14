// =====================================================================
// 2_config.js - USING GROQ (llama-3.1-8b-instant) for LLM
// =====================================================================

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import neo4j from "neo4j-driver";
import { Pinecone } from "@pinecone-database/pinecone";
import { OllamaEmbeddings } from "@langchain/ollama";
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
const GROQ_MODEL = getEnv("GROQ_MODEL", "llama-3.1-8b-instant");

// ========== LOCAL OLLAMA for embeddings only ==========
const OLLAMA_BASE_URL = getEnv("OLLAMA_HOST", "http://localhost:11434");
const OLLAMA_EMBED_MODEL = getEnv("OLLAMA_EMBED_MODEL", "qwen3-embedding:0.6b");

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

// ========== LLM – Groq ==========
const llm = {
  async invoke(messages) {
    const groqMessages = messages.map(msg => ({
      role: msg.role === "human" ? "user" : msg.role,
      content: msg.content
    }));
    const completion = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      messages: groqMessages,
      temperature: 0.3,
      max_completion_tokens: 1024,
      stream: false,
    });
    return { content: completion.choices[0].message.content };
  },
  async *stream(messages) {
    const groqMessages = messages.map(msg => ({
      role: msg.role === "human" ? "user" : msg.role,
      content: msg.content
    }));
    const stream = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      messages: groqMessages,
      temperature: 0.3,
      max_completion_tokens: 1024,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  }
};

// ========== EMBEDDINGS via Voyage AI Cloud with Safe Fallback ==========
const VOYAGE_API_KEY = getEnv("VOYAGE_API_KEY", "pa-ibQuipMoWUtpAxwBMGX9qO1Z_ArdnW3TTvfTLThB0u4");
const VOYAGE_EMBED_MODEL = getEnv("VOYAGE_EMBED_MODEL", "voyage-4");

async function embedText(text) {
  try {
    if (VOYAGE_API_KEY) {
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
        return data.data[0].embedding;
      }
      console.warn("Voyage API status:", response.status);
    }
  } catch (err) {
    console.warn("Voyage embed failed, falling back:", err.message);
  }

  // Deterministic 1024-dim fallback vector if cloud embedding fails
  const mockVector = new Array(1024).fill(0).map((_, i) => Math.sin(text.length * (i + 1)) * 0.05);
  return mockVector;
}

async function embedTexts(texts) {
  try {
    if (VOYAGE_API_KEY) {
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VOYAGE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts.map(t => t.slice(0, 4000)),
          model: VOYAGE_EMBED_MODEL,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.data.map(item => item.embedding);
      }
    }
  } catch (err) {
    console.warn("Voyage batch failed:", err.message);
  }
  return texts.map(t => new Array(1024).fill(0).map((_, i) => Math.sin(t.length * (i + 1)) * 0.05));
}

async function closeConnections() {
  if (driver) await driver.close();
  console.log("All connections closed.");
}

const genai = null;

// For backward compatibility (other files may import OLLAMA_MODEL)
const OLLAMA_MODEL = undefined;

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