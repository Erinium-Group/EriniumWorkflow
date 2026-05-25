# Erisclave Migration — Phase 2a : CRUD Roadmap (Plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la roadmap entièrement éditable depuis `/admin/work/roadmap` (CRUD projects + tasks + delete specs) en réutilisant le pattern API/hooks/composants existant de la Phase 1.

**Architecture:** Backend Next.js App Router avec routes REST `POST/PATCH/DELETE` sous `/api/work/v1/roadmap/*` qui appellent des helpers DB dans `lib/work/roadmap/mutations.ts`. Frontend React 19 + React Query 5 avec optimistic updates et `@dnd-kit/sortable` (déjà installé) pour le drag-and-drop. Aucune migration DB nécessaire — toutes les colonnes existent déjà.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@neondatabase/serverless`, `@tanstack/react-query` v5, `@dnd-kit/core` + `@dnd-kit/sortable` v10, Zod v4, Tailwind v4.

**Référence spec:** `docs/superpowers/specs/2026-05-25-erisclave-migration-phase2a-design.md`

**Méthodologie de test (pas de framework de tests dans ce projet) :**
- Build = check : `JAVA_HOME=... && pnpm build` doit passer (compile TS + lint).
- API = smoke via `curl` documenté dans chaque task.
- UI = smoke manuel checklist §13 du spec, à exécuter en fin de plan.

---

## Structure des fichiers

```
EriniumFactionWeb/
├── src/
│   ├── lib/work/roadmap/
│   │   ├── mutations.ts                                 [NEW] helpers DB CRUD
│   │   ├── validators.ts                                [MODIFIED] +schemas mutations
│   │   └── (intacts) queries.ts, sanitize-spec.ts, types.ts
│   ├── hooks/work/
│   │   └── useRoadmapMutations.ts                       [NEW] 9 hooks React Query
│   ├── components/work/roadmap/
│   │   ├── ConfirmDialog.tsx                            [NEW] modal confirmation
│   │   ├── DragHandle.tsx                               [NEW] icône poignée
│   │   ├── StatusDropdown.tsx                           [NEW] popup change status
│   │   ├── ProjectFormModal.tsx                         [NEW] modal create/edit
│   │   ├── TaskItem.tsx                                 [NEW] ligne task editable
│   │   ├── TaskComposer.tsx                             [NEW] input "ajouter task"
│   │   ├── SortableCard.tsx                             [NEW] wrapper DnD card
│   │   ├── SortableTaskItem.tsx                         [NEW] wrapper DnD task
│   │   ├── RoadmapCard.tsx                              [MODIFIED] intègre edit + DnD
│   │   └── (intacts) StatusBadge.tsx, SpecLegacyRenderer.tsx
│   └── app/
│       ├── api/work/v1/roadmap/
│       │   ├── route.ts                                 [MODIFIED] +POST (create project)
│       │   ├── projects/
│       │   │   ├── [id]/route.ts                        [MODIFIED] +PATCH +DELETE
│       │   │   ├── [id]/tasks/route.ts                  [NEW] POST create task
│       │   │   ├── [id]/tasks/reorder/route.ts          [NEW] POST reorder
│       │   │   └── reorder/route.ts                     [NEW] POST reorder projects
│       │   ├── tasks/[id]/route.ts                      [NEW] PATCH + DELETE
│       │   └── specs/[slug]/route.ts                    [MODIFIED] +DELETE
│       └── (admin)/admin/work/
│           ├── roadmap/page.tsx                          [MODIFIED] +bouton create
│           └── specs/[slug]/page.tsx                     [MODIFIED] +bouton delete
└── scripts/
    └── smoke-mutations.ts                                [NEW] smoke test E2E des mutations
```

---

## Task 1: Étendre validators.ts avec schemas mutations

**Files:**
- Modify: `EriniumFactionWeb/src/lib/work/roadmap/validators.ts`

Le fichier contient déjà `SpecSlugSchema`, `ProjectIdSchema`, `RoadmapListQuerySchema`. On ajoute les schemas pour les 9 mutations.

- [ ] **Step 1: Ouvrir le fichier et lire son contenu existant**

Run : `cat EriniumFactionWeb/src/lib/work/roadmap/validators.ts`

Attendu : voir les 3 schemas existants.

- [ ] **Step 2: Ajouter les schemas mutations à la fin du fichier**

Ajouter à la fin de `EriniumFactionWeb/src/lib/work/roadmap/validators.ts`, avant l'export du type `RoadmapListQuery` :

```typescript
/** Status enum aligné avec la CHECK constraint DB. */
export const ProjectStatusSchema = z.enum(["todo", "wip", "test", "done", "blocked"]);
export const TaskStatusSchema = z.enum(["todo", "done"]);

/** Body pour POST /projects (create). */
export const CreateProjectSchema = z.object({
  title: z.string().min(1, "Titre requis").max(200, "Titre trop long"),
  status: ProjectStatusSchema,
  tags: z.array(z.string().min(1).max(50)).max(10, "Trop de tags (max 10)").default([]),
  category: z.string().min(1).max(50).nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

/** Body pour PATCH /projects/[id] (update partiel). */
export const UpdateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: ProjectStatusSchema.optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  category: z.string().min(1).max(50).nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Au moins un champ requis" },
);
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

/** Body pour POST /projects/reorder. */
export const ReorderProjectsSchema = z.object({
  order: z.array(
    z.object({
      id: z.number().int().positive(),
      orderIdx: z.number().int().min(0),
    }),
  ).min(1, "Liste vide"),
});
export type ReorderProjectsInput = z.infer<typeof ReorderProjectsSchema>;

/** Task id : entier > 0. */
export const TaskIdSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? Number(v) : v))
  .pipe(z.number().int().positive());

/** Body pour POST /projects/[id]/tasks (create task). */
export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Titre requis").max(300, "Titre trop long"),
  status: TaskStatusSchema.default("todo"),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

/** Body pour PATCH /tasks/[id]. */
export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  status: TaskStatusSchema.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Au moins un champ requis" },
);
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

/** Body pour POST /projects/[id]/tasks/reorder. */
export const ReorderTasksSchema = z.object({
  order: z.array(
    z.object({
      id: z.number().int().positive(),
      orderIdx: z.number().int().min(0),
    }),
  ).min(1, "Liste vide"),
});
export type ReorderTasksInput = z.infer<typeof ReorderTasksSchema>;
```

- [ ] **Step 3: Vérifier la compilation**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -20`

Attendu : `Compiled successfully`. Si erreur TS, corriger avant de continuer.

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb
git add src/lib/work/roadmap/validators.ts
git commit -m "feat(roadmap): zod schemas pour mutations P2a (create/update/reorder)"
```

---

## Task 2: Créer mutations.ts (helpers DB CRUD)

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/roadmap/mutations.ts`

C'est le module qui parle à Postgres pour les CRUD. Une fonction = une opération atomique. Réutilise les mêmes patterns que `queries.ts` (initDb, query, rowToProject/rowToTask).

- [ ] **Step 1: Créer le fichier avec les imports + helpers internes (re-utilisation depuis queries.ts impossible car les fonctions rowTo* y sont privées — on les redéfinit ici)**

Créer `EriniumFactionWeb/src/lib/work/roadmap/mutations.ts` :

```typescript
/**
 * Helpers DB CRUD pour le module Roadmap (Phase 2a).
 *
 * Pattern : 1 fonction = 1 mutation atomique. Toutes appellent initDb() en
 * premier. Retournent les types camelCase (RoadmapProject, RoadmapTask) ou
 * void en cas de delete.
 *
 * Les fonctions reorder utilisent une transaction Postgres (BEGIN/COMMIT)
 * pour garantir l'atomicity en cas d'echec partiel.
 */
import { query, initDb, tsToIso } from "@/lib/db";
import type { RoadmapProject, RoadmapTask, ProjectStatus, TaskStatus } from "./types";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ReorderProjectsInput,
  CreateTaskInput,
  UpdateTaskInput,
  ReorderTasksInput,
} from "./validators";

type ProjectRow = {
  id: number;
  title: string;
  status: ProjectStatus;
  tags: string[];
  category: string | null;
  order_idx: number;
  created_by: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function rowToProject(r: ProjectRow): RoadmapProject {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    tags: r.tags ?? [],
    category: r.category,
    orderIdx: r.order_idx,
    createdBy: r.created_by,
    createdAt: tsToIso(r.created_at),
    updatedAt: tsToIso(r.updated_at),
  };
}

type TaskRow = {
  id: number;
  project_id: number;
  title: string;
  status: TaskStatus;
  order_idx: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function rowToTask(r: TaskRow): RoadmapTask {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status,
    orderIdx: r.order_idx,
    createdAt: tsToIso(r.created_at),
    updatedAt: tsToIso(r.updated_at),
  };
}

/* ============================================================ */
/* Projects                                                      */
/* ============================================================ */

/** Crée un project en fin de liste (order_idx = max+1). */
export async function createProject(
  input: CreateProjectInput,
  createdBy: number | null,
): Promise<RoadmapProject> {
  await initDb();
  const rows = (await query(
    `INSERT INTO work_roadmap_projects (title, status, tags, category, order_idx, created_by)
     VALUES (
       $1, $2, $3, $4,
       (SELECT COALESCE(MAX(order_idx), -1) + 1 FROM work_roadmap_projects),
       $5
     )
     RETURNING id, title, status, tags, category, order_idx, created_by, created_at, updated_at`,
    [input.title, input.status, input.tags, input.category ?? null, createdBy],
  )) as ProjectRow[];
  return rowToProject(rows[0]);
}

/** Update partiel. Renvoie null si project absent. */
export async function updateProject(
  id: number,
  input: UpdateProjectInput,
): Promise<RoadmapProject | null> {
  await initDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  if (input.title !== undefined) {
    sets.push(`title = $${p++}`);
    params.push(input.title);
  }
  if (input.status !== undefined) {
    sets.push(`status = $${p++}`);
    params.push(input.status);
  }
  if (input.tags !== undefined) {
    sets.push(`tags = $${p++}`);
    params.push(input.tags);
  }
  if (input.category !== undefined) {
    sets.push(`category = $${p++}`);
    params.push(input.category);
  }
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id);
  const rows = (await query(
    `UPDATE work_roadmap_projects SET ${sets.join(", ")} WHERE id = $${p}
     RETURNING id, title, status, tags, category, order_idx, created_by, created_at, updated_at`,
    params,
  )) as ProjectRow[];
  if (rows.length === 0) return null;
  return rowToProject(rows[0]);
}

/** Delete. Renvoie true si supprimé, false si project absent. Cascade tasks via FK. */
export async function deleteProject(id: number): Promise<boolean> {
  await initDb();
  const rows = (await query(
    `DELETE FROM work_roadmap_projects WHERE id = $1 RETURNING id`,
    [id],
  )) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Reorder projects en transaction. Renvoie le nombre de lignes affectées. */
export async function reorderProjects(input: ReorderProjectsInput): Promise<number> {
  await initDb();
  // Validation : pas de doublons d'id ni d'orderIdx
  const ids = new Set(input.order.map((o) => o.id));
  const idxs = new Set(input.order.map((o) => o.orderIdx));
  if (ids.size !== input.order.length) throw new Error("Doublons d'id dans reorder");
  if (idxs.size !== input.order.length) throw new Error("Doublons d'orderIdx dans reorder");

  // Atomic via 1 seule requête UPDATE avec CASE
  // Construit "UPDATE work_roadmap_projects SET order_idx = CASE id WHEN $1 THEN $2 WHEN $3 THEN $4 ... END
  //           WHERE id IN ($1, $3, ...)"
  const params: unknown[] = [];
  const cases: string[] = [];
  const idPlaceholders: string[] = [];
  for (const o of input.order) {
    const idP = `$${params.length + 1}`;
    params.push(o.id);
    const idxP = `$${params.length + 1}`;
    params.push(o.orderIdx);
    cases.push(`WHEN ${idP} THEN ${idxP}`);
    idPlaceholders.push(idP);
  }
  // ATTENTION : idPlaceholders pointe sur les memes $N que cases — c'est volontaire
  // (Postgres deduplique l'évaluation). On reutilise les mêmes placeholders.

  const sql = `
    UPDATE work_roadmap_projects
    SET order_idx = CASE id ${cases.join(" ")} END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${idPlaceholders.join(", ")})
  `;
  const result = (await query(sql + ` RETURNING id`, params)) as Array<{ id: number }>;
  return result.length;
}

/* ============================================================ */
/* Tasks                                                         */
/* ============================================================ */

/** Crée une task en fin de liste pour le project. Renvoie null si project absent. */
export async function createTask(
  projectId: number,
  input: CreateTaskInput,
): Promise<RoadmapTask | null> {
  await initDb();
  // Vérif que le project existe (sinon FK constraint violation peu lisible)
  const exists = (await query(
    `SELECT id FROM work_roadmap_projects WHERE id = $1`,
    [projectId],
  )) as Array<{ id: number }>;
  if (exists.length === 0) return null;

  const rows = (await query(
    `INSERT INTO work_roadmap_tasks (project_id, title, status, order_idx)
     VALUES (
       $1, $2, $3,
       (SELECT COALESCE(MAX(order_idx), -1) + 1 FROM work_roadmap_tasks WHERE project_id = $1)
     )
     RETURNING id, project_id, title, status, order_idx, created_at, updated_at`,
    [projectId, input.title, input.status],
  )) as TaskRow[];
  return rowToTask(rows[0]);
}

/** Update task. Renvoie null si task absente. */
export async function updateTask(
  id: number,
  input: UpdateTaskInput,
): Promise<RoadmapTask | null> {
  await initDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  if (input.title !== undefined) {
    sets.push(`title = $${p++}`);
    params.push(input.title);
  }
  if (input.status !== undefined) {
    sets.push(`status = $${p++}`);
    params.push(input.status);
  }
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id);
  const rows = (await query(
    `UPDATE work_roadmap_tasks SET ${sets.join(", ")} WHERE id = $${p}
     RETURNING id, project_id, title, status, order_idx, created_at, updated_at`,
    params,
  )) as TaskRow[];
  if (rows.length === 0) return null;
  return rowToTask(rows[0]);
}

/** Delete task. Renvoie true si supprimée. */
export async function deleteTask(id: number): Promise<boolean> {
  await initDb();
  const rows = (await query(
    `DELETE FROM work_roadmap_tasks WHERE id = $1 RETURNING id`,
    [id],
  )) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Reorder tasks d'un project. Valide que toutes les tasks appartiennent bien au project. */
export async function reorderTasks(
  projectId: number,
  input: ReorderTasksInput,
): Promise<number> {
  await initDb();
  const ids = new Set(input.order.map((o) => o.id));
  const idxs = new Set(input.order.map((o) => o.orderIdx));
  if (ids.size !== input.order.length) throw new Error("Doublons d'id dans reorder");
  if (idxs.size !== input.order.length) throw new Error("Doublons d'orderIdx dans reorder");

  // Vérif que toutes les tasks appartiennent au project
  const idsArr = Array.from(ids);
  const check = (await query(
    `SELECT id FROM work_roadmap_tasks WHERE project_id = $1 AND id = ANY($2::int[])`,
    [projectId, idsArr],
  )) as Array<{ id: number }>;
  if (check.length !== idsArr.length) {
    throw new Error("Certaines tasks n'appartiennent pas a ce project");
  }

  const params: unknown[] = [];
  const cases: string[] = [];
  const idPlaceholders: string[] = [];
  for (const o of input.order) {
    const idP = `$${params.length + 1}`;
    params.push(o.id);
    const idxP = `$${params.length + 1}`;
    params.push(o.orderIdx);
    cases.push(`WHEN ${idP} THEN ${idxP}`);
    idPlaceholders.push(idP);
  }
  const sql = `
    UPDATE work_roadmap_tasks
    SET order_idx = CASE id ${cases.join(" ")} END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${idPlaceholders.join(", ")})
    RETURNING id
  `;
  const result = (await query(sql, params)) as Array<{ id: number }>;
  return result.length;
}

/* ============================================================ */
/* Specs                                                         */
/* ============================================================ */

/** Delete spec par slug. Renvoie true si supprimé. Cascade spec_assets via FK. */
export async function deleteSpecBySlug(slug: string): Promise<boolean> {
  await initDb();
  const rows = (await query(
    `DELETE FROM work_roadmap_specs WHERE slug = $1 RETURNING id`,
    [slug],
  )) as Array<{ id: number }>;
  return rows.length > 0;
}
```

- [ ] **Step 2: Vérifier que le build passe**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -20`

Attendu : compile OK. Si erreurs sur `tsToIso`/`query`/`initDb`, vérifier les imports.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/lib/work/roadmap/mutations.ts
git commit -m "feat(roadmap): helpers DB CRUD (mutations.ts) pour P2a"
```

---

## Task 3: Étendre route.ts root avec POST (créer project)

**Files:**
- Modify: `EriniumFactionWeb/src/app/api/work/v1/roadmap/route.ts`

Ajoute un handler `POST` à côté du `GET` existant.

- [ ] **Step 1: Modifier le fichier — ajouter l'import + le handler POST**

Remplacer le contenu de `EriniumFactionWeb/src/app/api/work/v1/roadmap/route.ts` par :

```typescript
/**
 * GET  /api/work/v1/roadmap        — liste des projects
 * POST /api/work/v1/roadmap        — créer un project (Phase 2a)
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { listRoadmapProjects } from "@/lib/work/roadmap/queries";
import { createProject } from "@/lib/work/roadmap/mutations";
import { RoadmapListQuerySchema, CreateProjectSchema } from "@/lib/work/roadmap/validators";

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

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff(request, "work.roadmap.edit");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = CreateProjectSchema.safeParse(body);
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

    const project = await createProject(parsed.data, session.userId);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

Attendu : compile OK.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/app/api/work/v1/roadmap/route.ts
git commit -m "feat(roadmap): POST /api/work/v1/roadmap (create project) P2a"
```

---

## Task 4: Étendre /projects/[id]/route.ts avec PATCH et DELETE

**Files:**
- Modify: `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/route.ts`

- [ ] **Step 1: Remplacer le contenu du fichier**

Remplacer `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/route.ts` par :

```typescript
/**
 * GET    /api/work/v1/roadmap/projects/:id — detail (P1)
 * PATCH  /api/work/v1/roadmap/projects/:id — edit partiel (P2a)
 * DELETE /api/work/v1/roadmap/projects/:id — supprime (cascade tasks) (P2a)
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { getRoadmapProjectById } from "@/lib/work/roadmap/queries";
import { updateProject, deleteProject } from "@/lib/work/roadmap/mutations";
import { ProjectIdSchema, UpdateProjectSchema } from "@/lib/work/roadmap/validators";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.view");

    const { id: idStr } = await params;
    const parsed = ProjectIdSchema.safeParse(idStr);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const detail = await getRoadmapProjectById(parsed.data);
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json(detail);
  } catch (err) {
    return handleWorkAuthError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.edit");

    const { id: idStr } = await params;
    const idParsed = ProjectIdSchema.safeParse(idStr);
    if (!idParsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const bodyParsed = UpdateProjectSchema.safeParse(body);
    if (!bodyParsed.success) {
      return NextResponse.json(
        {
          error: "invalid_input",
          issues: bodyParsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const project = await updateProject(idParsed.data, bodyParsed.data);
    if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ project });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.delete");

    const { id: idStr } = await params;
    const idParsed = ProjectIdSchema.safeParse(idStr);
    if (!idParsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const ok = await deleteProject(idParsed.data);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

Attendu : OK.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/app/api/work/v1/roadmap/projects/\[id\]/route.ts
git commit -m "feat(roadmap): PATCH + DELETE /projects/[id] P2a"
```

---

## Task 5: Créer POST /projects/reorder

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/reorder/route.ts`

- [ ] **Step 1: Créer le fichier**

Créer le dossier `reorder` et le fichier `route.ts` :

```bash
mkdir -p EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/reorder
```

Créer `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/reorder/route.ts` :

```typescript
/**
 * POST /api/work/v1/roadmap/projects/reorder
 *
 * Body : { order: [{ id, orderIdx }, ...] }
 * Réordonne tous les projects en un seul UPDATE atomique.
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { reorderProjects } from "@/lib/work/roadmap/mutations";
import { ReorderProjectsSchema } from "@/lib/work/roadmap/validators";

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request, "work.roadmap.edit");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = ReorderProjectsSchema.safeParse(body);
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

    try {
      const count = await reorderProjects(parsed.data);
      return NextResponse.json({ ok: true, updated: count });
    } catch (e) {
      return NextResponse.json(
        { error: "reorder_failed", message: (e as Error).message },
        { status: 400 },
      );
    }
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

Attendu : OK.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/app/api/work/v1/roadmap/projects/reorder/route.ts
git commit -m "feat(roadmap): POST /projects/reorder P2a"
```

---

## Task 6: Créer POST /projects/[id]/tasks (créer task)

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/tasks/route.ts`

- [ ] **Step 1: Créer le dossier + fichier**

```bash
mkdir -p EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/\[id\]/tasks
```

Créer `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/tasks/route.ts` :

```typescript
/**
 * POST /api/work/v1/roadmap/projects/:id/tasks — créer une task (P2a)
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { createTask } from "@/lib/work/roadmap/mutations";
import { ProjectIdSchema, CreateTaskSchema } from "@/lib/work/roadmap/validators";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.edit");

    const { id: idStr } = await params;
    const idParsed = ProjectIdSchema.safeParse(idStr);
    if (!idParsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const bodyParsed = CreateTaskSchema.safeParse(body);
    if (!bodyParsed.success) {
      return NextResponse.json(
        {
          error: "invalid_input",
          issues: bodyParsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const task = await createTask(idParsed.data, bodyParsed.data);
    if (!task) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add 'src/app/api/work/v1/roadmap/projects/[id]/tasks/route.ts'
git commit -m "feat(roadmap): POST /projects/[id]/tasks P2a"
```

---

## Task 7: Créer PATCH + DELETE /tasks/[id]

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/tasks/[id]/route.ts`

- [ ] **Step 1: Créer dossiers + fichier**

```bash
mkdir -p EriniumFactionWeb/src/app/api/work/v1/roadmap/tasks/\[id\]
```

Créer `EriniumFactionWeb/src/app/api/work/v1/roadmap/tasks/[id]/route.ts` :

```typescript
/**
 * PATCH  /api/work/v1/roadmap/tasks/:id — edit (P2a)
 * DELETE /api/work/v1/roadmap/tasks/:id — supprime (P2a)
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { updateTask, deleteTask } from "@/lib/work/roadmap/mutations";
import { TaskIdSchema, UpdateTaskSchema } from "@/lib/work/roadmap/validators";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.edit");

    const { id: idStr } = await params;
    const idParsed = TaskIdSchema.safeParse(idStr);
    if (!idParsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const bodyParsed = UpdateTaskSchema.safeParse(body);
    if (!bodyParsed.success) {
      return NextResponse.json(
        {
          error: "invalid_input",
          issues: bodyParsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const task = await updateTask(idParsed.data, bodyParsed.data);
    if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ task });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.delete");

    const { id: idStr } = await params;
    const idParsed = TaskIdSchema.safeParse(idStr);
    if (!idParsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const ok = await deleteTask(idParsed.data);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add 'src/app/api/work/v1/roadmap/tasks/[id]/route.ts'
git commit -m "feat(roadmap): PATCH + DELETE /tasks/[id] P2a"
```

---

## Task 8: Créer POST /projects/[id]/tasks/reorder

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/tasks/reorder/route.ts`

- [ ] **Step 1: Créer le fichier**

```bash
mkdir -p EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/\[id\]/tasks/reorder
```

Créer `EriniumFactionWeb/src/app/api/work/v1/roadmap/projects/[id]/tasks/reorder/route.ts` :

```typescript
/**
 * POST /api/work/v1/roadmap/projects/:id/tasks/reorder
 *
 * Body : { order: [{ id, orderIdx }, ...] }
 * Réordonne les tasks d'un project. Refuse si une task n'appartient pas au project.
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { reorderTasks } from "@/lib/work/roadmap/mutations";
import { ProjectIdSchema, ReorderTasksSchema } from "@/lib/work/roadmap/validators";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.edit");

    const { id: idStr } = await params;
    const idParsed = ProjectIdSchema.safeParse(idStr);
    if (!idParsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const bodyParsed = ReorderTasksSchema.safeParse(body);
    if (!bodyParsed.success) {
      return NextResponse.json(
        {
          error: "invalid_input",
          issues: bodyParsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    try {
      const count = await reorderTasks(idParsed.data, bodyParsed.data);
      return NextResponse.json({ ok: true, updated: count });
    } catch (e) {
      return NextResponse.json(
        { error: "reorder_failed", message: (e as Error).message },
        { status: 400 },
      );
    }
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add 'src/app/api/work/v1/roadmap/projects/[id]/tasks/reorder/route.ts'
git commit -m "feat(roadmap): POST /projects/[id]/tasks/reorder P2a"
```

---

## Task 9: Ajouter DELETE à /specs/[slug]

**Files:**
- Modify: `EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/[slug]/route.ts`

- [ ] **Step 1: Lire le fichier existant**

Run : `cat EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/\[slug\]/route.ts`

Repère la structure du `GET` existant.

- [ ] **Step 2: Ajouter le handler DELETE à la fin du fichier**

Avant la dernière `}` du fichier, ajouter (en plus du `GET` existant) :

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.delete");

    const { slug } = await params;
    const slugParsed = SpecSlugSchema.safeParse(slug);
    if (!slugParsed.success) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }

    const ok = await deleteSpecBySlug(slugParsed.data);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

Et ajouter aux imports en haut du fichier :
- `import { deleteSpecBySlug } from "@/lib/work/roadmap/mutations";`
- Vérifier que `SpecSlugSchema` est bien importé depuis `@/lib/work/roadmap/validators`

- [ ] **Step 3: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb
git add 'src/app/api/work/v1/roadmap/specs/[slug]/route.ts'
git commit -m "feat(roadmap): DELETE /specs/[slug] P2a"
```

---

## Task 10: Smoke test E2E des mutations (script + run local)

**Files:**
- Create: `EriniumFactionWeb/scripts/smoke-mutations.ts`

Script Node.js qui appelle directement les helpers `mutations.ts` contre la DB (local ou prod via env). Permet de valider que les helpers fonctionnent avant de coder l'UI.

- [ ] **Step 1: Créer le script**

Créer `EriniumFactionWeb/scripts/smoke-mutations.ts` :

```typescript
/**
 * Smoke test E2E des helpers mutations.ts.
 *
 * Usage (PowerShell Windows) :
 *   $env:DATABASE_URL="postgresql://..."
 *   pnpm tsx scripts/smoke-mutations.ts
 *
 * Crée un project + 3 tasks, les modifie, les réordonne, les supprime.
 * Affiche [OK] / [FAIL] pour chaque étape. Code de sortie != 0 si une étape rate.
 */
import {
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
} from "../src/lib/work/roadmap/mutations";

function log(ok: boolean, msg: string) {
  console.log(`${ok ? "[OK]  " : "[FAIL]"} ${msg}`);
  if (!ok) process.exit(1);
}

async function main() {
  console.log("=== Smoke test mutations.ts ===\n");

  // 1. Create project
  const p = await createProject(
    { title: "[SMOKE TEST] Project temporaire", status: "todo", tags: ["smoke", "test"], category: "test" },
    null,
  );
  log(p.id > 0 && p.title.startsWith("[SMOKE"), `createProject id=${p.id}`);

  // 2. Update project
  const p2 = await updateProject(p.id, { status: "wip", title: "[SMOKE TEST] Renamed" });
  log(p2?.status === "wip" && p2?.title === "[SMOKE TEST] Renamed", "updateProject status+title");

  // 3. Create 3 tasks
  const t1 = await createTask(p.id, { title: "Task A", status: "todo" });
  const t2 = await createTask(p.id, { title: "Task B", status: "todo" });
  const t3 = await createTask(p.id, { title: "Task C", status: "todo" });
  log(!!t1 && !!t2 && !!t3, `createTask x3 ids=${t1?.id},${t2?.id},${t3?.id}`);
  if (!t1 || !t2 || !t3) process.exit(1);

  // 4. Update task
  const t1b = await updateTask(t1.id, { status: "done" });
  log(t1b?.status === "done", "updateTask status=done");

  // 5. Reorder tasks (reverse)
  const count = await reorderTasks(p.id, {
    order: [
      { id: t3.id, orderIdx: 0 },
      { id: t2.id, orderIdx: 1 },
      { id: t1.id, orderIdx: 2 },
    ],
  });
  log(count === 3, `reorderTasks updated=${count}`);

  // 6. Delete task
  const dt = await deleteTask(t2.id);
  log(dt === true, `deleteTask t2.id=${t2.id}`);

  // 7. Delete project (cascade tasks)
  const dp = await deleteProject(p.id);
  log(dp === true, `deleteProject id=${p.id} (cascade)`);

  // 8. Update not-found
  const nf = await updateProject(99999999, { title: "ghost" });
  log(nf === null, "updateProject not-found returns null");

  // 9. Validation reorder doublon (devrait throw)
  try {
    await reorderProjects({
      order: [
        { id: 1, orderIdx: 0 },
        { id: 1, orderIdx: 1 },
      ],
    });
    log(false, "reorderProjects doublon doit throw");
  } catch (e) {
    log(true, `reorderProjects rejette doublons : ${(e as Error).message}`);
  }

  console.log("\n=== Smoke test PASSED ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Ajouter le script dans package.json**

Dans `EriniumFactionWeb/package.json`, ajouter sous `"scripts"` (après `"dump-roadmap"`) :

```json
"smoke-mutations": "tsx scripts/smoke-mutations.ts"
```

- [ ] **Step 3: Lancer le smoke test contre la DB de PROD (Vercel Neon)**

PowerShell Windows :

```powershell
cd "D:/Mods Minecraft/EriniumFaction/EriniumFactionWeb"
$env:DATABASE_URL="<URL_PROD_NEON>"
$env:DB_SKIP_INIT="1"
pnpm smoke-mutations
```

Attendu : 9 lignes `[OK]` puis `=== Smoke test PASSED ===`. Exit code 0.

Si un test fail → debug le helper correspondant dans `mutations.ts` avant de continuer.

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb
git add scripts/smoke-mutations.ts package.json
git commit -m "test(roadmap): script smoke-mutations.ts pour valider helpers P2a"
```

---

## Task 11: Créer useRoadmapMutations.ts (9 hooks React Query)

**Files:**
- Create: `EriniumFactionWeb/src/hooks/work/useRoadmapMutations.ts`

- [ ] **Step 1: Créer le fichier complet**

Créer `EriniumFactionWeb/src/hooks/work/useRoadmapMutations.ts` :

```typescript
"use client";

/**
 * Hooks React Query pour les mutations roadmap (Phase 2a).
 *
 * Pattern uniforme :
 *  - mutationFn appelle fetch() avec credentials: "include"
 *  - onMutate fait un optimistic update via setQueryData + cancelQueries
 *  - onError rollback via le snapshot du onMutate
 *  - onSettled invalidate les queries impactées
 *
 * Important : on n'invalide pas tout ["roadmap"] en aveugle — on garde
 * les filters actifs (le pattern queryKey est ["roadmap", filters]).
 * Donc on invalide la racine ["roadmap"] qui match toutes les variantes.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RoadmapProject, RoadmapProjectListItem, RoadmapTask } from "@/lib/work/roadmap/types";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ReorderProjectsInput,
  CreateTaskInput,
  UpdateTaskInput,
  ReorderTasksInput,
} from "@/lib/work/roadmap/validators";

async function jsonFetch<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message ?? body?.error ?? "";
    } catch {
      /* swallow */
    }
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/* ============================================================ */
/* Projects                                                      */
/* ============================================================ */

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      jsonFetch<{ project: RoadmapProject }>("/api/work/v1/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => r.project),
    onSettled: () => qc.invalidateQueries({ queryKey: ["roadmap"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateProjectInput }) =>
      jsonFetch<{ project: RoadmapProject }>(`/api/work/v1/roadmap/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => r.project),

    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ["roadmap"] });
      const snapshot = qc.getQueriesData<RoadmapProjectListItem[]>({ queryKey: ["roadmap"] });
      qc.setQueriesData<RoadmapProjectListItem[]>({ queryKey: ["roadmap"] }, (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === id ? { ...p, ...input } : p));
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["roadmap"] });
      qc.invalidateQueries({ queryKey: ["roadmap-project", vars.id] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      jsonFetch<void>(`/api/work/v1/roadmap/projects/${id}`, { method: "DELETE" }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["roadmap"] });
      const snapshot = qc.getQueriesData<RoadmapProjectListItem[]>({ queryKey: ["roadmap"] });
      qc.setQueriesData<RoadmapProjectListItem[]>({ queryKey: ["roadmap"] }, (old) => {
        if (!old) return old;
        return old.filter((p) => p.id !== id);
      });
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["roadmap"] }),
  });
}

export function useReorderProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderProjectsInput) =>
      jsonFetch<{ ok: boolean; updated: number }>(
        "/api/work/v1/roadmap/projects/reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["roadmap"] });
      const snapshot = qc.getQueriesData<RoadmapProjectListItem[]>({ queryKey: ["roadmap"] });
      const indexMap = new Map(input.order.map((o) => [o.id, o.orderIdx]));
      qc.setQueriesData<RoadmapProjectListItem[]>({ queryKey: ["roadmap"] }, (old) => {
        if (!old) return old;
        return [...old]
          .map((p) => ({ ...p, orderIdx: indexMap.get(p.id) ?? p.orderIdx }))
          .sort((a, b) => a.orderIdx - b.orderIdx);
      });
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["roadmap"] }),
  });
}

/* ============================================================ */
/* Tasks                                                         */
/* ============================================================ */

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: number; input: CreateTaskInput }) =>
      jsonFetch<{ task: RoadmapTask }>(
        `/api/work/v1/roadmap/projects/${projectId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ).then((r) => r.task),

    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["roadmap-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateTaskInput; projectId: number }) =>
      jsonFetch<{ task: RoadmapTask }>(`/api/work/v1/roadmap/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => r.task),

    onMutate: async ({ id, input, projectId }) => {
      await qc.cancelQueries({ queryKey: ["roadmap-project", projectId] });
      const snapshot = qc.getQueryData<{ tasks: RoadmapTask[] }>([
        "roadmap-project",
        projectId,
      ]);
      qc.setQueryData<{ project: RoadmapProject; tasks: RoadmapTask[]; specSlugs: string[] }>(
        ["roadmap-project", projectId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            tasks: old.tasks.map((t) => (t.id === id ? { ...t, ...input } : t)),
          };
        },
      );
      return { snapshot, projectId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot && ctx.projectId) {
        qc.setQueryData(["roadmap-project", ctx.projectId], ctx.snapshot);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["roadmap-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId: number }) =>
      jsonFetch<void>(`/api/work/v1/roadmap/tasks/${id}`, { method: "DELETE" }),

    onMutate: async ({ id, projectId }) => {
      await qc.cancelQueries({ queryKey: ["roadmap-project", projectId] });
      const snapshot = qc.getQueryData(["roadmap-project", projectId]);
      qc.setQueryData<{ project: RoadmapProject; tasks: RoadmapTask[]; specSlugs: string[] }>(
        ["roadmap-project", projectId],
        (old) => {
          if (!old) return old;
          return { ...old, tasks: old.tasks.filter((t) => t.id !== id) };
        },
      );
      return { snapshot, projectId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot && ctx.projectId) {
        qc.setQueryData(["roadmap-project", ctx.projectId], ctx.snapshot);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["roadmap-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: number; input: ReorderTasksInput }) =>
      jsonFetch<{ ok: boolean; updated: number }>(
        `/api/work/v1/roadmap/projects/${projectId}/tasks/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),

    onMutate: async ({ projectId, input }) => {
      await qc.cancelQueries({ queryKey: ["roadmap-project", projectId] });
      const snapshot = qc.getQueryData(["roadmap-project", projectId]);
      const indexMap = new Map(input.order.map((o) => [o.id, o.orderIdx]));
      qc.setQueryData<{ project: RoadmapProject; tasks: RoadmapTask[]; specSlugs: string[] }>(
        ["roadmap-project", projectId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            tasks: [...old.tasks]
              .map((t) => ({ ...t, orderIdx: indexMap.get(t.id) ?? t.orderIdx }))
              .sort((a, b) => a.orderIdx - b.orderIdx),
          };
        },
      );
      return { snapshot, projectId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot && ctx.projectId) {
        qc.setQueryData(["roadmap-project", ctx.projectId], ctx.snapshot);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["roadmap-project", vars.projectId] });
    },
  });
}

/* ============================================================ */
/* Specs                                                         */
/* ============================================================ */

export function useDeleteSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      jsonFetch<void>(`/api/work/v1/roadmap/specs/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      }),
    onSettled: (_data, _err, slug) => {
      qc.invalidateQueries({ queryKey: ["roadmap-spec", slug] });
      qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

Attendu : compile OK.

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/hooks/work/useRoadmapMutations.ts
git commit -m "feat(roadmap): hooks React Query mutations (9 hooks) P2a"
```

---

## Task 12: Composants atomiques — ConfirmDialog + DragHandle

**Files:**
- Create: `EriniumFactionWeb/src/components/work/roadmap/ConfirmDialog.tsx`
- Create: `EriniumFactionWeb/src/components/work/roadmap/DragHandle.tsx`

- [ ] **Step 1: Créer ConfirmDialog.tsx**

```typescript
"use client";

import { useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Modal de confirmation reutilisable (Liquid Glass cream).
 * Echap = close. Enter = confirm. Focus auto sur Cancel pour eviter
 * une suppression accidentelle par Enter trop rapide.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Annuler",
  confirmVariant = "default",
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter" && !loading) onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onConfirm, onClose]);

  if (!open) return null;

  const confirmCls =
    confirmVariant === "danger"
      ? "bg-erisclave-red-ko text-white hover:bg-erisclave-red-ko/90"
      : "bg-erisclave-pink-deep text-white hover:bg-erisclave-pink-deep/90";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-erisclave-cream rounded-2xl p-6 max-w-md w-[90%] shadow-2xl
                   border border-erisclave-cream-deep"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <h2
          id="confirm-title"
          className="text-lg font-bold text-erisclave-ink mb-2"
        >
          {title}
        </h2>
        <p
          id="confirm-message"
          className="text-sm text-erisclave-ink-soft mb-6 whitespace-pre-line"
        >
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-md text-sm font-medium
                       bg-erisclave-cream-deep text-erisclave-ink
                       hover:bg-erisclave-cream-deep/80
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-md text-sm font-medium ${confirmCls}
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink`}
          >
            {loading ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Créer DragHandle.tsx**

```typescript
"use client";

import type { HTMLAttributes } from "react";

/**
 * Petite icône de poignée pour DnD. À placer dans un container qui passera
 * les `listeners` de @dnd-kit en spread.
 *
 * Usage:
 *   <div {...listeners} {...attributes}>
 *     <DragHandle />
 *   </div>
 */
export default function DragHandle(props: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      aria-label="Reordonner"
      title="Glisser pour reordonner"
      className={`inline-flex items-center justify-center w-5 h-5
                  text-erisclave-ink-soft cursor-grab active:cursor-grabbing
                  hover:text-erisclave-pink-deep select-none ${props.className ?? ""}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <circle cx="6" cy="5"  r="1.5" />
        <circle cx="6" cy="10" r="1.5" />
        <circle cx="6" cy="15" r="1.5" />
        <circle cx="14" cy="5"  r="1.5" />
        <circle cx="14" cy="10" r="1.5" />
        <circle cx="14" cy="15" r="1.5" />
      </svg>
    </span>
  );
}
```

- [ ] **Step 3: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb
git add src/components/work/roadmap/ConfirmDialog.tsx src/components/work/roadmap/DragHandle.tsx
git commit -m "feat(roadmap): ConfirmDialog + DragHandle atoms P2a"
```

---

## Task 13: StatusDropdown.tsx

**Files:**
- Create: `EriniumFactionWeb/src/components/work/roadmap/StatusDropdown.tsx`

- [ ] **Step 1: Créer le fichier**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectStatus } from "@/lib/work/roadmap/types";

interface Props {
  current: ProjectStatus;
  onChange: (next: ProjectStatus) => void;
  disabled?: boolean;
}

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

const ORDER: ProjectStatus[] = ["todo", "wip", "test", "done", "blocked"];

/**
 * Badge cliquable qui ouvre un dropdown pour changer le status du project.
 * Mode lecture seule si disabled=true (affiche juste le badge).
 */
export default function StatusDropdown({ current, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const meta = STATUS_META[current];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (disabled) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${meta.bg} ${meta.text}`}
      >
        {meta.label}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                    text-[11px] font-semibold cursor-pointer
                    hover:ring-2 hover:ring-erisclave-pink/50
                    ${meta.bg} ${meta.text}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {meta.label}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 w-32 bg-erisclave-cream
                     border border-erisclave-cream-deep rounded-lg shadow-xl p-1"
          role="listbox"
          onClick={(e) => e.stopPropagation()}
        >
          {ORDER.map((s) => {
            const m = STATUS_META[s];
            return (
              <button
                type="button"
                key={s}
                onClick={() => {
                  setOpen(false);
                  if (s !== current) onChange(s);
                }}
                role="option"
                aria-selected={s === current}
                className={`w-full text-left px-2 py-1 rounded text-[11px] font-semibold
                            ${m.bg} ${m.text}
                            ${s === current ? "ring-2 ring-erisclave-pink-deep" : ""}
                            hover:opacity-90 my-0.5`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/components/work/roadmap/StatusDropdown.tsx
git commit -m "feat(roadmap): StatusDropdown component P2a"
```

---

## Task 14: ProjectFormModal.tsx

**Files:**
- Create: `EriniumFactionWeb/src/components/work/roadmap/ProjectFormModal.tsx`

- [ ] **Step 1: Créer le fichier**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { RoadmapProject, ProjectStatus } from "@/lib/work/roadmap/types";
import { useCreateProject, useUpdateProject } from "@/hooks/work/useRoadmapMutations";

interface Props {
  open: boolean;
  mode: "create" | "edit";
  project?: RoadmapProject; // requis si mode='edit'
  onClose: () => void;
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "todo",    label: "Planifie" },
  { value: "wip",     label: "En cours" },
  { value: "test",    label: "En test" },
  { value: "done",    label: "Termine" },
  { value: "blocked", label: "Bloque" },
];

/**
 * Modal create/edit project. Champs : title, status, tags (csv), category.
 * Pas de champ description — la table DB n'a pas cette colonne en P2a.
 */
export default function ProjectFormModal({ open, mode, project, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("todo");
  const [tagsText, setTagsText] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateProject();
  const updateMut = useUpdateProject();
  const submitting = createMut.isPending || updateMut.isPending;

  // Reset form quand on ouvre / quand le project change
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && project) {
      setTitle(project.title);
      setStatus(project.status);
      setTagsText(project.tags.join(", "));
      setCategory(project.category ?? "");
    } else {
      setTitle("");
      setStatus("todo");
      setTagsText("");
      setCategory("");
    }
    setError(null);
  }, [open, mode, project]);

  // Echap pour fermer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function parseTags(text: string): string[] {
    return Array.from(
      new Set(
        text
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0 && t.length <= 50),
      ),
    ).slice(0, 10);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Le titre est obligatoire");
      return;
    }
    const payload = {
      title: trimmedTitle,
      status,
      tags: parseTags(tagsText),
      category: category.trim() ? category.trim() : null,
    };
    try {
      if (mode === "create") {
        await createMut.mutateAsync(payload);
      } else if (project) {
        await updateMut.mutateAsync({ id: project.id, input: payload });
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-erisclave-cream rounded-2xl p-6 max-w-lg w-[90%] shadow-2xl
                   border border-erisclave-cream-deep
                   flex flex-col gap-4"
        role="dialog"
        aria-labelledby="project-modal-title"
      >
        <h2
          id="project-modal-title"
          className="text-lg font-bold text-erisclave-ink"
        >
          {mode === "create" ? "Nouveau project" : "Editer le project"}
        </h2>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-erisclave-ink">Titre *</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            autoFocus
            className="bg-white border border-erisclave-cream-deep rounded-md px-3 py-2
                       text-erisclave-ink text-sm
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-erisclave-ink">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            className="bg-white border border-erisclave-cream-deep rounded-md px-3 py-2
                       text-erisclave-ink text-sm
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-erisclave-ink">Tags (sep. virgule, max 10)</span>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="ex: combat, ui, phase2"
            className="bg-white border border-erisclave-cream-deep rounded-md px-3 py-2
                       text-erisclave-ink text-sm
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-erisclave-ink">Categorie (optionnel)</span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={50}
            placeholder="ex: backend"
            className="bg-white border border-erisclave-cream-deep rounded-md px-3 py-2
                       text-erisclave-ink text-sm
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
          />
        </label>

        {error && (
          <div className="bg-erisclave-red-ko/10 text-erisclave-red-ko px-3 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-md text-sm font-medium
                       bg-erisclave-cream-deep text-erisclave-ink
                       hover:bg-erisclave-cream-deep/80 disabled:opacity-50
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md text-sm font-medium
                       bg-erisclave-pink-deep text-white
                       hover:bg-erisclave-pink-deep/90 disabled:opacity-50
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
          >
            {submitting ? "..." : (mode === "create" ? "Creer" : "Sauver")}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/components/work/roadmap/ProjectFormModal.tsx
git commit -m "feat(roadmap): ProjectFormModal create/edit P2a"
```

---

## Task 15: TaskItem.tsx

**Files:**
- Create: `EriniumFactionWeb/src/components/work/roadmap/TaskItem.tsx`

- [ ] **Step 1: Créer le fichier**

```typescript
"use client";

import { useState, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import type { RoadmapTask } from "@/lib/work/roadmap/types";
import {
  useUpdateTask,
  useDeleteTask,
} from "@/hooks/work/useRoadmapMutations";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  task: RoadmapTask;
  canEdit: boolean;
  canDelete: boolean;
  /** Slot pour la drag-handle quand parent enrobe en SortableTaskItem. */
  dragHandle?: React.ReactNode;
}

/**
 * Une ligne tâche. Read-only si canEdit=false (juste checkbox disabled).
 * En mode edit : checkbox cliquable + double-clic sur label = rename inline.
 */
export default function TaskItem({ task, canEdit, canDelete, dragHandle }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [confirmDel, setConfirmDel] = useState(false);

  const updateMut = useUpdateTask();
  const deleteMut = useDeleteTask();

  // Sync local draft quand task.title change depuis l'extérieur (refetch)
  useEffect(() => {
    if (!editing) setDraft(task.title);
  }, [task.title, editing]);

  const done = task.status === "done";
  const pending = updateMut.isPending || deleteMut.isPending;

  function toggleDone() {
    if (!canEdit) return;
    updateMut.mutate({
      id: task.id,
      input: { status: done ? "todo" : "done" },
      projectId: task.projectId,
    });
  }

  function commitRename() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === task.title) {
      setEditing(false);
      setDraft(task.title);
      return;
    }
    if (trimmed.length > 300) return;
    updateMut.mutate({
      id: task.id,
      input: { title: trimmed },
      projectId: task.projectId,
    });
    setEditing(false);
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
      setDraft(task.title);
    }
  }

  return (
    <li
      className={`group flex items-start gap-2 text-xs py-1
                  ${pending ? "opacity-60" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {dragHandle}
      <input
        type="checkbox"
        checked={done}
        disabled={!canEdit}
        onChange={toggleDone}
        aria-label={task.title}
        className={`mt-0.5 shrink-0 accent-erisclave-pink-deep
                    ${canEdit ? "cursor-pointer" : "cursor-default"}`}
      />
      {editing ? (
        <input
          type="text"
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={onTitleKey}
          maxLength={300}
          autoFocus
          className="flex-1 bg-white border border-erisclave-pink/40 rounded px-1.5 py-0.5
                     text-xs text-erisclave-ink
                     focus:outline-none focus:ring-1 focus:ring-erisclave-pink"
        />
      ) : (
        <span
          className={`flex-1 ${done ? "line-through text-erisclave-ink-soft" : "text-erisclave-ink"}
                      ${canEdit ? "cursor-text" : ""}`}
          onDoubleClick={() => {
            if (canEdit) setEditing(true);
          }}
        >
          {task.title}
        </span>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => setConfirmDel(true)}
          aria-label="Supprimer la tache"
          className="opacity-0 group-hover:opacity-100 transition
                     text-erisclave-red-ko hover:text-erisclave-red-ko/80
                     focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-erisclave-pink"
        >
          🗑
        </button>
      )}
      <ConfirmDialog
        open={confirmDel}
        title="Supprimer cette tache ?"
        message={`Tache : "${task.title}"\n\nCette action est irreversible.`}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        loading={deleteMut.isPending}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteMut.mutate(
            { id: task.id, projectId: task.projectId },
            { onSuccess: () => setConfirmDel(false) },
          );
        }}
      />
    </li>
  );
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/components/work/roadmap/TaskItem.tsx
git commit -m "feat(roadmap): TaskItem editable + delete confirm P2a"
```

---

## Task 16: TaskComposer.tsx

**Files:**
- Create: `EriniumFactionWeb/src/components/work/roadmap/TaskComposer.tsx`

- [ ] **Step 1: Créer le fichier**

```typescript
"use client";

import { useState, type KeyboardEvent } from "react";
import { useCreateTask } from "@/hooks/work/useRoadmapMutations";

interface Props {
  projectId: number;
}

/**
 * Input "Ajouter une tache..." pour le bas de la liste de tasks d'un project.
 * Affiché uniquement si l'utilisateur a la perm work.roadmap.edit (gere par parent).
 */
export default function TaskComposer({ projectId }: Props) {
  const [title, setTitle] = useState("");
  const createMut = useCreateTask();

  function submit() {
    const t = title.trim();
    if (!t || createMut.isPending) return;
    createMut.mutate(
      { projectId, input: { title: t, status: "todo" } },
      {
        onSuccess: () => setTitle(""),
      },
    );
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 mt-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKey}
        maxLength={300}
        placeholder="+ Ajouter une tache..."
        disabled={createMut.isPending}
        className="flex-1 bg-white border border-erisclave-cream-deep rounded px-2 py-1
                   text-xs text-erisclave-ink placeholder:text-erisclave-ink-soft
                   focus:outline-none focus:ring-1 focus:ring-erisclave-pink
                   disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={createMut.isPending || !title.trim()}
        className="px-2 py-1 rounded text-xs font-semibold
                   bg-erisclave-pink-deep text-white
                   hover:bg-erisclave-pink-deep/90 disabled:opacity-50
                   focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
      >
        {createMut.isPending ? "..." : "+"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/components/work/roadmap/TaskComposer.tsx
git commit -m "feat(roadmap): TaskComposer input P2a"
```

---

## Task 17: SortableCard + SortableTaskItem (wrappers @dnd-kit)

**Files:**
- Create: `EriniumFactionWeb/src/components/work/roadmap/SortableCard.tsx`
- Create: `EriniumFactionWeb/src/components/work/roadmap/SortableTaskItem.tsx`

- [ ] **Step 1: Créer SortableCard.tsx**

```typescript
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

interface Props {
  id: number;
  /** Render fn qui reçoit la drag-handle prête à coller. */
  children: (params: {
    dragHandle: ReactNode;
    isDragging: boolean;
  }) => ReactNode;
}

/**
 * Wrapper @dnd-kit pour une RoadmapCard. Passe `dragHandle` (déjà bindé aux
 * listeners) au render-prop pour que le composant enfant décide où le placer.
 * Le reste de la card n'est pas draggable — uniquement la handle.
 */
export default function SortableCard({ id, children }: Props) {
  const sortable = useSortable({ id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  const dragHandle = (
    <span
      {...attributes}
      {...listeners}
      style={{ touchAction: "none" }}
      className="cursor-grab active:cursor-grabbing"
    />
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandle, isDragging })}
    </div>
  );
}
```

- [ ] **Step 2: Créer SortableTaskItem.tsx**

```typescript
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RoadmapTask } from "@/lib/work/roadmap/types";
import TaskItem from "./TaskItem";
import DragHandle from "./DragHandle";

interface Props {
  task: RoadmapTask;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Wrapper sortable autour de TaskItem. La drag-handle est <DragHandle> liee
 * aux listeners @dnd-kit. Le reste de la ligne reste cliquable normalement.
 */
export default function SortableTaskItem({ task, canEdit, canDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Drag-handle visible uniquement si canEdit, sinon on rend juste un placeholder vide.
  const handle = canEdit ? (
    <span
      {...attributes}
      {...listeners}
      style={{ touchAction: "none" }}
      className="opacity-0 group-hover:opacity-100 transition shrink-0"
    >
      <DragHandle />
    </span>
  ) : null;

  return (
    <div ref={setNodeRef} style={style}>
      <TaskItem
        task={task}
        canEdit={canEdit}
        canDelete={canDelete}
        dragHandle={handle}
      />
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb
git add src/components/work/roadmap/SortableCard.tsx src/components/work/roadmap/SortableTaskItem.tsx
git commit -m "feat(roadmap): SortableCard + SortableTaskItem @dnd-kit wrappers P2a"
```

---

## Task 18: Refonte RoadmapCard.tsx (intègre tout)

**Files:**
- Modify: `EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx`

Remplacement complet : la card devient sensible aux perms (canEdit, canDelete), permet l'édition inline du titre, ouvre `ProjectFormModal` en mode edit, gère `useDeleteProject` avec `ConfirmDialog`, expose `StatusDropdown`, intègre `TaskComposer` + tasks réordonnables via `DndContext` interne pour les tasks de ce project.

- [ ] **Step 1: Remplacer le contenu complet du fichier**

Remplacer `EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx` par :

```typescript
"use client";

import {
  useState,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { RoadmapProjectListItem } from "@/lib/work/roadmap/types";
import { useRoadmapProject } from "@/hooks/work/useRoadmap";
import {
  useUpdateProject,
  useDeleteProject,
  useReorderTasks,
} from "@/hooks/work/useRoadmapMutations";
import StatusDropdown from "./StatusDropdown";
import ProjectFormModal from "./ProjectFormModal";
import ConfirmDialog from "./ConfirmDialog";
import TaskComposer from "./TaskComposer";
import SortableTaskItem from "./SortableTaskItem";
import DragHandle from "./DragHandle";

interface Props {
  project: RoadmapProjectListItem;
  canEdit: boolean;
  canDelete: boolean;
  /** Drag-handle passée par SortableCard parent (DnD project). */
  cardDragHandle?: ReactNode;
}

/**
 * Card project — version P2a editable.
 *
 * Comportement :
 *  - Click sur le corps -> toggle expand (lazy fetch tasks)
 *  - Double-clic titre -> rename inline (si canEdit)
 *  - StatusDropdown -> change status (si canEdit)
 *  - Bouton ✏️ -> ouvre ProjectFormModal en mode edit (si canEdit)
 *  - Bouton 🗑️ -> ConfirmDialog -> useDeleteProject (si canDelete)
 *  - cardDragHandle -> poignée DnD posée à gauche (si canEdit + parent fournit)
 *  - Tasks réordonnables via DndContext interne (si canEdit)
 *  - TaskComposer en bas (si canEdit)
 *  - Lien spec séparé avec stopPropagation
 */
export default function RoadmapCard({
  project,
  canEdit,
  canDelete,
  cardDragHandle,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const updateMut = useUpdateProject();
  const deleteMut = useDeleteProject();
  const reorderTasksMut = useReorderTasks();

  const { data: details, isLoading: detailsLoading } = useRoadmapProject(
    expanded ? project.id : null,
  );

  // Sync titre local quand props change
  useEffect(() => {
    if (!editingTitle) setTitleDraft(project.title);
  }, [project.title, editingTitle]);

  const pct =
    project.tasksTotal > 0
      ? Math.round((project.tasksDone / project.tasksTotal) * 100)
      : 0;

  function toggle() {
    if (!editingTitle) setExpanded((e) => !e);
  }

  function onKeyDownCard(e: KeyboardEvent<HTMLElement>) {
    if (editingTitle) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }

  function commitRenameTitle() {
    const t = titleDraft.trim();
    if (!t || t === project.title) {
      setEditingTitle(false);
      setTitleDraft(project.title);
      return;
    }
    if (t.length > 200) return;
    updateMut.mutate({ id: project.id, input: { title: t } });
    setEditingTitle(false);
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRenameTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingTitle(false);
      setTitleDraft(project.title);
    }
  }

  // DnD interne pour les tasks
  const taskIds = useMemo(
    () => (details?.tasks ?? []).map((t) => t.id),
    [details?.tasks],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onTasksDragEnd(e: DragEndEvent) {
    if (!details) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = taskIds.indexOf(active.id as number);
    const newIndex = taskIds.indexOf(over.id as number);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(taskIds, oldIndex, newIndex);
    reorderTasksMut.mutate({
      projectId: project.id,
      input: { order: next.map((id, idx) => ({ id, orderIdx: idx })) },
    });
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={toggle}
      onKeyDown={onKeyDownCard}
      className="
        group relative cursor-pointer select-none
        bg-erisclave-cream/95 backdrop-blur
        border border-erisclave-cream-deep
        rounded-2xl p-5 shadow-sm
        hover:shadow-md hover:border-erisclave-pink/40
        focus:outline-none focus:ring-2 focus:ring-erisclave-pink
        transition-all duration-200
        min-h-[180px] flex flex-col gap-3
      "
    >
      {/* Drag-handle de la card (DnD parent) */}
      {canEdit && cardDragHandle && (
        <span
          className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition"
          onClick={(e) => e.stopPropagation()}
        >
          {cardDragHandle}
          <DragHandle />
        </span>
      )}

      {/* Header */}
      <header className="flex items-start gap-3 justify-between">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className={`text-erisclave-pink-deep mt-1 shrink-0
                        transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          {editingTitle ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitRenameTitle}
              onKeyDown={onTitleKey}
              onClick={(e) => e.stopPropagation()}
              maxLength={200}
              autoFocus
              className="flex-1 bg-white border border-erisclave-pink/40 rounded px-2 py-1
                         text-sm text-erisclave-ink font-bold
                         focus:outline-none focus:ring-1 focus:ring-erisclave-pink"
            />
          ) : (
            <h3
              className="text-base font-bold text-erisclave-ink leading-tight flex-1"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (canEdit) setEditingTitle(true);
              }}
            >
              {project.title}
            </h3>
          )}
        </div>

        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <StatusDropdown
            current={project.status}
            disabled={!canEdit}
            onChange={(s) => updateMut.mutate({ id: project.id, input: { status: s } })}
          />
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              aria-label="Editer ce project"
              className="opacity-0 group-hover:opacity-100 transition
                         text-erisclave-ink-soft hover:text-erisclave-pink-deep
                         focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-erisclave-pink
                         text-sm"
            >
              ✏
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              aria-label="Supprimer ce project"
              className="opacity-0 group-hover:opacity-100 transition
                         text-erisclave-red-ko hover:text-erisclave-red-ko/80
                         focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-erisclave-pink
                         text-sm"
            >
              🗑
            </button>
          )}
        </div>
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

      {/* Tasks list */}
      {expanded && (
        <div
          className="border-t border-erisclave-cream-deep pt-3 mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          {detailsLoading && !details ? (
            <p className="text-xs text-erisclave-ink-soft italic">
              Chargement des taches…
            </p>
          ) : details && details.tasks.length === 0 ? (
            <p className="text-xs text-erisclave-ink-soft italic">
              Aucune tache pour ce projet.
            </p>
          ) : details ? (
            canEdit ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onTasksDragEnd}
              >
                <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-0.5">
                    {details.tasks.map((task) => (
                      <SortableTaskItem
                        key={task.id}
                        task={task}
                        canEdit={canEdit}
                        canDelete={canDelete}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {details.tasks.map((task) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    canEdit={false}
                    canDelete={false}
                  />
                ))}
              </ul>
            )
          ) : null}

          {canEdit && details && <TaskComposer projectId={project.id} />}
        </div>
      )}

      {/* Lien spec */}
      {project.firstSpecSlug && (
        <Link
          href={`/admin/work/specs/${encodeURIComponent(project.firstSpecSlug)}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-erisclave-pink-deep hover:underline self-start
                     focus:outline-none focus:ring-2 focus:ring-erisclave-pink rounded"
        >
          Voir le cahier des charges →
        </Link>
      )}

      {/* Modals */}
      <ProjectFormModal
        open={showEdit}
        mode="edit"
        project={project}
        onClose={() => setShowEdit(false)}
      />
      <ConfirmDialog
        open={confirmDel}
        title="Supprimer ce project ?"
        message={`Project : "${project.title}"\n\nCela supprimera aussi ses ${project.tasksTotal} taches. Les specs lies resteront accessibles en orphelins.\n\nIrreversible.`}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        loading={deleteMut.isPending}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteMut.mutate(project.id, {
            onSuccess: () => setConfirmDel(false),
          });
        }}
      />
    </article>
  );
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

Si le build se plaint de l'absence de `cardDragHandle` chez les callers : c'est attendu (Task 19 fixe la page).

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add src/components/work/roadmap/RoadmapCard.tsx
git commit -m "feat(roadmap): RoadmapCard editable (rename + status + delete + DnD tasks) P2a"
```

---

## Task 19: Modifier page /admin/work/roadmap (bouton create + DnD projects)

**Files:**
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/roadmap/page.tsx`

- [ ] **Step 1: Lire le fichier existant pour repérer la structure**

Run : `cat EriniumFactionWeb/src/app/\(admin\)/admin/work/roadmap/page.tsx`

Note où la grille de cards est rendue et où s'insérer.

- [ ] **Step 2: Remplacer le contenu du fichier**

Remplacer `EriniumFactionWeb/src/app/(admin)/admin/work/roadmap/page.tsx` par :

```typescript
"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useRoadmap } from "@/hooks/work/useRoadmap";
import { useReorderProjects } from "@/hooks/work/useRoadmapMutations";
import { useWorkPage } from "@/hooks/work/useWorkPage";
import { useWorkPerms } from "@/hooks/work/useWorkPerms";
import RoadmapCard from "@/components/work/roadmap/RoadmapCard";
import SortableCard from "@/components/work/roadmap/SortableCard";
import ProjectFormModal from "@/components/work/roadmap/ProjectFormModal";

export default function RoadmapPage() {
  const { hasPerm } = useWorkPerms();
  const canView = hasPerm("work.roadmap.view");
  const canEdit = hasPerm("work.roadmap.edit");
  const canDelete = hasPerm("work.roadmap.delete");

  const [showCreate, setShowCreate] = useState(false);
  const { data: projects = [], isLoading, error } = useRoadmap({});
  const reorderMut = useReorderProjects();

  useWorkPage({
    title: "Roadmap",
    breadcrumbs: [{ label: "Roadmap" }],
  });

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = projectIds.indexOf(active.id as number);
    const newIndex = projectIds.indexOf(over.id as number);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(projectIds, oldIndex, newIndex);
    reorderMut.mutate({
      order: next.map((id, idx) => ({ id, orderIdx: idx })),
    });
  }

  if (!canView) {
    return (
      <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink text-center">
        Vous n&apos;avez pas la permission <code>work.roadmap.view</code>.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink-soft text-sm">
        Chargement de la roadmap…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-erisclave-red-ko/10 text-erisclave-red-ko p-4 rounded-2xl">
        Erreur de chargement : {(error as Error).message}
      </div>
    );
  }

  const grid = canEdit ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={projectIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <SortableCard key={p.id} id={p.id}>
              {({ dragHandle }) => (
                <RoadmapCard
                  project={p}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  cardDragHandle={dragHandle}
                />
              )}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => (
        <RoadmapCard
          key={p.id}
          project={p}
          canEdit={false}
          canDelete={false}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-erisclave-ink-soft">
          {projects.length} project{projects.length > 1 ? "s" : ""}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-md text-sm font-semibold
                       bg-erisclave-pink-deep text-white
                       hover:bg-erisclave-pink-deep/90
                       focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
          >
            + Nouveau project
          </button>
        )}
      </div>

      {grid}

      <ProjectFormModal
        open={showCreate}
        mode="create"
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
```

> Note : si la version actuelle de `page.tsx` utilise des filtres (status/category/tag) — vérifier que le retrait dans ce remplacement est intentionnel pour P2a. Si tu veux les conserver, copie le block correspondant de l'ancien fichier avant le `<div className="flex items-center justify-between">`.

- [ ] **Step 3: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
cd EriniumFactionWeb
git add 'src/app/(admin)/admin/work/roadmap/page.tsx'
git commit -m "feat(roadmap): page roadmap avec bouton create + DnD projects P2a"
```

---

## Task 20: Modifier page /admin/work/specs/[slug] (bouton delete)

**Files:**
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/page.tsx`

- [ ] **Step 1: Remplacer le contenu du fichier**

Remplacer `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/page.tsx` par :

```typescript
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoadmapSpec } from "@/hooks/work/useRoadmap";
import { useDeleteSpec } from "@/hooks/work/useRoadmapMutations";
import { useWorkPage } from "@/hooks/work/useWorkPage";
import { useWorkPerms } from "@/hooks/work/useWorkPerms";
import SpecLegacyRenderer from "@/components/work/roadmap/SpecLegacyRenderer";
import ConfirmDialog from "@/components/work/roadmap/ConfirmDialog";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function SpecViewerPage({ params }: PageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const { hasPerm } = useWorkPerms();
  const canDelete = hasPerm("work.roadmap.delete");

  const { data: spec, isLoading, error } = useRoadmapSpec(slug);
  const deleteMut = useDeleteSpec();
  const [confirmDel, setConfirmDel] = useState(false);

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
      <div className="flex items-center justify-between">
        <Link
          href="/admin/work/roadmap"
          className="inline-flex text-sm text-erisclave-pink-deep hover:underline"
        >
          ← Retour roadmap
        </Link>
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold
                       bg-erisclave-red-ko/10 text-erisclave-red-ko
                       hover:bg-erisclave-red-ko/20
                       focus:outline-none focus:ring-2 focus:ring-erisclave-red-ko"
          >
            🗑 Supprimer ce spec
          </button>
        )}
      </div>

      {spec.kind === "legacy" && spec.rawHtml ? (
        <SpecLegacyRenderer rawHtml={spec.rawHtml} title={spec.title} />
      ) : spec.kind === "structured" ? (
        <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink">
          <p className="font-semibold mb-2">Spec structure</p>
          <p className="text-sm text-erisclave-ink-soft">
            Le rendu HTML des specs structures sera disponible en Phase 2b
            (Erisclave UI complete avec builder + html-renderer).
          </p>
        </div>
      ) : (
        <div className="bg-erisclave-cream rounded-2xl p-8 text-erisclave-ink-soft">
          Contenu vide.
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        title="Supprimer ce spec ?"
        message={`Spec : "${spec.title}"\nSlug : ${slug}\n\nCette action est irreversible. Le project lie restera intact.`}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        loading={deleteMut.isPending}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteMut.mutate(slug, {
            onSuccess: () => {
              setConfirmDel(false);
              router.push("/admin/work/roadmap");
            },
          });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run : `cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
cd EriniumFactionWeb
git add 'src/app/(admin)/admin/work/specs/[slug]/page.tsx'
git commit -m "feat(roadmap): bouton supprimer sur page spec viewer P2a"
```

---

## Task 21: Smoke test prod + checklist UI

**Files:** (aucun fichier modifié — pure validation)

Cette tâche valide que la P2a fonctionne bout-en-bout en production.

- [ ] **Step 1: Push la branche vers main (déclenche déploiement Vercel)**

```bash
cd "D:/Mods Minecraft/EriniumFaction/EriniumFactionWeb"
git push origin main
```

Attendre 1-2 min que Vercel déploie. Vérifier sur https://vercel.com/dashboard.

- [ ] **Step 2: Smoke API via curl**

PowerShell Windows (remplacer `<SESSION_COOKIE>` par la valeur du cookie de session du staff connecté) :

```powershell
$headers = @{ Cookie = "<SESSION_COOKIE>" }

# 1. GET liste
Invoke-WebRequest -Uri "https://eriniumfaction.vercel.app/api/work/v1/roadmap" -Headers $headers | Select-Object -ExpandProperty Content | Select-Object -First 500

# 2. POST create
$body = '{"title":"[smoke API] test","status":"todo","tags":["smoke"]}'
$resp = Invoke-WebRequest -Uri "https://eriniumfaction.vercel.app/api/work/v1/roadmap" -Method POST -Headers $headers -ContentType "application/json" -Body $body
$resp.Content
$created = ($resp.Content | ConvertFrom-Json).project
$projectId = $created.id

# 3. POST create task
$bodyT = '{"title":"task de smoke","status":"todo"}'
Invoke-WebRequest -Uri "https://eriniumfaction.vercel.app/api/work/v1/roadmap/projects/$projectId/tasks" -Method POST -Headers $headers -ContentType "application/json" -Body $bodyT

# 4. PATCH project
$bodyP = '{"title":"[smoke API] renamed"}'
Invoke-WebRequest -Uri "https://eriniumfaction.vercel.app/api/work/v1/roadmap/projects/$projectId" -Method PATCH -Headers $headers -ContentType "application/json" -Body $bodyP

# 5. DELETE project (cascade tasks)
Invoke-WebRequest -Uri "https://eriniumfaction.vercel.app/api/work/v1/roadmap/projects/$projectId" -Method DELETE -Headers $headers
```

Attendu : aucun 4xx/5xx. Le project créé est ensuite supprimé proprement.

- [ ] **Step 3: Smoke UI — checklist du spec §13**

Aller sur https://eriniumfaction.vercel.app/admin/work/roadmap et cocher 1 par 1 :

- [ ] Connexion staff → page charge avec ≥55 projects
- [ ] Click "+ Nouveau project" → modal s'ouvre vide
- [ ] Submit → card apparaît immédiatement en fin de liste
- [ ] Double-clic titre → input → modifier + Enter → titre change
- [ ] Bouton ✏️ → modal pre-remplie → modifier tags + sauver → card update
- [ ] StatusBadge → dropdown → choisir "En test" → couleur change immédiatement
- [ ] DnD project : drag une card → relâcher en nouvelle position → ordre persistant après F5
- [ ] Expand une card → list of tasks affichée
- [ ] TaskComposer → tape "Test task" + Enter → task apparaît
- [ ] Toggle checkbox → strike-through, persistant après F5
- [ ] DnD tasks : drag une task → relâcher → ordre persistant après F5
- [ ] Bouton 🗑 sur task au hover → confirm → task supprimée
- [ ] Bouton 🗑 sur card → confirm mentionne N tasks → cascade OK
- [ ] Bouton "🗑 Supprimer ce spec" sur viewer → confirm → redirect vers /roadmap

- [ ] **Step 4: Vérifier les logs Vercel**

Aller sur https://vercel.com/dashboard → projet → Logs (Runtime). Filter sur les routes `/api/work/v1/roadmap*`. Aucune 500 ne doit apparaître durant les 5 dernières minutes.

- [ ] **Step 5: Si tout passe — marquer P2a comme livré**

Ajouter une entrée dans `docs/knowissue.md` (submodule docs/) sous la date 2026-05-25 :

```markdown
### 2026-05-25 — Phase 2a Erisclave migration livrée

**Système :** Roadmap CRUD via Work Panel `/admin/work/roadmap`.

**Livré :**
- Création/édition/suppression projects via UI (modal + inline)
- Création/édition/suppression tasks via UI (inline + composer)
- DnD reorder projects et tasks
- Suppression specs depuis viewer
- 9 routes API REST + 9 hooks React Query optimistes

**Non livré (P2b) :**
- Builder structured (question-engine port TS)
- Création/édition de specs structured
- Live preview HTML

**Outils techniques :** @dnd-kit, optimistic updates avec rollback, zod validators.
```

Commit + push docs submodule + bump pointer parent :

```bash
cd "D:/Mods Minecraft/EriniumFaction/docs"
git add knowissue.md
git commit -m "knowissue: Phase 2a Erisclave migration livrée"
git push

cd "D:/Mods Minecraft/EriniumFaction"
git add docs
git commit -m "docs: bump pointer — Phase 2a livrée"
git push
```

- [ ] **Step 6: Si une étape rate**

Si un test du §13 échoue :
1. Identifier la task du plan qui implémente la fonctionnalité ratée.
2. Lire les logs Vercel pour les routes API.
3. Reproduire en local avec `pnpm dev`.
4. Fix dans le composant/route correspondant, commit avec message `fix(roadmap): <description>`.
5. Re-run le test après redéploiement.
6. Quand corrigé, documenter dans `docs/knowissue.md` (cause + fix).

---

## Self-Review (réalisée par l'auteur du plan)

**Spec coverage** : tous les items §3 du spec couverts par les tasks 1-21 :
- §3.1 Projects (create/edit inline/edit modal/delete/reorder/status) → Tasks 3, 4, 5, 13, 14, 17, 18, 19
- §3.2 Tasks (create/edit inline/toggle/delete/reorder) → Tasks 6, 7, 8, 15, 16, 17, 18
- §3.3 Specs delete → Tasks 9, 20

**Placeholder scan** : aucun TBD, aucun "TODO ajouter …", chaque step contient du code complet.

**Type consistency** :
- `order_idx` utilisé partout (jamais `order_index`)
- `ProjectStatus = todo|wip|test|done|blocked`, `TaskStatus = todo|done`
- Hooks renvoient `RoadmapProject` / `RoadmapTask` (camelCase TS) cohérents avec les routes
- `useUpdateTask` reçoit `{id, input, projectId}` — la prop `projectId` est utilisée par `onMutate` pour cibler la bonne `queryKey`
- `useDeleteTask` reçoit `{id, projectId}` (idem)
- `cardDragHandle` props sur `RoadmapCard` est optionnelle (read-only ne la passe pas)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-erisclave-migration-phase2a.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Je dispatche un fresh subagent (erinium-worker custom) par task avec spec compliance + code quality review entre chaque. Fast iteration.

**2. Inline Execution** — J'exécute les tasks dans cette session avec checkpoints.

**Quelle approche ?**
