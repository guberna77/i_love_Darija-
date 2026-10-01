# 🦷 Darija Dental — i_love_darija

Application web (installable sur téléphone) pour suivre des cours de **prothèse dentaire**
donnés en **darija mélangée de français**, avec traduction en **polonais**.

## Fonctions

| Onglet | Ce que ça fait |
|---|---|
| 🎙️ **Na żywo** (en direct) | Écoute le prof via le micro, transcrit (darija `ar-MA` ou français `fr-FR`) et traduit chaque phrase en polonais toutes les quelques secondes, avec les termes techniques FR → PL. Bouton **📝 Podsumuj** : fiche de cours complète (points clés, procédure, tableau de vocabulaire FR / darija / PL, questions d'examen probables). |
| 📷 **Zdjęcie** (photo) | Photo du tableau, d'une diapo ou d'un polycopié → transcription + traduction + vocabulaire. |
| 💬 **Tłumacz** (traduire) | Taper une phrase entendue (darija latin ou arabe, français) pour la traduire, ou poser une question à un tuteur. |
| 📚 **Słowa** (mots) | Glossaire **hors-ligne** : ~170 termes de prothèse dentaire FR → PL, ~130 mots de darija de classe → PL (avec écriture arabe), et des fiches (flashcards). |
| 🗂️ **Notatki** (notes) | Tous les cours enregistrés sur le téléphone, exportables en `.txt`. |
| ⚙️ **Ustawienia** | Clé API, modèle, langue cible (polonais / anglais / français simple). |

La traduction utilise l'API **Claude** (Anthropic). Le prompt connaît le contexte (laboratoire de
prothèse, code-switching darija/français, erreurs typiques de la reconnaissance vocale) et le glossaire.

## Mise en route

1. **Publier l'app** (gratuit) : fusionner cette branche dans `main`, puis dans GitHub →
   *Settings → Pages → Source : GitHub Actions*. L'adresse sera
   `https://guberna77.github.io/i_love_Darija-/`.
   (Le micro exige HTTPS : GitHub Pages le fournit.)
2. **Clé API** : créer un compte sur <https://console.anthropic.com>, ajouter un peu de crédit,
   créer une clé `sk-ant-…`, la coller dans ⚙️ *Ustawienia* puis **Test**.
   La clé reste uniquement dans le téléphone (localStorage).
3. Sur le téléphone : ouvrir l'adresse dans **Chrome** (Android) ou **Safari** (iPhone), puis
   menu → *Ajouter à l'écran d'accueil*.

Tester en local : `python3 -m http.server 8000` puis ouvrir <http://localhost:8000>.

### Coût
Chaque phrase traduite est une petite requête. Le modèle **Sonnet 5.5** (réglable dans ⚙️) est
moins cher et plus rapide ; **Opus 5.5** donne la meilleure qualité. Le prompt système est mis en
cache pour réduire le coût. Surveiller la consommation dans la console Anthropic.

### Limites à connaître
- La reconnaissance vocale du navigateur (Google / Apple) gère mal le mélange darija + français :
  le texte brut peut être approximatif ; Claude reconstruit le sens grâce au contexte, mais les
  passages douteux sont marqués « (?) ». Si le prof parle surtout français, choisir *Français*.
- Il faut Internet pendant le cours (reconnaissance vocale + traduction). Le glossaire et les notes
  fonctionnent hors-ligne.
- Demander l'accord de l'enseignant avant de transcrire le cours.

---

## 🇵🇱 Krótka instrukcja (dla studentki)

1. **⚙️ Ustawienia** → wklej klucz API → *Zapisz* → *Test*.
2. Na zajęciach: **🎙️ Na żywo** → wpisz temat → wybierz język nauczyciela → **Start**.
   Tłumaczenie pojawia się na bieżąco; pod spodem 📌 terminy francuskie → polskie.
3. Na koniec: **📝 Podsumuj** → notatki, słowniczek i pytania egzaminacyjne (zapisane w 🗂️ Notatkach).
4. Tablica lub slajd? **📷 Zdjęcie**. Usłyszałaś słowo? **💬 Tłumacz**.
5. Ucz się słówek w **📚 Słowa → 🃏 Fiszki**.

## Structure

```
index.html            interface (polonais)
css/style.css         styles (clair / sombre, mobile)
js/app.js             logique des onglets
js/claude.js          appels Claude (streaming, prompts par mode)
js/speech.js          reconnaissance vocale continue (Web Speech API)
js/glossary.js        glossaire prothèse FR→PL + darija→PL
js/markdown.js        rendu Markdown minimal
js/storage.js         stockage local (réglages, cours)
js/vendor/            SDK Anthropic (MIT) empaqueté, sans CDN
sw.js, manifest       PWA / hors-ligne
```
