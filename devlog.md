# Devlog — Calepinage de carottages de trémie

Contactez moi si bug majeur détecté ou idées/features à ajouter : julien.fumeron@vinci-construction.com

---

## 2026-04-02 — Calcul de masse sans double-comptage des recouvrements

### Problème
La masse globale des carottes pour une couche était calculée en sommant `masseCarotte(d, h)` pour chaque trou, sans tenir compte des recouvrements : une surface déjà percée était comptée deux fois si deux carottes se chevauchaient.

### Solution
Ajout de la fonction `_computeCoucheMaterialStats(entity)` qui utilise un **échantillonnage par grille 2D** (pas adaptatif 5–20 mm) pour calculer l'union des empreintes circulaires. Chaque cellule de la grille ne comptabilise qu'une seule fois la profondeur maximale des carottes qui la recouvrent.

### Affichage
- **Résumé global (Synthèse)** : deux nouveaux KPIs remplacent "Masse carottes" → *Masse carottée réelle* + *Béton intact*
- **Pied de chaque carte couche** : idem, avec les valeurs propres à la couche
- **Panneau Production de déchets** : 3 KPIs — *Masse carottée réelle*, *En tonnes*, *Béton intact restant*

---

## 2026-04-01 — Base initiale

- Éditeur 2D : calepinage automatique, intelligent, algorithmique
- Éditeur 3D : visualisation volumique avec coupes
- Synthèse projet : rendements, temps, planning, coûts
- Planning : Gantt avec jours fériés FR
- Tableaux de rendement paramétrables
- Export SolidWorks (.swb) et AutoCAD (.scr)
