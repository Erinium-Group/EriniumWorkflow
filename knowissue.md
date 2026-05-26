# EriniumFaction — Known Issues & Resolutions

> Registre des erreurs rencontrees et leurs resolutions.
> Lire ce fichier AVANT de commencer toute tache pour eviter de repeter les memes erreurs.

---

## 2026-05-26 — Erisclave P2b : limitations connues (multi-user, legacy, publié)

**Systeme** : Builder structured spec (Phase 2b Erisclave migration) — `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/` + API `POST/PATCH /api/work/v1/roadmap/specs`.

### Probleme 1 — Concurrence multi-user

Si 2 staffs editent le meme spec simultanement, le dernier qui sauvegarde ecrase l'autre. Pas de lock optimiste ni de versioning en MVP. L'autosave de 1.5s rend le risque non negligeable sur les specs partages.

**Mitigation MVP** : Communiquer en interne (Discord staff) avant d'editer un spec partage. V2 prevue avec versioning + diff visuel + resolution de conflit (champ `version` en DB + check `If-Match`).

### Probleme 2 — Specs legacy non-editables

Les 54 specs importes depuis l'app Electron Erisclave (Phase 1, import P1-T7) ont `answers IS NULL` en DB et seulement `raw_html` rempli. Le bouton "Editer" est masque sur ces specs (condition `canEdit && spec.answers !== null` dans le viewer T23). Le builder structured ne peut pas les convertir automatiquement (parsing HTML maison trop variable, l'effort depasse le ROI).

**Workaround** : Creer un nouveau spec structured pour remplacer un legacy via le bouton "+ Brouillon" sur la card du project, puis supprimer le legacy via le bouton "Supprimer ce spec" du viewer.

### Probleme 3 — Edition d'un spec publie ecrase la version live

Un spec publie (`is_draft = false`) reste editable depuis `/admin/work/specs/<slug>/edit`. Chaque autosave reecrit directement la version live (pas de branchement "draft d'une publication"). Si vous voulez tester de gros changements, depubliez d'abord via le toggle "Publier"/"Depublier" dans le header de l'editeur.

**V2 prevue** : workflow draft-of-published — clone du spec en draft sur "Edit publie", merge explicite sur "Publier". Sans ca, pas de moyen propre de tester sans impact prod.

### Lecons

- **Multi-user editing sans versioning = guaranteed data loss** : meme avec un autosave debounce, 2 sessions concurrentes finiront par s'ecraser. Le check `updated_at` cote client n'est PAS suffisant si on ecrit l'`answers` entier a chaque save (pas de merge de champs).
- **Convertir du HTML legacy en structured est un piege ROI** : si chaque spec a son propre layout HTML (Quill, exports varies), l'effort de parser depasse l'effort de re-saisir manuellement (54 specs ~= 1-2 jours de travail manuel vs. 1 semaine pour un parser fiable + tests).
- **Toggle publish ≠ branchement draft/live** : un toggle isDraft sur la meme ligne DB ne donne PAS de branche. La feature "test publishing changes" demande une vraie structure draft_of (FK self-reference ou table revisions).

---

## 2026-05-26 — EriAPI cosmetic : texture missing-texture (rose/noir) en contexte item (TEISR)

**Systeme** : `EriAPI/cosmetic` &mdash; `ArmorCosmeticTEISR` + `BlockbenchRenderer`. Bug visible sur le cosmetique de test `BARRY_MASK` d'EriniumFaction.

### Probleme
Le modele 3D Blockbench des cosmetiques d'armure s'affichait correctement (geometrie + transforms du `display` field OK) dans **tous** les contextes d'item (inventaire, hotbar, premiere/troisieme personne, sol, item frame, GUI), MAIS la texture etait remplacee par le pattern missing-texture rose/noir caracteristique. Sur le joueur via `ArmorCosmeticLayer`, la texture s'affichait correctement &mdash; le bug etait specifique au TEISR.

### Cause racine
Deux problemes cumulatifs cote rendu OpenGL :

1. **Slot de texture incorrect** : la pipeline vanilla `RenderItem.renderItem(stack, IBakedModel)` peut laisser `GL_TEXTURE1` (utilise pour le lightmap) comme unite de texture **active** lorsqu'elle delegue au `TileEntityItemStackRenderer.renderByItem`. `Minecraft.getTextureManager().bindTexture(rl)` bind la texture sur l'unite *actuellement* active. Si c'est le slot 1, le shader fragment continue d'echantillonner le slot 0 (qui contient encore l'item atlas ou n'importe quelle texture residuelle laissee par le rendu precedent), d'ou le rendu casse en rose/noir.

2. **Cache statique potentiellement perime** : le champ `BlockbenchRenderer.lastBoundTexture` court-circuite le rebind lorsque la meme ResourceLocation a deja ete liee. Mais entre deux appels (player layer puis TEISR, ou deux TEISR successifs), un autre systeme de rendu peut avoir lie une texture differente sur le slot 0 &mdash; le cache devient un mensonge et le rendu est dessine avec la mauvaise texture.

### Solution
Trois mesures cumulatives appliquees dans EriAPI 1.8.3 :

1. **`ArmorCosmeticTEISR.renderByItem`** : force `GlStateManager.setActiveTexture(OpenGlHelper.defaultTexUnit)` AVANT tout dessin, et restaure ce slot a la sortie (defensif).
2. **`BlockbenchRenderer.bindTexture`** : force `setActiveTexture(defaultTexUnit)` juste AVANT chaque `TextureManager.bindTexture()`, comme safety net peu importe le contexte d'appel.
3. **Reset du cache** : `lastBoundTexture = null` au debut de chaque methode publique de `BlockbenchRenderer` &mdash; deja en place, confirme correct pour eviter les caches perimes entre appels successifs.

### Lecons
- **Toujours `setActiveTexture(defaultTexUnit)` avant un `bindTexture()` dans un TEISR** : RenderItem ne garantit pas que `GL_TEXTURE0` est le slot actif lors de l'invocation d'un `TileEntityItemStackRenderer`. Le bug se manifeste UNIQUEMENT dans certains contextes (inventaire/main/sol/GUI) parce que le lightmap est setup differemment selon le pipeline qui appelle le TEISR.
- **Cache statique de binding texture = piege** : si plusieurs systemes de rendu (TESR, TEISR, LayerRenderer) partagent un cache de "derniere texture liee" sans coordination, un appel exterieur peut invalider silencieusement le cache. Toujours reset au debut de chaque entree publique du renderer.
- **Pourquoi le LayerRenderer joueur n'etait pas affecte** : `RenderPlayer` setup explicitement `GL_TEXTURE0` avant les layers (via `bindEntityTexture()` qui passe par `setActiveTexture(0)` implicitement dans le rendu d'entity). Le TEISR n'a pas ce setup garanti.

---

## 2026-05-25 — Web : CSS leak des specs legacy via `dangerouslySetInnerHTML` (sidebar/body casses)

**Systeme** : `EriniumFactionWeb/src/components/work/roadmap/SpecLegacyRenderer.tsx` (Phase 6 Erisclave migration — viewer roadmap read-only).

### Probleme
Apres deploiement de la Phase 6, ouvrir un spec legacy depuis `/admin/work/roadmap` (route `/admin/work/specs/<slug>`) cassait visuellement le site entier :
- Le sidebar disparaissait ou changeait de couleur.
- Le `<body>` prenait un background blanc/different.
- La typographie globale (h1, h2, p) etait remplacee par celle du spec legacy.
- Les classes Tailwind du layout admin restaient mais etaient overridees par les selecteurs globaux des specs.

### Cause racine
`SpecLegacyRenderer` injectait le HTML brut (sanitize cote serveur via `sanitizeSpecHtml()`, qui strippe scripts/iframes/event handlers mais **garde les balises `<style>`** car elles sont legitimes dans le contexte d'un spec auto-suffisant) via `dangerouslySetInnerHTML={{ __html: rawHtml }}` dans une `<div>` du DOM principal.

Les HTML legacy importes depuis `docs/specs/*.html` (et plus tot des Quill exports) contiennent des `<style>` avec des selecteurs **globaux non-scopes** :
```html
<style>
  body { font-family: ...; background: #fff; }
  :root { --color: ...; }
  h1, h2 { color: ...; }
  .container { max-width: ...; }
</style>
```
Le browser parse ces `<style>` et les applique au document entier, peu importe ou la balise est dans le DOM. Resultat : le CSS du spec ecrase celui du layout admin (sidebar, header, body bg, classes generiques comme `.container`/`.card`).

`sanitizeSpecHtml()` ne pouvait pas resoudre ca cote serveur sans reecrire tous les selecteurs CSS (rajouter `.erisclave-legacy-spec` devant chaque selecteur = parser CSS complet a embarquer, fragile).

### Solution
Remplacement de `dangerouslySetInnerHTML` par un **`<iframe srcDoc={rawHtml}>`** avec `sandbox="allow-same-origin"` :
- `srcDoc` : passe le HTML directement a l'iframe sans avoir besoin d'une URL externe — l'iframe construit son propre document isole.
- `sandbox="allow-same-origin"` (sans `allow-scripts`) : isole le DOM/CSS de l'iframe (le CSS de l'iframe ne peut PAS leak sur le parent), mais permet de lire `iframe.contentDocument` depuis le parent pour mesurer la hauteur du contenu (besoin du same-origin pour ne pas tomber sur une SecurityException).
- Hauteur dynamique : `useEffect` + listener `load` qui lit `iframe.contentDocument.documentElement.scrollHeight + 16px padding` et le pousse dans un state. Initial 800px pour eviter un flash trop court avant le load.
- Pas besoin de `allow-scripts` : les scripts ont deja ete strippes par le sanitizer cote serveur, donc le HTML embarque ne contient que du markup statique + CSS + `<style>`.

`erisclave-legacy-spec` classname (CSS scope-by-prefix tente) retire : inutile maintenant que l'iframe garantit l'isolation.

### Lecons
- **JAMAIS `dangerouslySetInnerHTML` pour du HTML user-generated/imported qui peut contenir `<style>`**. Meme apres sanitization scripts/iframes, les balises `<style>` avec selecteurs globaux (body, html, :root, h1, p, .container) leakent sur le DOM parent et cassent le site entier.
- **Pour isoler du CSS importe** : `<iframe srcDoc>` avec `sandbox="allow-same-origin"` (sans `allow-scripts`) — c'est l'equivalent web standard d'un Shadow DOM "etanche", supporte partout, sans dependance.
- **Hauteur dynamique iframe** : mesure via `contentDocument.documentElement.scrollHeight` au `load`. `allow-same-origin` est obligatoire sinon `contentDocument` est `null`. Sans `allow-scripts`, pas de risque XSS via le contenu.
- **Alternative non-retenue** : reecrire le CSS pour prefixer chaque selecteur avec `.erisclave-legacy-spec` cote serveur. Demande un parser CSS robuste (postcss), fragile sur des specs avec syntaxe edge case (`@media`, `@keyframes`, pseudo-elements). L'iframe est plus simple et bulletproof.

---

## 2026-05-25 — Web : Card roadmap trop aggressive — click ouvre direct le spec au lieu d'expand les tasks

**Systeme** : `EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx` (Phase 6 Erisclave migration — viewer roadmap read-only).

### Probleme
Sur `/admin/work/roadmap`, cliquer N'IMPORTE OU sur une card de projet ouvrait directement le spec legacy (`/admin/work/specs/<slug>`). Comportement attendu par l'utilisateur : voir d'abord la liste des taches du projet (status cochees/non cochees) en mode expand, et avoir un lien separe vers le spec pour les utilisateurs qui veulent le cahier des charges complet.

Sur mobile (taps target 44px), c'etait encore plus penible : impossible de voir la progression detaillee sans subir un chargement complet de la page spec (qui contient parfois 200+ Ko de HTML).

### Cause racine
`RoadmapCard` wrappait toute la `<article>` dans un `<Link href="/admin/work/specs/...">` quand `firstSpecSlug` etait defini. Aucun systeme d'expand des taches n'existait, alors meme que :
- Le hook `useRoadmapProject(id)` existait deja et retourne `{ project, tasks, specSlugs }`.
- L'endpoint `/api/work/v1/roadmap/projects/[id]` etait deja implemente.
- L'UX habituelle d'une roadmap publique est : "preview les taches in-place, drill-down vers le spec sur demande explicite".

### Solution
Refacto complet du composant en pattern expand :
1. **State local** : `const [expanded, setExpanded] = useState(false)`.
2. **L'`<article>` devient cliquable** : `role="button"`, `tabIndex={0}`, `aria-expanded={expanded}`, `onClick={toggle}`, `onKeyDown` qui toggle sur Enter/Space (accessibility).
3. **Lazy fetch des taches** : `useRoadmapProject(expanded ? project.id : null)`. Le hook supporte deja `id: null` via `enabled: id != null` -> aucune query reseau tant que la card n'est pas expand. Cache react-query reutilise pour les expand/collapse rapides.
4. **Liste des taches en mode expand** : `<ul>` + `<li>` avec `<input type="checkbox" disabled checked={task.status === "done"} />` + label barre si done. Etats : "Chargement des taches…" pendant fetch, "Aucune tache pour ce projet" si liste vide.
5. **Lien spec en `<Link>` separe** avec `onClick={(e) => e.stopPropagation()}` -> click sur le lien n'expand pas la card et inversement.
6. **Indicateur visuel** : caret `▶` qui rotate 90deg quand expanded (`transition-transform duration-200`).
7. **Focus ring** : `focus:ring-2 focus:ring-erisclave-pink` directement sur l'`<article>` (l'ancien wrapping `<Link>` portait le ring, on le restitue sur l'article).

### Lecons
- **Sur une grid de cards : eviter de wrap toute la card dans un `<Link>` quand l'action principale est "preview/expand"**. Pattern preferable : la card est un button (`role="button"` + `onKeyDown` Enter/Space) qui toggle un detail in-place, avec des liens secondaires (vers les details complets) en `<Link>` separe + `stopPropagation` sur leur onClick.
- **Lazy fetch via hook react-query** : passer `null` quand la donnee n'est pas necessaire et laisser le hook gerer `enabled: id != null`. Pas de prefetch agressif, pas de fetch au mount inutile. Le cache react-query (`staleTime: 30s` configure globalement) garde les taches en RAM pendant la session, donc re-expand est instantane.
- **Accessibility checklist pour un toggle pattern** : `role="button"`, `tabIndex={0}`, `aria-expanded`, `onKeyDown` (Enter + Space avec `preventDefault` sur Space pour eviter le scroll). Sinon les utilisateurs clavier ne peuvent pas expand.
- **`e.stopPropagation()` sur les Links enfants d'une card cliquable** : sinon click sur le lien declenche AUSSI le toggle parent. Pattern systematique pour toute card avec action primaire + actions secondaires.

---

## 2026-05-24 — Web : Auth + chargement DB 2 minutes au premier acces (cold-start serverless)

**Systeme** : `EriniumFactionWeb/src/lib/db/index.ts` (`initDb`) + `src/lib/providers.tsx` (react-query) + pages Work Panel.

### Probleme
A l'ouverture du Work Panel apres une periode d'inactivite (cold-start Vercel), l'authentification met **jusqu'a 2 minutes** a se faire. Une fois connecte, naviguer entre les pages (retour arriere, ouverture/fermeture de carte, etc.) est lent : chaque mount declenche un refetch des donnees, meme si elles sont encore fraiches en cache.

### Cause racine

**Cause #1 — `initDb()` blocant et non-singleton.**
La fonction `initDb()` execute **~86 requetes DDL sequentielles** (CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN, INSERT seeds…) a chaque cold-start. Sur Neon serverless avec round-trip ~50-200ms par query, cela donne **4 a 17 secondes** rien que pour init.

Pire : le flag `_initialized` etait un **boolean**, pas une Promise. Quand plusieurs requetes arrivent en parallele au cold-start (auth `/api/auth/me`, page `/api/work/v1/...`, etc.), chacune voit `_initialized = false` et **declenche sa propre initDb()** en parallele. 5 requetes simultanees = 5 x 86 DDL = 430 round-trips concurrents, certains finissant en `42P07` (relation exists) et retry.

**Cause #2 — `/api/auth/me` faisait 3 queries sequentielles.**
`findUserById` -> `isStaff` -> `getStaffRole` : chaque appel ajoutait un round-trip alors que les 3 sont independants logiquement.

**Cause #3 — react-query refetchait sur chaque mount.**
Par defaut `refetchOnMount: true`. Sur le retour arriere d'une page deja visitee, react-query refetche tout, malgre des donnees encore valides. Aucun `staleTime`/`gcTime` configures = comportement par defaut "tout est stale immediatement".

**Cause #4 — Double fetch imperatif des workspaces dans la page board.**
La page `boards/[boardId]/page.tsx` avait un `useEffect` qui faisait DEUX `fetch()` sequentiels (workspaces actifs + archives) en bypassant react-query, donc pas de cache cross-page, refetch a chaque navigation.

### Solution

**Fix #1 — Promise singleton + skip env var dans `src/lib/db/index.ts`.**
```typescript
const SKIP_INIT = process.env.DB_SKIP_INIT === "1";
let _initPromise: Promise<void> | null = null;

export async function initDb(): Promise<void> {
  if (SKIP_INIT) return;
  if (_initPromise) return _initPromise;
  _initPromise = _initDbInternal().catch((err) => {
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}
```
- Les requetes concurrentes au cold-start attendent **la meme promesse** -> init se fait **1 fois**.
- En prod, apres le 1er deploy reussi, on peut definir `DB_SKIP_INIT=1` dans Vercel pour skipper completement initDb (les tables existent deja). Cela elimine **100%** du cout d'init au cold-start.

**Fix #2 — `Promise.all` dans `src/app/api/auth/me/route.ts`.**
```typescript
const [user, staff, staffRole] = await Promise.all([
  findUserById(session.userId),
  isStaff(session.userId),
  getStaffRole(session.userId),
]);
```
3 round-trips -> 1 round-trip parallele (le plus lent gagne).

**Fix #3 — Config react-query navigation-friendly dans `src/lib/providers.tsx`.**
```typescript
defaultOptions: {
  queries: {
    staleTime: 30 * 1000,        // donnees valides 30s
    gcTime: 5 * 60 * 1000,       // cache memoire 5min apres unmount
    refetchOnMount: false,       // pas de refetch sur remount/back-nav
    refetchOnWindowFocus: false, // deja le cas
    retry: 1,                    // au lieu de 3 (evite 90s d'attente)
  },
  mutations: { retry: 0 },
},
```
Les mutations invalident explicitement, on n'a pas besoin de re-fetch a chaque mount.

**Fix #4 — Hook react-query partage dans la page board.**
Remplacement du `useEffect` + double `fetch` par `useWorkspaces(false)` + `useWorkspaces(true)` (hooks deja existants, caches via react-query). Quand l'utilisateur revient sur le board apres avoir vu la page workspaces, le cache est instantane.

### Mesures attendues
- Cold-start init : 4-17s -> **0s avec `DB_SKIP_INIT=1`**, ou stable et non-redondant sans.
- Auth `/api/auth/me` : 3 round-trips -> 1 round-trip parallele.
- Retour arriere sur une page deja visitee : refetch -> **0 query** (cache hit react-query).
- Workspaces lookup dans la page board : 2 fetch redondants -> 0 fetch (cache hit).

### Lecons
- **`initDb()` doit etre une Promise singleton sur serverless**. Un boolean ne protege pas du cold-start parallele.
- **Toujours `Promise.all` les helpers DB independants** dans une route handler. Un round-trip Neon = ~50-200ms, gagner un round-trip est tres rentable.
- **react-query defaults sont agressifs pour le refetch**. Sur une app avec navigation interne frequente, configurer `refetchOnMount: false` + `gcTime: 5min` est presque toujours souhaitable.
- **Ne JAMAIS faire de `useEffect` + `fetch` pour des donnees deja exposees par un hook react-query**. Cela bypass le cache et force des refetch a chaque mount.
- **Prevoir une option de skip d'init en prod**. Une fois les tables creees, executer 86 DDL "IF NOT EXISTS" est du gaspillage. Un flag env permet de couper net.

---

## 2026-05-24 — Web : Neon DB "operator is not unique: - unknown" sur createBoard/createBoardColumn/createCard (Phase 3)

**Systeme** : `EriniumFactionWeb/src/lib/db/index.ts` — helpers Phase 3 qui calculent un `sort_order` auto-increment.

### Probleme
`POST /api/work/v1/workspaces/[id]/boards` (et helpers analogues colonnes/cartes) renvoyait **500** avec :
```
NeonDbError: operator is not unique: - unknown
  code: '42725'
  hint: 'Could not choose a best candidate operator. You might need to add explicit type casts.'
  position: '34'
  routine: 'op_error'
```
Toute la Phase 3 (boards, colonnes, cartes) etait inutilisable en prod.

### Cause racine
Les 3 helpers utilisaient le pattern SQL :
```sql
SELECT COALESCE(MAX(sort_order), -$1) + $1 AS next FROM ...
```
ou `$1` etait `BOARD_SORT_STEP = 1024` (TS number). Le `-$1` (operateur unaire `-` applique sur un parametre `unknown`) est ambigu cote Postgres : il existe un `-` pour `int`, un pour `bigint`, un pour `numeric`, un pour `float`. Comme le driver `@neondatabase/serverless` ne type pas les parametres explicitement (mode extended query), le planner ne pouvait pas choisir et levait `42725`.

Le bug existait depuis la Phase 3.2 (createBoard, createBoardColumn) et Phase 3.3 (createCard), mais n'avait jamais ete teste en runtime sur Neon (driver moins permissif que `pg`).

### Solution
Reecriture du pattern sans literal/parametre negatif, avec cast explicite ceinture+bretelles :
```sql
SELECT COALESCE(MAX(sort_order) + $1::int, 0) AS next FROM ...
```
Semantique strictement preservee :
- Table vide (MAX=NULL) : `COALESCE(NULL + 1024, 0) = COALESCE(NULL, 0) = 0`
- Une entree (MAX=0)    : `COALESCE(0 + 1024, 0) = 1024`
- N entrees (MAX=X)     : `COALESCE(X + 1024, 0) = X + 1024`

Applique aux 3 occurrences (lignes 2601, 2760, 3020 de `src/lib/db/index.ts`).

`midSortOrder()` (Phase 3.4 — move) n'est PAS concerne : il calcule cote JS et passe une valeur numerique typee comme parametre normal, sans expression arithmetique cote SQL.

### Lecons
- **JAMAIS d'unaire `-` sur un parametre `$N`** dans une requete Neon — Postgres ne peut pas inferer le type. Si besoin d'une valeur negative, soit calculer cote JS et passer la valeur deja negative, soit utiliser `(-$N::int)` avec cast explicite.
- **Pattern d'auto-increment positionnel safe** : `COALESCE(MAX(col) + $1::int, 0)` plutot que `COALESCE(MAX(col), -$1) + $1`. Plus court, plus lisible, sans piege de typage.
- **Tester les helpers DB avec Neon avant prod** : les drivers `pg` (local) et `@neondatabase/serverless` (prod) ont des comportements differents sur les literals typeless. Ce qui marche en dev local peut casser en prod.
- **Reflexe diagnostic erreur `42725`** : chercher tout operateur (`-`, `+`, `*`, etc.) applique directement sur un parametre `$N` sans cast.

---

## 2026-05-16 v7 — WorldGen : 2 biomes rares (GLACIER, FROZEN_RIVER_DELTA) effaces par GenLayerSmooth vanilla

**Systeme** : `EriniumGenLayer` (chain) + `EriniumGenLayerProtectedSmooth` (nouveau) + `EriniumGenLayerShore`.

### Probleme
Apres les fix v3-v6, 51/53 biomes apparaissaient au scan. **2 biomes restaient INVISIBLES** :
- `GLACIER` (id=55)
- `FROZEN_RIVER_DELTA` (id=83)

Diagnostic ajoute `logStage` au pre-zoom : GLACIER=2616 cells / FROZEN=3271 cells **existent reellement** dans le chain au stade pre-zoom. Mais final scan radius=20000 sur 100M echantillons : `glacier=0 frozen=0`. Quelque chose les effaçait entre le pre-zoom et le final scan, alors que les 51 autres biomes survivaient.

Boost des weights ANY (glacier 5->14, frozen 4->12) tente plus tot : **AUCUN effet**. Le probleme n'etait pas la generation, c'etait la destruction en aval.

### Cause racine
**`net.minecraft.world.gen.layer.GenLayerSmooth` vanilla applique deux passes dans notre chain** (post-zoom-batch-2 ligne 82, post-river-mix ligne 93). Sa regle deterministe :
```
si (west == east) center = west;
si (north == south) center = north;
si (west == east ET north == south) center = (random ? west : north);
```

Resultat : un singleton isole entoure d'un biome dominant est **systematiquement** remplace. GLACIER (baseHeight=0.6 < TALL_THRESHOLD=0.7) et FROZEN_RIVER_DELTA (baseHeight=0.0) ne recevaient AUCUN halo HILLS de `EriniumGenLayerHeightSmooth` (qui ne s'active que pour baseHeight>=0.7) — contrairement a VOLCANO/ENHANCED_MESA (height=1.8) qui se reservent un halo protecteur. Sans halo, glacier et frozen apparaissaient comme singletons, et les deux passes de Smooth les eliminaient cell par cell.

SNOW_TUNDRA survivait artificiellement parce que `EriniumGenLayerShore.selectShoreBiome` le **creait** depuis cold_taiga (temp=-0.5 < 0.15 -> branche ICY). Glacier/frozen n'avaient aucune source equivalente.

### Solution v7
1. **`EriniumGenLayerProtectedSmooth.java` (nouveau)** — drop-in replacement de `GenLayerSmooth` qui maintient une whitelist de 33 biomes rares (tries en `int[]`, lookup en O(log n) via `Arrays.binarySearch`). Si le cell central est protege, il passe inchange. Sinon, logique Smooth vanilla verbatim. Lazy init des IDs via `if (!idsReady) initIds()` au top de `getInts()` (pattern v6).
2. **`EriniumGenLayer.java`** — les deux `new GenLayerSmooth(1000L, biomeLayer)` du chain biome remplaces par `new EriniumGenLayerProtectedSmooth(1000L, biomeLayer)`. Le Smooth du chain river reste vanilla (les rivieres n'ont pas besoin de protection).
3. **`EriniumGenLayerShore.selectShoreBiome`** — branche ICY (temp<0.15) repartit maintenant 60% SNOW_TUNDRA / 20% GLACIER / 20% FROZEN_RIVER_DELTA via `initChunkSeed(cellX, cellZ); nextInt(10)`. Signature changee de `(int biomeId)` a `(int biomeId, int cellX, int cellZ)` pour avoir une variete par cellule. Donne une source garantie de glacier/frozen sur les cotes ICY independamment de la distribution native.
4. **`CommandDebugLocateBiome.scanByStage`** — offsets etendus de `{-28000, -12000, 4000, 20000}` (16 patches) a `{-28000, -12000, 0, 4000, 20000}` (25 patches). L'origine etait loupee par le grid precedent, donc le diagnostic faisait des faux-negatifs sur la zone que le joueur explorait.

**Resultat** : `/debuglocatebiome (radius=20000)` apres rebuild : **53/53 biomes presents** sur 100M echantillons. Glacier et frozen apparaissent dans les nouveaux chunks explores, sans nouvelle map.

### Lecons
- **Vanilla `GenLayerSmooth` est destructeur sur les singletons** : si un biome rare ne peut pas former de cluster d'au moins 3 cellules en X ou Z, il sera erode par chaque passe Smooth. Reflexe : si un biome a un poids faible (<10) et un baseHeight qui n'active pas le halo HILLS de HeightSmooth, **prevoir une protection explicite**.
- **`HeightSmooth.TALL_THRESHOLD = 0.7` est un cliff edge** : tous les biomes a baseHeight=0.6-0.69 sont vulnerables car ils ne sont ni TALL (pas de halo) ni FLAT (pas remplaces par HILLS). Cette zone grise doit etre dans la whitelist ProtectedSmooth.
- **Shore peut etre une source ou un destructeur** : `selectShoreBiome` convertit massivement des cellules cotieres. Si un biome convoite n'apparait que dans des pools rares, ajouter une branche Shore qui le cree est plus efficace que booster son weight (qui sera de toute façon erode plus loin).
- **Pour diagnostiquer une disparition** : ajouter un `logStage` au pre-zoom ET au final scan. Si pre-zoom > 0 et final = 0, le probleme est dans le chain en aval (Shore, Smooth, RiverMix, Voronoi). Ne pas tatonner sur les weights avant d'avoir compare les deux mesures.
- **`scanByStage` doit toujours couvrir l'origine** : le grid d'offsets `{-28k, -12k, +4k, +20k}` loupait completement (0,0). Tout nouveau diagnostic spatial doit inclure (0,0) explicitement, sinon le joueur qui spawn-explore voit des faux-negatifs.

---

## 2026-05-16 v6 — WorldGen : drift d'IDs Forge entre postInit et world load (12 biomes pointant vers les mauvais biomes)

**Systeme** : `EriniumGenLayerBiome.initPools()` + `EriniumGenLayerShore.initIds()` + `EriniumGenLayerHeightSmooth.initCache()` + `EriniumGenLayerAltitudeTransition.initCache()`.

### Probleme
Apres le fix v5, 12 biomes restaient invisibles. Diagnostic ajoute (`dumpPoolDiagnostic`) qui logge pour chaque entree de pool : ID stocke vs biome resolu via `Biome.getBiomeForId(id)` au moment du scan. Resultat ahurissant :
- `HOT_FLAT id=61 -> archipelago` (devrait etre HIGH_SAVANNA)
- `HOT_FLAT id=63 -> deep_swamp` (devrait etre VOLCANIC_PLAINS)
- `HOT_MOUNT id=66 -> oasis` (devrait etre VOLCANO)
- `COOL_FLAT id=54 -> volcano` (devrait etre ANCIENT_TAIGA)
- etc — drift MASSIF sur tous les pools.

### Cause racine
`CommonProxy.postInit()` appelait `initPools()` qui faisait `Biome.getIdForBiome(biome)` pour resoudre les IDs et les bake-ait dans des `int[][]` statiques. PROBLEME : Forge 1.12.2 fait un `RegistryManager.injectSnapshot()` au chargement du monde (apres postInit, avant le world gen) qui REMAPE les IDs de biomes pour matcher les IDs sauvegardes dans level.dat OU pour reorganiser la registry. Resultat : les IDs bakes au postInit pointaient vers DES BIOMES TOTALEMENT DIFFERENTS au moment du world gen.

Le fix v5 (lazy resolution avec `Biome[][]` puis re-resolve sur premier getInts) avait empire la situation (24 missing au lieu de 12) — probablement parce qu'il droppait les entries id=-1 ce qui creait des trous dans les pools. Revert immediat.

### Solution v6 (definitive)
1. **Supprimer les 4 appels `init*()` depuis `CommonProxy.postInit()`** — laisser uniquement les guards lazy `if (!ready) init()` au top de chaque `getInts()`.
2. Le premier `getInts()` de chaque layer s'execute pendant le world gen, donc APRES `injectSnapshot`, donc avec des IDs stables.
3. Garder `dumpPoolDiagnostic()` permanent pour detection future de drifts similaires.

**Fichiers modifies** : `CommonProxy.java` (suppression des 4 calls postInit), `EriniumGenLayerBiome.java` (diagnostic permanent).

### Lecons
- En Forge 1.12.2, NE JAMAIS bake `Biome.getIdForBiome()` dans une structure statique au postInit. Les IDs ne sont stables qu'apres `injectSnapshot` (= apres world load).
- Pattern correct : caches d'IDs en lazy init via `if (!ready) init()` au top de `getInts()`, JAMAIS appele en avance.
- Pour debugger un drift d'ID : comparer `id stocke` vs `Biome.getBiomeForId(id)` au moment du scan. Si mismatch -> drift confirme.

---

## 2026-05-15 v5 — WorldGen : 12 biomes jamais emis par la couche pool (IDs -1 baked dans les pools)

**Systeme** : `EriniumGenLayerBiome.initPools()` — construction des pools `int[][] {biomeId, weight, humidityFlag}`.

### Probleme
Apres les fix v3/v4, 12 biomes restaient INVISIBLES au scan pre-zoom (1M cellules echantillonnees) :
`DENSE_FOREST`, `GIANT_BIRCH`, `ANCIENT_TAIGA`, `CHERRY_FOREST`, `AUTUMN_FOREST`, `SEQUOIA`,
`MISTY_FOREST`, `FLOWER_PRAIRIE`, `ROLLING_HILLS`, `HIGH_SAVANNA`, `WINDY_PLATEAU`,
`VOLCANIC_PLAINS`. Pattern : ce sont EXACTEMENT les 12 premiers biomes enregistres dans
`EriniumBiomes.registerBiomes()`. Tous les biomes enregistres apres etaient correctement emis.

### Cause racine
`initPools()` (anciennement) appelait `Biome.getIdForBiome(biome)` inline pendant la construction
des `int[][]`. Pour les 12 premiers biomes enregistres, cet appel pouvait retourner -1 au moment
ou les pools etaient construits (probablement timing de la registry Forge — `RegistryEvent.Register`
qui ne finalisait pas l'association registry interne pour les premiers biomes au moment de
postInit, ou collision avec des slots vanilla deprecates). Le -1 etait silencieusement bake dans
les pools, et `pickBiome` retournait -1 — masque par le guard `if (id >= 0 && id < 256)` du
counter et par les chunks frais qui ne loggent pas les ids hors range. Resultat : ces biomes ne
sortaient JAMAIS du picker, peu importe leur poids.

### Solution v5
1. **Pools source-of-truth en `Object[][]`** (entries `{Biome ref, weight, humidity}`) au lieu de
   resoudre les IDs en avance. `buildSources()` est purement lexicale et ne touche pas a la
   registry Forge.
2. **Resolution `Biome` → `int` differee** dans `initPools()` qui :
   - Logge chaque biome avec son id resolu via `dumpResolution()` (tag `[BiomeStats][initPools]`).
   - Logge un WARN explicite pour chaque id == -1.
   - **DROPPE** les entries non resolues du `int[][]` produit (au lieu de les laisser polluer le
     picker). Une entree id=-1 ne peut donc plus jamais etre selectionnee.
3. **Re-resolution paresseuse** : si au moins une entree etait non resolue lors de l'init,
   `poolsReady` reste a `false`. La premiere invocation de `getInts()` (au tout debut du worldgen,
   apres que TOUTES les phases d'init Forge sont terminees) declenche `ensureResolved()` qui rappelle
   `initPools()`. Garantit la resolution au dernier moment possible.
4. **Suppression de `id(Biome)`** : la helper a usage unique qui retournait `Biome.getIdForBiome()`
   sans verification est retiree. Toutes les resolutions passent par `safeId()` qui retourne -1 si
   le biome est null.

### Comment verifier
Au demarrage du monde, chercher dans le log :
- `[BiomeStats][initPools] HOT_FLAT -> eriniumfaction:erinium_desert id=N` pour CHAQUE biome dans
  CHAQUE pool. Aucune ligne ne doit avoir `id=-1`.
- `[BiomeStats][initPools] All biome IDs resolved successfully.` confirme que les 12 biomes
  problematiques sont bien resolus.

Si une ligne `id=-1` apparait : la registry Forge n'a toujours pas le biome au moment de
`getInts()` (improbable, mais le log le revelera).

---

## 2026-05-15 v4 — WorldGen : 23/53 biomes encore manquants apres v3 (sous-pools humidite trop fins)

**Systeme** : `EriniumGenLayerBiome.weightedPickFiltered` + instrumentation permanente dans `CommandDebugLocateBiome`.

### Probleme
Apres v3 (MOUNT-tier 8%, scan tiled, suppression pass 2), 30/53 biomes generes. 23 toujours manquants malgre des pools complets. Pattern : tous les biomes des sous-pools `(zone, tier, humidity)` faiblement peuples disparaissent.

Exemple : `POOL_COOL_FLAT` avec humidite DRY filtre 0 entree (aucune entree DRY). `total=0` → retourne `fallback = DEFAULT_COOL_FLAT = ANCIENT_TAIGA`. Resultat : toutes les cellules COOL_FLAT DRY → ANCIENT_TAIGA. Aspen_Grove, Misty_Forest, Dark_Moor ne s'emettent jamais sur ces cellules.

Idem pour : `POOL_WARM_HILLS` filtre WET (1 entree TWISTED_OAK_FOREST), `POOL_HOT_MOUNT` filtre MEDIUM/WET (0 entree → defaut VOLCANO), etc.

### Cause racine
`weightedPickFiltered` filtre strictement par humidite et retourne le DEFAULT du tier quand `total == 0` ou quand un seul biome match. Resultat : les sous-pools (zone, tier, humidity) trop fins (<3 entrees ou poids total <10) monopolisent les cellules par 1-2 biomes seulement, et tous les autres biomes du tier ne sortent jamais.

### Solution v4
1. **Fallback "sous-pool fin"** dans `weightedPickFiltered` : si `filteredCount < 3` OU `filteredTotal < 10`, abandonner le filtre humidite et tirer ponderement sur le POOL COMPLET du tier. Garantit qu'un pool avec 5+ entrees ne se reduit jamais a 1-2 picks.
2. **Instrumentation permanente** dans `CommandDebugLocateBiome` :
   - `logFullDistribution` : a chaque appel, dump complet (par count decroissant) dans `LOGGER.info("[BiomeStats] ...")` avec tag `*MISSING*` pour les biomes a count=0.
   - `scanPreZoom` : reconstruit un chain layer raccourci (Island → Climate → Humidity → Biome, sans zooms/shore/smooth) et echantillonne 1M cellules autour de (0,0). Dump dans le log avec tag `*NEVER EMITTED BY POOL LAYER*`. Permet de distinguer "biome jamais emis par le pool layer" vs "biome emis mais mange par downstream layers".

### Comment diagnostiquer la prochaine fois
1. Lancer `/debuglocatebiome 20000`
2. Ouvrir `logs/latest.log`
3. Grep `[BiomeStats]`
4. Pour chaque biome a 0% dans le scan principal, regarder son count dans le pre-zoom :
   - count=0 en pre-zoom : bug dans le pool layer (humidite/poids/zone), corriger `EriniumGenLayerBiome.initPools`
   - count>0 en pre-zoom mais 0 en scan principal : downstream layers mangent (Shore, Zoom, Smooth, AltitudeTransition, HeightSmooth). Revoir les filtres / extreme list / tier lookup.

### Regle generale a retenir
Pour tout systeme de pool weighted + filtre multi-axes (climat × tier × humidite), TOUJOURS prevoir un fallback "sous-pool fin" qui relache le filtre le plus restrictif si le sous-pool resultant est trop petit. Sinon les axes orthogonaux se multiplient et chaque combo finit a 0-1 entree, supprimant la diversite.

---

## 2026-05-15 v3 — WorldGen : 26/53 biomes manquants apres v2 (MOUNT-tier trop eleve + scan biaise)

**Systeme** : `EriniumGenLayerBiome` (tier weights), `EriniumGenLayerHeightSmooth` (pass 2), `CommandDebugLocateBiome` (cap qWidth/qHeight).

**Probleme** : Apres le fix v1 (pickRandomHillsForZone), `/debuglocatebiome 20000` montait de 23/53 a 27/53 — toujours 26 biomes "manquants". TOUS les DEFAULT_*_FLAT/HILLS du tier HOT (ERINIUM_DESERT, HIGH_SAVANNA) absents, plus la quasi-totalite des FLAT-pool biomes (ERINIUM_PLAINS, FLOWER_PRAIRIE, ASPEN_GROVE, ERINIUM_COLD_TAIGA, REDWOOD_VALLEY, MUSHROOM_GLADE, THERMAL_SPRINGS, VOLCANIC_ISLAND_CHAIN...) et plusieurs HILLS-pool (DENSE_FOREST, CHERRY_FOREST, AUTUMN_FOREST, GIANT_BIRCH, SEQUOIA, ROLLING_HILLS, PETRIFIED_FOREST, ANCIENT_RUINS, ENHANCED_MESA, WINDY_PLATEAU).

**Causes racine** (3 bugs combines) :

1. **Scan biaise (`CommandDebugLocateBiome.scan`)** : `if (qWidth > 2500) qWidth = 2500` cappait la largeur SANS reduire qMinX. Resultat : pour radius=20000 (qWidth requested ~10000), seul un coin (-20000..-10000 sur X et Z) etait scanne — 1/4 de la zone demandee. Beaucoup de biomes presents mais sous-echantillonnes etaient reportes "manquants".

2. **MOUNT-tier trop eleve** : weights `{45, 30, 25}` / `{45, 35, 20}` / `{25, 45, 30}` / `{50, 30, 20}` donnaient MOUNT a 20-30% des cellules du grid biome (basse resolution). Avec MOUNT a ~25%, presque toute cellule FLAT avait un voisin MOUNT (1 cellule = 8 voisins, P(au moins 1 MOUNT) ~90%+). `AltitudeTransition` + `HeightSmooth` convertissaient donc systematiquement les FLAT-pool en HILLS-pick. Les FLAT-pool biomes etaient effaces du monde a ~80%.

3. **HeightSmooth 2 passes** : Pass 1 remplacait FLAT-touching-MOUNT par HILLS. Pass 2 elargissait le ring d'une cellule supplementaire (FLAT-touching-new-HILLS). Cumule avec MOUNT-tier=25%, ca consommait presque tout l'espace FLAT.

**Solution** :
1. **Scan unbiased** (`CommandDebugLocateBiome`) : decoupage en tiles 2500x2500 couvrant TOUTE la zone, plus argument `verbose` qui affiche le nombre de samples par biome (permet de distinguer "rare mais present" de "absent").
2. **Tier weights rebalance** (`EriniumGenLayerBiome.TIER_*`) : MOUNT descend de 20-30% a 8-10%. FLAT monte a 60-65%. Les biomes signature MOUNT (Volcano, EnhancedMesa, Glacier, SteepMountains) restent visibles grace au RNG du seed mais ne dominent plus le grid.
3. **HeightSmooth 1 pass au lieu de 2** : suppression de `smoothPassDirect`. Avec MOUNT-tier reduit a 8%, un seul ring de transition suffit pour eviter les murs verticaux.
4. **WARM_MOUNT enrichi** : pool passe de 1 entree (WINDY_PLATEAU) a 3 (+ STEEP_MOUNTAINS, DEEP_CANYON) pour augmenter la diversite quand un MOUNT WARM tombe.

**Action utilisateur requise** : `/eriniumborder regen confirm` (ou nouveau monde) puis `/debuglocatebiome 20000 verbose`. Cible : 45+/53. Les MOUNT-only rares (Volcano, EnhancedMesa, Glacier, SteepMountains, WindyPlateau) peuvent rester sous-echantillonnes mais doivent apparaitre au moins quelques fois.

---

## 2026-05-15 — WorldGen : 30/53 biomes manquants (HeightSmooth + AltitudeTransition mangeaient la diversite)

**Systeme** : `EriniumGenLayerHeightSmooth` + `EriniumGenLayerAltitudeTransition` (chaine biome -> ring HILLS autour des MOUNT).

**Probleme** : `/debuglocatebiome 20000` retournait 23/53 biomes trouves seulement. Les biomes manquants etaient massivement les FLAT-tier (ERINIUM_PLAINS, ERINIUM_DESERT, FLOWER_PRAIRIE, THICK_JUNGLE, HIGH_SAVANNA, ...) ET la plupart des HILLS-tier (DENSE_FOREST, CHERRY_FOREST, AUTUMN_FOREST, GIANT_BIRCH, SEQUOIA, ROLLING_HILLS, PETRIFIED_FOREST, ERINIUM_ROOFED_FOREST, ANCIENT_RUINS, WINDY_PLATEAU) malgre des weights raisonnables dans les pools.

**Cause racine** : Deux bugs combines dans la chaine post-biome :
1. `HeightSmooth` utilisait `baseHeight <= 0.25` (FLAT_THRESHOLD) pour decider quelles cellules etaient "FLAT" et eligibles a la conversion en HILLS. Or la grande majorite des biomes custom ont `baseHeight` entre 0.05 et 0.2 — y compris les biomes HILLS-tier (DenseForest 0.1, CherryForest 0.1, etc.). Tout etait donc classe "FLAT" et eligible.
2. `HeightSmooth` et `AltitudeTransition` remplacaient toujours la cellule par `DEFAULT_*_HILLS` — UNE seule valeur par climat (4 biomes au total : HIGH_SAVANNA, ERINIUM_FOREST, ANCIENT_TAIGA, SNOW_TUNDRA). Resultat : toute zone touchant un MOUNT dans un rayon de 2 cellules etait reduite a 4 biomes, mangeant la quasi-totalite de la diversite.

Les passes 1+2 de HeightSmooth elargissaient le rayon a 3 cellules autour des MOUNT. Avec MOUNT-tier a ~25% des cellules, presque tout le monde land etait dans le rayon -> ~80% des biomes effaces.

**Solution** :
1. **`EriniumGenLayerBiome.pickRandomHillsForZone(zone, roll)`** : nouvelle methode publique qui tire un biome HILLS aleatoire dans le pool du climat (pondere par les weights existants). Ignore l'humidite (deja bakee par la layer humidity en amont).
2. **`EriniumGenLayerHeightSmooth`** : remplace le check `baseHeight <= 0.25` par `getTierForBiome(id) == TIER_FLAT`. Seules les cellules FLAT-tier sont eligibles a la conversion -> les HILLS-tier (DenseForest, RollingHills, ...) sont preservees.
3. **`HeightSmooth` + `AltitudeTransition`** : appellent `pickRandomHillsForZone` au lieu de retourner toujours le DEFAULT. Chaque conversion tire un HILLS biome different parmi le pool complet.

**Action utilisateur requise** : Regenerer une zone (ex via `/eriniumborder regen confirm` ou nouveau monde) puis relancer `/debuglocatebiome 20000`. Resultat attendu : ~50+/53 biomes trouves.

---

## 2026-05-15 — EriniumBorder : eclairage casse apres regen (dark patches jusqu'au place block)

**Systeme** : `EriniumBorderManager.applySmoothingToChunk` (fin de methode, post-mods).

**Probleme** : Apres une regen border, certaines zones smoothees apparaissaient sombres en jeu — necessite de poser un block pour declencher un update light et eclairer la zone. Le sky-light fonctionnait correctement mais le block-light etait stale.

**Cause racine** : Le code modifiait les blocs via `ExtendedBlockStorage.set(...)` (bypass de `Chunk.setBlockState` qui gere le light normalement) puis appelait :
```
chunk.generateSkylightMap();
chunk.resetRelightChecks();
chunk.setLightPopulated(true);  // <-- bug : marque le chunk "deja eclaire" alors qu'il ne l'est pas
chunk.setTerrainPopulated(true);
chunk.markDirty();
```
`setLightPopulated(true)` ment au moteur : il pense que le chunk est lit, donc ne planifie aucun relight. Le seul declencheur restant etait un block update (pose/casse) qui propage la lumiere localement.

**Solution** :
- `setLightPopulated(false)` au lieu de `true` -> le moteur sait que le chunk doit etre relit.
- Ajout de `chunk.checkLight()` apres -> declenche immediatement le recalcul complet du sky + block light du chunk via le LightingEngine (synchrone, deja gere par Forge).
- `generateSkylightMap()` est conserve (il pre-calcule la heightmap du sky-light avant checkLight) ainsi que `resetRelightChecks()`.

**Action utilisateur requise** : Relancer `/eriniumborder regen confirm`. Les zones smoothees doivent maintenant etre correctement eclairees des leur generation, sans necessiter de poser un block.

---

## 2026-05-15 — EriniumBorder v3.7 : 1554/1932 chunks failed -> loadChunk vs provideChunk

**Systeme** : `EriniumBorderManager.onServerTick` (boucle de regen) + `sampleCornerHeight` / `sampleNaturalHeightBeyondStrip` / `sampleNaturalHeightDir`.

**Probleme** : Apres v3.6 (qui pensait fix le 1554/1932 via BiomeProvider direct), le bug persistait avec exactement le meme score : `378 smoothed OK, 1554 failed`. Le log montrait 1554 lignes `[EriniumBorder] regen: failed to load chunk (X,Y)` — l'echec etait DANS la boucle de force-load, AVANT meme l'appel a applySmoothingToChunk. Donc le fix biome de v3.6 ne pouvait pas avoir d'effet.

**Cause racine** : Les 4 appels `cps.loadChunk(cx, cz)` (1 dans `onServerTick`, 3 dans les samples) utilisaient `ChunkProviderServer.loadChunk(int, int)`. En 1.12.2 cette methode charge UNIQUEMENT depuis le disque et retourne `null` si le chunk n'a jamais ete genere. Les chunks de la border ring loin de toute zone visitee (typiquement les coins de l'anneau a 1900+ chunks du spawn pour un ring complet) n'avaient jamais ete touches -> `loadChunk` retournait null -> warning + skip. Seuls les chunks deja visites au moins une fois (proches du joueur) etaient smoothes -> rendu coherent du bug "smoothing visible uniquement autour du spawn".

**Solution v3.7** :
- Remplacer les 4 appels `cps.loadChunk(...)` par `cps.provideChunk(...)`. `provideChunk` charge depuis le disque OU genere le chunk via worldgen s'il est absent — garantit qu'un Chunk valide est retourne. Synchronisation : les chunks gen sont generes sync (compatible avec le throttle `regen_chunks_per_tick = 20` qui limite la charge a ~20 chunks gen/tick).
- Mettre a jour les messages de log et commentaires pour refleter `provideChunk` (suppression du "failed to load" trompeur).
- Le systeme d'unload en fin de job (`saveAllChunks` puis `queueUnload` des chunks force-load) reste inchange et libere correctement la RAM apres la regen.

**Action utilisateur requise** : Relancer `/eriniumborder regen confirm`. Le log final doit afficher `1932 chunks scheduled, 1932 smoothed OK, 0 failed`. Charge attendue : ~5-10s pour 1932 chunks avec generation worldgen complete (depend du nombre de chunks deja generes vs a generer).

---

## 2026-05-15 — EriniumBorder v3.6 : regression critique 1554/1932 chunks failed sur regen

**Systeme** : `EriniumBorderManager.applySmoothingToChunk` (lookup biome ajoute en v3.5).

**Probleme** : Apres deploiement de v3.5 (peinture biome-aware), `/eriniumborder regen confirm` produisait `378 smoothed OK, 1554 failed` sur un ring de 1932 chunks. Seuls ~20% des chunks (ceux proches du joueur) etaient effectivement smoothes.

**Cause racine** : v3.5 a introduit `world.getBiome(biomePos)` par colonne (256 lookups/chunk). En 1.12.2, `World.getBiome(BlockPos)` :
1. Verifie `isBlockLoaded(pos)` -> true (le chunk courant est loaded).
2. Recupere `chunk.getBiome(pos, biomeProvider)` qui lit dans `chunk.getBiomeArray()`.
3. Si l'octet biome dans le tableau pointe vers une ID non-enregistree ou si `Biome.getBiome(id)` retourne null pour un biome custom mal-resolu sur chunks lointains (cas frequent avec 36 biomes custom + edge cases worldgen), la methode throw via `CrashReport`/`ReportedException` -> propagation jusqu'au try/catch externe dans `onServerTick` -> `chunksFailed++` et le chunk reste non smoothe.
4. De plus, l'exception interne dans `applySmoothingToChunk` n'etait pas catchee localement -> aucune stack trace lisible pour diagnostic.

**Solution v3.6** :
- Remplacer `world.getBiome(biomePos)` par `world.getBiomeProvider().getBiome(biomePos, Biomes.PLAINS)`. Le BiomeProvider recalcule depuis GenLayer, ne touche pas au chunk biome array, et retourne TOUJOURS un biome valide (fallback Plains si edge case). Plus rapide aussi (pas de lookup chunk).
- Wrap supplementaire try/catch autour de l'appel biome lui-meme avec fallback `Biomes.PLAINS` (ceinture + bretelles).
- Ajouter try/catch dans `applySmoothingToChunk` qui log les 3 premieres exceptions avec stack trace complete via `LOGGER.warn("...", cx, cz, t.toString(), t)` (le 4eme parametre throwable declenche le print de stack trace dans Log4j2). Suppression silencieuse au-dela pour eviter le spam si systemic.

**Action utilisateur requise** : Relancer `/eriniumborder regen confirm`. Le log final doit afficher `1932 chunks scheduled, 1932 smoothed OK, 0 failed`. Si encore des fails, les 3 premiers auront leur stack trace dans le log pour diagnostic.

---

## 2026-05-15 — EriniumBorder v3.5 : surface herbe uniforme malgre biomes desert/sand/mesa/etc.

**Systeme** : `EriniumBorderManager.applySmoothingToChunk` (peinture de surface apres calcul de hauteur).

**Probleme** : Le smoothing remplacait le top/filler par `Blocks.GRASS` + `Blocks.DIRT` hardcodes partout. Resultat : la ring smoothing apparaissait comme un plateau d'herbe meme quand la colonne traversait un desert, une plage, une mesa, etc. -> rupture visuelle nette entre la rampe verte et le biome environnant.

**Cause racine** : Constantes `grass`/`dirt` posees inconditionnellement dans les deux branches (`hTarget < hNatural` et `hTarget > hNatural`). Le code ne consultait jamais `world.getBiome(...)`.

**Solution v3.5** :
- Resolution du biome local UNE fois par colonne (256 lookups / chunk, pas par block).
- Utilisation de `colBiome.topBlock` pour la surface et `colBiome.fillerBlock` pour les 3 blocs en dessous. Acces direct au champ public (Forge 1.12.2 expose `topBlock`/`fillerBlock` en `public`).
- Fallback `Blocks.GRASS` / `Blocks.DIRT` si le biome retourne null (rare, biomes custom mal configures).
- `BlockPos.MutableBlockPos` reutilisable pour eviter l'allocation par colonne.
- Biomes aquatiques (`BiomeOcean`, `BiomeRiver`) : on applique quand meme top/filler du biome (gravel/sand vanilla) — pas de skip, sinon la hauteur reste correcte mais la surface garderait l'herbe precedente.

**Action utilisateur requise** : Relancer `/eriniumborder regen confirm` pour repeindre la ring avec les bonnes textures.

---

## 2026-05-15 — EriniumBorder v3.4 : murs lateraux entre chunks adjacents + regen partielle

**Systeme** : `EriniumBorderManager.applySmoothingToChunk` + `RegenJob` (lissage du ring + regen complete).

**Probleme** :
1. **Bug 2** : Sur les bords lateraux de la rampe smoothee, des falaises nettes apparaissaient entre chunks adjacents — l'aspect "stair-step wall" qu'on avait deja corrige verticalement (v3.2) revenait en horizontal.
2. **Bug 1** : `/eriniumborder regen confirm` ne semblait smoother que les chunks proches du joueur, le reste du ring (a l'oppose) restait avec le terrain naturel intact.

**Cause racine** :
1. **Bug 2** : Le v3.3 sample 4 coins NW/NE/SW/SE par chunk via `sampleNaturalHeightDir(cx, cz, cornerDX, cornerDZ)`. La direction outward `dx/dz` est calculee par chunk : chunk A (au nord de la bbox) a `dx=0, dz=-1`, chunk B adjacent (au nord-est) a `dx=+1, dz=-1`. Le coin NE de A et le coin NW de B ont la MEME coordonnee mondiale mais le sample chunk projete differe (axe outward different + offset corner ignore si `cornerDX==dx`) -> deux `hNatural` differents au coin partage -> bilinear chunk-local produit une falaise au joint.
2. **Bug 1** : Le `cps.queueUnload(chunk)` etait appele IMMEDIATEMENT apres `applySmoothingToChunk` et `chunk.markDirty()`, AVANT `saveAllChunks` (qui ne s'execute qu'a la fin du job). Selon le state de ChunkProviderServer et la pression RAM, le chunk pouvait etre droppe avant d'etre persiste -> les modifications n'arrivaient jamais au disque pour les chunks loin du joueur (les chunks proches, eux, etaient packet-resync immediatement via SPacketChunkData et restaient en RAM cote client). Resultat visuel : le ring "marche" pres du joueur, "marche pas" loin de lui.

**Solution v3.4** :
- **Bug 2** : Nouveau `sampleCornerHeight(world, gx, gz, fallbackY)` keye sur les coordonnees mondiales des COINS de chunk (gx, gz en unites chunk-grid). Adjacent border chunks partagent leurs coins (`chunk A.NE = chunk B.NW`) -> meme `hNatural` -> bilinear C0-continue across chunk boundaries -> zero falaise. Cache global dans `RegenJob.cornerCache: Map<Long, Integer>` -> chaque coin unique echantillonne UNE SEULE fois par job (gain perf : ~1 sample/chunk au lieu de 4).
- **Bug 1** : Sequence end-of-job inversee : `saveAllChunks(true, null)` AVANT le `queueUnload` des chunks force-load. Les modifications sont persistees a coup sur. Le `queueUnload` immediate apres chaque chunk regen est SUPPRIME (remplace par enregistrement dans `sampleChunksToUnload` qui est vide en fin de job).
- Ajout compteurs `chunksOK` / `chunksFailed` + `cornerCache.size()` dans le log final pour diagnostic facile.

**Action utilisateur requise** : Relancer `/eriniumborder regen confirm` pour appliquer le nouveau lissage continue. Le log final affichera "X smoothed OK, Y failed, Z unique corners sampled" -> Y doit etre 0, Z ~= total chunks +N.

---

## 2026-05-15 — EriniumBorder : rampe de smoothing trop geometrique (pas naturelle)

**Systeme** : `EriniumBorderManager.applySmoothingToChunk` (transition entre la zone pre-gen flat y=63 et le terrain naturel).

**Probleme** : Meme avec un lerp `easeInOutCubic` par colonne (v3.2), la transition entre le flat buffer (y=63) et le terrain naturel restait visiblement une rampe lissee : une pente reguliere qui suit grossierement une isolinge autour de la bbox pre-gen. Un joueur disait "c'est pas du tout naturel une rampe". Le terrain reel a des collines, des creux, des irregularites locales — pas une pente uniforme.

**Cause racine** : 3 limitations du v3.2 :
1. **Un seul `hNatural` par chunk** : tous les blocs d'un chunk lerpent vers la meme cible -> la rampe etait orientee uniformement.
2. **Aucun bruit organique** : la hauteur etait une fonction continue lisse de la distance a la bbox -> pente parfaitement reguliere.
3. **Largeur uniforme** : la ring faisait exactement `smoothing_width_chunks` partout -> aspect anneau parfait.

**Solution v3.3** :
- **A. Multi-sample 4 directions** : sample 4 hauteurs naturelles aux 4 coins outward du chunk (NW/NE/SW/SE), puis interpolation bilineaire par colonne selon `(ux, uz)` dans le chunk. Le `hSampled` varie en continu sur le chunk.
- **B. Noise organique additionne** : `valueNoise` int-only (adaptee de `EriniumGenLayerClimate`), combinaison 70% basse frequence (scale=32 blocs, grandes ondulations) + 30% haute frequence (scale=9, micro-rugosite). Amplitude = `bell(t) * min(0.40 * |gap|, 24)` ou `bell(t) = 1 - (2t-1)²` (zero aux extremites, max au milieu de la ring). Garantit zero noise dans le flat buffer (t=0) et zero noise au raccord avec le terrain naturel (t=1).
- **C. Largeur effective modulee** : noise grande echelle (scale=96) qui multiplie `smoothingWidthBlocks` par un facteur dans [0.7..1.3] selon la position -> certaines zones ont une transition de 4 chunks, d'autres de 7. Casse l'aspect anneau geometrique.
- Seed du noise derivee de `world.getSeed()` -> coherent entre runs sur le meme monde.
- Tout int-only, zero allocation dans le hot path 16x16.

**Action utilisateur requise** : Le nouveau rendu n'apparait QUE sur les chunks regeneres par `/eriniumborder regen confirm`. Les chunks deja smoothes avec v3.2 ne changeront pas tant que la commande regen n'est pas relancee.

---

## 2026-05-15 — EriniumBorder : plateau plat + smoothing applique automatiquement au worldgen

**Systeme** : `EriniumBorderManager` (border ring autour de la zone pre-gen).

**Probleme** : Sur un monde completement neuf (jamais lance `/eriniumborder regen confirm`, region files vierges), l'utilisateur observe pres du spawn un grand plateau plat a y=63 entoure d'un smoothing stepped vers le terrain naturel (volcan/montagnes). L'effet apparait UNIQUEMENT sur les chunks proches du joueur (ceux qui viennent d'etre generes) et donne un aspect tres peu naturel : terrain plat coupe net par des falaises vers les biomes alentour.

**Cause racine** : `EriniumBorderManager` enregistrait un `@SubscribeEvent(priority = EventPriority.LOWEST)` sur `PopulateChunkEvent.Post`. A chaque chunk genere par worldgen dont la distance Chebyshev a la pre-gen bbox tombait dans `[1, flatBufferChunks + smoothingWidthChunks]` (= ring de 6 chunks autour de -500/-500 -> 498/498), le smoothing etait applique **automatiquement** sans attendre la commande regen. Avec `enabled=true` par defaut + valeurs pos1/pos2 par defaut, n'importe quel chunk genere en jeu pres du spawn etait flat-plate.

Le comportement attendu (selon la doc) : le smoothing ne doit s'appliquer QUE sur les chunks que l'admin demande explicitement de reecrire via `/eriniumborder regen confirm`. Le worldgen ne doit JAMAIS etre modifie automatiquement.

**Solution** : Suppression du handler `onPopulatePost(PopulateChunkEvent.Post)` et du handler `onChunkLoad(ChunkEvent.Load)` (qui etait un stub no-op de toute facon). La border ring est maintenant strictement une operation admin declenchee par la commande regen. Le handler `onCheckSpawn` (suppression mob spawning) et `onServerTick` (regen batche) restent — ils n'alterent pas le terrain.

**Recommandation** : Les chunks deja generes en jeu avec l'ancien comportement contiennent du terrain flat persistant. Pour les "reparer", deux options :
1. Supprimer les region files concernes (`world/region/r.*.mca` autour du spawn) -> le worldgen regenere du terrain naturel propre lors de la prochaine exploration.
2. Lancer `/eriniumborder regen confirm` -> les chunks deja a plat resteront a plat (le smoothing n'a rien a changer), mais au moins la transition vers l'exterieur sera coherente.

L'option 1 est recommandee si l'utilisateur veut un monde sans aucune trace du bug.

---

## 2026-05-15 — Crash init serveur : `ChunkNibbleArrays should be 2048 bytes not: 0`

**Systeme** : Chargement de chunks au demarrage du serveur (`AnvilChunkLoader.readChunkFromNBT`).

**Probleme** : Crash hard a `MinecraftServer.initialWorldChunkLoad`. Stack :
```
java.lang.IllegalArgumentException: ChunkNibbleArrays should be 2048 bytes not: 0
    at net.minecraft.world.chunk.NibbleArray.<init>(SourceFile:16)
    at AnvilChunkLoader.readChunkFromNBT(AnvilChunkLoader.java:470)
```

**Cause racine** : Un region file contient au moins un chunk avec un tag `Add` / `BlockLight` / `SkyLight` / `Data` corrompu (taille 0 au lieu de 2048). Origine probable : crash precedent pendant un save de chunk (regen `/eriniumborder`, kill -9, etc.). Aucun code mod n'ecrit dans le NBT raw — `BiomeBorderSmoother` utilise `chunk.setBlockState()` (safe), et `EriniumBorderManager` ecrit via `ExtendedBlockStorage.set()` puis `generateSkylightMap()` qui reconstruit la lumiere proprement. La corruption pre-existe sur disque.

**Solution** : Ajout de `MixinAnvilChunkLoaderSafe` qui `@Redirect` les appels a `NBTTagCompound.getByteArray(String)` dans `readChunkFromNBT`. Si la cle est `Add`, `BlockLight`, `SkyLight` ou `Data` et que la taille n'est pas 2048, retourne un `new byte[2048]` (NibbleArray vide rempli de zeros) avec un warning. Pour `Blocks`, retourne un `new byte[4096]` si != 4096. Le chunk est ainsi charge en l'etat et la lumiere se recalcule au prochain `generateSkylightMap()`.

**Recommandation supplementaire** : Si le crash persiste, supprimer le region file fautif (voir log warning pour identifier les coords) ou regenerer le bord via `/eriniumborder regen confirm`.

---

## 2026-05-15 — WorldGen : disparition des biomes extremes/montagnes (Volcano, Mesa, Glacier, SteepMountains)

**Systeme** : `EriniumGenLayerBiome` (pools + humidite) + `EriniumGenLayerShore` (buffer climatique).

**Probleme** : Apres l'ajout des 3 features du commit `2a19282f` (axe humidite, transition d'altitude, smoothing), les biomes signatures extremes/hauts (Volcano, Enhanced Mesa, Steep Mountains, Glacier) avaient quasiment disparu du monde. Le monde etait domine par des biomes plats (Extended Beach, Flower Prairie, Erinium Plains).

**Cause racine** : Cumul de 3 effets multiplicatifs eliminant ~95% des biomes MOUNT.

1. **Filtre humidite trop strict sur les tiers MOUNT/HILLS rares** : `POOL_HOT_MOUNT` = {Volcano DRY, EnhancedMesa DRY} et tous les entries `POOL_HOT_HILLS` etaient DRY-only. Avec une humidite repartie ~33% DRY / 33% MEDIUM / 34% WET, ~67% des cellules HOT MOUNT tombaient au DEFAULT a chaque fois. Pareil pour ICY HILLS (Glacier weight 3 ANY, melange avec biomes DRY/MEDIUM dominants).
2. **Shore buffer Chebyshev distance 2 trop large** : le buffer remplacait les 8 biomes "extremes" (Volcano, VolcanicPlains, EnhancedMesa, RedDesert, Wasteland, SaltFlats, Glacier, SteepMountains) dans un rayon de 2 cellules autour de tout ocean. Avec ~50% de couverture oceanique a basse resolution, ~50% des biomes extremes inland etaient avales.
3. **Tier weights MOUNT trop faibles** : HOT MOUNT = 15%, ICY MOUNT = 5%. Combine avec les filtres precedents : Volcano effectif ~0.25 × 0.15 × 0.33 × (3/8) × 0.5 ≈ 0.2% des cellules terrestres = invisible.

**Solution** :

1. **Pools MOUNT/HILLS rares passes en `ANY`** dans `EriniumGenLayerBiome.initPools()` : Volcano, EnhancedMesa, Glacier, HighSavanna, VolcanicPlains, RedDesert, SnowTundra, EriniumColdTaiga. La rarete du tier MOUNT (1/4 du roll) compense deja — pas besoin d'un 2e filtre humidite dessus. Bumpe aussi Glacier weight 3 -> 5 et EnhancedMesa HOT HILLS weight 3 -> 5. `DEFAULT_HOT_MOUNT` = `VOLCANO` (au lieu d'EnhancedMesa) pour garantir sa visibilite.
2. **Tier weights MOUNT augmentes** : HOT 15->25%, WARM 10->20%, COOL 25->30%, ICY 5->20%.
3. **Shore buffer reduit a 1 cellule (diagonales seulement)** : remplace `hasOceanWithin2` (16 cellules Chebyshev-2) par `hasOceanDiagonal` (4 cellules diagonales). Les cardinaux sont deja geres par direct-shore. GLACIER et STEEP_MOUNTAINS retires de la liste EXTREME (fjords/glaciers cotiers = iconique IRL).

**Verification** : Build OK. Les biomes extremes devraient apparaitre ~5-10x plus souvent qu'avant le fix, tout en restant proteges des adjacences Beach-Volcano absurdes (corrigees par le buffer 1-cellule + climate buffer du fix precedent).

---

## 2026-05-15 — WorldGen : biome volcan adjacent a une plage (climatologie absurde)

**Systeme** : `EriniumGenLayerShore` — shore layer applique apres l'assignation des biomes.

**Probleme** : Un joueur a rapporte qu'un biome Volcan (HOT, temp 2.0) se generait
directement a cote d'une plage (EXTENDED_BEACH, temp 0.95). Visuellement choquant
et climatologiquement absurde : un volcan ne devrait jamais toucher la cote sans
zone tampon. Le meme probleme touchait d'autres biomes "extremes" : EnhancedMesa,
RedDesert, Wasteland, SaltFlats, Glacier, SteepMountains.

**Cause racine** : Le `EriniumGenLayerShore` ne faisait QUE convertir les cellules
terrestres adjacentes a l'ocean en biomes plage/cote selon la temperature du biome.
Il ne deplacait jamais les biomes extremes plus profondement dans les terres.
Resultat : si la generation placait un Volcano a 1 cellule de l'ocean, sa cellule
de bord devenait beach (puisque Volcano temp >= 1.0), mais la cellule interieure
restait Volcano -> adjacence Beach -> Volcano sans transition.

Le `EriniumGenLayerClimate` etablit bien des zones HOT/WARM/COOL/ICY coherentes
via du noise multi-octave, mais cela n'empeche pas un biome HOT extreme d'etre
choisi a 1 cellule de l'ocean.

**Solution** : Etendre `EriniumGenLayerShore` pour qu'il agisse comme tampon
climatique en plus de la conversion plage :

1. Liste d'IDs "extremes" : VOLCANO, VOLCANIC_PLAINS, ENHANCED_MESA, RED_DESERT,
   WASTELAND, SALT_FLATS, GLACIER, STEEP_MOUNTAINS (sortee, binary search).
   VOLCANIC_ISLAND_CHAIN exclu volontairement (biome cotier dessine pour l'ocean).
2. Margin de parent porte de 1 a 2 cellules.
3. Pour chaque cellule terrestre :
   - Si voisin cardinal = ocean -> beach/coast (logique existante). Si centre
     est extreme, on route via le buffer pour ne jamais calculer une plage
     depuis la temperature d'un volcan.
   - Sinon, si centre est extreme ET un cell dans rayon 2 = ocean -> remplace
     par biome "tame" de la meme zone climatique :
     - HOT (temp >= 1.0)  -> ERINIUM_DESERT
     - WARM (0.5 <= t<1)  -> ERINIUM_PLAINS
     - COOL (0.15<=t<0.5) -> ANCIENT_TAIGA
     - ICY  (t < 0.15)    -> SNOW_TUNDRA
4. Resultat : Ocean -> Beach -> TameBiome -> ... -> Volcano (zone tampon de 2 cellules
   minimum apres le 6x zoom du chain).

Hot path optimise : check ocean ring distance-2 deroule manuellement (16 offsets,
aucune allocation, pas de Math.abs).

**Fichiers modifies** :
- `src/main/java/fr/eriniumgroup/eriniumfaction/world/gen/EriniumGenLayerShore.java`

---

## 2026-05-15 — EriniumBorder : mur en escalier sur la bande de smoothing (paliers de 16 blocs)

**Systeme** : `EriniumBorder` — `EriniumBorderManager.applySmoothingToChunk`

**Probleme** : Apres le fix v3 (sample hNatural hors bande), la bande border n'etait plus
un mur vertical brutal MAIS un mur EN ESCALIER : chaque chunk de la ramp = un plateau plat
a un Y different, et la transition entre deux chunks adjacents = une marche de 10-15 blocs.
Sur 5 chunks de ramp, on voyait visuellement 5 marches geantes au lieu d'une pente continue.

**Cause racine** : `applySmoothingToChunk` calculait UN seul `hTargetChunk` par chunk (a partir
de la distance Chebyshev EN CHUNKS), puis l'appliquait aux 256 colonnes du chunk. Donc chunk
a dCheb=2 -> hTarget=75 partout, chunk a dCheb=3 -> hTarget=90 partout. Marche de 15 blocs
a la frontiere entre les deux. La granularite chunk-level (16 blocs) etait trop grossiere
pour produire un slope visuel.

**Solution** : Calculer `t` (et donc `hTarget`) PER COLONNE a partir de la distance Chebyshev
EN BLOCS de la colonne a la bbox pre-gen. Formule :
```
flatBlocks = flat_buffer_chunks * 16
rampBlocks = smoothing_width_chunks * 16
distBlocks = chebyshev(xWorld, zWorld, bbox)  // en blocs
if distBlocks <= flatBlocks       -> hTarget = surfaceY
elif distBlocks <= total          -> t = (distBlocks - flatBlocks) / rampBlocks ; lerp
else                              -> skip (worldgen pur)
```
La cible `hNaturalChunk` reste UN sample par chunk (perf, evite 256 force-loads) — seule
la VITESSE d'approche vers cette cible varie en continu colonne par colonne, ce qui donne
un slope bloc par bloc au lieu d'un plateau par chunk.

**Regle generale** : Pour tout systeme d'interpolation visible visuellement entre une zone
modifiee et un terrain naturel, le facteur `t` DOIT etre calcule a la granularite du bloc
(pas du chunk). Une interpolation chunk-level produit toujours des paliers visibles a 16
blocs, meme avec un ease cubique. La seule chose qu'on peut garder chunk-level pour des
raisons de perf est la CIBLE de l'interpolation (ici `hNaturalChunk`), pas le facteur lui-meme.

---

## 2026-05-15 — EriniumBorder : bande plate + mur vertical malgre le smoothing v2

**Systeme** : `EriniumBorder` — `EriniumBorderManager.applySmoothingToChunk`

**Probleme** : Apres `/eriniumborder regen confirm`, toute la bande border etait correctement
modifiee (toute l'anneau traite) MAIS visuellement l'utilisateur voyait une bande totalement
plate a y=63 sur les 5 chunks de la bande, suivie d'un mur vertical massif a la frontiere
bande / worldgen naturel (montagne a y=120+).

**Cause racine** : Le smoothing v2 echantillonnait `hNatural` (la hauteur naturelle vers laquelle
lerper) en scannant top-down dans le chunk en cours. Or les chunks de la bande appartiennent
tous au meme biome quasi-plat impose par le worldgen pre-gen, donc `hNatural` valait toujours
~surfaceY. Resultat : `lerp(surfaceY, surfaceY, t) = surfaceY` pour TOUTES les valeurs de t,
bande totalement plate. Puis a la frontiere, le worldgen naturel reprenait brutalement sa
heightmap reelle (montagne) -> mur.

**Solution** : Echantillonner `hNatural` depuis le PREMIER chunk strictement au-dela de la bande
de lissage (Chebyshev distance = smoothing_width + 1), qui appartient au worldgen pur (donc
exhibe la vraie hauteur de terrain). Methode `sampleNaturalHeightBeyondStrip(world, cx, cz)` :
calcule la direction outward (dx, dz dans {-1, 0, +1}), determine le chunk source au-dela de
la bande via `steps = smoothing_width + 1 - d`, force-load via `ChunkProviderServer.loadChunk`,
scan top-down en (8, 8) du chunk source. Une seule valeur `hNaturalChunk` par chunk (pas par
colonne) — approximation acceptable et evite 256x les force-loads cascade.

Tracker les chunks samples chargees dans `RegenJob.sampleChunksToUnload` (Set<Long>) pour les
`queueUnload()` a la fin du regen et borner la RAM.

**Regle** : Pour tout smoothing/lerp entre une zone modifiee et une zone naturelle, l'echantillon
de la zone naturelle DOIT venir d'un chunk strictement hors de la zone modifiee. Echantillonner
localement dans la zone modifiee donne une boucle de retroaction (lerp degenere en constante)
qui produit un mur a la frontiere.

---

## 2026-05-15 — EriniumWorld /region flag <flag> <TAB> ne suggerait aucune valeur

**Systeme** : `EriniumWorld` — `worldguard/WorldGuardCommands.java`

**Probleme** : Quand l'utilisateur tapait `/region flag <region> <flag> <TAB>`, aucune suggestion
de valeur n'apparaissait pour le 4e argument. L'utilisateur ne savait donc pas ce qu'il fallait
mettre (allow/deny pour STATE, survival/creative/... pour GAMEMODE, etc.).

**Cause racine** : Un `SuggestionProvider` existait deja (`FLAG_VALUE_SUGGESTIONS`) et appelait
`StringArgumentType.getString(context, "flag")` pour recuperer le nom du flag deja parse, mais
selon le chemin de tab-completion emprunte par Forge 1.12.2 (qui passe par
`BrigadierCommandWrapper.getTabCompletions` puis `dispatcher.getCompletionSuggestions`), cette
recuperation pouvait echouer silencieusement, retournant une liste de suggestions vide.

**Solution** : Ajouter un fallback dans `FLAG_VALUE_SUGGESTIONS` qui, si
`StringArgumentType.getString(context, "flag")` echoue ou rend une valeur vide, parse le nom du
flag directement depuis `builder.getInput()` (split sur whitespace, prendre l'index 3 :
`[0]=region/rg, [1]=flag, [2]=<region>, [3]=<flag>`). Ajouter aussi un filtrage par prefix
via `builder.getRemaining()` pour ne suggerer que les valeurs pertinentes.

**Regle** : Dans tout `SuggestionProvider` Brigadier sous Forge 1.12.2, ne pas dependre
exclusivement de `StringArgumentType.getString(context, ...)` pour les arguments precedents.
Toujours prevoir un fallback qui parse `builder.getInput()` car le wrapper d'integration peut
ne pas exposer le contexte parse complet selon la phase (suggestion vs execution).

---

## 2026-05-08 — Nom de channel SimpleNetworkWrapper > 20 caracteres (deconnexion)

**Systeme** : `profile/network/ProfileNetwork.java`

**Probleme** : Le client se faisait deconnecter du serveur avec
`io.netty.handler.codec.DecoderException: The received string length is longer than maximum allowed (22 > 20)`
des qu'un packet etait envoye sur le channel du systeme profil.

**Cause racine** : Le nom du channel passe a `NetworkRegistry.INSTANCE.newSimpleChannel(...)` est
serialise comme une chaine Minecraft dans le packet `CustomPayload`, et celle-ci est limitee a
**20 caracteres maximum**. Le channel `eriniumfaction_profile` (22 caracteres) depasse cette limite.

**Solution** : Renommer le channel en `ef_profile` (10 caracteres). Tous les autres channels du
mod respectent la limite (max actuel : `eriniumfaction_magic` a 20 chars, OK pile poil).

**Regle** : TOUT nouveau `SimpleNetworkWrapper` doit avoir un nom de **20 caracteres ou moins**.
Eviter le prefixe `EriniumFaction.MODID + "_..."` qui consomme deja 14 chars : preferer `ef_xxx` ou
`erinium_xxx` pour avoir de la marge.

---

## 2026-05-07 — EriAPI EventBuilder.filter() ecrasait les filtres precedents (Jump Boost overworld)

**Systeme** : `EriAPI/src/main/java/fr/eri/eriapi/event/EventBuilder.java` (impact : `ErinaEffects.java` Jump Boost)
**Probleme** : Joueur en overworld (dim 0) recoit Jump Boost permanent. Effet AUSSI present hors Erina alors que `ErinaEffects.applyJumpBoost` est explicitement filtre sur `provider.getDimension() == ErinaDimension.DIM_ID` (= 42).
**Cause racine** : `EventBuilder.filter(Predicate)` faisait `this.filter = predicate` a chaque appel. Donc une chaine `.filter(phaseEND).filter(notNull).filter(dim==42).filter(!isRemote)` ne conservait que **le dernier** predicate. Resultat : seul `!e.player.world.isRemote` etait teste, le check de dimension etait perdu, et `applyJumpBoost` etait appele dans toutes les dimensions cote serveur. Tout listener EriAPI utilisant plusieurs `.filter(...)` chaines etait silencieusement casse.
**Solution** : Modifier `EventBuilder.filter()` pour combiner les predicats successifs avec `Predicate.and()` : `this.filter = (this.filter == null) ? predicate : this.filter.and(predicate);`. Bump EriAPI 1.6.7 -> 1.6.8, rebuild, copier le jar dans `EriniumFaction/libs/`, mettre a jour `build.gradle`, doc events.html FR/EN, README, patchnote.
**Regle** : EriAPI EventBuilder combine maintenant les filtres en AND. Tout `.filter(...)` chaine est cumule. Si un comportement OR est voulu : combiner les predicats manuellement dans un seul `.filter(e -> p1.test(e) || p2.test(e))`. Toujours utiliser EriAPI >= 1.6.8 pour cette correction.

---

## 2026-05-07 — Vercel serverless : filesystem read-only, stockage skins incompatible

**Systeme** : `EriniumFactionWeb/src/app/api/profile/skin/route.ts` + `EriniumFactionWeb/src/app/api/skin/[uuid]/route.ts`
**Probleme** : Upload de skin echoue en prod Vercel avec `ENOENT /var/task/public/skins`. Le code initial faisait `mkdir + writeFile` dans `public/skins/{uuid}.png`. En local Next.js OK, en prod Vercel KO.
**Cause racine** : Vercel serverless (et toute plateforme serverless type AWS Lambda) execute chaque requete dans un container ephemere avec un filesystem **read-only** sauf `/tmp`. Le dossier `public/` est bundle au build et **immuable au runtime**. Toute tentative de creer/ecrire un fichier dans `public/` echoue. De plus, meme si `/tmp` etait utilise, il ne persiste pas entre invocations (cold starts) et n'est pas partage entre instances.
**Solution** : Migrer le stockage des PNG vers Postgres (table `player_skins (uuid PRIMARY KEY, png_data BYTEA, updated_at TIMESTAMP)`). POST fait un `INSERT ... ON CONFLICT DO UPDATE`. GET fait un `SELECT png_data WHERE uuid = $1` et renvoie le buffer avec `Content-Type: image/png`. Fallback sur `public/steve.png` (lecture OK car bundle statique). La connexion Neon serverless gere automatiquement le pooling cote driver — pas de connexion persistante a maintenir.
**Regle** : Sur Vercel/serverless, JAMAIS ecrire de fichiers utilisateurs sur le filesystem. Stocker en DB (bytea pour binaires < 1 MB, sinon Vercel Blob ou S3). Les assets statiques (steve.png, images du site) restent dans `public/` et sont lisibles. Le decodage du bytea Neon : peut renvoyer `Buffer`, `Uint8Array` ou string `\\x...` (hex) — toujours normaliser via un helper.

---

## 2026-05-07 — SimpleNetworkWrapper.registerMessage doit etre appele des deux cotes

**Systeme** : `skin/SkinNetwork.java` + `skin/client/SkinPacketHandler.java`
**Probleme** : Crash serveur `Undefined discriminator for message type ...PacketSkinSync in channel eriniumfaction_skin` au login d'un joueur. Un fix precedent avait deplace l'appel `registerMessage(SkinPacketHandler.class, PacketSkinSync.class, 0, Side.CLIENT)` de `SkinNetwork.init()` (commun) vers `ClientProxy.init()` (client only) — pour eviter de charger la classe `@SideOnly(CLIENT)` cote serveur. Resultat : le serveur n'avait plus aucun encoder enregistre pour le message id 0, donc impossible d'envoyer le packet.
**Cause racine** : `SimpleNetworkWrapper.registerMessage(handler, message, id, side)` doit etre appele des DEUX cotes : sur le sender (server) il enregistre l'encoder du message pour le discriminator id, sur le receiver (client) il enregistre le handler. Skipper l'appel cote serveur supprime la connaissance du discriminator.
**Solution** : Retirer `@SideOnly(Side.CLIENT)` de la classe `SkinPacketHandler` et deplacer l'import `net.minecraft.client.Minecraft` au niveau methode (FQN inline). Le ClassLoader JVM reste lazy : tant que `onMessage` n'est pas invoque (jamais cote serveur, Forge route uniquement vers `Side.CLIENT`), `Minecraft` n'est pas resolu. Remettre l'appel `registerMessage(...)` dans `SkinNetwork.init()` (commun, appele dans `CommonProxy.init`). Retirer `registerClientHandler()` et son appel depuis ClientProxy.
**Regle** : Pour TOUT `SimpleNetworkWrapper`, `registerMessage` doit imperativement etre appele des deux cotes (commun, dans `init`). Pour eviter le crash de classloading sur dedicated server, NE PAS mettre `@SideOnly(CLIENT)` sur les handlers de packets S->C. Garder les references client-only (Minecraft, TextureManager, etc.) UNIQUEMENT a l'interieur des corps de methodes (FQN ou import OK car la JVM est lazy), JAMAIS dans des champs statiques, des initializers, ou des signatures de methodes publiques.

---

## 2026-05-05 — Phase 10 : translation keys Item/Block sans prefix modid affichent la cle brute

**Systeme** : `erina/extra/Item*.java` + `erina/extra/Block*.java` (Phase 10 features creees a la main, hors EriItem builder)
**Probleme** : Les items/blocs Phase 10 (`signal_scrambler`, `drone`, `loot_amplifier`, `return_portal`, `telepathy_crystal`, `vision_mushroom`, `void_container`, `portal_return`, `shadow_trap`, `deployable_camp`, `plasma_extractor`, `faction_beacon`) affichaient leur cle brute en jeu (ex : `item.signal_scrambler.name`) au lieu du nom traduit.
**Cause racine** : Le code utilise `setTranslationKey("X")` (sans prefix modid). Avec ce setter, Minecraft genere la cle finale `item.X.name` (ou `tile.X.name`). Or les fichiers `fr_FR.lang` / `en_US.lang` contenaient uniquement le format namespaced `item.eriniumfaction.X.name` (utilise par EriItem builder). Les deux formats coexistent : EriItem builder genere automatiquement la cle namespaced, mais `setTranslationKey("X")` Forge brut genere la cle non-namespaced. Aucune des deux n'etait fausse — il faut juste les fournir toutes les deux.
**Solution** : Ajouter dans `fr_FR.lang` et `en_US.lang` une section avec les entrees non-namespacees (`item.signal_scrambler.name=...`, `tile.faction_beacon.name=...`, etc.) en plus des entrees existantes namespacees. Garder les deux formats pour la compatibilite avec les futurs items qui pourraient utiliser EriItem.
**Regle** : Quand on cree un Item/Block avec `setTranslationKey("X")` (Forge brut), TOUJOURS ajouter `item.X.name` / `tile.X.name` dans les lang files. Quand on cree avec `EriItem.create(MODID, "X")`, l'API genere `item.eriniumfaction.X.name`. Si en doute, fournir les deux formats.

---

## 2026-05-05 — Modeles 3D Blockbench : texture_size global incompatible avec textures multi-tailles

**Systeme** : `RenderPlasmaExtractor` / `RenderFactionBeacon` (TESR Blockbench Phase 10)
**Probleme** : Le Faction Beacon affichait un rendu totalement casse (textures glitchees, taille incorrecte). Le Plasma Extractor avait les bonnes formes 3D mais des textures glitchees (couleurs/patterns aleatoires).
**Cause racine** : Le format Blockbench JSON ne supporte qu'un SEUL `texture_size` global pour toutes les textures du modele. Or :
- Faction Beacon : `texture_size: [168, 168]` declare, mais les UV vont de 0 a ~15.81 (tres petite zone). Avec `uv / textureSize` = 0..0.094 → seulement 9% de la texture etait lue (toujours le coin haut-gauche).
- Plasma Extractor : `texture_size: [32, 32]` declare, 8 textures de tailles differentes (32x32 a 448x448), UVs jusqu'a 16. Avec `uv / 32` = 0..0.5 → seulement la moitie de chaque texture lue, mais a un endroit qui ne correspond pas au contenu reel.

Les UV ont ete generees par Blockbench avec un `texture_size` LOGIQUE de 16 (taille de reference par texture, peu importe la resolution reelle). Le parser EriAPI utilise correctement ce ratio (`uv / textureSize`). Le probleme etait dans le `texture_size` declare dans le JSON, pas dans le parser.
**Solution** : Changer `texture_size` dans les deux JSON en `[16, 16]` (au lieu de [168,168] pour faction_beacon et [32,32] pour plasma_extractor). Apres ce fix, les UV se normalisent correctement en 0..1 et chaque texture est mappee sur l'integralite de sa surface (ou la zone de contenu reelle si l'UV max est inferieur a 16).
**Regle** : Pour tout modele Blockbench parse par `BlockbenchModelParser` :
1. Verifier le UV max reel (`max(uv[0], uv[2])` et `max(uv[1], uv[3])` sur toutes les faces).
2. Le `texture_size` du JSON doit egal au UV max (typiquement 16 ou 32). Ne JAMAIS confondre avec la taille pixel de la texture image — les UV Blockbench sont en pixels logiques, pas en pixels reels.
3. Si plusieurs textures de tailles differentes sont utilisees, elles seront toutes mappees au meme `texture_size` logique. C'est OK tant que les UV ont ete generees coherentes.

---

## 2026-05-05 — TESR modeles Blockbench : frustum culling premature pour modeles depassant le bloc

**Systeme** : `TileEntityFactionBeacon` (TESR Blockbench Phase 10)
**Probleme** : Le modele 3D du Faction Beacon disparaissait quand on s'eloignait ou regardait depuis certains angles, alors qu'il aurait du rester visible.
**Cause racine** : Par defaut, `TileEntity#getRenderBoundingBox()` retourne un AABB de 1x1x1 sur le bloc. Si le modele 3D rendu par le TESR depasse cette boite (meme apres scaling), le frustum culling le supprime des qu'aucune partie de la boite 1x1x1 n'est visible. Pour le Faction Beacon, le modele scale tient en hauteur (1 bloc) mais peut avoir des effets visuels au-dessus.
**Solution** : Override `getRenderBoundingBox()` dans le TileEntity et retourner une AABB plus large (ex : 1x2x1 pour englober le bloc + 1 bloc au-dessus). `@SideOnly(Side.CLIENT)` car cette methode n'existe que cote client.
**Regle** : Pour tout TileEntity rendu par un TESR avec un modele 3D qui peut depasser le cube 1x1x1 (en hauteur, en largeur, ou en profondeur), TOUJOURS overrider `getRenderBoundingBox()` avec une AABB englobant la silhouette reelle du modele. Sans ca, le modele subit du frustum culling premature.

---

## 2026-05-05 — EriAPI 1.6.7 : modeles Blockbench decales par rapport a la hitbox

**Systeme** : `fr.eri.eriapi.anim.AnimatedEntityRenderer` (rendu d'entites animees)
**Probleme** : Les entites custom Spatial Update apparaissaient visuellement decalees d'environ un demi-bloc par rapport a leur hitbox de collision. La selection (outline) ne correspondait pas au modele affiche, et certaines animations de deplacement semblaient "glisser" hors de la position reelle.
**Cause racine** : Les modeles Blockbench sont concus avec leur point d'origine au coin (0,0,0) et leur silhouette centree sur le pivot du modele aux coordonnees pixel (8, 0, 8) — soit (0.5, 0, 0.5) en coordonnees GL apres le `scale(1/16)`. Apres `GlStateManager.translate(x, y, z)` sur la position de l'entite et le `rotate(yaw)`, on rendait directement les cubes Blockbench sans recentrer : le modele etait donc decale de +0.5 sur X et +0.5 sur Z par rapport au centre de la hitbox.
**Solution** : Ajouter `GlStateManager.translate(-0.5f, 0.0f, -0.5f)` immediatement apres la rotation yaw dans `doRender()`, AVANT le scale 1/16 et le rendu des elements. Cela aligne le pivot Blockbench (0.5,0,0.5) sur le centre de l'entite (0,0,0).
**Regle** : Pour tout renderer Blockbench (entity ou TESR), le pipeline doit etre `translate(entityPos) -> rotate(yaw) -> translate(-0.5,0,-0.5) -> scale(1/16) -> render`. Ne jamais oublier le recentrage post-rotation.

---

## 2026-05-05 — EriAPI 1.6.7 : mobs hostiles attaquent les joueurs en creatif/spectateur

**Systeme** : `EriEntityBase`, `GeneratedEntity`, `PathfinderBuilder.targetPlayers()` (AI hostile)
**Probleme** : Les entites custom (HOSTILE_MELEE, HOSTILE_RANGED, BOSS) ciblaient et attaquaient les joueurs en mode creatif et spectateur, ce qui empechait la moderation et le test des donjons.
**Cause racine** : Les taches `EntityAINearestAttackableTarget(creature, EntityPlayer.class, true)` (constructeur 3 args) n'appliquent aucun filtre sur le joueur cible. Vanilla zombie/skeleton utilisent un Predicate qui exclut les creatifs, mais notre framework d'entite ne le fournissait pas.
**Solution** : Utiliser le constructeur 6 args `EntityAINearestAttackableTarget(creature, EntityPlayer.class, 10, true, false, predicate)` avec un singleton statique `Predicate<EntityPlayer> NON_CREATIVE_PLAYER` qui retourne `!p.isCreative() && !p.isSpectator()`. Singleton (pas lambda par instance) pour eviter les allocations a 500-1000 joueurs.
**Regle** : Toute tache `EntityAINearestAttackableTarget` ciblant `EntityPlayer.class` DOIT utiliser le constructeur 6 args avec un Predicate filtrant `isCreative()` et `isSpectator()`. Ne jamais utiliser le constructeur 3 args pour des cibles joueur.

---

## 2026-05-05 — EriAPI 1.6.7 : chute de FPS sur modeles Blockbench a beaucoup de cubes

**Systeme** : `AnimatedEntityRenderer.renderElement()` / `drawFace()` (rendu OpenGL immediate mode)
**Probleme** : FPS qui chute drastiquement (5-15 FPS au lieu de 60) lorsque plusieurs entites avec modeles complexes (Crystal Golem, Echolith, Impact Brute - 30+ cubes) sont visibles a l'ecran. Profiling : la majorite du temps est passee dans les appels OpenGL, pas dans la logique d'animation.
**Cause racine** : L'ancienne methode `drawFace()` faisait un cycle complet `tessellator.getBuffer().begin(QUADS, ...)` -> `pos().tex().endVertex()` x4 -> `tessellator.draw()` POUR CHAQUE FACE. Pour un cube = 6 begin/draw. Pour 30 cubes = 180 begin/draw par frame par entite. Chaque `draw()` est un flush GPU coûteux.
**Solution** : Refactor du pipeline en batching par texture :
1. Premier passage : grouper toutes les faces de l'element par texture
2. Pour chaque groupe de texture : `bindTexture(tex)` puis UN SEUL `buffer.begin(QUADS, POSITION_TEX)` puis appel a `appendFaceVertices(buffer, from, to, facing, face)` pour chaque face (juste les `pos().tex().endVertex()` x4, sans begin/draw), puis UN SEUL `tessellator.draw()` final.
Resultat : 6x a 12x reduction du nombre de draw calls par element (1 draw par texture au lieu de 1 draw par face).
**Regle** : En OpenGL immediate mode (Tessellator/BufferBuilder), TOUJOURS batcher les vertices par texture. Un `begin()`/`draw()` est un cycle GPU coûteux — minimiser leur frequence est la premiere optimisation a faire pour tout renderer custom.

---

## 2026-05-01 — Phase 9 : EntityTNTPrimed.explode() est private (non-overridable)

**Systeme** : EntityModdedTNTPrimed (Phase 9 — TNT custom)
**Probleme** : Tentative d'override `protected void explode()` dans une sous-classe d'`EntityTNTPrimed` -> `error: method does not override or implement a method from a supertype`. La methode `explode()` de `EntityTNTPrimed` est `private` en stable_39, donc impossible a overrider directement.
**Cause racine** : Le code vanilla declare `private void explode()` dans `EntityTNTPrimed`. Etendre la classe ne donne pas acces a la methode et `@Override` echoue.
**Solution** : Ne PAS etendre `EntityTNTPrimed`. A la place, etendre `Entity` directement et reimplementer la mecanique : DataParameter `FUSE`, `setSize(0.98F, 0.98F)`, `entityInit()`, `onUpdate()` qui gere gravite (`motionY -= 0.04`), `move(MoverType.SELF, motionX, motionY, motionZ)`, friction (`*0.98`), bounce (`*0.7` + `motionY*=-0.5` au sol), decrement fuse, et appel a `world.createExplosion(this, posX, posY + height/16.0F, posZ, power, false)` quand fuse atteint 0.
**Regle** : Avant d'override une methode "protected" supposee, TOUJOURS verifier avec `javap -p <classpath> <className>` que la methode est bien `protected` et non `private`. La signature `private` ne descend pas dans les sous-classes.

---

## 2026-05-01 — Block.onBlockDestroyedByExplosion -> onExplosionDestroy en stable_39

**Systeme** : BlockModdedTNT (Phase 9)
**Probleme** : `@Override public void onBlockDestroyedByExplosion(World, BlockPos, Explosion)` -> `error: method does not override or implement a method from a supertype`.
**Cause racine** : Avec les mappings stable_39, le nom MCP est `onExplosionDestroy(World, BlockPos, Explosion)`. `onBlockDestroyedByExplosion` etait l'ancien nom MCP.
**Solution** : Renommer en `onExplosionDestroy`. La methode est appelee par `Block#onBlockExploded` (Forge wrapper) quand l'explosion detruit le bloc.
**Regle** : Toujours utiliser `onExplosionDestroy` en stable_39. Pour reagir au declenchement par explosion (chain reaction TNT), utiliser cette methode.

---

## 2026-05-01 — SoundType.GRASS n'existe pas en stable_39

**Systeme** : BlockModdedTNT (Phase 9)
**Probleme** : `setSoundType(SoundType.GRASS)` -> `cannot find symbol: variable GRASS`.
**Cause racine** : En stable_39, l'enum `SoundType` contient `WOOD, GROUND, PLANT, STONE, METAL, GLASS, CLOTH, SAND, SNOW, LADDER, ANVIL, SLIME` — pas de `GRASS`. Vanilla TNT utilise `PLANT`.
**Solution** : Remplacer `SoundType.GRASS` par `SoundType.PLANT`.
**Regle** : Pour un bloc de type herbe/feuille/TNT vanilla, utiliser `SoundType.PLANT`. Verifier avec `javap` les constantes disponibles avant d'en utiliser une.

---

## 2026-04-29 — Combat Log : ecran de mort + bouton Respawn au reconnect

**Systeme** : CombatEventHandler.onPlayerLogout (Combat Tag)
**Probleme** : Quand un joueur se deconnecte en combat, le serveur le tuait via `attackEntityFrom(OUT_OF_WORLD, MAX_VALUE)`. Au reconnect, le joueur voyait l'ecran de mort vanilla avec le bouton "Respawn" qui le TP au spawn, ce qui cassait l'experience (UI vanilla intrusive).
**Cause racine** : Tuer un joueur deconnecte declenche le flow de mort vanilla. L'etat "isDead" est serialise dans le NBT, donc au reconnect le client affiche `GuiGameOver` au lieu d'apparaitre directement en jeu.
**Solution** : Ne PAS tuer le joueur dans `onPlayerLogout`. A la place :
1. Drop tout l'inventaire au sol via `player.dropItem(stack, true, false)` (slot par slot, puis `setNoPickupDelay()` + `lifespan = 6000`).
2. `player.setHealth(player.getMaxHealth())`.
3. `player.getFoodStats().setFoodLevel(20)` + reflexion sur `field_75126_e` pour la saturation (CleanRoom).
4. Effacer tous les effets (`removePotionEffect` sur la liste copiee).
5. `clearCombat(uuid)`.
6. Si dimension != 0 : forcer `player.dimension = 0` + `player.setWorld(overworld)` (pas de `transferPlayerToDimension` en plein logout, le joueur va etre detache).
7. `player.setPositionAndUpdate(spawnX, spawnY, spawnZ)` — la position est serialisee dans le NBT et le joueur reapparait au spawn au reconnect.
**Regle** : Pour penaliser un joueur qui se deconnecte (combat log, AFK kick, etc.), JAMAIS le tuer via `attackEntityFrom`. Manipuler directement son etat (HP, inv, position) avant que le NBT soit serialise.

---

## 2026-04-29 — CombatOverlay : texte "Combat" coupe en "Comba"

**Systeme** : CombatOverlay (overlay HUD du Combat Tag)
**Probleme** : Le texte affiche etait coupe ("Comba" au lieu de "Combat 15s").
**Cause racine** : Le `Label` avait `originalSize(DESIGN_W - 56, 20)` avec `scale(1.5f)` mais sans `scaleToFit(true)`. La largeur (200 - 56 = 144 design px) etait insuffisante pour le texte mis a l'echelle 1.5x, et le rendu ne reduisait pas automatiquement la taille pour rentrer.
**Solution** : Activer `scaleToFit(true)` sur le `Label` EriAPI — l'API reduit alors la scale effective pour que le texte rentre dans la box. Egalement augmenter `DESIGN_W` (200 -> 280), centrer (`align(Align.CENTER)`), et augmenter la hauteur de la box texte (20 -> 28) pour eviter le clip vertical.
**Regle** : Pour tout `Label` EriAPI dont le texte peut depasser la box (texte dynamique avec valeurs variables, traductions plus longues), TOUJOURS appeler `.scaleToFit(true)`. Combiner avec `align(Align.CENTER)` pour un rendu propre.

---

## 2026-04-29 — Vec3d.lengthVector() inexistant en stable_39

**Systeme** : EntityFlare / EntityGrapplingHook (Phase 7)
**Probleme** : `Vec3d#lengthVector()` -> `cannot find symbol`. Methode absente du Vec3d 1.12.2 stable_39.
**Cause racine** : Avec les mappings stable_39, la methode s'appelle simplement `length()`. `lengthVector` etait un nom MCP plus ancien.
**Solution** : Remplacer `vec.lengthVector()` par `vec.length()`. Disponibles aussi : `lengthSquared()`, `distanceTo(Vec3d)`, `squareDistanceTo(...)`.
**Regle** : Utiliser `Vec3d#length()` en stable_39. Verifier la signature avec `javap forge-recomp.jar net.minecraft.util.math.Vec3d` avant de coder.

---

## 2026-04-29 — WorldServer.spawnParticle ambiguite sur litteraux entiers

**Systeme** : EntityFlare (Phase 7 — Flashbang)
**Probleme** : Build failed avec `reference to spawnParticle is ambiguous` sur `ws.spawnParticle(EnumParticleTypes.X, posX, posY, posZ, 1, 0, 0, 0, 0)`.
**Cause racine** : `World#spawnParticle(EnumParticleTypes, double, double, double, double, double, double, int...)` (8 args + varargs) et `WorldServer#spawnParticle(EnumParticleTypes, double, double, double, int, double, double, double, double, int...)` (9 args + varargs) sont toutes deux candidates quand on passe `0` (litteral entier qui peut s'interpreter en int OU double).
**Solution** : Toujours passer des litteraux double explicites (`0.0` au lieu de `0`) quand on appelle `WorldServer.spawnParticle` avec le 5e argument `int particleCount`.
**Regle** : `ws.spawnParticle(EnumParticleTypes.EXPLOSION_LARGE, x, y, z, count, 0.0, 0.0, 0.0, 0.0)` — toujours `0.0`, jamais `0`.

---

## 2026-04-28 — Phase 6 R&D Table : Component.Direction.TOP inexistant

**Systeme** : GuiRnDTable (Phase 6)
**Probleme** : Build failed avec `cannot find symbol: variable TOP, location: class Direction` sur l'appel `title.slideIn(Component.Direction.TOP, 40, 10)`.
**Cause racine** : L'enum `fr.eri.eriapi.gui.core.Component.Direction` ne contient que les valeurs `UP, DOWN, LEFT, RIGHT` — pas `TOP/BOTTOM`. C'est une convention "directionnelle" (mouvement) et non "positionnelle" (cote).
**Solution** : Remplacer `Component.Direction.TOP` par `Component.Direction.UP` (slide depuis le haut = mouvement vers le bas, mais l'enum nomme la direction d'origine "UP" cad le titre vient du haut).
**Regle** : Toujours verifier les valeurs d'un enum EriAPI avec `javap -classpath libs/eriapi-X.Y.Z-1.12.2.jar 'fr.eri.eriapi.gui.core.Component$Direction'` AVANT d'utiliser. Ne jamais supposer les noms (TOP/BOTTOM vs UP/DOWN).

---

## 2026-04-25 — Fusee : decollage immobile (motionY sans deplacement reel)

**Systeme** : EntityRocket (Phase 5)
**Probleme** : Apres declenchement du decollage, la fusee jouait les particules et le son mais ne montait pas physiquement (posY ne changeait pas). Resultat : aucun TP, le joueur reste au sol.
**Cause racine** : `EntityRocket extends Entity` (pas `EntityLivingBase`). La methode `Entity.onUpdate()` de base **ne fait pas** d'appel implicite a `move()` — contrairement a `EntityLivingBase.onUpdate()` qui appelle `travel()` -> `move()`. Set `motionY` ne suffit donc pas : il faut explicitement appeler `this.move(MoverType.SELF, motionX, motionY, motionZ)`.
**Solution** : Apres `super.onUpdate()` dans la phase d'ascension (launchTick > WARMUP_TICKS), ajouter `this.move(MoverType.SELF, motionX, motionY, motionZ)`.
**Regle** : Pour toute entite qui etend `Entity` directement (et non `EntityLivingBase`/`EntityMinecart`), si tu modifies `motionX/Y/Z`, tu DOIS appeler explicitement `move()` pour que le deplacement soit applique.

## 2026-04-25 — Rocket Maker GUI : layout chevauche + labels texte illisibles

**Systeme** : GuiRocketMaker / ContainerRocketMaker (Phase 5)
**Probleme** : ySize=200, bouton "Assembler" a Y=172 (cy+ySize-28), hotbar a Y=178-194 → bouton chevauche le hotbar. Labels de slots reduits a 3 chars ("Cou", "Mot", "Res") illisibles.
**Solution** :
1. ySize=220, inventaire joueur Y=108, hotbar Y=166, bouton a Y=cy+ySize-26=cy+194 (sous le hotbar qui finit a 182).
2. Suppression de SLOT_LABELS, remplacement par des icons d'items en gris fantome via `RenderHelper.enableGUIStandardItemLighting()` + `GlStateManager.color(0.35f, 0.35f, 0.35f, 1f)` + `renderItemIntoGUI()`.
**Regle** : Pour un GUI custom, toujours verifier que le bouton final est sous le hotbar. Hauteur typique : titre (24) + slots TE (70) + status/inventory_label (15) + inventory (54) + hotbar_gap (4) + hotbar (16) + button_gap+button (26) ≈ 220.

---

## 2026-04-25 — Gravity Trap : implementation complete

**Systeme** : BlockGravityTrap / TileEntityGravityTrap
**Etat precedent** : Le bloc existait mais update() etait vide (stub) et ownerFactionId jamais assignee au placement.
**Ce qui a ete ajoute** :
1. `onBlockPlacedBy` dans BlockGravityTrap : verifie que le chunk est claime par la faction du joueur via `FactionManager.getFactionAt()`, refuse le placement sinon (casse + redrop l'item), assigne `ownerFactionId` via `TileEntityGravityTrap.setOwnerFactionId()`.
2. `update()` dans TileEntityGravityTrap : check toutes les 5 ticks, detecte les joueurs ennemis dans la hitbox etendue (+1.5 Y), les propulse Y=+3.5 (≈15 blocs), detruit le bloc apres activation (usage unique).

---

## Blocks / Rendering

### getBlockLayer() est @SideOnly(Side.CLIENT) sur Block.class en Forge 1.12.2
- **Date** : 2026-04-24
- **Systeme** : BlockRocketMaker (Phase 5 — Fusee)
- **Probleme** : Ajout d'un `@Override public BlockRenderLayer getBlockLayer()` qui retournait `BlockRenderLayer.SOLID`. Build failed : `error: method does not override or implement a method from a supertype`.
- **Cause** : La methode `getBlockLayer()` de `net.minecraft.block.Block` est annotee `@SideOnly(Side.CLIENT)`. Le compilateur ne la voit pas comme surchargeable dans les builds neutres/serveur selon le classpath utilise, ce qui provoque l'erreur `@Override`.
- **Solution** : Supprimer purement et simplement la methode si elle retourne `BlockRenderLayer.SOLID` (c'est la valeur par defaut de tous les blocs). Alternative : ajouter `@SideOnly(Side.CLIENT)` sur la methode + l'import `net.minecraftforge.fml.relauncher.{Side,SideOnly}`.
- **Regle** : Ne JAMAIS override `getBlockLayer()` pour retourner SOLID (inutile). Ne le faire que pour CUTOUT, CUTOUT_MIPPED, TRANSLUCENT — et dans ce cas, ajouter `@SideOnly(Side.CLIENT)`.

### Block#getRenderLayer() vs getBlockLayer() — nom different selon mappings
- **Date** : 2026-04-29
- **Systeme** : BlockForceField (Phase 7 — Force Shield)
- **Probleme** : `@Override public BlockRenderLayer getBlockLayer()` echoue : `error: method does not override or implement a method from a supertype`. Pourtant l'annotation `@SideOnly(Side.CLIENT)` etait presente.
- **Cause** : Avec les mappings stable_39 utilises par ce projet, le nom MCP de la methode est `getRenderLayer()` (et non `getBlockLayer()`). L'ancien nom MCP existait dans des mappings plus vieux. Comparer avec d'autres blocs : `BlockCave.getRenderLayer()` compile parfaitement.
- **Solution** : Renommer `getBlockLayer()` en `getRenderLayer()`. Garder `@SideOnly(Side.CLIENT)` et le retour `BlockRenderLayer.TRANSLUCENT/CUTOUT_MIPPED`.
- **Regle** : Toujours utiliser `getRenderLayer()` en stable_39. Verifier le nom en grep d'un bloc existant qui override (ex: BlockCave) avant de coder.

### SoundEvents.BLOCK_BEACON_ACTIVATE n'existe pas en 1.12.2
- **Date** : 2026-04-29
- **Systeme** : ItemForceShield (Phase 7)
- **Probleme** : `SoundEvents.BLOCK_BEACON_ACTIVATE` introuvable. Compile : `cannot find symbol: variable BLOCK_BEACON_ACTIVATE`.
- **Cause** : En 1.12.2 il n'y a pas de constante `BLOCK_BEACON_ACTIVATE`. Les sons Beacon disponibles sont `BLOCK_BEACON_AMBIENT`, `BLOCK_BEACON_ACTIVATE` n'existe que dans 1.13+.
- **Solution** : Pour un placement de bloc translucide, utiliser `SoundEvents.BLOCK_GLASS_PLACE` (cohérent visuellement). Toujours grep dans le projet (`SoundEvents\.`) pour confirmer qu'un son est deja utilise avant de l'ajouter.

### Vec3d.addVector(double, double, double) renommé en add(double, double, double) en 1.12.2 stable_39
- **Date** : 2026-04-29
- **Systeme** : ItemGrapplingHook (Phase 7)
- **Probleme** : `eye.addVector(...)` introuvable.
- **Cause** : Avec stable_39, la methode s'appelle simplement `add(x, y, z)`. `addVector` etait un nom MCP plus ancien.
- **Solution** : Remplacer `vec.addVector(x, y, z)` par `vec.add(x, y, z)`. Idem pour `vec.add(otherVec3d)` qui existe aussi en surcharge.

### EntityPlayerSP vit dans net.minecraft.client.entity (pas player)
- **Date** : 2026-04-24
- **Systeme** : RocketLaunchOverlay (Phase 5)
- **Probleme** : Import `net.minecraft.entity.player.EntityPlayerSP` → `cannot find symbol`.
- **Cause** : En Forge 1.12.2, `EntityPlayerSP` est dans `net.minecraft.client.entity` (c'est une classe client-side). Seul `EntityPlayer` et `EntityPlayerMP` sont dans `net.minecraft.entity.player`.
- **Solution** : Utiliser `import net.minecraft.client.entity.EntityPlayerSP;`.

---

## WorldGen / Biomes

### Collision de ResourceLocation entre biomes Overworld et Erina
- **Date** : 2026-04-24
- **Systeme** : ErinaBiomes (Phase 4) + EriniumBiomes (Overworld WorldEnhanced)
- **Probleme** : Crash au demarrage serveur avec `[WARN] Registry Biome: Override did not have an associated owner object. Name: eriniumfaction:crystal_plains` suivi de `RuntimeException: One of more entry values did not copy to the correct id` dans `ForgeRegistry.sync()` / `GameData.freezeData()`.
- **Cause** : Deux biomes distincts (`world.biome.special.BiomeCrystalPlains` pour l'Overworld et `erina.biome.BiomeCrystalPlains` pour la dimension Erina) etaient enregistres avec le MEME `ResourceLocation` (`eriniumfaction:crystal_plains`). Forge considere le second comme un "override" du premier, mais comme il vient du meme mod ID, l'owner check echoue et la sync du registre plante.
- **Solution** : Prefixer tous les 12 biomes de la dimension Erina avec `erina_` dans leur registry name (`erina_crystal_plains`, `erina_glow_forest`, etc.). Mis a jour : `ErinaBiomes.registerBiomes()` + cles de traduction `biome.eriniumfaction.erina_*.name` dans `fr_FR.lang` et `en_US.lang`. Aucun impact sur le code runtime (les references utilisent les constantes `ErinaBiomes.CRYSTAL_PLAINS`, pas la string).
- **Regle** : Quand tu ajoutes un biome dans une dimension custom (Erina, Nether custom, etc.), toujours prefixer le registry name avec le nom de la dimension pour eviter les collisions avec les biomes Overworld (qui en comptent 53+).

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

---

### 2026-04-24 — MapGenCaves.digBlock() signature changee en 1.12.2
- **Système** : `erina/gen/cave/MapGenErinaCaves.java` (WorldGen Phase 4)
- **Problème** : Build failed avec `method digBlock in class MapGenCaves cannot be applied to given types; required: ChunkPrimer,int,int,int,int,int,boolean,IBlockState,IBlockState; found: ChunkPrimer,int,int,int,int,int,boolean`.
- **Cause** : En 1.12.2, la signature vanilla de `MapGenCaves#digBlock()` a 9 paramètres (ajoute `IBlockState state, IBlockState above` à la fin) et non 7 comme sur des versions plus anciennes. La signature à 7 paramètres est une mauvaise référence (1.10 ou earlier).
- **Solution** : Soit utiliser la signature complète `(ChunkPrimer, int, int, int, int, int, boolean, IBlockState, IBlockState)`, soit ne PAS override `digBlock()` et se contenter de `canReplaceBlock(IBlockState, IBlockState)` pour filtrer les blocs qu'on peut creuser. Pour les caves Erina on a choisi la 2e option.
- **Règle** : Avant d'override une méthode d'une classe vanilla, TOUJOURS vérifier la signature exacte en 1.12.2 (via `docs/1.12.2/` ou la Javadoc en ligne). Ne jamais supposer d'après une autre version.

### 2026-04-24 — ForgeEventFactory.onChunkPopulate() renvoie void, pas boolean
- **Système** : `erina/gen/ErinaChunkGenerator.java` (WorldGen Phase 4)
- **Problème** : Build failed avec `incompatible types: void cannot be converted to boolean` sur `boolean populateEvent = ForgeEventFactory.onChunkPopulate(true, this, world, rand, chunkX, chunkZ, false);`.
- **Cause** : `ForgeEventFactory.onChunkPopulate(boolean pre, IChunkGenerator gen, World world, Random rand, int chunkX, int chunkZ, boolean hasVillage)` renvoie `void` en 1.12.2 — il publie simplement `PopulateChunkEvent.Pre` ou `PopulateChunkEvent.Post`. Il n'y a PAS de boolean de retour pour annuler.
- **Solution** : Appeler `ForgeEventFactory.onChunkPopulate(true, ...)` en Pre, exécuter la population, puis `ForgeEventFactory.onChunkPopulate(false, ...)` en Post — sans stocker ni conditionner le résultat.

### 2026-04-24 — Loot table pool manque le champ `name` (Forge 1.12.2)
- **Système** : `assets/eriniumfaction/loot_tables/chests/alien_ruins.json`
- **Problème** : Erreur au démarrage serveur `JsonParseException: Loot Table "..." Missing 'name' entry for pool #0`.
- **Cause** : Forge 1.12.2 exige un champ `"name"` sur chaque objet pool dans les loot tables (ajout Forge absent du format vanilla). Oublier ce champ cause un crash `JsonParseException` au chargement.
- **Solution** : Ajouter `"name": "main"` (pool principal) et `"name": "rare"` (pools secondaires) à chaque entrée du tableau `"pools"`.
- **Règle** : TOUJOURS inclure `"name"` sur chaque pool dans tous les fichiers loot table. Format correct : `{ "name": "main", "rolls": ..., "entries": [...] }`.
- **Règle** : Les events Forge "Pre/Post" sont à fire-and-forget sauf si l'API explicitement renvoie un boolean (rare). Ne jamais supposer un contrat de retour sans vérifier.

## 2026-04-25 — CreativeTabs.getTabLabel() absent de CleanRoom

**Système** : ErinaBlocks / ErinaCreativeTab  
**Problème** : `NoSuchMethodError: 'java.lang.String net.minecraft.creativetab.CreativeTabs.func_78013_b()'` au démarrage du serveur (ErinaBlocks.register(), ligne 117).  
**Cause** : `getTabLabel()` (SRG `func_78013_b`) n'existe pas dans CleanRoom — méthode supprimée/renommée par rapport au Forge 1.12.2 standard.  
**Solution** : Remplacer `erinaTab.getTabLabel()` dans le message de log par un message statique sans appel à cette méthode. En général : ne JAMAIS appeler `getTabLabel()` sur un `CreativeTabs` — CleanRoom ne le supporte pas.

## 2026-04-25 — NoClassDefFoundError EntityPlayerSP dans le handler reseau serveur

**Système** : Phase 5 Rocket / RocketLaunchHandler
**Problème** : `NoClassDefFoundError: net/minecraft/client/entity/EntityPlayerSP` au declenchement du lancement fusee (touche Y), thread serveur.
**Cause** : `RocketLaunchHandler.java` importait `net.minecraft.client.Minecraft` en en-tete. Quand le serveur charge la classe pour invoquer `handleLaunchRequest()` (appele depuis `CommonProxy`), Java resout aussi les imports en-tete et descend la chaine de classes client (`Minecraft` → `EntityPlayerSP`) → crash CleanRoom / serveur dedie.
**Solution** : Separer en deux classes : `RocketServerHandler.java` (zero import client, utilise par `CommonProxy`) et `RocketLaunchHandler.java` (client uniquement, ouvre les GUIs et envoie les packets). `CommonProxy` ne reference plus que `RocketServerHandler`.
**Règle générale** : Toute classe referencee depuis `CommonProxy` (ou tout code commun) NE DOIT PAS importer des classes `net.minecraft.client.*` ou des classes EriAPI client (`EriGuiScreen`, etc.) — meme dans les en-tetes d'import. Si une logique necessite un import client, la deplacer dans une classe dediee client-only et la referencer uniquement depuis `ClientProxy` (ou via un hook callback). C'est la meme contrainte que les Mixins.

---

## 2026-05-04 — NoClassDefFoundError: Could not initialize class ErinaBiomes (spawn lambdas pendant preInit)

**Système** : EntityRegistryEF — enregistrement des 13 mobs de la Spatial Update (Erina)
**Problème** : Crash serveur au démarrage : `java.lang.NoClassDefFoundError: Could not initialize class fr.eriniumgroup.eriniumfaction.erina.biome.ErinaBiomes` dans les lambdas `.spawn()` de `EntityRegistryEF`.
**Cause racine** : Les lambdas `.spawn(s -> s.biome(ErinaBiomes.CRYSTAL_PLAINS))` forcent l'initialisation statique (`<clinit>`) de la classe `ErinaBiomes` au moment où ces lambdas sont créées — c'est-à-dire pendant `preInit`. Or `ErinaBiomes` possède des champs `public static final Biome CRYSTAL_PLAINS = new BiomeCrystalPlains()` qui peuvent échouer si les dépendances ne sont pas encore prêtes à ce stade du cycle de vie Forge.
**Solution** : Ne JAMAIS référencer directement les champs statiques de `ErinaBiomes` (ou de tout registre de biomes) depuis des lambdas créées pendant `preInit`. Utiliser à la place `Biome.REGISTRY.getObject(new ResourceLocation(MODID, "erina_xxx"))` — les biomes sont déjà dans le registre après `RegistryEvent.Register<Biome>` (qui s'exécute avant `preInit`), mais cet appel ne force pas l'initialisation de `ErinaBiomes`. Toujours null-checker le résultat (`if (b != null) s.biome(b)`).

```java
// ❌ Crash : force ErinaBiomes.<clinit> pendant preInit
.spawn(s -> s.biome(ErinaBiomes.CRYSTAL_PLAINS))

// ✅ Correct : lookup registre safe
private static Biome eb(String name) {
    return Biome.REGISTRY.getObject(new ResourceLocation(EriniumFaction.MODID, name));
}
.spawn(s -> {
    Biome b = eb("erina_crystal_plains");
    if (b != null) s.biome(b);
})
```

**Règle** : Pour tout enregistrement d'entité avec spawn dans un biome custom, utiliser exclusivement `Biome.REGISTRY.getObject()` dans les lambdas. Supprimer l'import de la classe registre de biomes (ex: `ErinaBiomes`) si elle n'est plus nécessaire ailleurs dans le fichier.

---

## 2026-05-05 — EriEntityBase : eriDef null pendant initEntityAI / applyEntityAttributes

**Système** : EriAPI 1.6.5 → 1.6.6 — `fr.eri.eriapi.content.EriEntityBase`
**Problème** : Les 13 mobs de la Spatial Update spawnaient avec :
- aucune AI (immobiles, ne ciblent rien)
- les stats vanilla par défaut (10 HP, sans armure ni damage configurés)

Or `EriEntityDef` définissait correctement HP, damage, armor, AI flags (`canSwim`, `canAttackPlayer`, etc.).
**Cause racine** : Le constructeur `EriEntityBase(World world)` appelait `super(world)`. Le constructeur de `EntityLiving` (Minecraft) invoque virtuellement `applyEntityAttributes()` puis `initEntityAI()` AVANT que le constructeur de la sous-classe `EriEntityBase` ait pu assigner `this.eriDef = ContentRegistry.getEntityDef(...)`. Donc dans ces deux méthodes, `eriDef == null` et toute la configuration custom était silencieusement ignorée (early-return).
**Solution** : Restructurer `EriEntityBase` :
1. Les overrides `applyEntityAttributes()` et `initEntityAI()` sont des no-ops (juste `super` quand nécessaire) — ils ne peuvent rien faire d'utile vu le timing du super().
2. Le constructeur fait `super(world)` puis :
   - assigne `this.eriDef = ContentRegistry.getEntityDef(...)`
   - appelle `applyEriAttributes()` (méthode privée) qui lit `eriDef` et configure les attributs
   - appelle `setupEriAI()` (méthode privée) qui ajoute les tâches AI selon `eriDef` flags
   - appelle `setHealth(getMaxHealth())` (sinon HP reste à 10 même après `applyEriAttributes`)
3. Bump version 1.6.5 → 1.6.6 et rebuild EriAPI + update jar dans EriniumFaction.

**Règle générale** : Quand on étend une classe vanilla qui appelle des méthodes virtuelles dans son constructeur (`EntityLiving`, `Block`, `Item`...), NE JAMAIS supposer que le state de la sous-classe est initialisé dans ces méthodes virtuelles. Utiliser un pattern à deux phases : super() → init du state → méthode privée qui consomme le state.

---

## 2026-05-05 — Texture path double "textures/" avec BlockbenchModelParser

**Système** : 13 entity model JSONs (Spatial Update) + textures pink/black à l'écran
**Problème** : Tous les modèles entity de la Spatial Update affichaient les textures roses/noires (texture introuvable). Aucune erreur visible côté serveur.
**Cause racine** : `BlockbenchModelParser.parseJson()` (EriAPI) ajoute automatiquement le préfixe `textures/` et le suffixe `.png` aux références de texture. Donc `"eriniumfaction:textures/entity/crystallite/body"` devient `eriniumfaction:textures/textures/entity/crystallite/body.png` — chemin inexistant.
**Solution** : Dans les JSON Blockbench, retirer le préfixe `textures/` des valeurs de `"textures": {...}`. Format correct : `"eriniumfaction:entity/crystallite/body"` (le parser ajoute `textures/` + `.png` lui-même).

```json
// ❌ Mauvais — produit "textures/textures/entity/.../body.png"
"textures": {
  "0": "eriniumfaction:textures/entity/crystallite/body",
  "particle": "eriniumfaction:textures/entity/crystallite/body"
}

// ✅ Correct — produit "textures/entity/.../body.png"
"textures": {
  "0": "eriniumfaction:entity/crystallite/body",
  "particle": "eriniumfaction:entity/crystallite/body"
}
```

**Règle** : Pour tous les modèles Blockbench (entity ET block) parsés par `BlockbenchModelParser`, n'inclure JAMAIS le préfixe `textures/` ni le suffixe `.png` dans les valeurs de la map `"textures"`. Format : `"<modid>:<chemin-relatif-à-textures/>"`. Pour des textures vanilla : `"minecraft:blocks/glass"`.


## 2026-05-05 — Import WorldClient dans le mauvais package

**Systeme** : ErinaDimensionAmbience.java (event handler client tick)
**Probleme** : Build failed avec `cannot find symbol class WorldClient` lors de l'import `net.minecraft.world.WorldClient`.
**Cause racine** : Confusion package — `WorldClient` est dans `net.minecraft.client.multiplayer`, pas dans `net.minecraft.world` (ou serait le `World` server-side).
**Solution** : Utiliser `import net.minecraft.client.multiplayer.WorldClient;`.
**Regle** : Cote client side-only, `Minecraft.getMinecraft().world` retourne un `WorldClient`. Toujours importer depuis `net.minecraft.client.multiplayer.WorldClient`.


## 2026-05-07 — SkinNetwork constructor private blocks @SubscribeEvent registration

**Systeme** : SkinNetwork.java (custom skin sync)
**Probleme** : Build failed avec `SkinNetwork() has private access in SkinNetwork` quand on tente `MinecraftForge.EVENT_BUS.register(new SkinNetwork())`.
**Cause racine** : Pattern utilitaire (toutes les methodes statiques) -> on avait declare `private SkinNetwork() {}` pour empecher l'instanciation. Mais l'enregistrement Forge `@SubscribeEvent` necessite une instance de la classe (la methode `onLogin` n'est pas statique).
**Solution** : Soit (a) rendre `onLogin` static + utiliser `MinecraftForge.EVENT_BUS.register(SkinNetwork.class)`, soit (b) rendre le constructeur public/package-private. On a choisi (b) ici car la methode garde acces aux singletons.
**Regle** : Quand une classe expose des `@SubscribeEvent` non-statiques destines a `MinecraftForge.EVENT_BUS.register(new X())`, le constructeur doit etre accessible (public ou package-private), pas private.


## 2026-05-10 — @Inject keyTyped ne recoit pas Tab dans CleanRoomLoader

**Systeme** : MixinGuiChat.java (chat Tab-completion hdv.@pseudo et @pseudo)
**Probleme** : L'injection `@Inject(method = "keyTyped", at = @At("HEAD"), cancellable = true)` ne fire jamais quand Tab est presse dans GuiChat, malgre que les autres touches fonctionnent. Apres 4 tentatives (changement de priorite, ForgeEvent, recompute de suggestions), Tab toujours ignoré.
**Cause racine** : Dans CleanRoomLoader (fork Java 25 de Forge 1.12.2), la touche Tab est interceptee AVANT que `keyTyped` soit appele — probablement dans la gestion native du clavier ou dans un patch CleanRoomLoader sur `handleKeyboardInput`. L'injection HEAD sur `keyTyped` ne recoit donc jamais keyCode=15.
**Solution** : Injecter dans `handleKeyboardInput` (la methode parente qui appelle `keyTyped`) avec `@Inject(method = "handleKeyboardInput", at = @At("HEAD"), cancellable = true)`. A ce niveau, `Keyboard.getEventKey()` retourne bien 15 pour Tab, et `ci.cancel()` empeche `keyTyped` d'etre appele.
**Regle** : Dans CleanRoomLoader, NE JAMAIS utiliser `@Inject(method = "keyTyped", ...)` pour intercepter la touche Tab dans un GuiScreen. Toujours passer par `handleKeyboardInput` ou un event Forge `GuiScreenEvent.KeyboardInputEvent.Pre`.


## 2026-05-13 — Gradle 5.6.4 "Failed to clean up stale outputs" / "Unable to delete file"

**Systeme** : `build.gradle` — tâche `:compileJava` (sourceSets merger ForgeGradle)

**Probleme** : Le build échoue avec deux erreurs possibles :
- `Failed to clean up stale outputs` (CleanupStaleOutputsExecuter Gradle)
- `java.io.IOException: Unable to delete file: ...HDVNetworkHandler.class` (SimpleStaleClassCleaner javac)

**Cause racine** : Le `sourceSets merger` dans `build.gradle` (lignes ~175-179) place classes ET resources dans le même dossier (`build/sourcesSets/main`). Cela crée deux problèmes :
1. Le registre `buildOutputCleanup` de Gradle accumule les anciens outputs et le `CleanupStaleOutputsExecuter` tente de les supprimer
2. Les **daemons Gradle zombies** (de builds échoués précédents) maintiennent des handles ouverts sur les `.class` compilés — Java `File.delete()` échoue sur Windows quand un processus a un handle ouvert exclusif

**Solution** :
1. Tuer les daemons zombies : `JAVA_HOME=... ./gradlew --stop`
2. Vider le registre buildOutputCleanup : `Remove-Item -Recurse -Force .gradle/buildOutputCleanup`
3. Dans `build.gradle` — utiliser PowerShell dans `compileJava.doFirst` pour vider le dossier de sortie AVANT que le stale cleaner ne s'y attaque :
```groovy
compileJava.doFirst {
    def outDir = compileJava.destinationDir.absolutePath
    exec {
        commandLine 'powershell', '-NoProfile', '-NonInteractive', '-Command',
            "Remove-Item -Recurse -Force '${outDir}' -ErrorAction SilentlyContinue; " +
            "New-Item -ItemType Directory -Force -Path '${outDir}' | Out-Null"
        ignoreExitValue = true
    }
}
compileJava.options.incremental = false
```

**Regle** : Si le build échoue avec une erreur "stale outputs" ou "Unable to delete file .class" → lancer `./gradlew --stop` pour tuer les daemons zombies, puis relancer le build. Vérifier que `org.gradle.daemon=false` est bien dans `gradle.properties` (déjà configuré). Note : `org.gradle.daemon=false` désactive les daemons pour les builds CLI, mais IntelliJ peut utiliser ses propres daemons — si le problème se reproduit depuis IntelliJ, lancer `./gradlew --stop` depuis un terminal.

## 2026-05-13 — AdminShop packet NBT too big (2 MB limit)

**Systeme** : AdminShopManager.java + ShopPriceData.java (historique prix) + PacketGuiOpen (EriAPI)
**Probleme** : Crash deconnexion client a l'ouverture de l'AdminShop (touche B) :
```
RuntimeException: Tried to read NBT tag that was too big; tried to allocate: 2097178bytes where max allowed: 2097152
at net.minecraft.nbt.NBTSizeTracker.read(NBTSizeTracker.java:26)
at fr.eri.eriapi.network.PacketGuiOpen.fromBytes(PacketGuiOpen.java:42)
```
**Cause racine** : Le packet `PacketGuiOpen` contenant toutes les donnees AdminShop (categories + items + historique prix 288 samples * N items) depasse la limite NBT Minecraft de 2 MB hardcodee dans `PacketBuffer.readCompoundTag()` qui instancie `new NBTSizeTracker(2097152L)`.
**Solution** :
1. `MixinCompressedStreamTools.java` — `@Redirect` sur `PacketBuffer.readCompoundTag()` ciblant le `NEW NBTSizeTracker` pour passer 32 MB a la place (cible `PacketBuffer` car `CompressedStreamTools.read(DataInput)` n'existe pas — le constructeur 2MB est dans `PacketBuffer.readCompoundTag`).
2. `ShopPriceData.MAX_HISTORY_SAMPLES` reduit de 288 -> 24 pour alleger le payload (24 * 30min = 12h de couverture).
**Regle** : Si un GUI AdminShop/HDV crashe avec "NBT too big", verifier d'abord si `MixinCompressedStreamTools` est bien enregistre dans `mixins.eriniumfaction.json`. Pour tout nouveau GUI volumineux, envisager de paginer les donnees ou de charger lazily cote serveur via RPC plutot que de tout envoyer dans `PacketGuiOpen`.

## 2026-05-14 — Trade GUI : slots adverses interactifs + mirroring incorrect

**Systeme** : `trade/ContainerTrade.java`, `trade/client/GuiTrade.java`, `faction/chest/FactionChestGuiHandler.java`, `trade/TradeManager.java`

**Problemes** :
1. Les slots de l'autre joueur etaient toujours rendus a droite du GUI (positions x absolues). Resultat : quand B etait dans le GUI et que A deposait un item, B le voyait apparaitre dans la zone gauche (comme si c'etait ses propres slots).
2. `TradeSlotLocked.isItemValid` et `canTakeStack` empechaient les depots/retraits classiques, mais le mode `ClickType.SWAP` (touches clavier 1-9), `THROW` et `PICKUP_ALL` court-circuitaient ces verifications — un joueur pouvait voler des items dans les slots adverses.
3. Capacite trop faible : seulement 4 slots par joueur.

**Cause racine** :
- Positions x des slots fixees a la construction du container (cote serveur) sans tenir compte du viewer.
- `Container.slotClick` non override : tous les modes non couverts par `isItemValid` passaient au handler par defaut.
- `SLOTS_PER_PLAYER = 4` historique.

**Solution** :
1. **Mirroring** : dans `ContainerTrade`, les positions x des slots dependent de `isPlayerA`. Ordre d'ajout : "mes" slots toujours dans `inventorySlots[0..26]` (zone gauche), "leurs" slots dans `inventorySlots[27..53]` (zone droite). Les `Slot.slotIndex` pointent vers le bon index du `tradeInventory` partage (A: 0-26, B: 27-53) — invariant cote serveur.
2. **Passage isA au client** : `openGui(world, 1, 0, 0)` pour A et `(world, 0, 0, 0)` pour B. `FactionChestGuiHandler.getClientGuiElement` lit `x != 0` pour reconstruire le container client avec le bon mirroring.
3. **slotClick override** : refuse tout `slotId >= SLOTS_PER_PLAYER && slotId < TOTAL_TRADE_SLOTS` (couvre SWAP/THROW/PICKUP_ALL/etc.). `TradeSlotLocked` reste comme defense en profondeur.
4. **27 slots** : `SLOTS_PER_PLAYER = 27` (3 lignes x 9 cols), `TOTAL_TRADE_SLOTS = 54`, GUI elargi a 350x290. Suppression de `TradeConfig.slotsPerPlayer` (inutilise et trop limite par `@Range(max=9)`).

**Regle** : Pour tout container partage entre 2 joueurs (trade-like), TOUJOURS override `Container.slotClick` pour bloquer les modes non standard et passer un flag `isPlayerA` via le parametre `x` de `openGui` pour que le client connaisse son cote.

---

## 2026-05-15 — EriniumBorder : config rayon centre au lieu de pos1/pos2 bbox

**Systeme** : `world/border/` — EriniumBorderConfig, EriniumBorderManager, EriniumBiomeProvider, EriniumBorderCommand.

**Probleme** : La premiere version de la config border definissait la zone pre-generee comme un carre centre sur `(0,0)` avec un seul champ `pre_gen_radius_blocks` (demi-cote). Cela ne correspondait pas a la demande explicite du user qui voulait "une config appeler genre 'spawnandwarzonepos' avec pos 1 et 2 XZ" — donc 4 champs (pos1X, pos1Z, pos2X, pos2Z) pour une bbox arbitraire, pas forcement centree sur (0,0).

**Cause racine** : Lecture incomplete de la specification initiale. L'agent a suppose une geometrie "rayon centre" alors que le user voulait une bbox WorldEdit-like avec deux coins.

**Solution appliquee** :
1. `EriniumBorderConfig` : remplacer `preGenRadiusBlocks` par 4 champs `preGenPos1X`, `preGenPos1Z`, `preGenPos2X`, `preGenPos2Z` (range `[-1_000_000, 1_000_000]`, defauts `-500/-500/498/498`). Ajouter helpers normalises `minBlockX/Z`, `maxBlockX/Z`, `minChunkX/Z`, `maxChunkX/Z` qui calculent `min(pos1, pos2)` et `max(pos1, pos2)` — l'admin peut saisir les coins dans n'importe quel ordre.
2. `EriniumBorderManager` : nouvelle methode statique `chunkDistanceToBBox(cx, cz)` qui retourne la distance de Chebyshev en chunks au rectangle (et 0 si inside). `isBorderChunk` et `isPreGenChunk` utilisent maintenant cette distance au lieu de `max(|cx|,|cz|)` au centre.
3. Spec HTML (`docs/specs/erinium-border.html`) : reformule toute la geometrie (bbox, distance au rectangle), table de config a jour avec les 4 cles, diagramme ASCII adapte.

**Regle generale** : Toujours respecter EXACTEMENT la formulation et les noms de champs/structures donnes par le user dans la specification initiale. Si le user dit "pos1 et pos2", c'est `pos1_x/pos1_z/pos2_x/pos2_z` — jamais une reformulation en `radius`, `center`, `size`, etc.


---

## 2026-05-15 — EriniumBorder v2 : Edge chunk shrinkage + lissage progressif

**Systeme** : `world/border/` — EriniumBorderConfig, EriniumBorderManager.

**Probleme 1 — chunk de la pos** : Avec la formule `minBlockX >> 4` et `maxBlockX >> 4`, le chunk contenant pos1/pos2 etait considere comme pre-gen meme si la pos etait au milieu du chunk. Exemple : pos2X=498 -> chunk 31 (blocs 496..511) etait pre-gen, mais les blocs 499-511 etaient hors bbox -> mur visible sur le chunk de la pos.

**Probleme 2 — mur de biomes deplace** : Le template plat surfaceY=63 sur 2 chunks ne supprimait pas le mur, il le deplacait simplement 2 chunks plus loin (entre fin de la bande plate et debut du worldgen naturel avec ses montagnes/relief).

**Solutions** :
1. **Edge chunk shrinkage** dans `EriniumBorderConfig.minChunkX/Z/maxChunkX/Z` :
   - minChunk : retrecit vers l'interieur si `minBlock & 15 != 0` (chunk de la pos devient premier chunk de la bande border)
   - maxChunk : meme logique avec `maxBlock & 15 != 15`
   - Ajout `isBboxValid()` : detecte si la bbox est trop petite apres shrinkage (minChunk > maxChunk) et desactive le systeme avec un log erreur au demarrage (`validateConfigAtStartup`).
2. **Lissage progressif v2** dans `EriniumBorderManager.applySmoothingToChunk` :
   - Hook deplace de `PopulateChunkEvent.Pre` vers `PopulateChunkEvent.Post` avec `EventPriority.LOWEST` (worldgen normal finit avant nous).
   - Par colonne : scan top-down pour trouver `hNatural` (premier bloc solide en ignorant air/leaves/logs/fleurs/neige/champignons/vignes/cactus/canne/citrouilles/melons).
   - Calcul `tChunk = (dist - 1) / (smoothing_width - 1)` puis `eased = easeInOutCubic(tChunk)`.
   - `hTarget = round(lerp(surfaceY, hNatural, eased))`. Cas `hTarget < hNatural` (abaisser), `hTarget > hNatural` (rehausser stone+grass+dirt), `hTarget == hNatural` (colonne intacte, preserve arbres/structures).
   - Nettoie aussi les decorations (arbres, neige, plantes) jusqu'a `hNatural+24` quand hTarget != hNatural pour eviter troncs flottants.
3. **Biome naturel par defaut** : `border_biome_id` passe de `minecraft:plains` a `""` (vide). Le `EriniumBiomeProvider.getBiome` n'override le biome que si `borderBiomeId` contient `:`. Sinon, les biomes Erinium naturels sont preserves dans la bande -> continuite visuelle.
4. **Config remplacee** : `strip_inner_chunks` + `strip_outer_chunks` -> unique `smoothing_width_chunks` (defaut 5). `stripMinDist()` retourne toujours 1, `stripMaxDist()` retourne `smoothing_width_chunks`.

**Regle generale** : pour eviter les murs visuels en bord de zone pre-generee, NE PAS imposer un terrain plat sur quelques chunks (deplace le mur) — il faut un VRAI lissage qui interpole la heightmap entre la zone protegee et le worldgen naturel sur 5+ chunks, avec un easing cubique pour adoucir les extremites. Hook = `PopulateChunkEvent.Post` LOWEST priority pour laisser le worldgen finir avant.


---

## 2026-05-15 — EriniumBorder regen ne touchait que les chunks loaded + lissage invisible sur montagnes

**Systeme** : `world/border/` — EriniumBorderManager, EriniumBorderCommand, EriniumBorderConfig.

**Probleme 1** : `/eriniumborder regen confirm` ne reecrivait que 145 chunks sur les ~1340 attendus dans la bande border. Cause : la commande iterait `WorldServer.getChunkProvider().getLoadedChunks()`, donc seuls les chunks deja charges par le mouvement du joueur etaient traites. Les chunks border eloignes (notamment ceux contenant des montagnes) restaient intacts.

**Probleme 2** : Visuellement, les murs verticaux de montagnes en bord de zone pre-gen ne disparaissaient pas. Le user disait "le smoothing n'a rien fait du tout". Cause directe : meme bug — les chunks de montagne n'etaient pas loaded, donc jamais reecrits par le regen, donc le lissage ne pouvait pas s'appliquer dessus.

**Cause racine** : confusion entre "chunks loaded en RAM" et "chunks de la bande border". Le regen doit force-loader tous les chunks de la bande, peu importe leur statut RAM.

**Solution appliquee** :

1. **Regen batche force-load** dans `EriniumBorderManager` :
   - Nouvelle methode `startFullRegen(WorldServer, ICommandSender)` qui enumere TOUS les chunks (cx, cz) avec Chebyshev distance dans `[1, smoothing_width_chunks]` autour de la bbox.
   - Snapshot des chunks deja loaded au demarrage (pour ne pas les unloader apres).
   - Classe interne `RegenJob` qui detient queue + sender + counters.
   - Champ `activeJob` volatile (un seul regen a la fois).

2. **Tick handler batche** : `@SubscribeEvent onServerTick(TickEvent.ServerTickEvent)` phase END :
   - Polle jusqu'a `regen_chunks_per_tick` (defaut 20) chunks de la queue par tick.
   - Pour chaque : `ChunkProviderServer.loadChunk(cx, cz)` (force-load ou genere), `applySmoothingToChunk(...)`, `chunk.markDirty()`, puis `cps.queueUnload(chunk)` si le chunk n'etait pas loaded au debut.
   - Messages de progression a 10%, 20%, ..., 100% au sender + console.
   - A la fin de la queue : `world.saveAllChunks(true, null)` pour flush.
   - Estimation : ~1340 chunks @ 20/tick = ~67 ticks = ~3.5s, sans freeze (charge etalee).

3. **Nouvelles configs** :
   - `regen_chunks_per_tick` (1..500, defaut 20) : taille du batch par tick.
   - `regen_on_startup` (bool, defaut false) : lance un regen complet apres `FMLServerStartingEvent` (utile pour repair apres deploiement d'une nouvelle version du smoothing).
   - `debug_smoothing` (bool, defaut false) : log verbose par chunk lisse (cx, cz, distance, hNatural@8,8, hTarget@8,8, colonnes lowered/raised/untouched). Sert a diagnostiquer les bugs visuels sans devoir attacher un debugger.

4. **Renforcement lighting** dans `applySmoothingToChunk` : ajout de `chunk.resetRelightChecks()` apres `generateSkylightMap()` pour forcer un recalcul complet de la lumiere des colonnes modifiees (sinon les zones abaissees gardaient les valeurs de skylight d'avant).

5. **Commande refactoree** : `/eriniumborder regen confirm` n'attend plus une duree mais affiche immediatement "Regen lance: N chunks (~Xs)". Si un regen est deja en cours, refuse avec un message clair.

**Regle generale** : pour toute operation qui doit s'appliquer a une zone fixe de chunks (border, regen, repair de structures), TOUJOURS enumerer la zone et force-loader les chunks via `ChunkProviderServer.loadChunk(cx, cz)`, JAMAIS se contenter d'iterer `getLoadedChunks()`. Etaler le travail sur plusieurs ticks via `TickEvent.ServerTickEvent` pour eviter les freezes (batch size configurable).


---

## 2026-05-15 — WorldGen : axe humidite, transition d'altitude, lissage des frontieres

**Systeme** : `world/gen/` (EriniumGenLayer chain + post-pop smoothing)

### Probleme 1 — biomes humides/secs colles sans coherence
Dans la zone HOT, des biomes arides (Salt Flats, Volcanic Plains, Red Desert) etaient genere a cote de biomes humides (Oasis, Thermal Springs) sans transition. Le climat etait quantifie sur un seul axe (temperature), donc humidite = pile aleatoire chunk par chunk.

**Cause racine** : `EriniumGenLayerClimate` produit une seule noise (HOT/WARM/COOL/ICY). `EriniumGenLayerBiome` picke aleatoirement dans le pool de la zone, sans filtre humidite.

**Solution** : ajout d'un layer `EriniumGenLayerHumidity` independant (noise differente, scale 96 large / 24 small) entre Climate et Biome. Output encode (zone << 4) | humidite. Pool entries ajoute un 3e champ (DRY/MEDIUM/WET/ANY). Le pick filtre par humidite — fallback DEFAULT du tier si rien ne matche.

### Probleme 2 — falaises nettes MOUNT -> FLAT
Une cellule MOUNT pouvait toucher directement une cellule FLAT, produisant des murs verticaux apres le terrain gen.

**Cause racine** : aucun layer ne forcait l'insertion d'un HILLS entre les deux. `EriniumGenLayerHeightSmooth` lissait deja sur la hauteur (baseHeight), mais ne tenait pas compte du tier explicite des biomes.

**Solution** : ajout d'un layer `EriniumGenLayerAltitudeTransition` apres Biome. Utilise un lookup `biomeId -> tier` construit dans `initPools()`. Pour chaque cellule FLAT touchant un MOUNT, la convertit en HILLS de la meme zone climatique (sniff via `Biome.getDefaultTemperature`).

### Probleme 3 — mini-murs visuels aux frontieres de biomes
Quand deux biomes adjacents ont des hauteurs proches mais des blocks de surface differents (sable vs herbe), il restait des bordures 1-2 blocks nettes visuellement disgracieuses.

**Cause racine** : la generation de terrain interpole les hauteurs mais pas les blocks de surface — le top block change brutalement a la frontiere biome.

**Solution** : `BiomeBorderSmoother` (event handler sur `PopulateChunkEvent.Post`, LOWEST priority). Pour chaque colonne du chunk, detecte le biome courant + le biome voisin a distance 1-3. Avec une probabilite degressive (50%/25%/10%), remplace le top block + 1-2 filler blocks par ceux du biome voisin. Ne touche jamais la hauteur. Skip les chunks de la border-strip (`EriniumBorderManager.isBorderChunk`) car le border manager fait son propre lissage. Reutilise un `BlockPos.MutableBlockPos` pour eviter les allocations.

**Build flag UTF-8** : encoding Cp1252 par defaut sur Windows fait planter `compileJava` sur les commentaires accentues de `ShopConfigLoader.java`. Ajouter `-Dfile.encoding=UTF-8` au gradlew lance la compile sans soucis. A long terme : poser `compileJava.options.encoding = 'UTF-8'` dans `build.gradle`.
