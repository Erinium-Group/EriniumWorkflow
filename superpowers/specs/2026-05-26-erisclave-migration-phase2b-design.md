# Erisclave Migration — Phase 2b : Builder structured (Design)

> **Date :** 2026-05-26
> **Auteur :** killian + Claude
> **Phase précédente :** Phase 2a (CRUD roadmap projects + tasks + delete specs) — voir `2026-05-25-erisclave-migration-phase2a-design.md`
> **Phase suivante :** non planifiée (V2 = versioning + conflict resolution + upload images si besoin réel)

---

## 1. Contexte

La Phase 2a a livré le CRUD complet de la roadmap (projects + tasks) avec DnD et perms, mais la création/édition de specs reste impossible. Les 54 specs legacy importées restent lisibles (HTML statique), et créer un nouveau spec nécessite soit du SQL brut, soit l'app Electron Erisclave (supprimée Phase 6).

**Objectif P2b** : porter intégralement le **builder structured** d'Erisclave (Q&A wizard → HTML rendu) vers le Work Panel Next.js. Un staff doit pouvoir créer un nouveau spec depuis une card project, remplir les questions, prévisualiser, et publier — sans quitter le navigateur.

**Source d'inspiration** : `docs/applications/erisclave/` (app Electron) → `core/question-engine/` + `core/html-builder/` + `renderer/scripts/`. Ces dossiers servent de référence d'implémentation et seront supprimés post-Phase 2b (cohérent avec Phase 6 d'Erisclave migration).

---

## 2. Décisions de design (validées avec killian)

| Sujet | Décision | Raison |
|---|---|---|
| **Approche UI** | Builder structured complet (port fidèle Electron) | Single source of truth = la Q&A ; on évite l'éditeur HTML libre |
| **Granularité spec** | 1 spec = N features (multi-features dans un spec) | Identique à Electron : un project complexe a plusieurs blocs/items/systèmes |
| **Aperçu** | Bouton "Aperçu" dans toolbar editor (modal) | Plus simple qu'un split-screen ; user déclenche quand il veut |
| **Drafts** | Flag `is_draft BOOL` en DB + drawer dédié | Permet de bosser sur plusieurs specs en parallèle sans polluer la roadmap publique |
| **Page édition** | `/admin/work/specs/[slug]/edit` dédiée | Layout 3 zones nécessite plus de place qu'un modal |
| **Feature-types** | 11 d'un coup (bloc, item, gui, system, command, world, mob, pvp, economie, eriapi, autre) | Tout porter en MVP pour éviter le "qui manque" |
| **Legacy specs** | Non-éditables (lecture conservée) | Parsing HTML maison vers Q&A = trop complexe pour MVP, peu de valeur |
| **State management** | `useReducer` local + autosave | Pas besoin de Zustand pour 1 page ; React Query gère le cache serveur |
| **Autosave** | Debounce 1500ms + indicator + beforeunload guard | UX standard ; évite la perte de travail |
| **Concurrence** | Last-write-wins MVP | Versioning + conflict UI reportés V2 |

---

## 3. Scope MVP (ce qu'on fait)

### 3.1. Data

- Migration SQL : ajout des colonnes `answers JSONB NULL` et `is_draft BOOL NOT NULL DEFAULT false` sur `work_roadmap_specs`
- Index partiel : `work_roadmap_specs_draft_idx ON (project_id, is_draft) WHERE is_draft = true`
- Specs structured : `answers` rempli (JSON typé) + `raw_html` régénéré server-side à chaque sauvegarde
- Specs legacy : `answers IS NULL` → non-éditables, lecture only via `raw_html` existant

### 3.2. Server library (port Electron → TypeScript)

- `src/lib/work/erisclave/data/feature-types.json` (descripteurs des 11 types + leurs questions)
- `src/lib/work/erisclave/data/base-questions.json` (champs communs à toutes les features)
- `src/lib/work/erisclave/question-engine.ts` (résolution `featureType → champs[]`)
- `src/lib/work/erisclave/html-builder/index.ts` (orchestration rendu)
- `src/lib/work/erisclave/html-builder/fieldRenderers.ts` (un renderer par type de champ)
- `src/lib/work/erisclave/html-builder/markdown.ts` (parser maison, pas de dep externe)
- `src/lib/work/erisclave/html-builder/styles.ts` (CSS inline pour le HTML rendu)
- `src/lib/work/erisclave/html-builder/escape.ts` (échappement HTML/attr)
- `src/lib/work/erisclave/types.ts` (Feature, FieldValue, AnswersV1)
- `src/lib/work/erisclave/schemas.ts` (Zod schemas pour validation API)

### 3.3. API routes

- `POST /api/work/v1/roadmap/specs` — create draft (perm `work.roadmap.edit`)
- `PATCH /api/work/v1/roadmap/specs/[slug]` — update answers + flag publish/dépublier
- `POST /api/work/v1/roadmap/specs/preview` — render HTML sans persister
- `GET /api/work/v1/roadmap/specs/drafts` — liste les drafts de l'user courant
- `GET /api/work/v1/roadmap/specs/[slug]` — **étendu** pour retourner `answers + isDraft`

### 3.4. Editor UI

- Bouton entry `📋` sur `RoadmapCard` (cluster boutons hover, à côté de ✏ et 🗑)
- `NewSpecModal` : titre du spec + project lié (read-only) + bouton "Créer brouillon"
- `DraftsDrawer` : drawer depuis header roadmap (badge count) → liste drafts user
- Page `/admin/work/specs/[slug]/edit` :
  - Header sticky : titre inline + badge draft/published + boutons Aperçu, Publier/Dépublier, Supprimer
  - Sidebar gauche : liste features avec DnD reorder + bouton "+ Feature" (dropdown 11 types) + delete au hover
  - Form zone : `FeatureFormPanel` dispatching vers `FieldRenderer` selon le type du champ
  - 8 field components : `TextField`, `LongTextField`, `SelectField`, `ListField`, `TableField`, `ChecklistField`, `ImageField` (URL string MVP), `TagsField`
  - `PreviewModal` : iframe sandboxed avec HTML rendu via endpoint preview
  - `AutosaveIndicator` : "Enregistré ✓ (il y a Xs)" / spinner / erreur
- **Viewer `/admin/work/specs/[slug]`** (existant P1) : ajout d'un badge "brouillon" si `isDraft` + bouton "Éditer" visible si `canEdit && answers !== null` (legacy = caché)

### 3.5. Hooks React Query

- `useCreateSpec(projectId, title)`
- `useUpdateSpec(slug)` (autosave + publish)
- `usePreviewSpec()` (render sans persister)
- `useDeleteSpec()` (déjà existant, réutilisé)
- `useDrafts()` (liste user drafts + count pour badge)
- `useSpec(slug)` étendu pour retourner `answers + isDraft`

---

## 4. Hors-scope (reportés V2 ou plus tard)

| Item | Raison report |
|---|---|
| Versioning de specs publiés | Complexité hors-scope, last-write-wins MVP suffit |
| Conflict resolution multi-user | Idem, documenté dans knowissue |
| Conversion legacy → structured | Parsing HTML maison non trivial, peu de valeur immédiate |
| Upload d'images réelles (`ImageField`) | MVP : champ URL string. V2 : upload Vercel Blob |
| Templates ("dupliquer un spec existant") | UX nice-to-have |
| Diff/historique des éditions | V2 |
| Cache invalidation intelligente (revalidateTag) | MVP : `revalidatePath` simple |
| Tests E2E Playwright sur l'editor | MVP : tests unitaires sur `question-engine` + `html-builder` uniquement |

---

## 5. Architecture

### 5.1. Data layer

**Migration SQL** :

```sql
ALTER TABLE work_roadmap_specs
  ADD COLUMN IF NOT EXISTS answers JSONB NULL,
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS work_roadmap_specs_draft_idx
  ON work_roadmap_specs (project_id, is_draft)
  WHERE is_draft = true;
```

**Format JSON `answers` (version 1)** :

```jsonc
{
  "version": 1,
  "project": { "id": 42, "title": "Plasma Extractor" },
  "features": [
    {
      "id": "f_abc123",
      "type": "bloc",
      "title": "Plasma Extractor",
      "answers": {
        "title": "Plasma Extractor",
        "shortDescription": "Extrait du plasma depuis les fluides élémentaires",
        "hardness": 5,
        "hitbox": [
          { "x1": 0, "y1": 0, "z1": 0, "x2": 1, "y2": 0.75, "z2": 1 }
        ],
        "recipe": [...]
      }
    },
    { "id": "f_def456", "type": "item", "title": "Plasma Bottle", "answers": {...} }
  ],
  "meta": {
    "createdAt": "2026-05-26T10:00:00Z",
    "updatedAt": "2026-05-26T10:15:00Z",
    "createdBy": "killian"
  }
}
```

**Règles** :
- `raw_html` est **régénéré server-side** à chaque PATCH (source de vérité = `answers`)
- `is_draft = true` → invisible des consommateurs publics (futur ; pour MVP, le viewer existant `/admin/work/specs/[slug]` affiche aussi les drafts mais avec un badge)
- Specs legacy (`answers IS NULL`) restent intactes ; aucune migration de leur `raw_html`

### 5.2. Architecture serveur

**Pipeline `PATCH /specs/[slug]`** :

```
1. Auth + perm check (work.roadmap.edit)
2. Body Zod validation (AnswersV1 schema)
3. Slug lookup → 404 si inexistant, 403 si legacy (answers null = non éditable)
4. Re-render raw_html = htmlBuilder.build(answers)
5. UPDATE work_roadmap_specs SET answers=$1, raw_html=$2, is_draft=$3, updated_at=NOW()
6. (skip MVP) revalidatePath('/admin/work/specs/' + slug)
7. Return { slug, isDraft, updatedAt }
```

**Pipeline `POST /specs/preview`** :

```
1. Auth + perm check
2. Body Zod validation (features array)
3. html = htmlBuilder.build({ features, project: null })
4. Return { html } — pas de DB write
```

**Pipeline `POST /specs` (create draft)** :

```
1. Auth + perm check
2. Body : { projectId, title }
3. Generate slug : `slugify(title) + "-draft-" + YYYYMMDD + "-" + nanoid(6)` (collision-proof, lowercase)
4. INSERT work_roadmap_specs (project_id, slug, title, answers, raw_html, is_draft, created_by)
   - answers = { version: 1, project: {...}, features: [], meta: {...} }
   - raw_html = "" (rendu vide initial)
   - is_draft = true
5. Return { slug }
```

### 5.3. Architecture client

**Layout page `/edit` (3 zones)** :

```
+---------------------------------------------------------------+
| Header sticky : titre éditable | badge draft/pub | Aperçu | ... |
+----------------+----------------------------------------------+
| SIDEBAR        | FORM ZONE                                    |
| [+ Feature ▾]  | Feature courante : "Plasma Extractor"        |
|                | Type : bloc                                  |
| ▸ feature 1    | [champs base + champs type rendered]         |
| ▸ feature 2    |                                              |
| (drag-reorder) | [AutosaveIndicator]                          |
+----------------+----------------------------------------------+
```

**Composants à créer** :

| Composant | Path |
|---|---|
| `NewSpecModal` | `components/work/specs/NewSpecModal.tsx` |
| `DraftsDrawer` | `components/work/specs/DraftsDrawer.tsx` |
| `SpecEditorPage` | `app/(admin)/admin/work/specs/[slug]/edit/page.tsx` |
| `SpecEditorHeader` | `components/work/specs/editor/SpecEditorHeader.tsx` |
| `FeaturesSidebar` | `components/work/specs/editor/FeaturesSidebar.tsx` |
| `FeatureFormPanel` | `components/work/specs/editor/FeatureFormPanel.tsx` |
| `FieldRenderer` | `components/work/specs/editor/FieldRenderer.tsx` |
| `TextField`, `LongTextField`, `SelectField`, `ListField`, `TableField`, `ChecklistField`, `ImageField`, `TagsField` | `components/work/specs/editor/fields/*.tsx` |
| `PreviewModal` | `components/work/specs/editor/PreviewModal.tsx` |
| `AutosaveIndicator` | `components/work/specs/editor/AutosaveIndicator.tsx` |

**State (reducer local)** :

```ts
type EditorState = {
  spec: { id: number; slug: string; title: string; isDraft: boolean };
  features: Feature[]; // ordre = ordre d'affichage
  selectedFeatureId: string | null;
  lastSavedAt: number | null;
  isDirty: boolean;
};

type EditorAction =
  | { type: 'ADD_FEATURE'; featureType: FeatureType }
  | { type: 'DELETE_FEATURE'; featureId: string }
  | { type: 'SELECT_FEATURE'; featureId: string }
  | { type: 'UPDATE_FIELD'; featureId: string; fieldId: string; value: unknown }
  | { type: 'REORDER_FEATURES'; orderedIds: string[] }
  | { type: 'RENAME_SPEC'; title: string }
  | { type: 'AUTOSAVE_SUCCESS'; timestamp: number }
  | { type: 'TOGGLE_DRAFT'; isDraft: boolean };
```

**Hook `useAutosave`** :
- Debounce 1500ms après dernière modification (RAF + setTimeout)
- Mutation `useUpdateSpec` ; cancel des requests en cours via mutationKey React Query
- Toast erreur + bouton "Réessayer" si fail
- `beforeunload` browser handler tant que `isDirty === true`

### 5.4. Flow utilisateur résumé

**Flow A — Créer un spec** :
RoadmapCard hover → click `📋` → NewSpecModal → POST `/specs` → redirect `/edit`

**Flow B — Édition** :
"+ Feature" → reducer ADD → user remplit champs → UPDATE_FIELD → autosave debounce → PATCH `/specs/[slug]` → indicator "Enregistré ✓"

**Flow C — Aperçu** :
Click "Aperçu" → POST `/specs/preview` (data en mémoire, pas sauvée) → PreviewModal iframe sandboxed

**Flow D — Publier** :
Click "Publier" → ConfirmDialog → PATCH `{ isDraft: false }` → badge passe à "publié" → bouton devient "Dépublier"

**Flow E — Éditer existant** :
`/admin/work/specs/[slug]` → bouton "✏ Éditer" (caché si legacy) → redirect `/edit` avec `useSpec` rempli

**Flow F — Navigation guard** :
isDirty + navigation interne → `Confirm browser` "modifications non enregistrées"
beforeunload → prompt natif browser

### 5.5. Erreurs et états dégradés

| Cas | Comportement |
|---|---|
| Autosave fail (500 serveur) | Toast erreur, badge "Erreur ✗", bouton "Réessayer" manuel, isDirty reste true |
| Autosave fail (réseau down) | `navigator.onLine` → badge "Hors-ligne", retry auto reconnexion |
| User perd perm `work.roadmap.edit` en cours | Server 403 → bascule page read-only |
| Concurrence 2 staffs | Last-write-wins MVP, documenté knowissue |
| Schema Zod fail côté client | Autosave bloqué, toast "Données invalides : <field>" |
| Slug spec legacy ouvert dans `/edit` | Redirect vers `/admin/work/specs/[slug]` avec message |

---

## 6. Découpage tasks (ordre d'exécution pour le plan)

**Phase A — Foundation (data + lib)** *— bloquant tout le reste*

1. Migration SQL `answers JSONB + is_draft` + index partiel
2. Port `question-engine` (feature-types.json + base-questions.json + index.ts)
3. Port `html-builder` (fieldRenderers + markdown + styles + escape + index)
4. Types partagés + schémas Zod
5. Tests unitaires lib (snapshot 11 features types)

**Phase B — API** *— dépend de A*

6. POST `/specs` create draft + GET `/specs/drafts`
7. PATCH `/specs/[slug]` update + GET `/specs/[slug]` étendu
8. POST `/specs/preview`

**Phase C — Editor UI core** *— dépend de B*

9. Hooks React Query (useCreateSpec, useUpdateSpec, usePreviewSpec, useDrafts) + extension useSpec
10. NewSpecModal + bouton `📋` sur RoadmapCard
11. Page `/edit` scaffold (layout 3 zones + reducer + useSpec mount + redirect legacy)
12. FeaturesSidebar (liste + add dropdown 11 types + DnD reorder + delete)
13. FeatureFormPanel + FieldRenderer dispatch
14. 8 FieldComponents (text, longtext, select, list, table, checklist, image URL, tags)
15. SpecEditorHeader (titre inline + badges + boutons)
16. useAutosave hook + AutosaveIndicator + beforeunload + navigation guard

**Phase D — Aperçu + finition** *— dépend de C*

17. PreviewModal iframe sandboxed
18. DraftsDrawer + badge count header roadmap
19. Polish UX (empty states, loading, errors, toasts)
20. knowissue.md (concurrence + legacy non-éditable)

**Phase E — QA + déploiement** *— gate user*

21. Smoke tests UI prod : create, edit, autosave, preview, publish, edit existing, delete
22. Bump submodule pointer + push

**Estimation** : ~22 tasks → 2 sessions subagent-driven dev (autosave + DnD sidebar = parties les plus consommatrices).

---

## 7. Risques identifiés

| Risque | Mitigation |
|---|---|
| Port `html-builder` non fidèle au rendu Electron | Tests snapshot sur 11 features types avec data réelle exportée depuis specs existantes |
| DnD sidebar conflit avec DnD roadmap | Pas de conflit : zones distinctes, `DndContext` scopé local à chaque page |
| Autosave qui DDOS l'API sur saisie rapide | Debounce 1500ms + cancel via React Query mutationKey |
| Reducer state lourd sur 10+ features | Non-bloquant en pratique : <100 features par spec, React gère sans memo aggressive |
| Concurrence 2 staffs sur même spec | Documenté knowissue, MVP last-write-wins, V2 si réel besoin |
| Migration SQL sur prod | `ADD COLUMN IF NOT EXISTS` idempotent + backup Neon avant run |
| Édition d'un spec publié écrase la version live | Documenté dans knowissue ; pas de versioning MVP |

---

## 8. Permissions

Pas de nouvelle permission. Réutilisation des perms existantes :

| Perm | Endpoints |
|---|---|
| `work.roadmap.view` | GET specs/drafts, GET specs/[slug], lecture page edit |
| `work.roadmap.edit` | POST specs, PATCH specs/[slug], POST specs/preview, accès page edit |
| `work.roadmap.delete` | DELETE specs/[slug] (déjà P2a) |

Doc `permissions.md` : pas de modif nécessaire.

---

## 9. Critères d'acceptation MVP

- [ ] Migration SQL passe sans erreur sur prod Neon
- [ ] Lib `question-engine` + `html-builder` ports complets, tests snapshot verts
- [ ] Tous endpoints API répondent (200/201/204) avec validation Zod stricte
- [ ] Création d'un spec depuis une RoadmapCard → page `/edit` chargée avec sidebar vide
- [ ] Ajout d'1 feature de chaque type (11) → sauvegarde auto → reload page → données persistées
- [ ] Aperçu HTML cohérent avec le rendu Electron (comparaison visuelle sur 3 specs)
- [ ] Publier un draft → badge passe "publié" → visible sur `/admin/work/specs/[slug]` viewer
- [ ] Éditer un spec publié → autosave écrit directement la version publiée
- [ ] Specs legacy (`answers IS NULL`) → bouton "Éditer" caché ou désactivé
- [ ] beforeunload + navigation guard bloquent la perte de données
- [ ] Documentation knowissue.md à jour (concurrence + legacy)

---

## 10. Références

- App Electron source : `docs/applications/erisclave/core/` (question-engine, html-builder) + `renderer/scripts/`
- Phase 1 design : `docs/superpowers/specs/2026-05-25-erisclave-migration-design.md`
- Phase 2a design : `docs/superpowers/specs/2026-05-25-erisclave-migration-phase2a-design.md`
- Schéma DB actuel : table `work_roadmap_specs` (P1) — colonnes `id, project_id, slug, title, raw_html, ...`
- DnD pattern : `EriniumFactionWeb/src/components/work/roadmap/SortableCard.tsx` (référence Phase 2a)
