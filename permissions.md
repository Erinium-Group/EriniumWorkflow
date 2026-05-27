# EriniumFaction — Permissions

> Document de reference pour toutes les permissions du mod et des mods associes (EriniumWorld).

---

## Fonctionnement

La verification des permissions suit cette chaine (dans l'ordre) :

1. **Console / Serveur** — Toujours autorise.
2. **OP** — Un joueur OP (permission level >= 2) bypass toutes les permissions.
3. **Permissions custom joueur** — Definies par `/rank playeraddperm <joueur> <perm>`, stockees dans `player-permissions.json`.
4. **Permissions du grade** — Definies dans le fichier JSON du grade (`config/EriniumFaction/ranks/<grade>.json`), avec heritage recursif.

### Syntaxe speciale

| Syntaxe | Effet |
|---------|-------|
| `permission.node` | Accorde la permission exacte |
| `namespace.*` | Accorde toutes les permissions sous `namespace.` |
| `*` | Accorde TOUTES les permissions (wildcard global) |
| `-permission.node` | **Negation** — refuse la permission, prioritaire sur tout le reste |

---

## Permissions existantes

### Grades (`rank.*`)

| Permission | Description |
|------------|-------------|
| `rank.manage` | Gerer les grades, permissions joueur et assignations |
| `rank.reload` | Recharger la configuration et les grades |
| `rank.*` | Wildcard couvrant toutes les permissions `rank.` |

### Chat (`chat.*`)

| Permission | Description |
|------------|-------------|
| `chat.color` | Utiliser les codes couleur `&` dans le chat. Sans cette permission, les codes sont supprimes |
| `chat.staff` | Acceder au canal de chat Staff (prefixe `#`) |
| `chat.*` | Wildcard couvrant toutes les permissions `chat.` |

### Economie (`economy.*`)

| Permission | Description |
|------------|-------------|
| `economy.admin` | Gerer l'argent des joueurs (give, set, remove, reset) |
| `economy.*` | Wildcard couvrant toutes les permissions `economy.` |

### Eris — Monnaie Premium (`eriniumfaction.eris.*` / `eriniumfaction.admin.eris`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.eris.balance.other` | Voir le solde Eris d'un autre joueur (`/eris balance <joueur>`) |
| `eriniumfaction.admin.eris` | Commandes admin Eris : give, take, set |
| `eriniumfaction.eris.*` | Wildcard couvrant toutes les permissions `eriniumfaction.eris.` |

### Magie (`magic.*`)

| Permission | Description |
|------------|-------------|
| `magic.admin` | Commandes admin de magie (setlevel, setmana, givexp) |
| `magic.*` | Wildcard couvrant toutes les permissions `magic.` |

### Administration (`eriniumfaction.mod.*`, `eriniumfaction.admin.*`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.mod.warn` | Avertir un joueur via `/warn` |
| `eriniumfaction.mod.mute` | Muter/demuter un joueur via `/mute`, `/unmute` |
| `eriniumfaction.mod.tempban` | Bannir/debannir un joueur via `/tempban`, `/unban` |
| `eriniumfaction.mod.lookup` | Consulter le casier judiciaire via `/lookup` |
| `eriniumfaction.admin.clearrecord` | Effacer le casier judiciaire via `/clearrecord` |
| `eriniumfaction.admin.ban` | Ban permanent (`/ban`), ban IP (`/ipban`), ban HWID (`/hwidban`) |
| `eriniumfaction.mod.*` | Wildcard couvrant toutes les permissions `eriniumfaction.mod.` |
| `eriniumfaction.admin.*` | Wildcard couvrant toutes les permissions `eriniumfaction.admin.` |

### Minage (`minage.*`)

| Permission | Description |
|------------|-------------|
| `minage.admin` | Commandes admin du monde minage (reset, editspawn, savespawn) |
| `minage.*` | Wildcard couvrant toutes les permissions `minage.` |

### Mail (`eriniumfaction.mail.*`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.mail.admin.send` | Envoyer un mail admin via `/mailadmin send`, `/mailadmin senditem`, `/mailadmin sendmoney` |
| `eriniumfaction.mail.admin.list` | Lister les mails d'un joueur via `/mailadmin list` |
| `eriniumfaction.mail.admin.delete` | Supprimer un mail specifique via `/mailadmin delete` |
| `eriniumfaction.mail.admin.clear` | Supprimer tous les mails d'un joueur via `/mailadmin clear` |
| `eriniumfaction.mail.admin.cleanup` | Forcer le nettoyage des mails expires via `/mailadmin cleanup` |
| `eriniumfaction.mail.admin.*` | Wildcard couvrant toutes les permissions `eriniumfaction.mail.admin.` |
| `eriniumfaction.mail.*` | Wildcard couvrant toutes les permissions `eriniumfaction.mail.` |

### Lootbox (`eriniumfaction.lootbox.*`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.lootbox.give` | Donner une lootbox a un joueur via `/lootbox give` |
| `eriniumfaction.lootbox.reload` | Recharger les configs lootbox via `/lootbox reload` |
| `eriniumfaction.lootbox.list` | Lister les types de lootbox charges via `/lootbox list` |
| `eriniumfaction.lootbox.preview` | Afficher le contenu d'un lootpool via `/lootbox preview` |
| `eriniumfaction.lootbox.*` | Wildcard couvrant toutes les permissions `eriniumfaction.lootbox.` |

### Profil (`eriniumfaction.profile.*`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.profile.reset` | Remettre a zero les stats d'un joueur via `/profile reset <joueur>` |
| `eriniumfaction.profile.set` | Definir une stat d'un joueur via `/profile set <joueur> <stat> <valeur>` |
| `eriniumfaction.profile.*` | Wildcard couvrant toutes les permissions `eriniumfaction.profile.` |

### Trade (`eriniumfaction.trade.*`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.trade.admin.cancel` | Annuler le trade d'un joueur via `/tradeadmin cancel <joueur>` |
| `eriniumfaction.trade.admin.list` | Lister les trades en cours via `/tradeadmin list` |
| `eriniumfaction.trade.admin.spy` | Observer le contenu d'un trade via `/tradeadmin spy <joueur>` |
| `eriniumfaction.trade.admin.*` | Wildcard couvrant toutes les permissions `eriniumfaction.trade.admin.` |

### Securite Auth (`eriniumfaction.security.*`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.security.ban` | Bannir/debannir un joueur via `/eban`, `/eunban`, `/ebanlist`, `/ehwidban`, `/eipban` |
| `eriniumfaction.security.*` | Wildcard couvrant toutes les permissions `eriniumfaction.security.` |

### WorldEdit (`worldedit.*`) — EriniumWorld

| Permission | Description |
|------------|-------------|
| `worldedit.use` | Permission de base pour utiliser les commandes WorldEdit |
| `worldedit.wand` | Obtenir la baguette de selection |
| `worldedit.selection` | Creer/modifier des selections (pos1, pos2, hpos1, hpos2) |
| `worldedit.set` | Remplir la selection avec des blocs |
| `worldedit.replace` | Remplacer des blocs dans la selection |
| `worldedit.clipboard` | Operations copier/couper/coller |
| `worldedit.history` | Operations annuler/retablir (undo/redo) |
| `worldedit.region` | Operations de region (walls, floor, ceiling, outline, expand, contract, hollow, rotate, flip) |
| `worldedit.drain` | Drainer l'eau/lave de la selection |
| `worldedit.fixwater` | Reparer les sources d'eau |
| `worldedit.fixlava` | Reparer les sources de lave |
| `worldedit.brush` | Operations de brosse |
| `worldedit.generation` | Generer des structures/patterns |
| `worldedit.butcher` | Tuer les entites dans la selection |
| `worldedit.navigation` | Commandes de navigation |
| `worldedit.regen` | Regenerer la selection |
| `worldedit.schematic` | Sauvegarder/charger des schematics |
| `worldedit.*` | Wildcard couvrant toutes les permissions `worldedit.` |

### WorldGuard (`worldguard.*`) — EriniumWorld

| Permission | Description |
|------------|-------------|
| `worldguard.region` | Creer/gerer les regions (define, create, remove, delete, redefine, info, list, flag, addowner, removeowner, addmember, removemember, setparent) |
| `worldguard.*` | Wildcard couvrant toutes les permissions `worldguard.` |

### Teleportation (`command.*`, `warp.*`, `homes.*`)

| Permission | Description |
|------------|-------------|
| `command.setspawn` | Definir le spawn du serveur via `/setspawn` |
| `command.setwarp` | Creer un warp via `/setwarp <nom>` |
| `command.delwarp` | Supprimer un warp via `/delwarp <nom>` |
| `command.tp` | Teleporter des joueurs via `/tp`, `/tphere`, `/tppos` (commandes admin) |
| `command.erinadim` | Teleporter vers/depuis la dimension Erina via `/erinadim` (commande admin). Fallback OP niveau 2. |
| `warp.<nom>` | Autoriser l'acces a un warp specifique (ex: `warp.spawn`, `warp.pvp`) |
| `warp.*` | Autoriser l'acces a tous les warps |
| `homes.max.<N>` | Definir le nombre max de homes pour un joueur (ex: `homes.max.3` = 3 homes max). La valeur la plus haute trouvee est utilisee. |
| `command.*` | Wildcard couvrant toutes les permissions `command.` |

### Bypass de warmup (`*.nowarmup`)

Ces permissions permettent de teleporter instantanement sans attendre le warmup. Le cooldown normal est tout de meme applique.

| Permission | Description |
|------------|-------------|
| `spawn.nowarmup` | Passer le warmup de `/spawn` — teleportation instantanee |
| `home.nowarmup` | Passer le warmup de `/home` — teleportation instantanee |
| `warp.nowarmup` | Passer le warmup de `/warp` — teleportation instantanee |
| `tpa.nowarmup` | Passer le warmup de `/tpa` / `/tpahere` — teleportation instantanee a l'acceptation |
| `back.nowarmup` | Passer le warmup de `/back` — teleportation instantanee |
| `rtp.nowarmup` | Passer le warmup de `/rtp` — teleportation instantanee |

---

## Permissions internes de faction

Les factions utilisent un systeme de **roles** (Recruit, Member, Officer, Leader) avec des permissions internes configurables par role. Ces permissions ne passent PAS par le systeme de grades — elles sont gerees par le Leader via la configuration de la faction.

| Permission interne | Description |
|--------------------|-------------|
| `INVITE` | Inviter des joueurs dans la faction |
| `KICK` | Expulser des membres de la faction |
| `PROMOTE` | Promouvoir des membres |
| `DEMOTE` | Retrograder des membres |
| `CLAIM` | Claim des chunks pour la faction |
| `UNCLAIM` | Unclaim des chunks de la faction |
| `SETHOME` | Definir le home de la faction |
| `USE_BANK` | Acceder a la banque de faction |
| `SET_RELATION` | Definir les relations avec d'autres factions |
| `RENAME` | Renommer la faction |
| `SET_TAG` | Changer le tag de la faction |
| `SET_DESCRIPTION` | Changer la description de la faction |
| `TOGGLE_OPEN` | Activer/desactiver le mode ouvert |
| `SET_COLOR` | Definir la couleur de la faction |
| `USE_CHEST` | Acceder au coffre de faction |
| `MANAGE_CONTRACTS` | Gerer les contrats de ressources |
| `SET_BANNER` | Modifier la banniere de faction |

> **Note** : Le Leader a TOUJOURS toutes les permissions, independamment de la configuration des roles.

---

## Commandes et permissions requises

### `/rank` — Gestion des grades

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/rank list` | Aucune | Lister tous les grades |
| `/rank info <grade>` | Aucune | Details d'un grade |
| `/rank set <joueur> <grade>` | `rank.manage` | Assigner un grade |
| `/rank remove <joueur>` | `rank.manage` | Retirer le grade (retour a default) |
| `/rank create <id>` | `rank.manage` | Creer un grade |
| `/rank delete <id>` | `rank.manage` | Supprimer un grade |
| `/rank setprefix <id> <prefix>` | `rank.manage` | Modifier le prefixe |
| `/rank setsuffix <id> <suffix>` | `rank.manage` | Modifier le suffixe |
| `/rank setpriority <id> <nombre>` | `rank.manage` | Modifier la priorite |
| `/rank setcolor <id> <code>` | `rank.manage` | Modifier la couleur pseudo |
| `/rank addperm <id> <permission>` | `rank.manage` | Ajouter une permission au grade |
| `/rank removeperm <id> <permission>` | `rank.manage` | Retirer une permission du grade |
| `/rank addinherit <id> <parent>` | `rank.manage` | Ajouter un heritage |
| `/rank removeinherit <id> <parent>` | `rank.manage` | Retirer un heritage |
| `/rank playerperm <joueur>` | `rank.manage` | Voir les permissions custom d'un joueur |
| `/rank playeraddperm <joueur> <perm>` | `rank.manage` | Ajouter une permission custom a un joueur |
| `/rank playerremoveperm <joueur> <perm>` | `rank.manage` | Retirer une permission custom d'un joueur |
| `/rank reload` | `rank.reload` | Recharger config + grades |

### `/money` et `/pay` — Economie

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/money` | Aucune | Voir son propre solde |
| `/money <joueur>` | Aucune | Voir le solde d'un autre joueur |
| `/pay <joueur> <montant>` | Aucune | Envoyer de l'argent a un joueur |
| `/money pay <joueur> <montant>` | Aucune | Alias de `/pay` |
| `/money give <joueur> <montant>` | `economy.admin` | Ajouter de l'argent |
| `/money set <joueur> <montant>` | `economy.admin` | Definir le solde |
| `/money remove <joueur> <montant>` | `economy.admin` | Retirer de l'argent |
| `/money reset <joueur>` | `economy.admin` | Remettre le solde a zero |

### `/magic` (alias `/m`) — Magie

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/magic` ou `/magic info` | Aucune | Afficher ses infos de magie |
| `/magic equip <slot> <sort>` | Aucune | Equiper un sort dans un slot (1-4) |
| `/magic unequip <slot>` | Aucune | Retirer le sort d'un slot |
| `/magic list` | Aucune | Lister tous les sorts disponibles |
| `/magic level` | Aucune | Voir son niveau de magie et progression XP |
| `/magic admin setlevel <joueur> <niveau>` | `magic.admin` | Definir le niveau de magie |
| `/magic admin setmana <joueur> <mana>` | `magic.admin` | Definir le mana |
| `/magic admin givexp <joueur> <xp>` | `magic.admin` | Donner de l'XP magie |

### `/rpg` — Systeme RPG

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/rpg stats` | Aucune | Voir ses statistiques RPG |
| `/rpg perks` | Aucune | Voir ses perks |
| `/rpg challenges` | Aucune | Voir les defis quotidiens |
| `/rpg invest <stat>` | Aucune | Investir un point dans une stat |
| `/rpg chooseperk <tier> <index>` | Aucune | Choisir un perk |
| `/rpg respec confirm` | Aucune | Respec les points de stats (cout in-game) |
| `/rpg respecfull confirm` | Aucune | Respec complet stats + perks (cout in-game) |
| `/rpg prestige confirm` | Aucune | Prestige (niveau max requis) |
| `/rpg admin setlevel <joueur> <niveau>` | OP level 2 | Definir le niveau RPG |
| `/rpg admin givexp <joueur> <montant>` | OP level 2 | Donner de l'XP RPG |
| `/rpg admin resetdata <joueur>` | OP level 2 | Reset les donnees RPG |

### `/f` (alias `/faction`) — Factions

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/f create <nom> <tag>` | Aucune | Creer une faction |
| `/f join <faction>` | Aucune | Rejoindre une faction ouverte |
| `/f accept [faction]` | Aucune | Accepter une invitation |
| `/f deny [faction]` | Aucune | Refuser une invitation |
| `/f leave` | Aucune | Quitter sa faction |
| `/f info [faction]` | Aucune | Infos sur une faction |
| `/f list` | Aucune | Lister les factions |
| `/f home` | Aucune | Teleportation au home de faction |
| `/f chat <canal>` | Aucune | Changer de canal de chat |
| `/f map` | Aucune | Voir la carte des claims |
| `/f invite <joueur>` | Role: INVITE | Inviter un joueur |
| `/f kick <joueur>` | Role: KICK | Expulser un membre |
| `/f promote <joueur>` | Role: PROMOTE | Promouvoir un membre |
| `/f demote <joueur>` | Role: DEMOTE | Retrograder un membre |
| `/f claim` | Role: CLAIM | Claim le chunk actuel |
| `/f unclaim` | Role: UNCLAIM | Unclaim le chunk actuel |
| `/f sethome` | Role: SETHOME | Definir le home |
| `/f bank deposit <montant>` | Role: USE_BANK | Deposer dans la banque |
| `/f bank withdraw <montant>` | Role: USE_BANK | Retirer de la banque |
| `/f ally <faction>` | Role: SET_RELATION | Proposer une alliance |
| `/f neutral <faction>` | Role: SET_RELATION | Passer en neutre |
| `/f enemy <faction>` | Role: SET_RELATION | Declarer ennemi |
| `/f rename <nom>` | Role: RENAME | Renommer la faction |
| `/f tag <tag>` | Role: SET_TAG | Changer le tag |
| `/f desc <texte>` | Role: SET_DESCRIPTION | Changer la description |
| `/f open` | Role: TOGGLE_OPEN | Activer/desactiver le mode ouvert |
| `/f color <hex>` | Role: SET_COLOR | Changer la couleur |
| `/f disband` | Leader uniquement | Dissoudre la faction |
| `/f admin claim safezone` | OP level 4 | Claim un chunk en Safezone |
| `/f admin claim warzone` | OP level 4 | Claim un chunk en Warzone |
| `/f admin unclaim` | OP level 4 | Unclaim un chunk admin |
| `/f admin unclaimall safezone` | OP level 4 | Unclaim tous les chunks Safezone |
| `/f admin unclaimall warzone` | OP level 4 | Unclaim tous les chunks Warzone |
| `/f admin autoclaim safezone` | OP level 4 | Toggle auto-claim Safezone a chaque changement de chunk |
| `/f admin autoclaim warzone` | OP level 4 | Toggle auto-claim Warzone a chaque changement de chunk |
| `/f admin claimradius safezone <radius> [replace]` | OP level 4 | Claim un carre (cote 2r+1) de Safezone autour de l'admin |
| `/f admin claimradius warzone <radius> [replace]` | OP level 4 | Claim un carre (cote 2r+1) de Warzone autour de l'admin |

### `/minage` — Monde Minage

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/minage` | Aucune | Teleportation vers/depuis le monde minage |
| `/minage info` | Aucune | Infos sur le prochain reset |
| `/minage reset` | `minage.admin` | Forcer un reset du monde minage |
| `/minage editspawn` | `minage.admin` | Ouvrir la dimension d'edition du spawn |
| `/minage savespawn` | `minage.admin` | Sauvegarder le spawn edite en schematic |

### `/we` — WorldEdit (EriniumWorld)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/we wand` | `worldedit.wand` | Obtenir la baguette de selection |
| `/we pos1`, `/we pos2` | `worldedit.selection` | Definir les positions de selection |
| `/we hpos1`, `/we hpos2` | `worldedit.selection` | Definir les positions via le viseur |
| `/we set <block>` | `worldedit.set` | Remplir la selection |
| `/we replace <from> <to>` | `worldedit.replace` | Remplacer des blocs |
| `/we copy` | `worldedit.clipboard` | Copier la selection |
| `/we cut` | `worldedit.clipboard` | Couper la selection |
| `/we paste` | `worldedit.clipboard` | Coller le clipboard |
| `/we undo [n]` | `worldedit.history` | Annuler des operations |
| `/we redo [n]` | `worldedit.history` | Retablir des operations |
| `/we walls <block>` | `worldedit.region` | Murs de la selection |
| `/we floor <block>` | `worldedit.region` | Sol de la selection |
| `/we ceiling <block>` | `worldedit.region` | Plafond de la selection |
| `/we outline <block>` | `worldedit.region` | Contour de la selection |
| `/we hollow [thickness]` | `worldedit.region` | Creuser la selection |
| `/we expand <amount> [dir]` | `worldedit.region` | Etendre la selection |
| `/we contract <amount> [dir]` | `worldedit.region` | Reduire la selection |
| `/we rotate <angle>` | `worldedit.region` | Tourner le clipboard |
| `/we flip <dir>` | `worldedit.region` | Retourner le clipboard |
| `/we drain <radius>` | `worldedit.drain` | Drainer l'eau/lave |
| `/we fixwater <radius>` | `worldedit.fixwater` | Reparer les sources d'eau |
| `/we fixlava <radius>` | `worldedit.fixlava` | Reparer les sources de lave |
| `/we brush <type> <args>` | `worldedit.brush` | Configurer la brosse |
| `/we cyl <block> <r> [h]` | `worldedit.generation` | Generer un cylindre |
| `/we sphere <block> <r>` | `worldedit.generation` | Generer une sphere |
| `/we pyramid <block> <size>` | `worldedit.generation` | Generer une pyramide |
| `/we butcher [radius]` | `worldedit.butcher` | Tuer les entites |
| `/we regen` | `worldedit.regen` | Regenerer la selection |
| `/we schem save <name>` | `worldedit.schematic` | Sauvegarder un schematic |
| `/we schem load <name>` | `worldedit.schematic` | Charger un schematic |

> **Note** : Toutes les commandes `/we` requierent egalement OP level 2 en plus de la permission specifique.

### `/rg` (alias `/region`) — WorldGuard (EriniumWorld)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/rg define <nom>` | `worldguard.region` | Creer une region depuis la selection |
| `/rg redefine <nom>` | `worldguard.region` | Redefinir les limites d'une region |
| `/rg remove <nom>` | `worldguard.region` | Supprimer une region |
| `/rg info <nom>` | `worldguard.region` | Informations sur une region |
| `/rg list` | `worldguard.region` | Lister les regions |
| `/rg flag <nom> <flag> <value>` | `worldguard.region` | Modifier un flag de region |
| `/rg addowner <nom> <joueur>` | `worldguard.region` | Ajouter un proprietaire |
| `/rg removeowner <nom> <joueur>` | `worldguard.region` | Retirer un proprietaire |
| `/rg addmember <nom> <joueur>` | `worldguard.region` | Ajouter un membre |
| `/rg removemember <nom> <joueur>` | `worldguard.region` | Retirer un membre |
| `/rg setparent <nom> <parent>` | `worldguard.region` | Definir la region parente |
| `/rg seebounding <nom>` | `worldguard.region` | Afficher les limites visuelles (CUI) |

> **Note** : Toutes les commandes `/rg` requierent egalement OP level 2 en plus de la permission specifique.

### Anti-Cheat (`eriniumfaction.bypass.*`)

| Permission | Description |
|------------|-------------|
| `eriniumfaction.bypass.movement` | Bypass tous les checks de mouvement (speed, fly, nofall, phase, step, blink) |
| `eriniumfaction.bypass.combat` | Bypass tous les checks de combat (reach, killaura, autoclicker) |
| `eriniumfaction.admin.security` | Acces aux commandes anti-cheat et anti-usebug |

### Anti-Cheat — Commandes (`/ac`)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/ac alerts` | `eriniumfaction.admin.security` | Activer/desactiver les alertes anti-cheat |
| `/ac info <joueur>` | `eriniumfaction.admin.security` | Voir les violations d'un joueur |
| `/ac reset <joueur>` | `eriniumfaction.admin.security` | Reinitialiser les points de violation |
| `/ac status` | `eriniumfaction.admin.security` | Statut global de l'anti-cheat |

### Anti Use Bug — Commandes (`/usebug`)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/usebug status` | OP level 4 | Statistiques du systeme anti-exploit |
| `/usebug check <joueur>` | OP level 4 | Verifier le NBT de l'inventaire d'un joueur |
| `/usebug limits` | OP level 4 | Afficher les limites configurees |
| `/usebug clear <joueur>` | OP level 4 | Reinitialiser le compteur d'exploits |

### Performance — Commandes (`/servperf`)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/servperf` | OP level 2 | Dashboard complet de performance |
| `/servperf tps` | OP level 2 | TPS detaille |
| `/servperf entities` | OP level 2 | Compteur d'entites par dimension |
| `/servperf chunks` | OP level 2 | Chunks charges |
| `/servperf view <n\|auto>` | OP level 2 | Changer la view distance |

### Web API — Commandes (`/webinfo`)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/webinfo` | OP level 2 | Afficher l'URL et le statut du serveur API |

### Biomes — Commandes (`/locatebiome`)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/locatebiome <biome>` | OP level 2 | Trouver le biome le plus proche |

### EriniumBorder — Commandes (`/eriniumborder`)

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/eriniumborder info` | OP level 2 | Afficher la config courante de la bande border |
| `/eriniumborder regen confirm` | OP level 2 | Reecrire tous les chunks border charges (destructif, soumis a un cooldown configurable) |

### Commandes Vanilla (`minecraft.command.*`)

Les commandes vanilla de Minecraft sont normalement reservees aux joueurs OP. Grace au Mixin sur `EntityPlayerMP.canUseCommand`, il est possible d'accorder l'acces a des commandes vanilla specifiques via le systeme de grades RankManager, **sans donner le statut OP** au joueur.

**Fonctionnement** : Quand un joueur non-OP tape une commande vanilla, le systeme verifie si son grade (ou ses permissions custom) contient `minecraft.command.<nom_commande>`. Si oui, la commande est autorisee. Les joueurs OP gardent l'acces a toutes les commandes comme avant.

**Exception** : `/op` et `/deop` restent exclusivement accessibles aux joueurs OP (aucun grade ne peut les accorder).

| Permission | Commande |
|------------|----------|
| `minecraft.command.gamemode` | `/gamemode` |
| `minecraft.command.tp` | `/tp` |
| `minecraft.command.give` | `/give` |
| `minecraft.command.time` | `/time` |
| `minecraft.command.weather` | `/weather` |
| `minecraft.command.kill` | `/kill` |
| `minecraft.command.effect` | `/effect` |
| `minecraft.command.enchant` | `/enchant` |
| `minecraft.command.xp` | `/xp` |
| `minecraft.command.summon` | `/summon` |
| `minecraft.command.setblock` | `/setblock` |
| `minecraft.command.fill` | `/fill` |
| `minecraft.command.clone` | `/clone` |
| `minecraft.command.clear` | `/clear` |
| `minecraft.command.difficulty` | `/difficulty` |
| `minecraft.command.gamerule` | `/gamerule` |
| `minecraft.command.spawnpoint` | `/spawnpoint` |
| `minecraft.command.setworldspawn` | `/setworldspawn` |
| `minecraft.command.toggledownfall` | `/toggledownfall` |
| `minecraft.command.defaultgamemode` | `/defaultgamemode` |
| `minecraft.command.worldborder` | `/worldborder` |
| `minecraft.command.title` | `/title` |
| `minecraft.command.particle` | `/particle` |
| `minecraft.command.playsound` | `/playsound` |
| `minecraft.command.scoreboard` | `/scoreboard` |
| `minecraft.command.spreadplayers` | `/spreadplayers` |
| `minecraft.command.stopsound` | `/stopsound` |
| `minecraft.command.teleport` | `/teleport` |
| `minecraft.command.ban` | `/ban` (vanilla) |
| `minecraft.command.pardon` | `/pardon` |
| `minecraft.command.banlist` | `/banlist` (vanilla) |
| `minecraft.command.ban-ip` | `/ban-ip` |
| `minecraft.command.pardon-ip` | `/pardon-ip` |
| `minecraft.command.whitelist` | `/whitelist` |
| `minecraft.command.kick` | `/kick` |
| `minecraft.command.list` | `/list` |
| `minecraft.command.say` | `/say` |
| `minecraft.command.tell` | `/tell` |
| `minecraft.command.msg` | `/msg` |
| `minecraft.command.me` | `/me` |
| `minecraft.command.help` | `/help` |
| `minecraft.command.stop` | `/stop` |
| `minecraft.command.save-all` | `/save-all` |
| `minecraft.command.save-on` | `/save-on` |
| `minecraft.command.save-off` | `/save-off` |
| `minecraft.command.reload` | `/reload` |
| `minecraft.command.seed` | `/seed` |
| `minecraft.command.replaceitem` | `/replaceitem` |
| `minecraft.command.entitydata` | `/entitydata` |
| `minecraft.command.blockdata` | `/blockdata` |
| `minecraft.command.testfor` | `/testfor` |
| `minecraft.command.testforblock` | `/testforblock` |
| `minecraft.command.testforblocks` | `/testforblocks` |
| `minecraft.command.trigger` | `/trigger` |
| `minecraft.command.stats` | `/stats` |
| `minecraft.command.execute` | `/execute` |
| `minecraft.command.publish` | `/publish` |
| `minecraft.command.*` | Toutes les commandes vanilla d'un coup |

> **Exclues** : `op` et `deop` restent vanilla (OP uniquement, non overridables par un grade).

---

## Work Panel (Web Staff) — Permissions backend

> **Scope** : ces permissions controlent l'acces au panel staff web (Next.js + Neon Postgres) accessible depuis `/admin/work/*`.
> **Distinct du jeu** : aucune de ces permissions n'est verifiee in-game. Elles sont attribuees via le panel `/admin/work/roles` (table Postgres `staff_role_permissions`).
> **Reference code** : `EriniumFactionWeb/src/lib/work/permissions.ts` (resolution + cache `perms_version`), `EriniumFactionWeb/src/lib/db/index.ts` (seed des 7 roles systeme).

### Syntaxe wildcard (identique aux grades in-game)

| Syntaxe | Effet |
|---------|-------|
| `feature.action` | Permission exacte (ex: `cards.update`) |
| `feature.*` | Toutes les actions de la feature (ex: `cards.*` = create + read + update + delete) |
| `*` | Bypass total (reserve a l'**Owner** Discord `909862540945793094`) |

L'Owner court-circuite la resolution DB et obtient toujours `*` sans entree en base.

### Catalogue (Phase 1-4 livrees + 5-7 reservees)

#### `workspaces.*` — espaces de travail (Phase 3)

| Permission | Description |
|------------|-------------|
| `workspaces.create` | Creer un nouveau workspace (regroupement de boards) |
| `workspaces.read` | Voir la liste des workspaces visibles (filtre par visibility + roles) |
| `workspaces.update` | Renommer / changer la couleur / visibility d'un workspace |
| `workspaces.delete` | Archiver puis purger definitivement un workspace |

#### `boards.*` — tableaux Kanban (Phase 3)

| Permission | Description |
|------------|-------------|
| `boards.create` | Creer un board dans un workspace visible |
| `boards.read` | Voir la liste des boards d'un workspace |
| `boards.update` | Renommer / changer la couleur / reorder un board |
| `boards.delete` | Archiver puis purger un board (purge les colonnes + cartes en cascade) |

#### `cards.*` — cartes Kanban (Phase 3-4)

| Permission | Description |
|------------|-------------|
| `cards.create` | Creer une carte dans une colonne |
| `cards.read` | Lire les cartes (vue Kanban + detail) |
| `cards.update` | Editer title, description, priority, due_at, completed_at, labels, assignees, checklists, polls, time-entries, attachments, deplacer dans une autre colonne |
| `cards.delete` | Archiver une carte (soft delete via `archived = true`) puis purge definitive |

#### `comments.*` — commentaires sur cartes (Phase 4 batch 3)

| Permission | Description |
|------------|-------------|
| `comments.create` | Poster un commentaire sur une carte (avec mentions) |
| `comments.read` | Lire les commentaires d'une carte |
| `comments.update` | Editer son propre commentaire (les Mods peuvent editer tous) |
| `comments.delete` | Supprimer un commentaire |

#### `events.*` — calendrier interne (Phase 5, **a venir**)

| Permission | Description |
|------------|-------------|
| `events.create` | Creer un evenement staff / release / incident / event MC recurrent |
| `events.read` | Voir le calendrier `/admin/work/calendar` |
| `events.update` | Modifier un evenement existant |
| `events.delete` | Supprimer un evenement |

#### `tickets.*` — tickets joueurs (Phase 7, **a venir**)

| Permission | Description |
|------------|-------------|
| `tickets.create` | Creer un ticket manuel (cote staff) |
| `tickets.read` | Voir la file des tickets |
| `tickets.update` | Assigner / changer statut / repondre |
| `tickets.delete` | Supprimer un ticket (apres resolution) |

#### `announcements.*` — annonces internes (Phase 6a, **implementee**)

| Permission | Description |
|------------|-------------|
| `announcements.create` | Publier une annonce staff (audience = tout le staff actif). Genere une notification de masse + un mention specifique pour les users @-mentionnes dans le body. Si `post_to_discord=true`, diffuse aussi via webhook. |
| `announcements.read` | Lire les annonces sur `/admin/work/announcements`. Sans cette perm, la page renvoie AccessDenied (403). |
| `announcements.update` | Modifier une annonce existante (titre, body, severity, dates, pinned). Couvre aussi le toggle pin/unpin via le bouton dedie. |
| `announcements.delete` | Supprimer une annonce (soft delete, `deleted_at`). |
| `announcements.ack` | Acquitter ("J'ai vu") une annonce. Idempotent : un user ne peut ack qu'une seule fois. Le compteur d'acks + la liste sont visibles dans le detail. |
| `announcements.pin` | Reserve : techniquement le toggle pin est sous `announcements.update` (cf. ci-dessus). Cette perm existe pour permettre une separation future (ex : retirer le pin sans accorder l'edition complete). |

> **Seed** :
> - `admin` et `lead` -> les 6 perms (CRUD + ack + pin) via un seed SQL post-bootstrap.
> - `mod` et `support` -> `announcements.read` + `announcements.ack` uniquement.
> - `event_team` -> `announcements.create` + `announcements.update` (defini dans `SYSTEM_ROLES`, sans `read` ni `ack` — un admin doit ajouter `read` si l'event team doit naviguer sur la page).
> - `default_staff` -> `announcements.read` uniquement (lecture seule, pas d'ack par defaut).
> - Tout autre role custom doit recevoir les perms manuellement via `/admin/work/roles`.

#### `kb.*` — Knowledge Base interne (Phase 6b, **implementee**)

| Permission | Description | Roles seedes |
|------------|-------------|--------------|
| `kb.read` | Lire les articles | `admin`, `moderator`, `event_team`, `support`, `builder`, `default_staff` |
| `kb.create` | Creer space / category / article | `admin` |
| `kb.update` | Editer (versioning auto) | `admin` |
| `kb.delete` | Soft-delete article / restore version | `admin` |

> **Seed** :
> - `admin` -> les 4 perms (CRUD complet).
> - `moderator`, `event_team`, `support`, `builder`, `default_staff` -> `kb.read` uniquement.
> - Tout autre role custom doit recevoir les perms manuellement via `/admin/work/roles`.
> - Note : les anciens seeds `kb_articles.*` (feature stub jamais buildee) ont ete supprimes — les vraies perms du systeme Knowledge Base sont `kb.*`.

#### `work.roadmap.*` — Roadmap & specs (Phase 6 — Erisclave migration)

| Permission | Description |
|------------|-------------|
| `work.roadmap.view` | Lire la roadmap (`/admin/work/roadmap`) et voir les specs (`/admin/work/specs/<slug>`). |
| `work.roadmap.edit` | Toggle tasks done, editer status/tags, creer & editer specs, editer projects. (P2) |
| `work.roadmap.delete` | Supprimer specs / projects / tasks. (P2) |

> **Seed** : ces 3 perms sont attribuees aux roles `admin` et `lead` au boot via `_initDbInternal()`. Les autres roles staff (incluant `default_staff`, `moderator`, `builder`, `event_team`, `support`) n'ont pas acces a la roadmap par defaut — un Admin doit les attribuer manuellement via `/admin/work/roles`.

#### `roles.*` — gestion des roles staff (Phase 2)

| Permission | Description |
|------------|-------------|
| `roles.create` | Creer un role custom (nom, couleur, icone, priorite) |
| `roles.read` | Voir la matrice roles x permissions |
| `roles.update` | Editer un role, attribuer/retirer des permissions |
| `roles.delete` | **Reserve a l'Owner** — supprimer un role (impossible pour les Admins) |

#### `staff.*` — gestion des membres staff (Phase 2)

| Permission | Description |
|------------|-------------|
| `staff.create` | Ajouter un membre staff (par recherche Discord ID) |
| `staff.read` | Voir la liste des staff (avec leurs roles) |
| `staff.update` | Assigner / retirer des roles a un staff |
| `staff.delete` | Retirer le statut staff d'un user |

#### `webhooks.*` — configuration webhooks Discord (Phase 4 batch 4)

| Permission | Description |
|------------|-------------|
| `webhooks.create` | Configurer un webhook Discord par workspace (channel + events) |
| `webhooks.read` | Voir la config webhook d'un workspace |
| `webhooks.update` | Modifier l'URL / les events ecoutes |
| `webhooks.delete` | Supprimer le webhook |

#### `audit_log.read` — consultation du journal d'audit (Phase 2)

| Permission | Description |
|------------|-------------|
| `audit_log.read` | Consulter le journal complet (actor, action, diff before/after, IP, user-agent) |

> **Note** : `audit_log.delete` n'existe pas. Le journal est immuable. Seul l'Owner peut purger via `*`.

#### `mc.*` — actions cote serveur Minecraft (reservees, **a venir**)

| Permission | Description |
|------------|-------------|
| `mc.player.view` | Consulter les infos in-game d'un joueur (faction, balance, niveau, etc.) |
| `mc.player.kick` | Kick un joueur du serveur depuis le panel |
| `mc.player.mute` | Mute un joueur depuis le panel |
| `mc.command.exec` | Executer une commande arbitraire sur le serveur MC depuis le panel |

### Roles systeme (seed automatique)

7 roles sont crees automatiquement au premier boot via `initDb()`. Ils peuvent etre edites par un Admin (sauf le role `owner` qui est immuable).

| Slug | Nom affiche | Couleur | Priorite | Wildcards / perms cles |
|------|-------------|---------|----------|------------------------|
| `owner` | Owner | `#FFD700` | 1 | `*` — bypass total |
| `admin` | Administrateur | `#9B4FCF` | 10 | Toutes les perms **sauf** `roles.delete` (reserve Owner) |
| `moderator` | Moderateur | `#3498DB` | 20 | `cards.*`, `comments.*`, `tickets.*`, lectures (boards/workspaces/events/announcements) + `kb.read`, `audit_log.read`, `staff.read`, `mc.player.view/kick/mute` |
| `builder` | Builder | `#2ECC71` | 30 | Read workspaces/boards/events + `kb.read` + CRUD `cards.*` + CRUD `comments.*` |
| `event_team` | Event Team | `#E67E22` | 40 | Read workspaces/boards + `kb.read` + CRUD `cards.*` + CRUD `events.*` + `announcements.create/update` + `mc.command.exec` |
| `support` | Support | `#00E5FF` | 50 | CRUD `tickets.*` + `cards.read` + `kb.read` + `mc.player.view` + `announcements.read` |
| `default_staff` | Staff (defaut) | `#8892A4` | 100 | Lectures seulement (workspaces/boards/cards/comments/events/announcements) + `kb.read` + `comments.create` |

> **Migration legacy** : tous les utilisateurs ayant un grade in-game `staff`/`mod`/`admin` au premier boot recoivent automatiquement le role `default_staff` (cf. `EriniumFactionWeb/src/lib/auth/ensure-owner-role.ts`).

### Verrous d'invariance

Certaines operations sont **interdites** meme aux Admins, pour eviter qu'un compromis d'Admin ne puisse couper la chaine de securite :

- L'Owner ne peut etre **degrade**, **supprime** ou voir son role `owner` retire.
- Le role `owner` lui-meme est **non editable** (seul Owner peut modifier via API directe).
- `roles.delete` n'est dans **aucun** preset, meme `admin`. Seul `*` (Owner) le possede.
- Les boards/workspaces archives par un staff peuvent etre restaures par tout user avec la perm `*.update` correspondante, mais pas par un user sans cette perm meme s'il est l'auteur de l'archive.

### Cache et invalidation

La resolution des permissions est cachee en RAM par instance serverless avec une cle `(user_id, perms_version)`. Toute modification de roles/permissions doit appeler `invalidateUserPerms(userId)` qui bump `users.perms_version` — la prochaine resolution force un refresh DB.

---

## Fichiers de stockage

| Fichier | Contenu |
|---------|---------|
| `config/EriniumFaction/ranks/*.json` | Definition des grades (permissions, prefix, suffix, heritage) |
| `config/EriniumFaction/player-ranks.json` | Assignation UUID → grade |
| `config/EriniumFaction/player-permissions.json` | Permissions custom par joueur (UUID → liste) |
| **Postgres** `staff_roles`, `staff_role_permissions`, `staff_user_roles` | Roles + permissions du Work Panel web (Neon) |

---

## Exemples de configuration

### Grade admin avec toutes les permissions
```json
{
  "name": "&cAdmin",
  "priority": 100,
  "prefix": "&c[Admin] ",
  "suffix": "",
  "color": "&c",
  "inherits": ["moderator"],
  "permissions": ["*"]
}
```

### Grade moderateur
```json
{
  "name": "&9Moderateur",
  "priority": 50,
  "prefix": "&9[Mod] ",
  "suffix": "",
  "color": "&9",
  "inherits": ["default"],
  "permissions": [
    "rank.manage",
    "rank.reload",
    "chat.color",
    "chat.staff",
    "magic.admin",
    "minage.admin",
    "economy.admin"
  ]
}
```

### Donner une permission a un joueur specifique
```
/rank playeraddperm Steve chat.color
```

### Retirer une permission via negation sur un grade
```
/rank addperm vip -chat.color
```
