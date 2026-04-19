# Documentation Staff — Systeme de Lootbox

Ce document explique comment creer et configurer des lootbox sur le serveur EriniumFaction. Il est destine aux administrateurs du serveur.

---

## Sommaire

1. [Presentation](#1-presentation)
2. [Creer une lootbox](#2-creer-une-lootbox)
3. [Format du fichier lootpool.json](#3-format-du-fichier-lootpooljson)
4. [Les 6 tiers de rarete](#4-les-6-tiers-de-rarete)
5. [Textures](#5-textures)
6. [Commandes admin](#6-commandes-admin)
7. [Mecanique d'ouverture](#7-mecanique-douverture)
8. [Recuperation d'une lootbox posee](#8-recuperation-dune-lootbox-posee)
9. [Securite et protections](#9-securite-et-protections)
10. [Exemple complet — StarterBox](#10-exemple-complet--starterbox)

---

## 1. Presentation

Les lootbox sont des **blocs physiques** que les joueurs placent dans le monde et ouvrent par **clic droit**. Chaque type de lootbox contient un **lootpool configurable** (une liste d'items possibles, avec quantites et rarete).

A chaque ouverture, **un seul tier de rarete est tire au sort** parmi les 6 tiers disponibles (Common, Uncommon, Rare, Epic, Legendary, Mythic). Le joueur recoit ensuite un certain nombre d'items de ce tier.

**Points importants :**

- Les lootbox ne sont **pas craftables**. Ce sont des items premium distribues uniquement par les administrateurs via la commande `/lootbox give`.
- Les lootbox ne peuvent **pas** etre ouvertes depuis l'inventaire. Le joueur **doit** poser le bloc puis faire clic droit dessus.
- Les probabilites sont fixes et transparentes. Il n'y a aucune manipulation des odds.
- Ajouter un nouveau type de lootbox = creer un dossier avec des fichiers de config. **Aucun code Java n'est necessaire.**

---

## 2. Creer une lootbox

### Etape 1 — Creer le dossier

Dans le dossier de configuration du serveur, creer un sous-dossier dans `config/Lootboxes/` avec le nom du type de lootbox. Ce nom sera l'identifiant unique du type.

```
config/Lootboxes/MonNouveauType/
```

Le nom du dossier est sensible a la casse. Eviter les espaces et les caracteres speciaux.

### Etape 2 — Creer le fichier `lootbox.info`

Dans le dossier du type, creer un fichier `lootbox.info` au format properties (cle=valeur, une par ligne).

```properties
# config/Lootboxes/MonNouveauType/lootbox.info

name_fr=Ma Nouvelle Lootbox
name_en=My New Lootbox
weight_common=50.0
weight_uncommon=25.0
weight_rare=15.0
weight_epic=7.0
weight_legendary=2.5
weight_mythic=0.5
qty_common=5
qty_uncommon=4
qty_rare=3
qty_epic=2
qty_legendary=1
qty_mythic=1
```

**Description des champs :**

| Champ | Type | Obligatoire | Description |
|-------|------|:-----------:|-------------|
| `name_fr` | Texte | Oui | Nom affiche de la lootbox en francais |
| `name_en` | Texte | Oui | Nom affiche de la lootbox en anglais |
| `weight_common` | Nombre decimal > 0 | Oui | Poids de probabilite du tier Common |
| `weight_uncommon` | Nombre decimal > 0 | Oui | Poids de probabilite du tier Uncommon |
| `weight_rare` | Nombre decimal > 0 | Oui | Poids de probabilite du tier Rare |
| `weight_epic` | Nombre decimal > 0 | Oui | Poids de probabilite du tier Epic |
| `weight_legendary` | Nombre decimal > 0 | Oui | Poids de probabilite du tier Legendary |
| `weight_mythic` | Nombre decimal > 0 | Oui | Poids de probabilite du tier Mythic |
| `qty_common` | Entier >= 1 | Oui | Nombre d'items tires quand le tier Common est selectionne |
| `qty_uncommon` | Entier >= 1 | Oui | Nombre d'items tires quand le tier Uncommon est selectionne |
| `qty_rare` | Entier >= 1 | Oui | Nombre d'items tires quand le tier Rare est selectionne |
| `qty_epic` | Entier >= 1 | Oui | Nombre d'items tires quand le tier Epic est selectionne |
| `qty_legendary` | Entier >= 1 | Oui | Nombre d'items tires quand le tier Legendary est selectionne |
| `qty_mythic` | Entier >= 1 | Oui | Nombre d'items tires quand le tier Mythic est selectionne |

**Comment fonctionnent les poids ?**
Les poids sont relatifs entre eux. Le systeme calcule la somme de tous les poids, puis tire un nombre aleatoire. Avec les valeurs par defaut (50 + 25 + 15 + 7 + 2.5 + 0.5 = 100), le tier Common a 50/100 = 50% de chance d'etre tire, le Mythic 0.5/100 = 0.5%, etc. Vous pouvez utiliser n'importe quelles valeurs, c'est le ratio entre elles qui compte.

### Etape 3 — Creer le fichier `lootpool.json`

Voir la section suivante pour le format detaille.

### Etape 4 — Creer le dossier `textures/`

Voir la section [Textures](#5-textures) pour la liste des fichiers attendus.

### Etape 5 — Recharger

Utilisez `/lootbox reload` pour charger le nouveau type sans redemarrer le serveur.

---

## 3. Format du fichier lootpool.json

Le fichier `lootpool.json` definit les items disponibles pour chaque tier de rarete. La structure est un objet `entries` contenant un tableau d'items par tier.

### Structure generale

```json
{
  "entries": {
    "common": [ ... ],
    "uncommon": [ ... ],
    "rare": [ ... ],
    "epic": [ ... ],
    "legendary": [ ... ],
    "mythic": [ ... ]
  }
}
```

Chaque tier contient un tableau d'entries. Les tiers vides ou absents sont automatiquement exclus du tirage (leur poids est ignore).

### Format d'une entry

```json
{
  "item": "minecraft:diamond_sword",
  "min": 1,
  "max": 1,
  "duplicate": false,
  "nbt": "{ench:[{id:16,lvl:5}]}"
}
```

**Description des champs :**

| Champ | Type | Description |
|-------|------|-------------|
| `item` | Texte | Le registry name de l'item. Exemples : `minecraft:diamond_sword`, `eriniumfaction:erinium_sword`. Pour specifier un metadata, ajouter `:meta` apres le nom (ex : `minecraft:dye:4` pour le lapis lazuli). |
| `min` | Entier >= 1 | Quantite minimum de l'item donne |
| `max` | Entier >= min | Quantite maximum de l'item donne. La quantite reelle est aleatoire entre min et max (inclusif). |
| `duplicate` | Booleen | `true` (par defaut) : cette entry peut etre tiree plusieurs fois dans la meme ouverture. `false` : une fois tiree, l'entry est retiree du pool pour cette ouverture (pas de doublon). |
| `nbt` | Texte ou null | Tag NBT optionnel en format SNBT. Permet d'ajouter des enchantements, des noms custom, des attributs, etc. Mettre `null` si aucun NBT n'est necessaire. |

### Notes sur le tirage des items

Quand un tier est selectionne, le systeme tire `qty_*` items aleatoirement parmi les entries de ce tier :

- Si une entry a `duplicate: true`, elle peut etre tiree plusieurs fois (ex : 3 stacks de fer).
- Si une entry a `duplicate: false`, elle est retiree du pool apres le premier tirage (ex : une epee unique, pas de doublon).
- Si le pool se vide avant d'atteindre le nombre d'items demande (toutes les entries restantes ont `duplicate: false` et ont deja ete tirees), le tirage s'arrete.

### Exemples NBT courants

Enchantement Sharpness V sur une epee :
```json
"nbt": "{ench:[{id:16,lvl:5}]}"
```

Plusieurs enchantements (Protection VI + Unbreaking III) :
```json
"nbt": "{ench:[{id:0,lvl:6},{id:34,lvl:3}]}"
```

Nom custom :
```json
"nbt": "{display:{Name:\"Epee Legendaire\"}}"
```

---

## 4. Les 6 tiers de rarete

A chaque ouverture de lootbox, **un seul tier** est tire au sort selon les poids configures dans `lootbox.info`. Voici les 6 tiers avec leurs valeurs par defaut :

| Tier | Couleur | Hex | Poids par defaut | Probabilite par defaut | Qty par defaut | Description |
|------|---------|-----|:----------------:|:----------------------:|:--------------:|-------------|
| **Common** | Vert | #2ECC71 | 50.0 | 50% | 5 items | Recompenses de base, ressources courantes |
| **Uncommon** | Bleu | #3498DB | 25.0 | 25% | 4 items | Recompenses correctes, ressources utiles |
| **Rare** | Violet | #9B59B6 | 15.0 | 15% | 3 items | Bons items, equipement enchante |
| **Epic** | Jaune | #F1C40F | 7.0 | 7% | 2 items | Items de valeur, materiaux rares |
| **Legendary** | Orange | #E67E22 | 2.5 | 2.5% | 1 item | Items tres rares, equipement haut de gamme |
| **Mythic** | Rouge | #E74C3C | 0.5 | 0.5% | 1 item | Items ultra-rares, le meilleur du serveur |

**Rappel :** Les poids et quantites sont **entierement configurables** par type de lootbox dans le fichier `lootbox.info`. Les valeurs ci-dessus sont les valeurs par defaut recommandees.

Si un tier n'a aucune entry dans le `lootpool.json`, il est automatiquement exclu du tirage, meme si un poids est configure pour lui.

---

## 5. Textures

Chaque type de lootbox possede un dossier `textures/` contenant les images utilisees par le modele 3D du bloc. Le modele 3D et l'animation sont identiques pour tous les types — seules les textures changent.

### Les 13 textures de base

Ces textures correspondent aux differentes parties du modele 3D du bloc :

| Fichier | Description |
|---------|-------------|
| `corner_cube.png` | Cubes decoratifs aux coins du bloc |
| `corner_joint.png` | Joints entre les coins |
| `interior_cube.png` | Interieur visible a l'ouverture |
| `logo_animated.png` | Logo anime sur le devant (personnalisable par type) |
| `rarity_top.png` | Dessus du bloc, colore selon la rarete |
| `rocks.png` | Roches decoratives (animent pendant l'ouverture) |
| `side_cable.png` | Cables sur les cotes |
| `side_core.png` | Noyau central des faces laterales |
| `side_middle_plate.png` | Plaque centrale des cotes |
| `side_plate.png` | Plaques laterales |
| `side_plate_core.png` | Noyau des plaques laterales |
| `top_pedestral.png` | Piedestal superieur |
| `rarity_beam.png` | Texture par defaut de la colonne de lumiere |

### Les 6 variantes de beam par rarete

Ces textures sont appliquees dynamiquement pendant l'animation d'ouverture selon le tier tire. Elles changent la couleur de la colonne de lumiere qui sort du bloc :

| Fichier | Tier associe |
|---------|-------------|
| `rarity_beam_common.png` | Common (vert) |
| `rarity_beam_uncommon.png` | Uncommon (bleu) |
| `rarity_beam_rare.png` | Rare (violet) |
| `rarity_beam_epic.png` | Epic (jaune) |
| `rarity_beam_legendary.png` | Legendary (orange) |
| `rarity_beam_mythic.png` | Mythic (rouge) |

### Specifications techniques

- **Format** : PNG
- **Dimensions recommandees** : 64x64 ou 128x128 pixels
- **Textures par defaut** : Si le dossier `textures/` n'est pas fourni ou qu'il manque des fichiers, le mod utilise les textures par defaut integrees. Vous pouvez ne personnaliser que certaines textures (par exemple uniquement `logo_animated.png`) et laisser le reste par defaut.

**Total : 19 fichiers** (13 de base + 6 variantes beam).

---

## 6. Commandes admin

Toutes les commandes necessitent une permission specifique.

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/lootbox give <joueur> <type> [quantite]` | `eriniumfaction.lootbox.give` | Donne une ou plusieurs lootbox d'un type specifique au joueur. La quantite par defaut est 1. |
| `/lootbox reload` | `eriniumfaction.lootbox.reload` | Recharge le registre des lootbox depuis `config/Lootboxes/`. Met a jour les clients connectes automatiquement. |
| `/lootbox list` | `eriniumfaction.lootbox.list` | Affiche la liste de tous les types de lootbox charges, avec le nombre d'entries par tier. |
| `/lootbox preview <type>` | `eriniumfaction.lootbox.preview` | Affiche le contenu complet du lootpool d'un type de lootbox (items, quantites, tiers). |

**Auto-completion :** Les arguments `<joueur>` proposent les joueurs en ligne. Les arguments `<type>` proposent les identifiants de lootbox charges dans le registre.

---

## 7. Mecanique d'ouverture

Voici ce qui se passe quand un joueur fait clic droit sur une lootbox posee :

1. **Validation** — Le serveur verifie que :
   - Le bloc est bien une lootbox valide
   - La lootbox n'est pas deja en cours d'ouverture
   - Le joueur est a **moins de 5 blocs** du bloc

2. **Tirage du tier** — Un seul tier de rarete est tire au hasard selon les poids ponderes (`weight_*`). Les tiers qui n'ont aucune entry dans le lootpool sont automatiquement exclus du tirage.

3. **Tirage des items** — Le nombre d'items correspondant au tier (`qty_*`) est tire aleatoirement dans le pool de ce tier. Les quantites de chaque item sont aleatoires entre `min` et `max`.

4. **Animation** — Tous les joueurs dans un rayon de **64 blocs** voient l'animation d'ouverture (couvercle qui s'ouvre, colonne de lumiere coloree selon le tier, particules, sons). L'animation dure environ **5 secondes**.

5. **Ejection des items** — Apres l'animation, les items sont propulses en l'air depuis le bloc avec un leger decalage entre chaque item et un angle aleatoire. Les items ont un **delai de ramassage de 2 secondes** — pendant ce temps, aucun joueur ne peut les ramasser.

6. **Disparition du bloc** — Le bloc disparait du monde apres l'ejection des items.

7. **Annonce** — Si le tier tire est **Legendary** ou **Mythic**, les joueurs dans un rayon de **32 blocs** voient une annonce sur leur ecran avec le nom du joueur, le nom de l'item et le tier obtenu.

**Attention :** Apres le delai de 2 secondes, les items sont ramassables par **n'importe quel joueur** (premier arrive, premier servi). Il est recommande d'ouvrir ses lootbox dans un endroit sur.

**Deconnexion pendant l'ouverture :** Si le joueur se deconnecte pendant l'animation, les items sont quand meme spawnes au sol. Le joueur ne les recoit **pas** dans son inventaire a la reconnexion — ils restent au sol et peuvent etre ramasses par d'autres joueurs.

---

## 8. Recuperation d'une lootbox posee

Un joueur qui a pose une lootbox peut la recuperer **sans l'ouvrir** en faisant **Shift + clic gauche** sur le bloc.

- **Seul le joueur qui a pose le bloc** peut le recuperer. Les autres joueurs ne peuvent ni casser ni recuperer le bloc.
- L'item lootbox est rendu dans l'inventaire du joueur avec le meme type.
- Cette action n'est possible que si la lootbox **n'est pas en cours d'ouverture**.

---

## 9. Securite et protections

Le bloc lootbox est protege contre toutes les tentatives de duplication et de manipulation :

| Menace | Protection |
|--------|-----------|
| Double clic droit pendant l'ouverture | Rejete — le flag d'ouverture est verifie, aucun second tirage possible |
| Casser le bloc pendant l'ouverture | Impossible — le bloc devient incassable (hardness = -1) pendant l'ouverture |
| Piston pendant l'ouverture | Le bloc est immovable (ne peut pas etre pousse par un piston) |
| Explosion pendant l'ouverture | Resistance a 1200 — aucune explosion vanilla ne peut le detruire |
| Hopper | Le bloc n'a pas d'inventaire, les hoppers ne peuvent rien extraire |
| Type de lootbox supprime | Le bloc affiche un message d'erreur au clic droit, le joueur peut le recuperer en Shift+clic gauche |

**Redemarrage serveur pendant l'ouverture :** Si le serveur redemarre pendant une ouverture en cours, l'ouverture sera finalisee automatiquement au redemarrage (les items sont generes et spawnes, le bloc est supprime).

---

## 10. Exemple complet — StarterBox

Voici un exemple complet d'un type de lootbox "StarterBox" (Caisse de Depart) avec des items adaptes aux nouveaux joueurs.

### Arborescence

```
config/Lootboxes/StarterBox/
    lootbox.info
    lootpool.json
    textures/
        corner_cube.png
        corner_joint.png
        interior_cube.png
        logo_animated.png
        rarity_top.png
        rocks.png
        side_cable.png
        side_core.png
        side_middle_plate.png
        side_plate.png
        side_plate_core.png
        top_pedestral.png
        rarity_beam.png
        rarity_beam_common.png
        rarity_beam_uncommon.png
        rarity_beam_rare.png
        rarity_beam_epic.png
        rarity_beam_legendary.png
        rarity_beam_mythic.png
```

### lootbox.info

```properties
# Caisse de Depart — destinee aux nouveaux joueurs
name_fr=Caisse de Depart
name_en=Starter Box
weight_common=50.0
weight_uncommon=25.0
weight_rare=15.0
weight_epic=7.0
weight_legendary=2.5
weight_mythic=0.5
qty_common=5
qty_uncommon=4
qty_rare=3
qty_epic=2
qty_legendary=1
qty_mythic=1
```

### lootpool.json

```json
{
  "entries": {
    "common": [
      {
        "item": "minecraft:iron_sword",
        "min": 1,
        "max": 1,
        "duplicate": true,
        "nbt": null
      },
      {
        "item": "minecraft:iron_ingot",
        "min": 5,
        "max": 15,
        "duplicate": true,
        "nbt": null
      },
      {
        "item": "minecraft:bread",
        "min": 8,
        "max": 16,
        "duplicate": true,
        "nbt": null
      },
      {
        "item": "minecraft:oak_planks",
        "min": 16,
        "max": 32,
        "duplicate": true,
        "nbt": null
      }
    ],
    "uncommon": [
      {
        "item": "minecraft:diamond",
        "min": 1,
        "max": 5,
        "duplicate": true,
        "nbt": null
      },
      {
        "item": "minecraft:iron_chestplate",
        "min": 1,
        "max": 1,
        "duplicate": false,
        "nbt": "{ench:[{id:0,lvl:2}]}"
      },
      {
        "item": "minecraft:golden_apple",
        "min": 2,
        "max": 4,
        "duplicate": true,
        "nbt": null
      }
    ],
    "rare": [
      {
        "item": "minecraft:diamond_sword",
        "min": 1,
        "max": 1,
        "duplicate": false,
        "nbt": "{ench:[{id:16,lvl:5}]}"
      },
      {
        "item": "minecraft:diamond_chestplate",
        "min": 1,
        "max": 1,
        "duplicate": false,
        "nbt": "{ench:[{id:0,lvl:4}]}"
      },
      {
        "item": "minecraft:experience_bottle",
        "min": 8,
        "max": 16,
        "duplicate": true,
        "nbt": null
      }
    ],
    "epic": [
      {
        "item": "eriniumfaction:erinium_fragment",
        "min": 1,
        "max": 3,
        "duplicate": true,
        "nbt": null
      },
      {
        "item": "minecraft:diamond_sword",
        "min": 1,
        "max": 1,
        "duplicate": false,
        "nbt": "{ench:[{id:16,lvl:5},{id:19,lvl:2},{id:34,lvl:3}]}"
      }
    ],
    "legendary": [
      {
        "item": "eriniumfaction:valterite_chestplate",
        "min": 1,
        "max": 1,
        "duplicate": false,
        "nbt": "{ench:[{id:0,lvl:6}]}"
      }
    ],
    "mythic": [
      {
        "item": "eriniumfaction:erinium_sword",
        "min": 1,
        "max": 1,
        "duplicate": false,
        "nbt": "{ench:[{id:16,lvl:7},{id:19,lvl:3}]}"
      }
    ]
  }
}
```

### Donner cette lootbox a un joueur

```
/lootbox give Steve StarterBox
/lootbox give Alex StarterBox 3
```
