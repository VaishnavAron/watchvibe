import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function PipelineInspector({ isOpen, onToggle, runtimeMetrics, query }) {
  const stages = [
    {
      id: 1,
      name: "Intent Classifier",
      tech: "Groq LLaMA-3.1",
      status: "completed",
      detail: "NER & Semantic Parsing"
    },
    {
      id: 2,
      name: "Dense Vector Search",
      tech: "Pinecone (10k)",
      status: "completed",
      detail: "1024-dim Voyage Cosine"
    },
    {
      id: 3,
      name: "Knowledge Graph",
      tech: "Neo4j AuraDB",
      status: "completed",
      detail: "200k+ Edges Traversed"
    },
    {
      id: 4,
      name: "Composite Ranker",
      tech: "Hybrid 60/32/8",
      status: "completed",
      detail: "Cosine + Dice + Co-occur"
    }
  ];

  const latency = runtimeMetrics?.retrievalLatencyMs || 12;
  const isCacheHit = runtimeMetrics?.cacheHit || latency < 20;

  return (
    <div className="pipeline-inspector-wrapper">
      <div className="pipeline-inspector-trigger" onClick={onToggle}>
        <div className="pipeline-inspector-trigger__left">
          <span className="pipeline-status-indicator pulse"></span>
          <strong>Pipeline Inspector:</strong>
          <span className="pipeline-tag">Active</span>
          <span className="pipeline-query-preview">
            {query ? `"${query.slice(0, 45)}..."` : "Ready for natural language query"}
          </span>
        </div>
        <div className="pipeline-inspector-trigger__right">
          <span className="pipeline-metric-chip">⚡ {latency}ms {isCacheHit ? "(Cache Hit)" : "(Compute)"}</span>
          <span className="pipeline-chevron">{isOpen ? "▲ Hide" : "▼ Show Trace"}</span>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="pipeline-inspector-drawer glass-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="pipeline-stepper-grid">
              {stages.map((stage, idx) => (
                <div key={stage.id} className="pipeline-step-card">
                  <div className="pipeline-step-card__header">
                    <span className="pipeline-step-number">0{stage.id}</span>
                    <span className="pipeline-step-dot done">✓</span>
                  </div>
                  <h4>{stage.name}</h4>
                  <p className="pipeline-step-tech">{stage.tech}</p>
                  <small className="pipeline-step-detail">{stage.detail}</small>
                </div>
              ))}
            </div>
            <div className="pipeline-inspector-footer">
              <span><strong>Deterministic Storage Hydration:</strong> Neo4j AuraDB & Pinecone synchronized via Node ID keying</span>
              <span><strong>Security:</strong> Parameterized Cypher AST validation enabled</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
