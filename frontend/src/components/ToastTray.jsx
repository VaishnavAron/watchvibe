function ToastTray({ toasts, onDismiss }) {
  return (
    <div className="toast-tray" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast--${toast.type}`}>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button type="button" className="toast__dismiss" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            ×
          </button>
        </article>
      ))}
    </div>
  );
}

export default ToastTray;
