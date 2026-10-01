# 🦷 Darija Dental — i_love_darija

Application web **gratuite et hors-ligne** (installable sur téléphone) pour suivre des cours de
**prothèse dentaire** donnés en **darija mélangée de français**, avec traduction en **polonais**.

Aucun compte, aucune clé API, aucun abonnement : l'intelligence artificielle tourne **dans le
téléphone**. Il faut seulement internet **une fois**, pour télécharger les modèles.

## Fonctions

| Onglet | Ce que ça fait |
|---|---|
| 🎙️ **Na żywo** (en direct) | Écoute le prof, découpe aux pauses, transcrit (Whisper) puis traduit en polonais (NLLB-200). Sous chaque phrase : 📌 les termes reconnus dans le glossaire vérifié (FR / darija → PL). Bouton **📚 Słówka z lekcji** : tableau de tout le vocabulaire entendu pendant le cours. |
| 🔁 **Tłumacz** (traduire) | Traduire une phrase tapée (français, ou darija en écriture arabe). |
| 📚 **Słowa** (mots) | Glossaire : ~170 termes de prothèse dentaire FR → PL, ~130 mots de darija de classe → PL (avec écriture arabe), et fiches de révision. |
| 🗂️ **Notatki** (notes) | Cours enregistrés sur le téléphone + vocabulaire, exportables en `.txt`. |
| ⚙️ **Ustawienia** | Téléchargement des modèles, choix rapide / précis, langue cible. |

### Modèles utilisés (open source, gratuits)
| Rôle | Modèle | Taille (téléchargée une fois) |
|---|---|---|
| Parole → texte | `Xenova/whisper-base` (rapide) ou `Xenova/whisper-small` (plus précis) | ≈ 80 Mo / ≈ 250 Mo |
| Traduction | `Xenova/nllb-200-distilled-600M` (connaît le darija marocain `ary_Arab`) | ≈ 600 Mo |

Ils s'exécutent avec [Transformers.js](https://github.com/huggingface/transformers.js) (fourni
dans `js/vendor/`, licence Apache-2.0) et restent en cache dans le navigateur.

## Mise en route

1. **Publier l'app** (gratuit) : fusionner cette branche dans `main`, puis GitHub →
   *Settings → Pages → Source : GitHub Actions*. Adresse : `https://guberna77.github.io/i_love_Darija-/`.
2. Sur le téléphone, **en Wi-Fi** : ouvrir l'adresse dans **Chrome**, aller dans ⚙️ →
   **⬇️ Pobierz modele** et attendre la fin (≈ 700 Mo).
3. Menu Chrome → *Ajouter à l'écran d'accueil*. À partir de là, plus besoin d'internet.

Tester en local : `python3 -m http.server 8000` puis <http://localhost:8000>.

## Limites (à connaître honnêtement)
- **Qualité** : c'est nettement moins bon qu'un service payant. Whisper reconnaît mal le darija
  (il l'écrit souvent comme de l'arabe classique) et le mélange darija/français ; la traduction
  est donc **approximative**. Si le prof parle surtout français, choisir *Français* : c'est bien
  meilleur. Les 📌 termes viennent du glossaire vérifié et sont fiables.
- **Téléphone** : il faut un téléphone récent (≥ 4 Go de RAM conseillés) et ≈ 1 Go d'espace.
  Sur un téléphone lent, la traduction prend du retard sur le cours (l'app l'indique) : choisir
  le modèle *rapide*. Un ordinateur portable fonctionne encore mieux.
- **Photos du tableau** : non incluses. Utiliser **Google Lens / Google Traduction** (gratuit).
- Demander l'accord de l'enseignant avant d'enregistrer le cours.

---

## 🇵🇱 Krótka instrukcja (dla studentki)

1. **Raz, przez Wi-Fi:** ⚙️ Ustawienia → **⬇️ Pobierz modele** → poczekaj na ✅.
2. Na zajęciach (bez internetu): **🎙️ Na żywo** → temat → język nauczyciela → **Start**.
   Po każdym zdaniu pojawia się tłumaczenie, a pod nim 📌 terminy francuskie → polskie.
3. **📚 Słówka z lekcji** — lista słów z dzisiejszych zajęć (zapisana w 🗂️ Notatkach).
4. Tłumaczenie jest automatyczne i przybliżone — terminy 📌 są sprawdzone.

## Structure

```
index.html            interface (polonais)
css/style.css         styles (clair / sombre, mobile)
js/app.js             logique des onglets
js/recorder.js        micro 16 kHz, découpage aux pauses
js/ai.js              communication avec le worker
js/worker.js          Whisper + NLLB (Transformers.js) dans un Web Worker
js/glossary.js        glossaire prothèse FR→PL + darija→PL, détection des termes
js/storage.js         stockage local (réglages, cours)
js/vendor/            Transformers.js 4.3.0 (Apache-2.0)
sw.js, manifest       PWA / hors-ligne
```
