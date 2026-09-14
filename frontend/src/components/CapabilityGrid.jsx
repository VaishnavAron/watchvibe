const capabilities = [
  {
    title: "Graph Reasoning",
    description: "Surface recommendations through shared actors, directors, and multi-hop relationships that feel intentional."
  },
  {
    title: "Semantic Search",
    description: "Handle human prompts like mood, tone, and constraints instead of forcing users into rigid filters."
  },
  {
    title: "Personalized Ranking",
    description: "Blend taste profile, similarity, and explainability into a recommendation flow that feels smarter over time."
  }
];

export default function CapabilityGrid() {
  return (
    <section className="capability-section">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Why It Feels Premium</p>
          <h2>Built around discovery, not just search</h2>
        </div>
        <p className="section-copy section-copy--compact">
          The strongest movie products feel editorial and intelligent at the same time. This layout is designed around that idea.
        </p>
      </div>

      <div className="capability-grid">
        {capabilities.map((capability) => (
          <article className="capability-card" key={capability.title}>
            <span className="capability-card__marker" />
            <h3>{capability.title}</h3>
            <p>{capability.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

