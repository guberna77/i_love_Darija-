import { ask, explainError } from "./claude.js";
import { LectureListener, speechSupported } from "./speech.js";
import { DENTAL, DARIJA } from "./glossary.js";
import { md } from "./markdown.js";
import {
  loadSettings, saveSettings, loadSessions, upsertSession, deleteSession,
} from "./storage.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let settings = loadSettings();

// ---------- helpers ----------
function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

/** Render Claude output; the "📌" line gets its own style. */
function renderAnswer(el, text) {
  const html = md(text);
  el.innerHTML = html.replace(/<p>📌(.*?)<\/p>/g, '<p class="term-line">📌$1</p>');
}

function makeItem(feed, { src, prepend = true } = {}) {
  const item = document.createElement("article");
  item.className = "item";
  if (src) {
    const s = document.createElement("div");
    s.className = "src";
    s.textContent = src;
    item.append(s);
  }
  const tr = document.createElement("div");
  tr.className = "tr loading";
  item.append(tr);
  prepend ? feed.prepend(item) : feed.append(item);
  return { item, tr };
}

function addCopy(item, getText) {
  const meta = document.createElement("div");
  meta.className = "meta";
  const b = document.createElement("button");
  b.textContent = "📋 Kopiuj";
  b.onclick = async () => {
    try { await navigator.clipboard.writeText(getText()); toast("Skopiowano"); }
    catch { toast("Nie udało się skopiować"); }
  };
  meta.append(b);
  item.append(meta);
}

async function run(tr, opts) {
  try {
    const text = await ask({ settings, ...opts, onText: (t) => renderAnswer(tr, t) });
    tr.classList.remove("loading");
    renderAnswer(tr, text);
    return text;
  } catch (err) {
    tr.classList.remove("loading");
    tr.innerHTML = `<p class="err">${explainError(err)}</p>`;
    throw err;
  }
}

// ---------- tabs ----------
function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "notes") renderNotes();
  window.scrollTo(0, 0);
}
$$(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// ---------- LIVE ----------
let listener = null;
let session = null; // { id, title, date, lang, items: [{src, tr}], summary }
let queue = Promise.resolve();

$("#speech-lang").value = settings.speechLang;
$("#speech-lang").onchange = (e) => {
  settings.speechLang = e.target.value;
  saveSettings(settings);
};

if (!speechSupported) {
  $("#btn-rec").disabled = true;
  $("#live-hint").textContent =
    "Ta przeglądarka nie obsługuje rozpoznawania mowy. Otwórz aplikację w Chrome (Android) lub Safari (iPhone).";
}

function persistSession() {
  if (!session) return;
  session.title = $("#lesson-title").value.trim() || session.title;
  if (!upsertSession(session)) toast("Pamięć telefonu pełna — usuń stare notatki.");
}

function contextFor(index) {
  return session.items.slice(Math.max(0, index - 3), index).map((x) => x.src).join(" … ");
}

function onChunk(src) {
  const index = session.items.length;
  const entry = { src, tr: "" };
  session.items.push(entry);
  const { item, tr } = makeItem($("#live-feed"), { src });
  // Translate one fragment at a time, in order, so context stays coherent.
  queue = queue.then(async () => {
    const ctx = contextFor(index);
    const content =
      (ctx ? `Preceding context (already translated, do not translate again): ${ctx}\n\n` : "") +
      `Speech recognizer language: ${settings.speechLang}\nLatest fragment: ${src}`;
    try {
      entry.tr = await run(tr, { mode: "live", content });
      addCopy(item, () => entry.tr);
    } catch { /* error already shown in the card */ }
    persistSession();
    $("#btn-summary").disabled = false;
  });
}

function startLecture() {
  if (!settings.apiKey) { toast("Najpierw dodaj klucz API w ⚙️ Ustawieniach."); showTab("settings"); return; }
  if (!session) {
    const now = new Date();
    session = {
      id: now.getTime().toString(36),
      title: $("#lesson-title").value.trim() || "Zajęcia " + now.toLocaleDateString("pl-PL"),
      date: now.toISOString(),
      lang: settings.speechLang,
      items: [],
      summary: "",
    };
    $("#live-feed").innerHTML = "";
  }
  listener = new LectureListener({
    lang: settings.speechLang,
    onChunk,
    onInterim: (t) => { $("#interim").hidden = !t; $("#interim").textContent = t; },
    onError: (msg) => { toast(msg, 6000); if (!listener?.running) stopLecture(); },
  });
  try {
    listener.start();
  } catch (e) {
    toast("Nie można uruchomić mikrofonu: " + e.message);
    return;
  }
  $("#btn-rec").textContent = "⏹️ Stop";
  $("#btn-rec").classList.add("recording");
  $("#speech-lang").disabled = true;
  navigator.wakeLock?.request("screen").then((l) => (startLecture.lock = l)).catch(() => {});
}

function stopLecture() {
  listener?.stop();
  listener = null;
  $("#btn-rec").textContent = "🎙️ Start";
  $("#btn-rec").classList.remove("recording");
  $("#speech-lang").disabled = false;
  $("#interim").hidden = true;
  startLecture.lock?.release?.().catch(() => {});
  persistSession();
}

$("#btn-rec").onclick = () => (listener ? stopLecture() : startLecture());

$("#btn-summary").onclick = async () => {
  if (!session?.items.length) return;
  await queue; // let pending fragments finish
  const transcript = session.items
    .map((x, i) => `[${i + 1}] ORIGINAL: ${x.src}\nTRANSLATION: ${x.tr}`)
    .join("\n\n");
  const { item, tr } = makeItem($("#live-feed"), { src: "📝 Podsumowanie zajęć" });
  item.scrollIntoView({ behavior: "smooth" });
  $("#btn-summary").disabled = true;
  try {
    session.summary = await run(tr, {
      mode: "summary",
      content: `Lesson title: ${session.title}\n\nTranscript:\n${transcript}`,
    });
    addCopy(item, () => session.summary);
    persistSession();
    toast("Zapisano w 🗂️ Notatkach");
  } catch {}
  $("#btn-summary").disabled = false;
};

// Keep the title saved while typing
$("#lesson-title").oninput = () => session && persistSession();

$("#btn-new").onclick = () => {
  if (listener) stopLecture();
  session = null;
  $("#live-feed").innerHTML = "";
  $("#lesson-title").value = "";
  $("#btn-summary").disabled = true;
  toast("Nowe zajęcia — poprzednie są w 🗂️ Notatkach");
};

// ---------- PHOTO ----------
function resizeImage(file, max = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Nie można odczytać zdjęcia"));
    img.src = URL.createObjectURL(file);
  });
}

$("#photo-input").onchange = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!settings.apiKey) { toast("Najpierw dodaj klucz API w ⚙️ Ustawieniach."); showTab("settings"); return; }
  let dataUrl;
  try { dataUrl = await resizeImage(file); } catch (err) { toast(err.message); return; }
  $("#photo-preview").src = dataUrl;
  $("#photo-preview").hidden = false;
  const { item, tr } = makeItem($("#photo-feed"), { src: "📷 " + new Date().toLocaleTimeString("pl-PL") });
  const content = [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: dataUrl.split(",")[1] } },
    { type: "text", text: "Przetłumacz to zdjęcie z zajęć." },
  ];
  try {
    const text = await run(tr, { mode: "image", content });
    addCopy(item, () => text);
  } catch {}
};

// ---------- TRANSLATE / ASK ----------
const chat = []; // tutor history

async function submitAsk(mode) {
  const q = $("#ask-input").value.trim();
  if (!q) return;
  if (!settings.apiKey) { toast("Najpierw dodaj klucz API w ⚙️ Ustawieniach."); showTab("settings"); return; }
  const { item, tr } = makeItem($("#ask-feed"), { src: (mode === "ask" ? "💬 " : "🔁 ") + q });
  $("#ask-input").value = "";
  try {
    const history = mode === "ask" ? chat.slice(-12) : [];
    const text = await run(tr, { mode, content: q, history });
    if (mode === "ask") chat.push({ role: "user", content: q }, { role: "assistant", content: text });
    addCopy(item, () => text);
  } catch {}
}
$("#btn-translate").onclick = () => submitAsk("text");
$("#btn-ask").onclick = () => submitAsk("ask");

// ---------- GLOSSARY ----------
let dict = "dental";
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function renderWords() {
  const q = norm($("#word-search").value.trim());
  const list = $("#word-list");
  $("#darija-help").hidden = dict === "dental";
  $("#flashcard").hidden = dict !== "cards";
  list.hidden = dict === "cards";
  if (dict === "cards") { nextCard(); return; }

  const rows = (dict === "dental" ? DENTAL : DARIJA).filter((w) =>
    !q || norm(Object.values(w).join(" ")).includes(q),
  );
  list.innerHTML = "";
  let cat = null;
  for (const w of rows) {
    if (w.cat !== cat) {
      cat = w.cat;
      const h = document.createElement("div");
      h.className = "word-cat";
      h.textContent = cat;
      list.append(h);
    }
    const el = document.createElement("div");
    el.className = "word";
    const a = document.createElement("div");
    a.className = "w1";
    a.textContent = w.fr || w.dj;
    if (w.ar) {
      const ar = document.createElement("span");
      ar.className = "ar";
      ar.textContent = w.ar;
      a.append(ar);
    }
    const b = document.createElement("div");
    b.className = "w2";
    b.textContent = w.pl;
    el.append(a, b);
    list.append(el);
  }
  if (!rows.length) list.innerHTML = '<p class="hint">Brak wyników. Zapytaj w zakładce 💬 Tłumacz.</p>';
}

function nextCard() {
  const pool = [...DENTAL.map((w) => ({ front: w.fr, back: w.pl })), ...DARIJA.map((w) => ({ front: w.dj, back: w.pl }))];
  const c = pool[Math.floor(Math.random() * pool.length)];
  $("#fc-front").textContent = c.front;
  $("#fc-back").textContent = c.back;
  $("#fc-back").hidden = true;
}
$("#fc-show").onclick = () => ($("#fc-back").hidden = false);
$("#fc-next").onclick = nextCard;

$$(".seg button").forEach((b) => (b.onclick = () => {
  dict = b.dataset.dict;
  $$(".seg button").forEach((x) => x.classList.toggle("on", x === b));
  renderWords();
}));
$("#word-search").oninput = () => {
  if (dict === "cards") { dict = "dental"; $$(".seg button").forEach((x) => x.classList.toggle("on", x.dataset.dict === "dental")); }
  renderWords();
};
renderWords();

// ---------- NOTES ----------
let openNote = null;

function renderNotes() {
  $("#note-view").hidden = true;
  const list = $("#notes-list");
  list.hidden = false;
  list.innerHTML = "";
  const sessions = loadSessions();
  if (!sessions.length) {
    list.innerHTML = '<div class="card"><p class="hint">Brak zapisanych zajęć. Nagraj pierwsze w zakładce 🎙️ Na żywo.</p></div>';
    return;
  }
  for (const s of sessions) {
    const b = document.createElement("button");
    b.className = "note";
    b.textContent = s.title;
    const small = document.createElement("small");
    small.textContent = `${new Date(s.date).toLocaleString("pl-PL")} · ${s.items.length} fragm.${s.summary ? " · 📝" : ""}`;
    b.append(small);
    b.onclick = () => showNote(s);
    list.append(b);
  }
}

function showNote(s) {
  openNote = s;
  $("#notes-list").hidden = true;
  $("#note-view").hidden = false;
  const body = $("#note-body");
  body.innerHTML = "";
  const h = document.createElement("h2");
  h.textContent = s.title;
  body.append(h);
  if (s.summary) {
    const { tr } = makeItem(body, { src: "📝 Podsumowanie", prepend: false });
    tr.classList.remove("loading");
    renderAnswer(tr, s.summary);
  }
  for (const x of s.items) {
    const { tr } = makeItem(body, { src: x.src, prepend: false });
    tr.classList.remove("loading");
    renderAnswer(tr, x.tr || "—");
  }
}

$("#note-back").onclick = renderNotes;
$("#note-delete").onclick = () => {
  if (openNote && confirm(`Usunąć „${openNote.title}”?`)) {
    deleteSession(openNote.id);
    if (session?.id === openNote.id) session = null;
    renderNotes();
  }
};
$("#note-export").onclick = () => {
  if (!openNote) return;
  const s = openNote;
  const txt =
    `${s.title}\n${new Date(s.date).toLocaleString("pl-PL")}\n\n` +
    (s.summary ? `=== PODSUMOWANIE ===\n${s.summary}\n\n` : "") +
    "=== TRANSKRYPCJA ===\n" +
    s.items.map((x) => `> ${x.src}\n${x.tr}\n`).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" }));
  a.download = s.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "_") + ".txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// ---------- SETTINGS ----------
$("#api-key").value = settings.apiKey;
$("#model").value = settings.model;
$("#target").value = settings.target;

function readSettingsForm() {
  settings = {
    ...settings,
    apiKey: $("#api-key").value.trim(),
    model: $("#model").value,
    target: $("#target").value,
  };
  saveSettings(settings);
}

$("#btn-save").onclick = () => {
  readSettingsForm();
  $("#settings-msg").textContent = "Zapisano ✔";
};

$("#btn-test").onclick = async () => {
  readSettingsForm();
  $("#settings-msg").textContent = "Testuję…";
  try {
    const t = await ask({ settings, mode: "text", content: "daba ghadi ncoulou l'empreinte b plâtre dur" });
    $("#settings-msg").textContent = "Działa ✔ — " + t.replace(/[*#]/g, "").trim().slice(0, 160);
  } catch (err) {
    $("#settings-msg").textContent = explainError(err);
  }
};

if (!settings.apiKey) showTab("settings");

// ---------- offline / PWA ----------
const updateNet = () => ($("#net").hidden = navigator.onLine);
addEventListener("online", updateNet);
addEventListener("offline", updateNet);
updateNet();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
