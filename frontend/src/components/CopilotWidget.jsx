import React from "react";

export default function CopilotWidget({ onOpenStudio }) {
  return (
    <button 
      type="button"
      className="copilot-floating-pill"
      onClick={onOpenStudio}
      title="Open WatchVibe Conversational AI Copilot"
      aria-label="Open AI Copilot"
    >
      <span className="copilot-icon">💬</span>
      <span className="copilot-text">Ask Film Copilot</span>
    </button>
  );
}
