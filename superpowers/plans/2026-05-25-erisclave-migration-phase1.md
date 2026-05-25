# Erisclave Migration — Phase 1 (Backend + Roadmap read-only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The repo has no test framework — verification is done by running build/dev, hitting routes with curl, and opening pages in a browser. Each task ends with a commit.

**Goal:** Importer la roadmap statique (`docs/roadmap.html`) et les 55 specs HTML (`docs/specs/*.html`) dans la base Neon, exposer une page `/admin/work/roadmap` (grille des projects) et `/admin/work/specs/<slug>` (visualisation d'un spec) en read-only, puis supprimer les fichiers statiques du submodule `docs/`.

**Architecture:** 3 couches — DB Neon Postgres (4 tables `work_roadmap_*`), API routes Next.js (`/api/work/v1/roadmap/...`, read-only en P1), pages React (thème crème porté en Tailwind). Un script one-shot importe le HTML legacy. Pas d'édition en P1 (CRUD = Phase 2). Source de vérité = DB ; les fichiers `docs/roadmap.html` + `docs/specs/` disparaissent en fin de phase après archivage sur une branche dédiée.

**Tech Stack:** Next.js 16 App Router, `@neondatabase/serverless`, TypeScript strict, `cheerio` (parsing HTML legacy), `sanitize-html` (jamais `dompurify`/`isomorphic-dompurify` — incompatible avec les serverless functions Vercel cf. `lib/work/sanitize.ts`), Tailwind v4 (via `@theme inline` dans `globals.css`), React Query, Zod. Pas d'`isolation: worktree` requise — l'agent travaille dans la copie courante.

**Spec source :** `docs/superpowers/specs/2026-05-25-erisclave-migration-design.md`

---

## File Structure

### Fichiers à créer

| Chemin | Responsabilité |
|--------|----------------|
| `EriniumFactionWeb/migrations/phase6-roadmap.sql` | DDL idempotent des 4 tables + index + seed des 3 perms |
| `EriniumFactionWeb/src/lib/work/roadmap/types.ts` | Types TS partagés (`RoadmapProject`, `RoadmapTask`, `RoadmapSpec`, `RoadmapSpecAsset`, `Status`, `SpecKind`) |
| `EriniumFactionWeb/src/lib/work/roadmap/queries.ts` | Helpers DB (5 fonctions read-only) |
| `EriniumFactionWeb/src/lib/work/roadmap/sanitize-spec.ts` | Wrapper `sanitize-html` avec whitelist large pour `kind='legacy'` |
| `EriniumFactionWeb/src/lib/work/roadmap/validators.ts` | Schémas Zod (juste les params Phase 1 : slug, project_id) |
| `EriniumFactionWeb/src/app/api/work/v1/roadmap/route.ts` | `GET /api/work/v1/roadmap` — liste projects + counts tasks + premier spec |
| `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/route.ts` | `GET ...projects/:id` — détail d'un project |
| `EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/[slug]/route.ts` | `GET ...specs/:slug` — détail spec (renvoie HTML sanitizé si `kind='legacy'`) |
| `EriniumFactionWeb/src/app/(admin)/admin/work/roadmap/page.tsx` | Page grille (SSR fetch initial + React Query) |
| `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/page.tsx` | Page viewer (`dangerouslySetInnerHTML` après sanitize côté serveur) |
| `EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx` | Carte project avec statut, tags, progression, lien spec |
| `EriniumFactionWeb/src/components/work/roadmap/RoadmapFilters.tsx` | Filtres tags + status + catégorie (drawer mobile) |
| `EriniumFactionWeb/src/components/work/roadmap/SpecLegacyRenderer.tsx` | Renderer HTML legacy (client component, dompurify-style fallback côté client si JS arrive après SSR) |
| `EriniumFactionWeb/src/hooks/work/useRoadmap.ts` | React Query hook pour `/api/work/v1/roadmap` |
| `EriniumFactionWeb/scripts/import-legacy-roadmap.ts` | Script one-shot : parse `docs/roadmap.html` + `docs/specs/*.html` → INSERT en DB |
| `EriniumFactionWeb/scripts/dump-roadmap.ts` | Outil CLI pour snapshot offline (Claude) |

### Fichiers à modifier

| Chemin | Modification |
|--------|--------------|
| `EriniumFactionWeb/src/lib/db/index.ts` | Ajouter 4 `CREATE TABLE IF NOT EXISTS` + 2 index dans `_initDbInternal()` (vers la fin, avant la dernière `;`) |
| `EriniumFactionWeb/src/app/globals.css` | Ajouter 9 tokens `--color-erisclave-*` dans le `@theme inline` |
| `EriniumFactionWeb/src/components/work/layout/links.tsx` | Insérer un lien "Roadmap" dans `SIDEBAR_LINKS` (entre `calendar` et `integrations`) |
| `EriniumFactionWeb/src/components/work/layout/icons.tsx` | Ajouter un `IconRoadmap` (lucide-style path) |
| `EriniumFactionWeb/package.json` | Ajouter `tsx` en `devDependencies` (pour exécuter les scripts TS) si pas déjà là |
| `D:/Mods Minecraft/EriniumFaction/CLAUDE.md` (root) | Remplacer les 3 refs à `docs/roadmap.html` + `docs/specs/` par URLs |
| `D:/Mods Minecraft/EriniumFaction/docs/permissions.md` | Ajouter section "Roadmap" avec les 3 nouvelles perms |
| `D:/Mods Minecraft/EriniumFaction/docs/knowissue.md` | (en fin de phase) Documenter les pièges rencontrés |

### Fichiers à supprimer (fin de phase)

| Chemin | Pourquoi |
|--------|----------|
| `D:/Mods Minecraft/EriniumFaction/docs/roadmap.html` | Remplacé par DB |
| `D:/Mods Minecraft/EriniumFaction/docs/specs/` (tout le dossier) | Remplacé par DB |
| `D:/Mods Minecraft/EriniumFaction/docs/applications/erisclave/` | App Electron remplacée par UI web (Phase 2) — mais on supprime dès P1 car le HTML/script Erisclave ne sert plus à rien sans les fichiers cibles |

---

## Pré-requis

Avant de commencer toute task, l'agent DOIT :

- [ ] **Lire** : `CLAUDE.md` (root) + `EriniumFactionWeb/ARCHITECTURE.md` + `docs/knowissue.md` + `docs/permissions.md`
- [ ] **Lire le design source** : `docs/superpowers/specs/2026-05-25-erisclave-migration-design.md`
- [ ] **Vérifier le cwd** : toutes les commandes sont exécutées depuis `D:/Mods Minecraft/EriniumFaction/EriniumFactionWeb/` sauf indication contraire
- [ ] **Vérifier les remotes** : `cd EriniumFactionWeb && git remote -v` doit montrer `origin` (le repo `JLSkyzer/EriniumFactionWeb`). Le submodule `docs/` a son propre remote `Erinium-Group/EriniumWorkflow` — ne pas confondre.
- [ ] **DB_SKIP_INIT** : sur Vercel prod c'est `=1`, en local c'est unset. Les nouvelles tables doivent être (a) dans `phase6-roadmap.sql` pour la prod, (b) dans `_initDbInternal()` pour le dev local
- [ ] **Pas de Co-Authored-By** dans les commits (rule CLAUDE.md)
- [ ] **Push silencieux** sur repos privés (rule CLAUDE.md)

---

## Task 1: Migration SQL + initDb wiring

**Files:**
- Create: `EriniumFactionWeb/migrations/phase6-roadmap.sql`
- Modify: `EriniumFactionWeb/src/lib/db/index.ts` (append 4 `CREATE TABLE IF NOT EXISTS` à la fin de `_initDbInternal()`, juste avant la dernière accolade fermante)

- [ ] **Step 1: Créer `migrations/phase6-roadmap.sql`**

Contenu intégral du fichier :

```sql
-- ============================================================================
-- Migration manuelle Phase 6 — Roadmap + Specs (Erisclave migration)
-- ----------------------------------------------------------------------------
-- A executer dans la console Neon SQL editor en prod (DB_SKIP_INIT=1).
-- 100% idempotent : peut etre execute plusieurs fois sans erreur ni doublon.
-- Aucun DROP, aucun TRUNCATE, aucune perte de donnees.
--
-- Cible : Phase 1 — read-only viewer. Les inserts initiaux sont faits par
-- scripts/import-legacy-roadmap.ts (importer les 55 specs HTML legacy + le
-- roadmap.html du submodule docs/).
--
-- Date : 2026-05-25
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table : work_roadmap_projects
-- Un projet = un "card" sur la roadmap. Regroupe des tasks + des specs.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_roadmap_projects (
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

-- ----------------------------------------------------------------------------
-- Table : work_roadmap_tasks
-- Les sous-tâches affichées sous chaque card roadmap.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_roadmap_tasks (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES work_roadmap_projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('todo','done')) DEFAULT 'todo',
  order_idx       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_work_roadmap_tasks_project
  ON work_roadmap_tasks(project_id);

-- ----------------------------------------------------------------------------
-- Table : work_roadmap_specs
-- Le cahier des charges. Deux 'kind' :
--   - 'legacy'    : raw_html non-NULL, answers NULL (specs importes en P1)
--   - 'structured': answers JSON non-NULL, raw_html NULL (nouveaux specs P2+)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_roadmap_specs (
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
CREATE INDEX IF NOT EXISTS idx_work_roadmap_specs_slug
  ON work_roadmap_specs(slug);
CREATE INDEX IF NOT EXISTS idx_work_roadmap_specs_project
  ON work_roadmap_specs(project_id);

-- ----------------------------------------------------------------------------
-- Table : work_roadmap_spec_assets (images attachees aux specs structures)
-- En Phase 1 la table est juste creee, jamais ecrite (P2 ajoutera l'upload).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_roadmap_spec_assets (
  id              SERIAL PRIMARY KEY,
  spec_id         INTEGER NOT NULL REFERENCES work_roadmap_specs(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  blob_url        TEXT NOT NULL,
  uploaded_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_work_roadmap_spec_assets_spec
  ON work_roadmap_spec_assets(spec_id);

-- ----------------------------------------------------------------------------
-- Seed des 3 nouvelles permissions
-- ----------------------------------------------------------------------------
-- Owner Discord (909862540945793094) court-circuit en wildcard "*", donc pas
-- besoin d'inserer les perms pour lui. On les ajoute au role 'admin' par defaut
-- (les autres roles peuvent etre ajustes via l'UI roles plus tard).
INSERT INTO staff_role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM staff_roles r
CROSS JOIN (VALUES
  ('work.roadmap.view'),
  ('work.roadmap.edit'),
  ('work.roadmap.delete')
) AS p(permission)
WHERE r.slug IN ('admin', 'lead')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Lire les 50 dernières lignes de `src/lib/db/index.ts`**

Commande :
```bash
cd EriniumFactionWeb && wc -l src/lib/db/index.ts
```

Identifier le dernier `await exec(...)` de `_initDbInternal()` (avant la `}` qui ferme la fonction). Toutes les nouvelles `CREATE TABLE` doivent s'insérer juste avant cette accolade.

- [ ] **Step 3: Ajouter les 4 tables à `_initDbInternal()` dans `src/lib/db/index.ts`**

Insérer ce bloc juste avant la `}` finale de `_initDbInternal()` (utiliser `Edit` avec un `old_string` qui matche le dernier `await exec(...)` actuel + un peu de contexte) :

```typescript
  // ─── Roadmap (Phase 6 — Erisclave migration) ────────────────────
  await exec(`CREATE TABLE IF NOT EXISTS work_roadmap_projects (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('todo','wip','test','done','blocked')),
    tags            TEXT[] NOT NULL DEFAULT '{}',
    category        TEXT,
    order_idx       INTEGER NOT NULL DEFAULT 0,
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS work_roadmap_tasks (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES work_roadmap_projects(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('todo','done')) DEFAULT 'todo',
    order_idx       INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_work_roadmap_tasks_project ON work_roadmap_tasks(project_id)`);

  await exec(`CREATE TABLE IF NOT EXISTS work_roadmap_specs (
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
  )`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_work_roadmap_specs_slug ON work_roadmap_specs(slug)`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_work_roadmap_specs_project ON work_roadmap_specs(project_id)`);

  await exec(`CREATE TABLE IF NOT EXISTS work_roadmap_spec_assets (
    id              SERIAL PRIMARY KEY,
    spec_id         INTEGER NOT NULL REFERENCES work_roadmap_specs(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    blob_url        TEXT NOT NULL,
    uploaded_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_work_roadmap_spec_assets_spec ON work_roadmap_spec_assets(spec_id)`);
```

- [ ] **Step 4: Build pour vérifier la syntaxe**

Commande :
```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -30
```

Attendu : `Compiled successfully` (ou pas d'erreur TS sur `src/lib/db/index.ts`). Si erreur de build → corriger (probable cause : indentation cassée, ou template literal mal fermé).

- [ ] **Step 5: Test manuel en local — appliquer les tables**

Vérifier qu'en local (sans `DB_SKIP_INIT=1`) le init crée bien les tables :

```bash
cd EriniumFactionWeb && pnpm dev
# Dans un autre terminal :
curl -s http://localhost:3000/api/work/v1/me
```

Attendu : la réponse 401 (non auth) — ce qui prouve que initDb a tourné sans crash. Optionnel : se connecter à la DB Neon via le SQL editor et vérifier `SELECT * FROM work_roadmap_projects;` retourne `0 rows`.

- [ ] **Step 6: Commit**

```bash
cd EriniumFactionWeb && git add migrations/phase6-roadmap.sql src/lib/db/index.ts
git commit -m "feat(work/roadmap): migration SQL + init des 4 tables work_roadmap_*"
```

---

## Task 2: Types TS + helpers DB read-only

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/roadmap/types.ts`
- Create: `EriniumFactionWeb/src/lib/work/roadmap/queries.ts`
- Create: `EriniumFactionWeb/src/lib/work/roadmap/validators.ts`

- [ ] **Step 1: Créer `src/lib/work/roadmap/types.ts`**

```typescript
/**
 * Types TS partages pour le module Roadmap (Erisclave migration Phase 6).
 *
 * Mirror exact des tables work_roadmap_* (cf. migrations/phase6-roadmap.sql).
 * Les dates sont serialisees en ISO string (DB renvoie Date, on convertit
 * cote helper avant de renvoyer aux routes).
 */

export type ProjectStatus = "todo" | "wip" | "test" | "done" | "blocked";
export type TaskStatus = "todo" | "done";
export type SpecKind = "legacy" | "structured";

export interface RoadmapProject {
  id: number;
  title: string;
  status: ProjectStatus;
  tags: string[];
  category: string | null;
  orderIdx: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Forme renvoyee par la liste des projects (avec compteurs + 1er spec slug). */
export interface RoadmapProjectListItem extends RoadmapProject {
  tasksDone: number;
  tasksTotal: number;
  firstSpecSlug: string | null;
}

export interface RoadmapTask {
  id: number;
  projectId: number;
  title: string;
  status: TaskStatus;
  orderIdx: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapSpec {
  id: number;
  projectId: number | null;
  slug: string;
  title: string;
  kind: SpecKind;
  featureType: string | null;
  answers: unknown | null;
  rawHtml: string | null;
  status: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapSpecAsset {
  id: number;
  specId: number;
  filename: string;
  blobUrl: string;
  uploadedAt: string;
}
```

- [ ] **Step 2: Créer `src/lib/work/roadmap/validators.ts`**

```typescript
/**
 * Schemas Zod pour les routes Roadmap (Phase 1 read-only — slug + project_id).
 */
import { z } from "zod";

/** Slug d'un spec : 3-100 chars, lowercase, alphanumeric + tirets. */
export const SpecSlugSchema = z
  .string()
  .min(3, "slug trop court")
  .max(100, "slug trop long")
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "slug invalide (alphanumerique + tirets)");

/** Project id : entier > 0. */
export const ProjectIdSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? Number(v) : v))
  .pipe(z.number().int().positive());

/** Query params optionnels pour GET /roadmap (filtres). */
export const RoadmapListQuerySchema = z.object({
  status: z.enum(["todo", "wip", "test", "done", "blocked"]).optional(),
  category: z.string().min(1).max(50).optional(),
  tag: z.string().min(1).max(50).optional(),
});

export type RoadmapListQuery = z.infer<typeof RoadmapListQuerySchema>;
```

- [ ] **Step 3: Créer `src/lib/work/roadmap/queries.ts`**

```typescript
/**
 * Helpers DB read-only pour le module Roadmap (Phase 1).
 *
 * Toutes les fonctions appellent initDb() en premier (no-op si DB_SKIP_INIT=1
 * ou si _initPromise est deja resolu).
 *
 * Pas de logique metier ici — juste des SELECT + transformation snake_case
 * vers camelCase pour matcher les types TS.
 */
import { query, initDb } from "@/lib/db";
import type {
  RoadmapProject,
  RoadmapProjectListItem,
  RoadmapTask,
  RoadmapSpec,
  ProjectStatus,
} from "./types";
import type { RoadmapListQuery } from "./validators";

type ProjectRow = {
  id: number;
  title: string;
  status: ProjectStatus;
  tags: string[];
  category: string | null;
  order_idx: number;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};

function mapProject(r: ProjectRow): RoadmapProject {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    tags: r.tags ?? [],
    category: r.category,
    orderIdx: r.order_idx,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/**
 * Liste tous les projects avec compteurs tasks + premier spec slug.
 * Filtres optionnels : status, category, tag (au plus 1 tag, un AND/multi-tag
 * se fera plus tard si besoin).
 */
export async function listRoadmapProjects(
  filters: RoadmapListQuery = {},
): Promise<RoadmapProjectListItem[]> {
  await initDb();
  const where: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  if (filters.status) {
    where.push(`p.status = $${p++}`);
    params.push(filters.status);
  }
  if (filters.category) {
    where.push(`p.category = $${p++}`);
    params.push(filters.category);
  }
  if (filters.tag) {
    where.push(`$${p++} = ANY(p.tags)`);
    params.push(filters.tag);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = (await query(
    `SELECT
       p.id, p.title, p.status, p.tags, p.category, p.order_idx,
       p.created_by, p.created_at, p.updated_at,
       (SELECT COUNT(*)::int FROM work_roadmap_tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done,
       (SELECT COUNT(*)::int FROM work_roadmap_tasks t WHERE t.project_id = p.id) AS tasks_total,
       (SELECT s.slug FROM work_roadmap_specs s WHERE s.project_id = p.id ORDER BY s.id ASC LIMIT 1) AS first_spec_slug
     FROM work_roadmap_projects p
     ${whereSql}
     ORDER BY p.order_idx ASC, p.id ASC`,
    params,
  )) as Array<
    ProjectRow & { tasks_done: number; tasks_total: number; first_spec_slug: string | null }
  >;

  return rows.map((r) => ({
    ...mapProject(r),
    tasksDone: r.tasks_done,
    tasksTotal: r.tasks_total,
    firstSpecSlug: r.first_spec_slug,
  }));
}

/** Detail d'un project + tasks rangees + slugs des specs. */
export async function getRoadmapProjectById(id: number): Promise<{
  project: RoadmapProject;
  tasks: RoadmapTask[];
  specSlugs: string[];
} | null> {
  await initDb();
  const rows = (await query(
    `SELECT id, title, status, tags, category, order_idx, created_by, created_at, updated_at
     FROM work_roadmap_projects WHERE id = $1`,
    [id],
  )) as ProjectRow[];
  if (rows.length === 0) return null;

  const tasksRows = (await query(
    `SELECT id, project_id, title, status, order_idx, created_at, updated_at
     FROM work_roadmap_tasks WHERE project_id = $1 ORDER BY order_idx ASC, id ASC`,
    [id],
  )) as Array<{
    id: number;
    project_id: number;
    title: string;
    status: "todo" | "done";
    order_idx: number;
    created_at: Date;
    updated_at: Date;
  }>;

  const specRows = (await query(
    `SELECT slug FROM work_roadmap_specs WHERE project_id = $1 ORDER BY id ASC`,
    [id],
  )) as Array<{ slug: string }>;

  return {
    project: mapProject(rows[0]),
    tasks: tasksRows.map((t) => ({
      id: t.id,
      projectId: t.project_id,
      title: t.title,
      status: t.status,
      orderIdx: t.order_idx,
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
    })),
    specSlugs: specRows.map((s) => s.slug),
  };
}

/** Liste les tasks d'un project (helper isole pour les vues). */
export async function listTasksForProject(projectId: number): Promise<RoadmapTask[]> {
  const detail = await getRoadmapProjectById(projectId);
  return detail?.tasks ?? [];
}

/** Spec par slug. Renvoie null si absent. */
export async function getSpecBySlug(slug: string): Promise<RoadmapSpec | null> {
  await initDb();
  const rows = (await query(
    `SELECT id, project_id, slug, title, kind, feature_type, answers, raw_html, status,
            created_by, created_at, updated_at
     FROM work_roadmap_specs WHERE slug = $1`,
    [slug],
  )) as Array<{
    id: number;
    project_id: number | null;
    slug: string;
    title: string;
    kind: "legacy" | "structured";
    feature_type: string | null;
    answers: unknown | null;
    raw_html: string | null;
    status: string | null;
    created_by: number | null;
    created_at: Date;
    updated_at: Date;
  }>;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    projectId: r.project_id,
    slug: r.slug,
    title: r.title,
    kind: r.kind,
    featureType: r.feature_type,
    answers: r.answers,
    rawHtml: r.raw_html,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/** Tous les specs d'un project. Utile pour les pages "liste". */
export async function listSpecsForProject(projectId: number): Promise<RoadmapSpec[]> {
  await initDb();
  const rows = (await query(
    `SELECT id, project_id, slug, title, kind, feature_type, answers, raw_html, status,
            created_by, created_at, updated_at
     FROM work_roadmap_specs WHERE project_id = $1 ORDER BY id ASC`,
    [projectId],
  )) as Array<{
    id: number;
    project_id: number | null;
    slug: string;
    title: string;
    kind: "legacy" | "structured";
    feature_type: string | null;
    answers: unknown | null;
    raw_html: string | null;
    status: string | null;
    created_by: number | null;
    created_at: Date;
    updated_at: Date;
  }>;
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    slug: r.slug,
    title: r.title,
    kind: r.kind,
    featureType: r.feature_type,
    answers: r.answers,
    rawHtml: r.raw_html,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}
```

- [ ] **Step 2bis: Vérifier le typecheck**

```bash
cd EriniumFactionWeb && pnpm tsc --noEmit 2>&1 | tail -20
```

Attendu : 0 erreur sur `src/lib/work/roadmap/*`. Si erreur "Module has no exported member" → corriger imports/exports.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb && git add src/lib/work/roadmap/
git commit -m "feat(work/roadmap): types TS + helpers DB read-only"
```

---

## Task 3: Sanitize helper pour HTML legacy

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/roadmap/sanitize-spec.ts`

Les 55 specs HTML legacy embarquent du `<style>` inline (palette violette/cyan), des `<svg>`, des `<table>`, des `<pre><code>`. Le sanitize doit être plus large que `sanitizeCardDescription` (qui est restreint au TipTap).

- [ ] **Step 1: Créer le fichier**

```typescript
/**
 * Sanitize HTML pour les specs `kind='legacy'`.
 *
 * Les specs importes depuis docs/specs/*.html contiennent du HTML riche
 * (style inline, svg, tables, code, blockquote). On veut preserver le visuel
 * tout en bloquant les vecteurs XSS :
 *  - script, iframe, object, embed, form, input, button → strip
 *  - on* event handlers → strip
 *  - javascript:, data: (sauf data:image/...), vbscript: → strip
 *  - <style> tag → preserve (les specs embarquent leur CSS via <style> au
 *    debut du document) — sanitize-html supporte allowedTags incluant 'style'
 *    si on lui demande de garder le contenu textuel
 *
 * Implementation : sanitize-html (cf. lib/work/sanitize.ts pour le rationale
 * "pas de jsdom"). Wrap dans une fonction stateless.
 */
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS: string[] = [
  // headings
  "h1", "h2", "h3", "h4", "h5", "h6",
  // structure
  "div", "section", "article", "header", "footer", "main", "nav", "aside",
  "p", "br", "hr", "span",
  // text
  "strong", "em", "u", "s", "small", "sub", "sup", "mark", "abbr",
  // listes
  "ul", "ol", "li", "dl", "dt", "dd",
  // tables
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  // code
  "pre", "code", "kbd", "samp", "var",
  // citations / quotes
  "blockquote", "cite", "q",
  // medias safes
  "img", "figure", "figcaption",
  // links
  "a",
  // SVG (les specs ont des icones SVG inline)
  "svg", "path", "g", "circle", "rect", "polygon", "polyline", "line", "ellipse",
  "defs", "use", "symbol", "title", "desc",
  // style tag (les specs embarquent leur CSS dans <style>)
  "style",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  "*": ["class", "id", "style", "title", "lang", "dir"],
  a: ["href", "target", "rel"],
  img: ["src", "alt", "title", "width", "height", "loading"],
  // SVG : on garde tout ce qui est usuel
  svg: ["viewBox", "xmlns", "width", "height", "fill", "stroke", "preserveAspectRatio"],
  path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule"],
  g: ["transform", "fill", "stroke", "opacity"],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
  rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke"],
  polygon: ["points", "fill", "stroke"],
  polyline: ["points", "fill", "stroke"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
  ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke"],
  use: ["href", "x", "y", "width", "height"],
  symbol: ["viewBox", "id"],
  table: ["border", "cellpadding", "cellspacing"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
};

/** Force target="_blank" + rel="noopener noreferrer" sur les liens externes. */
const A_TRANSFORM: sanitizeHtml.Transformer = (_tag, attribs) => {
  const href = attribs.href ?? "";
  const isExternal = href.startsWith("http://") || href.startsWith("https://");
  return {
    tagName: "a",
    attribs: {
      ...attribs,
      ...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {}),
    },
  };
};

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  // On accepte les data:image/* (les specs en ont parfois pour des icones)
  // ainsi que http/https/mailto pour les liens et images.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
    a: ["http", "https", "mailto", "#"],
  },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // Conserve le contenu textuel des <style> au lieu de le strip avec le tag.
  // Cf. https://github.com/apostrophecms/sanitize-html#allowedstylestags
  allowedStyles: {
    "*": {
      // Whitelist large mais explicite (les specs utilisent beaucoup de couleurs,
      // tailles, marges, flexbox). On bloque par defaut les expressions JS et url()
      // dangereuses.
      color: [/.*/],
      "background-color": [/.*/],
      background: [/.*/],
      "font-size": [/.*/],
      "font-weight": [/.*/],
      "font-family": [/.*/],
      "text-align": [/.*/],
      "text-decoration": [/.*/],
      margin: [/.*/],
      "margin-top": [/.*/],
      "margin-bottom": [/.*/],
      "margin-left": [/.*/],
      "margin-right": [/.*/],
      padding: [/.*/],
      "padding-top": [/.*/],
      "padding-bottom": [/.*/],
      "padding-left": [/.*/],
      "padding-right": [/.*/],
      width: [/.*/],
      height: [/.*/],
      "max-width": [/.*/],
      "max-height": [/.*/],
      "min-width": [/.*/],
      "min-height": [/.*/],
      border: [/.*/],
      "border-radius": [/.*/],
      "border-color": [/.*/],
      "border-width": [/.*/],
      "border-style": [/.*/],
      display: [/^(block|inline|inline-block|flex|inline-flex|grid|inline-grid|none|table|table-cell|table-row)$/],
      "flex-direction": [/.*/],
      "justify-content": [/.*/],
      "align-items": [/.*/],
      gap: [/.*/],
      "box-shadow": [/.*/],
      opacity: [/.*/],
      transform: [/.*/],
      transition: [/.*/],
      position: [/^(static|relative|absolute|fixed|sticky)$/],
      top: [/.*/],
      right: [/.*/],
      bottom: [/.*/],
      left: [/.*/],
      "z-index": [/.*/],
      overflow: [/.*/],
      "overflow-x": [/.*/],
      "overflow-y": [/.*/],
      cursor: [/.*/],
      "line-height": [/.*/],
      "letter-spacing": [/.*/],
      "white-space": [/.*/],
      "word-break": [/.*/],
    },
  },
  transformTags: { a: A_TRANSFORM },
  disallowedTagsMode: "discard",
  // IMPORTANT : ne pas strip les <style>, juste sanitize leur contenu textuel.
  // sanitize-html v2.17+ supporte allowVulnerableTags pour <style>.
  allowVulnerableTags: true,
  // Pour les <script> et compagnie : on les strip avec leur contenu.
  nonTextTags: ["script", "noscript", "iframe", "object", "embed", "form", "input", "button"],
};

/**
 * Sanitize une string HTML provenant d'un spec legacy.
 * Retourne une string HTML securisee (jamais null — un spec doit toujours
 * avoir du contenu, meme vide si tout a ete strip).
 */
export function sanitizeLegacySpecHtml(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  return sanitizeHtml(input, OPTIONS);
}
```

- [ ] **Step 2: Vérifier typecheck**

```bash
cd EriniumFactionWeb && pnpm tsc --noEmit 2>&1 | tail -20
```

Attendu : 0 erreur. Si `sanitize-html` types manquent → vérifier `package.json` (déjà présent avec `@types/sanitize-html`).

- [ ] **Step 3: Smoke test inline**

Créer un fichier temporaire `EriniumFactionWeb/_test_sanitize.mjs` (gitignored) :

```javascript
import { sanitizeLegacySpecHtml } from "./src/lib/work/roadmap/sanitize-spec.ts";

const sample = `
<style>.x { color: red; }</style>
<h1 class="title">Hello</h1>
<p>Some <strong>text</strong> and a <a href="https://example.com">link</a></p>
<script>alert("xss")</script>
<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>
<img src="javascript:alert(1)">
<table><tr><td>cell</td></tr></table>
`;

console.log(sanitizeLegacySpecHtml(sample));
```

Exécuter :
```bash
cd EriniumFactionWeb && npx tsx _test_sanitize.mjs
```

Attendu (extrait) :
- `<style>.x { color: red; }</style>` → préservé
- `<h1 class="title">Hello</h1>` → préservé
- `<script>alert("xss")</script>` → strip complètement
- `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"></path></svg>` → préservé
- `<img src="javascript:alert(1)">` → strip ou img sans src

Supprimer le fichier :
```bash
cd EriniumFactionWeb && rm _test_sanitize.mjs
```

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb && git add src/lib/work/roadmap/sanitize-spec.ts
git commit -m "feat(work/roadmap): sanitize-html wrapper pour specs legacy"
```

---

## Task 4: Route API GET /api/work/v1/roadmap

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
/**
 * GET /api/work/v1/roadmap
 *
 * Phase 6 — liste des projects de la roadmap + counts tasks + slug du 1er spec.
 *
 * Query params optionnels :
 *  - status   : 'todo' | 'wip' | 'test' | 'done' | 'blocked'
 *  - category : string (filtre exact sur work_roadmap_projects.category)
 *  - tag      : string (filtre : ce tag est dans le tableau tags[])
 *
 * Auth : `work.roadmap.view`.
 * Pas de pagination en Phase 1 — on a < 100 projects, la liste tient en 1 page.
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { listRoadmapProjects } from "@/lib/work/roadmap/queries";
import { RoadmapListQuerySchema } from "@/lib/work/roadmap/validators";

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request, "work.roadmap.view");

    const url = new URL(request.url);
    const raw = {
      status: url.searchParams.get("status") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
    };
    const parsed = RoadmapListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_input",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const projects = await listRoadmapProjects(parsed.data);
    return NextResponse.json({ projects });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Build pour vérifier**

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -20
```

Attendu : aucune erreur de compilation sur ce fichier.

- [ ] **Step 3: Test manuel via curl (en dev)**

```bash
cd EriniumFactionWeb && pnpm dev
# Dans un autre terminal :
curl -s http://localhost:3000/api/work/v1/roadmap
```

Attendu : `{"error":"unauthenticated","message":"Authentification requise"}` (401). Confirme que `requireStaff` fonctionne.

Avec un cookie session staff valide (récupérer via DevTools après login) :
```bash
curl -s -H "Cookie: session=<JWT>" http://localhost:3000/api/work/v1/roadmap
```

Attendu : `{"projects":[]}` (la DB est vide tant que l'import legacy n'a pas tourné).

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb && git add src/app/api/work/v1/roadmap/route.ts
git commit -m "feat(api): GET /api/work/v1/roadmap (liste projects read-only)"
```

---

## Task 5: Route API GET /api/work/v1/roadmap/projects/[id]

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
/**
 * GET /api/work/v1/roadmap/projects/:id
 *
 * Phase 6 — detail d'un project (titre, status, tags, category + tasks rangees
 * par order_idx + liste des slugs des specs lies).
 *
 * Auth : `work.roadmap.view`.
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { getRoadmapProjectById } from "@/lib/work/roadmap/queries";
import { ProjectIdSchema } from "@/lib/work/roadmap/validators";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.view");

    const { id: idStr } = await context.params;
    const parsed = ProjectIdSchema.safeParse(idStr);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const id = parsed.data;

    const detail = await getRoadmapProjectById(id);
    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Vérifier la signature `params` Next.js 16**

Le pattern Next.js 16 utilise `params: Promise<...>` (cf. `src/app/api/work/v1/cards/[id]/route.ts` pour référence). Si erreur TS sur le type → lire un autre fichier `[id]/route.ts` voisin et copier la signature exacte.

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -10
```

Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb && git add src/app/api/work/v1/roadmap/projects/
git commit -m "feat(api): GET /api/work/v1/roadmap/projects/:id"
```

---

## Task 6: Route API GET /api/work/v1/roadmap/specs/[slug]

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/[slug]/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
/**
 * GET /api/work/v1/roadmap/specs/:slug
 *
 * Phase 6 — detail d'un spec.
 *
 * Si kind='legacy', renvoie `rawHtml` deja SANITIZED (le sanitize tourne cote
 * server pour pas dependre du runtime client). Le client peut faire un
 * dangerouslySetInnerHTML direct.
 *
 * Si kind='structured', renvoie `answers` brut + `featureType`. Le rendu
 * HTML structured sera ajoute en Phase 2 (html-builder porte).
 *
 * Auth : `work.roadmap.view`.
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { getSpecBySlug } from "@/lib/work/roadmap/queries";
import { SpecSlugSchema } from "@/lib/work/roadmap/validators";
import { sanitizeLegacySpecHtml } from "@/lib/work/roadmap/sanitize-spec";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.view");

    const { slug: rawSlug } = await context.params;
    const parsed = SpecSlugSchema.safeParse(rawSlug);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }

    const spec = await getSpecBySlug(parsed.data);
    if (!spec) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Pour kind='legacy', on sanitize cote serveur avant de renvoyer le HTML.
    // Cela rend la reponse safe a injecter via dangerouslySetInnerHTML cote
    // client sans avoir besoin de re-sanitize.
    const payload = {
      ...spec,
      rawHtml:
        spec.kind === "legacy" && spec.rawHtml
          ? sanitizeLegacySpecHtml(spec.rawHtml)
          : null,
    };

    return NextResponse.json(payload);
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Build**

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -10
```

Attendu : 0 erreur.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb && git add src/app/api/work/v1/roadmap/specs/
git commit -m "feat(api): GET /api/work/v1/roadmap/specs/:slug (sanitize legacy HTML server-side)"
```

---

## Task 7: Script d'import legacy

**Files:**
- Create: `EriniumFactionWeb/scripts/import-legacy-roadmap.ts`
- Modify: `EriniumFactionWeb/package.json` (ajouter script `import-legacy-roadmap`)

Le script parse :
- `D:/Mods Minecraft/EriniumFaction/docs/roadmap.html` → INSERT en `work_roadmap_projects` + `work_roadmap_tasks`
- `D:/Mods Minecraft/EriniumFaction/docs/specs/*.html` → INSERT en `work_roadmap_specs` avec `kind='legacy'`
- Lie les specs aux projects via `data-erisclave-slug` ou le `href` du `.spec-link`

Le script est **idempotent** (TRUNCATE puis re-INSERT) car la table de prod sera vide initialement.

- [ ] **Step 1: Créer le script**

```typescript
/**
 * scripts/import-legacy-roadmap.ts
 *
 * Importe le contenu statique du submodule `docs/` (roadmap.html + specs/*.html)
 * dans les tables work_roadmap_*.
 *
 * Usage :
 *   DATABASE_URL=postgres://... pnpm tsx scripts/import-legacy-roadmap.ts
 *
 * Comportement :
 *  1. TRUNCATE les 3 tables (CASCADE pour tasks et spec_assets)
 *  2. Lit docs/roadmap.html, parse les .cat-card via cheerio
 *  3. Pour chaque card :
 *     - INSERT work_roadmap_projects (title, status, tags, category, order_idx)
 *     - INSERT work_roadmap_tasks pour chaque .task-item
 *     - Recupere le data-erisclave-slug (ou parse le .spec-link href)
 *  4. Lit docs/specs/*.html (sauf index.html)
 *  5. Pour chaque fichier :
 *     - INSERT work_roadmap_specs (slug, title, kind='legacy', raw_html)
 *     - Si un project a un firstSlug qui matche, on lie project_id
 *  6. Affiche un rapport final
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as cheerio from "cheerio";

// Chemins absolus (le script est lance depuis EriniumFactionWeb/)
const DOCS_ROOT = path.resolve(process.cwd(), "..", "docs");
const ROADMAP_HTML = path.join(DOCS_ROOT, "roadmap.html");
const SPECS_DIR = path.join(DOCS_ROOT, "specs");

// Map des classes status (cf. core/roadmap-sync/index.js de l'app Erisclave).
const STATUS_FROM_CARDCLASS: Record<string, string> = {
  "cat-card-planned": "todo",
  "cat-card-wip": "wip",
  "cat-card-test": "test",
  "cat-card-done": "done",
  "cat-card-todo": "todo", // 'blocked' utilise cat-card-todo dans l'app — on retombe sur 'todo'
};

function getStatusFromCard($card: cheerio.Cheerio<cheerio.Element>): string {
  const cls = ($card.attr("class") ?? "").split(/\s+/);
  for (const c of cls) {
    if (STATUS_FROM_CARDCLASS[c]) return STATUS_FROM_CARDCLASS[c];
  }
  return "wip"; // defaut
}

function extractTagsFromScript(roadmapHtml: string, projectTitle: string): string[] {
  // L'app Erisclave injecte des tags via un bloc `var CARD_TAGS = [ { match: 'Title', tags: [...] }, ... ]`.
  // On regex pour extraire l'entree qui matche le titre.
  const escaped = projectTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\{\\s*match:\\s*['"]${escaped}['"]\\s*,\\s*tags:\\s*(\\[[^\\]]*\\])\\s*\\}`,
    "m",
  );
  const m = roadmapHtml.match(re);
  if (!m) return [];
  try {
    // m[1] est par ex `["rpg","combat"]`. JSON.parse est safe (JS array literal valide JSON).
    return JSON.parse(m[1].replace(/'/g, '"')) as string[];
  } catch {
    return [];
  }
}

function extractCategory($card: cheerio.Cheerio<cheerio.Element>, _ch: cheerio.CheerioAPI): string | null {
  // Heuristique : si la card est dans une section avec un titre, on prend ce titre.
  // L'app Erisclave n'a pas vraiment de categorie cote HTML — c'est juste un champ
  // libre. On laisse null si rien d'evident.
  const sectionTitle = $card.closest("section").find("h2").first().text().trim();
  return sectionTitle.length > 0 ? sectionTitle : null;
}

function extractSpecSlugFromCard(
  $card: cheerio.Cheerio<cheerio.Element>,
): string | null {
  // Priorite 1 : attribut data-erisclave-slug
  const dataSlug = $card.attr("data-erisclave-slug");
  if (dataSlug && dataSlug.trim().length > 0) return dataSlug.trim();

  // Priorite 2 : href du .spec-link → specs/<slug>.html
  const href = $card.find(".spec-link").first().attr("href");
  if (href) {
    const m = href.match(/specs\/([^/]+)\.html$/);
    if (m) return m[1];
  }
  return null;
}

function extractSpecTitle(html: string, slug: string): string {
  const $ = cheerio.load(html);
  const t = $("title").first().text().trim();
  if (t) return t.replace(/\s*[—|–-]\s*EriniumFaction.*$/, "").trim();
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;
  return slug.replace(/-/g, " ");
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error("FATAL: DATABASE_URL n'est pas defini");
    process.exit(1);
  }
  const sql = neon(dbUrl);

  console.log("[import] Reading", ROADMAP_HTML);
  const roadmapHtml = readFileSync(ROADMAP_HTML, "utf8");
  const $ = cheerio.load(roadmapHtml);

  console.log("[import] Truncate tables");
  await sql.query("TRUNCATE TABLE work_roadmap_spec_assets, work_roadmap_specs, work_roadmap_tasks, work_roadmap_projects RESTART IDENTITY CASCADE");

  // ─── 1. Importer les projects + tasks ─────────────────────────
  const projectsBySlug = new Map<string, number>(); // slug → project_id
  const projectsByTitle = new Map<string, number>(); // title → project_id (fallback)

  const cards = $(".cat-card").toArray();
  console.log(`[import] Found ${cards.length} cards in roadmap.html`);

  let orderIdx = 0;
  for (const cardEl of cards) {
    const $card = $(cardEl);
    const title = $card.find(".card-title").first().text().trim();
    if (!title) continue;

    const status = getStatusFromCard($card);
    const tags = extractTagsFromScript(roadmapHtml, title);
    const category = extractCategory($card, $);

    const insertProject = (await sql.query(
      `INSERT INTO work_roadmap_projects (title, status, tags, category, order_idx)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, status, tags, category, orderIdx++],
    )) as { rows: Array<{ id: number }> } | Array<{ id: number }>;
    const rows = Array.isArray(insertProject) ? insertProject : insertProject.rows;
    const projectId = rows[0].id;

    projectsByTitle.set(title, projectId);

    const slug = extractSpecSlugFromCard($card);
    if (slug) projectsBySlug.set(slug, projectId);

    // Tasks
    const taskEls = $card.find(".task-item").toArray();
    let taskOrder = 0;
    for (const tEl of taskEls) {
      const $t = $(tEl);
      const taskTitle = $t.find(".task-name").first().text().trim();
      if (!taskTitle) continue;
      const taskStatus =
        $t.find(".task-check").hasClass("checked") || $t.find(".task-name").hasClass("done")
          ? "done"
          : "todo";
      await sql.query(
        `INSERT INTO work_roadmap_tasks (project_id, title, status, order_idx)
         VALUES ($1, $2, $3, $4)`,
        [projectId, taskTitle, taskStatus, taskOrder++],
      );
    }
  }
  console.log(`[import] ${projectsByTitle.size} projects + tasks importes`);

  // ─── 2. Importer les specs legacy ─────────────────────────────
  const specFiles = readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith(".html") && f !== "index.html");
  console.log(`[import] Found ${specFiles.length} spec files`);

  let specsImported = 0;
  let specsWithProject = 0;
  let warnings: string[] = [];

  for (const file of specFiles) {
    const slug = file.replace(/\.html$/, "").toLowerCase();
    const filePath = path.join(SPECS_DIR, file);
    const html = readFileSync(filePath, "utf8");
    const title = extractSpecTitle(html, slug);

    const projectId = projectsBySlug.get(slug) ?? null;
    if (projectId) specsWithProject++;

    try {
      await sql.query(
        `INSERT INTO work_roadmap_specs (project_id, slug, title, kind, raw_html)
         VALUES ($1, $2, $3, 'legacy', $4)`,
        [projectId, slug, title, html],
      );
      specsImported++;
    } catch (err) {
      warnings.push(`spec ${slug}: ${(err as Error).message}`);
    }
  }

  // ─── 3. Rapport final ────────────────────────────────────────
  console.log("");
  console.log("=== Rapport d'import ===");
  console.log(`Projects   : ${projectsByTitle.size}`);
  console.log(`Specs      : ${specsImported}/${specFiles.length}`);
  console.log(`  - lies a un project : ${specsWithProject}`);
  console.log(`  - orphelins         : ${specsImported - specsWithProject}`);
  if (warnings.length > 0) {
    console.log("");
    console.log(`Warnings (${warnings.length}) :`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Vérifier que `tsx` est installé**

```bash
cd EriniumFactionWeb && pnpm list tsx 2>/dev/null | grep tsx
```

Si pas installé :
```bash
cd EriniumFactionWeb && pnpm add -D tsx
```

- [ ] **Step 3: Ajouter le script dans `package.json`**

Dans la section `"scripts"` de `package.json`, ajouter une ligne juste après `"lint"` :

```json
    "lint": "eslint",
    "import-legacy-roadmap": "tsx scripts/import-legacy-roadmap.ts",
    "dump-roadmap": "tsx scripts/dump-roadmap.ts"
```

(la ligne `dump-roadmap` sera utilisée en Task 11 — on l'ajoute déjà pour éviter un commit séparé)

- [ ] **Step 4: Test à blanc sur DB de dev locale**

Configurer `DATABASE_URL` pour pointer sur la DB de dev. Ne PAS lancer sur la prod tant que les vérifications visuelles (Task 9/10) n'ont pas confirmé que tout marche.

```bash
cd EriniumFactionWeb
# Charger les vars d'env locales (.env.local doit contenir DATABASE_URL de dev)
pnpm import-legacy-roadmap
```

Attendu (extrait) :
```
[import] Reading D:\Mods Minecraft\EriniumFaction\docs\roadmap.html
[import] Truncate tables
[import] Found N cards in roadmap.html
[import] M projects + tasks importes
[import] Found 55 spec files
=== Rapport d'import ===
Projects   : N
Specs      : 55/55
  - lies a un project : X
  - orphelins         : Y
```

Si erreur "TRUNCATE failed" → confirmer que la table existe (Task 1 a tourné).
Si erreur "could not parse status" → vérifier le mapping `STATUS_FROM_CARDCLASS`.

- [ ] **Step 5: Vérifier le contenu via SQL**

Ouvrir le Neon SQL editor (ou `psql`) et exécuter :

```sql
SELECT id, title, status, array_length(tags, 1) AS n_tags FROM work_roadmap_projects ORDER BY id LIMIT 10;
SELECT COUNT(*) FROM work_roadmap_tasks;
SELECT COUNT(*) FROM work_roadmap_specs WHERE kind = 'legacy';
SELECT slug, title FROM work_roadmap_specs WHERE project_id IS NULL ORDER BY slug LIMIT 20;
```

Attendu :
- Projects : N lignes, status varié
- Tasks : > 0
- Specs : 55
- Orphelins : la liste des specs qui n'ont pas de project parent (à inspecter manuellement)

- [ ] **Step 6: Commit**

```bash
cd EriniumFactionWeb && git add scripts/import-legacy-roadmap.ts package.json
git commit -m "feat(work/roadmap): script d'import legacy (roadmap.html + specs/*.html)"
```

---

## Task 8: Theme Erisclave dans globals.css

**Files:**
- Modify: `EriniumFactionWeb/src/app/globals.css`

Ajouter les 9 tokens crème dans le `@theme inline` existant. Ces tokens seront utilisables en Tailwind comme `bg-erisclave-cream`, `text-erisclave-ink`, etc.

- [ ] **Step 1: Lire le début actuel de `globals.css`**

```bash
cd EriniumFactionWeb && head -25 src/app/globals.css
```

Pour repérer le bloc `@theme inline { ... }` (qui contient les `--color-bg-deep`, `--color-primary`, etc.).

- [ ] **Step 2: Ajouter les tokens à la fin du bloc `@theme inline`**

Utiliser `Edit` avec `old_string` matchant la dernière ligne avant le `}` de fermeture du `@theme inline` (probablement `--animate-twinkle: twinkle 4s ease-in-out infinite;`) :

`old_string` :
```css
  --animate-twinkle: twinkle 4s ease-in-out infinite;
}
```

`new_string` :
```css
  --animate-twinkle: twinkle 4s ease-in-out infinite;

  /* ─── Erisclave / Roadmap theme (Phase 6 migration) ─────────── */
  /* Palette creme / Liquid Glass clair. Utilisable via bg-erisclave-cream, */
  /* text-erisclave-ink, border-erisclave-pink, etc. */
  --color-erisclave-cream: #f8f4f1;
  --color-erisclave-cream-warm: #f1ebe5;
  --color-erisclave-cream-deep: #e8e0d8;
  --color-erisclave-ink: #2a2530;
  --color-erisclave-ink-soft: #4a4250;
  --color-erisclave-pink: #a371a6;
  --color-erisclave-pink-deep: #7d4f86;
  --color-erisclave-gold: #d4a574;
  --color-erisclave-green-ok: #6ab187;
  --color-erisclave-red-ko: #d97070;
}
```

- [ ] **Step 3: Vérifier que Tailwind compile**

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -20
```

Attendu : 0 erreur (Tailwind v4 va générer les classes `bg-erisclave-*` automatiquement depuis les tokens).

- [ ] **Step 4: Smoke test inline**

Dans une page existante (par ex `src/app/(admin)/admin/work/page.tsx`), ajouter temporairement :
```tsx
<div className="bg-erisclave-cream text-erisclave-ink p-4 rounded">Test crème</div>
```

Ouvrir `pnpm dev` → `/admin/work` → vérifier visuellement que le bloc est crème avec texte sombre. Retirer le test.

- [ ] **Step 5: Commit**

```bash
cd EriniumFactionWeb && git add src/app/globals.css
git commit -m "feat(theme): tokens Erisclave creme dans globals.css"
```

---

## Task 9: Composants Roadmap (RoadmapCard + Filters + SpecRenderer)

**Files:**
- Create: `EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx`
- Create: `EriniumFactionWeb/src/components/work/roadmap/RoadmapFilters.tsx`
- Create: `EriniumFactionWeb/src/components/work/roadmap/SpecLegacyRenderer.tsx`
- Create: `EriniumFactionWeb/src/components/work/roadmap/StatusBadge.tsx`

- [ ] **Step 1: Créer `StatusBadge.tsx`**

```tsx
"use client";

import type { ProjectStatus } from "@/lib/work/roadmap/types";

const STATUS_META: Record<
  ProjectStatus,
  { label: string; bg: string; text: string }
> = {
  todo:    { label: "Planifie", bg: "bg-erisclave-cream-deep", text: "text-erisclave-ink-soft" },
  wip:     { label: "En cours", bg: "bg-erisclave-pink/20",    text: "text-erisclave-pink-deep" },
  test:    { label: "En test",  bg: "bg-erisclave-gold/30",    text: "text-erisclave-ink" },
  done:    { label: "Termine",  bg: "bg-erisclave-green-ok/25",text: "text-erisclave-green-ok" },
  blocked: { label: "Bloque",   bg: "bg-erisclave-red-ko/25",  text: "text-erisclave-red-ko" },
};

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${m.bg} ${m.text}`}
    >
      {m.label}
    </span>
  );
}
```

- [ ] **Step 2: Créer `RoadmapCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import type { RoadmapProjectListItem } from "@/lib/work/roadmap/types";
import StatusBadge from "./StatusBadge";

interface Props {
  project: RoadmapProjectListItem;
}

/**
 * Carte d'un project sur la grille Roadmap. Theme creme/Liquid Glass clair.
 * Mobile : pleine largeur, taps target >= 44px. Desktop : 3 colonnes via parent.
 */
export default function RoadmapCard({ project }: Props) {
  const pct =
    project.tasksTotal > 0
      ? Math.round((project.tasksDone / project.tasksTotal) * 100)
      : 0;

  const inner = (
    <article
      className="
        group relative
        bg-erisclave-cream/95 backdrop-blur
        border border-erisclave-cream-deep
        rounded-2xl p-5 shadow-sm
        hover:shadow-md hover:border-erisclave-pink/40
        transition-all duration-200
        min-h-[180px] flex flex-col gap-3
      "
    >
      {/* Header : titre + statut */}
      <header className="flex items-start gap-3 justify-between">
        <h3 className="text-base font-bold text-erisclave-ink leading-tight">
          {project.title}
        </h3>
        <StatusBadge status={project.status} />
      </header>

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-medium uppercase tracking-wide
                         text-erisclave-pink-deep bg-erisclave-pink/10
                         px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Progression */}
      <div className="mt-auto">
        <div className="flex justify-between text-xs text-erisclave-ink-soft mb-1">
          <span>Progression</span>
          <span className="font-semibold">
            {project.tasksDone} / {project.tasksTotal} taches
          </span>
        </div>
        <div className="h-1.5 bg-erisclave-cream-deep rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-erisclave-pink to-erisclave-pink-deep
                       transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Lien spec */}
      {project.firstSpecSlug && (
        <span className="text-xs text-erisclave-pink-deep group-hover:underline">
          Voir le cahier des charges →
        </span>
      )}
    </article>
  );

  // Si le project a un spec lie, la card entiere est cliquable. Sinon
  // pas de lien (P2 ajoutera un lien vers /admin/work/erisclave?project=:id).
  if (project.firstSpecSlug) {
    return (
      <Link
        href={`/admin/work/specs/${encodeURIComponent(project.firstSpecSlug)}`}
        className="block focus:outline-none focus:ring-2 focus:ring-erisclave-pink rounded-2xl"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
```

- [ ] **Step 3: Créer `RoadmapFilters.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ProjectStatus } from "@/lib/work/roadmap/types";

interface Props {
  status: ProjectStatus | "";
  setStatus: (s: ProjectStatus | "") => void;
  tag: string;
  setTag: (t: string) => void;
  category: string;
  setCategory: (c: string) => void;
  allTags: string[];
  allCategories: string[];
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus | ""; label: string }> = [
  { value: "", label: "Tous statuts" },
  { value: "todo", label: "Planifie" },
  { value: "wip", label: "En cours" },
  { value: "test", label: "En test" },
  { value: "done", label: "Termine" },
  { value: "blocked", label: "Bloque" },
];

/**
 * Filtres status + tag + category. Mobile : drawer (toggle hamburger).
 * Desktop : inline.
 */
export default function RoadmapFilters({
  status,
  setStatus,
  tag,
  setTag,
  category,
  setCategory,
  allTags,
  allCategories,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasActive = status !== "" || tag !== "" || category !== "";

  const filtersBody = (
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as ProjectStatus | "")}
        className="bg-erisclave-cream-warm text-erisclave-ink border border-erisclave-cream-deep
                   rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-erisclave-pink
                   min-h-[44px] sm:min-h-0"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="bg-erisclave-cream-warm text-erisclave-ink border border-erisclave-cream-deep
                   rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-erisclave-pink
                   min-h-[44px] sm:min-h-0"
      >
        <option value="">Toutes categories</option>
        {allCategories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        className="bg-erisclave-cream-warm text-erisclave-ink border border-erisclave-cream-deep
                   rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-erisclave-pink
                   min-h-[44px] sm:min-h-0"
      >
        <option value="">Tous tags</option>
        {allTags.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {hasActive && (
        <button
          type="button"
          onClick={() => {
            setStatus("");
            setTag("");
            setCategory("");
          }}
          className="text-xs text-erisclave-pink-deep hover:underline self-start sm:self-auto"
        >
          Reset
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full bg-erisclave-cream-warm text-erisclave-ink
                     border border-erisclave-cream-deep rounded-lg px-3 py-2
                     text-sm font-medium min-h-[44px]"
          aria-expanded={open}
        >
          {open ? "Masquer les filtres" : "Filtres"} {hasActive ? "•" : ""}
        </button>
        {open && <div className="mt-3">{filtersBody}</div>}
      </div>

      {/* Desktop inline */}
      <div className="hidden sm:block">{filtersBody}</div>
    </>
  );
}
```

- [ ] **Step 4: Créer `SpecLegacyRenderer.tsx`**

```tsx
"use client";

/**
 * Renderer pour les specs `kind='legacy'`.
 *
 * Le HTML arrive deja SANITIZED depuis la route /api/work/v1/roadmap/specs/:slug
 * (sanitize cote serveur via sanitize-spec.ts).
 *
 * On l'injecte via dangerouslySetInnerHTML. Wrapper avec `prose`-like styling
 * (typographie sobre, contraintes de width). Le HTML legacy contient son
 * propre <style> qui prend le dessus pour le visuel.
 */
interface Props {
  rawHtml: string;
  title: string;
}

export default function SpecLegacyRenderer({ rawHtml, title }: Props) {
  return (
    <div className="bg-erisclave-cream rounded-2xl p-4 sm:p-8">
      <header className="mb-6 pb-4 border-b border-erisclave-cream-deep">
        <h1 className="text-xl sm:text-2xl font-bold text-erisclave-ink">{title}</h1>
        <p className="text-xs text-erisclave-ink-soft mt-1">
          Spec legacy importe — pour l&apos;editer, utiliser la conversion vers structured
          (disponible en Phase 2).
        </p>
      </header>
      <div
        className="erisclave-legacy-spec text-erisclave-ink"
        dangerouslySetInnerHTML={{ __html: rawHtml }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Build**

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -20
```

Attendu : 0 erreur. Les classes Tailwind `bg-erisclave-*` doivent compiler.

- [ ] **Step 6: Commit**

```bash
cd EriniumFactionWeb && git add src/components/work/roadmap/
git commit -m "feat(work/roadmap): composants UI (Card, Filters, SpecRenderer, StatusBadge)"
```

---

## Task 10: Hook React Query useRoadmap

**Files:**
- Create: `EriniumFactionWeb/src/hooks/work/useRoadmap.ts`

- [ ] **Step 1: Lire un hook existant pour matcher le style**

```bash
cd EriniumFactionWeb && head -60 src/hooks/work/useEvents.ts
```

Pour s'aligner sur le pattern React Query du repo (`useQuery({ queryKey, queryFn })`, `enabled`, etc.).

- [ ] **Step 2: Créer le hook**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  RoadmapProjectListItem,
  RoadmapProject,
  RoadmapTask,
  RoadmapSpec,
} from "@/lib/work/roadmap/types";

interface RoadmapFilters {
  status?: string;
  tag?: string;
  category?: string;
}

function buildQs(f: RoadmapFilters): string {
  const sp = new URLSearchParams();
  if (f.status) sp.set("status", f.status);
  if (f.tag) sp.set("tag", f.tag);
  if (f.category) sp.set("category", f.category);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function fetchRoadmap(
  filters: RoadmapFilters,
): Promise<RoadmapProjectListItem[]> {
  const res = await fetch(`/api/work/v1/roadmap${buildQs(filters)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { projects: RoadmapProjectListItem[] };
  return data.projects;
}

/**
 * Hook pour la liste des projects roadmap avec filtres.
 * `initialData` : SSR fournit les projects au premier render pour eviter l'ecran blanc.
 */
export function useRoadmap(
  filters: RoadmapFilters,
  initialData?: RoadmapProjectListItem[],
) {
  return useQuery({
    queryKey: ["roadmap", filters],
    queryFn: () => fetchRoadmap(filters),
    initialData,
    staleTime: 30_000,
  });
}

interface SpecDetailResponse extends RoadmapSpec {
  // rawHtml est sanitize cote serveur
  rawHtml: string | null;
}

export function useRoadmapSpec(slug: string | null) {
  return useQuery({
    queryKey: ["roadmap-spec", slug],
    queryFn: async (): Promise<SpecDetailResponse> => {
      const res = await fetch(`/api/work/v1/roadmap/specs/${encodeURIComponent(slug!)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

interface ProjectDetailResponse {
  project: RoadmapProject;
  tasks: RoadmapTask[];
  specSlugs: string[];
}

export function useRoadmapProject(id: number | null) {
  return useQuery({
    queryKey: ["roadmap-project", id],
    queryFn: async (): Promise<ProjectDetailResponse> => {
      const res = await fetch(`/api/work/v1/roadmap/projects/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: id != null,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Build**

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -10
```

Attendu : 0 erreur.

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb && git add src/hooks/work/useRoadmap.ts
git commit -m "feat(work/roadmap): hook React Query useRoadmap"
```

---

## Task 11: Page /admin/work/roadmap

**Files:**
- Create: `EriniumFactionWeb/src/app/(admin)/admin/work/roadmap/page.tsx`
- Modify: `EriniumFactionWeb/src/components/work/layout/icons.tsx` (ajout d'un IconRoadmap)
- Modify: `EriniumFactionWeb/src/components/work/layout/links.tsx` (ajout du lien sidebar)

- [ ] **Step 1: Ajouter l'icône `IconRoadmap`**

Lire `src/components/work/layout/icons.tsx` :
```bash
cd EriniumFactionWeb && head -30 src/components/work/layout/icons.tsx
```

Repérer une icône existante simple (ex : `IconCalendar`) et insérer une `IconRoadmap` dans le même style (SVG path stroke 1.5). Ajouter à la fin du fichier, juste avant l'export ou comme export individuel :

```tsx
export function IconRoadmap(props: SVGProps) {
  return (
    <svg {...defaultProps(props)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h6" />
      <path d="M3 12h12" />
      <path d="M3 17h18" />
      <circle cx="10" cy="7" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
      <circle cx="22" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}
```

(adapter le path/style selon les conventions du fichier — si les icônes existantes utilisent `defaultProps`, on garde ce helper)

- [ ] **Step 2: Ajouter le lien sidebar**

Dans `src/components/work/layout/links.tsx`, ajouter dans l'array `SIDEBAR_LINKS` juste avant l'entrée `integrations` :

```tsx
import {
  // ... existants ...
  IconRoadmap,
} from "./icons";

// ...

  {
    href: "/admin/work/calendar",
    label: "Calendrier",
    perm: "events.read",
    icon: <IconCalendar />,
  },
  // ─── INSERT ICI ───
  {
    href: "/admin/work/roadmap",
    label: "Roadmap",
    perm: "work.roadmap.view",
    icon: <IconRoadmap />,
  },
  // ─── FIN INSERT ───
  {
    href: "/admin/work/integrations",
    label: "Integrations",
    perm: null,
    icon: <IconLink />,
  },
```

- [ ] **Step 3: Créer la page roadmap**

`src/app/(admin)/admin/work/roadmap/page.tsx` :

```tsx
"use client";

import { useState, useMemo } from "react";
import { useRoadmap } from "@/hooks/work/useRoadmap";
import { useWorkPage } from "@/hooks/work/useWorkPage";
import { useWorkPerms } from "@/hooks/work/useWorkPerms";
import RoadmapCard from "@/components/work/roadmap/RoadmapCard";
import RoadmapFilters from "@/components/work/roadmap/RoadmapFilters";
import type { ProjectStatus } from "@/lib/work/roadmap/types";

export default function RoadmapPage() {
  useWorkPage({ title: "Roadmap", breadcrumbs: [{ label: "Roadmap" }] });
  const { hasPerm } = useWorkPerms();

  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [tag, setTag] = useState("");
  const [category, setCategory] = useState("");

  // On fetch sans filtre cote serveur (la liste tient en RAM) et on filtre cote
  // client. Permet d'afficher allTags / allCategories construit a partir des
  // donnees recues. En P2, si la liste depasse 200 projects, on passera aux
  // filtres serveur.
  const { data: projects = [], isLoading, error } = useRoadmap({});

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) for (const t of p.tags) set.add(t);
    return Array.from(set).sort();
  }, [projects]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (status && p.status !== status) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (category && p.category !== category) return false;
      return true;
    });
  }, [projects, status, tag, category]);

  if (!hasPerm("work.roadmap.view")) {
    return (
      <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink text-center">
        Vous n&apos;avez pas la permission <code>work.roadmap.view</code>.
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header explicatif */}
      <header className="bg-erisclave-cream-warm rounded-2xl p-5 border border-erisclave-cream-deep">
        <h2 className="text-lg font-bold text-erisclave-ink">
          Roadmap publique du serveur
        </h2>
        <p className="text-sm text-erisclave-ink-soft mt-1">
          {projects.length} project{projects.length > 1 ? "s" : ""} en cours,
          en test ou planifie{projects.length > 1 ? "s" : ""}.
        </p>
      </header>

      {/* Filtres */}
      <div className="bg-erisclave-cream rounded-xl p-4 border border-erisclave-cream-deep">
        <RoadmapFilters
          status={status}
          setStatus={setStatus}
          tag={tag}
          setTag={setTag}
          category={category}
          setCategory={setCategory}
          allTags={allTags}
          allCategories={allCategories}
        />
      </div>

      {/* Grille */}
      {error && (
        <div className="bg-erisclave-red-ko/10 text-erisclave-red-ko p-4 rounded">
          Erreur de chargement : {(error as Error).message}
        </div>
      )}
      {isLoading ? (
        <div className="text-erisclave-ink-soft text-sm">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-erisclave-cream rounded-2xl p-8 text-center text-erisclave-ink-soft">
          Aucun project ne correspond aux filtres.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <RoadmapCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build**

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -20
```

Attendu : 0 erreur. La route `/admin/work/roadmap` apparaît dans la liste des routes générées.

- [ ] **Step 5: Test visuel en dev**

```bash
cd EriniumFactionWeb && pnpm dev
```

Ouvrir `http://localhost:3000/admin/work/roadmap` (après login staff). Attendu :
- Le lien "Roadmap" apparaît dans la sidebar (si le user a la perm `work.roadmap.view`)
- La page affiche les N projects importés en Task 7
- Les filtres status / tag / category fonctionnent
- Cliquer sur un card avec spec lié → navigue vers `/admin/work/specs/<slug>` (404 pour l'instant, c'est Task 12)
- Le theme est crème (pas dark)

Tester aussi en responsive (DevTools → iPhone SE 375×667) :
- La grille passe à 1 colonne
- Les filtres sont dans un drawer
- Les cards restent lisibles

- [ ] **Step 6: Commit**

```bash
cd EriniumFactionWeb && git add src/app/\(admin\)/admin/work/roadmap/page.tsx src/components/work/layout/links.tsx src/components/work/layout/icons.tsx
git commit -m "feat(work/roadmap): page /admin/work/roadmap + lien sidebar"
```

---

## Task 12: Page /admin/work/specs/[slug]

**Files:**
- Create: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/page.tsx`

- [ ] **Step 1: Créer la page**

```tsx
"use client";

import { use } from "react";
import Link from "next/link";
import { useRoadmapSpec } from "@/hooks/work/useRoadmap";
import { useWorkPage } from "@/hooks/work/useWorkPage";
import { useWorkPerms } from "@/hooks/work/useWorkPerms";
import SpecLegacyRenderer from "@/components/work/roadmap/SpecLegacyRenderer";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function SpecViewerPage({ params }: PageProps) {
  // Next.js 16 : params est un Promise — utiliser React.use() pour l'unwrap
  // dans un client component.
  const { slug } = use(params);

  const { hasPerm } = useWorkPerms();
  const { data: spec, isLoading, error } = useRoadmapSpec(slug);

  useWorkPage({
    title: spec?.title ?? "Spec",
    breadcrumbs: [
      { label: "Roadmap", href: "/admin/work/roadmap" },
      { label: spec?.title ?? slug },
    ],
  });

  if (!hasPerm("work.roadmap.view")) {
    return (
      <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink text-center">
        Vous n&apos;avez pas la permission <code>work.roadmap.view</code>.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink-soft text-sm">
        Chargement du spec…
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link
          href="/admin/work/roadmap"
          className="text-sm text-erisclave-pink-deep hover:underline"
        >
          ← Retour roadmap
        </Link>
        <div className="bg-erisclave-red-ko/10 text-erisclave-red-ko p-4 rounded-2xl">
          Spec introuvable : <code>{slug}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <Link
        href="/admin/work/roadmap"
        className="inline-flex text-sm text-erisclave-pink-deep hover:underline"
      >
        ← Retour roadmap
      </Link>

      {spec.kind === "legacy" && spec.rawHtml ? (
        <SpecLegacyRenderer rawHtml={spec.rawHtml} title={spec.title} />
      ) : spec.kind === "structured" ? (
        <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink">
          {/* Phase 2 : html-builder.renderSpec(spec.answers). Pour l'instant on */}
          {/* montre juste un message — aucun spec structured n'existe en P1. */}
          <p className="font-semibold mb-2">Spec structure</p>
          <p className="text-sm text-erisclave-ink-soft">
            Le rendu HTML des specs structures sera disponible en Phase 2 (Erisclave UI complete).
          </p>
        </div>
      ) : (
        <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink-soft">
          Contenu vide.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd EriniumFactionWeb && pnpm build 2>&1 | tail -10
```

Attendu : 0 erreur. La route `/admin/work/specs/[slug]` apparaît.

- [ ] **Step 3: Test visuel**

```bash
cd EriniumFactionWeb && pnpm dev
```

Depuis `/admin/work/roadmap`, cliquer sur un card avec spec lié. Attendu :
- La page `/admin/work/specs/<slug>` se charge
- Le HTML legacy est rendu avec son `<style>` inline (look proche du fichier original)
- Le titre du spec apparaît dans le header
- Le bouton "Retour roadmap" fonctionne

Tester sur mobile (375×667) : le HTML legacy doit rester lisible (les specs ont leurs styles inline mais on les wrap dans un `bg-erisclave-cream` qui contraint la couleur de fond).

- [ ] **Step 4: Test XSS**

Vérifier qu'un spec ne peut pas exécuter de JS. Dans le SQL editor Neon :

```sql
UPDATE work_roadmap_specs
SET raw_html = '<h1>Test</h1><script>document.body.style.background=''red''</script><a href="javascript:alert(1)">Bad link</a>'
WHERE slug = 'test-xss'
   OR (slug = (SELECT slug FROM work_roadmap_specs ORDER BY id ASC LIMIT 1));
```

(insère un spec test si `test-xss` n'existe pas, sinon écrase le 1er spec — bien-sûr restaurer après !)

Ouvrir `/admin/work/specs/<slug>` → attendu :
- Le `<script>` n'exécute PAS (le fond reste crème)
- Le `<a href="javascript:...">` est strip ou désactivé (le clic ne fait rien)

Restaurer ensuite via un re-run de `pnpm import-legacy-roadmap`.

- [ ] **Step 5: Commit**

```bash
cd EriniumFactionWeb && git add src/app/\(admin\)/admin/work/specs/
git commit -m "feat(work/roadmap): page /admin/work/specs/:slug (rendu legacy HTML sanitize)"
```

---

## Task 13: Script dump-roadmap pour Claude

**Files:**
- Create: `EriniumFactionWeb/scripts/dump-roadmap.ts`
- Modify: `EriniumFactionWeb/.gitignore` (ajouter `.cache/`)
- Modify: `EriniumFactionWeb/README.md` (documenter la commande)

Le script permet à Claude (ou un dev offline) de récupérer un snapshot HTML statique de la roadmap + des specs pour lecture locale.

- [ ] **Step 1: Créer le script**

```typescript
/**
 * scripts/dump-roadmap.ts
 *
 * Snapshot HTML offline de la roadmap + des specs pour Claude / dev local.
 *
 * Usage :
 *   ERISCLAVE_DUMP_TOKEN=<launcher-jwt> pnpm dump-roadmap
 *
 * Le token doit etre un launcher JWT valide (cf. lib/auth/jwt.ts) avec un
 * compte qui a `work.roadmap.view`. On peut le recuperer depuis l'app launcher
 * ou en se loggant via /api/auth puis copier le cookie `session`.
 *
 * Sortie :
 *   .cache/roadmap.json         (liste des projects au format API)
 *   .cache/specs/<slug>.html    (le rawHtml sanitize de chaque spec)
 *   .cache/specs.json           (manifest : { slug, title, projectId } pour chaque spec)
 *
 * Le dossier .cache/ est gitignore.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const TOKEN = process.env.ERISCLAVE_DUMP_TOKEN;
const BASE = process.env.ERISCLAVE_DUMP_BASE || "https://eriniumfaction.vercel.app";

if (!TOKEN) {
  console.error("FATAL: ERISCLAVE_DUMP_TOKEN n'est pas defini");
  console.error("Utiliser un launcher JWT valide ou un cookie session.");
  process.exit(1);
}

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const SPECS_DIR = path.join(CACHE_DIR, "specs");
mkdirSync(SPECS_DIR, { recursive: true });

async function jget(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
  return res.json();
}

interface ProjectListItem {
  id: number;
  title: string;
  firstSpecSlug: string | null;
}

interface SpecResponse {
  slug: string;
  title: string;
  kind: "legacy" | "structured";
  rawHtml: string | null;
  projectId: number | null;
}

async function main() {
  console.log(`[dump] Base URL: ${BASE}`);
  console.log(`[dump] Fetching /api/work/v1/roadmap …`);
  const roadmap = (await jget(`${BASE}/api/work/v1/roadmap`)) as {
    projects: ProjectListItem[];
  };
  writeFileSync(
    path.join(CACHE_DIR, "roadmap.json"),
    JSON.stringify(roadmap, null, 2),
    "utf8",
  );
  console.log(`[dump] ${roadmap.projects.length} projects ecrits dans .cache/roadmap.json`);

  // Recuperer tous les slugs uniques cites par les projects
  const slugs = new Set<string>();
  for (const p of roadmap.projects) {
    if (p.firstSpecSlug) slugs.add(p.firstSpecSlug);
  }
  // Pour la version dump complete, on pourrait aussi lister TOUS les specs
  // (pas juste les "first"). Phase 2 ajoutera un endpoint /roadmap/specs?list=1
  // si besoin. Pour l'instant on s'aligne sur les liens visibles dans la grille.

  console.log(`[dump] ${slugs.size} specs a fetcher`);
  const manifest: Array<{ slug: string; title: string; projectId: number | null }> = [];
  let idx = 0;
  for (const slug of slugs) {
    idx++;
    process.stdout.write(`  [${idx}/${slugs.size}] ${slug} … `);
    try {
      const spec = (await jget(
        `${BASE}/api/work/v1/roadmap/specs/${encodeURIComponent(slug)}`,
      )) as SpecResponse;
      if (spec.kind === "legacy" && spec.rawHtml) {
        writeFileSync(path.join(SPECS_DIR, `${slug}.html`), spec.rawHtml, "utf8");
      } else if (spec.kind === "structured") {
        writeFileSync(
          path.join(SPECS_DIR, `${slug}.json`),
          JSON.stringify(spec, null, 2),
          "utf8",
        );
      }
      manifest.push({ slug, title: spec.title, projectId: spec.projectId });
      process.stdout.write("ok\n");
    } catch (err) {
      process.stdout.write(`ERR: ${(err as Error).message}\n`);
    }
  }

  writeFileSync(
    path.join(CACHE_DIR, "specs.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log("");
  console.log(`[dump] Snapshot ecrit dans ${CACHE_DIR}/`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Vérifier `.gitignore`**

```bash
cd EriniumFactionWeb && grep -q "^\.cache" .gitignore || echo ".cache/" >> .gitignore
cd EriniumFactionWeb && cat .gitignore | tail -5
```

Attendu : `.cache/` présent.

- [ ] **Step 3: Ajouter une section dans le README**

Lire le README actuel :
```bash
cd EriniumFactionWeb && wc -l README.md && cat README.md
```

Ajouter une section à la fin :

```markdown

## Snapshot offline de la roadmap

Pour récupérer un snapshot local (utile pour Claude/dev offline) :

```bash
ERISCLAVE_DUMP_TOKEN=<launcher-jwt> pnpm dump-roadmap
```

Le snapshot est écrit dans `.cache/` (gitignored) :
- `.cache/roadmap.json` — liste des projects
- `.cache/specs/<slug>.html` — chaque spec legacy
- `.cache/specs.json` — manifest des specs
```

- [ ] **Step 4: Test du script (en dev)**

Lancer le serveur dev et tester :
```bash
cd EriniumFactionWeb && pnpm dev
# Dans un autre terminal, après login :
ERISCLAVE_DUMP_BASE=http://localhost:3000 ERISCLAVE_DUMP_TOKEN=<jwt> pnpm dump-roadmap
ls .cache/specs/ | head
```

Attendu : un dossier `.cache/specs/` contenant des `.html`, et un `.cache/roadmap.json`.

- [ ] **Step 5: Commit**

```bash
cd EriniumFactionWeb && git add scripts/dump-roadmap.ts .gitignore README.md
git commit -m "feat(scripts): dump-roadmap.ts (snapshot offline pour Claude)"
```

---

## Task 14: Update permissions.md + CLAUDE.md

**Files:**
- Modify: `D:/Mods Minecraft/EriniumFaction/docs/permissions.md`
- Modify: `D:/Mods Minecraft/EriniumFaction/CLAUDE.md`

- [ ] **Step 1: Ajouter les 3 perms dans `docs/permissions.md`**

Lire le fichier actuel :
```bash
cd "D:/Mods Minecraft/EriniumFaction" && wc -l docs/permissions.md
```

Ajouter une section (à la fin si pas de section "Work Panel", sinon dans la section existante) :

```markdown

## Roadmap (Phase 6 — Erisclave migration)

| Permission              | Donne accès à                                                       | Défaut       |
|-------------------------|---------------------------------------------------------------------|--------------|
| `work.roadmap.view`     | Lire la roadmap (`/admin/work/roadmap`) et voir les specs (`/admin/work/specs/<slug>`). | Tout staff |
| `work.roadmap.edit`     | Toggle tasks done, éditer status/tags, créer & éditer specs, éditer projects. (P2) | Lead staff |
| `work.roadmap.delete`   | Supprimer specs / projects / tasks. (P2)                            | Owners + Admins |

Ces perms sont seedées dans `migrations/phase6-roadmap.sql` pour les roles `admin` et `lead`. Owner Discord court-circuit en wildcard `*`.
```

- [ ] **Step 2: Mettre à jour `D:/Mods Minecraft/EriniumFaction/CLAUDE.md`**

Lire la section roadmap actuelle :
```bash
cd "D:/Mods Minecraft/EriniumFaction" && grep -n "roadmap" CLAUDE.md
```

Localiser le bloc "Roadmap & Cahiers des charges". Le remplacer :

`old_string` (approximatif — adapter au contenu réel) :
```markdown
## Roadmap & Cahiers des charges

| Fichier | Rôle |
|---------|------|
| `docs/roadmap.html` | Roadmap globale du projet (catégories, progression, tâches) |
| `docs/specs/` | Dossier contenant les cahiers des charges détaillés (un `.html` par feature) |

**RÈGLE** : Avant de commencer la conception d'une feature, TOUJOURS :
1. **Consulter `docs/roadmap.html`** — vérifier si la feature y existe déjà (catégorie + tâches)
2. **Chercher un cahier des charges** dans `docs/specs/` correspondant à cette feature
```

`new_string` :
```markdown
## Roadmap & Cahiers des charges

**SOURCE DE VÉRITÉ** : DB Neon Postgres (tables `work_roadmap_*`) exposée via le Work Panel staff :
- Roadmap : https://eriniumfaction.vercel.app/admin/work/roadmap
- Specs   : https://eriniumfaction.vercel.app/admin/work/specs/<slug>

Pour Claude / lecture offline : `cd EriniumFactionWeb && ERISCLAVE_DUMP_TOKEN=<jwt> pnpm dump-roadmap` → snapshot écrit dans `.cache/roadmap.json` + `.cache/specs/<slug>.html`.

L'app Electron Erisclave (`docs/applications/erisclave/`) et les fichiers statiques (`docs/roadmap.html` + `docs/specs/`) sont SUPPRIMÉS depuis la Phase 6 d'Erisclave migration (2026-05-25). L'historique est conservé sur la branche `archive/pre-erisclave-migration-2026-05-25` du submodule docs.

**RÈGLE** : Avant de commencer la conception d'une feature, TOUJOURS :
1. **Consulter la roadmap** via l'URL ci-dessus (ou `pnpm dump-roadmap` si offline)
2. **Chercher un spec** correspondant via `/admin/work/specs/<slug>` (ou `.cache/specs/<slug>.html`)
```

- [ ] **Step 3: Commit local + commit submodule**

```bash
# Commit dans le submodule docs/
cd "D:/Mods Minecraft/EriniumFaction/docs" && git add permissions.md
git commit -m "docs: ajout des 3 perms Roadmap (work.roadmap.view/edit/delete)"
git push origin HEAD

# Commit dans le repo parent (pointer du submodule + CLAUDE.md root)
cd "D:/Mods Minecraft/EriniumFaction" && git add CLAUDE.md docs
git commit -m "docs: update roadmap references vers URLs (Erisclave migration P6)"
git push origin HEAD
```

---

## Task 15: Run import sur la prod + smoke tests

**Files:** (aucune création)

- [ ] **Step 1: Exécuter la migration SQL sur prod Neon**

Ouvrir la console Neon (https://console.neon.tech), sélectionner le projet de prod, ouvrir le SQL editor, copier-coller le contenu de `EriniumFactionWeb/migrations/phase6-roadmap.sql`, et exécuter.

Vérifier que les 4 tables apparaissent :

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'work_roadmap_%' ORDER BY table_name;
```

Attendu : 4 lignes (`work_roadmap_projects`, `work_roadmap_spec_assets`, `work_roadmap_specs`, `work_roadmap_tasks`).

- [ ] **Step 2: Push code sur le repo principal**

```bash
cd EriniumFactionWeb && git push origin HEAD
```

Attendre que Vercel déploie. Vérifier sur le dashboard Vercel que le build passe.

- [ ] **Step 3: Lancer l'import contre la prod**

```bash
cd EriniumFactionWeb
# DATABASE_URL doit pointer sur la prod Neon
DATABASE_URL='postgres://...' pnpm import-legacy-roadmap
```

Attendu : rapport final identique au test dev (Task 7).

- [ ] **Step 4: Smoke test sur prod**

Ouvrir `https://eriniumfaction.vercel.app/admin/work/roadmap` sur :
- Desktop Chrome
- Mobile iPhone (375×667) ou DevTools mobile
- Tablet (768×1024)

Vérifier :
- La page se charge < 2s
- Les N projects apparaissent
- Les filtres fonctionnent
- Cliquer sur un card → spec viewer rend le HTML legacy
- Le sidebar montre bien "Roadmap" pour les users staff

Tester aussi avec un user **sans** la perm `work.roadmap.view` (ex : moderator) → vérifier que le lien sidebar est caché ET que `/admin/work/roadmap` renvoie le bandeau "permission manquante" (pas un crash).

- [ ] **Step 5: Documenter les éventuels bugs trouvés**

Si un bug est rencontré durant le smoke test, le fixer immédiatement, le documenter dans `docs/knowissue.md` (cf. règle CLAUDE.md), commit, redéployer, retester.

Format de l'entrée dans knowissue.md :

```markdown
### 2026-MM-DD — Erisclave migration P1 : <titre>

**Système** : Roadmap Phase 6 (read-only)
**Problème** : <description>
**Cause racine** : <ce qu'on a trouvé>
**Solution** : <ce qui a corrigé>
```

---

## Task 16: Cleanup du submodule docs/

**Files:**
- Delete: `D:/Mods Minecraft/EriniumFaction/docs/roadmap.html`
- Delete: `D:/Mods Minecraft/EriniumFaction/docs/specs/` (dossier entier)
- Delete: `D:/Mods Minecraft/EriniumFaction/docs/applications/erisclave/` (dossier entier)

⚠️ **Cette task ne s'exécute QU'APRÈS** que la prod a été validée (Task 15 ok, le user a confirmé que tout marche).

- [ ] **Step 1: Créer la branche d'archive sur le submodule**

```bash
cd "D:/Mods Minecraft/EriniumFaction/docs" && git checkout -b archive/pre-erisclave-migration-2026-05-25
git push -u origin archive/pre-erisclave-migration-2026-05-25
git checkout main
```

Attendu : la branche existe sur le remote `Erinium-Group/EriniumWorkflow`.

- [ ] **Step 2: Créer un tag sur le commit actuel (avant suppression)**

```bash
cd "D:/Mods Minecraft/EriniumFaction/docs" && git tag v0-pre-erisclave-migration HEAD
git push origin v0-pre-erisclave-migration
```

- [ ] **Step 3: Supprimer les 3 cibles**

```bash
cd "D:/Mods Minecraft/EriniumFaction/docs"
git rm roadmap.html
git rm -r specs/
git rm -r applications/erisclave/
```

(si `applications/` ne contient plus rien après, le supprimer aussi : `git rm -r applications/` si vide)

- [ ] **Step 4: Vérifier `git status`**

```bash
cd "D:/Mods Minecraft/EriniumFaction/docs" && git status
```

Attendu : seulement des suppressions. Aucune modification d'autres fichiers.

- [ ] **Step 5: Commit + push sur le submodule**

```bash
cd "D:/Mods Minecraft/EriniumFaction/docs"
git commit -m "cleanup: suppression roadmap.html + specs/ + applications/erisclave (migration P6 vers DB Web)

Source de verite deplacee dans la DB Neon (tables work_roadmap_*) et le Work
Panel staff (/admin/work/roadmap + /admin/work/specs/<slug>).

Archive : branche archive/pre-erisclave-migration-2026-05-25 + tag v0-pre-erisclave-migration."
git push origin HEAD
```

- [ ] **Step 6: Bump le pointer du submodule dans le repo parent**

```bash
cd "D:/Mods Minecraft/EriniumFaction" && git add docs
git commit -m "chore: bump docs/ pointer (suppression statique roadmap/specs/erisclave)"
git push origin HEAD
```

- [ ] **Step 7: Mettre à jour `docs/knowissue.md`**

Ajouter une entrée résumant la migration :

```markdown
### 2026-05-25 — Erisclave migration Phase 1 terminée

**Système** : Roadmap + specs (lecture)
**Problème** : Le flow Erisclave (app Electron + HTML statique dans le submodule docs/) ne permettait pas l'édition mobile, pas de concurrence multi-staff, et exigeait un commit + push manuel à chaque modif.
**Cause racine** : N/A — refonte architecturale (pas un bug).
**Solution** : Migration vers DB Neon + Work Panel staff. Les 55 specs et tous les projects du roadmap.html ont été importés dans les tables `work_roadmap_*` via `scripts/import-legacy-roadmap.ts`. Phase 1 = lecture seule, Phase 2 = édition (à venir).
```

```bash
cd "D:/Mods Minecraft/EriniumFaction/docs" && git add knowissue.md
git commit -m "docs(knowissue): documenter la migration Erisclave P1"
git push origin HEAD

cd "D:/Mods Minecraft/EriniumFaction" && git add docs && git commit -m "chore: bump docs/ pointer" && git push origin HEAD
```

---

## Critère de succès Phase 1

- [ ] Les 4 tables `work_roadmap_*` existent sur Neon prod
- [ ] L'import a chargé N projects + 55 specs `kind='legacy'`
- [ ] La page `/admin/work/roadmap` affiche la grille avec filtres fonctionnels
- [ ] Un click sur un card avec spec → la page `/admin/work/specs/<slug>` rend le HTML legacy sanitize
- [ ] Le lien sidebar "Roadmap" est visible/masqué selon la perm `work.roadmap.view`
- [ ] Le tout fonctionne sur mobile iPhone SE (375×667)
- [ ] Les fichiers statiques `docs/roadmap.html`, `docs/specs/`, `docs/applications/erisclave/` n'existent plus sur la branche `main` du submodule
- [ ] La branche `archive/pre-erisclave-migration-2026-05-25` + le tag `v0-pre-erisclave-migration` sont push sur le remote
- [ ] `docs/permissions.md` + `CLAUDE.md` root sont à jour
- [ ] Le script `pnpm dump-roadmap` produit un snapshot offline utilisable
- [ ] `docs/knowissue.md` documente la migration

---

## Notes pour l'implémenteur

1. **Pas de tests automatisés** dans ce repo. La vérification se fait via `pnpm build` (typecheck strict), curl pour les API, et navigation manuelle pour l'UI. Ne PAS introduire un framework de test pour cette phase — c'est hors-scope.

2. **Sanitize HTML** : utiliser `sanitize-html` (déjà installé), JAMAIS `isomorphic-dompurify` (jsdom crash sur Vercel/Next.js 16, cf. commentaire dans `lib/work/sanitize.ts`).

3. **DB_SKIP_INIT** : en prod, `_initDbInternal()` ne tourne pas. Toutes les nouvelles tables DOIVENT être dans `migrations/phase6-roadmap.sql` ET exécutées manuellement via Neon SQL editor. L'ajout à `_initDbInternal()` ne sert qu'au dev local.

4. **Submodule docs/** : c'est un repo séparé (`Erinium-Group/EriniumWorkflow`). Les commits du submodule ne sont PAS automatiquement sur le repo parent — il faut faire `git add docs && git commit && git push` dans le parent pour bump le pointer.

5. **Commits** : aucun `Co-Authored-By`, aucun crédit AI (règle CLAUDE.md). Push silencieux sur les repos privés.

6. **L'agent doit travailler depuis** `EriniumFactionWeb/` pour toutes les commandes `pnpm`, et depuis la racine (`EriniumFaction/`) ou `docs/` pour les ops submodule.

7. **Ordre d'exécution** : 1 → 16 strictement. Task 15 (run sur prod) ne s'exécute que si toutes les tasks précédentes ont passé. Task 16 (cleanup destructif) ne s'exécute QUE si Task 15 (smoke test prod) a été validée par le user.

