# Phase 6b — Knowledge Base (KB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task with `erinium-worker` subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter au Work Panel staff le module Knowledge Base — base de connaissances hiérarchique (Spaces > Categories > Articles) avec versioning, restore, recherche full-text Postgres, et réutilisation 100% de l'éditeur Tiptap partagé livré en Phase 6a.

**Architecture :**
- DB déjà migrée en Phase 6a (`kb_spaces`, `kb_categories`, `kb_articles` avec `search_tsv` GENERATED via fonction wrapper IMMUTABLE, `kb_article_versions`). Permissions `kb.*` déjà seedées pour `admin` (CRUD) et `moderator/event_team/support/builder/default_staff` (read).
- Couche DB : helpers TypeScript dans `src/lib/work/kb/{types,queries,mutations,search}.ts`. Mutations encapsulent la logique versioning (snapshot avant update, increment current_version).
- Couche API : routes Next.js App Router dans `src/app/api/work/v1/kb/**/route.ts`. Toutes les mutations passent par `requireStaff(req, "kb.X")`, `sanitizeTiptapHtml`, `logAudit`.
- Couche UI : `/admin/work/kb` refonte en layout 3 colonnes (sidebar tree, liste articles, détail article). Hooks React Query dans `src/hooks/work/useKb.ts`. Composants dans `src/components/work/kb/`.

**Tech Stack :** Next.js 16 App Router / TypeScript strict / Postgres (Neon serverless HTTP) / Zod 4 / @tanstack/react-query / @tiptap/react v3 (réutilisé) / Tailwind / lucide-react.

**Source de vérité spec :** `docs/superpowers/specs/2026-05-26-phase6-announcements-kb-design.md` Section 5 (schémas DB), Section 7 (API endpoints), Section 10 (UI), Section 14 (perf/sécurité).

---

## File structure

**Created files :**
- `src/lib/work/kb/types.ts` — TypeScript types : KbSpace, KbCategory, KbArticle, KbArticleVersion, KbSearchResult.
- `src/lib/work/kb/queries.ts` — Read helpers (listSpaces, listCategoriesBySpace, listArticlesByCategory, getArticle, listVersions, getVersion).
- `src/lib/work/kb/mutations.ts` — Write helpers (create*, update*, soft-delete*, snapshotArticleVersion, restoreArticleVersion).
- `src/lib/work/kb/search.ts` — searchArticles (tsvector + ts_headline + ts_rank).
- `src/app/api/work/v1/kb/spaces/route.ts` — GET list + POST create.
- `src/app/api/work/v1/kb/spaces/[id]/route.ts` — PATCH + DELETE.
- `src/app/api/work/v1/kb/spaces/[id]/categories/route.ts` — GET categories d'un space.
- `src/app/api/work/v1/kb/categories/route.ts` — POST create.
- `src/app/api/work/v1/kb/categories/[id]/route.ts` — PATCH + DELETE.
- `src/app/api/work/v1/kb/categories/[id]/articles/route.ts` — GET articles d'une cat.
- `src/app/api/work/v1/kb/articles/route.ts` — POST create.
- `src/app/api/work/v1/kb/articles/[id]/route.ts` — GET + PATCH + DELETE.
- `src/app/api/work/v1/kb/articles/[id]/versions/route.ts` — GET liste versions.
- `src/app/api/work/v1/kb/articles/[id]/versions/[vno]/route.ts` — GET détail version.
- `src/app/api/work/v1/kb/articles/[id]/versions/[vno]/restore/route.ts` — POST restore.
- `src/app/api/work/v1/kb/search/route.ts` — GET search.
- `src/hooks/work/useKb.ts` — Hooks queries + mutations React Query.
- `src/components/work/kb/KbTreeSidebar.tsx` — Sidebar tree spaces/categories.
- `src/components/work/kb/KbArticleList.tsx` — Liste articles centre.
- `src/components/work/kb/KbArticleDetail.tsx` — Panneau détail droite.
- `src/components/work/kb/KbArticleEditModal.tsx` — Modal édition article (réutilise TiptapEditor).
- `src/components/work/kb/SpaceFormModal.tsx` — Modal create/edit space.
- `src/components/work/kb/CategoryFormModal.tsx` — Modal create/edit category.
- `src/components/work/kb/VersionHistoryModal.tsx` — Modal historique + restore.
- `src/components/work/kb/KbSearchBar.tsx` — Barre recherche + dropdown résultats.
- `scripts/smoke-phase6b-kb.ts` — Smoke test API end-to-end.

**Modified files :**
- `src/lib/work/validators.ts` — Ajouter schemas Zod KB (Space, Category, Article, list/search queries).
- `src/lib/db/index.ts` — Cleanup seeds legacy `kb_articles.*` perms orphelines.
- `src/app/(admin)/admin/work/kb/page.tsx` — Refonte EmptyState → page 3 colonnes complète.
- `docs/permissions.md` — Documenter les 4 perms `kb.*`.

---

## Conventions & contexte

**Permissions :**
- `kb.read` — lire (tous staff actifs)
- `kb.create` — créer space/category/article (admin only)
- `kb.update` — éditer + auto-versioning (admin only)
- `kb.delete` — soft-delete + restore version (admin only)

**Pattern API (déjà établi P2a/P2b/P6a, copier-coller) :**
```ts
export async function POST(req: NextRequest) {
  await initDb();
  const ctx = await requireStaff(req, "kb.create");
  if (!ctx.ok) return ctx.response;

  const body = await req.json().catch(() => ({}));
  const parsed = SomeCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });

  const sanitized = { ...parsed.data, body_html: sanitizeTiptapHtml(parsed.data.body_html) };
  const created = await createSomething(sanitized, ctx.user.id);

  await logAudit({
    actor_id: ctx.user.id,
    action: "kb.article.create",
    target_type: "kb_article",
    target_id: created.id,
    diff: { after: created },
    ip: ctx.ip,
    user_agent: ctx.userAgent,
  });

  return NextResponse.json(created, { status: 201 });
}
```

**Slug uniqueness :**
- `kb_spaces.slug` unique global.
- `kb_categories.slug` unique par space (UNIQUE space_id, slug).
- `kb_articles.slug` unique par category (UNIQUE category_id, slug).
- En cas de conflit à la création, l'API retourne `409 conflict` avec champ `field: "slug"`. Côté UI on génère le slug auto (lowercase, trim, replace [^a-z0-9-] → -), modifiable par l'admin.

**Snapshot versioning (T4) :**
- À chaque `updateArticle`, AVANT l'UPDATE de la row courante, INSERT dans `kb_article_versions` la version actuelle (title/body_html/tags/status, version_no = current_version, edited_by = previous updater).
- Puis UPDATE `kb_articles` SET ..., current_version = current_version + 1, updated_by = $editorId, updated_at = NOW().
- Transaction atomique (Neon HTTP : 1 round-trip via `sql.transaction([snapshotInsert, articleUpdate])`).

**Restore (T5) :**
- POST `/articles/[id]/versions/[vno]/restore` : snapshot la version courante actuelle dans `kb_article_versions`, puis copy le contenu de la version vno dans `kb_articles`, increment current_version.
- Idempotent non-trivial — chaque restore génère une nouvelle version. C'est voulu (audit complet).

---

## Backend (T1-T12)

### Task 1: Types TypeScript + Zod validators

**Files:**
- Create: `src/lib/work/kb/types.ts`
- Modify: `src/lib/work/validators.ts`

- [ ] **Step 1: Define TypeScript types**

Create `src/lib/work/kb/types.ts` with :

```ts
export interface KbSpace {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order_idx: number;
  created_by: number | null;
  created_at: string;  // ISO
  updated_at: string;
  deleted_at: string | null;
  categories_count?: number;  // populated only in list query
}

export interface KbCategory {
  id: number;
  space_id: number;
  slug: string;
  name: string;
  description: string | null;
  order_idx: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  articles_count?: number;
}

export interface KbArticle {
  id: number;
  category_id: number;
  slug: string;
  title: string;
  body_html: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  current_version: number;
  created_by: number | null;
  updated_by: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface KbArticleVersion {
  id: number;
  article_id: number;
  version_no: number;
  title: string;
  body_html: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  edited_by: number | null;
  edited_at: string;
  edited_by_name?: string;  // joined from users.discord_name
}

export interface KbSearchResult {
  article: KbArticle;
  space_name: string;
  category_name: string;
  headline: string;  // ts_headline
  rank: number;
}
```

- [ ] **Step 2: Add Zod schemas in validators.ts**

Append to `src/lib/work/validators.ts` :

```ts
const KbStatusEnum = z.enum(["draft", "published", "archived"]);
const Slug = z.string().min(1).max(80).regex(/^[a-z0-9-]+$/);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable();

export const KbSpaceCreateSchema = z.object({
  slug: Slug,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(80).optional().nullable(),
  color: HexColor,
  order_idx: z.number().int().min(0).optional().default(0),
});

export const KbSpacePatchSchema = KbSpaceCreateSchema.partial();

export const KbCategoryCreateSchema = z.object({
  space_id: z.number().int().positive(),
  slug: Slug,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  order_idx: z.number().int().min(0).optional().default(0),
});

export const KbCategoryPatchSchema = KbCategoryCreateSchema.partial();

export const KbArticleCreateSchema = z.object({
  category_id: z.number().int().positive(),
  slug: Slug,
  title: z.string().min(1).max(200),
  body_html: z.string().min(1).max(200_000),
  tags: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  status: KbStatusEnum.optional().default("draft"),
});

export const KbArticlePatchSchema = z.object({
  slug: Slug.optional(),
  title: z.string().min(1).max(200).optional(),
  body_html: z.string().min(1).max(200_000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  status: KbStatusEnum.optional(),
});

export const KbArticleListQuerySchema = z.object({
  status: KbStatusEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const KbSearchQuerySchema = z.object({
  q: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
```

- [ ] **Step 3: Verify TS compiles**

Run: `cd EriniumFactionWeb && rtk pnpm tsc --noEmit`
Expected: EXIT_CODE=0

- [ ] **Step 4: Commit**

```bash
git add src/lib/work/kb/types.ts src/lib/work/validators.ts
git commit -m "feat(work/kb): add types + zod validators (phase 6b T1)"
git push
```

---

### Task 2: DB helpers spaces (queries + mutations)

**Files:**
- Create: `src/lib/work/kb/queries.ts`, `src/lib/work/kb/mutations.ts`

- [ ] **Step 1: Create queries.ts with listSpaces + getSpaceById**

```ts
import { sql } from "@/lib/db";
import type { KbSpace, KbCategory, KbArticle, KbArticleVersion } from "./types";

export async function listSpaces(): Promise<KbSpace[]> {
  const rows = await sql`
    SELECT s.*,
           (SELECT COUNT(*)::int FROM kb_categories c
              WHERE c.space_id = s.id AND c.deleted_at IS NULL) AS categories_count
      FROM kb_spaces s
     WHERE s.deleted_at IS NULL
     ORDER BY s.order_idx ASC, s.created_at ASC
  `;
  return rows.map(toKbSpace);
}

export async function getSpaceById(id: number): Promise<KbSpace | null> {
  const rows = await sql`
    SELECT * FROM kb_spaces WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  return rows[0] ? toKbSpace(rows[0]) : null;
}

function toKbSpace(row: any): KbSpace {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    order_idx: row.order_idx,
    created_by: row.created_by !== null ? Number(row.created_by) : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    deleted_at: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at,
    categories_count: row.categories_count !== undefined ? Number(row.categories_count) : undefined,
  };
}
```

- [ ] **Step 2: Create mutations.ts with space CRUD**

```ts
import { sql } from "@/lib/db";
import type { KbSpace } from "./types";

export async function createSpace(
  data: { slug: string; name: string; description?: string | null; icon?: string | null; color?: string | null; order_idx?: number },
  creatorId: number
): Promise<KbSpace> {
  const rows = await sql`
    INSERT INTO kb_spaces (slug, name, description, icon, color, order_idx, created_by)
    VALUES (${data.slug}, ${data.name}, ${data.description ?? null}, ${data.icon ?? null}, ${data.color ?? null}, ${data.order_idx ?? 0}, ${creatorId})
    RETURNING *
  `;
  return toKbSpace(rows[0]);
}

export async function updateSpace(id: number, patch: Partial<KbSpace>): Promise<KbSpace | null> {
  // build dynamic SET — see existing pattern in src/lib/work/announcements/mutations.ts
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  if (patch.slug !== undefined) { fields.push(`slug = $${i++}`); values.push(patch.slug); }
  if (patch.name !== undefined) { fields.push(`name = $${i++}`); values.push(patch.name); }
  if (patch.description !== undefined) { fields.push(`description = $${i++}`); values.push(patch.description); }
  if (patch.icon !== undefined) { fields.push(`icon = $${i++}`); values.push(patch.icon); }
  if (patch.color !== undefined) { fields.push(`color = $${i++}`); values.push(patch.color); }
  if (patch.order_idx !== undefined) { fields.push(`order_idx = $${i++}`); values.push(patch.order_idx); }
  if (fields.length === 0) return getSpaceById(id);
  fields.push(`updated_at = NOW()`);
  const query = `UPDATE kb_spaces SET ${fields.join(", ")} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`;
  values.push(id);
  const rows = await sql(query, values);
  return rows[0] ? toKbSpace(rows[0]) : null;
}

export async function softDeleteSpace(id: number): Promise<boolean> {
  const rows = await sql`
    UPDATE kb_spaces SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = ${id} AND deleted_at IS NULL
     RETURNING id
  `;
  // also soft-delete cascade categories + articles
  if (rows.length > 0) {
    await sql`UPDATE kb_categories SET deleted_at = NOW() WHERE space_id = ${id} AND deleted_at IS NULL`;
    await sql`
      UPDATE kb_articles SET deleted_at = NOW()
       WHERE category_id IN (SELECT id FROM kb_categories WHERE space_id = ${id})
         AND deleted_at IS NULL
    `;
  }
  return rows.length > 0;
}
```

> **Important :** Si la signature `sql(query, values)` n'est pas supportée par le driver Neon HTTP utilisé dans le projet, regarder comment `src/lib/work/announcements/mutations.ts` fait ses updates dynamiques (probablement via plusieurs `sql\`...\`` séquentiels ou via `sql.unsafe`). Réutiliser le même pattern.

- [ ] **Step 3: Verify TS compiles**

Run: `rtk pnpm tsc --noEmit`
Expected: EXIT_CODE=0

- [ ] **Step 4: Commit**

```bash
git add src/lib/work/kb/queries.ts src/lib/work/kb/mutations.ts
git commit -m "feat(work/kb): add spaces queries + mutations (phase 6b T2)"
git push
```

---

### Task 3: DB helpers categories

**Files:**
- Modify: `src/lib/work/kb/queries.ts`, `src/lib/work/kb/mutations.ts`

- [ ] **Step 1: Add listCategoriesBySpace + getCategoryById in queries.ts**

```ts
export async function listCategoriesBySpace(spaceId: number): Promise<KbCategory[]> {
  const rows = await sql`
    SELECT c.*,
           (SELECT COUNT(*)::int FROM kb_articles a
              WHERE a.category_id = c.id AND a.deleted_at IS NULL) AS articles_count
      FROM kb_categories c
     WHERE c.space_id = ${spaceId} AND c.deleted_at IS NULL
     ORDER BY c.order_idx ASC, c.created_at ASC
  `;
  return rows.map(toKbCategory);
}

export async function getCategoryById(id: number): Promise<KbCategory | null> {
  const rows = await sql`SELECT * FROM kb_categories WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
  return rows[0] ? toKbCategory(rows[0]) : null;
}

function toKbCategory(row: any): KbCategory {
  return {
    id: Number(row.id),
    space_id: Number(row.space_id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    order_idx: row.order_idx,
    created_by: row.created_by !== null ? Number(row.created_by) : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    deleted_at: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at,
    articles_count: row.articles_count !== undefined ? Number(row.articles_count) : undefined,
  };
}
```

- [ ] **Step 2: Add createCategory, updateCategory, softDeleteCategory in mutations.ts**

Mirror the space helpers. `softDeleteCategory` cascade soft-delete les articles de la category.

- [ ] **Step 3: Verify TS compiles + commit**

```bash
rtk pnpm tsc --noEmit
git add src/lib/work/kb/queries.ts src/lib/work/kb/mutations.ts
git commit -m "feat(work/kb): add categories queries + mutations (phase 6b T3)"
git push
```

---

### Task 4: DB helpers articles avec versioning auto

**Files:**
- Modify: `src/lib/work/kb/queries.ts`, `src/lib/work/kb/mutations.ts`

- [ ] **Step 1: Add listArticlesByCategory + getArticleById in queries.ts**

```ts
export async function listArticlesByCategory(
  categoryId: number,
  opts: { status?: "draft" | "published" | "archived"; limit?: number; offset?: number } = {}
): Promise<KbArticle[]> {
  const { status, limit = 50, offset = 0 } = opts;
  const rows = status
    ? await sql`
        SELECT id, category_id, slug, title,
               LEFT(regexp_replace(body_html, '<[^>]+>', ' ', 'g'), 300) AS body_html,
               tags, status, current_version, created_by, updated_by,
               published_at, created_at, updated_at, deleted_at
          FROM kb_articles
         WHERE category_id = ${categoryId} AND status = ${status} AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT id, category_id, slug, title,
               LEFT(regexp_replace(body_html, '<[^>]+>', ' ', 'g'), 300) AS body_html,
               tags, status, current_version, created_by, updated_by,
               published_at, created_at, updated_at, deleted_at
          FROM kb_articles
         WHERE category_id = ${categoryId} AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT ${limit} OFFSET ${offset}
      `;
  return rows.map(toKbArticle);
}

export async function getArticleById(id: number): Promise<KbArticle | null> {
  const rows = await sql`SELECT * FROM kb_articles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
  return rows[0] ? toKbArticle(rows[0]) : null;
}

function toKbArticle(row: any): KbArticle { /* …same pattern as toKbSpace */ }
```

> Le `LEFT(regexp_replace(body_html, '<[^>]+>', ' ', 'g'), 300)` produit un excerpt pour la liste sans payload trop lourd. Le `GET /articles/[id]` retourne le `body_html` complet via getArticleById.

- [ ] **Step 2: Add createArticle in mutations.ts**

```ts
export async function createArticle(
  data: { category_id: number; slug: string; title: string; body_html: string; tags?: string[]; status?: "draft" | "published" | "archived" },
  creatorId: number
): Promise<KbArticle> {
  const status = data.status ?? "draft";
  const publishedAt = status === "published" ? sql`NOW()` : sql`NULL`;
  const rows = await sql`
    INSERT INTO kb_articles (category_id, slug, title, body_html, tags, status, current_version, created_by, updated_by, published_at)
    VALUES (${data.category_id}, ${data.slug}, ${data.title}, ${data.body_html}, ${data.tags ?? []}, ${status}, 1, ${creatorId}, ${creatorId}, ${publishedAt})
    RETURNING *
  `;
  return toKbArticle(rows[0]);
}
```

- [ ] **Step 3: Add updateArticle with snapshot + version increment**

```ts
export async function updateArticle(
  id: number,
  patch: Partial<{ slug: string; title: string; body_html: string; tags: string[]; status: "draft" | "published" | "archived" }>,
  editorId: number
): Promise<KbArticle | null> {
  // 1. fetch current row
  const current = await getArticleById(id);
  if (!current) return null;

  // 2. snapshot current state in kb_article_versions
  await sql`
    INSERT INTO kb_article_versions (article_id, version_no, title, body_html, tags, status, edited_by)
    VALUES (${id}, ${current.current_version}, ${current.title}, ${current.body_html}, ${current.tags}, ${current.status}, ${current.updated_by})
    ON CONFLICT (article_id, version_no) DO NOTHING
  `;

  // 3. determine new values
  const newTitle = patch.title ?? current.title;
  const newSlug = patch.slug ?? current.slug;
  const newBodyHtml = patch.body_html ?? current.body_html;
  const newTags = patch.tags ?? current.tags;
  const newStatus = patch.status ?? current.status;
  const newPublishedAt =
    newStatus === "published" && current.status !== "published" ? new Date().toISOString() : current.published_at;

  // 4. update with current_version + 1
  const rows = await sql`
    UPDATE kb_articles
       SET slug = ${newSlug},
           title = ${newTitle},
           body_html = ${newBodyHtml},
           tags = ${newTags},
           status = ${newStatus},
           current_version = current_version + 1,
           updated_by = ${editorId},
           updated_at = NOW(),
           published_at = ${newPublishedAt}
     WHERE id = ${id} AND deleted_at IS NULL
     RETURNING *
  `;
  return rows[0] ? toKbArticle(rows[0]) : null;
}
```

> Note : on snapshot AVANT l'update — si l'INSERT échoue (conflit unique), on swallow via `ON CONFLICT DO NOTHING` (édge case rare : update concurrent qui aurait déjà snapshot la même version). C'est OK car last-write-wins en v1 selon spec Section 14.2.

- [ ] **Step 4: Add softDeleteArticle**

```ts
export async function softDeleteArticle(id: number): Promise<boolean> {
  const rows = await sql`
    UPDATE kb_articles SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = ${id} AND deleted_at IS NULL
     RETURNING id
  `;
  return rows.length > 0;
}
```

- [ ] **Step 5: Verify TS compiles + commit**

```bash
rtk pnpm tsc --noEmit
git add src/lib/work/kb/queries.ts src/lib/work/kb/mutations.ts
git commit -m "feat(work/kb): add articles queries + mutations with versioning (phase 6b T4)"
git push
```

---

### Task 5: DB helpers versions (list + get + restore)

**Files:**
- Modify: `src/lib/work/kb/queries.ts`, `src/lib/work/kb/mutations.ts`

- [ ] **Step 1: Add listVersions + getVersion in queries.ts**

```ts
export async function listVersions(articleId: number, limit = 50, offset = 0): Promise<KbArticleVersion[]> {
  const rows = await sql`
    SELECT v.id, v.article_id, v.version_no, v.title,
           LEFT(regexp_replace(v.body_html, '<[^>]+>', ' ', 'g'), 200) AS body_html,
           v.tags, v.status, v.edited_by, v.edited_at,
           u.discord_name AS edited_by_name
      FROM kb_article_versions v
      LEFT JOIN users u ON u.id = v.edited_by
     WHERE v.article_id = ${articleId}
     ORDER BY v.version_no DESC
     LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(toKbArticleVersion);
}

export async function getVersion(articleId: number, versionNo: number): Promise<KbArticleVersion | null> {
  const rows = await sql`
    SELECT v.*, u.discord_name AS edited_by_name
      FROM kb_article_versions v
      LEFT JOIN users u ON u.id = v.edited_by
     WHERE v.article_id = ${articleId} AND v.version_no = ${versionNo}
     LIMIT 1
  `;
  return rows[0] ? toKbArticleVersion(rows[0]) : null;
}
```

- [ ] **Step 2: Add restoreArticleVersion in mutations.ts**

```ts
export async function restoreArticleVersion(
  articleId: number,
  versionNo: number,
  editorId: number
): Promise<KbArticle | null> {
  // 1. load the target version
  const target = await getVersion(articleId, versionNo);
  if (!target) return null;

  // 2. load current state
  const current = await getArticleById(articleId);
  if (!current) return null;

  // 3. snapshot current state in versions (so restore-of-restore is fully traceable)
  await sql`
    INSERT INTO kb_article_versions (article_id, version_no, title, body_html, tags, status, edited_by)
    VALUES (${articleId}, ${current.current_version}, ${current.title}, ${current.body_html}, ${current.tags}, ${current.status}, ${current.updated_by})
    ON CONFLICT (article_id, version_no) DO NOTHING
  `;

  // 4. copy target version's content over current row
  const rows = await sql`
    UPDATE kb_articles
       SET title = ${target.title},
           body_html = ${target.body_html},
           tags = ${target.tags},
           status = ${target.status},
           current_version = current_version + 1,
           updated_by = ${editorId},
           updated_at = NOW()
     WHERE id = ${articleId} AND deleted_at IS NULL
     RETURNING *
  `;
  return rows[0] ? toKbArticle(rows[0]) : null;
}
```

- [ ] **Step 3: Commit**

```bash
rtk pnpm tsc --noEmit
git add src/lib/work/kb/queries.ts src/lib/work/kb/mutations.ts
git commit -m "feat(work/kb): add versions listing + restore mutation (phase 6b T5)"
git push
```

---

### Task 6: DB helpers search (tsvector + headline + rank)

**Files:**
- Create: `src/lib/work/kb/search.ts`

- [ ] **Step 1: Create search.ts**

```ts
import { sql } from "@/lib/db";
import type { KbArticle, KbSearchResult } from "./types";

export async function searchArticles(q: string, limit = 20): Promise<KbSearchResult[]> {
  // websearch_to_tsquery handles user-friendly syntax (quotes, OR, -minus)
  const rows = await sql`
    SELECT a.*,
           s.name AS space_name,
           c.name AS category_name,
           ts_headline('french',
             regexp_replace(a.body_html, '<[^>]+>', ' ', 'g'),
             websearch_to_tsquery('french', ${q}),
             'MaxFragments=2, MaxWords=20, MinWords=5, ShortWord=3, HighlightAll=false'
           ) AS headline,
           ts_rank(a.search_tsv, websearch_to_tsquery('french', ${q})) AS rank
      FROM kb_articles a
      JOIN kb_categories c ON c.id = a.category_id
      JOIN kb_spaces s ON s.id = c.space_id
     WHERE a.deleted_at IS NULL
       AND a.status = 'published'
       AND a.search_tsv @@ websearch_to_tsquery('french', ${q})
     ORDER BY rank DESC, a.updated_at DESC
     LIMIT ${limit}
  `;
  return rows.map(row => ({
    article: toKbArticle(row),
    space_name: row.space_name,
    category_name: row.category_name,
    headline: row.headline,
    rank: Number(row.rank),
  }));
}
```

> Only search published articles (drafts/archives non visibles dans search global). Le check `kb.read` au niveau route est l'autorisation suffisante (tous staff ont `kb.read`).

- [ ] **Step 2: Commit**

```bash
rtk pnpm tsc --noEmit
git add src/lib/work/kb/search.ts
git commit -m "feat(work/kb): add fulltext search via websearch_to_tsquery + ts_headline (phase 6b T6)"
git push
```

---

### Task 7: Routes API spaces

**Files:**
- Create: `src/app/api/work/v1/kb/spaces/route.ts`
- Create: `src/app/api/work/v1/kb/spaces/[id]/route.ts`
- Create: `src/app/api/work/v1/kb/spaces/[id]/categories/route.ts`

- [ ] **Step 1: Implement /kb/spaces (GET list + POST create)**

```ts
// src/app/api/work/v1/kb/spaces/route.ts
import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { requireStaff } from "@/lib/work/permissions";
import { logAudit } from "@/lib/work/audit";
import { listSpaces } from "@/lib/work/kb/queries";
import { createSpace } from "@/lib/work/kb/mutations";
import { KbSpaceCreateSchema } from "@/lib/work/validators";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await initDb();
  const ctx = await requireStaff(req, "kb.read");
  if (!ctx.ok) return ctx.response;
  const spaces = await listSpaces();
  return NextResponse.json({ spaces });
}

export async function POST(req: NextRequest) {
  await initDb();
  const ctx = await requireStaff(req, "kb.create");
  if (!ctx.ok) return ctx.response;
  const body = await req.json().catch(() => ({}));
  const parsed = KbSpaceCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  try {
    const space = await createSpace(parsed.data, ctx.user.id);
    await logAudit({
      actor_id: ctx.user.id,
      action: "kb.space.create",
      target_type: "kb_space",
      target_id: space.id,
      diff: { after: space },
      ip: ctx.ip,
      user_agent: ctx.userAgent,
    });
    return NextResponse.json(space, { status: 201 });
  } catch (err: any) {
    if (err?.code === "23505") return NextResponse.json({ error: "conflict", field: "slug" }, { status: 409 });
    throw err;
  }
}
```

- [ ] **Step 2: Implement /kb/spaces/[id] (PATCH + DELETE)**

PATCH appelle `updateSpace`, fetch before/after pour le diff audit. DELETE appelle `softDeleteSpace`.

- [ ] **Step 3: Implement /kb/spaces/[id]/categories (GET list categories d'un space)**

```ts
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const ctx = await requireStaff(req, "kb.read");
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  const categories = await listCategoriesBySpace(Number(id));
  return NextResponse.json({ categories });
}
```

- [ ] **Step 4: Verify TS + commit**

```bash
rtk pnpm tsc --noEmit
git add src/app/api/work/v1/kb/spaces/
git commit -m "feat(api/kb): add spaces routes (list/create/patch/delete + categories) (phase 6b T7)"
git push
```

---

### Task 8: Routes API categories

**Files:**
- Create: `src/app/api/work/v1/kb/categories/route.ts` (POST create)
- Create: `src/app/api/work/v1/kb/categories/[id]/route.ts` (PATCH + DELETE)
- Create: `src/app/api/work/v1/kb/categories/[id]/articles/route.ts` (GET articles)

Mirror Task 7 patterns. Use `KbCategoryCreateSchema` / `KbCategoryPatchSchema` / `KbArticleListQuerySchema`.

- [ ] **Step 1: Implement POST /kb/categories (verify space_id exists)**
- [ ] **Step 2: Implement /kb/categories/[id] PATCH + DELETE**
- [ ] **Step 3: Implement /kb/categories/[id]/articles with status filter**
- [ ] **Step 4: Verify TS + commit**

```bash
git commit -m "feat(api/kb): add categories routes (create/patch/delete + articles) (phase 6b T8)"
```

---

### Task 9: Routes API articles

**Files:**
- Create: `src/app/api/work/v1/kb/articles/route.ts` (POST)
- Create: `src/app/api/work/v1/kb/articles/[id]/route.ts` (GET + PATCH + DELETE)

- [ ] **Step 1: POST /kb/articles**

Sanitize `body_html` via `sanitizeTiptapHtml` avant insert. Handle conflict 409 sur (category_id, slug).

- [ ] **Step 2: GET /kb/articles/[id]**

Renvoyer l'article complet + les 5 dernières versions (metadata seulement, pas le body_html complet pour économiser payload) :

```ts
const article = await getArticleById(Number(id));
if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });
const recentVersions = await listVersions(article.id, 5, 0);
return NextResponse.json({ article, recent_versions: recentVersions });
```

- [ ] **Step 3: PATCH /kb/articles/[id]**

Sanitize body_html si présent. Appelle `updateArticle(id, patch, ctx.user.id)`. Audit `kb.article.update` avec diff before/after.

- [ ] **Step 4: DELETE /kb/articles/[id]**

Appelle `softDeleteArticle`. Audit `kb.article.delete`.

- [ ] **Step 5: Verify TS + commit**

```bash
git commit -m "feat(api/kb): add articles routes (create/get/update/delete) (phase 6b T9)"
```

---

### Task 10: Routes API versions + restore

**Files:**
- Create: `src/app/api/work/v1/kb/articles/[id]/versions/route.ts` (GET liste)
- Create: `src/app/api/work/v1/kb/articles/[id]/versions/[vno]/route.ts` (GET détail)
- Create: `src/app/api/work/v1/kb/articles/[id]/versions/[vno]/restore/route.ts` (POST)

- [ ] **Step 1: GET versions (paginated)**

Query params : `limit` (default 50), `offset` (default 0). Return `{ versions, total }` avec total via `SELECT COUNT(*)`.

- [ ] **Step 2: GET version détail (full body_html)**

Sépare ce path du GET liste pour ne pas charger le body de toutes les versions inutilement.

- [ ] **Step 3: POST restore**

```ts
const restored = await restoreArticleVersion(Number(id), Number(vno), ctx.user.id);
if (!restored) return NextResponse.json({ error: "not_found" }, { status: 404 });
await logAudit({ actor_id: ctx.user.id, action: "kb.article.restore", target_type: "kb_article", target_id: restored.id, diff: { restored_from_version: Number(vno) }, ip: ctx.ip, user_agent: ctx.userAgent });
return NextResponse.json(restored);
```

> Permission `kb.delete` requise (restore peut écraser du contenu).

- [ ] **Step 4: Verify TS + commit**

```bash
git commit -m "feat(api/kb): add versions routes (list/get/restore) (phase 6b T10)"
```

---

### Task 11: Route API search

**Files:**
- Create: `src/app/api/work/v1/kb/search/route.ts`

- [ ] **Step 1: Implement GET /kb/search**

```ts
export async function GET(req: NextRequest) {
  await initDb();
  const ctx = await requireStaff(req, "kb.read");
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const parsed = KbSearchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query", details: parsed.error.flatten() }, { status: 400 });
  const results = await searchArticles(parsed.data.q, parsed.data.limit);
  return NextResponse.json({ results });
}
```

- [ ] **Step 2: Verify TS + commit**

```bash
git commit -m "feat(api/kb): add fulltext search route (phase 6b T11)"
```

---

### Task 12: Smoke test script KB end-to-end

**Files:**
- Create: `scripts/smoke-phase6b-kb.ts`

- [ ] **Step 1: Script Node TS qui chaîne CRUD complet**

Le script doit :

1. Lire `SMOKE_BASE_URL` + `SMOKE_AUTH_COOKIE` (env vars). Sinon abort.
2. POST `/api/work/v1/kb/spaces` → assert 201, capture space.id.
3. POST `/api/work/v1/kb/categories` (space_id) → assert 201, capture cat.id.
4. POST `/api/work/v1/kb/articles` (category_id, status=published) → assert 201, capture article.id, current_version=1.
5. GET `/api/work/v1/kb/articles/[id]` → assert article + recent_versions=[].
6. PATCH `/api/work/v1/kb/articles/[id]` body modifié → assert current_version=2.
7. GET `/api/work/v1/kb/articles/[id]/versions` → assert 1 version (v1 archived).
8. GET `/api/work/v1/kb/articles/[id]/versions/1` → assert body identique au body initial.
9. POST `/api/work/v1/kb/articles/[id]/versions/1/restore` → assert article.body_html identique au body initial, current_version=3.
10. GET `/api/work/v1/kb/search?q=<mot du body>` → assert au moins 1 résultat avec headline.
11. DELETE `/api/work/v1/kb/articles/[id]` → assert 204.
12. DELETE `/api/work/v1/kb/categories/[id]` → assert 204.
13. DELETE `/api/work/v1/kb/spaces/[id]` → assert 204.
14. GET `/api/work/v1/kb/spaces` → assert space supprimé absent.

S'inspirer fortement de `scripts/smoke-phase6a-announcements.ts` pour le pattern d'auth + assertions.

- [ ] **Step 2: Add script to package.json**

```json
"smoke:phase6b-kb": "tsx scripts/smoke-phase6b-kb.ts"
```

- [ ] **Step 3: Verify TS + commit**

```bash
rtk pnpm tsc --noEmit
git add scripts/smoke-phase6b-kb.ts package.json
git commit -m "test(work/kb): add end-to-end smoke test script (phase 6b T12)"
git push
```

---

## Frontend (T13-T22)

### Task 13: Hooks React Query queries

**Files:**
- Create: `src/hooks/work/useKb.ts`

- [ ] **Step 1: Define 6 query hooks**

```ts
import { useQuery } from "@tanstack/react-query";
import type { KbSpace, KbCategory, KbArticle, KbArticleVersion, KbSearchResult } from "@/lib/work/kb/types";

const fetchJson = async <T>(url: string): Promise<T> => {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

export function useKbSpaces() {
  return useQuery({
    queryKey: ["kb", "spaces"],
    queryFn: () => fetchJson<{ spaces: KbSpace[] }>("/api/work/v1/kb/spaces").then(d => d.spaces),
  });
}

export function useKbCategories(spaceId: number | null) {
  return useQuery({
    queryKey: ["kb", "spaces", spaceId, "categories"],
    queryFn: () => fetchJson<{ categories: KbCategory[] }>(`/api/work/v1/kb/spaces/${spaceId}/categories`).then(d => d.categories),
    enabled: spaceId !== null,
  });
}

export function useKbArticles(categoryId: number | null, status?: "draft" | "published" | "archived") {
  return useQuery({
    queryKey: ["kb", "categories", categoryId, "articles", status ?? "all"],
    queryFn: () => {
      const qs = status ? `?status=${status}` : "";
      return fetchJson<{ articles: KbArticle[] }>(`/api/work/v1/kb/categories/${categoryId}/articles${qs}`).then(d => d.articles);
    },
    enabled: categoryId !== null,
  });
}

export function useKbArticle(articleId: number | null) {
  return useQuery({
    queryKey: ["kb", "articles", articleId],
    queryFn: () => fetchJson<{ article: KbArticle; recent_versions: KbArticleVersion[] }>(`/api/work/v1/kb/articles/${articleId}`),
    enabled: articleId !== null,
  });
}

export function useKbVersions(articleId: number | null) {
  return useQuery({
    queryKey: ["kb", "articles", articleId, "versions"],
    queryFn: () => fetchJson<{ versions: KbArticleVersion[] }>(`/api/work/v1/kb/articles/${articleId}/versions`).then(d => d.versions),
    enabled: articleId !== null,
  });
}

export function useKbSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["kb", "search", query],
    queryFn: () => fetchJson<{ results: KbSearchResult[] }>(`/api/work/v1/kb/search?q=${encodeURIComponent(query)}`).then(d => d.results),
    enabled: enabled && query.length >= 2,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Verify TS + commit**

```bash
git commit -m "feat(hooks/kb): add 6 query hooks (phase 6b T13)"
```

---

### Task 14: Hooks mutations

**Files:**
- Modify: `src/hooks/work/useKb.ts`

- [ ] **Step 1: Add 13 mutation hooks**

Pattern à reproduire (similaire à `src/hooks/work/useAnnouncements.ts`) :

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateKbSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<KbSpace>) => fetch("/api/work/v1/kb/spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    }).then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb", "spaces"] }),
  });
}
```

Hooks à créer :
1. `useCreateKbSpace`
2. `useUpdateKbSpace`
3. `useDeleteKbSpace`
4. `useCreateKbCategory`
5. `useUpdateKbCategory`
6. `useDeleteKbCategory`
7. `useCreateKbArticle`
8. `useUpdateKbArticle` (PATCH `/api/work/v1/kb/articles/[id]`)
9. `useDeleteKbArticle`
10. `useRestoreKbVersion` (POST restore)

Chaque hook invalide les query keys impactées.

- [ ] **Step 2: Verify TS + commit**

```bash
git commit -m "feat(hooks/kb): add 10 mutation hooks (phase 6b T14)"
```

---

### Task 15: KbTreeSidebar component

**Files:**
- Create: `src/components/work/kb/KbTreeSidebar.tsx`

- [ ] **Step 1: Implement tree UI**

- Affiche la liste des spaces (`useKbSpaces`).
- Pour chaque space : icon + name + chevron expand/collapse, bouton "+" (gated `kb.create`).
- Quand expand : appelle `useKbCategories(spaceId)`, liste les categories sous le space (indent 16px).
- Quand category cliquée : appelle `onSelectCategory(category)` (callback prop).
- Bouton "+" sur space → ouvre `CategoryFormModal` avec `space_id` pré-rempli.
- Bouton "+" en haut du sidebar → ouvre `SpaceFormModal`.
- État expansion local (Map<number, boolean>) ou persisté dans localStorage.

Props :
```ts
interface KbTreeSidebarProps {
  selectedCategoryId: number | null;
  onSelectCategory: (cat: KbCategory) => void;
  canCreate: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(ui/kb): add KbTreeSidebar component (phase 6b T15)"
```

---

### Task 16: KbArticleList component

**Files:**
- Create: `src/components/work/kb/KbArticleList.tsx`

- [ ] **Step 1: Implement list**

Props :
```ts
interface KbArticleListProps {
  categoryId: number | null;
  selectedArticleId: number | null;
  onSelectArticle: (article: KbArticle) => void;
  canCreate: boolean;
}
```

UI :
- En haut : sélecteur status (All / Draft / Published / Archived) + bouton "+ Nouvel article" (gated).
- Liste : pour chaque article, carte avec :
  - Titre (font medium).
  - Badge status coloré (draft = gray, published = green, archived = amber).
  - Tags chips (premiers 3 + "+N" si plus).
  - Excerpt 100 chars (déjà stripped côté API).
  - Date relative (updated_at).
- Carte sélectionnée : background highlight + border accent.
- État vide : "Aucun article dans cette catégorie. Créez-en un pour commencer."

Hook : `useKbArticles(categoryId, status)`.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(ui/kb): add KbArticleList component (phase 6b T16)"
```

---

### Task 17: KbArticleDetail component

**Files:**
- Create: `src/components/work/kb/KbArticleDetail.tsx`

- [ ] **Step 1: Implement detail panel**

Props :
```ts
interface KbArticleDetailProps {
  articleId: number | null;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onOpenHistory: () => void;
  onDelete: () => void;
}
```

UI :
- Empty state si articleId === null : "Sélectionnez un article pour le consulter."
- Sinon (`useKbArticle(articleId)`) :
  - Header : titre + badge status + tags chips + boutons "Éditer" / "Historique" / "Supprimer" (gated).
  - Metadata : auteur (avatar + name) + date publication + last update + version courante.
  - Body : `<div dangerouslySetInnerHTML={{ __html: article.body_html }} className="kb-prose" />` (body déjà sanitize en DB).
  - Section "Versions récentes" en bas : 5 dernières versions metadata cliquables (ouvre `VersionHistoryModal`).

- [ ] **Step 2: Add `.kb-prose` Tailwind typography styles**

Soit utiliser `@tailwindcss/typography` (vérifier si installé), soit CSS dédié dans `globals.css` pour styler h1/h2/p/code/table dans le body rendu.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui/kb): add KbArticleDetail component (phase 6b T17)"
```

---

### Task 18: KbArticleEditModal (TiptapEditor reuse)

**Files:**
- Create: `src/components/work/kb/KbArticleEditModal.tsx`

- [ ] **Step 1: Implement modal**

Props :
```ts
interface KbArticleEditModalProps {
  open: boolean;
  mode: "create" | "edit";
  categoryId: number;  // pour create
  article?: KbArticle;  // pour edit
  onClose: () => void;
}
```

UI :
- Modal large (max-w-5xl) avec :
  - Champ titre (input text).
  - Champ slug (input text, auto-généré depuis titre en create).
  - Champ tags (multi-input chips — chaque tag = chip avec X).
  - Champ status (select : draft / published / archived).
  - **`<TiptapEditor value={bodyHtml} onChange={setBodyHtml} />`** — réutilisation directe de l'éditeur Phase 6a (`src/components/work/editor/TiptapEditor.tsx`).
  - Footer : bouton "Annuler" + "Enregistrer" (loading state pendant mutation).
- Mode create : utilise `useCreateKbArticle`. Mode edit : utilise `useUpdateKbArticle`.
- Validation client basique : titre non vide, slug regex `/^[a-z0-9-]+$/`, body non vide.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(ui/kb): add KbArticleEditModal with TiptapEditor reuse (phase 6b T18)"
```

---

### Task 19: SpaceFormModal + CategoryFormModal

**Files:**
- Create: `src/components/work/kb/SpaceFormModal.tsx`
- Create: `src/components/work/kb/CategoryFormModal.tsx`

- [ ] **Step 1: SpaceFormModal**

Champs : slug, name, description, icon (text input), color (color picker), order_idx. Mode create/edit.

- [ ] **Step 2: CategoryFormModal**

Champs : space_id (pré-rempli, readonly en create depuis sidebar), slug, name, description, order_idx.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui/kb): add SpaceFormModal + CategoryFormModal (phase 6b T19)"
```

---

### Task 20: VersionHistoryModal

**Files:**
- Create: `src/components/work/kb/VersionHistoryModal.tsx`

- [ ] **Step 1: Implement modal**

Props :
```ts
interface VersionHistoryModalProps {
  open: boolean;
  articleId: number;
  currentVersion: number;
  canRestore: boolean;
  onClose: () => void;
}
```

UI :
- Hook `useKbVersions(articleId)`.
- Liste chronologique inverse (version_no DESC).
- Pour chaque version : version_no, edited_by_name, edited_at relative, status badge, excerpt body (déjà stripped).
- Bouton "Restaurer" par version (gated `kb.delete` via prop canRestore). Confirm dialog avant restore.
- Optionnel v1 : bouton "Voir le détail" qui fetch `/versions/[vno]` et affiche le body complet en preview readonly. Si trop de scope, skip pour v1.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(ui/kb): add VersionHistoryModal with restore (phase 6b T20)"
```

---

### Task 21: KbSearchBar + résultats dropdown

**Files:**
- Create: `src/components/work/kb/KbSearchBar.tsx`

- [ ] **Step 1: Implement search bar**

- Input avec debounce 300ms (`useDeferredValue` ou setTimeout).
- Quand `query.length >= 2` et focus : appel `useKbSearch(query, true)`.
- Dropdown affiche jusqu'à 20 résultats :
  - Headline (avec balises `<mark>` pour mettre en valeur — le `ts_headline` Postgres ajoute des `<mark>` par défaut, on les conserve via `dangerouslySetInnerHTML` car contenu déjà sanitize côté DB).
  - Espace > Catégorie > Titre article.
  - Click → callback `onSelectArticle(article)` qui ouvre le détail.
- État vide : "Aucun résultat pour <query>".
- Loading state.
- Esc pour fermer le dropdown.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(ui/kb): add KbSearchBar with dropdown results (phase 6b T21)"
```

---

### Task 22: Page refonte /admin/work/kb (3 colonnes)

**Files:**
- Modify: `src/app/(admin)/admin/work/kb/page.tsx`

- [ ] **Step 1: Replace EmptyState with full page**

Layout 3 colonnes :
```
+-----------------+-----------------+--------------------+
| KbTreeSidebar   | KbArticleList   | KbArticleDetail    |
| (w-72)          | (w-96)          | (flex-1)           |
|                 |                 |                    |
+-----------------+-----------------+--------------------+
```

Header en haut avec :
- Titre "Knowledge Base"
- `<KbSearchBar />` à droite (centré, max-w-md)

State local :
- `selectedSpaceId`, `selectedCategoryId`, `selectedArticleId`.
- `editModalState` (create | edit | null) + `articleBeingEdited`.
- `spaceModalState`, `categoryModalState`.
- `versionHistoryOpen`.

Permissions :
- `canCreate = perms.includes("kb.create")` (via context `useStaffPermissions` ou similaire).
- `canUpdate = perms.includes("kb.update")`.
- `canDelete = perms.includes("kb.delete")`.

Wire callbacks :
- KbTreeSidebar → onSelectCategory → setSelectedCategoryId + clear selectedArticleId.
- KbArticleList → onSelectArticle → setSelectedArticleId.
- KbArticleDetail → onEdit → openEditModal + onDelete → confirm + mutation.
- KbSearchBar → onSelectArticle → setSelectedArticleId + scroll/highlight article in list si dans même cat.

- [ ] **Step 2: Verify build + commit**

```bash
rtk pnpm tsc --noEmit
git add src/app/(admin)/admin/work/kb/page.tsx
git commit -m "feat(ui/kb): refonte page /admin/work/kb in 3-column layout (phase 6b T22)"
git push
```

---

## Cleanup + livraison (T23-T24)

### Task 23: Cleanup legacy seeds + update permissions.md

**Files:**
- Modify: `src/lib/db/index.ts`
- Modify: `docs/permissions.md`

- [ ] **Step 1: Locate legacy kb_articles.* seeds in initDb**

Chercher dans `src/lib/db/index.ts` (lignes ~880-1040 selon spec Section 16) les blocs qui insèrent les perms `kb_articles.create / read / update / delete`. Vérifier d'abord avec `grep` qu'aucun `requireStaff(..., "kb_articles.X")` ne reste dans le code :

```bash
rtk grep "kb_articles\\." src/
```

Si 0 résultat hors initDb et hors migrations historiques → safe to remove.

- [ ] **Step 2: Remove the legacy seed blocks**

Remplacer par un commentaire :
```ts
// NOTE : les anciens seeds `kb_articles.*` (feature stub jamais buildee)
// ont ete supprimes ici. Les vraies perms sont `kb.*` (cf. Phase 6b)
// seedees plus bas dans le bloc Phase 7 alias Phase 6 fonctionnel.
```

- [ ] **Step 3: Update docs/permissions.md**

Ajouter section KB sous Annonces :

```markdown
### Knowledge Base

| Permission   | Description                                       | Rôles seedés |
|--------------|---------------------------------------------------|--------------|
| `kb.read`    | Lire les articles                                 | admin, moderator, event_team, support, builder, default_staff |
| `kb.create`  | Créer space / category / article                  | admin |
| `kb.update`  | Éditer (versioning auto)                          | admin |
| `kb.delete`  | Soft-delete article / restore version             | admin |
```

- [ ] **Step 4: Verify build + commit**

```bash
rtk pnpm tsc --noEmit
git add src/lib/db/index.ts ../docs/permissions.md
git commit -m "chore(work/kb): cleanup legacy kb_articles.* seeds + document kb.* perms (phase 6b T23)"
git push
```

> Commit docs/permissions.md séparément dans le submodule docs si nécessaire (suivre le pattern knowissue.md : `cd docs && git add permissions.md && commit && push && cd .. && git add docs && commit && push`).

---

### Task 24: Smoke test prod + UI validation (GATE USER)

**Files:** aucune modif code, validation manuelle.

- [ ] **Step 1: Run smoke script contre prod**

```bash
SMOKE_BASE_URL=https://eriniumfaction.vercel.app \
SMOKE_AUTH_COOKIE="<staff admin cookie>" \
rtk pnpm smoke:phase6b-kb
```

Expected : tous les asserts pass, exit 0.

- [ ] **Step 2: Manual UI checklist (USER GATE)**

Tester sur `https://eriniumfaction.vercel.app/admin/work/kb` :

1. Page affiche layout 3 colonnes.
2. Bouton "+ Nouvel espace" ouvre SpaceFormModal — création OK.
3. Sidebar liste le nouveau space, expand affiche "Aucune catégorie".
4. Bouton "+" sur le space ouvre CategoryFormModal — création OK.
5. Click sur la catégorie → colonne centre montre "Aucun article".
6. Bouton "+ Nouvel article" ouvre KbArticleEditModal — création OK avec body Tiptap riche (image, table, code-block).
7. Article apparaît dans la liste avec status badge.
8. Click article → colonne droite affiche détail + body rendu correctement.
9. Click "Éditer" → modal pré-rempli — modification → save → current_version incrementé.
10. Click "Historique" → modal liste v1 → bouton "Restaurer" → confirmation → article restauré.
11. Search bar : taper 2+ chars d'un mot du body → résultats avec headline `<mark>` highlight.
12. Click un résultat search → ouvre le détail article.
13. Suppression article → soft-delete OK, article disparaît de la liste.
14. Suppression category → soft-delete OK, articles cascade.
15. Suppression space → soft-delete OK, categories + articles cascade.
16. Refresh page : état persisté (rien ne réapparaît).
17. Tester avec un user non-admin (ex: moderator) : boutons create/edit/delete cachés, seul read fonctionne.

Bugs trouvés → fix + commit + push + document dans `docs/knowissue.md`.

- [ ] **Step 3: Final commit submodule bump**

Une fois UI validée par user :

```bash
cd ..
git add EriniumFactionWeb
git commit -m "chore(submodules): bump EriniumFactionWeb (phase 6b knowledge base complete)"
git push
```

---

## Critères de succès Phase 6b

1. `rtk pnpm tsc --noEmit` 0 erreurs.
2. `rtk pnpm build` (ou Vercel deploy) passe.
3. `pnpm smoke:phase6b-kb` passe en prod.
4. UI checklist T24 validée par user.
5. `docs/permissions.md` à jour avec 4 perms `kb.*`.
6. `docs/knowissue.md` propre (entrées seulement si bugs trouvés).
7. Le `TiptapEditor` partagé est réutilisé 100% (pas de fork ni de copie).
8. Versioning auto : chaque update d'article snapshot la version précédente ; chaque restore snapshot la version courante puis copy la cible.
9. Recherche full-text : `/api/work/v1/kb/search?q=<mot>` retourne articles publiés contenant le mot dans titre/body/tags, classés par rank.
10. Soft-delete cascade : delete space → categories + articles cascadent.
