import { preload, transcribe, translateText, onProgress, explainError } from "./ai.js";
import { Recorder, micSupported } from "./recorder.js";
import { DENTAL, DARIJA, findTerms } from "./glossary.js";
import {
  loadSettings, saveSettings, loadSessions, upsertSession, deleteSession,
} from "./storage.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let settings = loadSettings();
const modelsReady = () => !!settings.ready?.[settings.whisper];

// ---------- helpers ----------
function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** A result card: original text (small), translation (big), glossary terms. */
function makeItem(feed, { src = "", prepend = true } = {}) {
  const item = el("article", "item");
  const s = el("div", "src", src);
  const tr = el("div", "tr loading");
  const terms = el("div", "terms term-line");
  terms.hidden = true;
  item.append(s, tr, terms);
  prepend ? feed.prepend(item) : feed.append(item);
  return {
    item,
    setSrc: (t) => (s.textContent = t),
    setTr: (t) => { tr.classList.remove("loading"); tr.textContent = t; },
    setErr: (t) => { tr.classList.remove("loading"); tr.innerHTML = ""; tr.append(el("p", "err", t)); },
    setTerms: (list) => {
      terms.hidden = !list.length;
      terms.textContent = list.length ? "📌 " + list.map((x) => `${x.term} → ${x.pl}`).join(" · ") : "";
    },
  };
}

function needModels() {
  if (modelsReady()) return false;
  toast("Najpierw pobierz modele w ⚙️ Ustawieniach (raz, przez Wi-Fi).", 5000);
  showTab("settings");
  return true;
}

// ---------- tabs ----------
function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "notes") renderNotes();
  if (name === "settings") showStorage();
  window.scrollTo(0, 0);
}
$$(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// ---------- LIVE ----------
let recorder = null;
let session = null; // { id, title, date, items: [{src, tr, terms}] }
let waiting = 0;    // fragments not yet processed

$("#speech-lang").value = settings.speechLang;
$("#speech-lang").onchange = (e) => {
  settings.speechLang = e.target.value;
  saveSettings(settings);
};

if (!micSupported) {
  $("#btn-rec").disabled = true;
  $("#live-status").textContent = "Ta przeglądarka nie daje dostępu do mikrofonu. Otwórz aplikację w Chrome.";
}

function persistSession() {
  if (!session) return;
  session.title = $("#lesson-title").value.trim() || session.title;
  if (!upsertSession(session)) toast("Pamięć pełna — usuń stare notatki.");
}

function updateStatus() {
  const rec = !!recorder;
  $("#live-status").textContent = rec
    ? waiting > 1
      ? `🎧 Słucham… (${waiting} fragmenty w kolejce — telefon nie nadąża, rozważ model „szybki”)`
      : waiting === 1 ? "🎧 Słucham… ⏳ tłumaczę" : "🎧 Słucham…"
    : waiting ? `⏳ Kończę tłumaczenie (${waiting})…` : "Zatrzymano. Notatki są zapisane w 🗂️ Notatkach.";
}

function onAudio(audio) {
  const entry = { src: "", tr: "", terms: [] };
  session.items.push(entry);
  const card = makeItem($("#live-feed"), { src: "🎧 …" });
  waiting++;
  updateStatus();
  transcribe(audio, settings, (src) => {
    entry.src = src;
    card.setSrc(src || "(cisza / niezrozumiałe)");
    entry.terms = findTerms(src);
    card.setTerms(entry.terms);
  })
    .then(({ src, tr }) => {
      if (!src) { card.item.remove(); session.items.splice(session.items.indexOf(entry), 1); return; }
      entry.tr = tr;
      card.setTr(tr);
      $("#btn-vocab").disabled = false;
    })
    .catch((err) => card.setErr(explainError(err)))
    .finally(() => { waiting--; updateStatus(); persistSession(); });
}

async function startLecture() {
  if (needModels()) return;
  if (!session) {
    const now = new Date();
    session = {
      id: now.getTime().toString(36),
      title: $("#lesson-title").value.trim() || "Zajęcia " + now.toLocaleDateString("pl-PL"),
      date: now.toISOString(),
      items: [],
    };
    $("#live-feed").innerHTML = "";
  }
  recorder = new Recorder(onAudio, (lvl) => ($("#level").style.width = Math.min(100, lvl * 600) + "%"));
  try {
    await recorder.start();
  } catch (e) {
    recorder = null;
    toast("Brak dostępu do mikrofonu — zezwól w ustawieniach przeglądarki.", 6000);
    return;
  }
  $("#btn-rec").textContent = "⏹️ Stop";
  $("#btn-rec").classList.add("recording");
  $("#speech-lang").disabled = true;
  updateStatus();
  navigator.wakeLock?.request("screen").then((l) => (startLecture.lock = l)).catch(() => {});
}

async function stopLecture() {
  const r = recorder;
  recorder = null;
  await r?.stop();
  $("#btn-rec").textContent = "🎙️ Start";
  $("#btn-rec").classList.remove("recording");
  $("#speech-lang").disabled = false;
  $("#level").style.width = "0";
  startLecture.lock?.release?.().catch(() => {});
  updateStatus();
  persistSession();
}

$("#btn-rec").onclick = () => (recorder ? stopLecture() : startLecture());
$("#lesson-title").oninput = () => session && persistSession();

$("#btn-new").onclick = async () => {
  if (recorder) await stopLecture();
  session = null;
  $("#live-feed").innerHTML = "";
  $("#lesson-title").value = "";
  $("#btn-vocab").disabled = true;
  toast("Nowe zajęcia — poprzednie są w 🗂️ Notatkach");
};

/** All glossary words heard during the lesson, as a table. */
function vocabTable(items) {
  const map = new Map();
  for (const x of items) for (const t of x.terms || []) map.set(t.term, t.pl);
  const wrap = el("div", "table-wrap");
  if (!map.size) { wrap.append(el("p", "hint", "Nie rozpoznano jeszcze słów ze słowniczka.")); return wrap; }
  const table = el("table");
  const head = el("tr");
  head.append(el("th", null, "Français / Darija"), el("th", null, "Polski"));
  table.append(head);
  for (const [term, pl] of [...map].sort((a, b) => a[0].localeCompare(b[0], "fr"))) {
    const row = el("tr");
    row.append(el("td", null, term), el("td", null, pl));
    table.append(row);
  }
  wrap.append(table);
  return wrap;
}

$("#btn-vocab").onclick = () => {
  if (!session) return;
  const card = el("article", "item");
  card.append(el("div", "src", "📚 Słówka z tej lekcji"), vocabTable(session.items));
  $("#live-feed").prepend(card);
};

// ---------- TRANSLATE ----------
$("#btn-translate").onclick = async () => {
  const q = $("#ask-input").value.trim();
  if (!q || needModels()) return;
  const card = makeItem($("#ask-feed"), { src: q });
  card.setTerms(findTerms(q));
  $("#ask-input").value = "";
  try {
    const { tr } = await translateText(q, settings);
    card.setTr(tr);
  } catch (err) {
    card.setErr(explainError(err));
  }
};

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
      list.append(el("div", "word-cat", cat));
    }
    const row = el("div", "word");
    const a = el("div", "w1", w.fr || w.dj);
    if (w.ar) a.append(el("span", "ar", w.ar));
    row.append(a, el("div", "w2", w.pl));
    list.append(row);
  }
  if (!rows.length) list.append(el("p", "hint", "Brak wyników. Spróbuj w zakładce 🔁 Tłumacz."));
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
    const c = el("div", "card");
    c.append(el("p", "hint", "Brak zapisanych zajęć. Nagraj pierwsze w zakładce 🎙️ Na żywo."));
    list.append(c);
    return;
  }
  for (const s of sessions) {
    const b = el("button", "note", s.title);
    b.append(el("small", null, `${new Date(s.date).toLocaleString("pl-PL")} · ${s.items.length} fragm.`));
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
  body.append(el("h2", null, s.title));
  const voc = el("article", "item");
  voc.append(el("div", "src", "📚 Słówka z lekcji"), vocabTable(s.items));
  body.append(voc);
  for (const x of s.items) {
    const card = makeItem(body, { src: x.src, prepend: false });
    card.setTr(x.tr || "—");
    card.setTerms(x.terms || []);
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
  const vocab = new Map();
  s.items.forEach((x) => (x.terms || []).forEach((t) => vocab.set(t.term, t.pl)));
  const txt =
    `${s.title}\n${new Date(s.date).toLocaleString("pl-PL")}\n\n` +
    "=== SŁÓWKA ===\n" + [...vocab].map(([a, b]) => `${a} — ${b}`).join("\n") + "\n\n" +
    "=== TRANSKRYPCJA ===\n" +
    s.items.map((x) => `> ${x.src}\n${x.tr}\n`).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" }));
  a.download = s.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "_") + ".txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// ---------- SETTINGS / MODEL DOWNLOAD ----------
$("#whisper").value = settings.whisper;
$("#target").value = settings.target;
$("#whisper").onchange = (e) => { settings.whisper = e.target.value; saveSettings(settings); refreshBanner(); };
$("#target").onchange = (e) => { settings.target = e.target.value; saveSettings(settings); };

const files = new Map(); // file -> {loaded,total}
onProgress((p) => {
  files.set(p.model + "/" + p.file, { loaded: p.loaded || 0, total: p.total || 0 });
  let loaded = 0, total = 0;
  for (const f of files.values()) { loaded += f.loaded; total += f.total; }
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  $("#dl").hidden = false;
  $("#dl-bar").style.width = pct + "%";
  $("#dl-text").textContent = `Pobieranie: ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB (${pct}%) — ${p.model}`;
});

$("#btn-download").onclick = async () => {
  const btn = $("#btn-download");
  btn.disabled = true;
  files.clear();
  $("#dl").hidden = false;
  $("#dl-bar").style.width = "0";
  $("#dl-text").textContent = "Ładowanie modeli… (pierwszy raz może potrwać kilka minut)";
  navigator.storage?.persist?.().catch(() => {});
  try {
    await preload(settings);
    settings.ready = { ...settings.ready, [settings.whisper]: true };
    saveSettings(settings);
    $("#dl-bar").style.width = "100%";
    $("#dl-text").textContent = "✅ Modele gotowe — aplikacja działa teraz bez internetu.";
  } catch (err) {
    $("#dl-text").textContent = navigator.onLine
      ? "Nie udało się pobrać modeli (" + err.message + "). Spróbuj ponownie przez Wi-Fi."
      : "Brak internetu — modele trzeba pobrać raz, przez Wi-Fi.";
  }
  btn.disabled = false;
  refreshBanner();
  showStorage();
};

async function showStorage() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    $("#storage-info").textContent = `Zajęte miejsce: ${(usage / 1e6).toFixed(0)} MB z ${(quota / 1e9).toFixed(1)} GB dostępnych.`;
  } catch {}
}

function refreshBanner() {
  $("#setup-banner").hidden = modelsReady();
}
$("#btn-go-setup").onclick = () => showTab("settings");
refreshBanner();

// ---------- offline / PWA ----------
const updateNet = () => ($("#net").hidden = navigator.onLine);
addEventListener("online", updateNet);
addEventListener("offline", updateNet);
updateNet();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
