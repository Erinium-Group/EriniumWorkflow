# Admin Shop — Design Document

**Date** : 2026-05-11
**Feature** : Shop administrateur dynamique avec pricing influencé par les transactions
**Package** : `fr.eriniumgroup.eriniumfaction.shop`
**Spec source** : `docs/specs/admin-shop.html`

---

## Choix validés

| Question | Réponse |
|----------|---------|
| Approche | A — implémentation complète en une passe |
| Strings config | Français direct dans le JSON (pas de clés i18n) |
| Recherche V1 | Oui — barre de recherche globale dès V1 |
| Rate limiting | Non — pas en V1 |
| Keybind B | Oui — dès V1 |

---

## 1. Architecture générale

### Package `fr.eriniumgroup.eriniumfaction.shop`

| Classe | Rôle |
|--------|------|
| `AdminShopManager` | Singleton. Charge la config, expose les catégories/items, route les achats/ventes |
| `ShopConfigLoader` | Parse `config/eriniumfaction/shop-config.json` → objets Java via Gson |
| `ShopCategory` | POJO catégorie (nom FR, icône, liste de sous-catégories) |
| `ShopSubCategory` | POJO sous-catégorie (nom FR, liste d'items) |
| `ShopItem` | POJO item (configId, ItemStack, displayName, prix base, maxQty) |
| `ShopPriceEngine` | Stateless. Calcule les prix courants à partir du prix base + influence |
| `ShopPriceData` | `WorldSavedData`. Persiste les influences par configId. Decay intégré |
| `GuiAdminShop` | GUI client — 3 écrans : catégories → items → popup achat/vente |
| `AdminShopCommand` | `/shop` + `/shopadmin reload/resetprices/resetprice/info/setinfluence` |

### Flux d'un achat

```
Client [B] → GuiAdminShop → sendAction("shop_gui", "shop_gui", "buy", "id=X|qty=Y")
→ ShopNetworkHandler → AdminShopManager.buy(player, itemId, qty)
→ ShopPriceEngine.buyPrice(item, influence) → débit dollars joueur
→ ShopPriceData.addBuyInfluence(itemId, qty) → markDirty()
→ openGuiFor(player, ...) avec données rafraîchies
```

### Intégration

- `FMLServerStartingEvent` → `AdminShopManager.getInstance().init(server)`
- `ClientProxy.init()` → registration keybind B via `EriKeys`
- `ShopNetworkHandler` : nouvelle classe `shop/ShopNetworkHandler.java`, enregistrée dans `CommonProxy.preInit()` via `GuiNetworkHandler.registerActionHandler("shop_gui", ...)`
- Nouvelles permissions documentées dans `docs/permissions.md`

---

## 2. Structures de données

### POJOs (immutables après chargement)

```java
ShopItem {
    String configId;        // clé unique ex: "iron_ingot"
    ItemStack itemStack;    // résolu au chargement, pas à chaque tick
    String displayName;     // "Lingot de Fer"
    long baseBuyPrice;      // 0 = item non achetable par le joueur
    long baseSellPrice;     // 0 = item non vendable par le joueur
    boolean canSell;        // baseSellPrice > 0
    int maxQtyPerTx;        // défaut 64
}

ShopSubCategory { String name; List<ShopItem> items; }
ShopCategory    { String name; String iconItemId; List<ShopSubCategory> subs; }
```

### ShopPriceData (WorldSavedData)

**Clé** : `"eriniumfaction_shop_prices"`

```java
Map<String, Double> buyInfluence;    // configId → [0.0, ∞)
Map<String, Double> sellInfluence;   // configId → [0.0, ∞)
long lastDecayTimestamp;             // epoch ms — pour recalcul decay au restart
```

**Sérialisation NBT** : `NBTTagList` d'entries `{id:String, buyInf:Double, sellInf:Double}` + tag `lastDecay:Long`.

**Decay au chargement** : `readFromNBT()` calcule `n = (now - lastDecay) / decayIntervalMs`, applique `influence *= decayFactor^n` pour compenser les periodes manquées pendant un redémarrage serveur.

### Format shop-config.json

```json
{
  "priceEngine": {
    "buyFactor": 0.3,
    "sellFactor": 0.3,
    "decayFactor": 0.85,
    "decayIntervalMinutes": 360,
    "minMultiplier": 0.5,
    "maxMultiplier": 3.0,
    "minSpreadPercent": 10
  },
  "categories": [
    {
      "name": "Ressources",
      "icon": "minecraft:iron_ingot",
      "subcategories": [
        {
          "name": "Métaux",
          "items": [
            {
              "id": "iron_ingot",
              "item": "minecraft:iron_ingot",
              "display": "Lingot de Fer",
              "buy": 50,
              "sell": 40,
              "maxQty": 64
            }
          ]
        }
      ]
    }
  ]
}
```

`ShopConfigLoader` parse ce JSON avec Gson au démarrage et à chaque `/shopadmin reload`. Les `ItemStack` sont résolus une seule fois. Un item inconnu (`Item.getByNameOrId()` retourne null) génère un warning dans les logs et est ignoré silencieusement.

---

## 3. Moteur de prix & Decay

### ShopPriceEngine (méthodes statiques, stateless)

```java
long buyPrice(ShopItem item, double buyInfluence, ShopPriceConfig cfg) {
    double mult = clamp(1.0 + buyInfluence * cfg.buyFactor, cfg.minMult, cfg.maxMult);
    return Math.round(item.baseBuyPrice * mult);
}

long sellPrice(ShopItem item, double buyInfluence, double sellInfluence, ShopPriceConfig cfg) {
    double mult = clamp(1.0 - sellInfluence * cfg.sellFactor, cfg.minMult, cfg.maxMult);
    long raw = Math.round(item.baseSellPrice * mult);
    // Garantit le spread minimum
    long maxSell = Math.round(buyPrice(item, buyInfluence, cfg) * (1.0 - cfg.minSpreadPercent / 100.0));
    return Math.min(raw, maxSell);
}
```

### Accumulation d'influence après transaction

```java
// Achat de qty unités
data.buyInfluence.merge(itemId, qty * 0.01, Double::sum);

// Vente de qty unités
data.sellInfluence.merge(itemId, qty * 0.01, Double::sum);
```

Les deux influences sont indépendantes. Chaque unité achetée/vendue ajoute 0.01 d'influence.

### Decay périodique

Lancé dans `AdminShopManager.init()` via `EriScheduler` :

```java
EriScheduler.repeat(360L * 60 * 20, () -> {   // 360 min en ticks (20t/s)
    ShopPriceData data = ShopPriceData.get(server.getWorld(0));
    data.decayAll(config.decayFactor);          // influence *= 0.85 pour chaque entry
    data.markDirty();
});
```

`decayAll()` purge les entries dont `|influence| < 0.001` pour éviter l'accumulation infinie de clés dans la map.

---

## 4. GUI (3 écrans)

### Layout commun

Même constantes que `GuiHDV` : `PX=160, PY=80, PW=1600, PH=920`. Header gradient `0xFF1A0A2E → 0xFF0A1A2E` + Starfield + panneau glass avec `fadeIn(10)` + `slideIn(DOWN, 30, 12)`. Solde `$` du joueur affiché en haut à droite.

### Écran 1 — Grille des catégories

- Barre de recherche globale en haut (debounce 8 ticks, même pattern que HDV)
- `ScrollList` de cartes catégorie : 3 colonnes, cartes 480×160px
- Chaque carte : icône item (48×48), nom catégorie, nombre total d'items
- Hover → bordure cyan animée. Click → écran 2
- **Si recherche active** : bypass écran catégories, affiche `ScrollList` plat de tous les items dont `displayName` contient la query (insensible à la casse, recherche dans tous les items de toutes les catégories)

### Écran 2 — Liste des items

- Breadcrumb : `Shop > Ressources`. Bouton `←` retour écran 1
- `ScrollList` de lignes item, hauteur 72px chacune :
  ```
  [Icône 48x48] [displayName]    Achat: 52$   Vente: 38$   [ACHETER] [VENDRE]
  ```
- Prix colorés dynamiquement vs prix de base :
  - Vert : prix en dessous du base (>-2%)
  - Rouge : prix au-dessus du base (>+2%)
  - Blanc : neutre (±2%)
- `[VENDRE]` désactivé (grisé) si `canSell = false`

### Écran 3 — Popup achat/vente

Modal 640×400px avec dim overlay `ContainerComponent` absorbant les clics (pattern identique à `GuiHDV.showPopup()`).

Contenu :
- Icône item (64×64) + nom
- Sélecteur de quantité : `TextField` numérique + boutons `÷2`, `×2`, `Max`
  - `Max` achat = `maxQtyPerTx`
  - `Max` vente = `min(maxQtyPerTx, quantité item dans inventaire joueur)`
- Prix total recalculé en temps réel (`onTextChanged`)
- `[Confirmer]` → `sendAction("shop_gui", "shop_gui", "buy"/"sell", "id=X|qty=Y")`
- `[Annuler]` → `closePopup()`

---

## 5. Commandes & Keybind

### Commandes

| Commande | Permission | Description |
|----------|-----------|-------------|
| `/shop` | 0 | Ouvre GuiAdminShop (envoie solde + catégories au client) |
| `/shopadmin reload` | 2 | Recharge shop-config.json sans restart |
| `/shopadmin resetprices` | 2 | Remet toutes les influences à 0 |
| `/shopadmin resetprice <id>` | 2 | Remet l'influence d'un item à 0 |
| `/shopadmin info <id>` | 2 | Prix courant, influence buy/sell, multiplicateur actif |
| `/shopadmin setinfluence <id> <buy> <sell>` | 2 | Force une influence manuellement |

Auto-complétion : `<id>` → `suggestsDynamic(() -> AdminShopManager.getInstance().getAllItemIds())`.

### Keybind

Dans `ClientProxy.init()` :

```java
EriKeys.create("eriniumfaction.open_shop")
    .key(Keyboard.KEY_B)
    .category("key.categories.eriniumfaction")
    .context(KeyContext.IN_GAME)
    .onPress(() -> GuiNetworkHandler.sendAction("shop_gui", "shop_gui", "open", ""))
    .register();
```

Le serveur répond via `GuiNetworkHandler.openGuiFor(player, "shop_gui", data)` avec le NBT contenant le solde joueur + toutes les catégories + prix courants.

---

## 6. Cas limites & Règles métier

- **Item non achetable** (`baseBuyPrice = 0`) : bouton `[ACHETER]` absent de la ligne
- **Item non vendable** (`canSell = false`) : bouton `[VENDRE]` grisé
- **Quantité invalide** (0, négatif, non-numérique) : bouton Confirmer désactivé
- **Fonds insuffisants** : réponse serveur `error|Fonds insuffisants`, `NotificationManager.error()`
- **Inventaire plein** (achat) : vérification `player.inventory.addItemStackToInventory()` avant débit
- **Stock vendeur insuffisant** (vente) : vérification inventaire joueur avant crédit
- **Config manquante au démarrage** : `ShopConfigLoader` génère un fichier de config d'exemple vide + log WARN. Le shop reste ouvert mais sans items.
- **Item inconnu dans config** : warning log, item ignoré, le shop charge le reste normalement
- **Spread minimum violé** : `ShopPriceEngine.sellPrice()` clamp toujours `sellPrice ≤ buyPrice * (1 - minSpread/100)`

---

## 7. Fichiers à créer / modifier

### Nouveaux fichiers

```
src/main/java/fr/eriniumgroup/eriniumfaction/shop/
├── AdminShopManager.java
├── ShopConfigLoader.java
├── ShopCategory.java
├── ShopSubCategory.java
├── ShopItem.java
├── ShopPriceEngine.java
├── ShopPriceData.java
├── ShopNetworkHandler.java
├── gui/
│   └── GuiAdminShop.java
└── command/
    └── AdminShopCommand.java

config/eriniumfaction/shop-config.json   (généré au 1er lancement si absent)
```

### Fichiers modifiés

```
src/main/java/fr/eriniumgroup/eriniumfaction/proxy/CommonProxy.java
  → init AdminShopManager + registerHandlers() de ShopNetworkHandler + register commands

src/main/java/fr/eriniumgroup/eriniumfaction/proxy/ClientProxy.java
  → register keybind B (eriniumfaction.open_shop)

docs/permissions.md
  → shopadmin.* permissions

wiki/commands.html
  → /shop et /shopadmin
```
