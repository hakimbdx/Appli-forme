# Appli Forme 🥗

Application web de **suivi santé et régime**, en français, sans dépendances ni serveur.

## Fonctionnalités

- **Tableau de bord** : calories du jour (anneau de progression), eau, poids actuel, IMC, macronutriments.
- **Repas** : journal par jour (petit-déjeuner, déjeuner, dîner, collation) avec calories et macros.
- **Poids** : pesées, historique et courbe d'évolution avec ligne d'objectif.
- **Activité** : séances sportives et calories brûlées (ajoutées au budget du jour).
- **Profil** : calcul du métabolisme de base (Mifflin-St Jeor), de la dépense journalière et d'un objectif calorique selon le but (perte, maintien, prise).
- **Données** : stockées localement dans le navigateur, export / import JSON.

## Lancer l'application

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

> Les estimations sont indicatives et ne remplacent pas l'avis d'un professionnel de santé.
