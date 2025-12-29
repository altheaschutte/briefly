let dismissTimer: number | null = null;

export function showErrorSnackbar(message: string, durationMs = 3500) {
  if (typeof window === "undefined") return;

  const existing = document.getElementById("briefly-snackbar");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "briefly-snackbar";
  el.textContent = message;

  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "22px",
    transform: "translateX(-50%)",
    background: "rgba(17, 24, 39, 0.95)",
    color: "#fff",
    padding: "12px 16px",
    borderRadius: "14px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    fontSize: "14px",
    maxWidth: "90vw",
    zIndex: "9999",
    textAlign: "center",
    pointerEvents: "auto",
  });

  document.body.appendChild(el);

  if (dismissTimer) {
    window.clearTimeout(dismissTimer);
  }
  dismissTimer = window.setTimeout(() => {
    el.remove();
    dismissTimer = null;
  }, durationMs);

  el.addEventListener("click", () => {
    el.remove();
    if (dismissTimer) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  });
}
