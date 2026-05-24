# [Nom de la Feature] — Cahier des charges

> **Statut** : Brouillon / En révision / Validé
> **Auteur** : [Ton prénom]
> **Date** : [JJ/MM/AAAA]
> **Version** : 1.0

---

## 1. Résumé en une phrase

> *Décris la feature en une seule phrase, comme si tu l'expliquais à quelqu'un qui n'a jamais entendu parler du jeu.*

Exemple : *"Les Tourelles de Faction permettent aux joueurs de défendre automatiquement leur base contre les ennemis qui entrent dans leur territoire."*

---

## 2. Contexte & Pourquoi cette feature ?

### Problème ou besoin identifié
> *Quel problème cette feature résout-elle ? Qu'est-ce qui manque actuellement dans le jeu ?*

### Objectif principal
> *Qu'est-ce que le joueur pourra faire grâce à cette feature qu'il ne pouvait pas faire avant ?*

### Lien avec d'autres features
> *Est-ce que cette feature dépend d'autres systèmes déjà en place ? (ex: nécessite d'avoir une faction, d'avoir des ressources rares, etc.)*

---

## 3. Expérience joueur cible

### Qui est le joueur concerné ?
- [ ] Tous les joueurs
- [ ] Les joueurs en faction
- [ ] Les joueurs sans faction
- [ ] Les chefs / officiers de faction
- [ ] Les joueurs PvP agressifs
- [ ] Les joueurs défensifs / constructeurs
- [ ] Autre : ___________

### Qu'est-ce que le joueur RESSENT en utilisant cette feature ?
> *Décris l'émotion ou la sensation que la feature doit provoquer. Exemples : puissance, tension, stratégie, satisfaction, surprise, etc.*

### Scénario de jeu typique
> *Raconte comment un joueur va découvrir et utiliser cette feature, de A à Z, comme une petite histoire.*

Exemple :
> *"Lucas rejoint une faction au jour 3. Son chef lui demande de placer une tourelle à l'entrée de leur base. Il craft la tourelle, la pose sur le sol, et la configure pour attaquer uniquement les ennemis. Le lendemain, une faction rivale attaque — la tourelle commence à tirer automatiquement. Lucas reçoit une notification de l'attaque et peut aller défendre."*

---

## 4. Mécanique de jeu

### Description détaillée
> *Explique comment la feature fonctionne, étape par étape. Pas de code — juste la logique de jeu.*

### Ce que le joueur peut faire (actions disponibles)

| Action | Comment ? | Condition requise |
|--------|-----------|-------------------|
| Exemple : Placer l'objet | Clic droit sur le sol | Avoir l'item dans l'inventaire |
| | | |
| | | |

### Ce que le jeu fait automatiquement

> *Quels comportements se déclenchent sans action du joueur ? (timers, effets passifs, cooldowns, etc.)*

---

## 5. Interface & Retours visuels

### Ce que le joueur VOIT
> *Décris les effets visuels : animations, particules, couleurs, textes à l'écran, etc.*

### Ce que le joueur ENTEND
> *Sons déclenchés : clic, explosion, notification, musique d'ambiance, etc.*

### Menus ou interfaces
> *Y a-t-il un menu à ouvrir ? Des boutons ? Des informations affichées ? Décris ce que contient chaque écran.*

---

## 6. Équilibrage & Valeurs

> *Ces valeurs sont des suggestions de départ — elles seront ajustées en test.*

| Paramètre | Valeur proposée | Justification |
|-----------|-----------------|---------------|
| Exemple : Durée de cooldown | 10 secondes | Évite le spam |
| Exemple : Nombre max par faction | 5 | Évite le pay-to-win / la domination totale |
| | | |

### Ce qui peut être modifié par le joueur
> *Le joueur peut-il personaliser des valeurs ? Lesquelles ? Dans quelles limites ?*

### Ce qui ne peut PAS être changé
> *Quelles valeurs sont fixes pour des raisons d'équilibre ?*

---

## 7. Conditions & Règles métier

> *Les règles absolues de la feature — les "ça DOIT" et "ça NE DOIT PAS".*

**Doit toujours :**
- Exemple : La tourelle doit s'arrêter de tirer si la faction n'a plus de ressources.
- 

**Ne doit jamais :**
- Exemple : Une tourelle ne peut jamais attaquer un allié de la faction.
- 

**Cas particuliers à gérer :**
- Exemple : Que se passe-t-il si la faction est dissoute ? La tourelle disparaît ? Reste neutre ?
- 

---

## 8. Ressources & Progression

### Comment le joueur obtient cette feature ?
> *Craft ? Achat dans un shop ? Récompense de quête ? Tier de faction requis ?*

### Coût ou prérequis
| Élément | Quantité | Obtenu comment ? |
|---------|----------|-----------------|
| Exemple : Lingot d'Erinium | 8 | Miné en zone dangereuse |
| | | |

### Progression possible
> *Y a-t-il des améliorations, des niveaux, des variantes de cette feature ? Si oui, décris les paliers.*

---

## 9. Interactions avec d'autres systèmes

> *Coche les systèmes qui interagissent avec cette feature et explique comment.*

- [ ] **Factions** — *ex: seuls les membres peuvent l'utiliser*
- [ ] **Territoire / Claims** — *ex: ne fonctionne que dans les terres claimées*
- [ ] **PvP** — *ex: peut blesser les joueurs ennemis*
- [ ] **Économie / Shop** — *ex: nécessite des ressources rares*
- [ ] **Crafting** — *ex: recipe spécifique*
- [ ] **Permissions / Grades** — *ex: réservé aux officiers+*
- [ ] **Événements / Raids** — *ex: désactivé pendant un événement serveur*
- [ ] **Interface / HUD** — *ex: affiche une icône en jeu*
- [ ] Autre : ___________

---

## 10. Ce que cette feature ne fait PAS (hors périmètre)

> *Très important : note explicitement ce que tu N'inclus pas dans cette version, pour éviter les malentendus.*

- Exemple : La tourelle ne peut pas être déplacée une fois posée (dans cette version).
- Exemple : Pas de système de ciblage prioritaire dans cette version.

---

## 11. Risques & Points d'attention

> *Qu'est-ce qui pourrait mal tourner ? Quelles mécaniques pourraient être abusées ?*

| Risque | Impact | Suggestion |
|--------|--------|------------|
| Exemple : Le joueur spam des tourelles partout | Lag + expérience dégradée | Limiter à 5 par faction |
| | | |

---

## 12. Questions ouvertes

> *Ce qui n'est pas encore décidé. Mets ici tout ce qui nécessite une validation ou une discussion.*

- [ ] Question 1 : *ex: Est-ce que les tourelles doivent fonctionner pendant les événements de trêve ?*
- [ ] Question 2 :
- [ ] Question 3 :

---

## 13. Inspirations & Références

> *Jeux, vidéos, screenshots ou mécaniques existantes qui ont inspiré cette feature.*

- Exemple : *Système de tourelles de [Nom du jeu] — [lien vidéo ou description]*
- 

---

## 14. Notes supplémentaires

> *Tout ce qui ne rentre pas dans les sections précédentes.*

