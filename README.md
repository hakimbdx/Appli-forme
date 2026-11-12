# Appli Forme 🥗

Application web de **suivi santé et régime**, en français, sans dépendances ni serveur.

## Fonctionnalités

- **Tableau de bord** : calories du jour (anneau de progression), eau, poids actuel, IMC, macronutriments.
- **Repas** : journal par jour (petit-déjeuner, déjeuner, dîner, collation) avec calories et macros.
- **Poids** : pesées, historique et courbe d'évolution avec ligne d'objectif.
- **Activité** : séances sportives et calories brûlées (ajoutées au budget du jour).
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

## Bibliothèques

- [html5-qrcode](https://github.com/mebjas/html5-qrcode) 2.3.8 (Apache-2.0), dans `lib/`, chargée seulement à l'ouverture du scanner.
- [pdf.js](https://github.com/mozilla/pdf.js) 4.10.38, version « legacy » (Apache-2.0), dans `lib/pdfjs/`, chargée seulement à l'import d'un bilan.

> Les estimations sont indicatives et ne remplacent pas l'avis d'un professionnel de santé.
