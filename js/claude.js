// Appels à l'API Claude, directement depuis le navigateur (clé stockée localement sur l'appareil).
import Anthropic from "./vendor/anthropic-sdk-0.131.0.js"; // @anthropic-ai/sdk (MIT), bundled with esbuild
import { glossaryForPrompt } from "./glossary.js";

const LANG_NAMES = { pl: "Polish", en: "English", fr: "simple French" };

function baseSystem(target) {
  const lang = LANG_NAMES[target] || "Polish";
  return `You are the study companion of a Polish student enrolled in a 3-year dental prosthetics technician diploma (diplôme de prothésiste dentaire) at a school in Agadir, Morocco. Her native language is Polish. Teachers are Moroccan and lecture in Moroccan Arabic (Darija) mixed heavily with French technical vocabulary (code-switching inside the same sentence is normal). She does not speak Darija.

Your job is to make the course understandable to her in ${lang}.

Principles:
- Translate meaning faithfully and naturally into ${lang}; never invent course content. If something is unclear, give your best reading and mark it with "(?)".
- Keep the French technical term in parentheses after the ${lang} term the first time it appears, e.g. "wycisk (empreinte)" — she will be examined with French terms, so she must learn them.
- Dental-laboratory context: impressions, plaster models, wax-ups, casting, ceramics, acrylic dentures, articulators, occlusion, CAD/CAM. Interpret ambiguous words in that context.
- Speech-recognition input is noisy: Darija may be transcribed in Arabic script, French words may be mangled or written in Arabic letters (e.g. "لانبرانت" = l'empreinte, "البلاتر" = le plâtre, "سيراميك" = céramique). Reconstruct what the teacher most likely said.
- Use short sentences and plain Markdown. No preamble, no closing remarks.

Reference glossary (prefer these translations):
${glossaryForPrompt()}`;
}

const MODE_INSTRUCTIONS = {
  live: (target) => `MODE: live lecture. The user message holds the latest speech-recognition fragment of the lecture, plus a little preceding context. Translate ONLY the latest fragment into ${LANG_NAMES[target]}.
Output format:
1. The translation (1–4 sentences).
2. If the fragment contains technical terms, one final line starting with "📌 " listing them as "French term → ${LANG_NAMES[target]} term", separated by " · ". Omit this line if there are none.
If the fragment is pure noise or filler, answer only "…".`,
  text: (target) => `MODE: text translation. The user pasted or typed something heard or read in class (Darija in Latin or Arabic script, French, or a mix). Give:
**Tłumaczenie / translation** in ${LANG_NAMES[target]}.
Then, if useful, a short bullet list explaining Darija words and French technical terms (word → meaning).`,
  image: (target) => `MODE: photo. The image shows a whiteboard, slide, handout or lab instruction from class. Transcribe the text you can read (keep French as-is), then translate it into ${LANG_NAMES[target]}. Explain any diagram briefly. End with a vocabulary list "French → ${LANG_NAMES[target]}" of the technical terms.`,
  summary: (target) => `MODE: lesson notes. The user message contains the full transcript of a lecture (speech-recognition fragments and their translations). Write clean study notes in ${LANG_NAMES[target]} with these sections:
## Temat lekcji (topic, one line)
## Najważniejsze punkty (key points, bullets)
## Kroki / procedura (step-by-step procedure, if the lesson described one)
## Słownictwo (Markdown table: Français | Darija (if heard) | ${LANG_NAMES[target]})
## Możliwe pytania egzaminacyjne (3–5 likely exam questions, in French with ${LANG_NAMES[target]} translation)
Translate section headings if the target language is not Polish.`,
  ask: (target) => `MODE: tutor. Answer the student's question about the course, dental prosthetics, French terms or Darija in ${LANG_NAMES[target]}. Be concrete and brief; give the French term she will need in class.`,
};

let cached = { key: null, client: null };
function client(apiKey) {
  if (!apiKey) throw new Error("NO_KEY");
  if (cached.key !== apiKey) {
    cached = { key: apiKey, client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) };
  }
  return cached.client;
}

/**
 * Stream a response. `content` is a string or an array of content blocks.
 * `history` (optional) holds earlier {role, content} turns for the tutor chat.
 */
export async function ask({ settings, mode, content, history = [], onText, signal }) {
  const c = client(settings.apiKey);
  const effort = mode === "live" ? "low" : mode === "summary" ? "high" : "medium";
  const stream = c.beta.messages.stream(
    {
      model: settings.model,
      max_tokens: mode === "live" ? 2000 : 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system: [
        // Stable, large prefix → cached across calls.
        { type: "text", text: baseSystem(settings.target), cache_control: { type: "ephemeral" } },
        { type: "text", text: MODE_INSTRUCTIONS[mode](settings.target) },
      ],
      messages: [...history, { role: "user", content }],
    },
    { signal },
  );

  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
      onText?.(text);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("REFUSAL");
  }
  return text;
}

/** Human-readable (Polish) error message. */
export function explainError(err) {
  if (err?.message === "NO_KEY") return "Brak klucza API — dodaj go w zakładce ⚙️ Ustawienia.";
  if (err?.message === "REFUSAL") return "Model odmówił odpowiedzi na ten fragment.";
  if (err?.name === "AbortError" || err instanceof Anthropic.APIUserAbortError) return "Przerwano.";
  if (err instanceof Anthropic.AuthenticationError) return "Nieprawidłowy klucz API (sprawdź w Ustawieniach).";
  if (err instanceof Anthropic.PermissionDeniedError) return "Klucz API nie ma uprawnień do tego modelu.";
  if (err instanceof Anthropic.RateLimitError) return "Za dużo zapytań naraz — odczekaj chwilę.";
  if (err instanceof Anthropic.BadRequestError) return "Błędne zapytanie: " + (err.message || "");
  if (err instanceof Anthropic.APIConnectionError) return "Brak połączenia z internetem.";
  if (err instanceof Anthropic.APIError) return `Błąd serwera (${err.status ?? "?"}). Spróbuj ponownie.`;
  return "Błąd: " + (err?.message || String(err));
}
