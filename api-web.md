# EriniumFaction — Documentation API Web

> Serveur API prive base sur Netty. Expose une API REST JSON pour le site web externe et les outils d'administration.
>
> Port par defaut : **8081** | Config : `config/eriniumfaction_webserver.cfg`
>
> **Desactive par defaut** (`enabled = false`). A activer uniquement si un site web externe a besoin d'acceder aux donnees du serveur.

---

## Architecture

Le serveur API est concu pour la communication **serveur web externe → serveur Minecraft** :

```
[Site web / Backend externe]
         |
         | HTTP JSON (IP whitelistee)
         v
[API Server :8081]  ← ce module
         |
         | Lecture des donnees en memoire (thread-safe)
         | Ecriture via server.addScheduledTask() (main thread MC)
         v
[Minecraft Server]
```

Flux typique :
1. Un joueur visite le site web de la guilde
2. Le backend du site appelle `GET /api/factions/{id}` pour afficher les stats
3. Le site appelle `POST /api/admin/broadcast` pour envoyer une annonce en jeu

---

## Configuration

| Parametre | Defaut | Description |
|-----------|--------|-------------|
| `enabled` | `false` | Active/desactive le serveur API |
| `port` | `8081` | Port HTTP |
| `ipAddress` | `""` | IP a ecouter. Vide = toutes les interfaces (0.0.0.0) |
| `whitelistedIps` | `"127.0.0.1"` | IPs autorisees a appeler l'API (separees par virgule) |

---

## Securite

- **IP whitelist obligatoire** — toute requete provenant d'une IP non listee recoit `403 Forbidden` immediatement, avant tout traitement
- Ajouter l'IP du serveur web externe dans `whitelistedIps`. Exemple : `127.0.0.1,203.0.113.42`
- Pas de CORS — ce serveur est prevu pour backend-to-backend uniquement, pas pour des navigateurs
- Les operations d'ecriture (kick, broadcast, command) passent par `server.addScheduledTask()` — aucun impact sur le main thread direct
- Le serveur Netty tourne sur des threads separes — aucun impact sur les TPS

---

## Endpoints API

Toutes les reponses sont en JSON. Encodage UTF-8.

### Serveur

#### `GET /api/server`

Informations generales du serveur.

```json
{
  "name": "EriniumFaction Server",
  "motd": "Message du jour",
  "version": "Minecraft 1.12.2 (EriniumFaction 1.0.0)",
  "players_online": 234,
  "players_max": 1000,
  "tps": 19.8,
  "uptime": 1711152000000,
  "memory_used_mb": 1200,
  "memory_max_mb": 4096,
  "memory_percent": 29
}
```

#### `GET /api/server/tps`

TPS detaille (moyennes glissantes).

```json
{
  "tps_1s": 20.0,
  "tps_1m": 19.8,
  "tps_5m": 19.5,
  "tick_ms": 48.2
}
```

---

### Joueurs

#### `GET /api/players`

Tous les joueurs en ligne (donnees completes avec RPG et balance).

```json
[
  {
    "uuid": "069a79f4-...",
    "name": "Dev",
    "online": true,
    "dimension": 0,
    "x": 100,
    "y": 64,
    "z": -200,
    "health": 20,
    "health_max": 20,
    "food": 18,
    "level": 30,
    "faction_id": "36fe32a2-...",
    "faction_name": "MaFaction",
    "faction_role": "LEADER",
    "rank_prefix": "&6[Owner]",
    "power": 15.0,
    "max_power": 20.0,
    "total_kills": 42,
    "total_deaths": 7
  }
]
```

#### `GET /api/players/online`

Version compacte des joueurs en ligne (nom, position, faction).

```json
[
  {
    "uuid": "069a79f4-...",
    "name": "Dev",
    "dimension": 0,
    "x": 100,
    "y": 64,
    "z": -200,
    "faction_name": "MaFaction",
    "faction_id": "36fe32a2-...",
    "rank_prefix": "&6[Owner]"
  }
]
```

#### `GET /api/players/{uuid}`

Detail complet d'un joueur specifique (inclut RPG + balance).

```json
{
  "uuid": "069a79f4-...",
  "name": "Dev",
  "online": true,
  "dimension": 0,
  "x": 100,
  "y": 64,
  "z": -200,
  "health": 20,
  "health_max": 20,
  "food": 18,
  "level": 30,
  "faction_id": "36fe32a2-...",
  "faction_name": "MaFaction",
  "faction_role": "LEADER",
  "rank_prefix": "&6[Owner]",
  "power": 15.0,
  "max_power": 20.0,
  "total_kills": 42,
  "total_deaths": 7,
  "rpg": {
    "level": 25,
    "xp": 4200,
    "prestige": 1,
    "stat_vigueur": 10,
    "stat_force": 8,
    "stat_resistance": 6,
    "stat_agilite": 5,
    "stat_fortune": 3,
    "stat_arcane": 2,
    "points_available": 0
  },
  "balance": 12345.67
}
```

#### `GET /api/players/{uuid}/inventory`

Inventaire du joueur (slots non vides seulement).

```json
[
  { "slot": 0, "item": "minecraft:diamond_sword", "count": 1, "display_name": "Epee en diamant", "nbt_hash": "a3f2b1c0" },
  { "slot": 1, "item": "minecraft:apple", "count": 32, "display_name": "Pomme", "nbt_hash": null }
]
```

#### `GET /api/players/{uuid}/grade`

Grade du joueur. Fonctionne meme si le joueur est hors ligne (lit depuis les fichiers JSON).

```json
{
  "rankId": "vip",
  "rankName": "VIP",
  "priority": 10
}
```

Si le joueur n'a pas de grade specifique (ou grade par defaut) :

```json
{
  "rankId": "default",
  "rankName": "default",
  "priority": 0
}
```

---

### Factions

#### `GET /api/factions`

Toutes les factions (triees par niveau decroissant).

```json
[
  {
    "id": "36fe32a2-...",
    "name": "MaFaction",
    "tag": "MF",
    "leader_name": "Dev",
    "member_count": 5,
    "level": 20,
    "xp": 7500,
    "prestige": 1,
    "bank": 5000.00,
    "open": false,
    "color": "#FF6B00",
    "max_members_earned": 40,
    "claims": 15
  }
]
```

#### `GET /api/factions/{id}`

Detail complet d'une faction.

```json
{
  "id": "36fe32a2-...",
  "name": "MaFaction",
  "tag": "MF",
  "leader_name": "Dev",
  "member_count": 5,
  "level": 20,
  "xp": 7500,
  "prestige": 1,
  "bank": 5000.00,
  "open": false,
  "color": "#FF6B00",
  "max_members_earned": 40,
  "claims": 15,
  "description": "La meilleure faction",
  "leader_uuid": "069a79f4-...",
  "created_time": 1711065600000,
  "home_set": true,
  "home_world": 0,
  "home_x": 100,
  "home_y": 64,
  "home_z": -200,
  "role_order": ["LEADER", "OFFICER", "MEMBER", "RECRUIT"],
  "unlocked_perks": ["CHEST_ACCESS", "TELEPORT"],
  "skill_points_spent": 12,
  "bank_history": [
    { "player": "Dev", "amount": 500.0, "type": "DEPOSIT", "timestamp": 1711152000000 }
  ]
}
```

#### `GET /api/factions/{id}/members`

Liste des membres d'une faction.

```json
[
  {
    "uuid": "069a79f4-...",
    "name": "Dev",
    "role": "LEADER",
    "power": 20.0,
    "online": true
  }
]
```

Note : `power` n'est present que pour les membres en ligne.

#### `GET /api/factions/{id}/claims`

Chunks claim par une faction.

```json
[
  { "chunk_x": 10, "chunk_z": -5, "dimension": 0 },
  { "chunk_x": 11, "chunk_z": -5, "dimension": 0 }
]
```

---

### Economie

#### `GET /api/economy/top`

Top 50 joueurs les plus riches (en ligne uniquement).

```json
[
  { "uuid": "069a79f4-...", "name": "Dev", "balance": 50000.00 },
  { "uuid": "abcd1234-...", "name": "Player2", "balance": 30000.00 }
]
```

#### `GET /api/economy/{uuid}`

Solde d'un joueur en ligne.

```json
{ "uuid": "069a79f4-...", "name": "Dev", "balance": 50000.00 }
```

---

### Eris (Monnaie Premium)

#### `GET /api/eris/{uuid}`

Solde Eris d'un joueur (fonctionne en ligne et hors ligne).

```json
{ "uuid": "069a79f4-...", "name": "Dev", "balance": 1500 }
```

#### `POST /api/admin/eris/give`

Ajoute des Eris a un joueur. Fonctionne hors ligne.

**Body** :
```json
{ "uuid": "069a79f4-...", "amount": 100, "reason": "Achat boutique" }
```

**Reponse** :
```json
{ "success": true, "uuid": "069a79f4-...", "amount": 100, "new_balance": 1600 }
```

#### `POST /api/admin/eris/take`

Retire des Eris a un joueur (floor a 0). Fonctionne hors ligne.

**Body** :
```json
{ "uuid": "069a79f4-...", "amount": 50, "reason": "Remboursement" }
```

**Reponse** :
```json
{ "success": true, "uuid": "069a79f4-...", "amount": 50, "new_balance": 1550 }
```

#### `POST /api/admin/eris/set`

Definit le solde Eris exact d'un joueur. Fonctionne hors ligne.

**Body** :
```json
{ "uuid": "069a79f4-...", "amount": 500, "reason": "Correction admin" }
```

**Reponse** :
```json
{ "success": true, "uuid": "069a79f4-...", "amount": 500, "new_balance": 500 }
```

---

### Monde

#### `GET /api/world`

Informations sur le monde (dimension 0).

```json
{
  "seed": 8421128056903243505,
  "time": 6000,
  "day_time": 6000,
  "raining": false,
  "thundering": false,
  "spawn_x": 0,
  "spawn_y": 64,
  "spawn_z": 0,
  "dimensions": [0, 2]
}
```

#### `GET /api/world/biome?x=100&z=-200`

Biome a des coordonnees donnees.

```json
{
  "biome_name": "cherry_forest",
  "biome_id": 178,
  "temperature": 0.8,
  "x": 100,
  "z": -200
}
```

#### `GET /api/world/chunk?x=10&z=-5`

Informations sur un chunk.

```json
{
  "chunk_x": 10,
  "chunk_z": -5,
  "loaded": true,
  "entities": 12,
  "tile_entities": 3,
  "faction_owner_id": "36fe32a2-...",
  "faction_owner_name": "MaFaction"
}
```

`faction_owner_id` et `faction_owner_name` sont `null` si le chunk n'est pas claim.

---

### Chat

#### `GET /api/chat?limit=20`

Derniers messages du chat (max 100, defaut 20). Ordre : plus recent en premier.

```json
[
  {
    "timestamp": 1711152000000,
    "player": "Dev",
    "message": "Salut tout le monde !"
  }
]
```

---

### Performance

#### `GET /api/performance`

Metriques de performance serveur.

```json
{
  "tps": 19.8,
  "tick_ms": 48.2,
  "entities": 1234,
  "chunks_loaded": 3456,
  "memory_used_mb": 1200,
  "memory_max_mb": 4096,
  "memory_percent": 29,
  "view_distance": 7,
  "players_online": 234
}
```

---

### Admin (ecriture — POST)

Les endpoints admin permettent d'effectuer des actions en jeu. Ils sont soumis au meme controle IP que tous les autres endpoints.

#### `POST /api/admin/broadcast`

Envoie un message a tous les joueurs en ligne.

```json
// Corps de la requete
{ "message": "Le serveur redemarre dans 5 minutes !" }

// Reponse
{ "success": true, "message": "Le serveur redemarre dans 5 minutes !" }
```

#### `POST /api/admin/kick`

Kick un joueur.

```json
// Corps de la requete
{ "uuid": "069a79f4-...", "reason": "Comportement inapproprie" }

// Reponse
{ "success": true, "kicked": "069a79f4-..." }
```

#### `POST /api/admin/command`

Execute une commande serveur (comme si tapee par la console).

```json
// Corps de la requete
{ "command": "give Dev minecraft:diamond 64" }

// Reponse
{ "success": true, "command": "give Dev minecraft:diamond 64" }
```

---

## Exemple d'utilisation (backend Node.js / Python)

```javascript
// Exemple Node.js — recuperer les factions et afficher sur un site
const API = 'http://127.0.0.1:8081';

// Recuperer toutes les factions
const factions = await fetch(`${API}/api/factions`).then(r => r.json());
factions.forEach(f => console.log(`${f.name} [${f.tag}] — Niv.${f.level} — ${f.member_count} membres`));

// Recuperer les joueurs en ligne
const players = await fetch(`${API}/api/players/online`).then(r => r.json());
console.log(`${players.length} joueurs en ligne`);

// Envoyer un broadcast depuis le panneau admin du site
await fetch(`${API}/api/admin/broadcast`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Bienvenue sur EriniumFaction !' })
});
```

```python
# Exemple Python
import requests

API = 'http://127.0.0.1:8081'

# Infos serveur
r = requests.get(f'{API}/api/server')
data = r.json()
print(f"TPS: {data['tps']}, Joueurs: {data['players_online']}/{data['players_max']}")

# Kick un joueur
requests.post(f'{API}/api/admin/kick', json={
    'uuid': '069a79f4-...',
    'reason': 'Triche detectee'
})
```

---

## Codes de reponse HTTP

| Code | Signification |
|------|--------------|
| 200 | Succes |
| 400 | Requete invalide (parametre manquant ou malformed) |
| 403 | IP non autorisee |
| 404 | Ressource non trouvee (joueur hors ligne, faction inexistante, etc.) |
| 405 | Methode HTTP non supportee |
| 500 | Erreur serveur interne |
| 503 | Serveur Minecraft non disponible |
