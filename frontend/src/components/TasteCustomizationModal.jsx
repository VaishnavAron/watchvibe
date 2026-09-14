// frontend/src/components/TasteCustomizationModal.jsx
import React, { useState, useEffect } from "react";

export const VIBE_ARCHETYPES = [
  {
    id: "mind_bending_scifi",
    name: "Mind-Bending Sci-Fi",
    tagline: "Quantum paradoxes, cosmic scale & Zimmer scores",
    posterUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80",
    genres: ["science fiction", "mystery"],
    themes: ["mind bending plot twists", "space exploration", "time loop"]
  },
  {
    id: "dark_neonoir",
    name: "Dark Psychological Noir",
    tagline: "Shadowy morals, cerebral tension & shocking twists",
    posterUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    genres: ["thriller", "crime"],
    themes: ["psychological", "neo-noir", "gritty", "plot twist"]
  },
  {
    id: "high_octane_action",
    name: "High-Octane Adrenaline",
    tagline: "Furious choreography, high stakes & superhero epics",
    posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
    genres: ["action", "adventure"],
    themes: ["superhero", "heroic sacrifice", "explosive", "martial arts"]
  },
  {
    id: "heartwarming_indie",
    name: "Heartwarming & Coming-of-Age",
    tagline: "Authentic human connection, humor & soul",
    posterUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
    genres: ["drama", "comedy"],
    themes: ["coming of age", "family", "uplifting", "heartwarming"]
  },
  {
    id: "epic_worldbuilding",
    name: "Mythic Fantasy & Epics",
    tagline: "Immersive lore, grand dynasties & quest journeys",
    posterUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    genres: ["fantasy", "adventure"],
    themes: ["world-building", "mythic", "dynasty", "ancient lore"]
  },
  {
    id: "atmospheric_horror",
    name: "Atmospheric Chills & Dread",
    tagline: "Slow-burn suspense, cosmic horror & unholy terror",
    posterUrl: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=600&auto=format&fit=crop&q=80",
    genres: ["horror", "thriller"],
    themes: ["supernatural", "psychological horror", "slow burn", "atmospheric"]
  },
  {
    id: "witty_satire_crime",
    name: "Sharp Wit & Caper Mysteries",
    tagline: "Whodunits, buddy banter & eccentric puzzles",
    posterUrl: "https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=600&auto=format&fit=crop&q=80",
    genres: ["comedy", "mystery"],
    themes: ["whodunit", "buddy cop", "satire", "heist"]
  },
  {
    id: "visual_spectacle_anime",
    name: "Cinematic Animation & Anime",
    tagline: "Visual feasts, transcendent art & emotional depth",
    posterUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
    genres: ["animation", "fantasy"],
    themes: ["anime", "visual spectacle", "surreal", "emotional arc"]
  }
];

export default function TasteCustomizationModal({
  isOpen,
  onClose,
  onApplyTaste,
  onSuggestPicks,
  onClearTaste,
  activeTaste
}) {
  const [selectedIds, setSelectedIds] = useState(() => {
    if (activeTaste?.selectedIds && Array.isArray(activeTaste.selectedIds)) {
      return activeTaste.selectedIds;
    }
    try {
      const stored = localStorage.getItem("watchvibe_custom_vibes");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [minRating, setMinRating] = useState(() => {
    if (typeof activeTaste?.minRating === "number") {
      return activeTaste.minRating;
    }
    try {
      const stored = localStorage.getItem("watchvibe_min_rating");
      return stored ? Number(stored) : 7.0;
    } catch {
      return 7.0;
    }
  });

  // Sync state whenever modal opens or activeTaste changes
  useEffect(() => {
    if (isOpen) {
      if (activeTaste?.selectedIds) {
        setSelectedIds(activeTaste.selectedIds);
        setMinRating(typeof activeTaste.minRating === "number" ? activeTaste.minRating : 7.0);
      } else {
        try {
          const stored = localStorage.getItem("watchvibe_custom_vibes");
          const minR = localStorage.getItem("watchvibe_min_rating");
          setSelectedIds(stored ? JSON.parse(stored) : []);
          setMinRating(minR ? Number(minR) : 7.0);
        } catch {
          setSelectedIds([]);
          setMinRating(7.0);
        }
      }
    }
  }, [isOpen, activeTaste]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleVibe = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  const getTastePayload = () => {
    const activeVibes = VIBE_ARCHETYPES.filter((v) => selectedIds.includes(v.id));
    const combinedThemes = Array.from(new Set(activeVibes.flatMap((v) => v.themes)));
    const combinedGenres = Array.from(new Set(activeVibes.flatMap((v) => v.genres)));

    try {
      localStorage.setItem("watchvibe_custom_vibes", JSON.stringify(selectedIds));
      localStorage.setItem("watchvibe_min_rating", String(minRating));
    } catch (e) {
      console.warn("Could not save taste to localStorage", e);
    }

    return {
      selectedIds,
      genres: combinedGenres,
      themes: combinedThemes,
      minRating,
      activeVibes
    };
  };

  const handleSave = () => {
    const payload = getTastePayload();
    onApplyTaste?.(payload);
    onClose?.();
  };

  const handleSuggest = () => {
    const payload = getTastePayload();
    onSuggestPicks?.(payload);
    onClose?.();
  };

  const handleClear = () => {
    setSelectedIds([]);
    setMinRating(7.0);
    try {
      localStorage.removeItem("watchvibe_custom_vibes");
      localStorage.removeItem("watchvibe_min_rating");
    } catch (e) {
      console.warn("Could not clear taste from localStorage", e);
    }
    onClearTaste?.();
    onClose?.();
  };

  return (
    <div className="taste-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="taste-modal-panel glass-panel animate-glide-in" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="taste-modal-header">
          <div>
            <div className="taste-kicker-cluster">
              <span className="sparkle-glow">✨</span>
              <p className="eyebrow">Personal Taste Calibration</p>
            </div>
            <h2>Calibrate Your Personal Cinematic Vibe</h2>
            <p className="taste-modal-subtitle">
              Select 1 to 3 archetypes that match your mood. WatchVibe tunes knowledge graph weights and vector proximity in real-time.
            </p>
          </div>
          <button type="button" className="taste-modal-close-btn" onClick={onClose} aria-label="Close taste modal">
            ✕
          </button>
        </div>

        {/* Archetype Grid */}
        <div className="taste-archetypes-grid">
          {VIBE_ARCHETYPES.map((vibe) => {
            const isSelected = selectedIds.includes(vibe.id);
            return (
              <div
                key={vibe.id}
                className={`taste-card ${isSelected ? "taste-card--selected" : ""}`}
                onClick={() => toggleVibe(vibe.id)}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleVibe(vibe.id); }}
              >
                <div className="taste-card__image-wrap">
                  <img src={vibe.posterUrl} alt={vibe.name} className="taste-card__image" loading="lazy" />
                  <div className="taste-card__gradient" />
                  {isSelected && (
                    <div className="taste-card__check-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="taste-card__content">
                  <h4 className="taste-card__title">{vibe.name}</h4>
                  <p className="taste-card__tagline">{vibe.tagline}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Minimum Rating Slider Guardrail */}
        <div className="taste-rating-bar">
          <div className="taste-rating-info">
            <span className="taste-rating-label">Quality Baseline</span>
            <span className="taste-rating-val">★ {minRating.toFixed(1)} & above</span>
          </div>
          <input
            type="range"
            min="6.0"
            max="8.2"
            step="0.2"
            value={minRating}
            onChange={(e) => setMinRating(parseFloat(e.target.value))}
            className="taste-rating-slider"
          />
        </div>

        {/* Footer Actions: Clear Preferences, Cancel, Apply Preferences, and Suggest Picks */}
        <div className="taste-modal-footer">
          <button
            type="button"
            className="taste-modal-clear-btn"
            onClick={handleClear}
            disabled={selectedIds.length === 0 && minRating === 7.0}
            title="Clear all calibrated taste preferences and quality baselines"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Clear Preferences</span>
          </button>

          <div className="taste-modal-footer__right">
            <button type="button" className="taste-modal-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="taste-modal-apply-btn"
              onClick={handleSave}
              disabled={selectedIds.length === 0}
              title="Save preferences for upcoming queries"
            >
              Apply Preferences
            </button>
            <button
              type="button"
              className="taste-modal-suggest-btn"
              onClick={handleSuggest}
              disabled={selectedIds.length === 0}
              title="Immediately discover films matching your taste"
            >
              <span>✨</span> Suggest Picks for My Taste →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
