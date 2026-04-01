# Calepinage de carottages de trémie

Application web autonome (HTML/CSS/JS) pour générer un plan de calepinage 2D/3D de carottages dans une dalle béton.

## Modules

- 📐 **Éditeur 2D** — Calepinage des carottages en vue de dessus, gestion des zones d'exclusion et sous-zones
- 📦 **Éditeur 3D** — Visualisation volumique des couches et carottages dans la dalle béton
- ♻️ **Production de déchets** — Estimation des volumes de carottes et masses de déchets par couche (graphiques journalier et cumulatif)
- 📊 **Synthèse projet** — Vue consolidée des temps, rendements, quantités, planning, coûts et production de déchets par couche
- 📅 **Planning** — Planification des cadences de carottage avec diagramme de Gantt et jours fériés français
- 💰 **Coûts** — Estimation des coûts MO, coût de revient et prix de vente (TU / TA)
- 📋 **Tableaux de rendement** — Paramétrage des rendements de carottage par diamètre et contexte (hors Z4 / Z4, maillage)
- 💾 **Export SolidWorks** — Génération de macro VBA `.swp` pour modélisation 3D automatique
- 📐 **Export AutoCAD** — Génération de script `.scr` pour tracé 2D automatique

## Fonctionnalités détaillées

- Couches **rectangulaires ou circulaires** (calepinage concentrique automatique)
- Calepinage automatique avec gestion des zones d'exclusion, sous-zones et calepinage intelligent
- Plans spéciaux inclinés (dalles obliques) avec carottages propres
- Contrôle de validité : carottage dans la surface, absence de chevauchement
- Vue 3D interactive avec rotation, zoom, pan, coupes selon les 3 axes
- Sauvegarde/chargement JSON du projet complet
- Export JSON des données de calepinage

## Lancer localement

Option 1 (Python):

```powershell
python -m http.server 5500
```

Puis ouvrir http://localhost:5500 dans le navigateur.

Option 2:

Ouvrir directement le fichier `index.html` dans un navigateur.

## Structure

- `index.html`: interface et zones de rendu
- `styles.css`: style et responsive
- `app.js`: logique métier et rendu SVG
