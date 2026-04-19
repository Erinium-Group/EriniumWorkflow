# Systeme de Grades — Documentation

> Dossier des grades : `config/EriniumFaction/ranks/`
> Assignations joueurs : `config/EriniumFaction/player-ranks.json`
> Permissions joueurs : `config/EriniumFaction/player-permissions.json`
> Config saison : `config/EriniumFaction/eriniumfaction_season.cfg`

---

## Fichier de grade (JSON)

Chaque grade est un fichier `.json` dans `config/EriniumFaction/ranks/`. Le nom du fichier = l'identifiant du grade (ex: `vip.json` → grade ID `vip`).

### Exemple complet

```json
{
  "name": "§eVip",
  "priority": 10,
  "prefix": "§e[VIP] ",
  "suffix": "",
  "color": "§e",
  "inherits": ["default"],
  "permissions": [
    "chat.color",
    "homes.max.3",
    "warp.*"
  ],
  "isResetOnSeasonChange": true,
  "roleSetAfterSeasonReset": "default"
}
```

### Parametres

| Parametre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `name` | String | Oui | Nom affiche du grade. Supporte les codes couleur `§` ou `&`. |
| `priority` | int | Oui | Priorite du grade. Le grade avec la plus haute priorite est celui qui est utilise pour le prefix/suffix dans le chat et la tab list. Si un joueur a plusieurs grades (via heritage), la priorite la plus haute gagne. |
| `prefix` | String | Oui | Texte affiche avant le pseudo dans le chat et la tab list. Supporte `§`/`&`. Ajouter un espace a la fin pour separer du pseudo. |
| `suffix` | String | Oui | Texte affiche apres le pseudo. Rarement utilise. |
| `color` | String | Oui | Code couleur applique au pseudo du joueur dans le chat et la tab list. Ex: `§c` = rouge, `§a` = vert. |
| `inherits` | String[] | Oui | Liste des grades parents dont ce grade herite les permissions. Recursif. Ex: `["default"]` signifie que ce grade a toutes les permissions de `default` + les siennes. |
| `permissions` | String[] | Oui | Liste des permissions accordees par ce grade. Voir `docs/permissions.md` pour la liste complete. |
| `isResetOnSeasonChange` | boolean | Non | Si `true`, les joueurs avec ce grade seront automatiquement remis sur `roleSetAfterSeasonReset` quand la saison change. Defaut: `false`. |
| `roleSetAfterSeasonReset` | String | Non | ID du grade vers lequel les joueurs sont remis apres un changement de saison (si `isResetOnSeasonChange` est `true`). Defaut: `"default"`. |

---

## Priorite

La priorite determine quel grade "gagne" quand un joueur herite de plusieurs grades. Le grade avec la **plus haute** priorite definit le prefix, suffix et color affiches.

Exemple :
- `default.json` → priority: 0
- `vip.json` → priority: 10
- `moderator.json` → priority: 50
- `admin.json` → priority: 100

Un joueur avec le grade `admin` (qui herite de `moderator` qui herite de `default`) affichera le prefix/color de `admin` car il a la priorite la plus haute.

---

## Heritage

L'heritage est recursif. Si `admin` herite de `moderator` qui herite de `default` :
- `admin` a les permissions de `admin` + `moderator` + `default`
- Le prefix/suffix/color affiches sont ceux du grade de plus haute priorite

Un grade peut heriter de plusieurs grades :
```json
"inherits": ["moderator", "builder"]
```

---

## Permissions

### Syntaxe

| Syntaxe | Effet |
|---------|-------|
| `permission.node` | Accorde la permission exacte |
| `namespace.*` | Accorde toutes les permissions sous ce namespace |
| `*` | Accorde TOUTES les permissions |
| `-permission.node` | **Negation** — refuse la permission meme si un grade parent l'accorde |

### Exemples

```json
"permissions": [
  "chat.color",          // peut utiliser les couleurs dans le chat
  "homes.max.5",         // 5 homes maximum
  "warp.*",              // acces a tous les warps
  "-worldedit.butcher",  // interdit worldedit.butcher meme si un parent l'accorde
  "*"                    // toutes les permissions (admin)
]
```

### Permissions numeriques

Certaines permissions sont numeriques : `homes.max.3` signifie "3 homes max". Le systeme cherche la valeur la plus haute accordee parmi tous les grades du joueur.

---

## player-ranks.json

Stocke l'assignation grade par joueur + le numero de saison.

```json
{
  "069a79f4-44e9-4726-a5be-fca90e38aaf3": {
    "rank": "vip",
    "season": 1
  },
  "abcd1234-5678-90ab-cdef-1234567890ab": {
    "rank": "admin",
    "season": 1
  }
}
```

| Champ | Description |
|-------|-------------|
| `rank` | ID du grade (correspond au nom du fichier JSON sans `.json`) |
| `season` | Numero de la saison lors du dernier changement de grade |

Les joueurs sans entree dans ce fichier ont le grade `default`.

---

## player-permissions.json

Permissions individuelles par joueur, en plus de celles du grade.

```json
{
  "069a79f4-...": ["chat.color", "homes.max.10"]
}
```

Ajoutees via `/rank playeraddperm <joueur> <perm>`.

---

## Systeme de saisons

### Config

`config/EriniumFaction/eriniumfaction_season.cfg` :
```
currentSeason = 1
```

### Comment ca marche

1. En debut de saison, l'admin incremente `currentSeason` dans la config
2. Au prochain demarrage du serveur, AVANT que les joueurs puissent se connecter :
   - Le systeme scanne `player-ranks.json`
   - Pour chaque joueur dont la `season` est inferieure a `currentSeason` :
     - Met a jour `season` vers `currentSeason`
     - Si le grade a `isResetOnSeasonChange: true` → remplace le grade par `roleSetAfterSeasonReset`
3. Les changements sont sauvegardes
4. Log dans la console pour chaque reset

### Cas d'usage

Un joueur achete le grade VIP sur la boutique. Le grade VIP a :
```json
"isResetOnSeasonChange": true,
"roleSetAfterSeasonReset": "default"
```

A la saison suivante, le joueur est remis en `default`. S'il veut garder le VIP, il doit le racheter.

Un grade `admin` n'a PAS `isResetOnSeasonChange` → les admins gardent leur grade entre les saisons.

---

## Commandes

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/rank list` | Aucune | Lister les grades |
| `/rank info <grade>` | Aucune | Details d'un grade |
| `/rank set <joueur> <grade>` | `rank.manage` | Assigner un grade (met a jour la saison) |
| `/rank remove <joueur>` | `rank.manage` | Retirer le grade (retour a default) |
| `/rank create <id>` | `rank.manage` | Creer un grade |
| `/rank delete <id>` | `rank.manage` | Supprimer un grade |
| `/rank setprefix <id> <prefix>` | `rank.manage` | Modifier le prefix |
| `/rank setsuffix <id> <suffix>` | `rank.manage` | Modifier le suffix |
| `/rank setpriority <id> <nombre>` | `rank.manage` | Modifier la priorite |
| `/rank setcolor <id> <code>` | `rank.manage` | Modifier la couleur pseudo |
| `/rank addperm <id> <permission>` | `rank.manage` | Ajouter une permission |
| `/rank removeperm <id> <permission>` | `rank.manage` | Retirer une permission |
| `/rank addinherit <id> <parent>` | `rank.manage` | Ajouter un heritage |
| `/rank removeinherit <id> <parent>` | `rank.manage` | Retirer un heritage |
| `/rank playerperm <joueur>` | `rank.manage` | Voir les permissions custom d'un joueur |
| `/rank playeraddperm <joueur> <perm>` | `rank.manage` | Ajouter une permission custom |
| `/rank playerremoveperm <joueur> <perm>` | `rank.manage` | Retirer une permission custom |
| `/rank reload` | `rank.reload` | Recharger config + grades |

---

## Fichiers

| Fichier | Contenu |
|---------|---------|
| `config/EriniumFaction/ranks/*.json` | Definition des grades |
| `config/EriniumFaction/player-ranks.json` | Assignation UUID → grade + saison |
| `config/EriniumFaction/player-permissions.json` | Permissions custom par joueur |
| `config/EriniumFaction/eriniumfaction_season.cfg` | Numero de saison actuel |
