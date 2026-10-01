// Reconnaissance vocale du navigateur (Web Speech API — Chrome / Edge / Safari).
// Regroupe les phrases reconnues en fragments, envoyés ensuite à la traduction.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = !!SR;

export class LectureListener {
  /**
   * @param {object} o
   * @param {string} o.lang       e.g. "ar-MA" or "fr-FR"
   * @param {(text:string)=>void} o.onChunk   a finished fragment ready to translate
   * @param {(text:string)=>void} o.onInterim live, not-yet-final text
   * @param {(msg:string)=>void}  o.onError
   */
  constructor({ lang, onChunk, onInterim, onError }) {
    this.lang = lang;
    this.onChunk = onChunk;
    this.onInterim = onInterim;
    this.onError = onError;
    this.buffer = "";
    this.flushTimer = null;
    this.running = false;
  }

  start() {
    if (!SR) throw new Error("Speech recognition not supported");
    this.running = true;
    this._spawn();
  }

  stop() {
    this.running = false;
    try { this.rec?.stop(); } catch {}
    this._flush();
  }

  _spawn() {
    const rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          this.buffer += (this.buffer ? " " : "") + r[0].transcript.trim();
        } else {
          interim += r[0].transcript;
        }
      }
      this.onInterim?.((this.buffer + " " + interim).trim());
      // Send when the fragment is long enough, or after a short pause.
      clearTimeout(this.flushTimer);
      if (this.buffer.length > 160) this._flush();
      else if (this.buffer) this.flushTimer = setTimeout(() => this._flush(), 2500);
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.running = false;
        this.onError?.("Brak dostępu do mikrofonu — zezwól w ustawieniach przeglądarki.");
        return;
      }
      if (e.error === "language-not-supported") {
        this.running = false;
        this.onError?.(`Przeglądarka nie obsługuje języka ${this.lang}. Wybierz „Français”.`);
        return;
      }
      this.onError?.("Rozpoznawanie mowy: " + e.error);
    };

    // Chrome stops after silence or ~60 s: restart while the lecture is running.
    rec.onend = () => {
      if (this.running) setTimeout(() => this.running && this._spawn(), 250);
    };

    this.rec = rec;
    rec.start();
  }

  _flush() {
    clearTimeout(this.flushTimer);
    const text = this.buffer.trim();
    this.buffer = "";
    this.onInterim?.("");
    if (text) this.onChunk?.(text);
  }
}
