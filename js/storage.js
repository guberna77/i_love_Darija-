// Stockage local (sur le téléphone uniquement) : réglages et cours enregistrés.

const SETTINGS_KEY = "ild.settings";
const SESSIONS_KEY = "ild.sessions";

export const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "claude-opus-5-5",
  target: "pl",
  speechLang: "ar-MA",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) });
export const saveSettings = (s) => write(SETTINGS_KEY, s);

export const loadSessions = () => read(SESSIONS_KEY, []);
export const saveSessions = (list) => write(SESSIONS_KEY, list);

export function upsertSession(session) {
  const list = loadSessions();
  const i = list.findIndex((s) => s.id === session.id);
  if (i >= 0) list[i] = session;
  else list.unshift(session);
  return saveSessions(list);
}

export function deleteSession(id) {
  saveSessions(loadSessions().filter((s) => s.id !== id));
}
