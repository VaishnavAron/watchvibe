// frontend/src/components/BottomCustomizationToast.jsx
import React from "react";

export default function BottomCustomizationToast({
  isOpen,
  onOpenCustomization,
  onDismiss
}) {
  if (!isOpen) return null;

  return (
    <div className="bottom-customization-toast animate-slide-up" role="region" aria-label="Taste calibration suggestion">
      <div className="bottom-toast-content">
        <div className="bottom-toast-icon">
          <span>✨</span>
        </div>
        <div className="bottom-toast-text">
          <p className="bottom-toast-title">Calibrate Your Experience</p>
          <p className="bottom-toast-sub">Would you like to customize your personal vibe & quality baselines?</p>
        </div>
      </div>

      <div className="bottom-toast-actions">
        <button
          type="button"
          className="bottom-toast-cta-btn"
          onClick={onOpenCustomization}
        >
          Customize Vibe →
        </button>
        <button
          type="button"
          className="bottom-toast-close-btn"
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
