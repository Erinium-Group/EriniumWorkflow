# Admin Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter un shop administrateur dynamique avec pricing influencé par les transactions, config directory-based récursive, et GUI 3 états.

**Architecture:** `AdminShopManager` singleton orchestre la config (chargement récursif de `config/eriniumfaction/adminshop/`), le moteur de prix stateless (`ShopPriceEngine`), la persistence NBT (`ShopPriceData` WorldSavedData). Le GUI client (`GuiAdminShop`) reçoit l'arbre complet au démarrage et navigue côté client, n'envoyant des packets serveur qu'à l'achat/vente.

**Tech Stack:** Forge 1.12.2 / Java 8, EriAPI (EriGuiScreen, ScrollList, ListItem, RenderUtil, EriKeys, EriScheduler, GuiNetworkHandler), Gson (présent dans l'env Forge), WorldSavedData, EconomyManager.

**Spec:** `docs/superpowers/specs/2026-05-11-admin-shop-design.md`

**Build:** `JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build`

---

## File Map

| Fichier | Action |
|---------|--------|
| `shop/ShopPriceConfig.java` | CREATE — POJO Gson de shop-engine.json |
| `shop/ShopItem.java` | CREATE — POJO item + toNBT/fromClientNBT |
| `shop/ShopCategory.java` | CREATE — POJO catégorie récursif + toNBT/fromClientNBT |
| `shop/ShopPriceEngine.java` | CREATE — calculs de prix stateless |
| `shop/ShopConfigLoader.java` | CREATE — parsing répertoire récursif |
| `shop/ShopPriceData.java` | CREATE — WorldSavedData + decay |
| `shop/AdminShopManager.java` | CREATE — singleton orchestrateur |
| `shop/ShopNetworkHandler.java` | CREATE — handler serveur des actions GUI |
| `shop/command/AdminShopCommand.java` | CREATE — /shop + /shopadmin |
| `shop/gui/GuiAdminShop.java` | CREATE — GUI client complet |
| `EriniumFaction.java` | MODIFY — onServerStarting : init + registerCommand |
| `proxy/CommonProxy.java` | MODIFY — preInit : ShopNetworkHandler.registerHandlers() |
| `proxy/ClientProxy.java` | MODIFY — registerGui + keybind B |

---

## Task 1 — POJOs : ShopPriceConfig, ShopItem, ShopCategory

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopPriceConfig.java`
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopItem.java`
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopCategory.java`

- [ ] **Créer ShopPriceConfig.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

/** POJO Gson pour shop-engine.json — valeurs par défaut déjà renseignées. */
public class ShopPriceConfig {
    public double buyFactor           = 0.3;
    public double sellFactor          = 0.3;
    public double decayFactor         = 0.85;
    public int    decayIntervalMinutes = 360;
    public double minMultiplier       = 0.5;
    public double maxMultiplier       = 3.0;
    public double minSpreadPercent    = 10.0;
}
```

- [ ] **Créer ShopItem.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NBTTagCompound;

/**
 * Représente un item vendable dans le shop.
 * Côté serveur : baseBuyPrice/baseSellPrice sont les valeurs config brutes.
 * Côté client  : les mêmes champs contiennent les prix CALCULÉS envoyés par le serveur.
 */
public final class ShopItem {

    public final String    configId;      // "ressources/metaux/iron_ingot" — clé unique globale
    public final ItemStack itemStack;     // résolu au chargement côté serveur
    public final String    displayName;
    public final long      baseBuyPrice;  // 0 = non achetable
    public final long      baseSellPrice; // 0 = non vendable
    public final boolean   canBuy;
    public final boolean   canSell;
    public final int       maxQtyPerTx;

    public ShopItem(String configId, ItemStack itemStack, String displayName,
                    long baseBuyPrice, long baseSellPrice, int maxQtyPerTx) {
        this.configId      = configId;
        this.itemStack     = itemStack;
        this.displayName   = displayName;
        this.baseBuyPrice  = baseBuyPrice;
        this.baseSellPrice = baseSellPrice;
        this.canBuy        = baseBuyPrice  > 0;
        this.canSell       = baseSellPrice > 0;
        this.maxQtyPerTx   = maxQtyPerTx;
    }

    /**
     * Sérialise pour envoi client. Les prix passés sont les prix CALCULÉS
     * (déjà appliqué l'influence via ShopPriceEngine).
     */
    public NBTTagCompound toNBT(long currentBuyPrice, long currentSellPrice) {
        NBTTagCompound tag = new NBTTagCompound();
        tag.setString("configId", configId);
        tag.setString("display",  displayName);
        NBTTagCompound itemTag = new NBTTagCompound();
        itemStack.writeToNBT(itemTag);
        tag.setTag("item", itemTag);
        tag.setLong   ("buyPrice",  currentBuyPrice);
        tag.setLong   ("sellPrice", currentSellPrice);
        tag.setBoolean("canBuy",    canBuy);
        tag.setBoolean("canSell",   canSell);
        tag.setInteger("maxQty",    maxQtyPerTx);
        return tag;
    }

    /** Reconstruit un ShopItem côté client depuis le NBT reçu du serveur. */
    public static ShopItem fromClientNBT(NBTTagCompound tag) {
        String    configId  = tag.getString("configId");
        String    display   = tag.getString("display");
        ItemStack stack     = new ItemStack(tag.getCompoundTag("item"));
        long      buyPrice  = tag.getLong("buyPrice");
        long      sellPrice = tag.getLong("sellPrice");
        boolean   canBuy    = tag.getBoolean("canBuy");
        boolean   canSell   = tag.getBoolean("canSell");
        int       maxQty    = tag.getInteger("maxQty");
        // baseBuyPrice/baseSellPrice = prix calculés (le client ne connaît pas le prix base)
        return new ShopItem(configId, stack, display,
                canBuy  ? buyPrice  : 0L,
                canSell ? sellPrice : 0L,
                maxQty);
    }
}
```

- [ ] **Créer ShopCategory.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.nbt.NBTTagList;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Catégorie récursive du shop.
 * Peut contenir à la fois des sous-catégories (children) ET des items directs.
 * Ordre d'affichage en jeu : children en premier (alphabétique), puis items.
 */
public final class ShopCategory {

    public final String           configId;    // chemin dossier relatif ex: "ressources/metaux"
    public final String           displayName;
    public final String           iconItemId;  // "minecraft:iron_ingot"
    public final List<ShopCategory> children;  // triés alphabétiquement par nom de dossier
    public final List<ShopItem>   items;

    public ShopCategory(String configId, String displayName, String iconItemId,
                        List<ShopCategory> children, List<ShopItem> items) {
        this.configId    = configId;
        this.displayName = displayName;
        this.iconItemId  = iconItemId;
        this.children    = Collections.unmodifiableList(new ArrayList<>(children));
        this.items       = Collections.unmodifiableList(new ArrayList<>(items));
    }

    /**
     * Sérialise la catégorie (récursif) avec les prix courants calculés.
     * priceData peut être null (ex: premier chargement sans WorldSavedData encore disponible).
     */
    public NBTTagCompound toNBT(ShopPriceData priceData, ShopPriceConfig cfg) {
        NBTTagCompound tag = new NBTTagCompound();
        tag.setString("configId", configId);
        tag.setString("name",     displayName);
        tag.setString("icon",     iconItemId);

        NBTTagList childList = new NBTTagList();
        for (ShopCategory child : children) {
            childList.appendTag(child.toNBT(priceData, cfg));
        }
        tag.setTag("children", childList);

        NBTTagList itemList = new NBTTagList();
        for (ShopItem item : items) {
            double buyInf  = priceData != null ? priceData.getBuyInfluence(item.configId)  : 0.0;
            double sellInf = priceData != null ? priceData.getSellInfluence(item.configId) : 0.0;
            long buyPrice  = item.canBuy  ? ShopPriceEngine.buyPrice(item, buyInf, cfg)            : 0L;
            long sellPrice = item.canSell ? ShopPriceEngine.sellPrice(item, buyInf, sellInf, cfg)  : 0L;
            itemList.appendTag(item.toNBT(buyPrice, sellPrice));
        }
        tag.setTag("items", itemList);
        return tag;
    }

    /** Reconstruit la catégorie côté client. */
    public static ShopCategory fromClientNBT(NBTTagCompound tag) {
        String configId    = tag.getString("configId");
        String name        = tag.getString("name");
        String icon        = tag.getString("icon");

        NBTTagList childList = tag.getTagList("children", 10); // 10 = TAG_Compound
        List<ShopCategory> children = new ArrayList<>();
        for (int i = 0; i < childList.tagCount(); i++) {
            children.add(fromClientNBT(childList.getCompoundTagAt(i)));
        }

        NBTTagList itemList = tag.getTagList("items", 10);
        List<ShopItem> items = new ArrayList<>();
        for (int i = 0; i < itemList.tagCount(); i++) {
            items.add(ShopItem.fromClientNBT(itemList.getCompoundTagAt(i)));
        }

        return new ShopCategory(configId, name, icon, children, items);
    }
}
```

- [ ] **Build pour vérifier la compilation**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```
Résultat attendu : `BUILD SUCCESSFUL`

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopPriceConfig.java \
        src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopItem.java \
        src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopCategory.java
git commit -m "feat(shop): POJOs ShopPriceConfig, ShopItem, ShopCategory avec sérialisation NBT"
```

---

## Task 2 — ShopPriceEngine

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopPriceEngine.java`

- [ ] **Créer ShopPriceEngine.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

/** Calculs de prix stateless. Toutes les méthodes sont statiques, pas d'état. */
public final class ShopPriceEngine {

    private ShopPriceEngine() {}

    /**
     * Prix d'achat courant (le joueur paie ce prix).
     * Hausse quand buyInfluence augmente (beaucoup d'achats récents).
     */
    public static long buyPrice(ShopItem item, double buyInfluence, ShopPriceConfig cfg) {
        double mult = clamp(1.0 + buyInfluence * cfg.buyFactor, cfg.minMultiplier, cfg.maxMultiplier);
        return Math.round(item.baseBuyPrice * mult);
    }

    /**
     * Prix de vente courant (le joueur reçoit ce montant).
     * Baisse quand sellInfluence augmente (beaucoup de ventes récentes).
     * Garantit toujours un spread minimum avec le prix d'achat.
     */
    public static long sellPrice(ShopItem item, double buyInfluence, double sellInfluence,
                                 ShopPriceConfig cfg) {
        double mult   = clamp(1.0 - sellInfluence * cfg.sellFactor, cfg.minMultiplier, cfg.maxMultiplier);
        long   raw    = Math.round(item.baseSellPrice * mult);
        // Le spread minimum garantit : sellPrice ≤ buyPrice * (1 - minSpreadPercent/100)
        long   maxSell = Math.round(buyPrice(item, buyInfluence, cfg) * (1.0 - cfg.minSpreadPercent / 100.0));
        return Math.min(raw, maxSell);
    }

    /**
     * Couleur d'affichage du prix vs prix de base (±2% = neutre).
     * Retourne une couleur ARGB.
     */
    public static int priceColor(long currentPrice, long basePrice) {
        if (basePrice <= 0) return 0xFFFFFFFF;
        double ratio = (double) currentPrice / basePrice;
        if (ratio < 0.98) return 0xFF55FF55; // vert = moins cher
        if (ratio > 1.02) return 0xFFFF5555; // rouge = plus cher
        return 0xFFFFFFFF;                   // blanc = neutre
    }

    private static double clamp(double val, double min, double max) {
        return Math.max(min, Math.min(max, val));
    }
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopPriceEngine.java
git commit -m "feat(shop): ShopPriceEngine - calculs prix dynamiques stateless"
```

---

## Task 3 — ShopConfigLoader

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopConfigLoader.java`

- [ ] **Créer ShopConfigLoader.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import fr.eriniumgroup.eriniumfaction.EriniumFaction;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.Reader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Charge la config shop depuis config/eriniumfaction/adminshop/.
 *
 * Structure :
 *   adminshop/
 *   ├── shop-engine.json          ← moteur de prix
 *   └── <catégorie>/
 *       ├── category.json         ← obligatoire pour être reconnu
 *       ├── items.json            ← optionnel
 *       └── <sous-catégorie>/     ← récursif, profondeur illimitée
 *
 * Un dossier sans category.json est ignoré (warning log).
 * items.json absent = catégorie sans items directs (valide).
 * Tri : alphabétique sur le nom de dossier à chaque niveau.
 * Ordre d'affichage en jeu : enfants d'abord, puis items.
 */
public final class ShopConfigLoader {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private ShopConfigLoader() {}

    // ── Engine config ─────────────────────────────────────────────────────

    public static ShopPriceConfig loadPriceConfig(File adminShopDir) {
        File f = new File(adminShopDir, "shop-engine.json");
        if (!f.exists()) {
            writeDefaultEngineConfig(f);
            return new ShopPriceConfig();
        }
        try (Reader r = new FileReader(f)) {
            ShopPriceConfig cfg = GSON.fromJson(r, ShopPriceConfig.class);
            return cfg != null ? cfg : new ShopPriceConfig();
        } catch (Exception e) {
            EriniumFaction.LOGGER.error("[AdminShop] Erreur lecture shop-engine.json : {}", e.getMessage());
            return new ShopPriceConfig();
        }
    }

    private static void writeDefaultEngineConfig(File f) {
        try {
            f.getParentFile().mkdirs();
            try (FileWriter w = new FileWriter(f)) {
                GSON.toJson(new ShopPriceConfig(), w);
            }
            EriniumFaction.LOGGER.info("[AdminShop] shop-engine.json créé avec les valeurs par défaut");
        } catch (Exception e) {
            EriniumFaction.LOGGER.error("[AdminShop] Impossible d'écrire shop-engine.json : {}", e.getMessage());
        }
    }

    // ── Categories ────────────────────────────────────────────────────────

    /**
     * Charge récursivement les catégories depuis un répertoire parent.
     * @param dir        dossier à parcourir (adminshop/ à la racine, ou un sous-dossier)
     * @param parentPath chemin relatif du parent (vide pour la racine)
     */
    public static List<ShopCategory> loadCategories(File dir, String parentPath) {
        File[] subdirs = dir.listFiles(File::isDirectory);
        if (subdirs == null || subdirs.length == 0) return Collections.emptyList();

        Arrays.sort(subdirs, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));

        List<ShopCategory> result = new ArrayList<>();
        for (File subdir : subdirs) {
            File catFile = new File(subdir, "category.json");
            if (!catFile.exists()) {
                EriniumFaction.LOGGER.warn("[AdminShop] Dossier '{}' ignoré (category.json manquant)", subdir.getName());
                continue;
            }
            CategoryDescriptor desc = parseCategoryDescriptor(catFile);
            if (desc == null || desc.name == null || desc.name.isEmpty()) continue;

            String catPath = parentPath.isEmpty() ? subdir.getName() : parentPath + "/" + subdir.getName();

            List<ShopCategory> children = loadCategories(subdir, catPath);
            List<ShopItem>     items    = loadItems(subdir, catPath);

            result.add(new ShopCategory(catPath, desc.name,
                    desc.icon != null ? desc.icon : "minecraft:barrier",
                    children, items));
        }
        return result;
    }

    private static List<ShopItem> loadItems(File catDir, String catPath) {
        File f = new File(catDir, "items.json");
        if (!f.exists()) return Collections.emptyList();

        try (Reader r = new FileReader(f)) {
            ItemDescriptor[] descs = GSON.fromJson(r, ItemDescriptor[].class);
            if (descs == null) return Collections.emptyList();

            List<ShopItem> items = new ArrayList<>();
            for (ItemDescriptor d : descs) {
                if (d.id == null || d.item == null) {
                    EriniumFaction.LOGGER.warn("[AdminShop] Entrée items.json incomplète dans '{}'", catPath);
                    continue;
                }
                Item mc = Item.getByNameOrId(d.item);
                if (mc == null) {
                    EriniumFaction.LOGGER.warn("[AdminShop] Item inconnu '{}' dans '{}' — ignoré", d.item, catPath);
                    continue;
                }
                String configId = catPath + "/" + d.id;
                String display  = (d.display != null && !d.display.isEmpty()) ? d.display : d.id;
                int    maxQty   = d.maxQty > 0 ? d.maxQty : 64;
                items.add(new ShopItem(configId, new ItemStack(mc), display, d.buy, d.sell, maxQty));
            }
            return items;
        } catch (Exception e) {
            EriniumFaction.LOGGER.error("[AdminShop] Erreur lecture items.json dans '{}' : {}", catPath, e.getMessage());
            return Collections.emptyList();
        }
    }

    private static CategoryDescriptor parseCategoryDescriptor(File f) {
        try (Reader r = new FileReader(f)) {
            return GSON.fromJson(r, CategoryDescriptor.class);
        } catch (Exception e) {
            EriniumFaction.LOGGER.error("[AdminShop] Erreur lecture category.json '{}' : {}", f.getPath(), e.getMessage());
            return null;
        }
    }

    // ── Exemple de config généré au 1er lancement ─────────────────────────

    /**
     * Génère un dossier exemple si adminshop/ est vide (aucune catégorie).
     * Permet aux admins de voir la structure attendue sans doc externe.
     */
    public static void generateExampleIfEmpty(File adminShopDir) {
        File[] subdirs = adminShopDir.listFiles(File::isDirectory);
        if (subdirs != null && subdirs.length > 0) return; // déjà peuplé

        try {
            File exemple = new File(adminShopDir, "exemple");
            exemple.mkdirs();

            // category.json
            try (FileWriter w = new FileWriter(new File(exemple, "category.json"))) {
                w.write("{\n  \"name\": \"Exemple\",\n  \"icon\": \"minecraft:chest\"\n}\n");
            }
            // items.json
            try (FileWriter w = new FileWriter(new File(exemple, "items.json"))) {
                w.write("[\n  {\n    \"id\": \"iron_ingot\",\n    \"item\": \"minecraft:iron_ingot\",\n"
                      + "    \"display\": \"Lingot de Fer\",\n    \"buy\": 50,\n    \"sell\": 40,\n"
                      + "    \"maxQty\": 64\n  }\n]\n");
            }
            EriniumFaction.LOGGER.info("[AdminShop] Dossier exemple/ créé dans adminshop/");
        } catch (Exception e) {
            EriniumFaction.LOGGER.error("[AdminShop] Impossible de créer l'exemple : {}", e.getMessage());
        }
    }

    // ── Gson DTOs ─────────────────────────────────────────────────────────

    private static class CategoryDescriptor {
        String name;
        String icon;
    }

    private static class ItemDescriptor {
        String id;
        String item;
        String display;
        long   buy;
        long   sell;
        int    maxQty = 64;
    }
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopConfigLoader.java
git commit -m "feat(shop): ShopConfigLoader - chargement récursif directory-based"
```

---

## Task 4 — ShopPriceData (WorldSavedData)

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopPriceData.java`

- [ ] **Créer ShopPriceData.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.nbt.NBTTagList;
import net.minecraft.world.World;
import net.minecraft.world.storage.MapStorage;
import net.minecraft.world.storage.WorldSavedData;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

/**
 * Persiste les influences de prix par configId.
 * Clé WorldSavedData : "eriniumfaction_shop_prices"
 *
 * Decay périodique : appelé par AdminShopManager via EriScheduler.
 * Decay au restart : appliqué dans readFromNBT() en calculant les périodes manquées.
 */
public class ShopPriceData extends WorldSavedData {

    private static final String DATA_KEY = "eriniumfaction_shop_prices";

    private final Map<String, Double> buyInfluence  = new HashMap<>();
    private final Map<String, Double> sellInfluence = new HashMap<>();
    private long lastDecayTimestamp = System.currentTimeMillis();

    public ShopPriceData()            { super(DATA_KEY); }
    public ShopPriceData(String name) { super(name); }

    // ── Accès ─────────────────────────────────────────────────────────────

    public static ShopPriceData get(World world) {
        MapStorage storage = world.getPerWorldStorage();
        ShopPriceData data = (ShopPriceData) storage.getOrLoadData(ShopPriceData.class, DATA_KEY);
        if (data == null) {
            data = new ShopPriceData();
            storage.setData(DATA_KEY, data);
        }
        return data;
    }

    public double getBuyInfluence(String configId) {
        return buyInfluence.getOrDefault(configId, 0.0);
    }

    public double getSellInfluence(String configId) {
        return sellInfluence.getOrDefault(configId, 0.0);
    }

    // ── Mutations ─────────────────────────────────────────────────────────

    public void addBuyInfluence(String configId, int qty) {
        buyInfluence.merge(configId, qty * 0.01, Double::sum);
        markDirty();
    }

    public void addSellInfluence(String configId, int qty) {
        sellInfluence.merge(configId, qty * 0.01, Double::sum);
        markDirty();
    }

    /** Applique un cycle de decay à toutes les influences (appelé par le scheduler). */
    public void decayAll(double decayFactor) {
        applyDecayToMap(buyInfluence,  decayFactor);
        applyDecayToMap(sellInfluence, decayFactor);
        lastDecayTimestamp = System.currentTimeMillis();
        markDirty();
    }

    /**
     * Appelé au chargement (readFromNBT) pour compenser les decays manqués
     * pendant un redémarrage serveur.
     */
    public void applyMissedDecays(double decayFactor, long decayIntervalMs) {
        long now     = System.currentTimeMillis();
        long elapsed = now - lastDecayTimestamp;
        int  n       = (int) (elapsed / decayIntervalMs);
        if (n <= 0) return;

        double combinedFactor = Math.pow(decayFactor, n);
        applyDecayToMap(buyInfluence,  combinedFactor);
        applyDecayToMap(sellInfluence, combinedFactor);
        lastDecayTimestamp = lastDecayTimestamp + (long)(n * decayIntervalMs);
        markDirty();
    }

    private void applyDecayToMap(Map<String, Double> map, double factor) {
        Iterator<Map.Entry<String, Double>> it = map.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Double> e = it.next();
            double val = e.getValue() * factor;
            if (Math.abs(val) < 0.001) { it.remove(); }
            else                        { e.setValue(val); }
        }
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    public void resetAll() {
        buyInfluence.clear();
        sellInfluence.clear();
        markDirty();
    }

    public void resetItem(String configId) {
        buyInfluence.remove(configId);
        sellInfluence.remove(configId);
        markDirty();
    }

    public void setInfluence(String configId, double buy, double sell) {
        if (buy  == 0.0) buyInfluence.remove(configId);  else buyInfluence.put(configId, buy);
        if (sell == 0.0) sellInfluence.remove(configId); else sellInfluence.put(configId, sell);
        markDirty();
    }

    // ── Sérialisation NBT ─────────────────────────────────────────────────

    @Override
    public void readFromNBT(NBTTagCompound tag) {
        buyInfluence.clear();
        sellInfluence.clear();
        NBTTagList list = tag.getTagList("entries", 10);
        for (int i = 0; i < list.tagCount(); i++) {
            NBTTagCompound e = list.getCompoundTagAt(i);
            String id = e.getString("id");
            if (e.hasKey("buyInf"))  buyInfluence.put(id,  e.getDouble("buyInf"));
            if (e.hasKey("sellInf")) sellInfluence.put(id, e.getDouble("sellInf"));
        }
        lastDecayTimestamp = tag.getLong("lastDecay");
        if (lastDecayTimestamp == 0L) lastDecayTimestamp = System.currentTimeMillis();
    }

    @Override
    public NBTTagCompound writeToNBT(NBTTagCompound tag) {
        Set<String> allIds = new HashSet<>(buyInfluence.keySet());
        allIds.addAll(sellInfluence.keySet());

        NBTTagList list = new NBTTagList();
        for (String id : allIds) {
            NBTTagCompound e = new NBTTagCompound();
            e.setString("id", id);
            if (buyInfluence.containsKey(id))  e.setDouble("buyInf",  buyInfluence.get(id));
            if (sellInfluence.containsKey(id)) e.setDouble("sellInf", sellInfluence.get(id));
            list.appendTag(e);
        }
        tag.setTag("entries", list);
        tag.setLong("lastDecay", lastDecayTimestamp);
        return tag;
    }
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopPriceData.java
git commit -m "feat(shop): ShopPriceData WorldSavedData - persistence influences + decay"
```

---

## Task 5 — AdminShopManager

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/AdminShopManager.java`

- [ ] **Créer AdminShopManager.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

import fr.eri.eriapi.scheduler.EriScheduler;
import fr.eriniumgroup.eriniumfaction.EriniumFaction;
import fr.eriniumgroup.eriniumfaction.economy.EconomyManager;
import net.minecraft.entity.player.EntityPlayerMP;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.nbt.NBTTagList;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.World;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Singleton principal du shop admin.
 * init() est appelé depuis EriniumFaction.onServerStarting().
 */
public final class AdminShopManager {

    private static AdminShopManager INSTANCE;

    private File            adminShopDir;
    private ShopPriceConfig priceConfig    = new ShopPriceConfig();
    private List<ShopCategory> rootCategories = new ArrayList<>();
    private World           overworld;

    private AdminShopManager() {}

    public static AdminShopManager getInstance() {
        if (INSTANCE == null) INSTANCE = new AdminShopManager();
        return INSTANCE;
    }

    // ── Initialisation ────────────────────────────────────────────────────

    public void init(MinecraftServer server) {
        this.overworld    = server.getWorld(0);
        this.adminShopDir = new File(server.getFile("config"), "eriniumfaction/adminshop");
        this.adminShopDir.mkdirs();

        reload();

        // Decay manqués pendant le redémarrage
        ShopPriceData data      = ShopPriceData.get(overworld);
        long          intervalMs = (long) priceConfig.decayIntervalMinutes * 60_000L;
        data.applyMissedDecays(priceConfig.decayFactor, intervalMs);

        // Decay périodique (ticks = minutes * 60s * 20tps)
        long intervalTicks = (long) priceConfig.decayIntervalMinutes * 60L * 20L;
        EriScheduler.repeat(intervalTicks, () -> {
            ShopPriceData d = ShopPriceData.get(overworld);
            d.decayAll(priceConfig.decayFactor);
            EriniumFaction.LOGGER.info("[AdminShop] Decay périodique appliqué");
        });

        EriniumFaction.LOGGER.info("[AdminShop] Initialisé — {} catégorie(s) racine", rootCategories.size());
    }

    public void reload() {
        priceConfig    = ShopConfigLoader.loadPriceConfig(adminShopDir);
        ShopConfigLoader.generateExampleIfEmpty(adminShopDir);
        rootCategories = ShopConfigLoader.loadCategories(adminShopDir, "");
        EriniumFaction.LOGGER.info("[AdminShop] Config rechargée — {} catégorie(s) racine", rootCategories.size());
    }

    // ── Accesseurs ────────────────────────────────────────────────────────

    public List<ShopCategory> getRootCategories()  { return Collections.unmodifiableList(rootCategories); }
    public ShopPriceConfig    getPriceConfig()      { return priceConfig; }
    public World              getOverworld()        { return overworld; }

    public String[] getAllItemIds() {
        List<String> ids = new ArrayList<>();
        collectItemIds(rootCategories, ids);
        return ids.toArray(new String[0]);
    }

    private void collectItemIds(List<ShopCategory> cats, List<String> ids) {
        for (ShopCategory cat : cats) {
            for (ShopItem item : cat.items) ids.add(item.configId);
            collectItemIds(cat.children, ids);
        }
    }

    /** Trouve un ShopItem par configId dans l'arbre complet. */
    public ShopItem findItem(String configId) {
        return findItemIn(rootCategories, configId);
    }

    private ShopItem findItemIn(List<ShopCategory> cats, String configId) {
        for (ShopCategory cat : cats) {
            for (ShopItem item : cat.items) {
                if (item.configId.equals(configId)) return item;
            }
            ShopItem found = findItemIn(cat.children, configId);
            if (found != null) return found;
        }
        return null;
    }

    // ── Transactions ─────────────────────────────────────────────────────

    /**
     * Achat d'un item. Retourne null en cas de succès, message d'erreur sinon.
     */
    public String buy(EntityPlayerMP player, String configId, int qty) {
        ShopItem item = findItem(configId);
        if (item == null)      return "Item introuvable";
        if (!item.canBuy)      return "Cet item n'est pas en vente";
        if (qty < 1 || qty > item.maxQtyPerTx)
            return "Quantité invalide (1–" + item.maxQtyPerTx + ")";

        ShopPriceData data     = ShopPriceData.get(overworld);
        double        buyInf   = data.getBuyInfluence(configId);
        long          unitPrice = ShopPriceEngine.buyPrice(item, buyInf, priceConfig);
        long          total    = unitPrice * qty;

        EconomyManager eco = EconomyManager.getInstance();
        if (!eco.hasEnough(player, total)) return "Fonds insuffisants (besoin : " + total + " $)";

        ItemStack toGive = item.itemStack.copy();
        toGive.setCount(qty);
        if (countSpaceForItem(player, toGive) < qty) return "Inventaire plein";

        eco.withdraw(player, total);
        player.inventory.addItemStackToInventory(toGive);
        data.addBuyInfluence(configId, qty);
        return null;
    }

    /**
     * Vente d'un item. Retourne null en cas de succès, message d'erreur sinon.
     */
    public String sell(EntityPlayerMP player, String configId, int qty) {
        ShopItem item = findItem(configId);
        if (item == null)      return "Item introuvable";
        if (!item.canSell)     return "Cet item n'est pas rachetable";
        if (qty < 1 || qty > item.maxQtyPerTx)
            return "Quantité invalide (1–" + item.maxQtyPerTx + ")";

        int inInventory = countItemInInventory(player, item.itemStack);
        if (inInventory < qty) return "Stock insuffisant (vous avez " + inInventory + ")";

        ShopPriceData data      = ShopPriceData.get(overworld);
        double        buyInf    = data.getBuyInfluence(configId);
        double        sellInf   = data.getSellInfluence(configId);
        long          unitPrice = ShopPriceEngine.sellPrice(item, buyInf, sellInf, priceConfig);
        long          total     = unitPrice * qty;

        removeItemFromInventory(player, item.itemStack, qty);
        EconomyManager.getInstance().deposit(player, total);
        data.addSellInfluence(configId, qty);
        return null;
    }

    // ── Helpers inventaire ────────────────────────────────────────────────

    private int countSpaceForItem(EntityPlayerMP player, ItemStack stack) {
        int space = 0;
        for (int i = 0; i < player.inventory.getSizeInventory(); i++) {
            ItemStack slot = player.inventory.getStackInSlot(i);
            if (slot.isEmpty()) {
                space += stack.getMaxStackSize();
            } else if (ItemStack.areItemsEqual(slot, stack)
                    && ItemStack.areItemStackTagsEqual(slot, stack)) {
                space += slot.getMaxStackSize() - slot.getCount();
            }
        }
        return space;
    }

    private int countItemInInventory(EntityPlayerMP player, ItemStack template) {
        int count = 0;
        for (int i = 0; i < player.inventory.getSizeInventory(); i++) {
            ItemStack slot = player.inventory.getStackInSlot(i);
            if (!slot.isEmpty() && ItemStack.areItemsEqual(slot, template)) {
                count += slot.getCount();
            }
        }
        return count;
    }

    private void removeItemFromInventory(EntityPlayerMP player, ItemStack template, int qty) {
        int remaining = qty;
        for (int i = 0; i < player.inventory.getSizeInventory() && remaining > 0; i++) {
            ItemStack slot = player.inventory.getStackInSlot(i);
            if (!slot.isEmpty() && ItemStack.areItemsEqual(slot, template)) {
                int take = Math.min(remaining, slot.getCount());
                slot.shrink(take);
                remaining -= take;
                if (slot.isEmpty()) player.inventory.setInventorySlotContents(i, ItemStack.EMPTY);
            }
        }
        player.inventory.markDirty();
        player.container.detectAndSendChanges();
    }

    // ── Payload GUI ───────────────────────────────────────────────────────

    /**
     * Sérialise l'arbre complet des catégories avec les prix courants.
     * Envoyé au client via GuiNetworkHandler.openGuiFor().
     */
    public NBTTagCompound buildGuiPayload(EntityPlayerMP player) {
        NBTTagCompound root = new NBTTagCompound();
        root.setLong("playerDollars", (long) EconomyManager.getInstance().getBalance(player));

        ShopPriceData data    = ShopPriceData.get(overworld);
        NBTTagList    catList = new NBTTagList();
        for (ShopCategory cat : rootCategories) {
            catList.appendTag(cat.toNBT(data, priceConfig));
        }
        root.setTag("categories", catList);
        return root;
    }
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/AdminShopManager.java
git commit -m "feat(shop): AdminShopManager - singleton, transactions, payload GUI"
```

---

## Task 6 — ShopNetworkHandler

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopNetworkHandler.java`

- [ ] **Créer ShopNetworkHandler.java**

```java
package fr.eriniumgroup.eriniumfaction.shop;

import fr.eri.eriapi.gui.components.NotificationManager;
import fr.eri.eriapi.network.GuiNetworkHandler;
import fr.eriniumgroup.eriniumfaction.EriniumFaction;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.entity.player.EntityPlayerMP;

import java.util.Map;

/**
 * Handler serveur pour les actions GUI du shop.
 * Enregistré dans CommonProxy.preInit() via registerHandlers().
 *
 * Actions supportées :
 *   open           → envoie le payload complet et ouvre le GUI
 *   buy id=X|qty=Y → achat
 *   sell id=X|qty=Y → vente
 */
public final class ShopNetworkHandler {

    private ShopNetworkHandler() {}

    public static void registerHandlers() {
        GuiNetworkHandler.registerActionHandler("shop_gui", (player, data) -> {
            if (!(player instanceof EntityPlayerMP)) return;
            EntityPlayerMP mp     = (EntityPlayerMP) player;
            String         action  = data.getOrDefault("action", "");
            String         payload = data.getOrDefault("data", "");

            switch (action) {
                case "open": handleOpen(mp); break;
                case "buy":  handleBuy(mp, payload);  break;
                case "sell": handleSell(mp, payload); break;
                default:
                    EriniumFaction.LOGGER.warn("[ShopNetwork] Action inconnue : {}", action);
            }
        });
    }

    // ── Handlers ──────────────────────────────────────────────────────────

    private static void handleOpen(EntityPlayerMP player) {
        GuiNetworkHandler.openGuiFor(player, "shop_gui",
                AdminShopManager.getInstance().buildGuiPayload(player));
    }

    private static void handleBuy(EntityPlayerMP player, String payload) {
        String configId = extract(payload, "id");
        int    qty      = parseInt(extract(payload, "qty"), 1);

        String error = AdminShopManager.getInstance().buy(player, configId, qty);
        if (error == null) {
            // Succès : rafraîchir le GUI avec les nouvelles données
            GuiNetworkHandler.sendDataToClient(player, "shop_gui", "main", "result",
                    "ok|Achat confirmé (" + qty + "x)");
            handleOpen(player); // rouvre le GUI avec prix mis à jour
        } else {
            GuiNetworkHandler.sendDataToClient(player, "shop_gui", "main", "result", "err|" + error);
        }
    }

    private static void handleSell(EntityPlayerMP player, String payload) {
        String configId = extract(payload, "id");
        int    qty      = parseInt(extract(payload, "qty"), 1);

        String error = AdminShopManager.getInstance().sell(player, configId, qty);
        if (error == null) {
            GuiNetworkHandler.sendDataToClient(player, "shop_gui", "main", "result",
                    "ok|Vente confirmée (" + qty + "x)");
            handleOpen(player);
        } else {
            GuiNetworkHandler.sendDataToClient(player, "shop_gui", "main", "result", "err|" + error);
        }
    }

    // ── Utilitaires ───────────────────────────────────────────────────────

    /** Extrait la valeur d'une clé dans un payload "key1=val1|key2=val2". */
    private static String extract(String payload, String key) {
        if (payload == null) return "";
        for (String part : payload.split("\\|")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2 && kv[0].equals(key)) return kv[1];
        }
        return "";
    }

    private static int parseInt(String s, int def) {
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return def; }
    }
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/ShopNetworkHandler.java
git commit -m "feat(shop): ShopNetworkHandler - handler serveur open/buy/sell"
```

---

## Task 7 — AdminShopCommand

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/command/AdminShopCommand.java`

- [ ] **Créer le dossier** `src/main/java/fr/eriniumgroup/eriniumfaction/shop/command/`

- [ ] **Créer AdminShopCommand.java**

```java
package fr.eriniumgroup.eriniumfaction.shop.command;

import fr.eri.eriapi.command.CommandContext;
import fr.eri.eriapi.command.CommandExecutor;
import fr.eri.eriapi.command.EriCommand;
import fr.eri.eriapi.command.args.StringArg;
import fr.eri.eriapi.network.GuiNetworkHandler;
import fr.eriniumgroup.eriniumfaction.shop.AdminShopManager;
import fr.eriniumgroup.eriniumfaction.shop.ShopItem;
import fr.eriniumgroup.eriniumfaction.shop.ShopPriceData;
import fr.eriniumgroup.eriniumfaction.shop.ShopPriceEngine;
import net.minecraft.command.ICommand;
import net.minecraft.entity.player.EntityPlayerMP;

/**
 * /shop           → ouvre le shop GUI
 * /shopadmin ...  → administration (permission 2)
 */
public final class AdminShopCommand {

    private AdminShopCommand() {}

    // ── /shop ─────────────────────────────────────────────────────────────

    public static ICommand createShop() {
        return EriCommand.create("shop")
                .permission(0)
                .description("Ouvrir le Shop")
                .runs(new CommandExecutor() {
                    @Override public int execute(CommandContext ctx) {
                        if (!(ctx.getSender() instanceof EntityPlayerMP)) return 0;
                        EntityPlayerMP player = (EntityPlayerMP) ctx.getSender();
                        GuiNetworkHandler.openGuiFor(player, "shop_gui",
                                AdminShopManager.getInstance().buildGuiPayload(player));
                        return 1;
                    }
                })
                .register().toForgeCommand();
    }

    // ── /shopadmin ────────────────────────────────────────────────────────

    public static ICommand createAdmin() {
        EriCommand cmd = EriCommand.create("shopadmin")
                .permission(2)
                .description("Administration du Shop")
                .autoHelp(true);

        // reload
        cmd.sub("reload")
                .description("Recharge shop-config.json sans restart")
                .permission(2)
                .runs(new CommandExecutor() {
                    @Override public int execute(CommandContext ctx) {
                        AdminShopManager.getInstance().reload();
                        ctx.success("Shop rechargé.");
                        return 1;
                    }
                });

        // resetprices
        cmd.sub("resetprices")
                .description("Remet toutes les influences à 0")
                .permission(2)
                .runs(new CommandExecutor() {
                    @Override public int execute(CommandContext ctx) {
                        AdminShopManager mgr = AdminShopManager.getInstance();
                        ShopPriceData.get(mgr.getOverworld()).resetAll();
                        ctx.success("Toutes les influences réinitialisées.");
                        return 1;
                    }
                });

        // resetprice <id>
        cmd.sub("resetprice")
                .description("Remet l'influence d'un item à 0")
                .permission(2)
                .arg(StringArg.of("id").suggestsDynamic(
                        () -> AdminShopManager.getInstance().getAllItemIds()))
                .runs(new CommandExecutor() {
                    @Override public int execute(CommandContext ctx) {
                        String id  = ctx.getString("id");
                        AdminShopManager mgr = AdminShopManager.getInstance();
                        ShopPriceData.get(mgr.getOverworld()).resetItem(id);
                        ctx.success("Influence de '" + id + "' réinitialisée.");
                        return 1;
                    }
                });

        // info <id>
        cmd.sub("info")
                .description("Prix courant, influence buy/sell, multiplicateur")
                .permission(2)
                .arg(StringArg.of("id").suggestsDynamic(
                        () -> AdminShopManager.getInstance().getAllItemIds()))
                .runs(new CommandExecutor() {
                    @Override public int execute(CommandContext ctx) {
                        String           id  = ctx.getString("id");
                        AdminShopManager mgr = AdminShopManager.getInstance();
                        ShopItem         item = mgr.findItem(id);
                        if (item == null) { ctx.error("Item introuvable : " + id); return 0; }

                        ShopPriceData data    = ShopPriceData.get(mgr.getOverworld());
                        double        buyInf  = data.getBuyInfluence(id);
                        double        sellInf = data.getSellInfluence(id);
                        long          bp      = ShopPriceEngine.buyPrice(item, buyInf, mgr.getPriceConfig());
                        long          sp      = ShopPriceEngine.sellPrice(item, buyInf, sellInf, mgr.getPriceConfig());

                        ctx.info("=== " + item.displayName + " ===");
                        ctx.info("Base buy:" + item.baseBuyPrice + "$ | Actuel:" + bp + "$");
                        ctx.info("Base sell:" + item.baseSellPrice + "$ | Actuel:" + sp + "$");
                        ctx.info("BuyInfluence:" + String.format("%.4f", buyInf)
                                + "  SellInfluence:" + String.format("%.4f", sellInf));
                        return 1;
                    }
                });

        // setinfluence <id> <buy> <sell>
        cmd.sub("setinfluence")
                .description("Force une influence manuellement")
                .permission(2)
                .arg(StringArg.of("id").suggestsDynamic(
                        () -> AdminShopManager.getInstance().getAllItemIds()))
                .arg(StringArg.of("buy"))
                .arg(StringArg.of("sell"))
                .runs(new CommandExecutor() {
                    @Override public int execute(CommandContext ctx) {
                        String id   = ctx.getString("id");
                        double buy, sell;
                        try {
                            buy  = Double.parseDouble(ctx.getString("buy"));
                            sell = Double.parseDouble(ctx.getString("sell"));
                        } catch (NumberFormatException e) {
                            ctx.error("Valeurs numériques attendues");
                            return 0;
                        }
                        AdminShopManager mgr = AdminShopManager.getInstance();
                        ShopPriceData.get(mgr.getOverworld()).setInfluence(id, buy, sell);
                        ctx.success("Influence de '" + id + "' → buy=" + buy + " sell=" + sell);
                        return 1;
                    }
                });

        return cmd.register().toForgeCommand();
    }
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/command/AdminShopCommand.java
git commit -m "feat(shop): AdminShopCommand - /shop et /shopadmin"
```

---

## Task 8 — Intégration (EriniumFaction + CommonProxy + ClientProxy)

**Files:**
- Modify: `src/main/java/fr/eriniumgroup/eriniumfaction/EriniumFaction.java`
- Modify: `src/main/java/fr/eriniumgroup/eriniumfaction/proxy/CommonProxy.java`
- Modify: `src/main/java/fr/eriniumgroup/eriniumfaction/proxy/ClientProxy.java`

- [ ] **EriniumFaction.java — ajouter dans onServerStarting()**

Localiser la méthode `onServerStarting` (ligne ~118). Ajouter après les autres `registerServerCommand` existants :

```java
// ---- Admin Shop ----
fr.eriniumgroup.eriniumfaction.shop.AdminShopManager.getInstance().init(event.getServer());
event.registerServerCommand(fr.eriniumgroup.eriniumfaction.shop.command.AdminShopCommand.createShop());
event.registerServerCommand(fr.eriniumgroup.eriniumfaction.shop.command.AdminShopCommand.createAdmin());
```

- [ ] **CommonProxy.java — ajouter registerHandlers()**

Localiser les appels à `MailNetworkHandler.registerHandlers()` (ligne ~308). Ajouter juste après :

```java
// ---- Admin Shop GUI action handler ----
fr.eriniumgroup.eriniumfaction.shop.ShopNetworkHandler.registerHandlers();
```

- [ ] **ClientProxy.java — registerGui + keybind**

Localiser les `GuiNetworkHandler.registerGui(...)` (ligne ~365). Ajouter :

```java
GuiNetworkHandler.registerGui("shop_gui",
        data -> new fr.eriniumgroup.eriniumfaction.shop.gui.GuiAdminShop(data));
```

Localiser les `EriKeys.create(...)` existants. Ajouter le keybind B :

```java
EriKeys.create("eriniumfaction.open_shop")
        .key(org.lwjgl.input.Keyboard.KEY_B)
        .category("key.categories.eriniumfaction")
        .context(fr.eri.eriapi.keys.KeyContext.IN_GAME)
        .onPress(() -> fr.eri.eriapi.network.GuiNetworkHandler.sendAction(
                "shop_gui", "shop_gui", "open", ""))
        .register();
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

**Résultat attendu :** `BUILD SUCCESSFUL`. À ce stade, `/shop` et `/shopadmin` sont utilisables en jeu, le GUI n'existe pas encore (crash à l'ouverture normal) mais les commandes serveur fonctionnent.

- [ ] **Test en jeu (serveur) :** lancer `/shopadmin info ressources/exemple/iron_ingot` → affiche les prix et influences.

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/EriniumFaction.java \
        src/main/java/fr/eriniumgroup/eriniumfaction/proxy/CommonProxy.java \
        src/main/java/fr/eriniumgroup/eriniumfaction/proxy/ClientProxy.java
git commit -m "feat(shop): intégration - init serveur, registerHandlers, keybind B"
```

---

## Task 9 — GuiAdminShop — skeleton + vue catégories

**Files:**
- Create: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/gui/GuiAdminShop.java`

- [ ] **Créer le dossier** `src/main/java/fr/eriniumgroup/eriniumfaction/shop/gui/`

- [ ] **Créer GuiAdminShop.java** (squelette + vue catégories)

```java
package fr.eriniumgroup.eriniumfaction.shop.gui;

import fr.eri.eriapi.gui.EriGuiScreen;
import fr.eri.eriapi.gui.components.Button;
import fr.eri.eriapi.gui.components.GradientRectangle;
import fr.eri.eriapi.gui.components.Label;
import fr.eri.eriapi.gui.components.NotificationManager;
import fr.eri.eriapi.gui.components.Rectangle;
import fr.eri.eriapi.gui.components.Starfield;
import fr.eri.eriapi.gui.components.TextField;
import fr.eri.eriapi.gui.core.Component;
import fr.eri.eriapi.gui.core.ContainerComponent;
import fr.eri.eriapi.gui.util.RenderUtil;
import fr.eri.eriapi.network.GuiNetworkHandler;
import fr.eri.eriapi.network.IGuiDataReceiver;
import fr.eriniumgroup.eriniumfaction.faction.gui.FactionGuiTheme;
import fr.eriniumgroup.eriniumfaction.shop.ShopCategory;
import fr.eriniumgroup.eriniumfaction.shop.ShopItem;
import fr.eriniumgroup.eriniumfaction.shop.ShopPriceEngine;
import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.nbt.NBTTagList;

import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * GUI Admin Shop — 3 états de navigation dans un seul EriGuiScreen.
 *
 * Navigation client-side (les données complètes sont reçues à l'ouverture) :
 *   rootCategories → navigateTo(cat) → popup buy/sell
 *
 * Ordre d'affichage dans une catégorie : children d'abord, puis items.
 * Recherche : filtre flat sur tous les items quand searchField non vide.
 */
public class GuiAdminShop extends EriGuiScreen implements IGuiDataReceiver {

    // Layout constants (design space 1920×1080)
    static final int PX = 160, PY = 80, PW = 1600, PH = 920;
    static final int HEADER_H = 60;
    static final int BREADCRUMB_H = 44;
    static final int SEARCH_H = 52;
    static final int CONTENT_Y = HEADER_H + SEARCH_H;
    static final int CONTENT_H = PH - CONTENT_Y;

    // Card dimensions pour la grille catégories (3 colonnes)
    static final int CARD_COLS = 3;
    static final int CARD_PAD  = 24;
    static final int CARD_W    = (PW - CARD_PAD * (CARD_COLS + 1)) / CARD_COLS; // ~501px
    static final int CARD_H    = 160;

    // Row height pour la liste d'items
    static final int ITEM_ROW_H = 80;

    // ── Données reçues du serveur ─────────────────────────────────────────
    private long                 playerDollars;
    private List<ShopCategory>   rootCategories = new ArrayList<>();

    // ── État de navigation ────────────────────────────────────────────────
    /** Pile de navigation : chaque élément est la catégorie parente. */
    private final Deque<ShopCategory> navStack = new ArrayDeque<>();
    /** Catégorie courante (null = racine). */
    private ShopCategory currentCategory;

    // ── Composants GUI persistants ────────────────────────────────────────
    private ContainerComponent mainPanel;
    private Label              lblBalance;
    private TextField          searchField;
    private Label              lblBreadcrumb;
    private ContainerComponent contentPanel;   // remplacé à chaque navigation

    // ── Popup ─────────────────────────────────────────────────────────────
    private ContainerComponent dimOverlay;
    private ContainerComponent popupPanel;

    public GuiAdminShop(NBTTagCompound data) {
        if (data == null) data = new NBTTagCompound();
        playerDollars = data.getLong("playerDollars");

        NBTTagList catList = data.getTagList("categories", 10);
        for (int i = 0; i < catList.tagCount(); i++) {
            rootCategories.add(ShopCategory.fromClientNBT(catList.getCompoundTagAt(i)));
        }
    }

    @Override
    protected void buildGui() {
        // Fond semi-transparent plein écran
        root.add(new Rectangle().originalPos(0, 0).originalSize(1920, 1080)
                .fillColor(FactionGuiTheme.BG_OVERLAY));

        // Starfield décoratif
        root.add(new Starfield()
                .originalPos(0, 0).originalSize(1920, 1080)
                .starCount(100).starColor(0xFFF0F2FF).shootingStarChance(0.003f));

        // Panneau principal glass
        mainPanel = new ContainerComponent()
                .originalPos(PX, PY).originalSize(PW, PH)
                .backgroundColor(FactionGuiTheme.GLASS_BG)
                .borderColor(FactionGuiTheme.BORDER)
                .cornerRadius(20);
        mainPanel.fadeIn(10);
        mainPanel.slideIn(Component.Direction.DOWN, 30, 12);

        // Header gradient
        mainPanel.add(new GradientRectangle()
                .originalPos(0, 0).originalSize(PW, HEADER_H)
                .horizontal(0xFF1A0A2E, 0xFF0A1A2E)
                .cornerRadius(20).cornerMask(true, true, false, false));

        mainPanel.add(new Label("Shop")
                .originalPos(30, 16).originalSize(400, 28)
                .color(FactionGuiTheme.TEXT_PRIMARY).scale(1.4f));

        lblBalance = new Label("$ " + playerDollars)
                .originalPos(PW - 260, 18).originalSize(240, 24)
                .color(FactionGuiTheme.GOLD).scale(0.95f);
        mainPanel.add(lblBalance);

        // Barre de recherche
        int searchY = HEADER_H + 4;
        mainPanel.add(new Label("Recherche :")
                .originalPos(24, searchY + 14).originalSize(140, 20)
                .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.9f));

        searchField = new TextField()
                .placeholder("Nom d'item...")
                .backgroundColor(FactionGuiTheme.GLASS_BG2)
                .borderColor(FactionGuiTheme.BORDER)
                .borderColorFocus(FactionGuiTheme.CYAN)
                .textColor(FactionGuiTheme.TEXT_PRIMARY)
                .placeholderColor(FactionGuiTheme.TEXT_MUTED);
        searchField.originalPos(160, searchY).originalSize(PW - 184, SEARCH_H - 8);
        searchField.onTextChanged(q -> refreshContent());
        mainPanel.add(searchField);

        root.add(mainPanel);

        // Affichage initial : catégories racine
        showCategories(null);
    }

    // ── Navigation ────────────────────────────────────────────────────────

    /** Navigue vers une catégorie (null = retour à la racine). */
    private void navigateTo(ShopCategory cat) {
        if (cat != null) navStack.push(currentCategory != null ? currentCategory
                                                                : /* sentinel */ cat);
        else             navStack.clear();
        currentCategory = cat;
        refreshContent();
    }

    /** Retourne au niveau parent. */
    private void goBack() {
        if (!navStack.isEmpty()) {
            currentCategory = navStack.pop();
            if (navStack.isEmpty()) currentCategory = null;
        } else {
            currentCategory = null;
        }
        refreshContent();
    }

    /**
     * Reconstruit le panneau de contenu selon l'état courant.
     * Si une recherche est active → liste plate de résultats.
     * Sinon → catégories + items de currentCategory (ou racine si null).
     */
    private void refreshContent() {
        if (contentPanel != null) mainPanel.remove(contentPanel);

        contentPanel = new ContainerComponent()
                .originalPos(0, CONTENT_Y).originalSize(PW, CONTENT_H)
                .backgroundColor(0);

        String query = searchField != null ? searchField.getText().trim() : "";
        if (!query.isEmpty()) {
            buildSearchResults(contentPanel, query);
        } else {
            buildCategoryView(contentPanel);
        }

        mainPanel.add(contentPanel);
    }

    // ── Vue catégories ────────────────────────────────────────────────────

    private void showCategories(ShopCategory cat) {
        currentCategory = cat;
        if (cat != null && navStack.isEmpty()) navStack.push(null);
        refreshContent();
    }

    private void buildCategoryView(ContainerComponent panel) {
        List<ShopCategory> cats  = currentCategory != null ? currentCategory.children : rootCategories;
        List<ShopItem>     items = currentCategory != null ? currentCategory.items    : new ArrayList<>();

        int y = 8;

        // Breadcrumb + bouton retour
        if (currentCategory != null) {
            Button btnBack = new Button("← Retour")
                    .originalPos(CARD_PAD, y).originalSize(160, 36)
                    .colorScheme(FactionGuiTheme.GLASS_BG2)
                    .textColor(FactionGuiTheme.CYAN)
                    .borderColor(FactionGuiTheme.BORDER)
                    .cornerRadius(8)
                    .onClick(this::goBack);
            panel.add(btnBack);

            panel.add(new Label(buildBreadcrumb())
                    .originalPos(CARD_PAD + 170, y + 8).originalSize(PW - 200, 24)
                    .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.85f));
            y += 52;
        }

        // Grille de sous-catégories
        if (!cats.isEmpty()) {
            panel.add(new Label("Catégories")
                    .originalPos(CARD_PAD, y).originalSize(400, 22)
                    .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.85f));
            y += 28;

            int col = 0;
            for (ShopCategory cat : cats) {
                int cardX = CARD_PAD + col * (CARD_W + CARD_PAD);
                panel.add(buildCategoryCard(cat, cardX, y));
                col++;
                if (col >= CARD_COLS) { col = 0; y += CARD_H + CARD_PAD; }
            }
            if (col > 0) y += CARD_H + CARD_PAD;
            y += 8;
        }

        // Items directs
        if (!items.isEmpty()) {
            panel.add(new Label("Items")
                    .originalPos(CARD_PAD, y).originalSize(400, 22)
                    .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.85f));
            y += 28;

            for (ShopItem item : items) {
                panel.add(buildItemRow(item, CARD_PAD, y, PW - CARD_PAD * 2));
                y += ITEM_ROW_H + 8;
            }
        }

        if (cats.isEmpty() && items.isEmpty()) {
            panel.add(new Label("Aucun contenu dans cette catégorie.")
                    .originalPos(CARD_PAD, 80).originalSize(PW - CARD_PAD * 2, 28)
                    .color(FactionGuiTheme.TEXT_MUTED).scale(1.0f));
        }
    }

    private ContainerComponent buildCategoryCard(ShopCategory cat, int x, int y) {
        ContainerComponent card = new ContainerComponent()
                .originalPos(x, y).originalSize(CARD_W, CARD_H)
                .backgroundColor(FactionGuiTheme.CARD_BG)
                .borderColor(FactionGuiTheme.BORDER)
                .cornerRadius(12);

        // Icône (placeholder rectangle coloré si l'item n'est pas chargé)
        card.add(new Label(cat.displayName)
                .originalPos(20, 30).originalSize(CARD_W - 40, 28)
                .color(FactionGuiTheme.TEXT_PRIMARY).scale(1.1f));

        int total = countItems(cat);
        card.add(new Label(total + " item" + (total > 1 ? "s" : ""))
                .originalPos(20, 70).originalSize(CARD_W - 40, 20)
                .color(FactionGuiTheme.TEXT_MUTED).scale(0.85f));

        if (!cat.children.isEmpty()) {
            card.add(new Label(cat.children.size() + " sous-catégorie"
                    + (cat.children.size() > 1 ? "s" : ""))
                    .originalPos(20, 96).originalSize(CARD_W - 40, 20)
                    .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.8f));
        }

        card.onClick(() -> navigateTo(cat));
        return card;
    }

    private int countItems(ShopCategory cat) {
        int n = cat.items.size();
        for (ShopCategory child : cat.children) n += countItems(child);
        return n;
    }

    // ── Vue résultats de recherche ────────────────────────────────────────

    private void buildSearchResults(ContainerComponent panel, String query) {
        List<ShopItem> results = new ArrayList<>();
        collectMatchingItems(rootCategories, query.toLowerCase(), results);

        if (results.isEmpty()) {
            panel.add(new Label("Aucun résultat pour \"" + query + "\"")
                    .originalPos(CARD_PAD, 80).originalSize(PW - CARD_PAD * 2, 28)
                    .color(FactionGuiTheme.TEXT_MUTED).scale(1.0f));
            return;
        }

        panel.add(new Label(results.size() + " résultat(s)")
                .originalPos(CARD_PAD, 8).originalSize(400, 22)
                .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.85f));

        int y = 38;
        for (ShopItem item : results) {
            panel.add(buildItemRow(item, CARD_PAD, y, PW - CARD_PAD * 2));
            y += ITEM_ROW_H + 8;
        }
    }

    private void collectMatchingItems(List<ShopCategory> cats, String lowerQuery, List<ShopItem> out) {
        for (ShopCategory cat : cats) {
            for (ShopItem item : cat.items) {
                if (item.displayName.toLowerCase().contains(lowerQuery)) out.add(item);
            }
            collectMatchingItems(cat.children, lowerQuery, out);
        }
    }

    // ── Ligne d'item ──────────────────────────────────────────────────────

    /**
     * Construit une ligne item : icône | nom | prix achat | prix vente | [ACHETER] [VENDRE].
     */
    private ContainerComponent buildItemRow(ShopItem item, int x, int y, int w) {
        ContainerComponent row = new ContainerComponent()
                .originalPos(x, y).originalSize(w, ITEM_ROW_H)
                .backgroundColor(FactionGuiTheme.CARD_BG)
                .borderColor(FactionGuiTheme.BORDER)
                .cornerRadius(8);

        // Accent bar gauche
        row.add(new Rectangle().originalPos(0, 0).originalSize(4, ITEM_ROW_H)
                .fillColor(FactionGuiTheme.CYAN));

        // Item icon (rendu via RenderUtil.drawItemIcon dans ListItem.render)
        // Ici on utilise un Label comme placeholder — l'icône est rendue dans le render custom
        row.add(new Label(item.displayName)
                .originalPos(66, 14).originalSize(w - 480, 22)
                .color(FactionGuiTheme.TEXT_PRIMARY).scale(1.0f));

        // Prix achat
        if (item.canBuy) {
            int buyColor = ShopPriceEngine.priceColor(item.baseBuyPrice, item.baseBuyPrice);
            row.add(new Label("Achat : " + item.baseBuyPrice + " $")
                    .originalPos(w - 420, 12).originalSize(180, 20)
                    .color(buyColor).scale(0.9f));
        } else {
            row.add(new Label("Non achetable")
                    .originalPos(w - 420, 12).originalSize(180, 20)
                    .color(FactionGuiTheme.TEXT_MUTED).scale(0.85f));
        }

        // Prix vente
        if (item.canSell) {
            int sellColor = ShopPriceEngine.priceColor(item.baseSellPrice, item.baseSellPrice);
            row.add(new Label("Vente : " + item.baseSellPrice + " $")
                    .originalPos(w - 420, 36).originalSize(180, 20)
                    .color(sellColor).scale(0.9f));
        } else {
            row.add(new Label("Non vendable")
                    .originalPos(w - 420, 36).originalSize(180, 20)
                    .color(FactionGuiTheme.TEXT_MUTED).scale(0.85f));
        }

        // Bouton ACHETER
        if (item.canBuy) {
            Button btnBuy = new Button("Acheter")
                    .originalPos(w - 228, 16).originalSize(100, 48)
                    .colorScheme(FactionGuiTheme.CYAN)
                    .cornerRadius(8)
                    .onClick(() -> showBuyPopup(item));
            row.add(btnBuy);
        }

        // Bouton VENDRE
        if (item.canSell) {
            Button btnSell = new Button("Vendre")
                    .originalPos(w - 116, 16).originalSize(100, 48)
                    .colorScheme(FactionGuiTheme.VIOLET)
                    .cornerRadius(8)
                    .onClick(() -> showSellPopup(item));
            row.add(btnSell);
        }

        return row;
    }

    // ── Utilitaires ───────────────────────────────────────────────────────

    private String buildBreadcrumb() {
        StringBuilder sb = new StringBuilder("Shop");
        List<ShopCategory> path = new ArrayList<>(navStack);
        java.util.Collections.reverse(path);
        for (ShopCategory c : path) {
            if (c != null) sb.append(" > ").append(c.displayName);
        }
        if (currentCategory != null) sb.append(" > ").append(currentCategory.displayName);
        return sb.toString();
    }

    // ── Popups (implémentées en Task 10) ─────────────────────────────────

    void showBuyPopup(ShopItem item) { /* Task 10 */ }
    void showSellPopup(ShopItem item) { /* Task 10 */ }

    void closePopup() {
        if (dimOverlay  != null) { root.remove(dimOverlay);  dimOverlay  = null; }
        if (popupPanel  != null) { root.remove(popupPanel);  popupPanel  = null; }
    }

    // ── IGuiDataReceiver (implémenté en Task 10) ──────────────────────────

    @Override
    public void onDataUpdate(String componentId, String key, String value) { /* Task 10 */ }
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Test en jeu :** appuyer sur `B` → le shop s'ouvre avec la grille de catégories. Naviguer dans une catégorie → items affichés. Recherche → résultats filtrés.

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/gui/GuiAdminShop.java
git commit -m "feat(shop): GuiAdminShop - skeleton, grille catégories, recherche, navigation"
```

---

## Task 10 — GuiAdminShop — Popup achat/vente + IGuiDataReceiver

**Files:**
- Modify: `src/main/java/fr/eriniumgroup/eriniumfaction/shop/gui/GuiAdminShop.java`

- [ ] **Implémenter showBuyPopup() — remplacer le stub**

```java
void showBuyPopup(ShopItem item) {
    closePopup();

    // Dim overlay absorbant les clics
    ContainerComponent dim = new ContainerComponent() {
        @Override
        public boolean onMouseClicked(int mouseX, int mouseY, int mouseButton) {
            return isVisible();
        }
    };
    dim.originalPos(0, 0).originalSize(1920, 1080).backgroundColor(0x80000000);
    dimOverlay = dim;

    // Popup 640×440
    ContainerComponent popup = new ContainerComponent()
            .originalPos(640, 320).originalSize(640, 440)
            .backgroundColor(FactionGuiTheme.CARD_BG)
            .borderColor(FactionGuiTheme.BORDER)
            .cornerRadius(14);
    popup.fadeIn(8);

    popup.add(new Label("Acheter — " + item.displayName)
            .originalPos(24, 20).originalSize(592, 28)
            .color(FactionGuiTheme.CYAN).scale(1.2f));

    popup.add(new Label("Prix unitaire : " + item.baseBuyPrice + " $")
            .originalPos(24, 62).originalSize(400, 22)
            .color(FactionGuiTheme.TEXT_PRIMARY).scale(0.95f));

    popup.add(new Label("Quantité (max " + item.maxQtyPerTx + ") :")
            .originalPos(24, 100).originalSize(300, 20)
            .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.9f));

    // TextField quantité
    final TextField[] qtyFieldHolder = new TextField[1];
    final Label[] lblTotalHolder = new Label[1];

    TextField qtyField = new TextField()
            .backgroundColor(FactionGuiTheme.GLASS_BG2)
            .borderColor(FactionGuiTheme.BORDER)
            .borderColorFocus(FactionGuiTheme.CYAN)
            .textColor(FactionGuiTheme.TEXT_PRIMARY);
    qtyField.originalPos(24, 126).originalSize(200, 44);
    qtyField.setText("1");
    qtyField.cursorToEnd();
    qtyFieldHolder[0] = qtyField;

    Label lblTotal = new Label("Total : " + item.baseBuyPrice + " $")
            .originalPos(24, 182).originalSize(400, 24)
            .color(FactionGuiTheme.GOLD).scale(1.0f);
    lblTotalHolder[0] = lblTotal;

    qtyField.onTextChanged(t -> {
        int qty = parseQty(t, item.maxQtyPerTx);
        lblTotalHolder[0].text("Total : " + (item.baseBuyPrice * qty) + " $");
    });

    // Boutons ÷2, ×2, Max
    popup.add(buildQtyButton("÷2", 236, 126, 72, 44, () -> {
        int q = Math.max(1, parseQty(qtyFieldHolder[0].getText(), item.maxQtyPerTx) / 2);
        qtyFieldHolder[0].setText(String.valueOf(q));
    }));
    popup.add(buildQtyButton("×2", 318, 126, 72, 44, () -> {
        int q = Math.min(item.maxQtyPerTx, parseQty(qtyFieldHolder[0].getText(), item.maxQtyPerTx) * 2);
        qtyFieldHolder[0].setText(String.valueOf(q));
    }));
    popup.add(buildQtyButton("Max", 400, 126, 72, 44, () -> {
        qtyFieldHolder[0].setText(String.valueOf(item.maxQtyPerTx));
    }));

    popup.add(qtyField);
    popup.add(lblTotal);

    // Confirmer
    Button btnConfirm = new Button("Confirmer l'achat")
            .originalPos(24, 340).originalSize(280, 56)
            .colorScheme(FactionGuiTheme.CYAN)
            .cornerRadius(10)
            .onClick(() -> {
                int qty = parseQty(qtyFieldHolder[0].getText(), item.maxQtyPerTx);
                GuiNetworkHandler.sendAction("shop_gui", "shop_gui", "buy",
                        "id=" + item.configId + "|qty=" + qty);
                closePopup();
            });
    popup.add(btnConfirm);

    // Annuler
    popup.add(new Button("Annuler")
            .originalPos(320, 340).originalSize(280, 56)
            .colorScheme(FactionGuiTheme.GLASS_BG2)
            .cornerRadius(10)
            .onClick(this::closePopup));

    popupPanel = popup;
    root.add(dim);
    root.add(popup);
}
```

- [ ] **Implémenter showSellPopup() — remplacer le stub**

```java
void showSellPopup(ShopItem item) {
    closePopup();

    ContainerComponent dim = new ContainerComponent() {
        @Override
        public boolean onMouseClicked(int mouseX, int mouseY, int mouseButton) {
            return isVisible();
        }
    };
    dim.originalPos(0, 0).originalSize(1920, 1080).backgroundColor(0x80000000);
    dimOverlay = dim;

    ContainerComponent popup = new ContainerComponent()
            .originalPos(640, 320).originalSize(640, 440)
            .backgroundColor(FactionGuiTheme.CARD_BG)
            .borderColor(FactionGuiTheme.BORDER)
            .cornerRadius(14);
    popup.fadeIn(8);

    popup.add(new Label("Vendre — " + item.displayName)
            .originalPos(24, 20).originalSize(592, 28)
            .color(FactionGuiTheme.VIOLET).scale(1.2f));

    popup.add(new Label("Prix unitaire : " + item.baseSellPrice + " $")
            .originalPos(24, 62).originalSize(400, 22)
            .color(FactionGuiTheme.TEXT_PRIMARY).scale(0.95f));

    popup.add(new Label("Quantité (max " + item.maxQtyPerTx + ") :")
            .originalPos(24, 100).originalSize(300, 20)
            .color(FactionGuiTheme.TEXT_SECONDARY).scale(0.9f));

    final TextField[] qtyFieldHolder = new TextField[1];
    final Label[] lblTotalHolder = new Label[1];

    TextField qtyField = new TextField()
            .backgroundColor(FactionGuiTheme.GLASS_BG2)
            .borderColor(FactionGuiTheme.BORDER)
            .borderColorFocus(FactionGuiTheme.VIOLET)
            .textColor(FactionGuiTheme.TEXT_PRIMARY);
    qtyField.originalPos(24, 126).originalSize(200, 44);
    qtyField.setText("1");
    qtyField.cursorToEnd();
    qtyFieldHolder[0] = qtyField;

    Label lblTotal = new Label("Total : " + item.baseSellPrice + " $")
            .originalPos(24, 182).originalSize(400, 24)
            .color(FactionGuiTheme.GOLD).scale(1.0f);
    lblTotalHolder[0] = lblTotal;

    qtyField.onTextChanged(t -> {
        int qty = parseQty(t, item.maxQtyPerTx);
        lblTotalHolder[0].text("Total : " + (item.baseSellPrice * qty) + " $");
    });

    popup.add(buildQtyButton("÷2", 236, 126, 72, 44, () -> {
        int q = Math.max(1, parseQty(qtyFieldHolder[0].getText(), item.maxQtyPerTx) / 2);
        qtyFieldHolder[0].setText(String.valueOf(q));
    }));
    popup.add(buildQtyButton("×2", 318, 126, 72, 44, () -> {
        int q = Math.min(item.maxQtyPerTx, parseQty(qtyFieldHolder[0].getText(), item.maxQtyPerTx) * 2);
        qtyFieldHolder[0].setText(String.valueOf(q));
    }));
    popup.add(buildQtyButton("Max", 400, 126, 72, 44, () -> {
        qtyFieldHolder[0].setText(String.valueOf(item.maxQtyPerTx));
    }));

    popup.add(qtyField);
    popup.add(lblTotal);

    Button btnConfirm = new Button("Confirmer la vente")
            .originalPos(24, 340).originalSize(280, 56)
            .colorScheme(FactionGuiTheme.VIOLET)
            .cornerRadius(10)
            .onClick(() -> {
                int qty = parseQty(qtyFieldHolder[0].getText(), item.maxQtyPerTx);
                GuiNetworkHandler.sendAction("shop_gui", "shop_gui", "sell",
                        "id=" + item.configId + "|qty=" + qty);
                closePopup();
            });
    popup.add(btnConfirm);

    popup.add(new Button("Annuler")
            .originalPos(320, 340).originalSize(280, 56)
            .colorScheme(FactionGuiTheme.GLASS_BG2)
            .cornerRadius(10)
            .onClick(this::closePopup));

    popupPanel = popup;
    root.add(dim);
    root.add(popup);
}
```

- [ ] **Ajouter les helpers buildQtyButton() et parseQty() dans GuiAdminShop**

```java
private Button buildQtyButton(String label, int x, int y, int w, int h, Runnable action) {
    return new Button(label)
            .originalPos(x, y).originalSize(w, h)
            .colorScheme(FactionGuiTheme.GLASS_BG2)
            .textColor(FactionGuiTheme.CYAN)
            .borderColor(FactionGuiTheme.BORDER)
            .cornerRadius(8)
            .onClick(action);
}

private int parseQty(String s, int max) {
    try {
        int v = Integer.parseInt(s.trim());
        return Math.max(1, Math.min(max, v));
    } catch (NumberFormatException e) {
        return 1;
    }
}
```

- [ ] **Implémenter onDataUpdate() — remplacer le stub**

```java
@Override
public void onDataUpdate(String componentId, String key, String value) {
    if ("main".equals(componentId) && "result".equals(key)) {
        if (value == null) return;
        if (value.startsWith("ok|")) {
            String msg = value.substring(3);
            NotificationManager.success(msg);
        } else if (value.startsWith("err|")) {
            String msg = value.substring(4);
            NotificationManager.error(msg);
        }
    }
    // La balance est mise à jour via openGuiFor (le GUI est réouvert par le serveur après achat/vente)
}
```

- [ ] **Build**

```bash
JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] **Test en jeu :**
  1. Ouvrir le shop (B)
  2. Naviguer dans une catégorie avec des items
  3. Cliquer "Acheter" → popup s'ouvre, quantité modifiable, ÷2/×2/Max fonctionnels
  4. Confirmer un achat → notification succès ou erreur, GUI réouvert avec prix mis à jour
  5. Cliquer "Vendre" → même flow
  6. Vérifier que cliquer derrière le popup ne ferme pas / ne déclenche rien
  7. `B` depuis le jeu → shop ouvert, fermeture avec Echap

- [ ] **Commit**

```bash
git add src/main/java/fr/eriniumgroup/eriniumfaction/shop/gui/GuiAdminShop.java
git commit -m "feat(shop): GuiAdminShop - popup achat/vente, IGuiDataReceiver, helpers qty"
```

---

## Self-review coverage check

| Spec requirement | Task couverte |
|-----------------|---------------|
| Config directory-based récursive | Task 3 (ShopConfigLoader) |
| category.json obligatoire, items.json optionnel | Task 3 |
| shop-engine.json généré si absent | Task 3 |
| Exemple généré si adminshop/ vide | Task 3 |
| Tri alphabétique sur nom de dossier | Task 3 |
| Affichage : children d'abord, puis items | Task 9 (buildCategoryView) |
| ShopCategory récursif (suppression ShopSubCategory) | Task 1 |
| configId = chemin/dossier/id (unicité globale) | Task 3 |
| Prix dynamiques via ShopPriceEngine | Task 2 |
| Influence +0.01 par unité achetée/vendue | Task 5 (AdminShopManager) |
| Spread minimum garantit sellPrice ≤ buyPrice*(1-spread%) | Task 2 |
| Decay périodique via EriScheduler | Task 5 |
| Decay au restart (applyMissedDecays) | Task 4 + Task 5 |
| WorldSavedData persistence | Task 4 |
| Vérification inventaire plein (achat) | Task 5 |
| Vérification stock insuffisant (vente) | Task 5 |
| Fonds insuffisants | Task 5 |
| GUI — catégories grille 3 colonnes | Task 9 |
| GUI — barre de recherche globale | Task 9 |
| GUI — navigation + breadcrumb | Task 9 |
| GUI — liste items avec prix colorés | Task 9 |
| GUI — popup buy/sell + qty sélecteur | Task 10 |
| GUI — dim overlay absorbant les clics | Task 10 |
| GUI — boutons ÷2 ×2 Max | Task 10 |
| IGuiDataReceiver — notifications | Task 10 |
| Keybind B | Task 8 (ClientProxy) |
| /shop | Task 7 + Task 8 |
| /shopadmin reload/resetprices/resetprice/info/setinfluence | Task 7 |
| Auto-complétion des IDs | Task 7 |
| Initialisation serveur dans onServerStarting | Task 8 |

Toutes les exigences de la spec sont couvertes.
