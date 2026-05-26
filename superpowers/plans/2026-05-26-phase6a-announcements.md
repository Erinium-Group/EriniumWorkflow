# Work Panel — Phase 6a : Annonces + Éditeur Tiptap partagé (Plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le module Annonces du Work Panel (CRUD, severities, pin, acks, broadcast Discord, panneau notifs) et un éditeur Tiptap partagé enrichi (image upload Vercel Blob, code-block lowlight, tables, slash commands) réutilisable par la Knowledge Base en Phase 6b.

> **YAGNI — Ciblage d'audience explicitement HORS v1** : décision brainstorm explicite. Toutes les annonces sont visibles par TOUT le staff (>=1 rôle staff actif). Aucune colonne de ciblage en DB, aucun composant de sélection d'audience dans l'UI. Le filtre lu/non-lu se fait au moment de la lecture côté client. Voir spec Section 15.

**Architecture:** Migration SQL idempotente unique (`phase7-announcements-kb.sql`) qui crée toutes les tables (annonces + KB) mais Phase 6a n'utilise que les tables annonces. Trois couches : (1) DB helpers `src/lib/work/announcements/*` typés Postgres → camelCase ; (2) API routes Next.js 16 App Router avec `requireStaff` + Zod safeParse + `sanitizeTiptapHtml` + `logAudit` ; (3) UI React 19 avec hooks React Query, composants Tailwind v4, panneau modals.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Neon Postgres serverless, `@tanstack/react-query` v5, Zod v4, `@tiptap/*` v3 (StarterKit déjà installé, ajouts code-block-lowlight + table + lowlight), `@vercel/blob` (à installer), `nanoid` v5 (déjà installé), Tailwind v4.

**Référence spec :** `docs/superpowers/specs/2026-05-26-phase6-announcements-kb-design.md`

**Méthodologie de test (pas de framework de tests dans ce projet) :**
- Build = check : `JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build` doit passer (TS compile + ESLint).
- Lib + DB = smoke `pnpm tsx scripts/smoke-phase6a-announcements.ts` (création / patch / pin / ack / delete).
- API = appels HTTP via le smoke + browser DevTools sur la page UI.
- UI = checklist manuelle Task 31 (ex-Task 32), exécutée en fin de plan.

---

## Structure des fichiers

```
EriniumFactionWeb/
├── migrations/
│   └── phase7-announcements-kb.sql                                   [NEW] Tables annonces + KB + seeds
├── src/
│   ├── lib/
│   │   ├── db/index.ts                                                [MODIFIED] +run phase7 migration, +NotificationKind extended
│   │   └── work/
│   │       ├── sanitize.ts                                            [MODIFIED] +sanitizeTiptapHtml whitelist élargie
│   │       ├── validators.ts                                          [MODIFIED] +AnnouncementCreateSchema, PatchSchema, ListQuerySchema, PinPatchSchema
│   │       ├── blob-upload.ts                                         [NEW] put helper Vercel Blob + types
│   │       └── announcements/
│   │           ├── types.ts                                           [NEW] DbAnnouncement, AnnouncementListItem
│   │           ├── queries.ts                                         [NEW] listAnnouncements, getAnnouncementById, listActiveStaffUserIds
│   │           ├── mutations.ts                                       [NEW] createAnnouncement, updateAnnouncement, deleteAnnouncement, ackAnnouncement, setPinned
│   │           └── notify.ts                                          [NEW] notif tous staff + mentions
│   ├── app/
│   │   ├── api/work/v1/
│   │   │   ├── announcements/
│   │   │   │   ├── route.ts                                           [NEW] GET list + POST create
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts                                       [NEW] GET detail + PATCH + DELETE
│   │   │   │       ├── ack/route.ts                                   [NEW] POST ack idempotent
│   │   │   │       └── pin/route.ts                                   [NEW] POST pin/unpin
│   │   │   └── uploads/
│   │   │       └── blob/route.ts                                      [NEW] POST upload Vercel Blob
│   │   └── (admin)/admin/work/announcements/
│   │       └── page.tsx                                               [MODIFIED] suppression EmptyState + intégration AnnouncementsView
│   ├── components/work/
│   │   ├── announcements/
│   │   │   ├── AnnouncementsView.tsx                                  [NEW] page-level layout + toolbar
│   │   │   ├── AnnouncementCard.tsx                                   [NEW] carte liste
│   │   │   ├── AnnouncementFormModal.tsx                              [NEW] modal create/edit
│   │   │   ├── AnnouncementDetailModal.tsx                            [NEW] modal détail + acks + actions
│   │   │   └── SeverityBadge.tsx                                      [NEW] badge couleur
│   │   ├── editor/
│   │   │   ├── TiptapEditor.tsx                                       [NEW] éditeur partagé
│   │   │   ├── SlashCommandsExtension.tsx                             [NEW] palette /commands
│   │   │   ├── BlobImageButton.tsx                                    [NEW] bouton toolbar upload
│   │   │   └── EditorToolbar.tsx                                      [NEW] toolbar markdown-like
│   │   └── notifications/
│   │       └── NotificationsPanel.tsx                                 [MODIFIED] handle kinds announcement + announcement_mention
│   └── hooks/work/
│       └── useAnnouncements.ts                                        [NEW] React Query hooks (list / detail / create / patch / delete / ack / pin)
├── scripts/
│   └── smoke-phase6a-announcements.ts                                 [NEW] smoke E2E mutations
└── package.json                                                        [MODIFIED] +@vercel/blob +@tiptap/extension-code-block-lowlight +lowlight +@tiptap/extension-table +@tiptap/extension-table-row +@tiptap/extension-table-cell +@tiptap/extension-table-header

docs/
├── permissions.md                                                      [MODIFIED] +section Annonces (5 perms)
└── knowissue.md                                                        [MODIFIED] +entrée éventuelle si bug rencontré
```

---

## Phase A — Foundation (DB + libs)

### Task 1 : Migration SQL `phase7-announcements-kb.sql`

**Files:**
- Create: `EriniumFactionWeb/migrations/phase7-announcements-kb.sql`

- [ ] **Step 1 : Créer la migration SQL idempotente complète**

Fichier `EriniumFactionWeb/migrations/phase7-announcements-kb.sql` :

```sql
-- Phase 7 (alias Phase 6 fonctionnel) — Annonces + Knowledge Base.
-- Migration idempotente : CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- INSERT ... ON CONFLICT DO NOTHING. Peut être ré-appliquée sans effet de bord.

-- ─── Annonces ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  severity        TEXT NOT NULL,
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  post_to_discord BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT chk_announcement_severity CHECK (severity IN ('info','important','critical')),
  CONSTRAINT chk_announcement_period CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_announcements_pin_created
  ON announcements(pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_active_period
  ON announcements(starts_at, ends_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_severity
  ON announcements(severity)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS announcement_acks (
  announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_acks_user
  ON announcement_acks(user_id);

-- ─── Knowledge Base (créé maintenant, utilisé en Phase 6b) ───

CREATE TABLE IF NOT EXISTS kb_spaces (
  id           BIGSERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  icon         TEXT,
  color        TEXT,
  order_idx    INT NOT NULL DEFAULT 0,
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS kb_categories (
  id           BIGSERIAL PRIMARY KEY,
  space_id     BIGINT NOT NULL REFERENCES kb_spaces(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  order_idx    INT NOT NULL DEFAULT 0,
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (space_id, slug)
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT NOT NULL REFERENCES kb_categories(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft',
  current_version INT NOT NULL DEFAULT 1,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  search_tsv      TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(regexp_replace(body_html, '<[^>]+>', ' ', 'g'), '')), 'B') ||
    setweight(to_tsvector('french', coalesce(array_to_string(tags, ' '), '')), 'A')
  ) STORED,
  CONSTRAINT chk_kb_status CHECK (status IN ('draft','published','archived')),
  UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_search ON kb_articles USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category_status
  ON kb_articles(category_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON kb_articles USING GIN (tags);

CREATE TABLE IF NOT EXISTS kb_article_versions (
  id           BIGSERIAL PRIMARY KEY,
  article_id   BIGINT NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  version_no   INT NOT NULL,
  title        TEXT NOT NULL,
  body_html    TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL,
  edited_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  edited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (article_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_kb_article_versions_article
  ON kb_article_versions(article_id, version_no DESC);

-- ─── Seed des permissions ────────────────────────────────────

INSERT INTO staff_role_permissions (role_id, permission)
SELECT r.id, p.permission
  FROM staff_roles r
  CROSS JOIN (VALUES
    ('announcements.create'),
    ('announcements.read'),
    ('announcements.update'),
    ('announcements.delete'),
    ('announcements.ack')
  ) AS p(permission)
 WHERE r.slug IN ('admin', 'lead')
ON CONFLICT DO NOTHING;

INSERT INTO staff_role_permissions (role_id, permission)
SELECT r.id, p.permission
  FROM staff_roles r
  CROSS JOIN (VALUES ('announcements.read'), ('announcements.ack')) AS p(permission)
 WHERE r.slug IN ('mod', 'support')
ON CONFLICT DO NOTHING;

INSERT INTO staff_role_permissions (role_id, permission)
SELECT r.id, p.permission
  FROM staff_roles r
  CROSS JOIN (VALUES
    ('kb.create'),
    ('kb.read'),
    ('kb.update'),
    ('kb.delete')
  ) AS p(permission)
 WHERE r.slug IN ('admin', 'lead')
ON CONFLICT DO NOTHING;

INSERT INTO staff_role_permissions (role_id, permission)
SELECT r.id, 'kb.read'
  FROM staff_roles r
 WHERE r.slug IN ('mod', 'support')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2 : Commit**

```bash
git add EriniumFactionWeb/migrations/phase7-announcements-kb.sql
git commit -m "feat(work/announcements): migration SQL phase7 (tables annonces + KB inertes)"
```

---

### Task 2 : Installer les dépendances npm

**Files:**
- Modify: `EriniumFactionWeb/package.json`

- [ ] **Step 1 : Installer les paquets manquants**

Exécuter dans `EriniumFactionWeb/` :

```bash
pnpm add @vercel/blob @tiptap/extension-code-block-lowlight lowlight @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
```

- [ ] **Step 2 : Vérifier l'install dans package.json**

Lire `EriniumFactionWeb/package.json` et confirmer présence dans `dependencies` :
- `@vercel/blob` (^x.y.z)
- `@tiptap/extension-code-block-lowlight` (^3.x)
- `lowlight` (^3.x)
- `@tiptap/extension-table` + `-table-row` + `-table-cell` + `-table-header` (^3.x)

- [ ] **Step 3 : Build de contrôle**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe (les nouvelles deps ne sont pas encore importées, c'est OK).

- [ ] **Step 4 : Commit**

```bash
git add EriniumFactionWeb/package.json EriniumFactionWeb/pnpm-lock.yaml
git commit -m "chore(deps): +@vercel/blob +tiptap extensions (code-block-lowlight, tables, lowlight)"
```

---

### Task 3 : Brancher la migration dans `_initDbInternal`

**Files:**
- Modify: `EriniumFactionWeb/src/lib/db/index.ts`

- [ ] **Step 1 : Localiser la liste de migrations dans `_initDbInternal`**

Ouvrir `EriniumFactionWeb/src/lib/db/index.ts` et chercher la section qui lit/exécute les fichiers SQL de `migrations/`. Localiser le tableau ordonné des fichiers (probable `["phase5-bootstrap.sql", "phase6-roadmap.sql"]` ou équivalent).

- [ ] **Step 2 : Ajouter `phase7-announcements-kb.sql` à la suite**

Dans le tableau ordonné, ajouter en dernier :

```ts
"phase7-announcements-kb.sql",
```

L'ordre est important : phase5 → phase6 → phase7.

- [ ] **Step 3 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 4 : Commit**

```bash
git add EriniumFactionWeb/src/lib/db/index.ts
git commit -m "feat(db): brancher migration phase7 (annonces + KB)"
```

---

### Task 4 : Étendre `NotificationKind` avec `announcement` et `announcement_mention`

**Files:**
- Modify: `EriniumFactionWeb/src/lib/db/index.ts`

- [ ] **Step 1 : Ouvrir le bloc de définition de `NotificationKind`**

Localiser dans `src/lib/db/index.ts` lignes ~5829-5840 :

```ts
export type NotificationKind =
  | "mention"
  | "card_assigned"
  | "card_due_soon"
  | "comment_on_my_card"
  | "event_invite"
  | "event_reminder"
  | "ticket_assigned"
  | "system";
```

- [ ] **Step 2 : Ajouter les deux nouveaux kinds**

Remplacer par :

```ts
export type NotificationKind =
  | "mention"
  | "card_assigned"
  | "card_due_soon"
  | "comment_on_my_card"
  | "event_invite"
  | "event_reminder"
  | "ticket_assigned"
  | "system"
  // Phase 6a — Annonces.
  // 'announcement'         : notif de masse envoyée à TOUT le staff actif (>=1 rôle staff) à la publication d'une annonce.
  //                          title = "[INFO|IMPORTANT|CRITICAL] <titre>", link = /admin/work/announcements?focus=<id>
  // 'announcement_mention' : notif spécifique pour les users @-mentionnés dans le body.
  //                          title = "Vous avez été mentionné dans une annonce", link = idem.
  | "announcement"
  | "announcement_mention";
```

- [ ] **Step 3 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe (le type est utilisé dans `createNotification` / `createNotificationsBatch` mais sans contrainte stricte là où il faut).

- [ ] **Step 4 : Commit**

```bash
git add EriniumFactionWeb/src/lib/db/index.ts
git commit -m "feat(db): NotificationKind +'announcement' +'announcement_mention'"
```

---

### Task 5 : Étendre `sanitize.ts` avec `sanitizeTiptapHtml`

**Files:**
- Modify: `EriniumFactionWeb/src/lib/work/sanitize.ts`

- [ ] **Step 1 : Ajouter les listes pour la whitelist élargie**

Dans `src/lib/work/sanitize.ts`, après le bloc `ALLOWED_TAGS_FULL` existant, ajouter :

```ts
/**
 * Whitelist HTML pour l'éditeur Tiptap "complet" (annonces, articles KB).
 *
 * Différences avec ALLOWED_TAGS_FULL :
 *  - +table/thead/tbody/tr/td/th (extension @tiptap/extension-table)
 *  - pre + code conservent attr `class` (lowlight ajoute language-xxx)
 *  - img conserve src https + URLs Vercel Blob
 */
const ALLOWED_TAGS_TIPTAP: string[] = [
  ...ALLOWED_TAGS_FULL,
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
];

const ALLOWED_ATTRIBUTES_TIPTAP: sanitizeHtml.IOptions["allowedAttributes"] = {
  "*": ["style", "class", "data-mention", "data-user-id"],
  a: ["href", "target", "rel", "title"],
  img: ["src", "alt", "title", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  pre: ["class"],
  code: ["class"],
};
```

- [ ] **Step 2 : Ajouter le regex de validation Blob URL**

Toujours dans `sanitize.ts`, ajouter (avant `BASE_OPTIONS`) :

```ts
/**
 * Hostname Vercel Blob autorisé pour les <img src="...">.
 * Pattern : https://<store-id>.public.blob.vercel-storage.com/...
 */
const BLOB_HOSTNAME_RE = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;

function isAllowedImgSrc(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") {
      if (BLOB_HOSTNAME_RE.test(u.hostname)) return true;
      // Autres URLs https arbitraires : on accepte si on veut permettre des images externes.
      // Politique stricte : on refuse pour Tiptap (force l'upload via Blob).
      return false;
    }
    return false;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3 : Ajouter la fonction `sanitizeTiptapHtml`**

À la fin du fichier, exporter :

```ts
/**
 * Sanitize une chaîne HTML provenant de l'éditeur Tiptap PARTAGÉ
 * (annonces, articles KB). Whitelist élargie : tables, code-block avec
 * classe `language-xxx` (lowlight), images Blob uniquement.
 *
 * Sources externes (img src http(s) hors Blob) sont strippées : l'utilisateur
 * doit utiliser le bouton "Upload image" qui héberge sur Vercel Blob.
 */
export function sanitizeTiptapHtml(input: string | null | undefined): string | null {
  if (input == null) return null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (trimmed === "<p></p>" || trimmed === "<p><br></p>") return null;

  const opts: sanitizeHtml.IOptions = {
    allowedTags: ALLOWED_TAGS_TIPTAP,
    allowedAttributes: ALLOWED_ATTRIBUTES_TIPTAP,
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["https"],
      a: ["http", "https", "mailto"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: A_TRANSFORM,
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        if (!isAllowedImgSrc(src)) {
          // Strip l'image si src non whitelisté.
          return { tagName: "p", attribs: {}, text: "" };
        }
        return { tagName: "img", attribs };
      },
    },
    disallowedTagsMode: "discard",
    textFilter: (text) => text,
  };

  const clean = sanitizeHtml(trimmed, opts);
  const trimmedClean = clean.trim();
  if (
    trimmedClean === "" ||
    trimmedClean === "<p></p>" ||
    trimmedClean === "<p><br /></p>" ||
    trimmedClean === "<p><br></p>"
  ) {
    return null;
  }
  return trimmedClean;
}
```

- [ ] **Step 4 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 5 : Commit**

```bash
git add EriniumFactionWeb/src/lib/work/sanitize.ts
git commit -m "feat(work/sanitize): +sanitizeTiptapHtml (tables, code-block, img Blob whitelist)"
```

---

### Task 6 : Validators Zod annonces

**Files:**
- Modify: `EriniumFactionWeb/src/lib/work/validators.ts`

- [ ] **Step 1 : Ajouter les schemas à la fin du fichier**

À la fin de `src/lib/work/validators.ts`, ajouter :

```ts
// ─── Phase 6a : Annonces ───────────────────────────────────────

const AnnouncementSeverityEnum = z.enum(["info", "important", "critical"]);

export const AnnouncementCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    body_html: z.string().min(1).max(50_000),
    severity: AnnouncementSeverityEnum,
    pinned: z.boolean().optional().default(false),
    starts_at: z.string().datetime().optional().nullable(),
    ends_at: z.string().datetime().optional().nullable(),
    post_to_discord: z.boolean().optional().default(false),
  })
  .refine(
    (d) => {
      if (d.starts_at != null && d.ends_at != null) {
        return Date.parse(d.ends_at) > Date.parse(d.starts_at);
      }
      return true;
    },
    { message: "ends_at doit être strictement après starts_at" },
  );

export const AnnouncementPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body_html: z.string().min(1).max(50_000).optional(),
  severity: AnnouncementSeverityEnum.optional(),
  pinned: z.boolean().optional(),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
  post_to_discord: z.boolean().optional(),
});

export const AnnouncementListQuerySchema = z.object({
  severity: AnnouncementSeverityEnum.optional(),
  active_only: z.union([z.literal("true"), z.literal("false")]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const AnnouncementPinSchema = z.object({
  pinned: z.boolean(),
});

export type AnnouncementCreateInput = z.infer<typeof AnnouncementCreateSchema>;
export type AnnouncementPatchInput = z.infer<typeof AnnouncementPatchSchema>;
export type AnnouncementListQuery = z.infer<typeof AnnouncementListQuerySchema>;
export type AnnouncementPinInput = z.infer<typeof AnnouncementPinSchema>;
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/lib/work/validators.ts
git commit -m "feat(work/validators): +AnnouncementCreateSchema +PatchSchema +ListQuerySchema +PinSchema (sans ciblage)"
```

---

### Task 7 : Types DB annonces

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/announcements/types.ts`

- [ ] **Step 1 : Créer le fichier types**

Fichier `EriniumFactionWeb/src/lib/work/announcements/types.ts` :

```ts
/**
 * Types côté DB / API pour le module Annonces (Phase 6a).
 *
 * Convention : `DbAnnouncement` = ligne brute Postgres (snake_case),
 * `Announcement` = type exposé à l'UI (camelCase).
 */

export type AnnouncementSeverity = "info" | "important" | "critical";

export interface DbAnnouncement {
  id: number;
  title: string;
  body_html: string;
  severity: AnnouncementSeverity;
  pinned: boolean;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  post_to_discord: boolean;
  created_by: number | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
}

export interface Announcement {
  id: number;
  title: string;
  bodyHtml: string;
  severity: AnnouncementSeverity;
  pinned: boolean;
  startsAt: string | null;
  endsAt: string | null;
  postToDiscord: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AnnouncementListItem extends Announcement {
  acksCount: number;
  ackedByMe: boolean;
  createdByName: string | null;
}

export interface AnnouncementDetail extends AnnouncementListItem {
  ackedUsers: Array<{ userId: number; discordName: string | null; ackedAt: string }>;
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/lib/work/announcements/types.ts
git commit -m "feat(work/announcements): types DB + API (Announcement, etc.)"
```

---

### Task 8 : Queries DB annonces

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/announcements/queries.ts`

- [ ] **Step 1 : Créer le fichier queries**

Fichier `EriniumFactionWeb/src/lib/work/announcements/queries.ts` :

```ts
/**
 * Queries DB read-only pour le module Annonces (Phase 6a).
 *
 * Toutes les fonctions appellent initDb() en premier (no-op si déjà init).
 * Transformation snake_case (DB) -> camelCase (API).
 */
import { query, initDb, tsToIso } from "@/lib/db";
import type {
  Announcement,
  AnnouncementListItem,
  AnnouncementDetail,
  DbAnnouncement,
} from "./types";
import type { AnnouncementListQuery } from "../validators";

type AnnouncementRow = DbAnnouncement & {
  acks_count?: number;
  acked_by_me?: boolean;
  created_by_name?: string | null;
};

function rowToAnnouncement(r: AnnouncementRow): Announcement {
  return {
    id: Number(r.id),
    title: r.title,
    bodyHtml: r.body_html,
    severity: r.severity,
    pinned: r.pinned,
    startsAt: r.starts_at != null ? tsToIso(r.starts_at) : null,
    endsAt: r.ends_at != null ? tsToIso(r.ends_at) : null,
    postToDiscord: r.post_to_discord,
    createdBy: r.created_by,
    createdAt: tsToIso(r.created_at),
    updatedAt: tsToIso(r.updated_at),
    deletedAt: r.deleted_at != null ? tsToIso(r.deleted_at) : null,
  };
}

/**
 * Liste les annonces visibles (non-deleted) avec compteur acks + flag acked_by_me.
 * Filtres : severity, active_only (filtre la période courante).
 * Ordre : pinned DESC, created_at DESC.
 */
export async function listAnnouncements(
  viewerUserId: number,
  filters: AnnouncementListQuery = { limit: 50, offset: 0 },
): Promise<AnnouncementListItem[]> {
  await initDb();
  const where: string[] = ["a.deleted_at IS NULL"];
  const params: unknown[] = [viewerUserId];
  let p = 2;

  if (filters.severity) {
    where.push(`a.severity = $${p++}`);
    params.push(filters.severity);
  }
  if (filters.active_only === "true") {
    where.push(`(a.starts_at IS NULL OR a.starts_at <= NOW())`);
    where.push(`(a.ends_at IS NULL OR a.ends_at > NOW())`);
  }
  const whereSql = where.join(" AND ");

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  const rows = (await query(
    `SELECT
       a.id, a.title, a.body_html, a.severity,
       a.pinned, a.starts_at, a.ends_at, a.post_to_discord, a.created_by,
       a.created_at, a.updated_at, a.deleted_at,
       (SELECT COUNT(*)::int FROM announcement_acks ak WHERE ak.announcement_id = a.id) AS acks_count,
       EXISTS(SELECT 1 FROM announcement_acks ak WHERE ak.announcement_id = a.id AND ak.user_id = $1) AS acked_by_me,
       u.discord_name AS created_by_name
     FROM announcements a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE ${whereSql}
     ORDER BY a.pinned DESC, a.created_at DESC
     LIMIT $${p++}::int OFFSET $${p++}::int`,
    [...params, limit, offset],
  )) as AnnouncementRow[];

  return rows.map((r) => ({
    ...rowToAnnouncement(r),
    acksCount: Number(r.acks_count ?? 0),
    ackedByMe: Boolean(r.acked_by_me),
    createdByName: r.created_by_name ?? null,
  }));
}

/**
 * Détail d'une annonce + liste des acks. Renvoie null si absente ou soft-deleted.
 */
export async function getAnnouncementById(
  id: number,
  viewerUserId: number,
): Promise<AnnouncementDetail | null> {
  await initDb();
  const rows = (await query(
    `SELECT
       a.id, a.title, a.body_html, a.severity,
       a.pinned, a.starts_at, a.ends_at, a.post_to_discord, a.created_by,
       a.created_at, a.updated_at, a.deleted_at,
       (SELECT COUNT(*)::int FROM announcement_acks ak WHERE ak.announcement_id = a.id) AS acks_count,
       EXISTS(SELECT 1 FROM announcement_acks ak WHERE ak.announcement_id = a.id AND ak.user_id = $2) AS acked_by_me,
       u.discord_name AS created_by_name
     FROM announcements a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id, viewerUserId],
  )) as AnnouncementRow[];

  if (rows.length === 0) return null;
  const base = rowToAnnouncement(rows[0]);

  const ackedRows = (await query(
    `SELECT ak.user_id, u.discord_name, ak.acked_at
     FROM announcement_acks ak
     LEFT JOIN users u ON u.id = ak.user_id
     WHERE ak.announcement_id = $1
     ORDER BY ak.acked_at DESC
     LIMIT 500`,
    [id],
  )) as Array<{ user_id: number; discord_name: string | null; acked_at: Date | string }>;

  return {
    ...base,
    acksCount: Number(rows[0].acks_count ?? 0),
    ackedByMe: Boolean(rows[0].acked_by_me),
    createdByName: rows[0].created_by_name ?? null,
    ackedUsers: ackedRows.map((r) => ({
      userId: Number(r.user_id),
      discordName: r.discord_name,
      ackedAt: tsToIso(r.acked_at),
    })),
  };
}

/**
 * Liste les user_ids de TOUS les staff actifs : >=1 rôle dans staff_user_roles
 * ET users.deleted_at IS NULL. Sert à notifier en masse à la publication d'une
 * annonce (audience v1 = tout le staff, pas de ciblage).
 */
export async function listActiveStaffUserIds(): Promise<number[]> {
  await initDb();
  const rows = (await query(
    `SELECT DISTINCT sur.user_id
     FROM staff_user_roles sur
     JOIN users u ON u.id = sur.user_id
     WHERE u.deleted_at IS NULL`,
    [],
  )) as Array<{ user_id: number }>;
  return rows.map((r) => Number(r.user_id));
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/lib/work/announcements/queries.ts
git commit -m "feat(work/announcements): queries DB (list, detail, listActiveStaffUserIds)"
```

---

### Task 9 : Mutations DB annonces

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/announcements/mutations.ts`

- [ ] **Step 1 : Créer le fichier mutations**

Fichier `EriniumFactionWeb/src/lib/work/announcements/mutations.ts` :

```ts
/**
 * Mutations DB pour le module Annonces (Phase 6a).
 *
 * Pas de logique métier de notification ici : c'est le rôle des routes
 * API qui orchestrent (sanitize -> insert -> notifs -> Discord).
 */
import { query, initDb } from "@/lib/db";
import type {
  Announcement,
  DbAnnouncement,
} from "./types";
import type {
  AnnouncementCreateInput,
  AnnouncementPatchInput,
} from "../validators";

type Row = DbAnnouncement;

function rowToAnnouncement(r: Row): Announcement {
  return {
    id: Number(r.id),
    title: r.title,
    bodyHtml: r.body_html,
    severity: r.severity,
    pinned: r.pinned,
    startsAt: r.starts_at != null ? new Date(r.starts_at).toISOString() : null,
    endsAt: r.ends_at != null ? new Date(r.ends_at).toISOString() : null,
    postToDiscord: r.post_to_discord,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    deletedAt: r.deleted_at != null ? new Date(r.deleted_at).toISOString() : null,
  };
}

/**
 * Insère une annonce. body_html doit déjà être sanitize côté caller.
 */
export async function createAnnouncement(
  input: Omit<AnnouncementCreateInput, "body_html"> & { body_html: string; created_by: number },
): Promise<Announcement> {
  await initDb();
  const rows = (await query(
    `INSERT INTO announcements (
       title, body_html, severity,
       pinned, starts_at, ends_at, post_to_discord, created_by,
       created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     RETURNING id, title, body_html, severity, pinned,
               starts_at, ends_at, post_to_discord, created_by,
               created_at, updated_at, deleted_at`,
    [
      input.title,
      input.body_html,
      input.severity,
      input.pinned ?? false,
      input.starts_at ?? null,
      input.ends_at ?? null,
      input.post_to_discord ?? false,
      input.created_by,
    ],
  )) as Row[];
  return rowToAnnouncement(rows[0]);
}

/**
 * Update partielle d'une annonce. Retourne null si non trouvée ou soft-deleted.
 * body_html doit déjà être sanitize côté caller.
 */
export async function updateAnnouncement(
  id: number,
  patch: Omit<AnnouncementPatchInput, "body_html"> & { body_html?: string },
): Promise<Announcement | null> {
  await initDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (patch.title !== undefined) {
    sets.push(`title = $${p++}`);
    params.push(patch.title);
  }
  if (patch.body_html !== undefined) {
    sets.push(`body_html = $${p++}`);
    params.push(patch.body_html);
  }
  if (patch.severity !== undefined) {
    sets.push(`severity = $${p++}`);
    params.push(patch.severity);
  }
  if (patch.pinned !== undefined) {
    sets.push(`pinned = $${p++}`);
    params.push(patch.pinned);
  }
  if (patch.starts_at !== undefined) {
    sets.push(`starts_at = $${p++}`);
    params.push(patch.starts_at);
  }
  if (patch.ends_at !== undefined) {
    sets.push(`ends_at = $${p++}`);
    params.push(patch.ends_at);
  }
  if (patch.post_to_discord !== undefined) {
    sets.push(`post_to_discord = $${p++}`);
    params.push(patch.post_to_discord);
  }
  if (sets.length === 0) {
    // Rien à update : retourner l'état courant.
    const rows = (await query(
      `SELECT id, title, body_html, severity, pinned,
              starts_at, ends_at, post_to_discord, created_by,
              created_at, updated_at, deleted_at
       FROM announcements WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )) as Row[];
    return rows[0] ? rowToAnnouncement(rows[0]) : null;
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const rows = (await query(
    `UPDATE announcements
        SET ${sets.join(", ")}
      WHERE id = $${p} AND deleted_at IS NULL
      RETURNING id, title, body_html, severity, pinned,
                starts_at, ends_at, post_to_discord, created_by,
                created_at, updated_at, deleted_at`,
    params,
  )) as Row[];
  return rows[0] ? rowToAnnouncement(rows[0]) : null;
}

/**
 * Soft-delete : set deleted_at = NOW(). Retourne true si une ligne a été affectée.
 */
export async function deleteAnnouncement(id: number): Promise<boolean> {
  await initDb();
  const rows = (await query(
    `UPDATE announcements SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id],
  )) as Array<{ id: number }>;
  return rows.length > 0;
}

/**
 * Pin / unpin. Retourne l'annonce mise à jour ou null si absente.
 */
export async function setAnnouncementPinned(
  id: number,
  pinned: boolean,
): Promise<Announcement | null> {
  await initDb();
  const rows = (await query(
    `UPDATE announcements SET pinned = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, title, body_html, severity, pinned,
               starts_at, ends_at, post_to_discord, created_by,
               created_at, updated_at, deleted_at`,
    [id, pinned],
  )) as Row[];
  return rows[0] ? rowToAnnouncement(rows[0]) : null;
}

/**
 * Insère un ack. Idempotent via ON CONFLICT DO NOTHING (PK composite).
 * Retourne true si insertion effective, false si déjà acked.
 */
export async function ackAnnouncement(
  announcementId: number,
  userId: number,
): Promise<{ inserted: boolean; alreadyAcked: boolean }> {
  await initDb();
  const rows = (await query(
    `INSERT INTO announcement_acks (announcement_id, user_id, acked_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (announcement_id, user_id) DO NOTHING
     RETURNING announcement_id`,
    [announcementId, userId],
  )) as Array<{ announcement_id: number }>;
  return { inserted: rows.length > 0, alreadyAcked: rows.length === 0 };
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/lib/work/announcements/mutations.ts
git commit -m "feat(work/announcements): mutations DB (create, update, delete, pin, ack)"
```

---

### Task 10 : Helper notify pour annonces

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/announcements/notify.ts`

- [ ] **Step 1 : Créer le helper de notifications**

Fichier `EriniumFactionWeb/src/lib/work/announcements/notify.ts` :

```ts
/**
 * Helper de notifications pour les annonces (Phase 6a).
 *
 * Audience v1 = TOUT le staff (>=1 rôle staff). Pas de ciblage.
 *
 * Use case 1 : à la création d'une annonce, on notifie TOUS les staff actifs
 *              avec kind='announcement' (1 INSERT batch).
 * Use case 2 : si le body contient des @mentions, on génère 1 notif
 *              SUPPLÉMENTAIRE par user mentionné avec kind='announcement_mention'.
 *
 * Les notifs ont link = "/admin/work/announcements?focus=<id>" qui auto-ouvre
 * le modal détail côté UI.
 */
import { createNotificationsBatch } from "@/lib/db";
import { extractMentionedUserIds } from "@/lib/work/mentions";
import { listActiveStaffUserIds } from "./queries";
import type {
  Announcement,
  AnnouncementSeverity,
} from "./types";

const SEVERITY_LABEL: Record<AnnouncementSeverity, string> = {
  info: "INFO",
  important: "IMPORTANT",
  critical: "CRITICAL",
};

/**
 * Strippe le HTML et tronque à 200 chars pour le champ `body` des notifs.
 */
function htmlToExcerpt(html: string, maxLen = 200): string {
  const stripped = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= maxLen) return stripped;
  return stripped.slice(0, maxLen - 1) + "…";
}

/**
 * Notifie TOUS les staff actifs + 1 notif supplémentaire par user mentionné.
 * Un user qui est staff ET mentionné reçoit donc 2 notifs (kind différent).
 *
 * Ne throw jamais : un échec de notif n'empêche pas la publication.
 */
export async function notifyAnnouncement(announcement: Announcement): Promise<{
  staffNotified: number;
  mentionedNotified: number;
}> {
  const link = `/admin/work/announcements?focus=${announcement.id}`;
  const title = `[${SEVERITY_LABEL[announcement.severity]}] ${announcement.title}`;
  const body = htmlToExcerpt(announcement.bodyHtml, 200);

  let staffNotified = 0;
  let mentionedNotified = 0;

  try {
    const staffIds = await listActiveStaffUserIds();
    // Ne pas se notifier soi-même.
    const filteredStaff = announcement.createdBy != null
      ? staffIds.filter((uid) => uid !== announcement.createdBy)
      : staffIds;
    staffNotified = await createNotificationsBatch({
      user_ids: filteredStaff,
      kind: "announcement",
      title,
      body,
      link,
    });
  } catch (err) {
    console.warn("[work][announcements] staff notify failed:", err);
  }

  try {
    const mentionedIds = extractMentionedUserIds(announcement.bodyHtml);
    if (mentionedIds.length > 0) {
      const filtered = announcement.createdBy != null
        ? mentionedIds.filter((uid) => uid !== announcement.createdBy)
        : mentionedIds;
      mentionedNotified = await createNotificationsBatch({
        user_ids: filtered,
        kind: "announcement_mention",
        title: `Vous avez été mentionné dans une annonce : ${announcement.title}`,
        body,
        link,
      });
    }
  } catch (err) {
    console.warn("[work][announcements] mention notify failed:", err);
  }

  return { staffNotified, mentionedNotified };
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/lib/work/announcements/notify.ts
git commit -m "feat(work/announcements): notify helper (tous staff + mentions)"
```

---

### Task 11 : Helper upload Vercel Blob

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/blob-upload.ts`

- [ ] **Step 1 : Créer le helper**

Fichier `EriniumFactionWeb/src/lib/work/blob-upload.ts` :

```ts
/**
 * Wrapper Vercel Blob pour les uploads d'images Tiptap (Phase 6a, réutilisé KB).
 *
 * Limites :
 *  - 5 MB max par fichier.
 *  - Types whitelistés : png, jpeg, webp, gif.
 *  - Filename généré : work/<year>/<month>/<nanoid>.<ext>
 *
 * Le token BLOB_READ_WRITE_TOKEN est injecté automatiquement par Vercel en
 * preview/prod. En dev local : pnpm vercel env pull .env.local le récupère.
 */
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface BlobUploadResult {
  url: string;
  size: number;
  contentType: string;
}

export class BlobUploadError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "BlobUploadError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Upload un File (ou Blob compatible) vers Vercel Blob.
 * Throw BlobUploadError si validation échoue ou Vercel renvoie une erreur.
 */
export async function uploadImageToBlob(file: File): Promise<BlobUploadResult> {
  if (!file) throw new BlobUploadError(400, "no_file", "Aucun fichier fourni");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new BlobUploadError(
      413,
      "too_large",
      `Fichier > ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new BlobUploadError(
      415,
      "unsupported_type",
      `Type ${file.type} non autorisé. PNG/JPEG/WebP/GIF uniquement.`,
    );
  }

  const ext = MIME_TO_EXT[file.type] ?? "bin";
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const filename = `work/${year}/${month}/${nanoid(16)}.${ext}`;

  const blob = await put(filename, file, {
    access: "public",
    contentType: file.type,
  });

  return {
    url: blob.url,
    size: file.size,
    contentType: file.type,
  };
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/lib/work/blob-upload.ts
git commit -m "feat(work/blob): uploadImageToBlob helper (5MB, png/jpeg/webp/gif)"
```

---

## Phase B — API routes

### Task 12 : Endpoint POST `/api/work/v1/uploads/blob`

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/uploads/blob/route.ts`

- [ ] **Step 1 : Créer le route handler**

Fichier `EriniumFactionWeb/src/app/api/work/v1/uploads/blob/route.ts` :

```ts
/**
 * POST /api/work/v1/uploads/blob
 *
 * Upload multipart/form-data d'une image vers Vercel Blob. Réutilisé par
 * l'éditeur Tiptap partagé pour annonces + KB.
 *
 * Auth : exige au moins announcements.create OU kb.create.
 * Limite : 5 MB, mime types whitelist.
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  resolvePermissions,
  has,
  WorkAuthError,
  handleWorkAuthError,
} from "@/lib/work/permissions";
import { requireAuth } from "@/lib/auth/middleware";
import { uploadImageToBlob, BlobUploadError } from "@/lib/work/blob-upload";
import { logAudit, extractIp, extractUserAgent } from "@/lib/work/audit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Auth perms : au moins une des deux.
    const perms = await resolvePermissions(auth.userId, auth.discordId);
    if (!has(perms, "announcements.create") && !has(perms, "kb.create")) {
      return NextResponse.json(
        { error: "forbidden", message: "Permission announcements.create ou kb.create requise" },
        { status: 403 },
      );
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "invalid_input", message: "multipart/form-data attendu" },
        { status: 400 },
      );
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "invalid_input", message: "Champ 'file' manquant ou invalide" },
        { status: 400 },
      );
    }

    const result = await uploadImageToBlob(file);

    await logAudit({
      actor: auth.userId,
      action: "upload.blob",
      target_type: "blob",
      target_id: result.url,
      diff: { size: result.size, contentType: result.contentType },
      ip: extractIp(request),
      userAgent: extractUserAgent(request),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof BlobUploadError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    if (err instanceof WorkAuthError) {
      return handleWorkAuthError(err);
    }
    console.error("[upload/blob] failed:", err);
    return NextResponse.json(
      { error: "internal", message: "Upload failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/uploads/blob/route.ts
git commit -m "feat(work/api): POST /uploads/blob (Vercel Blob upload)"
```

---

### Task 13 : Endpoints GET/POST `/api/work/v1/announcements`

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/announcements/route.ts`

- [ ] **Step 1 : Créer le route handler**

Fichier `EriniumFactionWeb/src/app/api/work/v1/announcements/route.ts` :

```ts
/**
 * GET  /api/work/v1/announcements  — liste filtrée
 * POST /api/work/v1/announcements  — création + notifs + Discord
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  requireStaff,
  handleWorkAuthError,
} from "@/lib/work/permissions";
import { logAudit, extractIp, extractUserAgent } from "@/lib/work/audit";
import {
  AnnouncementCreateSchema,
  AnnouncementListQuerySchema,
} from "@/lib/work/validators";
import { sanitizeTiptapHtml } from "@/lib/work/sanitize";
import { listAnnouncements } from "@/lib/work/announcements/queries";
import { createAnnouncement } from "@/lib/work/announcements/mutations";
import { notifyAnnouncement } from "@/lib/work/announcements/notify";
import { dispatchWorkEvent } from "@/lib/work/discord-events";

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff(request, "announcements.read");

    const url = new URL(request.url);
    const rawQuery = {
      severity: url.searchParams.get("severity") ?? undefined,
      active_only: url.searchParams.get("active_only") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    };
    const parsed = AnnouncementListQuerySchema.safeParse(rawQuery);
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

    const items = await listAnnouncements(session.userId, parsed.data);
    return NextResponse.json({ items });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff(request, "announcements.create");

    const body = await request.json().catch(() => null);
    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        { error: "invalid_input", message: "Body JSON requis" },
        { status: 400 },
      );
    }

    const parsed = AnnouncementCreateSchema.safeParse(body);
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
    const input = parsed.data;

    const sanitized = sanitizeTiptapHtml(input.body_html);
    if (!sanitized) {
      return NextResponse.json(
        { error: "invalid_input", message: "body_html vide après sanitization" },
        { status: 400 },
      );
    }

    const announcement = await createAnnouncement({
      ...input,
      body_html: sanitized,
      created_by: session.userId,
    });

    await logAudit({
      actor: session.userId,
      action: "announcement.create",
      target_type: "announcement",
      target_id: String(announcement.id),
      diff: { after: announcement },
      ip: extractIp(request),
      userAgent: extractUserAgent(request),
    });

    // Notifs in-app (best-effort).
    const notifStats = await notifyAnnouncement(announcement);

    // Discord (enqueue uniquement en Phase 6a, sender en Phase 11).
    if (announcement.postToDiscord) {
      await dispatchWorkEvent({
        event: "announcement.published",
        workspaceId: null,
        payload: {
          announcement: {
            id: announcement.id,
            title: announcement.title,
            severity: announcement.severity,
            body_excerpt: announcement.bodyHtml.replace(/<[^>]+>/g, " ").slice(0, 500),
            pinned: announcement.pinned,
            link: `/admin/work/announcements?focus=${announcement.id}`,
          },
          actor: {
            id: session.userId,
            discord_id: session.discordId,
            discord_name: session.discordName,
          },
        },
      });
      if (announcement.severity === "critical") {
        await dispatchWorkEvent({
          event: "announcement.critical",
          workspaceId: null,
          payload: {
            announcement: {
              id: announcement.id,
              title: announcement.title,
              link: `/admin/work/announcements?focus=${announcement.id}`,
            },
            actor: {
              id: session.userId,
              discord_id: session.discordId,
              discord_name: session.discordName,
            },
          },
        });
      }
    }

    return NextResponse.json(
      { announcement, notif_stats: notifStats },
      { status: 201 },
    );
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/announcements/route.ts
git commit -m "feat(work/api): GET list + POST create /announcements (notifs + Discord)"
```

---

### Task 14 : Endpoints `/api/work/v1/announcements/[id]`

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/route.ts`

- [ ] **Step 1 : Créer le route handler GET/PATCH/DELETE**

Fichier `EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/route.ts` :

```ts
/**
 * GET    /api/work/v1/announcements/:id  — détail + acks list
 * PATCH  /api/work/v1/announcements/:id  — édite + diff mentions notifs supp.
 * DELETE /api/work/v1/announcements/:id  — soft delete
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  requireStaff,
  handleWorkAuthError,
} from "@/lib/work/permissions";
import { logAudit, extractIp, extractUserAgent } from "@/lib/work/audit";
import { AnnouncementPatchSchema } from "@/lib/work/validators";
import { sanitizeTiptapHtml } from "@/lib/work/sanitize";
import {
  getAnnouncementById,
} from "@/lib/work/announcements/queries";
import {
  updateAnnouncement,
  deleteAnnouncement,
} from "@/lib/work/announcements/mutations";
import { diffMentions } from "@/lib/work/mentions";
import { createNotificationsBatch } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireStaff(request, "announcements.read");
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id == null) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const item = await getAnnouncementById(id, session.userId);
    if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    return handleWorkAuthError(err);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireStaff(request, "announcements.update");
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id == null) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const before = await getAnnouncementById(id, session.userId);
    if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const body = await request.json().catch(() => null);
    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        { error: "invalid_input", message: "Body JSON requis" },
        { status: 400 },
      );
    }
    const parsed = AnnouncementPatchSchema.safeParse(body);
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
    const patch = parsed.data;

    let sanitized: string | undefined;
    if (patch.body_html !== undefined) {
      const s = sanitizeTiptapHtml(patch.body_html);
      if (!s) {
        return NextResponse.json(
          { error: "invalid_input", message: "body_html vide après sanitization" },
          { status: 400 },
        );
      }
      sanitized = s;
    }

    const updated = await updateAnnouncement(id, {
      ...patch,
      body_html: sanitized,
    });
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await logAudit({
      actor: session.userId,
      action: "announcement.update",
      target_type: "announcement",
      target_id: String(id),
      diff: { before, after: updated },
      ip: extractIp(request),
      userAgent: extractUserAgent(request),
    });

    // Notifs supplémentaires pour les NOUVELLES mentions seulement.
    if (sanitized) {
      const { addedIds } = diffMentions(before.bodyHtml, sanitized);
      if (addedIds.length > 0) {
        const filtered = updated.createdBy != null
          ? addedIds.filter((uid) => uid !== updated.createdBy)
          : addedIds;
        await createNotificationsBatch({
          user_ids: filtered,
          kind: "announcement_mention",
          title: `Vous avez été mentionné dans une annonce : ${updated.title}`,
          body: updated.bodyHtml.replace(/<[^>]+>/g, " ").slice(0, 200),
          link: `/admin/work/announcements?focus=${updated.id}`,
        });
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    return handleWorkAuthError(err);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireStaff(request, "announcements.delete");
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id == null) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const before = await getAnnouncementById(id, session.userId);
    if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const ok = await deleteAnnouncement(id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await logAudit({
      actor: session.userId,
      action: "announcement.delete",
      target_type: "announcement",
      target_id: String(id),
      diff: { before },
      ip: extractIp(request),
      userAgent: extractUserAgent(request),
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/route.ts
git commit -m "feat(work/api): GET detail + PATCH + DELETE /announcements/[id]"
```

---

### Task 15 : Endpoint POST `/api/work/v1/announcements/[id]/ack`

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/ack/route.ts`

- [ ] **Step 1 : Créer le route handler**

Fichier `EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/ack/route.ts` :

```ts
/**
 * POST /api/work/v1/announcements/:id/ack
 *
 * Idempotent : INSERT ... ON CONFLICT DO NOTHING. Renvoie 200 que ce soit la
 * première ack ou une ré-ack. Le payload de réponse indique `already_acked`.
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  requireStaff,
  handleWorkAuthError,
} from "@/lib/work/permissions";
import { logAudit, extractIp, extractUserAgent } from "@/lib/work/audit";
import { ackAnnouncement } from "@/lib/work/announcements/mutations";
import { getAnnouncementById } from "@/lib/work/announcements/queries";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireStaff(request, "announcements.ack");
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const announcement = await getAnnouncementById(id, session.userId);
    if (!announcement) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { inserted, alreadyAcked } = await ackAnnouncement(id, session.userId);

    if (inserted) {
      await logAudit({
        actor: session.userId,
        action: "announcement.ack",
        target_type: "announcement",
        target_id: String(id),
        diff: { user_id: session.userId },
        ip: extractIp(request),
        userAgent: extractUserAgent(request),
      });
    }

    return NextResponse.json({
      announcement_id: id,
      acked: true,
      already_acked: alreadyAcked,
    });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/ack/route.ts
git commit -m "feat(work/api): POST /announcements/[id]/ack (idempotent)"
```

---

### Task 16 : Endpoint POST `/api/work/v1/announcements/[id]/pin`

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/pin/route.ts`

- [ ] **Step 1 : Créer le route handler**

Fichier `EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/pin/route.ts` :

```ts
/**
 * POST /api/work/v1/announcements/:id/pin
 * Body : { pinned: boolean }
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  requireStaff,
  handleWorkAuthError,
} from "@/lib/work/permissions";
import { logAudit, extractIp, extractUserAgent } from "@/lib/work/audit";
import { AnnouncementPinSchema } from "@/lib/work/validators";
import { setAnnouncementPinned } from "@/lib/work/announcements/mutations";
import { getAnnouncementById } from "@/lib/work/announcements/queries";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireStaff(request, "announcements.update");
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        { error: "invalid_input", message: "Body JSON requis" },
        { status: 400 },
      );
    }
    const parsed = AnnouncementPinSchema.safeParse(body);
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

    const before = await getAnnouncementById(id, session.userId);
    if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const updated = await setAnnouncementPinned(id, parsed.data.pinned);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await logAudit({
      actor: session.userId,
      action: "announcement.pin",
      target_type: "announcement",
      target_id: String(id),
      diff: { before: { pinned: before.pinned }, after: { pinned: updated.pinned } },
      ip: extractIp(request),
      userAgent: extractUserAgent(request),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/announcements/[id]/pin/route.ts
git commit -m "feat(work/api): POST /announcements/[id]/pin"
```

---

### Task 17 : Smoke test mutations annonces

**Files:**
- Create: `EriniumFactionWeb/scripts/smoke-phase6a-announcements.ts`

- [ ] **Step 1 : Créer le script smoke**

Fichier `EriniumFactionWeb/scripts/smoke-phase6a-announcements.ts` :

```ts
/**
 * Smoke test E2E des helpers DB annonces (Phase 6a).
 *
 * Usage :
 *   $env:DATABASE_URL="postgresql://..."
 *   pnpm tsx scripts/smoke-phase6a-announcements.ts
 *
 * Crée une annonce, la patch, la pin, la unpin, ack par 2 users, soft-delete.
 */
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  setAnnouncementPinned,
  ackAnnouncement,
} from "../src/lib/work/announcements/mutations";
import { listAnnouncements, getAnnouncementById } from "../src/lib/work/announcements/queries";
import { query } from "../src/lib/db";

function log(ok: boolean, msg: string) {
  console.log(`${ok ? "[OK]  " : "[FAIL]"} ${msg}`);
  if (!ok) process.exit(1);
}

async function ensureTwoStaffUsers(): Promise<[number, number]> {
  // Récupère 2 user_ids existants ayant un rôle staff (sinon le test ne peut tourner).
  const rows = (await query(
    `SELECT DISTINCT sur.user_id FROM staff_user_roles sur LIMIT 2`,
    [],
  )) as Array<{ user_id: number }>;
  if (rows.length < 2) {
    console.error("Besoin d'au moins 2 staff users en DB pour ce smoke.");
    process.exit(1);
  }
  return [Number(rows[0].user_id), Number(rows[1].user_id)];
}

async function main() {
  console.log("=== Smoke test Phase 6a annonces ===\n");
  const [u1, u2] = await ensureTwoStaffUsers();

  // 1. Create
  const a = await createAnnouncement({
    title: "[SMOKE] Annonce de test",
    body_html: "<p>Hello @world</p>",
    severity: "info",
    pinned: false,
    starts_at: null,
    ends_at: null,
    post_to_discord: false,
    created_by: u1,
  });
  log(a.id > 0 && a.title.startsWith("[SMOKE]"), `createAnnouncement id=${a.id}`);

  // 2. Update title + severity
  const a2 = await updateAnnouncement(a.id, {
    title: "[SMOKE] Renamed",
    severity: "important",
  });
  log(a2?.title === "[SMOKE] Renamed" && a2?.severity === "important", "updateAnnouncement title+severity");

  // 3. Pin
  const ap = await setAnnouncementPinned(a.id, true);
  log(ap?.pinned === true, "setAnnouncementPinned(true)");

  // 4. Unpin
  const au = await setAnnouncementPinned(a.id, false);
  log(au?.pinned === false, "setAnnouncementPinned(false)");

  // 5. Ack par u1
  const ack1 = await ackAnnouncement(a.id, u1);
  log(ack1.inserted === true && ack1.alreadyAcked === false, `ack u1 inserted=${ack1.inserted}`);

  // 6. Ack idempotent : re-ack u1
  const ack1bis = await ackAnnouncement(a.id, u1);
  log(ack1bis.inserted === false && ack1bis.alreadyAcked === true, "ack u1 idempotent");

  // 7. Ack par u2
  const ack2 = await ackAnnouncement(a.id, u2);
  log(ack2.inserted === true, `ack u2 inserted=${ack2.inserted}`);

  // 8. List : annonce visible + acks=2 + ackedByMe=true pour u1
  const list = await listAnnouncements(u1, { limit: 50, offset: 0 });
  const found = list.find((x) => x.id === a.id);
  log(!!found && found.acksCount === 2 && found.ackedByMe === true,
    `listAnnouncements found acksCount=${found?.acksCount} ackedByMe=${found?.ackedByMe}`);

  // 9. Detail
  const detail = await getAnnouncementById(a.id, u1);
  log(!!detail && detail.ackedUsers.length === 2, `getAnnouncementById ackedUsers=${detail?.ackedUsers.length}`);

  // 10. Soft delete
  const del = await deleteAnnouncement(a.id);
  log(del === true, "deleteAnnouncement");

  // 11. Soft-deleted invisible dans list
  const list2 = await listAnnouncements(u1, { limit: 50, offset: 0 });
  log(!list2.find((x) => x.id === a.id), "soft-deleted invisible dans list");

  // 12. Update sur deleted -> null
  const failPatch = await updateAnnouncement(a.id, { title: "ghost" });
  log(failPatch === null, "updateAnnouncement sur soft-deleted -> null");

  console.log("\n=== Smoke test PASSED ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
```

- [ ] **Step 2 : Exécuter le smoke**

```bash
cd EriniumFactionWeb && $env:DATABASE_URL="<url-neon>" ; pnpm tsx scripts/smoke-phase6a-announcements.ts
```

Attendu : toutes les lignes `[OK]`, "Smoke test PASSED" affiché.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/scripts/smoke-phase6a-announcements.ts
git commit -m "test(work/announcements): smoke E2E mutations + queries"
```

---

## Phase C — Éditeur Tiptap partagé

### Task 18 : Slash commands extension

**Files:**
- Create: `EriniumFactionWeb/src/components/work/editor/SlashCommandsExtension.tsx`

- [ ] **Step 1 : Créer l'extension**

Fichier `EriniumFactionWeb/src/components/work/editor/SlashCommandsExtension.tsx` :

```tsx
"use client";

/**
 * Extension Tiptap "slash commands" : tape `/` dans l'éditeur pour ouvrir
 * une palette d'insertion rapide (heading, code, table, image, etc.).
 *
 * Basé sur @tiptap/suggestion (déjà installé pour les mentions).
 */
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { useEffect, useImperativeHandle, useState, forwardRef } from "react";
import type { Editor, Range } from "@tiptap/core";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

const COMMAND_ITEMS: SlashCommandItem[] = [
  {
    title: "Titre 1",
    description: "Grand titre de section",
    icon: "H1",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Titre 2",
    description: "Sous-titre",
    icon: "H2",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Titre 3",
    description: "Sous-section",
    icon: "H3",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Liste à puces",
    description: "Liste non ordonnée",
    icon: "•",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Liste ordonnée",
    description: "Liste numérotée",
    icon: "1.",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Citation",
    description: "Bloc de citation",
    icon: "❝",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Bloc de code",
    description: "Code avec coloration syntaxique",
    icon: "</>",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Tableau",
    description: "3×3 par défaut, redimensionnable",
    icon: "▦",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: "Séparateur",
    description: "Trait horizontal",
    icon: "—",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

interface SlashListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

const SlashList = forwardRef<{ onKeyDown: (e: KeyboardEvent) => boolean }, SlashListProps>(
  function SlashList(props, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "ArrowUp") {
          setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
          return true;
        }
        if (e.key === "ArrowDown") {
          setSelectedIndex((selectedIndex + 1) % props.items.length);
          return true;
        }
        if (e.key === "Enter") {
          const item = props.items[selectedIndex];
          if (item) props.command(item);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 max-h-80 overflow-y-auto w-64">
        {props.items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-zinc-400">Aucun résultat</div>
        ) : (
          props.items.map((item, idx) => (
            <button
              key={item.title}
              type="button"
              onClick={() => props.command(item)}
              className={`w-full text-left px-3 py-2 flex gap-3 items-center text-sm hover:bg-zinc-800 ${
                idx === selectedIndex ? "bg-zinc-800" : ""
              }`}
            >
              <span className="w-7 h-7 flex items-center justify-center bg-zinc-800 rounded font-mono text-xs">
                {item.icon}
              </span>
              <span className="flex flex-col">
                <span className="text-zinc-100">{item.title}</span>
                <span className="text-zinc-400 text-xs">{item.description}</span>
              </span>
            </button>
          ))
        )}
      </div>
    );
  },
);

export const SlashCommandsExtension = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return COMMAND_ITEMS.filter(
            (i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
          ).slice(0, 10);
        },
        render: () => {
          let component: ReactRenderer<{ onKeyDown: (e: KeyboardEvent) => boolean }> | null = null;
          let popup: TippyInstance[] = [];
          return {
            onStart: (props: { editor: Editor; clientRect?: (() => DOMRect | null) | null; items: SlashCommandItem[]; command: (item: SlashCommandItem) => void }) => {
              component = new ReactRenderer(SlashList, { props, editor: props.editor });
              if (!props.clientRect) return;
              popup = tippy("body", {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate(props: { clientRect?: (() => DOMRect | null) | null; items: SlashCommandItem[] }) {
              component?.updateProps(props);
              if (!props.clientRect) return;
              popup[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            },
            onKeyDown(props: { event: KeyboardEvent }) {
              if (props.event.key === "Escape") {
                popup[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit() {
              popup[0]?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/editor/SlashCommandsExtension.tsx
git commit -m "feat(work/editor): SlashCommandsExtension (palette d'insertion /commands)"
```

---

### Task 19 : Bouton image upload Blob

**Files:**
- Create: `EriniumFactionWeb/src/components/work/editor/BlobImageButton.tsx`

- [ ] **Step 1 : Créer le composant**

Fichier `EriniumFactionWeb/src/components/work/editor/BlobImageButton.tsx` :

```tsx
"use client";

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/core";

interface Props {
  editor: Editor;
}

export function BlobImageButton({ editor }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/work/v1/uploads/blob", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}): ${txt}`);
      }
      const data = (await res.json()) as { url: string };
      editor.chain().focus().setImage({ src: data.url }).run();
    } catch (err) {
      console.error("[BlobImageButton] upload failed:", err);
      alert(`Échec upload: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Insérer une image"
        className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50"
      >
        {uploading ? "…" : "🖼"}
      </button>
    </>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/editor/BlobImageButton.tsx
git commit -m "feat(work/editor): BlobImageButton (upload image via /uploads/blob)"
```

---

### Task 20 : Toolbar éditeur

**Files:**
- Create: `EriniumFactionWeb/src/components/work/editor/EditorToolbar.tsx`

- [ ] **Step 1 : Créer la toolbar**

Fichier `EriniumFactionWeb/src/components/work/editor/EditorToolbar.tsx` :

```tsx
"use client";

import type { Editor } from "@tiptap/core";
import { BlobImageButton } from "./BlobImageButton";

interface Props {
  editor: Editor;
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded hover:bg-zinc-800 ${
        active ? "bg-zinc-700 text-white" : "text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor }: Props) {
  return (
    <div className="flex flex-wrap gap-1 items-center border-b border-zinc-800 px-2 py-1 bg-zinc-900/50">
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Gras (Ctrl+B)"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italique (Ctrl+I)"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Souligné (Ctrl+U)"
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Barré"
      >
        <s>S</s>
      </ToolbarButton>
      <span className="w-px h-5 bg-zinc-700 mx-1" />
      <ToolbarButton
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Titre 1"
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Titre 2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Titre 3"
      >
        H3
      </ToolbarButton>
      <span className="w-px h-5 bg-zinc-700 mx-1" />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Liste"
      >
        •
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Liste ordonnée"
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Citation"
      >
        ❝
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Bloc de code"
      >
        {"</>"}
      </ToolbarButton>
      <span className="w-px h-5 bg-zinc-700 mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insérer un tableau"
      >
        ▦
      </ToolbarButton>
      <BlobImageButton editor={editor} />
      <ToolbarButton
        onClick={() => {
          const url = window.prompt("URL du lien :");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        title="Insérer un lien"
      >
        🔗
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().unsetLink().run()}
        title="Retirer le lien"
      >
        ⛓
      </ToolbarButton>
    </div>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/editor/EditorToolbar.tsx
git commit -m "feat(work/editor): EditorToolbar (markdown-like + image + table)"
```

---

### Task 21 : Éditeur Tiptap principal partagé

**Files:**
- Create: `EriniumFactionWeb/src/components/work/editor/TiptapEditor.tsx`

- [ ] **Step 1 : Créer le composant éditeur**

Fichier `EriniumFactionWeb/src/components/work/editor/TiptapEditor.tsx` :

```tsx
"use client";

/**
 * Éditeur Tiptap PARTAGÉ — annonces (Phase 6a) + KB (Phase 6b).
 *
 * Différences avec src/components/work/kanban/TipTapEditor.tsx (cartes) :
 *  - Code blocks avec lowlight (coloration syntaxique).
 *  - Tables (extensions @tiptap/extension-table*).
 *  - Slash commands palette (`/heading`, `/table`, etc.).
 *  - Image upload via Vercel Blob (POST /api/work/v1/uploads/blob).
 *  - Mentions partagées avec l'extension existante.
 *
 * Le HTML produit est sanitize côté serveur via sanitizeTiptapHtml.
 */
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { common, createLowlight } from "lowlight";
import { useEffect } from "react";
import { EditorToolbar } from "./EditorToolbar";
import { SlashCommandsExtension } from "./SlashCommandsExtension";
import { createMentionExtension } from "@/components/work/kanban/TipTapMentionExtension";

const lowlight = createLowlight(common);

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  minHeight?: number;
}

export function TiptapEditor({
  value,
  onChange,
  placeholder = "Tapez / pour insérer un bloc, ou commencez à écrire…",
  editable = true,
  minHeight = 200,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // remplacé par CodeBlockLowlight
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Image,
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      SlashCommandsExtension,
      createMentionExtension(),
    ],
    content: value,
    editable,
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      onChange(ed.getHTML());
    },
  });

  // Sync externe (utilisé quand on ouvre un modal sur une annonce existante).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
      {editable && <EditorToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="prose prose-invert max-w-none px-4 py-3"
        style={{ minHeight }}
      />
    </div>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/editor/TiptapEditor.tsx
git commit -m "feat(work/editor): TiptapEditor partagé (lowlight, tables, slash, blob upload)"
```

---

## Phase D — UI annonces

### Task 22 : Hooks React Query annonces

**Files:**
- Create: `EriniumFactionWeb/src/hooks/work/useAnnouncements.ts`

- [ ] **Step 1 : Créer les hooks**

Fichier `EriniumFactionWeb/src/hooks/work/useAnnouncements.ts` :

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AnnouncementListItem,
  AnnouncementDetail,
} from "@/lib/work/announcements/types";
import type {
  AnnouncementCreateInput,
  AnnouncementPatchInput,
} from "@/lib/work/validators";

const KEY = ["work", "announcements"] as const;

interface ListParams {
  severity?: "info" | "important" | "critical";
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export function useAnnouncementsList(params: ListParams = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: async (): Promise<{ items: AnnouncementListItem[] }> => {
      const qs = new URLSearchParams();
      if (params.severity) qs.set("severity", params.severity);
      if (params.activeOnly !== undefined) qs.set("active_only", String(params.activeOnly));
      if (params.limit) qs.set("limit", String(params.limit));
      if (params.offset) qs.set("offset", String(params.offset));
      const res = await fetch(`/api/work/v1/announcements?${qs.toString()}`);
      if (!res.ok) throw new Error(`Liste annonces (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useAnnouncementDetail(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: async (): Promise<AnnouncementDetail> => {
      const res = await fetch(`/api/work/v1/announcements/${id}`);
      if (!res.ok) throw new Error(`Détail annonce (${res.status})`);
      return res.json();
    },
    enabled: id != null && id > 0,
    staleTime: 15_000,
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AnnouncementCreateInput) => {
      const res = await fetch("/api/work/v1/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.message ?? `Création (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, "list"] });
    },
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: AnnouncementPatchInput }) => {
      const res = await fetch(`/api/work/v1/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.message ?? `Édition (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [...KEY, "list"] });
      qc.invalidateQueries({ queryKey: [...KEY, "detail", id] });
    },
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/work/v1/announcements/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Suppression (${res.status})`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "list"] }),
  });
}

export function useAckAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/work/v1/announcements/${id}/ack`, { method: "POST" });
      if (!res.ok) throw new Error(`Ack (${res.status})`);
      return res.json();
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [...KEY, "list"] });
      qc.invalidateQueries({ queryKey: [...KEY, "detail", id] });
    },
  });
}

export function usePinAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: number; pinned: boolean }) => {
      const res = await fetch(`/api/work/v1/announcements/${id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) throw new Error(`Pin (${res.status})`);
      return res.json();
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [...KEY, "list"] });
      qc.invalidateQueries({ queryKey: [...KEY, "detail", id] });
    },
  });
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/hooks/work/useAnnouncements.ts
git commit -m "feat(work/hooks): useAnnouncements (list/detail/create/update/delete/ack/pin)"
```

---

### Task 23 : Composant SeverityBadge

**Files:**
- Create: `EriniumFactionWeb/src/components/work/announcements/SeverityBadge.tsx`

- [ ] **Step 1 : Créer le composant**

Fichier `EriniumFactionWeb/src/components/work/announcements/SeverityBadge.tsx` :

```tsx
import type { AnnouncementSeverity } from "@/lib/work/announcements/types";

const STYLES: Record<AnnouncementSeverity, { bg: string; text: string; label: string }> = {
  info: { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-300", label: "Info" },
  important: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-300", label: "Important" },
  critical: { bg: "bg-rose-500/15 border-rose-500/30", text: "text-rose-300", label: "Critique" },
};

export function SeverityBadge({ severity }: { severity: AnnouncementSeverity }) {
  const s = STYLES[severity];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/announcements/SeverityBadge.tsx
git commit -m "feat(work/announcements): SeverityBadge component"
```

---

### Task 24 : Carte annonce dans la liste

**Files:**
- Create: `EriniumFactionWeb/src/components/work/announcements/AnnouncementCard.tsx`

- [ ] **Step 1 : Créer le composant carte**

Fichier `EriniumFactionWeb/src/components/work/announcements/AnnouncementCard.tsx` :

```tsx
"use client";

import type { AnnouncementListItem } from "@/lib/work/announcements/types";
import { SeverityBadge } from "./SeverityBadge";

interface Props {
  announcement: AnnouncementListItem;
  onOpen: (id: number) => void;
  onAck?: (id: number) => void;
  canAck: boolean;
}

function bodyExcerpt(html: string, len = 200): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= len) return text;
  return text.slice(0, len - 1) + "…";
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return "à l'instant";
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 7 * 86400) return `il y a ${Math.floor(diffSec / 86400)}j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function AnnouncementCard({ announcement, onOpen, onAck, canAck }: Props) {
  return (
    <article
      className={`border rounded-lg p-4 bg-zinc-950 hover:bg-zinc-900/60 transition cursor-pointer ${
        announcement.pinned ? "border-amber-500/40" : "border-zinc-800"
      }`}
      onClick={() => onOpen(announcement.id)}
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={announcement.severity} />
          {announcement.pinned && (
            <span className="text-xs text-amber-300">📌 Épinglée</span>
          )}
        </div>
        <span className="text-xs text-zinc-500">{timeAgo(announcement.createdAt)}</span>
      </header>
      <h3 className="text-lg font-semibold text-zinc-100 mb-1">{announcement.title}</h3>
      <p className="text-sm text-zinc-400 mb-3">{bodyExcerpt(announcement.bodyHtml)}</p>
      <footer className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Par {announcement.createdByName ?? "?"} · {announcement.acksCount} ack
          {announcement.acksCount > 1 ? "s" : ""}
        </span>
        {canAck && !announcement.ackedByMe && onAck && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAck(announcement.id);
            }}
            className="px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs"
          >
            J'ai vu
          </button>
        )}
        {announcement.ackedByMe && <span className="text-emerald-400">✓ Vu</span>}
      </footer>
    </article>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/announcements/AnnouncementCard.tsx
git commit -m "feat(work/announcements): AnnouncementCard (liste)"
```

---

### Task 25 : Modal création/édition annonce

**Files:**
- Create: `EriniumFactionWeb/src/components/work/announcements/AnnouncementFormModal.tsx`

- [ ] **Step 1 : Créer le modal**

Fichier `EriniumFactionWeb/src/components/work/announcements/AnnouncementFormModal.tsx` :

```tsx
"use client";

import { useState, useEffect } from "react";
import type {
  AnnouncementSeverity,
  AnnouncementDetail,
} from "@/lib/work/announcements/types";
import type { AnnouncementCreateInput, AnnouncementPatchInput } from "@/lib/work/validators";
import { TiptapEditor } from "@/components/work/editor/TiptapEditor";
import { SeverityBadge } from "./SeverityBadge";
import { useCreateAnnouncement, useUpdateAnnouncement } from "@/hooks/work/useAnnouncements";

interface Props {
  open: boolean;
  onClose: () => void;
  existing?: AnnouncementDetail | null;
}

const SEVERITIES: AnnouncementSeverity[] = ["info", "important", "critical"];

export function AnnouncementFormModal({ open, onClose, existing }: Props) {
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("info");
  const [pinned, setPinned] = useState(false);
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");
  const [postToDiscord, setPostToDiscord] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateAnnouncement();
  const updateMut = useUpdateAnnouncement();

  useEffect(() => {
    if (open && existing) {
      setTitle(existing.title);
      setBodyHtml(existing.bodyHtml);
      setSeverity(existing.severity);
      setPinned(existing.pinned);
      setStartsAt(existing.startsAt ? existing.startsAt.slice(0, 16) : "");
      setEndsAt(existing.endsAt ? existing.endsAt.slice(0, 16) : "");
      setPostToDiscord(existing.postToDiscord);
    } else if (open && !existing) {
      setTitle("");
      setBodyHtml("");
      setSeverity("info");
      setPinned(false);
      setStartsAt("");
      setEndsAt("");
      setPostToDiscord(false);
    }
    setError(null);
  }, [open, existing]);

  if (!open) return null;

  async function handleSubmit() {
    setError(null);
    if (!title.trim()) return setError("Titre requis");
    if (!bodyHtml || bodyHtml === "<p></p>") return setError("Body requis");

    const payload = {
      title: title.trim(),
      body_html: bodyHtml,
      severity,
      pinned,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      post_to_discord: postToDiscord,
    };

    try {
      if (existing) {
        await updateMut.mutateAsync({ id: existing.id, patch: payload as AnnouncementPatchInput });
      } else {
        await createMut.mutateAsync(payload as AnnouncementCreateInput);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const submitting = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center pt-16 pb-8 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-3xl mx-4 p-6 space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">
            {existing ? "Éditer l'annonce" : "Nouvelle annonce"}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            ✕
          </button>
        </header>

        <label className="block">
          <span className="text-sm text-zinc-300">Titre</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-100"
            maxLength={200}
            placeholder="Annonce…"
          />
        </label>

        <div>
          <span className="text-sm text-zinc-300">Sévérité</span>
          <div className="mt-1 flex gap-2">
            {SEVERITIES.map((s) => (
              <label
                key={s}
                className={`flex items-center gap-2 px-2 py-1 rounded border cursor-pointer ${
                  severity === s ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700"
                }`}
              >
                <input
                  type="radio"
                  name="severity"
                  className="accent-emerald-500"
                  checked={severity === s}
                  onChange={() => setSeverity(s)}
                />
                <SeverityBadge severity={s} />
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm text-zinc-300">Contenu</span>
          <div className="mt-1">
            <TiptapEditor value={bodyHtml} onChange={setBodyHtml} minHeight={240} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-zinc-300">Début (optionnel)</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-300">Fin (optionnel)</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-100"
            />
          </label>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="accent-emerald-500"
            />
            Épingler
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={postToDiscord}
              onChange={(e) => setPostToDiscord(e.target.checked)}
              className="accent-emerald-500"
            />
            Diffuser sur Discord
          </label>
        </div>

        {error && <div className="text-sm text-rose-400">{error}</div>}

        <footer className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Annuler
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
          >
            {submitting ? "Publication…" : existing ? "Sauvegarder" : "Publier"}
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/announcements/AnnouncementFormModal.tsx
git commit -m "feat(work/announcements): AnnouncementFormModal (create/edit)"
```

---

### Task 26 : Modal détail annonce

**Files:**
- Create: `EriniumFactionWeb/src/components/work/announcements/AnnouncementDetailModal.tsx`

- [ ] **Step 1 : Créer le modal détail**

Fichier `EriniumFactionWeb/src/components/work/announcements/AnnouncementDetailModal.tsx` :

```tsx
"use client";

import { useAnnouncementDetail, useAckAnnouncement, useDeleteAnnouncement, usePinAnnouncement } from "@/hooks/work/useAnnouncements";
import { SeverityBadge } from "./SeverityBadge";

interface Props {
  id: number | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  perms: {
    canEdit: boolean;
    canDelete: boolean;
    canAck: boolean;
    canPin: boolean;
  };
}

export function AnnouncementDetailModal({ id, open, onClose, onEdit, perms }: Props) {
  const { data, isLoading, error } = useAnnouncementDetail(id);
  const ackMut = useAckAnnouncement();
  const deleteMut = useDeleteAnnouncement();
  const pinMut = usePinAnnouncement();

  if (!open || id == null) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center pt-16 pb-8 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-3xl mx-4 p-6 space-y-4">
        <header className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-2">
            {data && (
              <>
                <div className="flex gap-2 items-center">
                  <SeverityBadge severity={data.severity} />
                  {data.pinned && <span className="text-xs text-amber-300">📌 Épinglée</span>}
                </div>
                <h2 className="text-2xl font-semibold text-zinc-100">{data.title}</h2>
                <span className="text-xs text-zinc-500">
                  Par {data.createdByName ?? "?"} ·{" "}
                  {new Date(data.createdAt).toLocaleString("fr-FR")}
                </span>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            ✕
          </button>
        </header>

        {isLoading && <div className="text-sm text-zinc-400">Chargement…</div>}
        {error && <div className="text-sm text-rose-400">Erreur : {(error as Error).message}</div>}

        {data && (
          <>
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
            />

            <section className="border-t border-zinc-800 pt-4 space-y-2">
              <h3 className="text-sm font-medium text-zinc-300">
                Acks ({data.acksCount})
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.ackedUsers.map((u) => (
                  <span
                    key={u.userId}
                    className="px-2 py-0.5 rounded bg-zinc-800 text-xs text-zinc-300"
                  >
                    {u.discordName ?? `user#${u.userId}`}
                  </span>
                ))}
                {data.ackedUsers.length === 0 && (
                  <span className="text-xs text-zinc-500">Aucun ack pour le moment.</span>
                )}
              </div>
            </section>

            <footer className="border-t border-zinc-800 pt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {perms.canAck && !data.ackedByMe && (
                  <button
                    onClick={() => ackMut.mutate(data.id)}
                    disabled={ackMut.isPending}
                    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                  >
                    {ackMut.isPending ? "…" : "J'ai vu"}
                  </button>
                )}
                {data.ackedByMe && (
                  <span className="px-3 py-2 text-emerald-400">✓ Acquittée</span>
                )}
              </div>
              <div className="flex gap-2">
                {perms.canPin && (
                  <button
                    onClick={() => pinMut.mutate({ id: data.id, pinned: !data.pinned })}
                    disabled={pinMut.isPending}
                    className="px-3 py-2 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {data.pinned ? "Désépingler" : "Épingler"}
                  </button>
                )}
                {perms.canEdit && (
                  <button
                    onClick={onEdit}
                    className="px-3 py-2 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    Éditer
                  </button>
                )}
                {perms.canDelete && (
                  <button
                    onClick={() => {
                      if (confirm("Supprimer cette annonce ?")) {
                        deleteMut.mutate(data.id, { onSuccess: onClose });
                      }
                    }}
                    disabled={deleteMut.isPending}
                    className="px-3 py-2 rounded bg-rose-600/80 hover:bg-rose-600 text-white disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/announcements/AnnouncementDetailModal.tsx
git commit -m "feat(work/announcements): AnnouncementDetailModal (detail + actions)"
```

---

### Task 27 : Vue principale `AnnouncementsView`

**Files:**
- Create: `EriniumFactionWeb/src/components/work/announcements/AnnouncementsView.tsx`

- [ ] **Step 1 : Créer la vue principale**

Fichier `EriniumFactionWeb/src/components/work/announcements/AnnouncementsView.tsx` :

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAnnouncementsList, useAckAnnouncement } from "@/hooks/work/useAnnouncements";
import { useWorkPerms } from "@/hooks/work/useWorkPerms";
import type { AnnouncementSeverity } from "@/lib/work/announcements/types";
import { AnnouncementCard } from "./AnnouncementCard";
import { AnnouncementFormModal } from "./AnnouncementFormModal";
import { AnnouncementDetailModal } from "./AnnouncementDetailModal";

const SEVERITIES: AnnouncementSeverity[] = ["info", "important", "critical"];

export function AnnouncementsView() {
  const search = useSearchParams();
  const router = useRouter();
  const focusId = search.get("focus");
  const { hasPerm } = useWorkPerms();

  const [severityFilter, setSeverityFilter] = useState<AnnouncementSeverity | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [textFilter, setTextFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(
    focusId ? Number(focusId) : null,
  );
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    if (focusId) {
      const id = Number(focusId);
      if (Number.isFinite(id) && id > 0) setDetailId(id);
    }
  }, [focusId]);

  const listQuery = useAnnouncementsList({
    severity: severityFilter ?? undefined,
    activeOnly,
    limit: 100,
  });
  const ackMut = useAckAnnouncement();

  const items = listQuery.data?.items ?? [];
  const filtered = items.filter((a) =>
    textFilter.trim() === ""
      ? true
      : a.title.toLowerCase().includes(textFilter.toLowerCase()),
  );
  const pinned = filtered.filter((a) => a.pinned);
  const active = filtered.filter((a) => !a.pinned);

  function closeDetail() {
    setDetailId(null);
    if (focusId) {
      const params = new URLSearchParams(search.toString());
      params.delete("focus");
      router.replace(`/admin/work/announcements?${params.toString()}`);
    }
  }

  const editingItem = editingId
    ? (filtered.find((x) => x.id === editingId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Annonces</h1>
        {hasPerm("announcements.create") && (
          <button
            onClick={() => {
              setEditingId(null);
              setFormOpen(true);
            }}
            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            + Nouvelle annonce
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 border border-zinc-800 rounded p-3 bg-zinc-900/40">
        <input
          type="text"
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          placeholder="Rechercher dans les titres…"
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 w-64"
        />
        <div className="flex gap-1">
          <button
            onClick={() => setSeverityFilter(null)}
            className={`px-2 py-1 rounded text-xs ${
              severityFilter === null ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            Toutes
          </button>
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-2 py-1 rounded text-xs ${
                severityFilter === s ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="accent-emerald-500"
          />
          Actives seulement
        </label>
      </div>

      {listQuery.isLoading && <div className="text-zinc-400">Chargement…</div>}
      {listQuery.error && (
        <div className="text-rose-400">Erreur : {(listQuery.error as Error).message}</div>
      )}

      {pinned.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-amber-300 mb-2">Épinglées</h2>
          <div className="grid gap-3">
            {pinned.map((a) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                onOpen={(id) => setDetailId(id)}
                onAck={(id) => ackMut.mutate(id)}
                canAck={hasPerm("announcements.ack")}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
          {activeOnly ? "Annonces actives" : "Toutes les annonces"}
        </h2>
        <div className="grid gap-3">
          {active.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              onOpen={(id) => setDetailId(id)}
              onAck={(id) => ackMut.mutate(id)}
              canAck={hasPerm("announcements.ack")}
            />
          ))}
          {active.length === 0 && !listQuery.isLoading && (
            <p className="text-sm text-zinc-500 italic">Aucune annonce.</p>
          )}
        </div>
      </section>

      <AnnouncementFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        existing={editingItem as never /* AnnouncementDetail */}
      />
      <AnnouncementDetailModal
        id={detailId}
        open={detailId != null}
        onClose={closeDetail}
        onEdit={() => {
          if (detailId != null) {
            setEditingId(detailId);
            setFormOpen(true);
            setDetailId(null);
          }
        }}
        perms={{
          canEdit: hasPerm("announcements.update"),
          canDelete: hasPerm("announcements.delete"),
          canAck: hasPerm("announcements.ack"),
          canPin: hasPerm("announcements.update"),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/announcements/AnnouncementsView.tsx
git commit -m "feat(work/announcements): AnnouncementsView (toolbar + sections pinned/actives)"
```

---

### Task 28 : Page `/admin/work/announcements` refonte

**Files:**
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/announcements/page.tsx`

- [ ] **Step 1 : Remplacer l'EmptyState par AnnouncementsView**

Lire le fichier actuel `EriniumFactionWeb/src/app/(admin)/admin/work/announcements/page.tsx` pour conserver le pattern auth/perm wrapper, puis remplacer le contenu :

```tsx
"use client";

import { AccessDenied } from "@/components/work/AccessDenied";
import { AnnouncementsView } from "@/components/work/announcements/AnnouncementsView";
import { useWorkPerms } from "@/hooks/work/useWorkPerms";

export default function AnnouncementsPage() {
  const { hasPerm, isLoading } = useWorkPerms();
  if (isLoading) return <div className="p-6 text-zinc-400">Chargement…</div>;
  if (!hasPerm("announcements.read")) return <AccessDenied perm="announcements.read" />;
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AnnouncementsView />
    </div>
  );
}
```

- [ ] **Step 2 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 3 : Commit**

```bash
git add EriniumFactionWeb/src/app/(admin)/admin/work/announcements/page.tsx
git commit -m "feat(work/announcements): refonte page (suppression EmptyState)"
```

---

### Task 29 : Notifications panel étendu

**Files:**
- Modify: `EriniumFactionWeb/src/components/work/notifications/NotificationsPanel.tsx`

- [ ] **Step 1 : Identifier le switch des kinds**

Ouvrir `EriniumFactionWeb/src/components/work/notifications/NotificationsPanel.tsx`. Localiser le code qui rend une notification (probable switch ou map sur `kind` pour choisir icône / couleur / label).

- [ ] **Step 2 : Ajouter les 2 nouveaux kinds au mapping**

Dans le mapping existant `KIND_META` (ou équivalent), ajouter :

```ts
announcement: {
  icon: "📣",
  label: "Annonce",
  className: "text-zinc-300",
},
announcement_mention: {
  icon: "📣@",
  label: "Mention dans une annonce",
  className: "text-amber-300",
},
```

Si la structure exacte du fichier est différente, adapter en gardant l'esprit : afficher un icône reconnaissable et router le click sur `notification.link` (qui pointe déjà vers `/admin/work/announcements?focus=<id>`).

- [ ] **Step 3 : Build**

```bash
cd EriniumFactionWeb && pnpm build
```

Attendu : build passe.

- [ ] **Step 4 : Commit**

```bash
git add EriniumFactionWeb/src/components/work/notifications/NotificationsPanel.tsx
git commit -m "feat(work/notifications): handle kinds announcement + announcement_mention"
```

---

### Task 30 : Mise à jour docs

**Files:**
- Modify: `docs/permissions.md`

- [ ] **Step 1 : Ajouter la section Annonces**

Lire `docs/permissions.md` pour identifier le format de section actuel (probable tableau `| Permission | Description | Rôles seedés |`). Ajouter en fin de fichier :

```markdown
## Annonces (Phase 6a — Work Panel)

| Permission | Description | Rôles seedés |
|-----------|-------------|--------------|
| `announcements.create` | Créer une annonce | admin, lead |
| `announcements.read` | Voir les annonces | admin, lead, mod, support |
| `announcements.update` | Éditer + épingler/désépingler | admin, lead |
| `announcements.delete` | Supprimer (soft-delete) | admin, lead |
| `announcements.ack` | Acquitter ("J'ai vu") | admin, lead, mod, support |
```

- [ ] **Step 2 : Commit**

```bash
git add docs/permissions.md
git commit -m "docs(permissions): +section Annonces Phase 6a (5 perms)"
```

---

### Task 31 : Checklist UI de validation finale

**Files:**
- Aucun fichier modifié, vérification manuelle.

- [ ] **Step 1 : Lancer le dev server**

```bash
cd EriniumFactionWeb && pnpm dev
```

Attendre que le port `:3000` réponde.

- [ ] **Step 2 : Connexion staff + checklist Annonces**

Ouvrir `http://localhost:3000/admin/work/announcements`. Connecté en tant que user avec rôle `admin` ou `lead`.

Vérifier dans l'ordre :

1. La page affiche le titre "Annonces" + bouton "+ Nouvelle annonce" + toolbar filtres. Aucun EmptyState.
2. Cliquer "+ Nouvelle annonce" ouvre le modal `AnnouncementFormModal`.
3. Dans le modal : taper un titre, choisir severity "Critique", sélectionner "Diffuser sur Discord", remplir le body avec :
   - Un paragraphe normal.
   - Un titre H2 via le bouton toolbar H2.
   - Une liste à puces via slash command `/liste`.
   - Un tableau 3×3 via slash command `/tableau`.
   - Un bloc de code via slash command `/code` puis taper `console.log("hello")` — vérifier que la syntaxe est colorisée.
   - Insérer une image via le bouton 🖼 (uploader un PNG < 5 MB). Vérifier que l'image s'affiche dans l'éditeur.
   - Ajouter une mention `@<utilisateur>` (un user staff existant).
4. Activer "Épingler".
5. Cliquer "Publier".
6. Le modal se ferme, la liste affiche la nouvelle annonce en section "Épinglées" avec le badge Critique.
7. Cliquer sur la carte → modal détail s'ouvre : body rendu correctement (avec image, code colorisé, tableau).
8. Cliquer "J'ai vu" → compteur ack passe à 1 et badge "✓ Acquittée".
9. Se déconnecter, se reconnecter avec un autre user staff (mod ou support).
10. La notification apparaît dans le panneau (badge non-lu) avec icône 📣 et titre `[CRITICAL] <titre>`.
11. Si l'utilisateur est mentionné, une seconde notif `📣@` apparaît.
12. Cliquer sur la notification → redirige vers `/admin/work/announcements?focus=<id>` et le modal détail s'ouvre directement.
13. Cliquer "J'ai vu" en tant que ce second user → compteur passe à 2.
14. Retour user admin : ouvrir le modal détail, dans la section "Acks (2)" les deux discord_name sont listés.
15. Cliquer "Désépingler" → l'annonce passe en section "Annonces actives".
16. Cliquer "Éditer" → modal form rouvre avec les valeurs pré-remplies. Modifier le titre, sauvegarder.
17. Cliquer "Supprimer" + confirmer → annonce disparaît de la liste.

- [ ] **Step 3 : Vérifier la queue webhook**

Ouvrir une console psql / un client SQL connecté à Neon :

```sql
SELECT id, event_type, status, created_at FROM webhook_deliveries
WHERE event_type IN ('announcement.published', 'announcement.critical')
ORDER BY created_at DESC LIMIT 5;
```

Attendu : pour l'annonce critique avec `post_to_discord = true`, on a 2 lignes status `pending` :
- 1 `announcement.published`
- 1 `announcement.critical`

- [ ] **Step 4 : Vérifier les notifs in-app**

```sql
SELECT user_id, kind, title, link, created_at FROM notifications
WHERE kind IN ('announcement', 'announcement_mention')
ORDER BY created_at DESC LIMIT 20;
```

Attendu : N lignes avec kind `announcement` (une par staff actif — chaque user avec >=1 rôle dans `staff_user_roles` ET `users.deleted_at IS NULL`) + lignes `announcement_mention` pour chaque user @-mentionné dans le body.

- [ ] **Step 5 : Vérifier audit log**

```sql
SELECT actor_user_id, action, target_type, target_id, created_at
FROM audit_log
WHERE action LIKE 'announcement.%'
ORDER BY created_at DESC LIMIT 20;
```

Attendu : entrées `announcement.create`, `announcement.update`, `announcement.pin`, `announcement.ack`, `announcement.delete`.

- [ ] **Step 6 : Documenter dans knowissue.md si bug rencontré**

Si l'un des steps ci-dessus a révélé un bug qui a dû être corrigé, ajouter une entrée à `docs/knowissue.md` :

```markdown
## YYYY-MM-DD — Annonces Phase 6a — <bref titre>

**Système :** Work Panel Annonces / Tiptap éditeur partagé.
**Symptôme :** <description bug>
**Cause :** <root cause>
**Fix :** <ce qui a été fait>
```

- [ ] **Step 7 : Commit final si knowissue.md mis à jour**

```bash
git add docs/knowissue.md
git commit -m "docs(knowissue): annonces Phase 6a — <titre court>"
```

---

## Critères de succès (récap)

À la fin de l'exécution de ces 31 tâches, vérifier que **tous** les points suivants sont satisfaits :

1. `cd EriniumFactionWeb && pnpm build` passe (TS + ESLint).
2. `pnpm tsx scripts/smoke-phase6a-announcements.ts` passe.
3. La migration `phase7-announcements-kb.sql` a été appliquée par `_initDbInternal` (vérification : `\d announcements` et `\d announcement_acks` retournent les tables avec leurs index).
4. La table `webhook_deliveries` reçoit `announcement.published` (+ `announcement.critical` si applicable) status `pending` à chaque publication avec toggle Discord activé.
5. La table `notifications` reçoit N lignes kind `announcement` (1 par staff actif, défini par >=1 rôle dans `staff_user_roles` ET `users.deleted_at IS NULL`) à chaque publication, + lignes `announcement_mention` pour chaque user @-mentionné dans le body.
6. Upload d'image via éditeur Tiptap renvoie une URL `https://*.public.blob.vercel-storage.com/...`.
7. Page `/admin/work/announcements` n'affiche plus l'EmptyState mais la vue complète.
8. Permissions `announcements.{create,read,update,delete,ack}` documentées dans `docs/permissions.md`.
9. Toutes les checklist UI Task 31 passent sans erreur runtime.
