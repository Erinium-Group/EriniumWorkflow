# [Tutoriel] — Cahier des charges

> **Statut** : Brouillon
> **Auteur** : [Louis ^^]
> **Date** : [19/04/2026]
> **Version** : 1.0

---

## 1. Résumé en une phrase

> *Décris la feature en une seule phrase, comme si tu l'expliquais à quelqu'un qui n'a jamais entendu parler du jeu.*

Première séquence du jeu dans laquelle les joueurs apprennent les fondements du pvp faction, les bases du serveur et font la rencontre du pet.

---

## 2. Contexte & Pourquoi cette feature ?

### Problème ou besoin identifié
> Elle permet l'apprentissage du jeu et donc l'arrivée de nouveaux joueurs peu "qualifiés" 

### Objectif principal
> Elle pourra apprendre les bases du pvp faction ainsi que celles du serveur et débloquer le pet

### Lien avec d'autres features
> débloquage du pet 

---

## 3. Expérience joueur cible

### Qui est le joueur concerné ?
- [x] Tous les joueurs
- [ ] Les joueurs en faction
- [ ] Les joueurs sans faction
- [ ] Les chefs / officiers de faction
- [ ] Les joueurs PvP agressifs
- [ ] Les joueurs défensifs / constructeurs
- [ ] Autre : ___________ 

### Qu'est-ce que le joueur RESSENT en utilisant cette feature ?
> Le joueur doit se sentir confiant pour qu'il profite un maximum de son expérience sur le jeu

### Scénario de jeu typique
> Lors de la première connection au serveur, le joueur aura une cinématique et se retrouvera dans la salle 

---

## 4. Mécanique de jeu

### Description détaillée
> *Explique comment la feature fonctionne, étape par étape. Pas de code — juste la logique de jeu.*

### Ce que le joueur peut faire (actions disponibles)

| Action | Comment ? | Condition requise |
|--------|-----------|-------------------|
| apprendre le pvp | grâce à la première salle | finir la cinématique te avoir récupéré le pet |
| apprende le pillage | grâce à la 2ème salle | finir la première salle |
| apprendre la protection de base | grâce à la 3 ème salle | finir la deuxième salle |
| apprendre la magie | grâce à la dernière salle | finir toutes les salles d'avant |
| sortir de la salle | grâce au premier pouvoir magique | avoir fait toutes les salles précédentes|
| apprendre les bases du serv | grâce aux conseils du pet| sortir de la salle de base |


### Ce que le jeu fait automatiquement

| Action | Comment ? | Condition requise |
|--------|-----------|-------------------|
| le joueur visionne une cinématique | grâce au mod Video Player de NGoedix | rejoindre le serveur pour la première fois |
| le joueur récupère le pet | celui ci le réveille et viens sur son épaule | avoir fini le visionnage de la cinématique |

---

## 5. Interface & Retours visuels

### Ce que le joueur VOIT
> Cinématique puis texte à l'écran et une autre cinématique 

### Ce que le joueur ENTEND
> Sons déclenchés : Une musique digne du jeu crawl (en soft) durant la cinématique et une musique de donjon dans la zone de tutoriel et si possible des conseils du pet sous forme de voice-lines

### Menus ou interfaces
> du texte au mur et les interfaces de base modifiées en biff pour une présentation de celles ci

---

## 6. Équilibrage & Valeurs

> *Ces valeurs sont des suggestions de départ — elles seront ajustées en test.*

| Paramètre | Valeur proposée | Justification |
|-----------|-----------------|---------------|
| obligation de faire le tuto | true| permet aux joueurs "confiant" d'apprendre de nouvelles choses |


### Ce qui peut être modifié par le joueur
> Ses touches (proposé dans le tuto) 

### Ce qui ne peut PAS être changé
> La salle, l'orga, la cinématique... TOUT  ??

---

## 7. Conditions & Règles métier

> *Les règles absolues de la feature — les "ça DOIT" et "ça NE DOIT PAS".*

**Doit toujours :**
- être objectif et simple à comprendre
- être une sorte d'aventure 
- poser l'intrigue
- présenter le serveur de la meilleure façon possible
- encourager le joueur

**Ne doit jamais :**
- être chiant / affligeant 
- être passable
- être trop compliqué

**Cas particuliers à gérer :**
- auncun actuellement 


---

## 8. Progression

### Comment le joueur obtient cette feature ?
> Besoin de se connecter au serveur pour la première fois 

### Progression possible
> Il y a différentes salles comme "paliers" chacune apprenant une feature
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
- [x] **Interface / HUD** — *ex: affiche une icône en jeu*
- [x] Autre : Pet 

---

## 10. Ce que cette feature ne fait PAS (hors périmètre)

> *Très important : note explicitement ce que tu N'inclus pas dans cette version, pour éviter les malentendus.*

- Dégoute le joueur du jeu
- modifie le jeu

---

## 11. Risques & Points d'attention

> *Qu'est-ce qui pourrait mal tourner ? Quelles mécaniques pourraient être abusées ?*

| Risque | Impact | Suggestion |
|--------|--------|------------|
| découragement du joueur | perte de joueurs | faire un truc simple |
| use bug | lag ?? | réfléchir sur le fonctionnement du truc |
| Cinématique qui ne se déclenche pas | Joueur perdu dès l'arrivée | Prévoir un mécanisme de relance manuelle |

---

## 12. Questions ouvertes

> *Ce qui n'est pas encore décidé. Mets ici tout ce qui nécessite une validation ou une discussion.*

- [ ] Question 1 : Est-ce que le tutoriel est passable ?
- [ ] Question 2 : Est-ce que dans le tutoriel d'autres joueurs peuvent se voir ?
- [ ] Question 3 : Est-ce que une animation sera jouée ?

---

## 13. Inspirations & Références

> *Jeux, vidéos, screenshots ou mécaniques existantes qui ont inspiré cette feature.*

- Musique de *Crawl* (ambiance douce et mystérieuse)
- Introduction de *The Legend of Zelda: Breath of the Wild / Tears of the Kingdom* 
- Déroulement et progression de *Breath of the Wild / Tears of the Kingdom*

---

## 14. Notes supplémentaires

> Les fonctions de base du serveur ne sont pas incluses dans les salles, mais bien dans le spawn et partout sur le serveur grâce aux voice-lines du pet.
