# Erisclave Migration — Phase 2a : CRUD Roadmap (Design)

> **Date :** 2026-05-25
> **Auteur :** killian + Claude
> **Phase précédente :** Phase 1 (lecture seule) livrée — voir `2026-05-25-erisclave-migration-design.md`
> **Phase suivante :** Phase 2b — Builder structured (port du question-engine Erisclave)

---

## 1. Contexte

La Phase 1 a migré la roadmap statique (`docs/roadmap.html`) et 54 specs HTML legacy (`docs/specs/*.html`) vers la DB Neon Postgres, avec un Work Panel read-only (`/admin/work/roadmap` + `/admin/work/specs/[slug]`). L'app Erisclave Electron a été supprimée.

**Problème actuel** : le Work Panel est read-only. Pour créer ou modifier un project / une task / un spec, il faut taper du SQL dans Neon ou re-run le script `import-legacy-roadmap`. C'est inutilisable au quotidien.

**Objectif P2a** : rendre la roadmap entièrement éditable depuis le Work Panel sans rien casser de la P1. **Scope volontairement réduit** : pas de builder structured (c'est P2b), uniquement le CRUD projects + tasks + suppression de specs legacy.

---

## 2. Décisions de design (validées avec killian)

| Sujet | Décision | Raison |
|---|---|---|
| **Specs legacy** | Read-only + delete uniquement | Pas de raison d'éditer du HTML legacy ; on convertit via P2b plus tard |
| **Reorder** | Projects ET tasks via DnD | UX moderne, attendu sur ce type d'outil |
| **Forme édition** | Project en modal, spec en page dédiée (mais P2a = pas de page d'edit spec) | Project = formulaire court → modal. Spec = formulaire long → page (P2b) |
| **Pattern édition** | Tout inline + édition rapide | Plus rapide que d'ouvrir un panneau pour chaque champ |
| **Relation project↔spec** | 1 project = 1 spec | Simplifie l'UX. La DB autorise N specs, mais l'UI force 1 |
| **Live preview** | Split 50/50 (P2b uniquement) | Aucun impact P2a — noté pour cohérence |
| **Découpage** | P2a (CRUD basique) + P2b (Builder) | Livrer la valeur incrémentalement |
| **Stack** | Port en TS, améliorer l'UI vs Erisclave | Modernise et intègre au design system existant |

---

## 3. Scope P2a (ce qu'on fait)

### 3.1. Projects

- ✅ **Créer** un project via modal (titre, status, tags, category, ordre auto)
- ✅ **Éditer inline** le titre depuis la card (double-clic → input → blur/Enter pour save)
- ✅ **Éditer** le reste (status, tags, category) via modal "Éditer le project"
- ✅ **Supprimer** un project (avec dialog de confirmation) — cascade DB supprime aussi ses tasks
- ✅ **Réordonner** par drag and drop (poignée à gauche de la card)
- ✅ **Changer le status** depuis le StatusBadge (clic → dropdown : todo / wip / test / done / blocked)

> **Note schéma DB réel** (P1) : la table `work_roadmap_projects` n'a **pas** de colonne `description`. Les 5 statuts sont `todo | wip | test | done | blocked` (CHECK constraint). Le P2a ne change pas le schéma — pour ajouter `description`, ce serait une migration P2b si besoin.

### 3.2. Tasks

- ✅ **Ajouter** une task au project depuis la card étendue (composer avec input)
- ✅ **Éditer inline** le titre (double-clic sur le label de la task)
- ✅ **Toggler done/todo** en cliquant la checkbox (plus de "disabled")
- ✅ **Supprimer** une task (bouton poubelle au hover)
- ✅ **Réordonner** par drag and drop dans la liste étendue

### 3.3. Specs

- ✅ **Supprimer** un spec depuis le viewer (`/admin/work/specs/[slug]`) avec confirmation
- ❌ Créer / éditer un spec → **P2b uniquement**

---

## 4. Hors-scope (P2b)

| Item | Raison report P2b |
|---|---|
| Builder structured (question-engine port TS) | Gros morceau : 11 feature types × N variantes + html-builder |
| Page `/admin/work/specs/new` | Dépend du builder |
| Page `/admin/work/specs/[slug]/edit` | Dépend du builder |
| Live preview split 50/50 | Dépend du builder |
| Conversion legacy → structured | Outil de migration sur les 54 specs imports — gros morceau |
| Création d'assets (logos, screenshots) liés aux specs | Pas demandé en P1, attendre besoin réel |

---

## 5. Architecture

### 5.1. Nouveaux fichiers

```
EriniumFactionWeb/src/
├── lib/work/roadmap/
│   ├── mutations.ts                    # Helpers DB serveur (insert/update/delete/reorder)
│   └── types.ts                        # (existant — étendre avec payloads mutations)
├── hooks/work/
│   └── useRoadmapMutations.ts          # 9 React Query mutations
├── components/work/roadmap/
│   ├── ProjectFormModal.tsx            # Modal créer/éditer project
│   ├── ConfirmDialog.tsx               # Dialog confirmation suppression (réutilisable)
│   ├── SortableCard.tsx                # Wrapper @dnd-kit pour RoadmapCard
│   ├── SortableTaskItem.tsx            # Wrapper @dnd-kit pour TaskItem
│   ├── TaskItem.tsx                    # Une ligne task avec checkbox/edit/delete
│   ├── TaskComposer.tsx                # Input "+ Ajouter une tâche"
│   ├── DragHandle.tsx                  # Poignée de drag (≡ icon)
│   ├── StatusDropdown.tsx              # Dropdown changer status depuis StatusBadge
│   ├── RoadmapCard.tsx                 # MODIFIÉ — accepte mode édition + DnD
│   └── (existants : StatusBadge, SpecLegacyRenderer)
└── app/api/work/v1/roadmap/
    ├── projects/route.ts               # MODIFIÉ — ajoute POST
    ├── projects/[id]/route.ts          # NOUVEAU — PATCH, DELETE
    ├── projects/reorder/route.ts       # NOUVEAU — POST
    ├── projects/[id]/tasks/route.ts    # NOUVEAU — POST (créer task)
    ├── projects/[id]/tasks/reorder/route.ts  # NOUVEAU — POST
    ├── tasks/[id]/route.ts             # NOUVEAU — PATCH, DELETE
    └── specs/[slug]/route.ts           # MODIFIÉ — ajoute DELETE
```

### 5.2. Modifications fichiers existants

- `src/app/(admin)/admin/work/roadmap/page.tsx` — bouton "Nouveau project" + state modal
- `src/app/(admin)/admin/work/specs/[slug]/page.tsx` — bouton "Supprimer ce spec"
- `src/components/work/roadmap/RoadmapCard.tsx` — mode édition (titre inline, ouvrir modal, supprimer, ajouter tasks)
- `src/lib/work/roadmap/sql.ts` — étendre avec nouvelles requêtes (déjà partiellement présent)

---

## 6. API REST (nouvelles routes / extensions)

Toutes les routes sont sous `/api/work/v1/roadmap/`. Toutes vérifient `requireStaff()` + perm appropriée. Toutes retournent JSON.

### 6.1. `POST /projects` — Créer

**Perm :** `work.roadmap.edit`

**Body :**
```json
{
  "title": "string (1-200)",
  "status": "todo | wip | test | done | blocked",
  "tags": ["string"],
  "category": "string | null"
}
```

**Server :**
- Génère `id` auto (SERIAL)
- `order_idx = COALESCE(MAX(order_idx), -1) + 1` (placé en fin)
- `created_at = updated_at = CURRENT_TIMESTAMP`
- Retourne 201 + `{ project: RoadmapProject }`

**Erreurs :** 400 si titre vide, 403 si pas la perm

### 6.2. `PATCH /projects/[id]` — Éditer

**Perm :** `work.roadmap.edit`

**Body :** champs partiels parmi `title`, `status`, `tags`, `category`

**Server :** UPDATE + `updated_at = CURRENT_TIMESTAMP`. Retourne 200 + `{ project }`

**Erreurs :** 400 validation, 403 perm, 404 not found

### 6.3. `DELETE /projects/[id]` — Supprimer

**Perm :** `work.roadmap.delete`

**Server :**
- DELETE depuis `work_roadmap_projects` (cascade DB supprime aussi `work_roadmap_tasks`)
- Si project a un spec lié : nullify `project_id` sur le spec (le spec orphan reste accessible)
- Retourne 204 No Content

**Erreurs :** 403 perm, 404 not found

### 6.4. `POST /projects/reorder` — Réordonner

**Perm :** `work.roadmap.edit`

**Body :**
```json
{
  "order": [
    { "id": 1, "orderIdx": 0 },
    { "id": 4, "orderIdx": 1 },
    { "id": 2, "orderIdx": 2 }
  ]
}
```

**Server :**
- Validation : tous les ids existent, pas de doublons, `orderIdx = 0..N-1`
- UPDATE en transaction (1 requête `UPDATE ... CASE WHEN id = ?` ou N UPDATEs en transaction)
- Retourne 200 + `{ ok: true }`

**Erreurs :** 400 si validation échoue, 403, 500 si transaction échoue

### 6.5. `POST /projects/[id]/tasks` — Créer task

**Perm :** `work.roadmap.edit`

**Body :**
```json
{
  "title": "string (1-300)",
  "status": "todo | done"  // default todo
}
```

**Server :**
- `order_idx = COALESCE(MAX(order_idx), -1) + 1 WHERE project_id = ?`
- Retourne 201 + `{ task: RoadmapTask }`

### 6.6. `PATCH /tasks/[id]` — Éditer task

**Perm :** `work.roadmap.edit`

**Body :** partiels parmi `title`, `status` (todo | done)

**Server :** UPDATE + `updated_at = CURRENT_TIMESTAMP`. Retourne 200 + `{ task }`

> Note : la table tasks n'a pas de colonne `done_at` ; pour suivre la date de complétion, on s'appuie sur `updated_at` quand `status = 'done'`. P2b pourra ajouter `done_at` si besoin de tracking historique.

### 6.7. `DELETE /tasks/[id]` — Supprimer task

**Perm :** `work.roadmap.delete`

**Server :** DELETE. Retourne 204.

### 6.8. `POST /projects/[id]/tasks/reorder` — Réordonner tasks

**Perm :** `work.roadmap.edit`

**Body :** identique à 6.4 (avec ids des tasks)

**Server :** validation que toutes les tasks appartiennent bien à `project_id`. Sinon 400.

### 6.9. `DELETE /specs/[slug]` — Supprimer spec

**Perm :** `work.roadmap.delete`

**Server :**
- DELETE spec + DELETE spec_assets (cascade FK)
- Retourne 204

---

## 7. React Query — 9 mutations

Toutes dans `src/hooks/work/useRoadmapMutations.ts`. Toutes utilisent le pattern **optimistic update + rollback on error**.

```ts
// Pattern type pour TOUTES les mutations
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await fetch("/api/work/v1/roadmap/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    // onMutate : optimistic update
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["roadmap"] });
      const previous = qc.getQueryData(["roadmap", filters]);
      qc.setQueryData(["roadmap", filters], (old) => [
        ...old,
        { id: Date.now() * -1, ...payload, /* placeholder */ }
      ]);
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      // rollback
      if (ctx?.previous) qc.setQueryData(["roadmap", filters], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
}
```

### Liste des hooks à créer

| Hook | Route | Invalidate |
|---|---|---|
| `useCreateProject()` | POST `/projects` | `["roadmap"]` |
| `useUpdateProject()` | PATCH `/projects/[id]` | `["roadmap"]`, `["roadmap-project", id]` |
| `useDeleteProject()` | DELETE `/projects/[id]` | `["roadmap"]` |
| `useReorderProjects()` | POST `/projects/reorder` | `["roadmap"]` |
| `useCreateTask()` | POST `/projects/[id]/tasks` | `["roadmap-project", id]`, `["roadmap"]` |
| `useUpdateTask()` | PATCH `/tasks/[id]` | `["roadmap-project", projectId]`, `["roadmap"]` |
| `useDeleteTask()` | DELETE `/tasks/[id]` | `["roadmap-project", projectId]`, `["roadmap"]` |
| `useReorderTasks()` | POST `/projects/[id]/tasks/reorder` | `["roadmap-project", id]` |
| `useDeleteSpec()` | DELETE `/specs/[slug]` | `["roadmap-spec", slug]`, `["roadmap"]` |

### Pourquoi optimistic updates ?

L'UX doit être instantanée : un clic sur checkbox doit afficher le done immédiatement, le toast de succès doit être discret. Si la requête échoue (perte de perm, conflict serveur), rollback automatique + toast d'erreur explicite.

---

## 8. Composants UI

### 8.1. `ProjectFormModal.tsx`

**Props :**
```ts
interface Props {
  mode: "create" | "edit";
  project?: RoadmapProject; // requis si mode="edit"
  open: boolean;
  onClose: () => void;
}
```

**Champs :**
- Title (input text, required, maxLength 200)
- Status (select : todo / wip / test / done / blocked)
- Tags (input avec comma-separated, ou tag picker — démarrer simple : input split par virgule)
- Category (input text optional, maxLength 50)

**Comportement :**
- Submit → appelle `useCreateProject` ou `useUpdateProject`
- Fermeture sur succès
- Erreur affichée inline (rouge en bas du modal)

**Style :** Liquid Glass cream — backdrop blur, rounded-2xl, padding généreux

**Modal edit :** mêmes champs que create + pré-remplis depuis `project`. Le `description` n'existe pas en P2a (pas de colonne en DB).

### 8.2. `TaskItem.tsx`

**Props :**
```ts
interface Props {
  task: RoadmapTask;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}
```

**Layout :**
- Checkbox (clickable) → toggle status via `useUpdateTask`
- Label : double-clic → input inline → blur ou Enter pour save
- Bouton trash (visible au hover) → ouvre `ConfirmDialog` → `useDeleteTask`

**Détails :**
- Loading state pendant la mutation (opacity 0.6)
- Animation strike-through quand done (transition CSS)

### 8.3. `TaskComposer.tsx`

**Props :**
```ts
interface Props {
  projectId: number;
  onCreate?: (task: RoadmapTask) => void;
}
```

**Layout :**
- Input "Ajouter une tâche..." + bouton "+"
- Enter ou clic "+" → `useCreateTask` → vide l'input
- Visible uniquement si `hasPerm("work.roadmap.edit")`

### 8.4. `ConfirmDialog.tsx`

**Props :**
```ts
interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;        // ex "Supprimer"
  confirmVariant?: "danger" | "default";
  onConfirm: () => void;
  onClose: () => void;
}
```

**Comportement :** modal centré avec backdrop, focus auto sur Annuler, Echap pour fermer, Enter pour confirmer.

### 8.5. `SortableCard.tsx` + `SortableTaskItem.tsx`

Wrappers @dnd-kit/sortable. Utilisent `useSortable` hook, exposent `setNodeRef`, `attributes`, `listeners`, `transform`, `transition`. Le `listeners` est passé à `DragHandle` (la card entière n'est pas draggable, seule la poignée).

### 8.6. `DragHandle.tsx`

Petite icône `≡` qui apparaît au hover de la card / task. `cursor-grab` au hover, `cursor-grabbing` pendant le drag. Position : à gauche de la card (overlay absolute).

**Visible :** uniquement si `hasPerm("work.roadmap.edit")`.

### 8.7. `StatusDropdown.tsx`

Petit popup au clic du `StatusBadge`. Liste des 5 statuts (todo / wip / test / done / blocked). Sélection → `useUpdateProject({ status })`. Fermeture sur outside-click.

**Visible :** uniquement si `hasPerm("work.roadmap.edit")`.

### 8.8. `RoadmapCard.tsx` (MODIFIÉ)

**Nouvelles props :**
```ts
interface Props {
  project: RoadmapProjectListItem;
  canEdit: boolean;    // hasPerm("work.roadmap.edit")
  canDelete: boolean;  // hasPerm("work.roadmap.delete")
}
```

**Ajouts visuels :**
- Au hover de la card : 3 boutons en haut-droite (à côté du StatusBadge) :
  - ✏️ Éditer → ouvre `ProjectFormModal` en mode edit
  - 🗑️ Supprimer → ouvre `ConfirmDialog`
- StatusBadge devient `StatusDropdown` (si canEdit)
- Titre devient cliquable double-clic pour rename inline
- TaskComposer en bas de la liste expandée (si canEdit)
- Tasks deviennent `<SortableTaskItem>` au lieu de `<li>` (si canEdit, sinon read-only)

**Comportement DnD désactivé en mode read-only** (utilisateur sans perm edit).

---

## 9. Flows UX détaillés

### 9.1. Créer un project

1. User clique **"+ Nouveau project"** en haut de la page Roadmap
2. `ProjectFormModal` s'ouvre vide en mode `create`
3. User remplit titre + status (autres optionnels) → clique "Créer"
4. `useCreateProject.mutate()` → optimistic add en fin de liste → modal se ferme
5. Si succès serveur : `invalidateQueries` confirme la card en DB
6. Si erreur : rollback + toast rouge "Échec création"

### 9.2. Toggle une task

1. User clique la checkbox d'une task (card expanded)
2. `useUpdateTask.mutate({ status: "done" })` → checkbox passe à `checked` immédiatement
3. Strike-through animé sur le label
4. Si erreur : checkbox revient à `unchecked` + toast rouge

### 9.3. DnD réorder projects

1. User hover une card → poignée `≡` apparaît à gauche
2. User mousedown sur la poignée → card se "soulève" (translate-y -2, shadow plus marquée)
3. User drag vers nouvelle position → autres cards font place (transform CSS)
4. User mouseup → `useReorderProjects.mutate({ order: [...] })`
5. Optimistic : la liste reste dans le nouvel ordre. Si erreur serveur : rollback à l'ancien ordre + toast

**Implémentation :** `DndContext` + `SortableContext` en haut de `RoadmapList.tsx`. `closestCenter` collision detection. Animation 200ms `ease-in-out`.

### 9.4. Supprimer un project (cascade)

1. User clique 🗑️ sur la card
2. `ConfirmDialog` s'ouvre : *"Supprimer "X" ? Cela supprimera aussi les N tâches. Le spec lié restera accessible (orphelin)."*
3. User clique "Supprimer" → `useDeleteProject.mutate(id)`
4. Optimistic : card retirée de la liste
5. Si succès : tasks supprimées en DB par cascade FK. Spec orphelin reste consultable via `/admin/work/specs/[slug]` (just sans project_id).
6. Si erreur : card revient + toast

### 9.5. Supprimer un spec

1. User est sur `/admin/work/specs/[slug]` → bouton "🗑️ Supprimer ce spec" en haut-droite (si canDelete)
2. `ConfirmDialog` : *"Supprimer le spec "X" ? Cette action est irréversible."*
3. User confirme → `useDeleteSpec.mutate(slug)` → redirect vers `/admin/work/roadmap`
4. Si erreur : reste sur la page + toast

---

## 10. Permissions

| Permission | Routes protégées | UI gated |
|---|---|---|
| `work.roadmap.view` | (toutes les GET — déjà P1) | Voir la page roadmap, expand cards, voir tasks |
| `work.roadmap.edit` | POST /projects, PATCH /projects/[id], POST /projects/reorder, POST /projects/[id]/tasks, PATCH /tasks/[id], POST /projects/[id]/tasks/reorder | Bouton "+ Nouveau project", édition inline, modal edit, StatusDropdown, DragHandle, TaskComposer, checkbox cliquable |
| `work.roadmap.delete` | DELETE /projects/[id], DELETE /tasks/[id], DELETE /specs/[slug] | Boutons 🗑️ sur card / task / spec viewer |

**Seed actuel** (déjà fait en P1) : `admin` + `lead` ont les 3 perms. Owner Discord ID `909862540945793094` a wildcard `*`. Autres rôles : aucune.

---

## 11. Edge cases & robustesse

### 11.1. Concurrent edits

**Scénario :** killian édite "Project A" pendant qu'un autre staff (théorique, futur) le supprime.

**Politique :** last-write-wins. Pas de version locking. Si killian sauve son edit après suppression, l'UPDATE retourne 404, le hook affiche un toast "Project introuvable, peut-être supprimé".

**Pourquoi acceptable :** rare (un seul utilisateur en pratique pour l'instant). On documente. Si ça pose problème en P3+, on ajoutera un champ `version` int incrémenté à chaque UPDATE.

### 11.2. Reorder partiel / invalide

**Scénario :** payload reorder contient un id qui n'existe pas, ou des order_index dupliqués, ou il manque un project.

**Politique :** valider serveur strictement. Si validation échoue → 400 + rollback côté client.

**Pourquoi :** éviter un état incohérent en DB.

### 11.3. Optimistic conflict avec fetch en cours

**Scénario :** user click checkbox pendant qu'un refetch est en cours.

**Politique :** `await qc.cancelQueries(...)` dans `onMutate` annule le refetch in-flight. L'optimistic update prend précédence. Le `onSettled` final relance un fetch propre.

### 11.4. Permission perdue en cours de session

**Scénario :** un staff a la perm, ouvre la page, perm révoquée serveur, tente une mutation.

**Politique :** serveur retourne 403, hook affiche toast "Permission refusée — rechargez la page". Pas de panic UI.

### 11.5. Tag vide / whitespace / doublons

**Politique côté serveur :**
- `trim()` chaque tag
- Drop les vides
- Dédoublonner case-insensitive
- Max 10 tags par project (limite arbitraire raisonnable)

### 11.6. Suppression d'un project avec spec lié

**Politique :** ne pas supprimer le spec (il pourrait être référencé ailleurs). Juste set `project_id = NULL` sur le spec. Le spec reste accessible via son slug. L'utilisateur peut le supprimer manuellement via /specs/[slug] s'il le veut.

### 11.7. Échec partiel du reorder

**Scénario :** transaction DB échoue au milieu (improbable mais possible).

**Politique :** transaction Postgres garantit atomicity. Si KO → rien committé → rollback client + retry possible.

---

## 12. Pagination, performance

**Pagination :** pas nécessaire en P2a. La P1 affiche déjà tous les projects (55) en une fois sans souci. Si on dépasse 200 projects, ajouter pagination en P3+.

**Index DB :** `work_roadmap_projects(order_index)` et `work_roadmap_tasks(project_id, order_index)` doivent exister. Vérifier via `\d work_roadmap_projects` dans Neon SQL Editor. Si manquants, ajouter dans une migration.

**Bundle size :** `@dnd-kit/core` + `@dnd-kit/sortable` ≈ 15 KB gzipped. Acceptable.

---

## 13. Tests manuels (smoke checklist)

À exécuter après chaque déploiement Vercel.

- [ ] **Connexion staff** sur `/admin/work/roadmap` → page charge avec 55 projects
- [ ] **Créer project** → modal s'ouvre, submit → card apparaît immédiatement en fin de liste
- [ ] **Éditer titre inline** → double-clic, modifier, Enter → titre change
- [ ] **Éditer via modal** → bouton ✏️, modifier description + tags, sauver → card reflète
- [ ] **Changer status** via StatusBadge → dropdown, sélectionner, badge change couleur
- [ ] **DnD project** → drag une card du milieu vers le top → ordre persistant après refresh
- [ ] **Expand card → ajouter task** → tape "Test", Enter → task apparaît en bas de liste
- [ ] **Toggle task** → checkbox, strike-through animé, persistant après refresh
- [ ] **DnD task** → réordonner dans la liste expandée → persistant après refresh
- [ ] **Supprimer task** → bouton trash, confirm, task disparaît
- [ ] **Supprimer project** → confirm dialog mentionne N tasks → cascade OK en DB
- [ ] **Supprimer spec** depuis viewer → confirm → redirect vers /roadmap
- [ ] **Sans perm edit** → boutons ✏️, +, DnD, dropdown invisibles
- [ ] **Sans perm delete** → boutons 🗑️ invisibles

---

## 14. Migration DB

**Aucune migration nécessaire en P2a.** Les 4 tables P1 (`work_roadmap_projects`, `work_roadmap_tasks`, `work_roadmap_specs`, `work_roadmap_spec_assets`) ont déjà les colonnes nécessaires :
- `order_idx INTEGER NOT NULL DEFAULT 0`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`

**Indexes** : `idx_work_roadmap_tasks_project` existe déjà. Pour le reorder projects, l'`ORDER BY order_idx` actuel s'appuie sur scan séquentiel (55 lignes → négligeable). Si performance dégrade en P3+ on ajoutera :
```sql
CREATE INDEX IF NOT EXISTS idx_work_roadmap_projects_order ON work_roadmap_projects(order_idx);
```

---

## 15. Plan de déploiement P2a

1. Implémentation tâches (voir plan P2a séparé)
2. Tests manuels en local sur DB de dev
3. Push sur main → déploiement Vercel automatique
4. Smoke test prod (checklist §13)
5. Si KO → revert + investigation
6. Si OK → mise à jour `docs/knowissue.md` avec les bugs trouvés + fix

---

## 16. Métriques de succès P2a

- ✅ 100% des items §13 cochés
- ✅ 0 régression sur les fonctionnalités P1 (lecture, expand cards, view spec, sidebar)
- ✅ Toutes les mutations < 500ms en p95 (Vercel Edge Region Paris)
- ✅ Aucune erreur dans Vercel logs sur 24h après deploy
- ✅ killian peut créer un project + 5 tasks + les réordonner + en supprimer un en < 1 min

---

## 17. Risques identifiés

| Risque | Impact | Mitigation |
|---|---|---|
| @dnd-kit incompatibilité React 19 / Next 16 | Bloquant | Vérifier compat en début de plan ; fallback : library alternative (`react-sortable-hoc`, ou DnD natif HTML5) |
| Optimistic update bug → état UI désync | Moyen | Tests serrés sur invalidate + onError ; toast d'erreur explicite |
| Cascade delete supprime des données critiques sans backup | Élevé | `ConfirmDialog` explicite mentionne le nombre de tasks ; documentation user dans /admin/work/roadmap si besoin |
| Permissions UI vs API désync (UI laisse cliquer mais API refuse) | Faible | Serveur reste source de vérité ; UI gate uniquement cosmétique |

---

## 18. Référence : tables DB existantes (P1)

Schéma réel d'après `EriniumFactionWeb/migrations/phase6-roadmap.sql` :

```sql
CREATE TABLE work_roadmap_projects (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('todo','wip','test','done','blocked')),
  tags            TEXT[] NOT NULL DEFAULT '{}',
  category        TEXT,
  order_idx       INTEGER NOT NULL DEFAULT 0,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_roadmap_tasks (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES work_roadmap_projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('todo','done')) DEFAULT 'todo',
  order_idx       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_work_roadmap_tasks_project ON work_roadmap_tasks(project_id);

CREATE TABLE work_roadmap_specs (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER REFERENCES work_roadmap_projects(id) ON DELETE SET NULL,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('legacy','structured')),
  feature_type    TEXT,
  answers         JSONB,
  raw_html        TEXT,
  status          TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (kind = 'legacy'     AND raw_html IS NOT NULL AND answers IS NULL) OR
    (kind = 'structured' AND answers  IS NOT NULL AND raw_html IS NULL)
  )
);

CREATE TABLE work_roadmap_spec_assets (
  id              SERIAL PRIMARY KEY,
  spec_id         INTEGER NOT NULL REFERENCES work_roadmap_specs(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  blob_url        TEXT NOT NULL,
  uploaded_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Différences P2a vs schéma actuel** :
- Aucune migration nécessaire (les colonnes utilisées existent toutes).
- `order_idx` est déjà là sur projects et tasks.
- Pas de `description` sur projects (volontaire, on garde simple).
- Pas de `done_at` sur tasks (on s'appuie sur `updated_at + status='done'`).

---

**Fin du spec P2a.**
