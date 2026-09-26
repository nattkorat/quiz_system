const API = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

export const getToken = () => localStorage.getItem("quizforge_token");
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem("quizforge_user") || "null"); } catch { return null; }
};
export const setUser = user => localStorage.setItem("quizforge_user", JSON.stringify(user));
export const setAuth = (data) => {
  localStorage.setItem("quizforge_token", data.access_token);
  setUser(data.user);
};
export const clearAuth = () => {
  localStorage.removeItem("quizforge_token");
  localStorage.removeItem("quizforge_user");
};

export async function api(path, options = {}) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = "Something went wrong";
    try {
      const body = await response.json();
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch { /* response was not JSON */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

export function socketUrl(sessionId, params) {
  const base = (import.meta.env.VITE_WS_URL || `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`).replace(/\/+$/, "");
  return `${base}/ws/sessions/${sessionId}?${new URLSearchParams(params)}`;
}

export async function downloadExport(sessionId, format) {
  const response = await fetch(`${API}/sessions/${sessionId}/export?format=${format}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) throw new Error("Export failed");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="(.+)"/)?.[1] || `quiz-results.${format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}
