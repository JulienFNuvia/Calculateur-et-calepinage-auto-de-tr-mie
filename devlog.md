# Devlog — Calepinage de carottages de trémie

Contactez moi si bug majeur détecté ou idées/features à ajouter : julien.fumeron@vinci-construction.com

---

## 2026-04-03 — Système de Phasage des carottages

### Présentation
Le nouvel onglet **Phasage** permet de regrouper les carottages en phases de travaux distinctes, avec aperçu visuel et export par phase.

### Fonctionnalités
- **Créer/renommer/supprimer** des phases librement
- **Sélectionner les carottages** par phase : cocher individuellement chaque carotte ou utiliser la case *Tout sélectionner* par couche
- **Aperçu 2D par phase** : visualisation en temps réel des carottages sélectionnés sur le plan de la couche
- **Export 2D (AutoCAD .scr)** : génère un script AutoCAD filtré sur les carottages de la phase
- **Export 3D (SolidWorks .swb)** : exporte uniquement les carottages inclus dans la phase

### Comment l'utiliser
1. Aller dans l'onglet **Phasage**
2. Cliquer sur **+ Nouvelle phase** (ex. «Phase 1 — Zone Nord»)
3. Dans chaque couche, cocher les carottages à inclure (ou «Tout sélectionner» pour la couche entière)
4. L'aperçu 2D se met à jour en temps réel
5. Cliquer sur **📐 Export 2D** ou **📦 Export 3D** pour exporter la phase souhaitée
6. Répéter pour chaque phase du chantier

### Notes techniques
- Les phases sont sauvegardées dans le `localStorage` du navigateur (persistance entre sessions)
- L'export 3D réutilise la fonction `exportSolidWorks()` en filtrant temporairement les couches

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
