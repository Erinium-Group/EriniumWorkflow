# EriniumFaction — Known Issues & Resolutions

> Registre des erreurs rencontrees et leurs resolutions.
> Lire ce fichier AVANT de commencer toute tache pour eviter de repeter les memes erreurs.

---

## Mixins

### Les classes Mixin ne peuvent PAS etre referencees directement
- **Date** : 2026-03-20
- **Systeme** : MixinEntityPlayerTabName / TabListNameHandler
- **Probleme** : `TabListNameHandler.init()` appelait `MixinEntityPlayerTabName.setCallback()` directement. Crash au chargement : `IllegalClassLoadError: Mixin is defined in mixins.eriniumfaction.json and cannot be referenced directly`
- **Cause** : SpongePowered Mixin interdit le chargement direct d'une classe `@Mixin` par le classloader normal.
- **Solution** : Creer une classe intermediaire normale (ex: `TabListNameCallback.java`) qui contient le champ statique. Le Mixin lit depuis cette classe, le mod ecrit dedans. Jamais de reference directe a une classe `@Mixin`.

### Les Mixins ne peuvent PAS importer de classes mod (EriAPI, DataManager, etc.)
- **Date** : 2026-03-20
- **Systeme** : MixinEntityPlayerTabName
- **Probleme** : Le Mixin importait `fr.eri.eriapi.data.DataManager`. Crash : `ClassNotFoundException: fr.eri.eriapi.data.DataManager`
- **Cause** : Les Mixins sont charges TRES tot par MixinBooter, avant que les mods soient charges. Les classes EriAPI ne sont pas encore dans le classpath.
- **Solution** : Ne JAMAIS importer de classes mod dans un Mixin. Utiliser un callback via une classe intermediaire avec des types generiques (`Function<Object, ...>`).

### Les Mixins sur EntityPlayerMP ne vont PAS dans "mixins" (commun)
- **Date** : 2026-03-20
- **Systeme** : MixinEntityPlayerTabName
- **Probleme** : `EntityPlayerMP` dans la section `"mixins"` du JSON provoque `ClassNotFoundException: EntityPlayerMP` cote client.
- **Cause** : En dev client standalone, les classes serveur ne sont pas dans le classpath. La section `"mixins"` charge sur client ET serveur.
- **Solution** : Mettre dans `"server"`. Mais attention : les mixins `"server"` ne s'appliquent PAS en serveur integre. Si le mixin doit fonctionner en integre, trouver une approche sans mixin (ex: packet manuel).

### displayGuiScreen(null) dans initGui() → StackOverflow
- **Date** : 2026-03-20
- **Systeme** : MixinGuiGameOver (supprime depuis)
- **Probleme** : Injecter `displayGuiScreen(null)` dans `initGui()` de `GuiGameOver` cause une boucle infinie → StackOverflowError.
- **Cause** : `displayGuiScreen()` rappelle `initGui()`. Comme le joueur est mort, MC re-ouvre `GuiGameOver` → recursion infinie.
- **Solution finale** : Abandonner le Mixin. Gerer la mort cote serveur en cancelant `LivingDeathEvent` et en faisant le respawn manuellement. Pas de mort vanilla = pas d'ecran de mort.

---

## Events Forge

### FMLServerStartingEvent / FMLServerStoppingEvent ne sont PAS des events Forge bus
- **Date** : 2026-03-20
- **Systeme** : DeathCorpseManager
- **Probleme** : `@SubscribeEvent` sur `FMLServerStartingEvent`. Crash : `IllegalArgumentException: takes a argument that is not an Event class`
- **Cause** : Ce sont des events FML lifecycle, pas des events Forge bus. `@SubscribeEvent` ne fonctionne qu'avec les events du Forge EventBus.
- **Solution** : Utiliser `@Mod.EventHandler` dans la classe `@Mod` principale, puis appeler les methodes du manager.

### EriEvents avec EventPriority.LOWEST n'est pas fiable
- **Date** : 2026-03-20
- **Systeme** : RpgEventHandler / LivingDeathEvent
- **Probleme** : `EriEvents.on(LivingDeathEvent.class).priority(EventPriority.LOWEST)` ne se declenchait pas.
- **Cause** : EriEvents est un wrapper qui peut ne pas propager correctement les priorites les plus basses.
- **Solution** : Pour les events critiques, utiliser `@SubscribeEvent(priority = EventPriority.LOWEST)` dans un `@Mod.EventBusSubscriber` classique.

---

## Rendu / GUI

### NoClassDefFoundError en production apres ajout de classe EriAPI
- **Date** : 2026-03-18
- **Systeme** : MagicHudOverlay / TexturedRect
- **Probleme** : Crash : `NoClassDefFoundError: fr/eri/eriapi/gui/components/TexturedRect`
- **Cause** : Le jar EriAPI en production n'a pas ete rebuild apres l'ajout de la nouvelle classe.
- **Solution** : TOUJOURS rebuild EriAPI et copier le jar quand des classes EriAPI sont ajoutees/modifiees.

### GUI RPG ne se met pas a jour apres une action
- **Date** : 2026-03-20
- **Systeme** : GuiRpgMenu
- **Probleme** : Apres invest stat, le GUI ne montrait pas les nouvelles valeurs. Fermer/rouvrir etait necessaire.
- **Cause** : `EriScheduler.delay(2)` recreait le GUI avant que le `@Sync` arrive. Et si le joueur ferme avant, le timer rouvre le GUI.
- **Solution** : Systeme de polling reactif. Snapshot les valeurs au `buildGui()`, comparer dans `updateScreen()` chaque tick. Rebuild seulement quand les donnees `@Sync` changent reellement.

---

## Systeme de mort

### PlayerDropsEvent ne fire pas quand LivingDeathEvent est cancel
- **Date** : 2026-03-20
- **Systeme** : DeathHandler + DeathCorpseManager
- **Probleme** : Le custom death handler cancel `LivingDeathEvent`. `PlayerDropsEvent` ne fire jamais.
- **Solution** : Collecter l'inventaire manuellement dans le death handler et appeler `DeathCorpseManager.createCorpse()` directement.

### Spawn sous terre apres la mort
- **Date** : 2026-03-20
- **Systeme** : DeathHandler
- **Probleme** : `overworld.getSpawnPoint()` retourne un Y sous le sol.
- **Solution** : Utiliser `overworld.getTopSolidOrLiquidBlock()` pour trouver le Y le plus haut.

---

## Tab List

### SPacketPlayerListItem ne contient pas le display name formate
- **Date** : 2026-03-20
- **Systeme** : TabListRenderer / TabListNameHandler
- **Probleme** : Les joueurs apparaissaient sans prefix de grade (juste pseudo blanc).
- **Cause** : `getTabListDisplayName()` retourne null par defaut → le client utilise le nom brut.
- **Solution** : Construire le `SPacketPlayerListItem` manuellement via `PacketBuffer` avec `UPDATE_DISPLAY_NAME` + nom formate. Pas de Mixin necessaire.

### Tab list affiche 3 colonnes pour 2 joueurs
- **Date** : 2026-03-20
- **Systeme** : TabListRenderer
- **Probleme** : Le panel affichait toujours 3 colonnes avec des separateurs.
- **Solution** : Calculer dynamiquement le nombre de colonnes (1/2/3 selon le nombre de joueurs). Adapter la largeur du panel.

---

## Chat

---

## Systeme RPG

### Defis quotidiens jamais assignes
- **Date** : 2026-03-20
- **Systeme** : ChallengeManager / RpgManager
- **Probleme** : Aucune quete/defi n'apparaissait dans le GUI RPG. La liste etait toujours vide.
- **Cause** : `ChallengeManager.pickDailyChallenges()` existait mais n'etait JAMAIS appele. `performDailyReset()` clearait les challenges mais ne les reassignait pas. `dailyChallengeIds` dans `RpgPlayerData` restait toujours vide.
- **Solution** : Ajouter `assignDailyChallenges(data)` dans `performDailyReset()` et au premier login (`checkDailyReset` quand `lastSaturationReset == 0` ou `dailyChallengeIds` vide). La methode appelle `pickDailyChallenges()` et remplit `dailyChallengeIds` avec 3 IDs aleatoires.

---

## Chat

### Doubles espaces dans les messages
- **Date** : 2026-03-20
- **Systeme** : ChatManager
- **Probleme** : Des doubles espaces entre le prefix, pseudo, separateur.
- **Cause** : Concatenation avec espaces de padding qui se cumulent quand un champ est vide.
- **Solution** : `while (result.contains("  ")) result = result.replace("  ", " ");` sur le string final dans `buildFormattedMessage()`, `buildPmComponent()`, et `TabListNameHandler.formatPlayerName()`.

---

## Economie / Banque

### Soldes affichés en notation scientifique (ex: 1.0000000000000002E7)
- **Date** : 2026-03-21
- **Système** : EconomyManager / FactionEnhancedManager / CommonProxy / lang files
- **Problème** : La banque de faction affichait des valeurs en notation scientifique. Les formats `%.0f` dans les lang files ne masquaient que les décimales à l'affichage, mais les calculs accumulaient des erreurs IEEE-754 infinies (ex: `0.02 * bank` sans arrondi).
- **Cause** : Aucune ronde des valeurs monétaires aux points d'écriture. `deposit()`, `withdraw()`, `transfer()`, `setBalance()` additionnaient/soustrayaient des doubles bruts. Les intérêts ECO_MONOPOLY, les distributions de reward de contrats et les déductions bank dans CommonProxy accumulaient aussi sans arrondi.
- **Solution** :
  1. Ajout de `public static double round2(double v)` dans `EconomyManager` (centrale).
  2. Tous les points d'écriture dans `EconomyManager` (deposit, withdraw, transfer, setBalance) arrondissent à 2 décimales.
  3. `FactionEnhancedManager` : ajout d'un `private static double round2()` local + application sur intérêt ECO_MONOPOLY, déduction CONTRACT_RESERVE, et les calculs cancelContract (toDistribute, toRefund, bank+=).
  4. `CommonProxy` : handleBankDeposit et handleBankWithdraw utilisent `EconomyManager.round2()` sur `info.bank`, idem pour la déduction contrat.
  5. Lang files (fr_FR + en_US) : tous les `%.0f$` liés à l'argent changés en `%.2f$` (create_cost, stat_bank_value, bank_deposited, bank_withdrawn, bank_insufficient, balance_value).
- **Règle** : `faction.bank` et `data.balance` ne doivent JAMAIS contenir plus de 2 décimales. Arrondir à chaque point d'écriture.

---

## Faction Enhanced

### `player.mcServer` n'existe pas sur EntityPlayerMP en 1.12.2
- **Date** : 2026-03-21
- **Systeme** : FactionManager.teleportPlayerToDimension
- **Probleme** : Utiliser `player.mcServer` compile pas — field inexistant avec les mappings MCP stable_39.
- **Cause** : Ce champ est obfusque et son nom MCP n'est pas `mcServer`.
- **Solution** : Utiliser `player.world.getMinecraftServer()` pour obtenir le serveur depuis une instance EntityPlayer. Fonctionne cote serveur (monde serveur).

### `EriniumFaction` non importé dans FactionCommand
- **Date** : 2026-03-21
- **Systeme** : FactionCommand (handleAdminSetLevel, etc.)
- **Probleme** : `EriniumFaction.LOGGER.info(...)` compilait pas — `EriniumFaction` non reconnu.
- **Cause** : L'import `fr.eriniumgroup.eriniumfaction.EriniumFaction` manquait dans FactionCommand.java.
- **Solution** : Ajouter l'import explicitement en tête du fichier.

### `PlayerRespawnEvent` n'existe pas dans `net.minecraftforge.event.entity.player`
- **Date** : 2026-03-21
- **Systeme** : FactionEnhancedEventHandler (TER_ANCHOR respawn)
- **Probleme** : `import net.minecraftforge.event.entity.player.PlayerRespawnEvent` → `cannot find symbol` au build.
- **Cause** : En Forge 1.12.2, cet event est une inner class de `PlayerEvent`, pas une classe standalone dans le package `entity.player`.
- **Solution** : Utiliser `PlayerEvent.PlayerRespawnEvent` (depuis `net.minecraftforge.fml.common.gameevent.PlayerEvent` déjà importé). Pas d'import séparé nécessaire.

### `NumericField.decimal(boolean)` n'existe pas — utiliser `allowDecimal(boolean)`
- **Date** : 2026-03-21
- **Système** : FactionPageContracts / NumericField (EriAPI)
- **Problème** : Appel à `.decimal(true)` sur un `NumericField`. Erreur : `cannot find symbol`.
- **Cause** : La méthode correcte dans l'API EriAPI est `.allowDecimal(boolean)`, pas `.decimal(boolean)`.
- **Solution** : Utiliser `.allowDecimal(true)` pour autoriser les valeurs décimales. De même, la méthode pour les négatifs est `.allowNegative(boolean)`.

### `net.minecraft.nbt.Constants` n'existe pas — utiliser `net.minecraftforge.common.util.Constants`
- **Date** : 2026-03-21
- **Système** : FactionInfo / ContractData NBT helpers
- **Problème** : `net.minecraft.nbt.Constants.NBT.TAG_COMPOUND` → `package net.minecraft.nbt.Constants does not exist`.
- **Cause** : La classe `Constants` avec la constante `NBT.TAG_COMPOUND` est dans Forge, pas dans Minecraft vanilla.
- **Solution** : Utiliser `net.minecraftforge.common.util.Constants.NBT.TAG_COMPOUND`.

### `Item.getSubItems()` attend un `NonNullList`, pas un `List`
- **Date** : 2026-03-21
- **Système** : FactionPageContracts / ItemPickerListItem (chargement des items du registre)
- **Problème** : `item.getSubItems(creativeTab, subItems)` avec `List<ItemStack>` → `incompatible types: List<ItemStack> cannot be converted to NonNullList<ItemStack>`.
- **Cause** : La signature de `Item.getSubItems` en 1.12.2 exige `net.minecraft.util.NonNullList<ItemStack>`.
- **Solution** : Utiliser `net.minecraft.util.NonNullList.create()` pour créer la liste de sous-items.

---

## GUI Inventaire / Coffre

### Mapping inventaire joueur : MC slots 9-35 = lignes principales, 0-8 = hotbar
- **Date** : 2026-03-21
- **Système** : FactionPageChest / CommonProxy sendChestInventory / handleChestSlotClick
- **Règle** : Dans `player.inventory.mainInventory`, les slots MC 9-35 correspondent aux 3 lignes de l'inventaire principal (haut→bas), les slots 0-8 au hotbar. Dans l'affichage GUI on mappe : GUI slots 0-26 = MC 9-35, GUI slots 27-35 = MC 0-8. La conversion inverse : `mcSlot = guiSlot < 27 ? guiSlot + 9 : guiSlot - 27`.

### Registre d'item dans le serializer : utiliser `~` comme séparateur (PAS `:`)
- **Date** : 2026-03-21 → corrigé 2026-03-21
- **Système** : FactionPageChest / FactionPageContracts (parseItemEntry) / CommonProxy (serializeStack)
- **Ancienne règle** : Format `registryName:meta:count` avec parsing des 2 derniers tokens. Fragile et sans support NBT.
- **Règle actuelle (BUG 3 fix)** : Format `registryName~meta~count[~base64nbt]`. Le séparateur `~` évite le conflit avec les registry names qui contiennent `:`. Le 4e champ optionnel est le NBT compressé en Base64 (nécessaire pour les livres enchantés, items nommés, etc.). Parser avec `split("~", 4)` — 3 ou 4 champs. Le format `empty` reste inchangé.

### ItemSlot serverOnly — double-fire et timing : réécriture complète sur modèle GuiContainer vanilla
- **Date** : 2026-03-21 (refonte 2026-03-21)
- **Système** : ItemSlot (EriAPI) / FactionPageChest
- **Problème** : Le système serverOnly présentait plusieurs bugs fondamentaux liés à un mauvais placement de l'action :
  1. `onAnyClick` était appelé 2 à 3 fois par clic physique (double-fire dans `onDragEnd` : une fois dans le bloc "no drag", une deuxième fois dans le bloc "else" juste en dessous — les deux branches exécutaient `onAnyClick`).
  2. Le debounce time-based (100ms puis 50ms) était non fiable : trop court sur certains systèmes lents, bloquait des clics légitimes rapides.
  3. La détection de double-clic utilisait une fenêtre 150-350ms artificiellement contrainte qui ratait les doubles-clics rapides et détectait des faux positifs.
- **Cause racine** : L'architecture différait de vanilla GuiContainer. Dans vanilla, `mouseClicked` ne fait que *mémoriser l'intention*, et l'action réelle est prise dans `mouseReleased`. Notre code essayait de faire les deux.
- **Solution** : Réécriture complète calquée sur `GuiContainer` 1.12.2 :
  1. `onMouseClicked` : ne fait QUE enregistrer l'état (`serverDragPending=true`, `serverPendingClickSlot`, `serverDragButton`). Zéro callback, zéro paquet réseau.
  2. `checkDragHover` (mouseClickMove) : accumule les `serverDragTargets` si la souris se déplace sur d'autres slots.
  3. `onDragEnd` (mouseReleased) : décide UNE seule action — si `serverDragTargets` non vide → drag callback ; sinon → `onAnyClick` EXACTEMENT UNE FOIS, puis vérification double-clic (même slot + bouton gauche + < 250ms).
  4. Remplacement du debounce time-based par un flag booléen `mouseIsDown` : mis à `true` au premier `onMouseClicked`, remis à `false` dans `onDragEnd`. Garantit qu'un seul appel logique est traité par pression physique, indépendamment du timing.
  5. Suppression de tous les `System.out.println` de debug.

### Drag distribue tout sur le premier slot survolé au lieu de distribuer
- **Date** : 2026-03-21
- **Système** : ItemSlot (EriAPI)
- **Problème** : Le drag activait immédiatement `startDrag()` dans `onMouseClicked`. Au premier `mouseClickMove`, le slot initial était ajouté à `dragSlots` avec tout le curseur, puis redistribuait 100% là — tous les items finissaient sur le premier slot.
- **Cause** : `startDrag()` était appelé au moment du clic, pas au moment du mouvement réel. `checkDragHover` s'appliquait donc au slot d'origine dès le premier `mouseClickMove`.
- **Solution** : Introduction d'un état `potentialDragButton/potentialDragCursor`. Le clic positionne le potentiel, `onDragMove()` (appelé depuis `EriGuiScreen.mouseClickMove`) active le drag réel uniquement au premier mouvement. `onDragEnd()` (mouseReleased sans mouvement) annule le potentiel proprement.

### Items avec NBT (livres enchantés, etc.) bloqués dans le coffre de faction
- **Date** : 2026-03-21
- **Système** : FactionPageChest / CommonProxy
- **Problème** : Le sérialiseur `registryName:meta:count` n'incluait pas le NBT. Les items avec NBT (enchantements, noms custom) se retrouvaient sans leur NBT côté client. Le modèle client-optimiste pouvait aussi diverger du serveur.
- **Cause** : (1) Format de sérialisation sans NBT. (2) Le client manipulait les items localement et envoyait l'état résultant, mais le serveur n'avait aucun moyen de vérifier la cohérence.
- **Solution** : Refonte en modèle serveur-autoritaire complet :
  1. `serializeStack` utilise `~` comme séparateur et inclut le NBT en 4e champ (Base64 GZIP NBT).
  2. `handleChestSlotClick` gère un curseur serveur par joueur (`Map<UUID, ItemStack> chestCursors`). Format payload : `source:index:button` (0=gauche, 1=droit, 2=shift).
  3. Après chaque clic, le serveur envoie `chest_full_state` = `cursor|chest0;...;chest26|inv0;...;inv35` au joueur actif.
  4. `chestClose` (envoyé à la fermeture du GUI ou navigation vers une autre page) redonne le curseur serveur à l'inventaire joueur.
  5. `FactionPageChest` parse `chest_full_state` et set le curseur via `ItemSlot.setCursorStack()`.
  6. `FactionPageContracts.parseItemEntry()` mis à jour avec le même format `~`.

### `collectContract` via GUI (ancienne implémentation) ouvrait un IGuiHandler vanilla
- **Date** : 2026-03-21
- **Système** : FactionPageContracts / handleCollectContract dans CommonProxy
- **Problème** : L'ancien collectContract envoyait `openCollectGui(...)` qui appelait `player.openGui(...)` → ouvrait un Container vanilla. Incompatible avec le flow EriAPI GUI.
- **Solution** : Remplacer par le système de popup EriAPI : le client envoie `requestCollectItems`, le serveur répond avec `collect_items` (liste sérialisée), le client affiche le popup dans la page contrats. Collect unitaire via `collectItem`, collecte totale via `collectAll`.

---

## Système Bannière

### Cape bannière : ci.cancel() doit être appelé APRÈS les guards

- **Date** : 2026-03-21
- **Système** : MixinLayerCape
- **Problème** : La cape de bannière ne s'affichait pas sur le joueur. Le hook était correctement câblé (BannerCapeHook.getCapeTexture non null, data synced avec bannerLen=384) mais la cape ne rendait jamais.
- **Cause** : Dans `onDoRenderLayer`, `ci.cancel()` était appelé AVANT les guards `hasPlayerInfo()` et `isWearing(CAPE)`. Cela annulait le rendu vanilla même pour les joueurs sans cape mod, et les guards suivants faisaient un `return` sans rien rendre — résultat : aucune cape du tout (ni vanilla ni bannière).
- **Solution** : Déplacer tous les guards (`hasPlayerInfo`, `isWearing`, `elytra`) AVANT l'appel au hook et AVANT `ci.cancel()`. N'appeler `ci.cancel()` que lorsqu'on est certain de rendre la cape bannière.

### Bannerière bloc : getPatternList().isEmpty() ne détecte PAS un bannerière blanc en 1.12.2

- **Date** : 2026-03-21
- **Système** : BannerBlockCallback / MixinTileEntityBannerRenderer
- **Problème** : Les bannières de bloc blanches restaient blanches — la texture de faction ne s'appliquait jamais.
- **Cause** : En MC 1.12.2, `TileEntityBanner.getPatternList()` retourne toujours une liste avec **au moins un élément** (la couleur de base) même sur un bannière sans motif. `getPatternList().isEmpty()` est donc toujours `false` pour un bannière plain — la condition rejetait tous les bannières.
- **Solution** : Utiliser `te.getPatternList().size() > 1` au lieu de `!te.getPatternList().isEmpty()`. Un bannière "plain" (sans motif décoratif) a `size == 1` (couleur de base uniquement). Les bannières avec motifs décoratifs ont `size >= 2`.

---

### `TileEntityBannerRenderer.render` — signature correcte et API TileEntityBanner
- **Date** : 2026-03-21
- **Système** : MixinTileEntityBannerRenderer / BannerBlockCallback
- **Problème 1** : Mixin sur `render(Lnet/minecraft/tileentity/TileEntityBanner;DDDFI)V` → "Cannot find target method" / "Unable to locate obfuscation mapping".
- **Cause 1** : La méthode a 7 paramètres (pas 6) : `(TileEntity, double, double, double, float, int, float)`. Descriptor correct : `render(Lnet/minecraft/tileentity/TileEntity;DDDFIF)V`. SRG name : `func_192841_a`.
- **Solution 1** : Utiliser `render(Lnet/minecraft/tileentity/TileEntity;DDDFIF)V` dans tous les `@Inject`/`@Redirect`. Les méthodes Java injectées doivent avoir un 7e paramètre `float f`.
- **Problème 2** : `TileEntityBanner.getBaseColor()` → `cannot find symbol`. `TileEntityBanner.getPatterns()` sans arguments → erreur.
- **Cause 2** : MCP stable_39 n'expose pas de méthode `getBaseColor()`. `getPatterns(ItemStack)` prend un `ItemStack`. La liste de patterns s'obtient via `getPatternList()` (MCP name, `func_175114_c`).
- **Solution 2** : Utiliser `te.getPatternList().isEmpty()` pour vérifier l'absence de patterns. Ne pas vérifier la couleur de base via l'API publique (pas de getter exposé sans réflexion).

---

## Système Cape de Bannière

### `EnumPlayerModelParts` n'est PAS dans `net.minecraft.client.entity`
- **Date** : 2026-03-21
- **Système** : MixinLayerCape
- **Problème** : Écrire `net.minecraft.client.entity.PlayerModelPart` dans le Mixin → `cannot find symbol`.
- **Cause** : L'enum s'appelle `EnumPlayerModelParts` et se trouve dans `net.minecraft.entity.player`, pas dans le package client.
- **Solution** : Utiliser `import net.minecraft.entity.player.EnumPlayerModelParts` et `player.isWearing(EnumPlayerModelParts.CAPE)`.

### `ModelPlayer.bipedCape` est private — utiliser `renderCape(float scale)`
- **Date** : 2026-03-21
- **Système** : MixinLayerCape
- **Problème** : Accéder à `((ModelPlayer) renderer.getMainModel()).bipedCape` → `bipedCape has private access in ModelPlayer`.
- **Cause** : Le champ est private dans `ModelPlayer`. Même en MCP il reste inaccessible sans `@Accessor`.
- **Solution** : Utiliser la méthode publique `renderCape(float scale)` sur `ModelPlayer` (méthode MCP : `func_178728_c`), qui render le cap model part directement.

---

### `Component.tooltip(String)` retourne `Component`, pas le type concret — chaîne fluent cassée
- **Date** : 2026-03-21
- **Système** : FactionPageBanner / Button swatch
- **Problème** : Enchaîner `.tooltip(...)` dans une chaîne fluent sur un `Button` échoue à la compilation : `incompatible types: Component cannot be converted to Button`. La méthode `tooltip(String)` est définie sur `Component` et retourne `Component`, pas le sous-type.
- **Cause** : La méthode `tooltip()` dans EriAPI `Component` retourne `Component` au lieu du type générique. Les sous-classes ne surchargent pas avec le bon type de retour.
- **Solution** : Séparer l'appel `.tooltip()` de la chaîne fluent : créer le composant d'abord, puis appeler `component.tooltip(text)` séparément sur la référence locale.

---

## Système Biome / World Generation

### `getRandomTreeFeature()` retournant null → NPE dans `BiomeDecorator.genDecorations` (ligne 136)
- **Date** : 2026-03-22
- **Système** : BiomeExtendedBeach + 7 autres biomes (BiomeWindyPlateau, BiomeDeepCanyon, BiomeSteepMountains, BiomeVolcano, BiomeGlacier, BiomeRedDesert, BiomeEnhancedMesa)
- **Problème** : `NullPointerException` à `BiomeDecorator.genDecorations(BiomeDecorator.java:136)` lors de la population de chunks. Crash reproductible à chaque génération d'un chunk Extended Beach.
- **Cause racine** : `BiomeExtendedBeach.getRandomTreeFeature()` retournait `null` dans 75% des cas (logique `if (rand.nextInt(4) == 0) return palm; return null;`) alors que `treesPerChunk = 1`. La ligne 136 de `BiomeDecorator` appelle `.generate()` directement sur le résultat sans null-check → NPE. Les 7 autres biomes retournaient aussi `null` mais avaient `treesPerChunk = 0`, ce qui est techniquement safe en vanilla mais risqué.
- **Solution** :
  1. `BiomeExtendedBeach` : suppression du `return null`. La méthode retourne toujours `new WorldGenPalmTree()`. La densité sparse est déjà gérée par `treesPerChunk = 1` (pas besoin de null pour "pas d'arbre ce tick").
  2. Les 7 biomes sans arbres : remplacement de `return null` par `return new WorldGenTrees(false)` (fallback vanilla safe).
- **Règle** : `getRandomTreeFeature()` (alias `getRandomWorldGenForTrees()`) ne doit JAMAIS retourner null. Si un biome n'a pas d'arbres, mettre `treesPerChunk = 0` ET retourner un generateur fallback safe (ex: `new WorldGenTrees(false)`). Ne jamais utiliser le retour null pour simuler "pas d'arbre ce chunk".

### `BiomeProperties.setSnowy()` n'existe pas en 1.12.2
- **Date** : 2026-03-22
- **Système** : BiomeEriniumColdTaiga
- **Problème** : Appel à `.setSnowy()` sur `BiomeProperties` → `cannot find symbol`.
- **Cause** : En Minecraft 1.12.2 Forge, `BiomeProperties` n'a pas de méthode `setSnowy()`. La neige est gérée automatiquement par le moteur MC lorsque la température du biome est inférieure à 0.15 (neige sur les blocs) ou négative (gel de l'eau).
- **Solution** : Supprimer l'appel `.setSnowy()`. Utiliser une température négative (ex: `-0.5f`) suffit à déclencher l'affichage neige/glace vanilla.

### Mixin sur `WorldProvider` — nom de méthode `init()V` et accès aux champs protected
- **Date** : 2026-03-22
- **Système** : MixinWorldProvider
- **Problème 1** : `@Inject method = "registerWorldChunkManager()V"` → `Cannot find target method` / `Unable to locate obfuscation mapping`.
- **Cause 1** : En 1.12.2 MCP stable_39, la méthode qui initialise le `biomeProvider` dans `WorldProvider` s'appelle `init()V` (SRG : `func_76572_b`). Le nom `registerWorldChunkManager` est issu d'une version antérieure de MCP et n'existe pas dans les mappings stable_39.
- **Solution 1** : Utiliser `method = "init()V"` dans `@Inject`.
- **Problème 2** : Accès à `self.world`, `self.biomeProvider` depuis une référence castée → `world has protected access in WorldProvider` / `biomeProvider has protected access in WorldProvider`.
- **Cause 2** : Les champs `world` et `biomeProvider` sont `protected` dans `WorldProvider`. Accéder à des champs protected d'une classe via une variable locale castée en `WorldProvider` est interdit par le compilateur Java même si l'objet est l'instance courante.
- **Solution 2** : Déclarer les champs dans le Mixin avec `@Shadow` (`@Shadow protected net.minecraft.world.World world; @Shadow public BiomeProvider biomeProvider;`) et y accéder directement (sans cast) dans la méthode injectée. L'annotation `@Shadow` rend les champs protected de la cible directement accessibles dans le Mixin.

---

## Anti Use Bug

### `CPacketEditBook` n'existe pas en 1.12.2
- **Date** : 2026-03-22
- **Systeme** : MixinNetHandlerUseBug
- **Probleme** : `import net.minecraft.network.play.client.CPacketEditBook` → `cannot find symbol`. La methode `processEditBook` n'existe pas non plus dans `NetHandlerPlayServer`.
- **Cause** : `CPacketEditBook` et `processEditBook` sont des classes/methodes 1.13+. En 1.12.2, l'edition de livres passe par `CPacketCustomPayload` avec le canal `"MC|BEdit"` (livre en cours d'ecriture) ou `"MC|BSign"` (signature d'un livre). La validation se fait dans le hook `processCustomPayload`.
- **Solution** : Injecter dans `processCustomPayload`, filtrer sur `packet.getChannelName()` == `"MC|BEdit"` ou `"MC|BSign"`, lire l'ItemStack du `PacketBuffer`, valider le NBT du livre.

### `TileEntityHopper.transferItems()Z` n'existe pas — utiliser `updateHopper()Z`
- **Date** : 2026-03-22
- **Systeme** : MixinTileEntityHopper
- **Probleme** : `@Inject(method = "transferItems()Z")` → `Unable to locate obfuscation mapping`. Mixin warning puis erreur de build.
- **Cause** : En 1.12.2 MCP stable_39, la methode publique qui effectue le transfert s'appelle `updateHopper()Z` (SRG: `func_145887_i`). `transferItemsOut()Z` (SRG: `func_145883_k`) et `pullItems()Z` sont des helpers statiques prives; il n'y a pas de methode instance `transferItems()Z`.
- **Solution** : Injecter dans `updateHopper()Z` a `@At("RETURN")`.

### `World.getChunkFromBlockCoords(BlockPos)` n'existe pas en 1.12.2
- **Date** : 2026-03-22
- **Systeme** : HopperLimiter
- **Probleme** : `event.getWorld().getChunkFromBlockCoords(event.getPos())` → `cannot find symbol: method getChunkFromBlockCoords(BlockPos)`.
- **Cause** : Cette methode n'existe pas dans l'API World de 1.12.2 avec les mappings MCP stable_39.
- **Solution** : Utiliser `world.getChunk(BlockPos)` (SRG: `func_175726_f`). Equivalent direct, accepte un `BlockPos`.

### `net.minecraft.item.Items` n'existe pas — utiliser `net.minecraft.init.Items`
- **Date** : 2026-03-22
- **Systeme** : NBTSizeValidator
- **Probleme** : `import net.minecraft.item.Items` → `cannot find symbol`.
- **Cause** : En 1.12.2, les items vanilla sont dans `net.minecraft.init.Items`, pas `net.minecraft.item.Items` (c'est le package 1.16+).
- **Solution** : Utiliser `import net.minecraft.init.Items`.

---

### `BlockBone.BONE_AXIS` n'existe pas — utiliser `BlockRotatedPillar.AXIS`
- **Date** : 2026-03-22
- **Système** : WorldGenFossilBones
- **Problème** : `BlockBone.BONE_AXIS` → `cannot find symbol`. La classe `BlockBone` n'existe pas en 1.12.2.
- **Cause** : En 1.12.2, le bloc bone block est accessible via `Blocks.BONE_BLOCK` et la propriété d'axe vient de sa classe parente `BlockRotatedPillar` avec le champ `BlockRotatedPillar.AXIS`.
- **Solution** : Remplacer `BlockBone.BONE_AXIS` par `BlockRotatedPillar.AXIS`. Import : `net.minecraft.block.BlockRotatedPillar`.

---

### `BiomeDecorator` n'a pas `brownMushroomsPerChunk` ni `redMushroomsPerChunk`
- **Date** : 2026-03-22
- **Système** : BiomeEriniumRoofedForest
- **Problème** : `this.decorator.brownMushroomsPerChunk = 1` et `redMushroomsPerChunk = 1` → `cannot find symbol`.
- **Cause** : En 1.12.2 MCP stable_39, `BiomeDecorator` n'expose qu'un seul champ `mushroomsPerChunk` pour les champignons. Il n'y a pas de champs séparés pour brun et rouge.
- **Solution** : Utiliser uniquement `this.decorator.mushroomsPerChunk = N` pour définir le nombre total de champignons générés par chunk.

---

## Système Anti-Cheat

### `EriCommand.runs()` exige un `return` dans la lambda (type int)
- **Date** : 2026-03-22
- **Système** : AntiCheatCommand
- **Problème** : `.runs(ctx -> { ... })` sans `return` → `incompatible types: bad return type in lambda expression / missing return value`.
- **Cause** : La méthode `runs()` d'EriCommand prend un `CommandExecutor` qui retourne un `int` (code retour de commande). Chaque branche de la lambda doit terminer par `return 1;` (succès) ou `return 0;` (échec/usage incorrect).
- **Solution** : Toujours terminer chaque branche d'exécution par `return 1;` (ou `return 0;` pour les erreurs). Règle générale : `runs(ctx -> { ...; return 1; })`.

### `FactionManager.getFaction(id)` et non `getFactionById(id)`
- **Date** : 2026-03-22
- **Systeme** : WebRequestHandler (Web Server REST API)
- **Probleme** : Build failed : `cannot find symbol — method getFactionById(String)`.
- **Cause** : La methode de FactionManager pour obtenir une faction par ID s'appelle `getFaction(String id)`, pas `getFactionById`. Le renommage automatique n'avait pas capture toutes les occurrences.
- **Solution** : Utiliser `FactionManager.getInstance().getFaction(id)`. Verifier toutes les occurrences apres un remplacement global.

---

### `EriScheduler.async()` prend un `Callable<T>`, pas un `Runnable`
- **Date** : 2026-03-22
- **Système** : CheckMining
- **Problème** : `EriScheduler.async(() -> { doSomething(); })` → `method async cannot be applied / bad return type / missing return value`.
- **Cause** : `EriScheduler.async(Callable<T>)` attend un `Callable`, pas un `Runnable`. Le type `T` doit être inférable — une lambda sans `return` est un `Runnable` et ne satisfait pas `Callable<T>`.
- **Solution** : Ajouter `return null;` à la fin de la lambda async : `EriScheduler.async(() -> { doSomething(); return null; })`. Pour les calculs qui ont un résultat, utiliser `.thenSync(result -> ...)` pour récupérer la valeur sur le thread principal.

---

## Combat Extensions

### `ItemArrow.createArrow()` — signature avec `EntityLivingBase`, pas `EntityPlayer`
- **Date** : 2026-03-23
- **Systeme** : Combat Extensions / ItemTieredArrow
- **Probleme** : Override de `createArrow(World, ItemStack, EntityPlayer)` → `@Override` fail : "method does not override or implement a method from a supertype".
- **Cause** : La methode Forge ajoutee sur `ItemArrow` est `createArrow(World, ItemStack, EntityLivingBase)` — 3e parametre `EntityLivingBase` pas `EntityPlayer`.
- **Solution** : Utiliser `createArrow(World world, ItemStack stack, EntityLivingBase shooter)`.

### `EntityArrow` — pas de `getShooter()`, utiliser `shootingEntity`
- **Date** : 2026-03-23
- **Systeme** : EntityAetheriteArrow
- **Probleme** : `getShooter()` n'existe pas sur `EntityArrow` en 1.12.2 Forge.
- **Cause** : Forge n'ajoute pas de methode `getShooter()` sur `EntityArrow`. Le champ s'appelle `shootingEntity` (public Entity).
- **Solution** : Acceder directement au champ `this.shootingEntity`.

### `RenderArrow` est abstract — utiliser `RenderTippedArrow` avec raw type
- **Date** : 2026-03-23
- **Systeme** : ClientProxy / enregistrement renderers fleches custom
- **Probleme** : `new RenderArrow(manager)` → "RenderArrow is abstract; cannot be instantiated". `new RenderTippedArrow(manager)` → "incompatible types: inference variable T has incompatible bounds" car `RenderTippedArrow extends RenderArrow<EntityTippedArrow>`.
- **Cause** : Les renderers sont genericalement types par l'entite. Nos entites custom n'etendent pas `EntityTippedArrow` mais `EntityArrow`.
- **Solution** : Creer une classe `RenderCustomArrow extends RenderTippedArrow` dans le package arrow, et utiliser un `IRenderFactory` raw-typed avec unchecked cast dans ClientProxy.

### `setUnlocalizedName` → `setTranslationKey` en 1.12.2 stable_39
- **Date** : 2026-03-23
- **Systeme** : CombatItems
- **Probleme** : `item.setUnlocalizedName(...)` → "cannot find symbol".
- **Cause** : Avec les mappings stable_39, la methode est renommee en `setTranslationKey`.
- **Solution** : Utiliser `item.setTranslationKey(...)`.

### `Item` vanilla n'a pas `setRarity()` — c'est du boilerplate EriAPI
- **Date** : 2026-03-23
- **Systeme** : CombatItems
- **Probleme** : `item.setRarity(EnumRarity.RARE)` → "cannot find symbol".
- **Cause** : `net.minecraft.item.Item` n'a pas de methode `setRarity()`. La rarity est un champ protected interne a chaque classe item. EriItem de EriAPI le gere via builder.
- **Solution** : Ne pas appeler `setRarity()` sur les items crees directement (sans EriItem). La rarity reste COMMON par defaut — cosmetique seulement.

### `World.spawnParticle` — signature : pas de parametre "count" avant les offsets
- **Date** : 2026-03-23
- **Systeme** : BackstabHandler
- **Probleme** : `spawnParticle(EnumParticleTypes, x, y, z, int, dx, dy, dz, data)` → no suitable method found.
- **Cause** : La signature en 1.12.2 est `spawnParticle(EnumParticleTypes, x, y, z, dx, dy, dz, int... data)`. Le count n'est pas un parametre — on appelle la methode autant de fois qu'on veut de particules.
- **Solution** : `world.spawnParticle(type, x, y, z, dx, dy, dz)` sans count.

### `Items.TNT` n'existe pas — TNT est un Block
- **Date** : 2026-03-23
- **Systeme** : EriniumRecipes
- **Probleme** : `Items.TNT` → "cannot find symbol".
- **Cause** : TNT est enregistre comme Block, pas Item. On ne le trouve pas dans la classe `Items`.
- **Solution** : Utiliser `Blocks.TNT` (et passer a EriRecipe.key(char, Block)).

### Textures rose/noir sur les items custom — ModelLoader.setCustomModelResourceLocation manquant
- **Date** : 2026-03-23
- **Systeme** : Combat Extensions (fleches, dagues, marteaux, pommes)
- **Probleme** : Tous les items combat affichent la texture rose/noir (missing texture).
- **Cause** : Aucun appel a `ModelLoader.setCustomModelResourceLocation()` pour ces items. Sans ca, Forge ne sait pas quel modele JSON utiliser.
- **Solution** : Creer une classe `CombatItemsClient` avec `@Mod.EventBusSubscriber(value = Side.CLIENT)` et un `@SubscribeEvent` sur `ModelRegistryEvent` qui appelle `ModelLoader.setCustomModelResourceLocation()` pour chaque item.

### Bow models enregistres trop tot (preInit) — items encore null
- **Date** : 2026-03-23
- **Systeme** : BowRenderHandler / ClientProxy
- **Probleme** : Les 3 arcs restent en rose/noir malgre le ModelLoader.
- **Cause** : `BowRenderHandler.registerBowModels()` etait appele dans `ClientProxy.preInit()`. A ce moment, `CombatItems.VALTERITE_BOW` etc. sont encore `null` car les items sont enregistres via `RegistryEvent.Register<Item>` qui fire APRES preInit. Le `if (bow == null) return;` skippait silencieusement.
- **Solution** : Deplacer l'appel dans `CombatItemsClient.registerModels(ModelRegistryEvent)` — cet event fire APRES l'enregistrement des items.

### ModelBakery.registerItemVariants — pas de prefix "item/" dans la ResourceLocation
- **Date** : 2026-03-23
- **Systeme** : BowRenderHandler
- **Probleme** : Les textures pulling_1 et pulling_2 des arcs s'affichent en noir et blanc (fallback).
- **Cause** : `ModelBakery.registerItemVariants()` recevait `new ResourceLocation(modid, "item/" + name + "_pulling_0")`. Le prefix `item/` est ajoute automatiquement par MC quand il cherche dans `models/item/`. Le mettre manuellement doublait le chemin : `models/item/item/valterite_bow_pulling_0.json` — introuvable.
- **Solution** : Retirer le prefix `item/` : `new ResourceLocation(modid, name + "_pulling_0")`.

### RenderCustomArrow ClassCastException — ne pas etendre RenderTippedArrow
- **Date** : 2026-03-23
- **Systeme** : Combat Extensions / Arrow rendering
- **Probleme** : Crash `ClassCastException: EntityValteriteArrow cannot be cast to EntityTippedArrow` quand une fleche custom est tiree.
- **Cause** : `RenderCustomArrow` etendait `RenderTippedArrow`. La methode `getEntityTexture(EntityTippedArrow)` de RenderTippedArrow cast l'entite en EntityTippedArrow, mais nos fleches etendent EntityArrow directement.
- **Solution** : Etendre `RenderArrow<EntityArrow>` au lieu de `RenderTippedArrow`, et override `getEntityTexture(EntityArrow)` pour retourner la texture vanilla arrow.

---

## Accessories & Gems

### EriAPI 1.2.0 — signatures reelles differentes de la documentation CLAUDE.md
- **Date** : 2026-03-23
- **Systeme** : GuiSocketing, SocketManager, CommonProxy
- **Probleme** : Multiples erreurs de compilation dans les classes du systeme Accessoires/Gemmes.
- **Cause** : La documentation CLAUDE.md decrit une API qui ne correspond pas au jar EriAPI 1.2.0. Differences constatees (verifiees via `javap`) :
  - `IGuiDataReceiver` : methode reelle = `onDataUpdate(String modid, String key, String value)`, pas `onGuiDataReceived(String, NBTTagCompound)`
  - `GuiNetworkHandler.sendAction` : signature = `(String guiKey, String componentId, String field, Object value)` — 4 params, pas 2 ou 3
  - `GuiNetworkHandler.sendData` : methode CLIENT seulement. Cote SERVEUR utiliser `sendDataToClient(EntityPlayerMP, String guiId, String componentId, String key, Object value)`
  - `GuiNetworkHandler.registerActionHandler` : callback = `BiConsumer<EntityPlayer, Map<String,String>>` — les donnees arrivent en Map, PAS en NBTTagCompound
  - Composants GUI : constructeurs sans coordonnees. Position via `.originalPos(x,y).originalSize(w,h)` — ex: `new Rectangle()` puis `.originalPos(0,0).originalSize(100,100)`
  - `Circle` : pas interactif (etend Shape, pas InteractiveComponent) — pas de `onClick()`. Utiliser un `Button` transparent par-dessus pour les clics
  - `EriGuiScreen` : pas de methode `getRoot()`. Utiliser `add(component)` directement. Pas de `rebuildGui()` — appeler `clearComponents()` puis `buildGui()`
  - `Button` : pas de `colorScheme(ColorScheme enum)`. Utiliser `colorNormal(int)`, `colorHover(int)`, `colorPressed(int)`
  - `ContainerComponent` : methode `clearChildren()` (pas `clear()`)
  - `Component.Direction` : enum avec UP/DOWN/LEFT/RIGHT pour `slideIn(Direction, int, int)`
- **Solution** : Verifier via `javap -classpath libs/eriapi-X.Y.Z-1.12.2.jar <ClassName>` AVANT tout code utilisant EriAPI. Toujours inspecter le jar directement plutot que de se fier a la doc CLAUDE.md.

### @Sync sur int[] non supporte par EriAPI DataManager
- **Date** : 2026-03-23
- **Systeme** : RpgPlayerData, SocketManager, AccessoryBonusManager
- **Probleme** : Les champs `@Sync public int[] accessoryBonuses = new int[6]` et `@Sync public int[] gemBonuses = new int[6]` ne compilent pas ou echouent a la serialisation.
- **Cause** : EriAPI DataManager ne supporte les annotations `@Sync` que sur les types primitifs, String, enum, `List<String>` et `Map<String,String>`. Les tableaux ne sont pas supportes.
- **Solution** : Remplacer les arrays par `Map<String, String>` avec la cle = `RpgStat.name()` et la valeur = entier en chaine. Exemple : `data.gemBonuses.put("FORCE", "3")`. Retirer `@Sync` si la synchronisation auto n'est pas critique (les bonus sont recalcules a l'equipement/desequipement).

### Variable locale "baubles" masque le package baubles.api
- **Date** : 2026-03-23
- **Systeme** : GemCombatCalculator, SocketManager
- **Probleme** : Erreur de compilation `package baubles does not exist` dans les methodes qui utilisent `baubles.api.BaublesApi.getBaublesHandler(player)`.
- **Cause** : La variable locale `IItemHandler baubles = ...` masque (shadowing) le package `baubles` dans la portee de la methode.
- **Solution** : Renommer la variable locale en `baublesHandler` pour eviter le conflit de nommage avec le package.

---

## Artéfacts (2026-03-23)

### EriAPI GUI : ContainerComponent n'existe pas
- **Date** : 2026-03-23
- **Systeme** : GuiArtifact
- **Probleme** : `import fr.eri.eriapi.gui.components.ContainerComponent` → `cannot find symbol`
- **Cause** : EriAPI ne propose pas de ContainerComponent. Les GUIs sont plats : on appelle `add(composant)` directement sur l'EriGuiScreen, avec `.originalPos()/.originalSize()` sur chaque composant.
- **Solution** : Supprimer ContainerComponent. Utiliser la méthode `add()` de l'écran directement avec des coordonnées absolues.

### EriAPI GUI : Label.Alignment.CENTER n'existe pas
- **Date** : 2026-03-23
- **Systeme** : GuiArtifact
- **Probleme** : `Label.Alignment.CENTER` → `cannot find symbol`
- **Cause** : L'enum s'appelle `Label.Align`, pas `Label.Alignment`.
- **Solution** : Utiliser `Label.Align.CENTER`.

### EriAPI GUI : Button.ColorScheme n'existe pas
- **Date** : 2026-03-23
- **Systeme** : GuiArtifact
- **Probleme** : `Button.ColorScheme.PRIMARY` → `cannot find symbol`
- **Cause** : `colorScheme()` prend un `int` (couleur ARGB), pas une enum. Utiliser les constantes de `FactionGuiTheme` (VIOLET, RED, BTN_GLASS, etc.).
- **Solution** : `button.colorScheme(FactionGuiTheme.VIOLET)` etc.

### EriAPI GUI : GuiNetworkHandler.sendAction signature
- **Date** : 2026-03-23
- **Systeme** : GuiArtifact
- **Probleme** : `GuiNetworkHandler.sendAction("key", nbtData)` → wrong number of arguments
- **Cause** : La signature est `sendAction(String handlerKey, String sourceId, String actionKey, String payload)`.
- **Solution** : `GuiNetworkHandler.sendAction("artifact_gui", "artifact_gui", "activate", "")`.

### EriAPI GUI : ListItem.onClicked() n'existe pas
- **Date** : 2026-03-23
- **Systeme** : GuiArtifact
- **Probleme** : `@Override public void onClicked()` → does not override
- **Cause** : Les clics sur les items d'une ScrollList sont gérés via `scrollList.onItemClick(Consumer<ListItem>)`, pas par une méthode sur ListItem.
- **Solution** : Utiliser `list.onItemClick(item -> { ... })` sur la ScrollList. Stocker les données nécessaires comme champs de la sous-classe ListItem et les récupérer en castant dans le Consumer.

### ArtifactCombatHandler : LivingHurtEvent.getEntity() retourne Entity
- **Date** : 2026-03-23
- **Systeme** : ArtifactCombatHandler
- **Probleme** : `EntityLivingBase victim = event.getEntity()` → `incompatible types: Entity cannot be converted to EntityLivingBase`
- **Cause** : `getEntity()` retourne `Entity`. Il faut utiliser `getEntityLiving()` qui retourne `EntityLivingBase`.
- **Solution** : Utiliser `event.getEntityLiving()` avec guard null check.

---

## Systeme d'enchantements Erinium (2026-03-23)

### net.minecraft.enchantment.Enchantments n'existe pas en 1.12.2
- **Date** : 2026-03-23
- **Systeme** : EnchantRepresailles, EnchantVolee, EnchantProspection, EnchantEffectHandler
- **Probleme** : `import net.minecraft.enchantment.Enchantments` → `cannot find symbol`
- **Cause** : En 1.12.2, les enchantements vanilla sont dans `net.minecraft.init.Enchantments`, pas dans le package `enchantment`.
- **Solution** : Utiliser `import net.minecraft.init.Enchantments`. Et `Enchantments.INFINITY` (pas `INFINITY_ARROWS`).

### ResourceLocation.getResourceDomain() / getResourcePath() introuvable
- **Date** : 2026-03-23
- **Systeme** : EnchantAncrage, EnchantEffectHandler, MixinEnchantmentHelper
- **Probleme** : `getResourceDomain()` et `getResourcePath()` → `cannot find symbol`
- **Cause** : Ces methodes n'existent pas dans la version de ResourceLocation utilisee par le compilateur. Elles sont peut-etre strippees par CleanRoomLoader ou absentes des stubs.
- **Solution** : Utiliser `resourceLocation.toString()` qui retourne `"namespace:path"`. Pour extraire le path : `fullName.substring(fullName.indexOf(':') + 1)`. Pour verifier le namespace+path complet : `"namespace:path".equals(rl.toString())` ou `rl.toString().startsWith("namespace:")`.

### InventoryPlayer.findItemInInventory() n'existe pas
- **Date** : 2026-03-23
- **Systeme** : EnchantEffectHandler (Volee)
- **Probleme** : `shooter.inventory.findItemInInventory(Items.ARROW)` → `cannot find symbol`
- **Cause** : La methode `findItemInInventory` n'existe pas sur `InventoryPlayer` en 1.12.2.
- **Solution** : Utiliser `shooter.inventory.hasItemStack(new ItemStack(Items.ARROW))`.

### Items.IRON_ORE et Items.GLASS n'existent pas
- **Date** : 2026-03-23
- **Systeme** : EnchantEffectHandler (AutoSmelt)
- **Probleme** : `net.minecraft.init.Items.IRON_ORE` et `Items.GLASS` → `cannot find symbol`
- **Cause** : IRON_ORE et GLASS sont des Blocks, pas des Items en 1.12.2. `net.minecraft.init.Items` ne les contient pas.
- **Solution** : Utiliser `Item.getItemFromBlock(Blocks.IRON_ORE)` ou construire directement avec le block : `new ItemStack(Blocks.GLASS)`. Pour AutoSmelt, utiliser `FurnaceRecipes.instance().getSmeltingResult()` pour les cas generaux et des mappings block→ingot pour les cas specifiques.

### FactionManager.getPlayerFactionName(UUID) n'existe pas
- **Date** : 2026-03-23
- **Systeme** : EnchantEffectHandler (Resonance)
- **Probleme** : `FactionManager.getInstance().getPlayerFactionName(UUID)` → `cannot find symbol`
- **Cause** : La methode publique de FactionManager prend un String (UUID sous forme de chaine), pas un UUID. Et le champ est `factionInfo.name`, pas `factionInfo.getName()`.
- **Solution** : `FactionManager.getInstance().getPlayerFaction(uuid.toString())` retourne un `FactionInfo`. Acceder au nom via `factionInfo.name` (champ public).

### @Shadow field 'pos' dans MixinContainerEnchantment : warning Mixin AP
- **Date** : 2026-03-23
- **Systeme** : MixinContainerEnchantment
- **Probleme** : Warning "Cannot find target for @Shadow field / Unable to locate obfuscation mapping" pour le champ `pos`.
- **Cause** : Le processeur d'annotations Mixin ne trouve pas la correspondance SRG pour `pos` dans le fichier tsrg genere (les champs de ContainerEnchantment n'y sont pas listes explicitement).
- **Solution** : Ce warning est non-fatal. Le build reussit et le Shadow fonctionne a l'execution car le champ est deja deobfusque en `pos` dans l'environnement stable_39. Ne pas tenter de corriger ce warning.

---

## Detecteur de Mouvement (GUI)

### NPE spam dans les logs — EriScheduler.repeat task de DetectorGuiHandler
- **Date** : 2026-03-28
- **Systeme** : DetectorGuiHandler / EriScheduler
- **Probleme** : `java.util.concurrent.ExecutionException: java.lang.NullPointerException` repete des dizaines de fois dans les logs serveur quand un joueur ouvre le GUI du detecteur.
- **Cause** : La lambda du `EriScheduler.repeat(10, ...)` dans `handleOpen()` accedait a `player.world.getTileEntity(pos)` sans verifier que `player.world` n'etait pas null. Quand le joueur se deconnecte (crash client, timeout), `player.world` devient null mais le task continue de tourner. De plus, `stopSession(player)` etait appele depuis l'interieur de la lambda, ce qui tentait de retirer le task de `activeSessions` pendant qu'il s'executait.
- **Solution** : (1) Verifier `player.connection == null` EN PREMIER (avant `isEntityAlive()` et `world`), puis `player.world == null`. (2) Ne plus appeler `stopSession()` depuis la lambda — utiliser un pattern `taskRef[0].cancel()` + `activeSessions.remove(key)` directement pour eviter des problemes de concurrence.

### RF ne s'update pas en live dans le GUI
- **Date** : 2026-03-28
- **Systeme** : DetectorGuiHandler / GuiDetector
- **Probleme** : L'energie RF affichee dans le GUI du detecteur ne se mettait pas a jour en temps reel. Il fallait fermer et rouvrir le GUI.
- **Cause** : Consequence directe du bug NPE ci-dessus. Le task de sync periodique crashait immediatement apres la premiere execution (ou n'arrivait jamais a s'executer correctement), donc les donnees n'etaient jamais poussees au client apres l'envoi initial.
- **Solution** : Meme fix que le NPE — une fois le task stabilise avec les null checks, les donnees sont poussees toutes les 0.5s via `sendDetectorData()` et le GUI les recoit via `IGuiDataReceiver.onDataUpdate()`.

### Bouton "Test Webhook" ne faisait rien (premier fix — architecture)
- **Date** : 2026-03-28
- **Systeme** : GuiDetector
- **Probleme** : Cliquer sur le bouton "Tester" du webhook Discord ne produisait aucun effet visible (pas de message Discord, pas de feedback).
- **Cause** : `onTestWebhook()` tentait d'executer l'appel HTTP Discord COTE CLIENT. Il accedait a `TileDetector.getWebhookUrlEncrypted()` depuis le TileEntity client-side, puis appelait `DiscordWebhookSender.decryptUrl()` et `sendDetectionAlert()` dans un `new Thread`. Problemes multiples : (1) le TileEntity client n'a pas forcement les memes donnees encryptees, (2) faire un appel HTTP depuis le client est un probleme de securite (expose l'URL webhook), (3) le thread brut ne gerait pas les erreurs.
- **Solution** : Le bouton envoie desormais une action `test_webhook` au serveur via `GuiNetworkHandler.sendAction()`. Le serveur (`DetectorGuiHandler.handleTestWebhook()`) recupere l'URL depuis le TileEntity server-side, la dechiffre, et envoie le test Discord via `EriScheduler.async()`. Si le champ webhook est vide et qu'aucun webhook n'est configure, une notification EriAPI (`NotificationManager.warning()`) informe le joueur. Une notification info confirme l'envoi du test.

### Bouton "Test Webhook" et alertes detection Discord toujours muets (second fix — EriScheduler.async)
- **Date** : 2026-03-28
- **Systeme** : DetectorGuiHandler.handleTestWebhook / TileDetector.performScan
- **Probleme** : Malgre le fix precedent (architecture client->serveur), le bouton Test Webhook et la detection de joueurs ennemis n'envoyaient toujours aucun message Discord.
- **Cause** : `EriScheduler.async(Callable)` retourne un `AsyncExecutor<T>` mais la methode `execute()` interne n'est appelee que lorsqu'on chaine `.thenSync(callback)`. Sans `.thenSync()`, le Callable est stocke dans l'objet mais jamais soumis au thread pool. Le code appelait `EriScheduler.async(callable)` sans chainer `.thenSync()`, donc la tache HTTP n'etait JAMAIS executee.
- **Solution** : Ajouter `.thenSync(ignored -> {})` apres chaque `EriScheduler.async()` dans `TileDetector.performScan()` (ligne 116) et `DetectorGuiHandler.handleTestWebhook()` (ligne 211). Le callback vide suffit a declencher `execute()` qui soumet le Callable au pool de threads.
- **Regle** : TOUJOURS chainer `.thenSync()` apres `EriScheduler.async()`, meme si le callback est vide. Sans ca, la tache asynchrone n'est jamais executee.

---

## Reseau — Channel name trop long (crash client)

### `SPacketCustomPayload` — channel name > 20 chars crashe le client
- **Date** : 2026-03-28
- **Systeme** : BannerNetwork
- **Probleme** : Le client crashait IMMEDIATEMENT apres la connexion au serveur avec `DecoderException: The received string length is longer than maximum allowed (21 > 20)`. Suivi d'une cascade de `Packet X was larger than I expected, found XXXXXX bytes extra` qui desynchronise completement le stream reseau.
- **Cause** : `BannerNetwork.java` enregistrait le channel avec `EriniumFaction.MODID + "_banner"` = `"eriniumfaction_banner"` = **21 caracteres**. La limite de `SPacketCustomPayload.readString()` en Forge 1.12.2 est strictement **20 caracteres**. N'importe quel channel name > 20 chars provoque ce crash immediat.
- **Solution** : Renommer le channel en `"ef_banner"` (9 chars). REGLE : toujours compter les caracteres des channel names avant d'utiliser `MODID + "_suffix"`. `"eriniumfaction"` = 14 chars, donc tout suffix > 6 chars depasse la limite.

---

## Anti Use Bug — NoClassDefFoundError au logout

### `NoClassDefFoundError: ContainerClickValidator` lors du logout d'un joueur
- **Date** : 2026-03-28
- **Systeme** : UseBugManager / NBTValidatorEvents / ContainerClickValidator
- **Probleme** : Crash `NoClassDefFoundError: ContainerClickValidator` quand un joueur se deconnecte.
- **Cause** : `NBTValidatorEvents` est enregistre avec `@Mod.EventBusSubscriber` sans restriction de Side. `PlayerLoggedOutEvent` fire donc aussi cote client. `UseBugManager.onPlayerLogout()` tente d'acceder a `ContainerClickValidator.getInstance()` cote client, ce qui peut echouer si la classe n'a pas ete initialisee correctement dans ce contexte.
- **Solution** : (1) Ajouter `if (event.player.world.isRemote) return;` dans les 3 handlers de `NBTValidatorEvents` (onItemPickup, onPlayerLogin, onPlayerLogout) pour ne jamais executer la logique anti-usebug cote client. (2) Entourer l'appel `ContainerClickValidator.getInstance().removePlayer()` dans `UseBugManager.onPlayerLogout()` d'un try-catch defensif.
- **Regle** : Les event handlers de securite serveur doivent TOUJOURS verifier `world.isRemote` avant d'executer leur logique.

---

## Faction — Joueur avec faction supprimee

### Joueur rejoint avec une faction qui n'existe plus → GUI faction broken
- **Date** : 2026-03-28
- **Systeme** : FactionLifecycleHandler / FactionPlayerData
- **Probleme** : Quand un joueur se reconnecte apres que sa faction a ete dissoute, ses donnees `FactionPlayerData` contiennent toujours l'ancien `factionId`. Le GUI faction affiche des donnees vides/broken car `FactionManager.getFaction(factionId)` retourne null.
- **Cause** : Aucune verification de coherence des donnees faction au login. Le `factionId` persiste dans les donnees joueur meme si la faction n'existe plus.
- **Solution** : Dans `FactionLifecycleHandler.onPlayerLoggedIn()`, verifier si `playerData.factionId` est non-vide et si `FactionManager.getFaction(factionId)` retourne null. Si oui, reset tous les champs faction du joueur : `factionId=""`, `factionRole=""`, `factionName=""`, `rankPrefix=""`, `rankColor="&7"`, `rankPriority=0`, `factionBanner=""`, `joinedFactionTime=0`, `chatMode="DEFAULT"`.

---

## Faction Protection — NPE cote client (crash fatal)

### `FactionProtectionHandler` crashe cote client avec NullPointerException sur `getWorldData()`
- **Date** : 2026-03-28
- **Systeme** : FactionProtectionHandler / FactionManager
- **Probleme** : Crash fatal `NullPointerException` dans `FactionManager.getWorldData()` appele depuis `FactionProtectionHandler.isAllowed()` lors d'un `RightClickBlock` cote client. Le crash provoque la deconnexion.
- **Cause** : `FactionProtectionHandler` est un `@Mod.EventBusSubscriber` sans restriction de Side. `PlayerInteractEvent.RightClickBlock` fire aussi cote client. `FactionManager.getWorld()` est null cote client car `FactionManager.init(world)` n'est appele que cote serveur (`FMLServerStartingEvent`). L'appel a `DataManager.getWorld(null, ...)` provoque la NPE.
- **Solution** : Ajouter `if (player.world.isRemote) return true;` au debut de `isAllowed()` pour court-circuiter toute la logique de protection cote client.
- **Regle** : Les event handlers qui accedent a `FactionManager` ou `DataManager.getWorld()` doivent TOUJOURS verifier `world.isRemote` car ces systemes ne sont initialises que cote serveur.

---

## Modeles — Dependance circulaire bow_pulling

### Les modeles `*_bow_pulling_X.json` creent une dependance circulaire avec `item/bow_pulling_X`
- **Date** : 2026-03-28
- **Systeme** : Modeles JSON des arcs (aetherite_bow, erinium_bow, valterite_bow)
- **Probleme** : Erreur `ModelLoaderRegistry$LoaderException: circular model dependencies, stack: [eriniumfaction:item/aetherite_bow_pulling_2, minecraft:item/bow_pulling_2]` au chargement des modeles.
- **Cause** : Les modeles `*_bow_pulling_X.json` utilisaient `"parent": "item/bow_pulling_X"`. Or `item/bow_pulling_X` est un alias/variant de `item/bow`, et `item/bow` contient des overrides qui referent aux modeles custom via les predicate overrides du parent bow — cela cree un cycle.
- **Solution** : Remplacer `"parent": "item/bow_pulling_X"` par `"parent": "item/generated"` dans les 9 fichiers pulling (3 arcs x 3 etats pulling). Les modeles pulling n'ont besoin que d'afficher une texture plate, `item/generated` suffit.

---

## Detecteur de mouvement

### `EriScheduler.async()` ne s'execute pas de maniere fiable pour les webhooks Discord
- **Date** : 2026-03-28
- **Systeme** : TileDetector / DetectorGuiHandler (webhook Discord)
- **Probleme** : Les webhooks Discord ne s'envoyaient jamais. `EriScheduler.async(Callable).thenSync(ignored -> {})` ne declenchait pas l'execution de la Callable.
- **Cause** : `EriScheduler.async()` retourne un objet qui necessite un `thenSync` pour declencher l'execution, mais le mecanisme interne ne garantit pas l'execution si le callback `thenSync` est un no-op ou si le scheduler est occupe.
- **Solution** : Remplacer `EriScheduler.async(...)` par un `Thread` daemon pour les operations I/O fire-and-forget (webhooks, HTTP calls). Le thread daemon ne bloque pas l'arret du serveur et s'execute immediatement.

### `performScan()` bloque si `ownerFactionUuid == null`
- **Date** : 2026-03-28
- **Systeme** : TileDetector
- **Probleme** : Si le detecteur est pose par un joueur sans faction, `performScan()` retourne immediatement (`if (ownerFactionUuid == null) return;`). Aucune detection ne se produit.
- **Cause** : Le check ne prenait pas en compte le cas ou le joueur n'a pas de faction mais est quand meme le proprietaire du detecteur.
- **Solution** : Si `ownerFactionUuid == null` mais `ownerPlayerUuid != null`, le scan continue en traitant tous les joueurs sauf le proprietaire comme des ennemis. Le skip des membres de faction ne s'applique que si `ownerFactionUuid` est non-null.

### `ownerFactionUuid` jamais mis a jour apres pose du detecteur
- **Date** : 2026-03-28
- **Systeme** : DetectorGuiHandler / TileDetector
- **Probleme** : Si un joueur pose un detecteur avant de rejoindre une faction, `ownerFactionUuid` reste null indefiniment. Meme apres avoir rejoint une faction, le detecteur ne detecte rien.
- **Cause** : `ownerFactionUuid` n'etait defini qu'a la pose du bloc et jamais mis a jour ensuite.
- **Solution** : Dans `DetectorGuiHandler.handleOpen()`, verifier si `ownerFactionUuid` ou `ownerPlayerUuid` sont null. Si oui et que le joueur a une faction, mettre a jour les champs et appeler `markDirty()`.

---

## Tourelles (EntityTurret)

### Les 3 tiers de tourelle ont la meme texture cote client
- **Date** : 2026-03-28
- **Systeme** : EntityTurret / RenderTurret
- **Probleme** : Toutes les tourelles affichaient la texture Valterite, quel que soit le tier reel.
- **Cause** : Le champ `tier` dans `EntityTurret` est un champ Java local. En Forge 1.12.2, les champs locaux d'une Entity ne sont PAS synchronises automatiquement au client. Le renderer appelait `getTier()` cote client mais obtenait toujours la valeur par defaut (VALTERITE).
- **Solution** : Ajouter un `DataParameter<Integer> TIER_INDEX` via `EntityDataManager.createKey()`. Enregistrer dans `entityInit()`, mettre a jour dans `setTier()` et `readEntityFromNBT()`. Dans `getTier()`, lire depuis le datamanager si `world.isRemote`.

### Le pickup de tourelle donne 2 items
- **Date** : 2026-03-28
- **Systeme** : EntityTurret.processInteract
- **Probleme** : Shift+clic droit sur une tourelle donnait 2 items turret placer au joueur.
- **Cause** : `processInteract()` est appele deux fois par Forge — une fois pour `EnumHand.MAIN_HAND` et une fois pour `EnumHand.OFF_HAND`. Les deux appels passaient le check et executaient la logique de pickup.
- **Solution** : Ajouter `if (hand != EnumHand.MAIN_HAND) return false;` au debut de `processInteract()`. Ceci est un pattern standard pour les interactions entity en Forge 1.12.2.

---

## Anti-Cheat

### Speed check : faux positifs kick des joueurs legitimes
- **Date** : 2026-03-28
- **Systeme** : CheckMovement / AntiCheatConfig
- **Probleme** : Des joueurs normaux (marche, sprint) se faisaient kick par le speed check. Les seuils `expected` etaient trop bas (0.2652 pour marche, 0.3448 pour sprint) et ne prenaient pas en compte les attributs custom, la glace, le knockback, le lag reseau.
- **Causes multiples** :
  1. `computeMaxSpeed()` utilisait une constante fixe `WALK_SPEED=0.221` au lieu de lire le vrai attribut `MOVEMENT_SPEED` du joueur. Les bonus de vitesse des armures (set bonus), amulettes, gemmes et stats RPG n'etaient pas pris en compte.
  2. Tolerance trop serree : `speedTolerance=1.20` (seulement 20% de marge) ne suffit pas pour absorber le jitter reseau et les variations tick-to-tick.
  3. Poids de violation trop eleve (`speedViolationWeight=3`) combine a un seuil de kick trop bas (`kickThreshold=10`) = kick en 4 infractions.
  4. Decay trop lent (`decayIntervalTicks=600` = 30 sec par point) = les points s'accumulent sans avoir le temps de baisser.
  5. Aucune grace period apres knockback, aucune detection de glace (ice/packed ice/frosted ice), aucune exemption eau/lave/elytra.
- **Solutions appliquees** :
  1. `computeMaxSpeed()` lit maintenant `SharedMonsterAttributes.MOVEMENT_SPEED` reel du joueur (inclut tous les modifiers custom). Calcul : `attrValue * 2.159` (marche) ou `attrValue * 2.806` (sprint).
  2. Tolerance augmentee a `1.50` (50% de marge).
  3. Poids Speed reduit a `2`, seuil de kick augmente a `20`.
  4. Decay accelere a `200` ticks (10 sec par point).
  5. Grace period apres knockback via `LivingKnockBackEvent`. Detection glace sous les pieds (multiplicateur x2.5). Skip du speed check en eau/lave et en elytra.

---

## Faction Alliance System

### /f ally etait instantane — pas de double opt-in
- **Date** : 2026-03-28
- **Systeme** : FactionManager / FactionCommand / CommonProxy (alliance relations)
- **Probleme** : `/f ally FactionName` mettait immediatement la relation en ALLY sans que l'autre faction accepte. `relationKey()` utilisait une cle canonique triee (`id1:id2`), donc une seule entree par paire — impossible de stocker des declarations unilaterales.
- **Cause** : Architecture initiale avec cles symetriques. `setRelation(A, B, ALLY)` ecrasait la valeur unique partagee.
- **Solution** : Migration vers des cles directionnelles (`from>to`). `setRelation(A, B, ALLY)` stocke uniquement `A>B = ALLY`. `getRelation(A, B)` calcule la relation EFFECTIVE : ALLY seulement si les DEUX directions sont ALLY, ENEMY si l'une des deux est ENEMY. Migration automatique des anciennes cles au demarrage (`migrateRelationKeys()`). Ajout de `getDeclaredRelation()`, `removeDeclaredRelation()`, `getPendingAllyRequests()`.

### Boutons Neutre/Ennemi remplissaient tout l'item de la ScrollList
- **Date** : 2026-03-28
- **Systeme** : GuiFactionRelations / FactionPageRelations (FactionRow buttons)
- **Probleme** : Dans la page Relations, les boutons d'action (Neutre, Ennemi, Allie) prenaient toute la hauteur de chaque item dans la ScrollList, au lieu d'etre des petits boutons a droite.
- **Cause** : `int btnH = height - FactionGuiTheme.PAD_MD * 2` utilisait la hauteur du row directement. Contrairement a la page Membres qui utilise `ScaleManager.scaleH(36)` pour des tailles fixes en pixels design.
- **Solution** : Utiliser `ScaleManager.scaleW(100)` et `ScaleManager.scaleH(28)` pour des boutons de taille fixe en design pixels, centres verticalement avec `y + (height - btnH) / 2`. Meme pattern que MemberRow dans FactionPageMembers.

### Noms d'actions GUI client/serveur desynchronises (acceptAlliance vs allianceAccept)
- **Date** : 2026-03-28
- **Systeme** : GuiFactionRelations (client) / CommonProxy (serveur)
- **Probleme** : Le client envoyait `"acceptAlliance"` et `"refuseAlliance"` mais le serveur traitait `"allianceAccept"` et `"allianceDeny"`. Les boutons Accepter/Refuser dans la section invitations ne faisaient rien.
- **Cause** : Noms d'actions inconsistants entre le client et le serveur.
- **Solution** : Aligner le serveur sur les noms du client : `"acceptAlliance"` et `"refuseAlliance"` dans le switch du `handleGuiAction()`.

### Speed check : reecriture complete — approche fenetree (windowed) au lieu de tick-par-tick
- **Date** : 2026-03-28
- **Systeme** : CheckMovement / AntiCheatConfig
- **Probleme** : Malgre le fix precedent (lecture attribut reel, tolerance 1.50), les faux positifs de speed check persistaient. Les joueurs legitimes se faisaient toujours kick. Les logs montraient des ratios de 1.03x a 3.76x meme en mouvement normal.
- **Cause racine** : L'architecture tick-par-tick est fondamentalement incompatible avec le modele reseau de Minecraft. Les packets de position arrivent en rafale (2-3 ticks de mouvement compresses en 1 packet lors de lag reseau). Un joueur qui se deplace normalement a 0.28 b/t pendant 3 ticks peut envoyer 0.84 blocks en un seul packet — ratio 3x au-dessus du seuil tick. Aucune tolerance ne peut compenser ce phenomene sans aussi laisser passer les vrais cheaters.
- **Solutions appliquees** :
  1. **Architecture fenetree** : au lieu de comparer tick-par-tick, un buffer circulaire de 40 positions est maintenu. Toutes les 20 ticks (1 seconde), la distance TOTALE parcourue sur la fenetre est calculee (somme des segments consecutifs, pas distance debut-fin). Cette distance totale est comparee a `maxSpeed * ticksElapsed * tolerance`.
  2. **Tolerance augmentee a 2.0** (100% de marge) pour absorber le lag reseau, les accelerations transitoires (jump boost, sprint start, etc.)
  3. **Points de vitesse separes** : le speed check utilise son propre compteur de violation (pas le ViolationTracker global) avec un seuil de kick a 8 points. Chaque fenetre qui depasse = +1 point. Decay = -1 point toutes les 200 ticks.
  4. **Vitesse de sprint utilisee par defaut** : `computeMaxSpeedPerTick()` utilise toujours le multiplicateur sprint (2.806) meme si le joueur ne sprinte pas au moment du check, car il a pu sprinter pendant une partie de la fenetre.
  5. **Multiplicateur glace augmente a 3.0** (etait 2.5).
  6. **Grace period unifiee a 40 ticks** pour tous les events (knockback, teleport, ender pearl, respawn, dimension change).
  7. **Nouveaux events geres** : `EntityTravelToDimensionEvent`, `EnderTeleportEvent`, `PlayerEvent.PlayerRespawnEvent` declenchent une grace period + reset du buffer de positions.
  8. **Skip echelle/vigne** : le speed check est ignore si `player.isOnLadder()`.
  9. **Reset du buffer apres chaque fenetre** : les positions pre-fenetre ne contaminent pas la fenetre suivante.
- **Regle** : Ne JAMAIS comparer la vitesse tick-par-tick dans un anticheat Minecraft. Toujours utiliser une fenetre glissante (20+ ticks) pour absorber le jitter reseau.

---

## Systeme de Reconnaissance

### EriAPI `ListItem` : constructeur 2 params (id, displayName), pas 1 param (text)
- **Date** : 2026-03-30
- **Systeme** : GuiReport / ClusterListItem
- **Probleme** : `super("text")` sur `ListItem` → `constructor ListItem cannot be applied: required String,String found String`.
- **Cause** : `ListItem(String id, String displayName)` prend 2 parametres. L'id est un identifiant unique interne, le displayName est le texte affiche.
- **Solution** : Utiliser `super("cluster_1", "Texte affiche")` avec un id unique et le texte en displayName.

### EriAPI `ListItem.render` : signature `(int, int, int, int, int, int, float)` — le 7e param est `float partialTicks`, pas `boolean hovered`
- **Date** : 2026-03-30
- **Systeme** : GuiReport / ClusterListItem
- **Probleme** : `render(int, int, int, int, int, int, boolean)` → `does not override abstract method`. La classe est abstraite et exige l'implementation de `render(int x, int y, int width, int height, int mouseX, int mouseY, float partialTicks)`.
- **Cause** : Le 7e parametre est `float partialTicks` (pour les animations), pas `boolean hovered`.
- **Solution** : Override avec la signature correcte `render(int x, int y, int width, int height, int mouseX, int mouseY, float partialTicks)`.

### ScanTask ignore `scanDurationTicks` — scan termine instantanement
- **Date** : 2026-03-30
- **Systeme** : ScanTask / Finder Station
- **Probleme** : Le scan finit des que tous les chunks sont traites (quelques secondes), ignorant le `scanDurationTicks` du tier (600/1800/6000 ticks). Un scan Erinium cense durer 5 minutes se terminait en ~3 secondes.
- **Cause** : `finalizeScan()` etait appele immediatement apres `allChunksProcessed && pendingAsyncReads <= 0`, sans aucune verification du temps ecoule.
- **Solution** : Stocker `startTick = world.getTotalWorldTime()` au lancement. Apres traitement des chunks, entrer en etat `waitingForDuration` et verifier a chaque tick que `world.getTotalWorldTime() - startTick >= tier.getScanDurationTicks()` avant de finaliser.

### Modeles bloc Finder Station pointent vers textures decoy_station
- **Date** : 2026-03-30
- **Systeme** : Block models JSON / Finder Station
- **Probleme** : Les 6 modeles JSON (3 tiers x 2 etats scanning) referençaient tous `decoy_station_front/top/side`. Aucune distinction visuelle entre les tiers.
- **Solution** : Creer des textures dediees `finder_station_front_{tier}.png`, `finder_station_front_{tier}_scanning.png`, `finder_station_top.png`, `finder_station_side.png`, `finder_station_bottom.png`. Mettre a jour chaque modele JSON pour pointer vers la bonne texture front par tier.

### Bloc Finder Station lance le scan directement au clic droit — pas de GUI
- **Date** : 2026-03-30
- **Systeme** : BlockFinderStation / GuiFinderStation
- **Probleme** : Le clic droit sur le bloc lancait directement le scan sans interface, rendant la durabilite invisible et l'experience utilisateur opaque.
- **Solution** : Creer `GuiFinderStation extends EriGuiScreen implements IGuiDataReceiver`. Le clic droit ouvre le GUI via `GuiNetworkHandler.openGuiFor()` avec les donnees du TileEntity (tier, durabilite, etat scan). Le bouton "Lancer le scan" envoie une action `start_scan` au serveur via `GuiNetworkHandler.sendAction()`. Le handler serveur valide la position, la distance, et l'etat avant de demarrer le scan.

### TileCave tick en continu meme quand inactif
- **Date** : 2026-03-30
- **Systeme** : TileCave (Cave Vision Block)
- **Probleme** : `update()` executait la logique de compteur et de scan meme quand `active == false` et `rescanRequested == false`, gaspillant des cycles CPU sur chaque TileCave du monde.
- **Solution** : Ajouter `if (!active && !rescanRequested) return;` en debut de `update()`. Le tick ne reprend que quand `forceRescan()` est appele (set `rescanRequested = true`) ou quand le bloc est encore actif.

---

## Base Reconnaissance — Corrections critiques (2026-03-30)

### FinderStation ne rendait pas le modele Blockbench 3D
- **Date** : 2026-03-30
- **Systeme** : BlockFinderStation / TileFinderStationRenderer
- **Probleme** : Le bloc utilisait des block models JSON basiques au lieu du modele Blockbench 173 elements avec textures 256x256.
- **Cause** : Le modele Blockbench utilise du per-face UV mapping incompatible avec ModelBox (qui genere des UVs automatiques). Un block model JSON standard ne peut pas representer ce modele.
- **Solution** : Creer un TESR (`TileFinderStationRenderer`) qui charge les donnees du modele depuis des fichiers binaires (.bin) et compile des display lists OpenGL. Le bloc retourne `EnumBlockRenderType.ENTITYBLOCK_ANIMATED` pour deleguer le rendu au TESR. Deux passes de rendu : texture de base + overlay de tier. Les fichiers .bin contiennent les quads avec positions, UVs et normales en float32 little-endian. Le blockstate pointe vers un modele vide, les item models utilisent `item/generated` avec la texture front du tier.

### Handheld Scanner ne fonctionnait pas (off-hand desactive en production)
- **Date** : 2026-03-30
- **Systeme** : HandheldScannerHandler / ScannerOverlay
- **Probleme** : Le scanner etait code pour fonctionner en off-hand, mais l'off-hand sera desactive en production. De plus, le scanner scannait les TileEntities en temps reel (couteux en performance sur 500-1000 joueurs).
- **Solution** : Le scanner fonctionne maintenant en main hand. Au lieu de scanner les TEs en live, il lit les coordonnees cible depuis le NBT de l'item (definies par le clic dans GuiReport). Le serveur envoie l'angle et la distance au client via packet. Quand le joueur arrive a moins de 5 blocs, la boussole tourne pour signaler l'arrivee.

### GuiReport envoyait un /tp au lieu de sauvegarder les coords
- **Date** : 2026-03-30
- **Systeme** : GuiReport
- **Probleme** : Le clic sur un cluster envoyait un message "/tp X Y Z" dans le chat, ce qui n'est ni utile ni securise.
- **Solution** : Le clic envoie une action `set_coords` au serveur via `GuiNetworkHandler.sendAction("report", ...)`. Le serveur cherche un Handheld Scanner dans l'inventaire du joueur et ecrit les coordonnees cible dans le NBT de l'item. Si pas de scanner, envoie un message d'erreur. Un toast de confirmation s'affiche cote client.

### Cave Block opaque — on ne voyait pas a travers
- **Date** : 2026-03-30
- **Systeme** : BlockCave
- **Probleme** : Le bloc etait cense etre transparent mais on ne voyait pas a travers.
- **Cause** : `isFullCube()` retournait `true` et `shouldSideBeRendered()` n'etait pas override. La texture PNG avait un fond opaque (converti depuis SVG avec fond colore).
- **Solution** : `isFullCube()` retourne `false`. `shouldSideBeRendered()` est override pour ne pas cull les faces entre cave blocks adjacents (comme le verre). La texture PNG a ete reconvertie depuis le SVG avec `-background none` pour un canal alpha correct.

### OverlayToast.Type n'existe pas — c'est OverlayToast.ToastType
- **Date** : 2026-03-30
- **Systeme** : GuiReport / EriAPI OverlayToast
- **Probleme** : Build failed avec `cannot find symbol: OverlayToast.Type.SUCCESS`.
- **Cause** : L'enum dans EriAPI s'appelle `OverlayToast.ToastType`, pas `OverlayToast.Type`.
- **Solution** : Utiliser `OverlayToast.ToastType.SUCCESS` (et non `OverlayToast.Type.SUCCESS`).

### Cave Block 100% invisible avec CUTOUT render layer + texture ultra-faible opacite
- **Date** : 2026-03-30
- **Systeme** : BlockCave / cave_block.svg / cave_block.png
- **Probleme** : Le cave block etait completement invisible — aucun pixel rendu a l'ecran. Le bloc devait se comporter comme du verre teinte (visible + voir a travers).
- **Cause** : `getRenderLayer()` retournait `BlockRenderLayer.CUTOUT`. CUTOUT traite chaque pixel comme 100% opaque ou 100% invisible (seuil alpha). La texture SVG avait toutes les opacites tres faibles (fond 0.08, bordures 0.4, reflets 0.08-0.12) — apres conversion en PNG 64x64, CUTOUT les traitait comme transparents = rien de visible.
- **Solution** :
  1. Changer `getRenderLayer()` pour retourner `BlockRenderLayer.TRANSLUCENT` (comme le verre teinte vanilla).
  2. Augmenter les opacites dans le SVG : fond 0.08→0.20, bordures 0.4→0.8, reflets 0.08-0.12→0.35, coins scan 0.25→0.6.
  3. Reconvertir le SVG en PNG avec `magick -density 400 -background none`.
- **Regle** : Pour les blocs translucides (verre, glace, liquides), toujours utiliser `TRANSLUCENT`. CUTOUT n'est adapte qu'aux textures avec des pixels 100% opaques ou 100% transparents (feuilles, fleurs, torches).

### Texte de distance du scanner saccade (mise a jour toutes les 2 secondes)
- **Date** : 2026-03-30
- **Systeme** : HandheldScannerHandler / ScannerOverlay
- **Probleme** : Le texte de distance ("~142m") ne se mettait a jour que quand le serveur envoyait un packet (toutes les 40 ticks = 2s). L'affichage etait saccade.
- **Cause** : L'intervalle d'envoi des packets etait de 20 ticks (1s) et le client affichait directement la valeur recue sans interpolation.
- **Solution** :
  1. Reduire `UPDATE_INTERVAL` de 20 a 5 ticks (0.25s) dans `HandheldScannerHandler`.
  2. Ajouter une interpolation client-side dans `ScannerOverlay.onFrame()` : stocker `previousDistance` et `serverDistance`, lerp avec facteur 0.15 par frame vers `serverDistance`.
  3. Mettre a jour le texte de distance chaque frame dans `onFrame()` au lieu d'attendre un packet.

### Aiguille de boussole du scanner invisible (raw GL dans onFrame d'OverlayMod)
- **Date** : 2026-03-30
- **Systeme** : ScannerOverlay
- **Probleme** : L'aiguille de la boussole ne s'affichait jamais, malgre le code de dessin GL present dans `drawArrow()`.
- **Cause** : `OverlayMod.render()` appelle `onFrame()` AVANT d'appliquer la translation GL (pushMatrix/translate/scale) du root. Le code dans `onFrame` utilisait `getRoot().getX()/getY()` pour positionner l'aiguille, mais ces coordonnees n'etaient pas encore calculees par le root render. De plus, le raw GL (Tessellator + POSITION_COLOR) interferait avec l'etat GL du pipeline de rendu d'OverlayMod.
- **Solution** : Remplacer le raw GL par `RenderUtil.drawTriangle()` et `RenderUtil.drawFilledCircle()` d'EriAPI. Calculer la position du centre de la boussole en pixels ecran via `ScaleManager.scaleXf/Yf(designCoord) * getScale()` en utilisant `getPosXDesign()/getPosYDesign()` de l'OverlayMod. Utiliser `GlStateManager.pushMatrix/translate/rotate/popMatrix` pour la rotation de l'aiguille.
- **Regle** : Dans `onFrame()` d'un OverlayMod, ne PAS utiliser `getRoot().getX()/getY()` pour positionner du dessin custom — ces valeurs ne sont fiables qu'apres le `root.render()`. Utiliser `getPosXDesign()/getPosYDesign()` + `ScaleManager` a la place.

---

## Systeme Lootbox / Animation Blocks 3D (EriAPI)

### getWorldDirectory() retourne le dossier monde, pas la racine serveur
- **Date** : 2026-04-12
- **Systeme** : LootboxRegistry / Config loading
- **Probleme** : `event.getServer().getEntityWorld().getSaveHandler().getWorldDirectory()` retourne le dossier du monde (ex: `Erinium Faction/world/`), pas la racine du serveur. Le dossier `config/Lootboxes/` etait cherche dans `world/config/Lootboxes/` et jamais trouve.
- **Cause** : `getWorldDirectory()` est prevu pour les donnees du monde (saves). Les configs serveur sont a la racine.
- **Solution** : Utiliser `event.getServer().getFile(".")` pour obtenir la racine du serveur, comme le font RankManager et ErisManager.
- **Regle** : Pour acceder a `config/`, toujours utiliser `getServer().getFile("config")` ou `getServer().getFile(".")`, JAMAIS `getWorldDirectory()`.

### GeneratedBlock.onBlockAdded passe null comme joueur
- **Date** : 2026-04-12
- **Systeme** : EriBlock / EriAnimBlock — callback onPlace
- **Probleme** : Le callback `onPlace` d'EriBlock recevait toujours `ctx.getPlayer() == null`. Le code qui copiait le NBT de l'item vers le TileEntity ne s'executait jamais.
- **Cause** : `GeneratedBlock.onBlockAdded()` cree un `BlockActionContext(world, pos, null)` — il n'a pas acces au joueur qui a place le bloc. C'est une limitation de `Block.onBlockAdded()` vanilla.
- **Solution** : Ne PAS utiliser le callback `onPlace` d'EriBlock pour la logique dependant du joueur. Utiliser `BlockEvent.PlaceEvent` de Forge a la place — il fournit `event.getPlayer()` et `event.getItemInHand()`.
- **Regle** : Le callback `onPlace` d'EriBlock/EriAnimBlock est UNIQUEMENT pour la logique sans joueur (ex: initialiser un TileEntity avec des valeurs par defaut). Pour toute logique joueur-dependante, utiliser `BlockEvent.PlaceEvent`.

### Chemin d'animation double "animations/" dans le resource path
- **Date** : 2026-04-12
- **Systeme** : EriAnimParser / EriAnimBlock
- **Probleme** : `animation("eriniumfaction:animations/lootbox")` generait le chemin `assets/eriniumfaction/animations/animations/lootbox.erianim.json` — double prefix `animations/`.
- **Cause** : EriAnimParser ajoute automatiquement `animations/` devant le path. Le format attendu est `"domain:path"` ou `path` est relatif au dossier `animations/`.
- **Solution** : Utiliser `animation("eriniumfaction:block/lootbox")` — le parser resout vers `assets/eriniumfaction/animations/block/lootbox.erianim.json`.
- **Regle** : Le format d'animId est identique au modelId : `"modid:chemin/relatif"`. Le parser prefixe `animations/` automatiquement. Ne JAMAIS inclure `animations/` dans l'ID.

### Chemin des textures : textures/blocks/ (avec s) et non textures/block/
- **Date** : 2026-04-12
- **Systeme** : BlockbenchModelParser / Textures assets
- **Probleme** : Le bloc etait invisible. Les textures placees dans `textures/block/lootbox/` n'etaient pas trouvees.
- **Cause** : BlockbenchModelParser construit les ResourceLocations avec `textures/blocks/` (avec un **s**) : `textures/blocks/<modelBaseName>/<value>.png`. Le dossier dans les assets du mod etait `textures/block/` (sans s).
- **Solution** : Placer les textures dans `textures/blocks/` pour correspondre au parser.
- **Regle** : Les textures de blocs animes EriAPI doivent etre dans `assets/<modid>/textures/blocks/<modelBaseName>/`. Attention au **s** dans `blocks`.

### TESR non enregistre automatiquement par ContentRegistry
- **Date** : 2026-04-12
- **Systeme** : EriAnimBlock / AnimatedBlockTESR
- **Probleme** : Le bloc lootbox place etait invisible malgre le TESR-only render type. Le TESR ne rendait rien.
- **Cause** : EriAnimBlock documente "TESR: AnimatedBlockTESR (auto-bound in ContentRegistry)" mais ContentRegistry ne fait PAS le `ClientRegistry.bindTileEntitySpecialRenderer()`. Le TEISR pour l'item est configure, mais pas le TESR pour le bloc place.
- **Solution** : Enregistrer manuellement le TESR dans `ClientProxy.preInit()` : `ClientRegistry.bindTileEntitySpecialRenderer(TileLootbox.class, new AnimatedBlockTESR())`.
- **Regle** : Pour tout bloc utilisant EriAnimBlock avec un TileEntity custom, TOUJOURS ajouter le binding TESR dans ClientProxy. Le binding automatique n'existe pas (encore).

### Creative tab non affiche — classe jamais chargee
- **Date** : 2026-04-12
- **Systeme** : LootboxCreativeTab
- **Probleme** : Le creative tab "Lootbox" n'apparaissait pas dans le jeu.
- **Cause** : La classe `LootboxCreativeTab` avec son champ `static final TAB` n'etait jamais referencee par aucun code. En Java, les classes ne sont chargees que quand elles sont referencees. Le constructeur de `CreativeTabs` (qui enregistre le tab dans le tableau global) n'etait jamais execute.
- **Solution** : Ajouter une reference explicite dans EriniumBlocks : `CreativeTabs lootboxTab = LootboxCreativeTab.TAB;` pour forcer le chargement de la classe.
- **Regle** : Un creative tab avec un champ `static final` DOIT etre reference quelque part dans le code pour que la classe soit chargee. Un simple acces au champ suffit.

### Blockstate et item model manquants pour bloc TESR-only
- **Date** : 2026-04-12
- **Systeme** : Block rendering / Item rendering
- **Probleme** : L'item lootbox avait une texture rose/noir (missing model). Le block n'avait pas de blockstate.
- **Cause** : ContentRegistry enregistre le modele via `ModelLoader.setCustomModelResourceLocation` qui cherche un blockstate et un item model JSON. Meme pour un bloc TESR-only, ces fichiers doivent exister.
- **Solution** : Creer `blockstates/lootbox.json` avec `"model": "eriniumfaction:builtin/entity"` et `models/item/lootbox.json` avec `"parent": "builtin/entity"`.
- **Regle** : Tout bloc enregistre via EriBlock/EriAnimBlock a besoin d'un blockstate JSON et d'un item model JSON, meme si le rendu est entierement gere par le TESR. Utiliser `builtin/entity` comme placeholder.

### Sync reseau : packet trop gros avec toutes les textures d'un type
- **Date** : 2026-04-12
- **Systeme** : PacketLootboxSync / LootboxNetwork
- **Probleme** : Le packet de sync contenant toutes les textures d'un type (~400KB+) echouait silencieusement. Le client ne recevait rien.
- **Cause** : Toutes les textures PNG etaient envoyees dans un seul packet, depassant les limites de taille.
- **Solution** : Envoyer UN packet par texture (une texture = un packet). Chaque packet fait quelques KB, bien dans les limites.
- **Regle** : Pour les packets contenant des donnees binaires volumineuses (textures, fichiers), TOUJOURS fractionner en petits packets. Un PNG par packet.

### applyConfigTextures ecrase l'override du beam de rarete
- **Date** : 2026-04-12
- **Systeme** : TileLootbox / Texture overrides
- **Probleme** : La texture du beam ne changeait jamais selon la rarete. Elle restait toujours sur la texture par defaut.
- **Cause** : `applyConfigTextures()` etait appele dans `onDataPacket()` et incluait "beam" dans la liste des textures a overrider avec la config. Quand le serveur faisait `setTexture("beam", "basiclootbox/rarity_beam_common")`, le sync declenchait `onDataPacket` → `readFromNBT` (charge l'override) → `applyConfigTextures()` qui ecrasait "beam" avec la texture config par defaut.
- **Solution** : Retirer "beam" de la liste des textures overridees par `applyConfigTextures()`. Le beam est gere UNIQUEMENT par `handleCalculRarity()` via `setTexture()`.
- **Regle** : Les textures gerees dynamiquement par l'animation (beam de rarete) ne doivent PAS etre dans la liste des overrides statiques de `applyConfigTextures`.

### wait_server endBehavior : onAnimationComplete ne fire jamais
- **Date** : 2026-04-12
- **Systeme** : AnimatedBlockTileEntity / Animation callbacks
- **Probleme** : Le bloc ne disparaissait pas apres l'ouverture. `onAnimationComplete("Open")` n'etait jamais appele.
- **Cause** : L'animation utilise `endBehavior: "wait_server"`, ce qui signifie que l'animation freeze au dernier frame et attend que le serveur la reset manuellement. `onAnimationComplete` n'est PAS appele pour `wait_server` — il attend indefiniment.
- **Solution** : Ne PAS compter sur `onAnimationComplete` avec `wait_server`. Gerer la logique de fin dans un callback d'animation (ex: "dropitems" a tick 90) ou via EriScheduler.
- **Regle** : Avec `wait_server`, l'animation ne se termine JAMAIS d'elle-meme. Le nettoyage (suppression du bloc, etc.) doit etre fait dans un callback ou un scheduler, pas dans `onAnimationComplete`.

### Format des texture override keys : typeId/textureName
- **Date** : 2026-04-12
- **Systeme** : TileLootbox / LootboxTextureCache / TESR
- **Probleme** : `setTexture("beam", "rarity_beam_common")` ne fonctionnait pas — la texture ne changeait pas.
- **Cause** : Les textures config sont enregistrees dans le modele sous la cle `"typeId/textureName"` (ex: `"basiclootbox/rarity_beam_common"`). L'override utilisait `"rarity_beam_common"` sans le prefix du type, qui n'existait pas dans la texture map du modele.
- **Solution** : Utiliser `setTexture("beam", lootboxType + "/rarity_beam_" + tierName)` pour correspondre aux cles enregistrees par `LootboxTextureCache.registerInModel()`.
- **Regle** : Les cles de texture override pour les textures config doivent TOUJOURS utiliser le format `"typeId/textureName"` — c'est le format utilise par `registerInModel()` quand il ajoute les DynamicTextures au modele.

---

## Anti X-Ray

### Chunk.EMPTY_EXT_BLOCK_STORAGE n'existe pas en 1.12.2
- **Date** : 2026-04-14
- **Systeme** : AntiXrayEngine
- **Probleme** : Build failed avec `cannot find symbol: variable EMPTY_EXT_BLOCK_STORAGE in class Chunk`.
- **Cause** : `Chunk.EMPTY_EXT_BLOCK_STORAGE` est une constante qui n'existe pas dans Forge 1.12.2. Les sections vides sont simplement `null` dans le `ExtendedBlockStorage[]` retourne par `getBlockStorageArray()`.
- **Solution** : Verifier `storage == null` au lieu de `storage == Chunk.EMPTY_EXT_BLOCK_STORAGE`.

---

## EriAPI Entity Framework (1.4.0)

### `EntityEntryBuilder.create()` retourne `EntityEntryBuilder<Entity>`, pas un type generique libre
- **Date** : 2026-04-17
- **Systeme** : EriAPI ContentRegistry.onRegisterEntities
- **Probleme** : `EntityEntryBuilder<GeneratedEntity> b = EntityEntryBuilder.create()` → `incompatible types: EntityEntryBuilder<Entity> cannot be converted to EntityEntryBuilder<GeneratedEntity>`.
- **Cause** : La methode statique `create()` retourne `EntityEntryBuilder<Entity>`. C'est seulement l'appel `.entity(MyClass.class)` qui fait evoluer le type parametrique, via un nouveau builder typed sur la classe passee.
- **Solution** : Utiliser le builder en raw type dans les helpers (`EntityEntryBuilder builder = EntityEntryBuilder.create();`) et chainer les methodes. Sur les appels qui ont besoin du type parametrique concret (quand on veut `.spawn(...)`), accepter le raw type et utiliser `@SuppressWarnings({"unchecked", "rawtypes"})`. Ne pas essayer de contraindre le generique depuis l'exterieur.

### `Biome.REGISTRY.getValuesCollection()` n'existe pas — iterer directement
- **Date** : 2026-04-17
- **Systeme** : EriAPI ContentRegistry.applySpawner
- **Probleme** : `Biome.REGISTRY.getValuesCollection()` → `cannot find symbol: method getValuesCollection()`.
- **Cause** : `Biome.REGISTRY` est un `RegistryNamespaced<ResourceLocation, Biome>`. Cette classe n'expose pas `getValuesCollection()` en 1.12.2 stable_39.
- **Solution** : Iterer directement `for (Biome b : Biome.REGISTRY)` — `RegistryNamespaced` implemente `Iterable<V>`.

### `EntityMob` n'a pas `getStepSound()` — utiliser `playStepSound(BlockPos, Block)`
- **Date** : 2026-04-17
- **Systeme** : EriAPI GeneratedEntity
- **Probleme** : `super.getStepSound()` → `cannot find symbol: method getStepSound()`. `@Override protected SoundEvent getStepSound()` → "method does not override a supertype".
- **Cause** : En 1.12.2, `EntityLivingBase` n'a pas de `getStepSound()` protege accessible. Le son de pas est joue dans `playStepSound(BlockPos, Block)`.
- **Solution** : Override `playStepSound(BlockPos, Block)` et appeler `this.playSound(customSound, 0.15F, 1.0F)` si un son custom est defini, sinon `super.playStepSound(pos, block)`.

### `Entity#onFirstUpdate()` n'existe pas
- **Date** : 2026-04-17
- **Systeme** : EriAPI GeneratedEntity
- **Probleme** : Override de `onFirstUpdate()` → "method does not override a supertype".
- **Cause** : Cette methode n'existe pas sur `Entity`/`EntityLivingBase` en 1.12.2.
- **Solution** : Utiliser un flag `spawnCallbackFired` initialise a `false`, le mettre a `true` au premier `onLivingUpdate()` cote serveur apres avoir appele le callback. Persister le flag en NBT pour eviter de re-firer au rechargement du chunk.

### Forge 1.12.2 exige une classe Java dediee par entite registered
- **Date** : 2026-04-17
- **Systeme** : EriAPI GeneratedEntitySlots
- **Probleme** : `EntityEntryBuilder.entity(GeneratedEntity.class)` ne supporte qu'un seul mapping Class→Entity. Si plusieurs EriEntities utilisent la meme classe, Forge ne peut pas differencier au respawn NBT.
- **Cause** : Le spawn/despawn de Forge utilise la Class enregistree pour instancier via `newInstance()` avec le seul constructeur `(World)`. Toutes les entites de cette classe partagent donc la meme logique.
- **Solution** : Pool de 32 sous-classes statiques `Slot0`, `Slot1`, ..., `Slot31` qui hardcodent chacune leur slot index via `super(world, N)`. Chaque `EriEntity.register()` alloue le prochain slot libre via `GeneratedEntitySlots.allocate(def, id)`. Evite toute generation de bytecode (compatible CleanRoom). Augmenter `SLOT_COUNT` si on depasse 32 entities toutes-mods confondues.

---

## CleanRoomLoader — Méthodes FoodStats manquantes

- **Date** : 2026-04-22
- **Système** : DeathHandler (rpg/event)
- **Problème** : `player.getFoodStats().setFoodSaturationLevel(float)` lève `NoSuchMethodError: FoodStats.func_75119_b(float)` sur le serveur CleanRoomLoader. Le crash se produit à la mort du joueur, empêchant le TP spawn.
- **Cause** : CleanRoomLoader (fork Forge 1.12.2, Java 25) ne fournit pas la méthode `func_75119_b` sur `FoodStats`. La méthode existe dans le Forge standard mais est absente dans cette implémentation.
- **Solution** : Accès direct au field `foodSaturationLevel` (SRG : `field_75126_e`) via `ObfuscationReflectionHelper.setPrivateValue` avec try-catch silencieux. Ne jamais appeler `setFoodSaturationLevel` directement — utiliser la réflexion.

---

## EriniumAntiCheat — Faux positif anti-cheat bateau

- **Date** : 2026-04-22
- **Système** : CheckMovement (EriniumAntiCheat)
- **Problème** : Un joueur en bateau se faisait kick par le check Blink et le check Step. Le compteur `staleTicks` s'accumulait pendant la navigation (pas de mouvement), puis le joueur se faisait flag au premier déplacement.
- **Cause** : Les checks Blink et Step n'avaient pas de garde `player.isRiding()`.
- **Solution** : Ajout de `&& !player.isRiding()` sur les deux checks. Ajout d'un `else if (player.isRiding()) { data.staleTicks = 0; }` pour reset le compteur pendant la navigation.

---

## EriniumAntiCheat — Anti-xray génère des faux minerais dans les feuillages

- **Date** : 2026-04-22
- **Système** : AntiXrayEngine mode 2 (EriniumAntiCheat)
- **Problème** : En mode 2 (injection de faux minerais), les feuilles et troncs d'arbres entourés de blocs opaques se faisaient remplacer par des faux minerais visibles à l'explosion de TNT.
- **Cause** : Le check de remplacement (bloc opaque entouré de blocs opaques) ne distinguait pas les blocs végétaux des blocs de terrain.
- **Solution** : Ajout d'une liste `excludedBlocks` configurable (défaut : `minecraft:log,minecraft:log2,minecraft:leaves,minecraft:leaves2`). Les blocs exclus ne sont jamais remplacés par des faux minerais.

---

## EriniumAntiCheat — Anti-xray actif sur tous les mondes

- **Date** : 2026-04-22
- **Système** : AntiXrayEngine / AntiXraySetup / AntiXrayEventHandler (EriniumAntiCheat)
- **Problème** : L'anti-xray s'appliquait à l'Overworld et au Nether, causant des problèmes de performance et de comportement hors monde minage.
- **Cause** : Aucun filtre par dimension dans le système anti-xray.
- **Solution** : Ajout d'une config `allowedDimensions` (défaut : `"2"` = monde minage uniquement) et d'une méthode `isWorldAllowed(World)` vérifiée à tous les points d'entrée (chunk load, block break/place).

---

## EriniumWorld — WorldGuard /rg flag : tab completion "allow"/"deny" cassée

- **Date** : 2026-04-22
- **Système** : WorldGuardCommands (EriniumWorld)
- **Problème** : L'auto-complétion de l'argument `value` (allow/deny) ne fonctionnait pas pour la commande `/rg flag`.
- **Cause** : Utilisation de `StringArgumentType.greedyString()` pour l'argument `value`. En Forge 1.12.2 avec Brigadier, `greedyString()` consomme tout le reste de l'input, ce qui casse le calcul de `builder.getRemaining()` et empêche les suggestions de s'afficher.
- **Solution** : Remplacer `greedyString()` par `StringArgumentType.word()`. Règle générale : ne jamais utiliser `greedyString()` pour des arguments avec suggestions en Forge 1.12.2.

---

## EnchantOfferGenerator — Livres n'affichent pas les enchants vanilla

- **Date** : 2026-04-22
- **Système** : EnchantOfferGenerator (enchant/gui)
- **Problème** : Enchanter un livre dans la table d'enchantement moddée ne donnait aucun enchant vanilla (Sharpness, Protection, etc.), uniquement les enchants custom EriniumEnchantment.
- **Cause** : `Enchantment.canApplyAtEnchantingTable(Items.BOOK)` retourne `false` pour les enchants vanilla car leur `EnumEnchantmentType` (WEAPON, ARMOR, TOOL…) ne matche pas `Items.BOOK`. Le `ContainerEnchantment` vanilla contourne ça avec une logique spéciale pour les livres — notre système custom ne l'avait pas.
- **Solution** : Pour les enchants vanilla sur un livre, remplacer le check `canApplyAtEnchantingTable` par `!isTreasureEnchantment()` (même logique que vanilla). Les `EriniumEnchantment` gardent leur check normal pour respecter le `minBookshelfPower`.

---

## Block — Méthodes de collision : onEntityWalk vs onEntityCollision

- **Date** : 2026-04-22
- **Système** : Erina Phase 2 (BlockErinaAsh, BlockErinaMud, BlockCryoIce, BlockAlienLava, BlockToxicPlant, BlockToxicVine, BlockFluidPlasma)
- **Problème** : Build failed avec `method does not override or implement a method from a supertype` sur `onEntityCollidedWithBlock(World, BlockPos, IBlockState, Entity)`. 7 fichiers bloqués.
- **Cause** : En MCP stable_39 pour 1.12.2, le nom `onEntityCollidedWithBlock` n'existe PAS sur `Block`. Les bonnes mappings sont :
  - **`onEntityWalk(World world, BlockPos pos, Entity entity)`** (3 paramètres, pas d'IBlockState) — appelée quand une entité MARCHE SUR TOP d'un bloc plein. Utiliser pour sand/mud/ash/ice/lava décorative (blocs qui ont une hitbox complète sur laquelle on marche).
  - **`onEntityCollision(World world, BlockPos pos, IBlockState state, Entity entity)`** (4 paramètres AVEC IBlockState) — appelée quand une entité est DANS un bloc (collision 3D). Utiliser pour plantes/vignes/fluides (blocs traversables via `getCollisionBoundingBox → NULL_AABB` ou les fluides).
- **Solution** :
  - Blocs pleins (walk on top) → `onEntityWalk(World, BlockPos, Entity)` — ne JAMAIS importer `IBlockState` dans ces fichiers
  - Plantes/vignes/fluides (collision through) → `onEntityCollision(World, BlockPos, IBlockState, Entity)`
  - Pour les fluides étendant `BlockFluidClassic`, toujours appeler `super.onEntityCollision(...)` en premier pour préserver le comportement par défaut du fluide
- **Règle** : Avant d'override une méthode de collision sur Block, décider d'abord : l'entité marche-t-elle SUR le bloc (full cube) ou À TRAVERS (NULL_AABB collision, fluide) ? Ce choix détermine le bon override.
