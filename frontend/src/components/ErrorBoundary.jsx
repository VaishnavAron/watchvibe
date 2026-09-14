import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("WatchVibe ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.href = "/discover";
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: "420px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            textAlign: "center",
            color: "#e2e8f0"
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              background: "rgba(18, 22, 34, 0.9)",
              border: "1px solid rgba(255, 107, 44, 0.3)",
              borderRadius: "16px",
              padding: "36px 28px",
              backdropFilter: "blur(12px)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)"
            }}
          >
            <span style={{ fontSize: "2.5rem", marginBottom: "16px", display: "inline-block" }}>🎬</span>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0 0 10px", color: "#fff" }}>
              Something interrupted this view
            </h2>
            <p style={{ fontSize: "0.95rem", color: "#94a3b8", lineHeight: 1.5, margin: "0 0 24px" }}>
              We encountered a display issue while rendering this section. Your session and saved data are intact.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  background: "linear-gradient(135deg, #ff6b2c, #e05316)",
                  color: "#fff",
                  border: "none",
                  padding: "10px 22px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(255, 107, 44, 0.4)"
                }}
              >
                Return to Discover
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontWeight: 500,
                  fontSize: "0.95rem",
                  cursor: "pointer"
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
