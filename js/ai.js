// Côté page : envoie le travail au Web Worker (IA locale) et reçoit les résultats.

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const pending = new Map();
let nextId = 1;
let progressHandler = null;

worker.onmessage = ({ data: m }) => {
  if (m.type === "progress") return progressHandler?.(m);
  const job = pending.get(m.id);
  if (!job) return;
  if (m.type === "transcript") return job.onTranscript?.(m.src);
  pending.delete(m.id);
  m.type === "error" ? job.reject(new Error(m.message)) : job.resolve(m);
};

worker.onerror = (e) => {
  for (const job of pending.values()) job.reject(new Error(e.message || "Worker error"));
  pending.clear();
};

function send(msg, extra = {}, transfer = []) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, ...extra });
    worker.postMessage({ ...msg, id }, transfer);
  });
}

export const onProgress = (fn) => (progressHandler = fn);

/** Download (or load from cache) both models. */
export const preload = (settings) => send({ type: "preload", whisper: settings.whisper });

/** Audio → { src, tr }. onTranscript fires as soon as the text is recognised. */
export const transcribe = (audio, settings, onTranscript) =>
  send(
    { type: "transcribe", audio, whisper: settings.whisper, language: settings.speechLang, target: settings.target },
    { onTranscript },
    [audio.buffer],
  );

/** Text → { tr }. */
export const translateText = (text, settings) => send({ type: "translate", text, target: settings.target });

/** Turn a technical error into a Polish sentence. */
export function explainError(err) {
  const m = err?.message || String(err);
  if (/fetch|network|Failed to load|NetworkError/i.test(m))
    return "Brak modelu w pamięci i brak internetu. Pobierz modele w ⚙️ Ustawieniach (przez Wi-Fi).";
  if (/memory|allocation|OOM/i.test(m))
    return "Za mało pamięci w telefonie. Wybierz model „whisper-base” w ⚙️ Ustawieniach i zamknij inne aplikacje.";
  return "Błąd: " + m;
}
