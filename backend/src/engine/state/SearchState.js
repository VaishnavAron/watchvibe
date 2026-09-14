// backend/src/engine/state/SearchState.js
/**
 * Canonical SearchState for WatchVibe Grounded GraphRAG.
 * Represents an immutable snapshot of search filters, active entities, and session constraints.
 */
export class SearchState {
  constructor(raw = {}) {
    const data = raw || {};
    this.interactionType = data.interactionType || "NEW_SEARCH";
    this.intentSummary = data.intentSummary || "";
    this.entities = Array.isArray(data.entities) ? [...data.entities] : [];
    this.referenceMovie = data.referenceMovie || null;
    this.franchise = data.franchise || null;
    
    // Deterministic Filters
    this.filters = {
      yearMin: typeof data.filters?.yearMin === "number" ? data.filters.yearMin : null,
      yearMax: typeof data.filters?.yearMax === "number" ? data.filters.yearMax : null,
      ratingMin: typeof data.filters?.ratingMin === "number" ? data.filters.ratingMin : null,
      excludeGenres: Array.isArray(data.filters?.excludeGenres) ? [...data.filters.excludeGenres] : [],
      region: data.filters?.region || null,
    };

    // Semantic Modifiers (more/less)
    this.modifiers = {
      more: Array.isArray(data.modifiers?.more) ? [...data.modifiers.more] : [],
      less: Array.isArray(data.modifiers?.less) ? [...data.modifiers.less] : [],
    };

    // Tier-1 Grounded Fields: Latent Vector Query & Canonical TMDB Genres
    this.vectorQuery = data.vectorQuery || "";
    this.canonicalGenres = Array.isArray(data.canonicalGenres) ? [...data.canonicalGenres] : [];

    this.turnIndex = typeof data.turnIndex === "number" ? data.turnIndex : 0;
  }

  /**
   * Factory for clean initial state
   */
  static createInitial(overrides = {}) {
    return new SearchState(overrides);
  }

  /**
   * Apply a deterministic action delta to the state, returning a new SearchState
   * @param {Object} action - Action emitted by IntentCompiler
   */
  applyAction(action) {
    const next = new SearchState(this.toJSON());
    next.turnIndex += 1;
    next.interactionType = action.interactionType || next.interactionType;
    next.intentSummary = action.intentSummary || next.intentSummary;

    switch (action.type) {
      case "NEW_SEARCH":
      case "SWITCH_TOPIC": {
        // Complete clean break: clear previous temporal filters and reference movie
        next.referenceMovie = action.referenceMovie || null;
        next.franchise = action.franchise || null;
        next.entities = action.entities || [];
        next.modifiers = {
          more: action.modifiers?.more || [],
          less: action.modifiers?.less || [],
        };
        next.filters = {
          yearMin: action.filters?.yearMin ?? null,
          yearMax: action.filters?.yearMax ?? null,
          ratingMin: action.filters?.ratingMin ?? null,
          excludeGenres: action.filters?.excludeGenres || [],
          region: action.filters?.region || null,
        };
        next.vectorQuery = action.vectorQuery || "";
        next.canonicalGenres = Array.isArray(action.canonicalGenres) ? [...action.canonicalGenres] : [];
        break;
      }

      case "REFINEMENT": {
        // Carry forward previous context, overlay new constraints
        if (action.referenceMovie !== undefined) next.referenceMovie = action.referenceMovie;
        if (action.franchise !== undefined) next.franchise = action.franchise;
        if (action.vectorQuery) next.vectorQuery = action.vectorQuery;
        if (Array.isArray(action.canonicalGenres) && action.canonicalGenres.length > 0) {
          next.canonicalGenres = Array.from(new Set([...next.canonicalGenres, ...action.canonicalGenres]));
        }
        
        // Merge or replace entities if new ones are introduced
        if (Array.isArray(action.entities) && action.entities.length > 0) {
          const existingNames = new Set(next.entities.map(e => `${e.label}:${e.name.toLowerCase()}`));
          for (const ent of action.entities) {
            const key = `${ent.label}:${ent.name.toLowerCase()}`;
            if (!existingNames.has(key)) {
              next.entities.push(ent);
              existingNames.add(key);
            }
          }
        }

        // Overlay temporal & rating constraints
        if (typeof action.filters?.yearMin === "number") next.filters.yearMin = action.filters.yearMin;
        if (typeof action.filters?.yearMax === "number") next.filters.yearMax = action.filters.yearMax;
        if (typeof action.filters?.ratingMin === "number") {
          next.filters.ratingMin = Math.max(next.filters.ratingMin || 0, action.filters.ratingMin);
        }
        if (Array.isArray(action.filters?.excludeGenres)) {
          const set = new Set([...next.filters.excludeGenres, ...action.filters.excludeGenres.map(g => g.toLowerCase())]);
          next.filters.excludeGenres = Array.from(set);
        }
        if (action.filters?.region) next.filters.region = action.filters.region;

        // Overlay modifiers
        if (Array.isArray(action.modifiers?.more)) {
          next.modifiers.more = Array.from(new Set([...next.modifiers.more, ...action.modifiers.more]));
        }
        if (Array.isArray(action.modifiers?.less)) {
          next.modifiers.less = Array.from(new Set([...next.modifiers.less, ...action.modifiers.less]));
        }
        break;
      }

      case "RESET_ALL": {
        return SearchState.createInitial();
      }

      default:
        break;
    }

    return next;
  }

  toJSON() {
    return {
      interactionType: this.interactionType,
      intentSummary: this.intentSummary,
      entities: [...this.entities],
      referenceMovie: this.referenceMovie,
      franchise: this.franchise,
      filters: { ...this.filters, excludeGenres: [...this.filters.excludeGenres] },
      modifiers: { more: [...this.modifiers.more], less: [...this.modifiers.less] },
      vectorQuery: this.vectorQuery,
      canonicalGenres: [...this.canonicalGenres],
      turnIndex: this.turnIndex,
    };
  }

  toHumanDescription() {
    const parts = [];
    if (this.franchise) parts.push(`Franchise: "${this.franchise}"`);
    if (this.referenceMovie) parts.push(`Reference: "${this.referenceMovie}"`);
    if (this.canonicalGenres.length) parts.push(`Genres: [${this.canonicalGenres.join(", ")}]`);
    if (this.entities.length) parts.push(`Entities: [${this.entities.map(e => `${e.label}:${e.name}`).join(", ")}]`);
    if (this.filters.yearMin || this.filters.yearMax) {
      parts.push(`Year: ${this.filters.yearMin || 'start'}–${this.filters.yearMax || 'present'}`);
    }
    if (this.filters.ratingMin) parts.push(`Rating ≥ ${this.filters.ratingMin}★`);
    if (this.filters.excludeGenres.length) parts.push(`Exclude: [${this.filters.excludeGenres.join(", ")}]`);
    if (this.vectorQuery) parts.push(`Vibe: "${this.vectorQuery.slice(0, 45)}..."`);
    return parts.join(" | ") || "Open Search";
  }
}
