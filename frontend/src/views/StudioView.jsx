import React, { useState, useEffect, useRef } from "react";
import CinematicPosterGrid from "../components/CinematicPosterGrid";
import MovieInspectionModal from "../components/MovieInspectionModal";
import CircularPipelineLoader from "../components/CircularPipelineLoader";
import TasteCustomizationModal, { VIBE_ARCHETYPES } from "../components/TasteCustomizationModal";
import BottomCustomizationToast from "../components/BottomCustomizationToast";

export default function StudioView({
  query = "",
  results,
  loadingRecommendations,
  onRunQuery,
  onResetSession,
  onOpenDnaDrawer,
  navigateTo
}) {
  const [chatInput, setChatInput] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [selectedInspectionMovie, setSelectedInspectionMovie] = useState(null);
  
  // Taste customization modal and bottom toast states
  const [showTasteModal, setShowTasteModal] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("customize") === "true";
    }
    return false;
  });
  const [showBottomToast, setShowBottomToast] = useState(false);
  
  // Persisted taste preferences state: Kept across sessions & queries until explicitly cleared
  const [activeTaste, setActiveTaste] = useState(() => {
    try {
      const stored = localStorage.getItem("watchvibe_custom_vibes");
      const minR = localStorage.getItem("watchvibe_min_rating");
      const ids = stored ? JSON.parse(stored) : [];
      if (Array.isArray(ids) && ids.length > 0) {
        const activeVibes = VIBE_ARCHETYPES.filter((v) => ids.includes(v.id));
        const combinedThemes = Array.from(new Set(activeVibes.flatMap((v) => v.themes)));
        const combinedGenres = Array.from(new Set(activeVibes.flatMap((v) => v.genres)));
        return {
          selectedIds: ids,
          minRating: minR ? Number(minR) : 7.0,
          genres: combinedGenres,
          themes: combinedThemes,
          activeVibes
        };
      }
      return null;
    } catch {
      return null;
    }
  });

  // Check if incoming query was explicitly routed from URL (e.g. /studio?q=...)
  const isExplicitRoutedQuery = Boolean(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("q")
  );
  
  // On first visit without explicit ?q= route, always show centered discovery deck
  const [hasInteracted, setHasInteracted] = useState(() => {
    return Boolean(isExplicitRoutedQuery && (loadingRecommendations || results?.recommendations?.length > 0 || results?.results?.length > 0));
  });

  // Conversational chat history: Never seed placeholder text to prevent duplicate bubbles
  const [messages, setMessages] = useState(
    isExplicitRoutedQuery && query
      ? [
          { id: "m1", sender: "user", text: query },
          ...(results?.assistantMessage
            ? [{ id: "m2", sender: "ai", text: results.assistantMessage }]
            : [])
        ]
      : [
          {
            id: "init",
            sender: "ai",
            text: "Welcome to WatchVibe AI. Tell me what kind of movie experience you are looking for—by mood, tone, director, or blend two films together."
          }
        ]
  );

  const chatBottomRef = useRef(null);
  const lastSyncedMessageRef = useRef(null);

  // Trigger bottom toast once after first user interaction (if not dismissed)
  useEffect(() => {
    if (hasInteracted && !showTasteModal) {
      try {
        const isDismissed = sessionStorage.getItem("watchvibe_toast_dismissed");
        if (!isDismissed) {
          const timer = setTimeout(() => {
            setShowBottomToast(true);
          }, 1500);
          return () => clearTimeout(timer);
        }
      } catch (e) {
        // ignore storage errors
      }
    }
  }, [hasInteracted, showTasteModal]);

  // Sync assistantMessage from backend recommendations payload
  useEffect(() => {
    if (results?.assistantMessage && hasInteracted) {
      if (lastSyncedMessageRef.current === results.assistantMessage) {
        return;
      }
      lastSyncedMessageRef.current = results.assistantMessage;
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.sender === "ai" && lastMsg.text === results.assistantMessage) {
          return prev;
        }
        return [...prev, { id: `ai-${Date.now()}`, sender: "ai", text: results.assistantMessage }];
      });
    }
  }, [results, hasInteracted]);

  // Handle external query on first load without wiping ongoing conversation or seeding placeholder
  useEffect(() => {
    if (query && query.trim()) {
      setHasInteracted(true);
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id === "init") {
          return [
            { id: "m1", sender: "user", text: query },
            ...(results?.assistantMessage
              ? [{ id: "m2", sender: "ai", text: results.assistantMessage }]
              : [])
          ];
        }
        return prev;
      });
    }
  }, [query]);

  useEffect(() => {
    if ((results && ((results.recommendations?.length > 0) || (results.results?.length > 0)) && query?.trim()) ||
        (loadingRecommendations && query && query.trim())) {
      setHasInteracted(true);
    }
  }, [results, query, loadingRecommendations]);

  // Scroll chat when new messages appear
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Derived recommendation items
  const recommendations = results?.recommendations || results?.results || [];
  const relaxedMatches = results?.relaxedMatches || [];
  const visibleRecommendations = recommendations.slice(0, visibleCount);
  const remainingCount = Math.max(0, recommendations.length - visibleCount);

  // Telemetry extraction matching user's original hackathon dashboard
  const parsedIntent = results?.parsedIntent || {};
  const runtimeMetrics = results?.runtimeMetrics || {};
  const systemLogs = results?.systemLogs || {};

  const confidenceScore = systemLogs?.similarityConfidence || (recommendations.length > 0 ? "0.94" : "0.85");
  const latency = runtimeMetrics?.retrievalLatencyMs ?? runtimeMetrics?.latency ?? "380ms";
  const isCache = runtimeMetrics?.cacheHit ?? false;
  const tokenCount = runtimeMetrics?.estimatedLlmTokens ?? 295;
  const cost = typeof runtimeMetrics?.estimatedApiCostUsd === "number" 
    ? `$${runtimeMetrics.estimatedApiCostUsd.toFixed(7)}` 
    : "$0.0002100";

  const gpuUtil = systemLogs?.gpuUtilization || "78%";
  const tokenThroughput = systemLogs?.tokenThroughput || "88 tok/s";
  const contextWindow = systemLogs?.contextWindowSize || "8k";

  // Suggest picks directly from taste calibration modal
  const handleSuggestPicks = (taste) => {
    setActiveTaste(taste);
    setShowTasteModal(false);
    setShowBottomToast(false);
    try {
      sessionStorage.setItem("watchvibe_toast_dismissed", "true");
    } catch (e) {}

    const vibeNames = taste.activeVibes?.map(v => v.name).join(" & ") || "Personalized Curated";
    const promptText = `Suggest top-rated ${vibeNames} movies (rated ★${taste.minRating}+)`;

    setHasInteracted(true);
    const userMsgId = String(Date.now());
    const nextMessages = [
      ...messages.filter(m => m.id !== "init"),
      { id: userMsgId, sender: "user", text: promptText }
    ];
    setMessages(nextMessages);

    const historyPayload = nextMessages.map(m => ({
      role: m.sender === "ai" ? "assistant" : "user",
      content: m.text
    }));

    const typedEntities = [
      ...(taste.genres || []).map(g => ({ label: "Genre", name: g })),
      ...(taste.themes || []).map(t => ({ label: "Theme", name: t }))
    ];

    const statePayload = {
      entities: typedEntities,
      filters: {
        ratingMin: taste.minRating,
        yearMin: null,
        yearMax: null,
        excludeGenres: []
      }
    };

    onRunQuery?.(promptText, historyPayload, statePayload);
  };

  // Apply taste calibration preferences without immediately executing search
  const handleApplyTaste = (taste) => {
    setActiveTaste(taste);
    setShowTasteModal(false);
    setShowBottomToast(false);
    try {
      sessionStorage.setItem("watchvibe_toast_dismissed", "true");
    } catch (e) {}

    const vibeNames = taste.activeVibes?.map(v => v.name).join(", ") || "custom preferences";
    setMessages(prev => [
      ...prev,
      {
        id: `ai-taste-${Date.now()}`,
        sender: "ai",
        text: `✨ Taste preferences calibrated for **${vibeNames}** with a quality baseline of ★${taste.minRating}+. What kind of movie experience would you like to explore?`
      }
    ]);
  };

  // Clear taste calibration preferences
  const handleClearTaste = () => {
    setActiveTaste(null);
    try {
      localStorage.removeItem("watchvibe_custom_vibes");
      localStorage.removeItem("watchvibe_min_rating");
    } catch (e) {
      console.warn("Could not clear taste in localStorage", e);
    }
    setMessages((prev) => [
      ...prev,
      {
        id: `ai-taste-cleared-${Date.now()}`,
        sender: "ai",
        text: "✨ Taste preferences cleared. WatchVibe is now exploring across all genres and quality baselines without constraints."
      }
    ]);
  };

  // Chat message submit handler
  const handleChatSubmit = (e) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || loadingRecommendations) return;

    setChatInput("");
    setHasInteracted(true);

    const userMsgId = String(Date.now());
    const nextMessages = [
      ...messages,
      { id: userMsgId, sender: "user", text }
    ];
    setMessages(nextMessages);
    const historyPayload = nextMessages
      .filter((m) => m.id !== "init")
      .map((m) => ({
        role: m.sender === "ai" ? "assistant" : "user",
        content: m.text
      }));

    // Keep user's calibrated taste preferences active across queries until explicitly cleared
    let statePayload = null;
    if (activeTaste && activeTaste.selectedIds?.length > 0) {
      const lowerText = text.toLowerCase();
      const isTasteSpecificQuery = lowerText.includes("my taste") || 
                                   lowerText.includes("my preference") || 
                                   lowerText.includes("based on my") ||
                                   lowerText.includes("calibrated") ||
                                   /^(suggest|give me|show me|find|recommend)\s+(some\s+)?(picks|movies|films|recommendations)?$/i.test(lowerText.trim());

      // If user asks for general picks or taste picks, inject active genres & themes
      // If user asks for a specific topic (e.g. "patriotic movies" or "romantic comedies"),
      // keep the quality baseline ratingMin while letting the topic determine genres
      const activeEntities = isTasteSpecificQuery
        ? [
            ...(activeTaste.genres || []).map(g => ({ label: "Genre", name: g })),
            ...(activeTaste.themes || []).map(t => ({ label: "Theme", name: t }))
          ]
        : [];

      statePayload = {
        entities: activeEntities,
        filters: {
          ratingMin: typeof activeTaste.minRating === "number" ? activeTaste.minRating : null
        }
      };
    }

    // Trigger recommendation pipeline with conversational history & active preferences
    onRunQuery?.(text, historyPayload, statePayload);
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(prev + 8, recommendations.length));
  };

  const handleResetSession = () => {
    lastSyncedMessageRef.current = null;
    setMessages([
      {
        id: "init",
        sender: "ai",
        text: "Welcome to WatchVibe AI. Tell me what kind of movie experience you are looking for—by mood, tone, director, or blend two films together."
      }
    ]);
    setHasInteracted(false);
    setChatInput("");
    onResetSession?.();
  };

  return (
    <div className="studio-container">
      <div className={`studio-layout ${hasInteracted ? "studio-layout--split" : "studio-layout--centered"}`}>
        
        {/* LEFT / CENTER COLUMN: Conversational Copilot & Chat Deck */}
        <section className={`studio-deck glass-panel ${hasInteracted ? "studio-deck--active" : "studio-deck--centered"}`}>
          
          {/* Header */}
          <div className="deck-head">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", gap: "12px" }}>
              <div>
                <p className="eyebrow">Conversational Copilot</p>
                <h2>{hasInteracted ? "Conversational Discovery" : "What do you feel like watching tonight?"}</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowTasteModal(true)}
                  className={`studio-taste-calibrate-btn ${activeTaste?.selectedIds?.length > 0 ? "studio-taste-calibrate-btn--active" : ""}`}
                  title={
                    activeTaste?.selectedIds?.length > 0
                      ? `Taste Active: ${activeTaste.activeVibes?.map(v => v.name).join(", ")} (★${activeTaste.minRating}+)`
                      : "Calibrate your cinematic taste preferences"
                  }
                >
                  <span className="sparkle-icon">✨</span>
                  <span>
                    {activeTaste?.selectedIds?.length > 0
                      ? `Taste: ★${activeTaste.minRating}+ (${activeTaste.selectedIds.length})`
                      : "Taste Preferences"}
                  </span>
                </button>
                {activeTaste?.selectedIds?.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearTaste}
                    className="studio-taste-clear-chip"
                    title="Clear taste preferences"
                    aria-label="Clear taste preferences"
                  >
                    ✕
                  </button>
                )}
                {hasInteracted && (
                  <button
                    type="button"
                    onClick={handleResetSession}
                    className="studio-reset-btn"
                    title="Reset conversation and start fresh discovery"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                    <span>New Session</span>
                  </button>
                )}
              </div>
            </div>
            {!hasInteracted && (
              <p className="deck-subtitle" style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.94rem", marginTop: "6px" }}>
                Ask naturally by mood, tone, favorite director, or blend two films together.
              </p>
            )}
          </div>

          {/* Chat Conversational Box */}
          <div className="studio-chat-wrapper">
            
            {/* Chat Stream (Messages History) */}
            <div className="studio-chat-stream">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`chat-bubble ${msg.sender === "user" ? "chat-bubble--user" : "chat-bubble--ai"}`}
                >
                  {msg.sender === "ai" && <span className="ai-avatar">WV</span>}
                  <div className="chat-bubble__content">
                    <p>{msg.text}</p>
                  </div>
                </div>
              ))}
              {loadingRecommendations && (
                <div className="chat-bubble chat-bubble--ai chat-bubble--thinking">
                  <span className="ai-avatar">WV</span>
                  <div className="chat-bubble__content thinking-bubble-content">
                    <div className="thinking-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span className="thinking-label">Traversing knowledge graph & analyzing cinematic vibes...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* ChatGPT-style Floating Input Bar with Blue Up-Arrow */}
            <form className="studio-chat-input-bar" onSubmit={handleChatSubmit}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask or refine (e.g., 'movies like Inception but less violent')..."
                aria-label="Movie chat input"
              />
              <button 
                type="submit" 
                className="chat-send-arrow-btn" 
                title="Send message"
                disabled={loadingRecommendations || !chatInput.trim()}
                aria-label="Send message"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </button>
            </form>

          </div>

          {/* Quick Starter Chips (Visible on First-Time Centered Landing) */}
          {!hasInteracted && (
            <div className="studio-starter-chips">
              {[
                "Mind-bending thrillers like Inception",
                "Atmospheric sci-fi with Zimmer scores",
                "Slow-burn psychological neo-noir",
                "90s nostalgic high-octane action"
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    const userMsgId = String(Date.now());
                    const nextMessages = [...messages, { id: userMsgId, sender: "user", text: chip }];
                    setMessages(nextMessages);
                    setHasInteracted(true);
                    const historyPayload = nextMessages
                      .filter((m) => m.id !== "init")
                      .map((m) => ({
                        role: m.sender === "ai" ? "assistant" : "user",
                        content: m.text
                      }));
                    onRunQuery?.(chip, historyPayload);
                  }}
                  className="starter-chip"
                >
                  {chip} →
                </button>
              ))}
            </div>
          )}

          {/* TELEMETRY BAR: Below Chat Box - ONLY VISIBLE AFTER FIRST INTERACTION */}
          {hasInteracted && (
            <div className="studio-telemetry-bar animate-fade-in">
              <div className="telemetry-badges-cluster">
                <span className="telemetry-badge confidence-badge" title="Overall Match Confidence">
                  <span className="badge-dot"></span>
                  Confidence: <strong>{confidenceScore}</strong>
                </span>

                <span className={`telemetry-badge ${isCache ? "cache-hit" : "cold-compute"}`}>
                  {isCache ? "⚡ Redis Cache Hit" : "❄️ Cold Compute"}
                </span>

                <span className="telemetry-badge latency-badge">
                  {typeof latency === "number" ? `${latency}ms` : latency}
                </span>
              </div>

              {/* Arrow Button to Open Telemetry Modal */}
              <button 
                type="button" 
                className="telemetry-modal-trigger"
                onClick={() => setShowTelemetryModal(true)}
                title="Open full system logs, parsed intent, and runtime observability"
              >
                <span>Telemetry</span>
                <span className="telemetry-arrow">→</span>
              </button>
            </div>
          )}

        </section>

        {/* RIGHT COLUMN: Cinematic Matches (Persistent grid slot for smooth gliding) */}
        <section className={`studio-results glass-panel ${hasInteracted ? "studio-results--visible" : "studio-results--hidden"}`}>
          {hasInteracted && (
            <>
              {/* HIDE HEADER COMPLETELY DURING LOADING */}
              {!loadingRecommendations && (recommendations.length > 0 || relaxedMatches.length > 0) && (
                <div className="panel-heading panel-heading--compact">
                  <div>
                    <p className="eyebrow">Recommendations</p>
                    <h2>{recommendations.length > 0 ? "Cinematic Matches" : "Adjacent Recommendations"}</h2>
                  </div>
                  {recommendations.length > 0 && (
                    <span className="results-counter">
                      Showing {visibleRecommendations.length} of {recommendations.length}
                    </span>
                  )}
                </div>
              )}

              {/* LOADER WITH PROCESSING STATUS & SOUNDWAVE BARS */}
              {loadingRecommendations && (
                <div className="studio-loading-state" style={{ minHeight: "420px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CircularPipelineLoader 
                    queryLabel={messages.filter(m => m.sender === "user").slice(-1)[0]?.text || query}
                  />
                </div>
              )}

              {!loadingRecommendations && recommendations.length === 0 && relaxedMatches.length === 0 && (
                <div className="empty-state">
                  <p>No cinematic matches found for the specified criteria. Try broadening your request.</p>
                </div>
              )}

              {/* FREE-FLOW POSTER GRID */}
              {!loadingRecommendations && (visibleRecommendations.length > 0 || relaxedMatches.length > 0) && (
                <div className="studio-results-scrollable">
                  {visibleRecommendations.length > 0 && (
                    <CinematicPosterGrid
                      movies={recommendations}
                      visibleCount={visibleCount}
                      onLoadMore={handleLoadMore}
                      onSelectMovie={(movie) => setSelectedInspectionMovie(movie)}
                    />
                  )}

                  {/* DUAL-TIER RELAXED / ADJACENT MATCHES */}
                  {relaxedMatches.length > 0 && (
                    <div className="relaxed-matches-container">
                      <div className="relaxed-matches-header">
                        <div className="relaxed-badge">
                          <span className="relaxed-dot"></span>
                          <span>Adjacent Recommendations</span>
                        </div>
                        <h3 className="relaxed-matches-title">Would you like to explore these adjacent titles?</h3>
                        <p className="relaxed-matches-desc">
                          Curated cinematic titles that share tonal DNA, stylistic mood, or director aesthetics, relaxed beyond your strict filter criteria.
                        </p>
                      </div>
                      <CinematicPosterGrid
                        movies={relaxedMatches}
                        visibleCount={relaxedMatches.length}
                        onSelectMovie={(movie) => setSelectedInspectionMovie(movie)}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

      </div>

      {/* POPUP TELEMETRY MODAL (ORIGINAL HACKATHON DASHBOARD METRICS) */}
      {showTelemetryModal && (
        <div 
          className="telemetry-modal-backdrop"
          onClick={() => setShowTelemetryModal(false)}
        >
          <div 
            className="telemetry-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="telemetry-modal-header">
              <h3 className="telemetry-modal-title">
                <span className="telemetry-live-dot"></span>
                Query Orchestration Telemetry & Observability
              </h3>
              <button 
                type="button" 
                className="telemetry-modal-close"
                onClick={() => setShowTelemetryModal(false)}
                aria-label="Close telemetry modal"
              >
                ✕
              </button>
            </div>

            {/* 3 Telemetry Cards matching Hackathon Dashboard */}
            <div className="telemetry-grid">
              
              {/* CARD 1: PARSED INTENT */}
              <div className="telemetry-section-card">
                <h4 className="telemetry-section-title">Parsed Intent</h4>
                
                <div className="telemetry-row">
                  <span className="telemetry-key">Genres</span>
                  <span className="telemetry-val">
                    {parsedIntent.genres?.length ? parsedIntent.genres.join(", ") : "—"}
                  </span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Moods</span>
                  <span className="telemetry-val">
                    {parsedIntent.moods?.length ? parsedIntent.moods.join(", ") : "—"}
                  </span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Reference</span>
                  <span className="telemetry-val">
                    {parsedIntent.reference || "—"}
                  </span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">RAG Source</span>
                  <span className="telemetry-val rag-pill">
                    {parsedIntent.ragSource || "Grounded GraphRAG"}
                  </span>
                </div>
              </div>

              {/* CARD 2: RUNTIME METRICS */}
              <div className="telemetry-section-card">
                <h4 className="telemetry-section-title">Runtime Metrics</h4>

                <div className="telemetry-row">
                  <span className="telemetry-key">Cache Status</span>
                  <span className={`telemetry-val ${isCache ? "text-emerald-400" : "text-amber-400"}`}>
                    {isCache ? "⚡ Redis Cache Hit" : "❄️ Cold Compute"}
                  </span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Latency</span>
                  <span className="telemetry-val">
                    {typeof latency === "number" ? `${latency}ms` : latency}
                  </span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Tokens</span>
                  <span className="telemetry-val">{tokenCount}</span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Cost</span>
                  <span className="telemetry-val">{cost}</span>
                </div>
              </div>

              {/* CARD 3: OBSERVABILITY / AI SYSTEM LOGS */}
              <div className="telemetry-section-card">
                <h4 className="telemetry-section-title">Observability</h4>

                <div className="telemetry-row">
                  <span className="telemetry-key">GPU Utilization</span>
                  <span className="telemetry-val">{gpuUtil}</span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Token Throughput</span>
                  <span className="telemetry-val">{tokenThroughput}</span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Context Window</span>
                  <span className="telemetry-val">{contextWindow}</span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-key">Confidence</span>
                  <span className="telemetry-val text-cyan-400">{confidenceScore}</span>
                </div>
              </div>

            </div>

            {/* Modal Bottom Footer */}
            <div className="telemetry-modal-footer">
              <span className="telemetry-footer-hint">
                Deterministic Neo4j Cypher Traversal & Pinecone 1024-dim Cosine Vector Search
              </span>
              <button 
                type="button" 
                className="telemetry-footer-btn"
                onClick={() => setShowTelemetryModal(false)}
              >
                Close View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RICH CINEMATIC INSPECTION MODAL */}
      {selectedInspectionMovie && (
        <MovieInspectionModal
          movie={selectedInspectionMovie}
          onClose={() => setSelectedInspectionMovie(null)}
        />
      )}

      {/* TASTE CUSTOMIZATION MODAL */}
      <TasteCustomizationModal
        isOpen={showTasteModal}
        onClose={() => setShowTasteModal(false)}
        onApplyTaste={handleApplyTaste}
        onSuggestPicks={handleSuggestPicks}
        onClearTaste={handleClearTaste}
        activeTaste={activeTaste}
      />

      {/* BOTTOM FLOATING CUSTOMIZATION TOAST CAPSULE */}
      <BottomCustomizationToast
        isOpen={showBottomToast && !showTasteModal}
        onOpenCustomization={() => {
          setShowBottomToast(false);
          setShowTasteModal(true);
          try {
            sessionStorage.setItem("watchvibe_toast_dismissed", "true");
          } catch (e) {}
        }}
        onDismiss={() => {
          setShowBottomToast(false);
          try {
            sessionStorage.setItem("watchvibe_toast_dismissed", "true");
          } catch (e) {}
        }}
      />
    </div>
  );
}
