# Appli Forme 🥗

Application web de **suivi santé et régime**, en français, sans dépendances ni serveur.

## Fonctionnalités

- **Tableau de bord** : calories du jour (anneau de progression), eau, poids actuel, IMC, macronutriments.
- **Repas** : journal par jour (petit-déjeuner, déjeuner, dîner, collation) avec calories et macros.
- **Poids** : pesées, historique et courbe d'évolution avec ligne d'objectif.
- **Sport** : un coach conversationnel génère des séances sur mesure selon la forme du jour, le matériel disponible et les douleurs ou gênes signalées (94 exercices décrits par matériel, niveau, sauts et sollicitation de chaque articulation). On peut les modifier en langage naturel (« plus facile », « sans sauts », « remplace les squats »), les suivre avec un minuteur guidé, et le ressenti en fin de séance ajuste les suivantes. Les séances et activités sont ajoutées au budget calorique du jour.
- **Profil** : calcul du métabolisme de base (Mifflin-St Jeor), de la dépense journalière et d'un objectif calorique selon le but (perte, maintien, prise).
- **Types de régime** : équilibré, riche en protéines, pauvre en glucides, méditerranéen (répartition des macros et conseils adaptés).
- **Base d'aliments** : ~50 aliments courants, calories et macros calculées selon la quantité.
- **Produits du commerce** : recherche et scan de code-barres via [Open Food Facts](https://fr.openfoodfacts.org) (gratuit, sans compte) ; les produits utilisés sont mémorisés.
- **Bilan sur 7 jours** : calories par jour comparées à l'objectif.
- **Données** : stockées localement dans le navigateur, export / import JSON.
- **Apple Forme / Santé** : import des calories actives, minutes d'exercice, pas et pesée du jour via un raccourci iOS « Synchro Forme » (instructions dans l'onglet Activité).
- **Analyses de sang** : import du PDF d'un bilan de laboratoire, lecture automatique d'environ 35 biomarqueurs (glycémie, HbA1c, cholestérol, fer, vitamines, thyroïde, foie, rein, NFS…), vérification avant enregistrement, synthèse des valeurs hors normes et graphiques d'évolution. Le PDF est lu sur le téléphone, rien n'est envoyé.
- **iPhone** : installable sur l'écran d'accueil (PWA), barre d'onglets en bas, fonctionne hors ligne.

## Lancer l'application

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Installer sur iPhone

1. Ouvrir l'adresse de l'application dans **Safari**.
2. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancer l'appli depuis l'icône « Forme ».

## Parseur de bilans sanguins

Le parseur (`bloodparser.js`) est partagé entre l'application et les outils Node :

```bash
npm test                                   # tests du parseur + lecture des bilans fictifs
node tools/parse-bilan.mjs mon-bilan.pdf    # ce qui est reconnu dans un PDF
node tools/parse-bilan.mjs mon-bilan.pdf --lines   # + toutes les lignes extraites
```

Pour améliorer la lecture d'un nouveau format de laboratoire : lancer l'outil sur le PDF, regarder
les « lignes non reconnues », compléter `BIOMARKERS` dans `bloodparser.js` et ajouter un cas dans
`tests/bloodparser.test.cjs`. Les vrais bilans se rangent dans `bilans-prives/` (ignoré par git) :
**ne jamais committer de vrais résultats**, le dépôt est public. `tests/fixtures/` ne contient que
des bilans fictifs (générés par `tools/make-fixtures.cjs`).

## Coach sportif

`sport-data.js` (base d'exercices) et `coach.js` (génération des séances, compréhension des messages)
sont testés avec `npm test`. Pour ajouter un exercice : une ligne `ex(...)` dans `sport-data.js`
(famille, matériel, niveau, sauts, sollicitation des articulations, consigne).

## Surcharge progressive et prévention du surentraînement

`progression.js` (testé avec `npm test`) analyse l'historique :

- **Renforcement** (par exercice) : double progression. Toutes les séries en haut de la fourchette
  sans effort maximal → charge augmentée (+5 %, arrondie aux haltères ou kettlebells existants) ;
  échec deux séances de suite → charge réduite ; 3 séances sans progrès → séance allégée.
  Au poids du corps : variante plus difficile après deux séances au maximum. Gainage : +5 s.
- **Course** : allure facile (médiane des sorties faciles), tendance à effort égal, volume
  hebdomadaire +10 % maximum, semaine allégée après 3 semaines de hausse, alternance footing,
  fractionné et sortie longue.
- **État de forme** : charge = durée × effort ressenti (RPE), ratio charge aiguë (7 j) / chronique
  (moyenne 4 semaines), hausses répétées, effort élevé, fatigue déclarée, jours sans repos,
  monotonie, baisse de performances → 🟢 / 🟡 / 🔴, qui ajuste automatiquement la difficulté du coach.

Les charges et répétitions se notent pendant la séance (lecteur) ou à la main dans l'onglet Progression.

## Bibliothèques

- [html5-qrcode](https://github.com/mebjas/html5-qrcode) 2.3.8 (Apache-2.0), dans `lib/`, chargée seulement à l'ouverture du scanner.
- [pdf.js](https://github.com/mozilla/pdf.js) 4.10.38, version « legacy » (Apache-2.0), dans `lib/pdfjs/`, chargée seulement à l'import d'un bilan.

> Les estimations sont indicatives et ne remplacent pas l'avis d'un professionnel de santé.
