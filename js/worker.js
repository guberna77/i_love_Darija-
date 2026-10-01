// Web Worker : IA 100 % locale (gratuite, hors-ligne après le premier téléchargement).
//  - Whisper  : parole → texte (darija / français)
//  - NLLB-200 : texte → polonais (connaît le darija marocain « ary_Arab »)
// Les modèles sont téléchargés une seule fois depuis Hugging Face puis gardés en cache par le navigateur.
import { pipeline, env } from "./vendor/transformers-4.3.0.min.js";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODELS = {
  "whisper-base": "Xenova/whisper-base",
  "whisper-small": "Xenova/whisper-small",
  nllb: "Xenova/nllb-200-distilled-600M",
};

const loaded = {}; // key -> Promise<pipeline>

function load(task, key, id) {
  if (!loaded[key]) {
    loaded[key] = pipeline(task, MODELS[key], {
      device: "wasm",
      dtype: "q8",
      progress_callback: (p) => {
        if (p.status === "progress") {
          self.postMessage({ type: "progress", id, model: key, file: p.file, loaded: p.loaded, total: p.total });
        }
      },
    }).catch((err) => {
      delete loaded[key];
      throw err;
    });
  }
  return loaded[key];
}

// Phrases that Whisper invents on silence/noise (YouTube subtitles credits, etc.).
const HALLUCINATIONS = [
  /اشتركوا في القناة/, /ترجمة نانسي/, /شكرا على المشاهدة/, /المترجم للقناة/,
  /sous-titrage/i, /sous-titres réalisés/i, /merci d'avoir regardé/i, /^[\s\p{P}]*merci[\s\p{P}]*$/iu,
  /amara\.org/i, /thank you for watching/i, /^[\s\p{P}\p{S}]*$/u,
];

function clean(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (HALLUCINATIONS.some((r) => r.test(t))) return "";
  // Collapse runaway repetitions ("و و و و و …"): keep at most 2 identical words in a row.
  const words = t.split(" ");
  return words.filter((w, i) => !(w === words[i - 1] && w === words[i - 2])).join(" ");
}

const isArabic = (t) => {
  const ar = (t.match(/[؀-ۿ]/g) || []).length;
  const lat = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return ar > lat;
};

const TARGET = { pl: "pol_Latn", en: "eng_Latn", fr: "fra_Latn" };

async function translate(text, target, id) {
  const src = isArabic(text) ? "ary_Arab" : "fra_Latn";
  const tgt = TARGET[target] || "pol_Latn";
  if (src === tgt) return text;
  const translator = await load("translation", "nllb", id);
  const out = await translator(text, { src_lang: src, tgt_lang: tgt, max_new_tokens: 256 });
  return out[0]?.translation_text?.trim() || "";
}

self.onmessage = async ({ data: msg }) => {
  const { id } = msg;
  try {
    if (msg.type === "preload") {
      await load("automatic-speech-recognition", msg.whisper, id);
      await load("translation", "nllb", id);
      self.postMessage({ type: "done", id });
    } else if (msg.type === "transcribe") {
      const asr = await load("automatic-speech-recognition", msg.whisper, id);
      const opts = { task: "transcribe", chunk_length_s: 30 };
      if (msg.language !== "auto") opts.language = msg.language;
      const out = await asr(msg.audio, opts);
      const src = clean(out.text);
      self.postMessage({ type: "transcript", id, src });
      const tr = src ? await translate(src, msg.target, id) : "";
      self.postMessage({ type: "done", id, src, tr });
    } else if (msg.type === "translate") {
      const tr = await translate(msg.text, msg.target, id);
      self.postMessage({ type: "done", id, src: msg.text, tr });
    }
  } catch (err) {
    self.postMessage({ type: "error", id, message: err?.message || String(err) });
  }
};
