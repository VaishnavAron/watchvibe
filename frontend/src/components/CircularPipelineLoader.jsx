import React, { useState, useEffect } from "react";
import "./CircularPipelineLoader.css";

const PIPELINE_STAGES = [
  { step: 1, title: "Intent Parsing", detail: "Extracting semantic entities & tone" },
  { step: 2, title: "Query Routing", detail: "Determining retrieval channels" },
  { step: 3, title: "Graph Retrieval", detail: "Traversing Neo4j taste paths" },
  { step: 4, title: "Vector Retrieval", detail: "1024-dim Pinecone cosine search" },
  { step: 5, title: "Scoring & Rank", detail: "Hybrid relevance calculation" },
  { step: 6, title: "Explanation Gen", detail: "Synthesizing Socratic match reason" },
  { step: 7, title: "Response Assembly", detail: "Hydrating cinematic matches" }
];

export default function CircularPipelineLoader({ 
  currentStageIndex, 
  stageDurationMs = 1700, 
  queryLabel
}) {
  const [internalIndex, setInternalIndex] = useState(0);

  // Auto-cycle through the 7 stages smoothly
  useEffect(() => {
    if (typeof currentStageIndex === "number") {
      setInternalIndex(currentStageIndex % PIPELINE_STAGES.length);
      return;
    }

    const timer = setInterval(() => {
      setInternalIndex((prev) => (prev + 1) % PIPELINE_STAGES.length);
    }, stageDurationMs);

    return () => clearInterval(timer);
  }, [currentStageIndex, stageDurationMs]);

  const activeStage = PIPELINE_STAGES[internalIndex];

  return (
    <div className="circular-loader-root">
      {queryLabel && (
        <div className="loader-query-badge">
          <span className="loader-pulse-dot"></span>
          <span className="loader-query-text">Computing: &ldquo;{queryLabel}&rdquo;</span>
        </div>
      )}

      {/* Main Revolving Orbital Ring Container */}
      <div className="loader-orbital-wrapper">
        {/* Soft Ambient Ripple Waves */}
        <div className="loader-ripple loader-ripple--primary"></div>
        <div className="loader-ripple loader-ripple--secondary"></div>

        {/* Outer Orbit with Rotating Nodes */}
        <svg className="loader-svg-orbit spin-slow" viewBox="0 0 100 100">
          <circle 
            cx="50" 
            cy="50" 
            r="47" 
            fill="none" 
            stroke="rgba(255, 255, 255, 0.12)" 
            strokeWidth="0.8" 
            strokeDasharray="2 3.5" 
          />
          <circle cx="50" cy="3" r="1.8" fill="#38bdf8" className="orbital-node-cyan" />
          <circle cx="50" cy="97" r="1.8" fill="#34d399" className="orbital-node-emerald" />
        </svg>

        {/* Translucent Grey-White Conic Arc */}
        <div className="loader-arc-outer spin-fast"></div>

        {/* Inner Counter-Rotating Cyan Arc */}
        <div className="loader-arc-inner spin-reverse-medium"></div>

        {/* Center Frosted Glass Disc */}
        <div className="loader-glass-center">
          <div className="loader-glass-specular"></div>

          {/* Processing Pill (Replaces Stage x/x) */}
          <div className="loader-stage-pill">
            <span className="loader-mini-dot"></span>
            <span className="loader-stage-number">PROCESSING</span>
          </div>

          {/* Dynamic Stage Title (Repeats / cycles through pipeline words) */}
          <div className="loader-title-container">
            <h4 key={activeStage.step} className="loader-stage-title animate-text-slide">
              {activeStage.title}
            </h4>
          </div>

          {/* Dynamic Subtitle */}
          <p key={`detail-${activeStage.step}`} className="loader-stage-detail animate-fade">
            {activeStage.detail}
          </p>

          {/* Soundwave / Audio-style Wavy Vertical Lines (Replaces linear progress bar) */}
          <div className="loader-soundwave" aria-label="Processing activity visualizer">
            <span className="wave-bar bar-1"></span>
            <span className="wave-bar bar-2"></span>
            <span className="wave-bar bar-3"></span>
            <span className="wave-bar bar-4"></span>
            <span className="wave-bar bar-5"></span>
          </div>
        </div>
      </div>
    </div>
  );
}
