# Work Panel — Phase 6 : Annonces + Knowledge Base (Design Spec)

**Auteur :** EriniumGroup
**Date :** 2026-05-26
**Statut :** Validé (brainstorming clos)
**Découpage exécution :** Phase 6a (Annonces + éditeur partagé) puis Phase 6b (Knowledge Base)

---

## 1. Goal

Ajouter au Work Panel staff deux modules d'information interne :

1. **Annonces** — Communications staff datées, sévérité info / important / critical, épinglage, suivi des acks, broadcast Discord optionnel, panneau de notifications.
2. **Knowledge Base** — Base de connaissances hiérarchique (Spaces → Categories → Articles) avec versioning, recherche fulltext et restauration depuis l'historique.

Les deux features partagent un **éditeur Tiptap étendu** (uploads d'images via Vercel Blob, code-block avec coloration syntaxique, tables, slash commands, mentions). Cet éditeur est implémenté dans la Phase 6a et réutilisé tel quel en Phase 6b.

---

## 2. Contexte

Les pages `/admin/work/announcements` et `/admin/work/kb` existent déjà sous forme de stubs `EmptyState` derrière un check de permission. La Phase 6 remplace ces stubs par les UI complètes et leurs API.

Les schémas DB des deux modules **n'existent pas** : ils sont créés par une migration unique `phase7-announcements-kb.sql` (le numéro `phase6` est déjà consommé par la migration Erisclave / roadmap).

Les permissions `announcements.*` existent déjà dans les seeds des rôles `admin` / `lead` (`src/lib/db/index.ts` lignes ~880-1040). Les permissions `kb_articles.*` y existent aussi mais correspondent à une feature jamais buildée : on les remplace par `kb.*` (cf. Section 13 — Questions ouvertes).

L'event Discord `announcement.published` et `announcement.critical` est déjà déclaré dans le type `WorkEventType` (`src/lib/work/discord-events.ts` lignes 58-59). Le sender HTTP réel est livré en Phase 11 ; Phase 6a se contente d'enqueuer dans `webhook_deliveries`.

Les types `NotificationKind` (`src/lib/db/index.ts` lignes 5829-5840) ne contiennent pas encore `announcement` ni `announcement_mention` — ils seront ajoutés en Phase 6a.

---

## 3. Décisions de scope

### Ce qui est **dans** v1 (Phase 6 totale)

**Phase 6a — Annonces**
- CRUD annonces (titre, body HTML Tiptap, severity, période d'affichage, pin, post_to_discord).
- Three severities : `info`, `important`, `critical`. Affichage différencié.
- Pin : remonte l'annonce en tête de liste pour tous.
- Période d'affichage : `starts_at` / `ends_at` (filtrage des annonces actives).
- Audience : TOUS les staff (>=1 role staff) voient TOUTES les annonces. Pas de ciblage à la création.
- Acks : un user peut ack une annonce. Compteur visible dans la vue détail.
- Notifications : 1 notification `announcement` par staff actif (>=1 role dans `staff_user_roles`, non désactivé) à la publication. 1 notification `announcement_mention` supplémentaire pour chaque user mentionné dans le body.
- Broadcast Discord (toggle `post_to_discord`) : enqueue `announcement.published` (+ `announcement.critical` si severity = `critical`).
- Panneau de notifications côté UI : focus sur l'annonce concernée via `?focus=<id>`.
- Éditeur Tiptap partagé enrichi : image upload (Vercel Blob), code-block (lowlight), tables, slash commands, mentions.

**Phase 6b — Knowledge Base**
- CRUD Spaces (top-level) > Categories (1 niveau) > Articles.
- Articles : titre, body HTML, tags, statut `draft`/`published`/`archived`.
- Versioning : chaque update d'un article archive l'ancienne version dans `kb_article_versions`. Restore depuis l'historique.
- Recherche fulltext (Postgres tsvector + GIN) sur titre + body + tags.
- Réutilisation 100 % de l'éditeur Tiptap partagé livré en 6a.

### Ce qui n'est **pas** dans v1

- Audience targeting (ciblage par rôle ou user) : décision brainstorm explicite. Toutes les annonces sont visibles par TOUT le staff. Le filtre se fait au moment de la lecture (eye candy "lu/non-lu") pas à la création.
- Réactions emoji sur annonces.
- Workflow d'approbation / draft review pour annonces.
- Brouillons collaboratifs multi-auteurs.
- Notifications email pour annonces (Discord webhook + in-app notifs seulement).
- Commentaires sur articles KB.
- Schedule futur d'annonces (création différée — on a juste `starts_at` qui filtre l'affichage, pas un cron de "publish-later").
- Cross-linking automatique articles ↔ cartes (peut venir plus tard).
- Export PDF / print d'un article.
- i18n (FR uniquement, comme le reste du Work Panel).

---

## 4. Architecture (3 couches)

| Couche | Responsabilité | Modules |
|--------|----------------|---------|
| **DB / lib helpers** | Mutations + queries Postgres typées. `initDb()` toujours en premier. | `src/lib/work/announcements/*.ts`, `src/lib/work/kb/*.ts`, `src/lib/work/blob-upload.ts`, `src/lib/work/sanitize.ts` (étendu) |
| **API routes** | Validation Zod + auth + audit + sanitize. Pas de logique métier inline. | `src/app/api/work/v1/announcements/**/route.ts`, `src/app/api/work/v1/kb/**/route.ts`, `src/app/api/work/v1/uploads/route.ts` |
| **UI / hooks** | React Query hooks + composants Tailwind. Pas d'appels `fetch` directs hors hooks. | `src/components/work/announcements/*`, `src/components/work/kb/*`, `src/components/work/editor/TiptapEditor.tsx` (nouveau, partagé), `src/hooks/work/useAnnouncements.ts`, `src/hooks/work/useKb.ts` |

**Réutilisation existante :**
- `requireStaff(req, "perm.x")` — `src/lib/work/permissions.ts`.
- `logAudit({ actor, action, target_type, target_id, diff, ip, userAgent })` — `src/lib/work/audit.ts`.
- `sanitizeCardDescription(input)` pattern — `src/lib/work/sanitize.ts` (on ajoute `sanitizeTiptapHtml` à la même whitelist élargie).
- `extractMentionedUserIds(html)` — `src/lib/work/mentions.ts`.
- `createNotificationsBatch({user_ids, kind, title, body, link})` — `src/lib/db/index.ts`.
- `dispatchWorkEvent({event, workspaceId, payload})` — `src/lib/work/discord-events.ts`.
- Helper `listActiveStaffUserIds()` (nouveau, simple, dans `src/lib/work/announcements/queries.ts`) qui retourne tous les `user_id` distincts ayant >=1 rôle dans `staff_user_roles` ET non soft-deleted.

---

## 5. Schéma DB — migration `phase7-announcements-kb.sql`

Une seule migration idempotente (toutes les `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`) couvrant Phase 6a + 6b. Phase 6a applique la migration entière dès le début, mais n'utilise que les tables annonces ; les tables KB existent inertes en attendant Phase 6b.

### Tables Phase 6a (Annonces)

```sql
-- Une annonce staff. Audience = TOUT le staff (pas de ciblage en v1).
CREATE TABLE IF NOT EXISTS announcements (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  body_html       TEXT NOT NULL,           -- HTML Tiptap déjà sanitize
  severity        TEXT NOT NULL,            -- 'info' | 'important' | 'critical'
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at       TIMESTAMPTZ,              -- NULL = immédiat
  ends_at         TIMESTAMPTZ,              -- NULL = pas d'expiration
  post_to_discord BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      BIGINT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT chk_severity CHECK (severity IN ('info', 'important', 'critical')),
  CONSTRAINT chk_period CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_announcements_pin_created ON announcements(pinned DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_active_period ON announcements(starts_at, ends_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_severity ON announcements(severity) WHERE deleted_at IS NULL;

-- Ack par user. UNIQUE pour idempotence du POST /ack.
CREATE TABLE IF NOT EXISTS announcement_acks (
  announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_acks_user ON announcement_acks(user_id);
```

### Tables Phase 6b (Knowledge Base)

```sql
-- Top-level container. Slug unique.
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

-- 1 niveau de catégories par space. Pas d'arbo récursive en v1.
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

-- Article. tsvector GENERATED ALWAYS sur title + body + tags.
CREATE TABLE IF NOT EXISTS kb_articles (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT NOT NULL REFERENCES kb_categories(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'archived'
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
  CONSTRAINT chk_status CHECK (status IN ('draft', 'published', 'archived')),
  UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_search ON kb_articles USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category_status ON kb_articles(category_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON kb_articles USING GIN (tags);

-- Historique des versions. 1 ligne par snapshot. Restore = copier vers kb_articles.
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

CREATE INDEX IF NOT EXISTS idx_kb_article_versions_article ON kb_article_versions(article_id, version_no DESC);
```

### Permissions seed (à insérer en fin de migration)

```sql
-- Phase 6a : annonces (les seeds existent déjà mais on les ré-insère idempotent).
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

-- announcements.read + announcements.ack pour tous les rôles staff (incl. mod, support).
INSERT INTO staff_role_permissions (role_id, permission)
SELECT r.id, p.permission
  FROM staff_roles r
  CROSS JOIN (VALUES ('announcements.read'), ('announcements.ack')) AS p(permission)
 WHERE r.slug IN ('mod', 'support')
ON CONFLICT DO NOTHING;

-- Phase 6b : KB. Lecture pour tous, écriture admin/lead.
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

---

## 6. Permissions

| Permission | Description | Rôles seedés |
|-----------|-------------|--------------|
| `announcements.create` | Créer une annonce | admin, lead |
| `announcements.read` | Voir les annonces | admin, lead, mod, support |
| `announcements.update` | Éditer une annonce | admin, lead |
| `announcements.delete` | Soft-delete une annonce | admin, lead |
| `announcements.ack` | Acquitter une annonce | admin, lead, mod, support |
| `kb.create` | Créer space / category / article | admin, lead |
| `kb.read` | Lire les articles | admin, lead, mod, support |
| `kb.update` | Éditer un article (versioning auto) | admin, lead |
| `kb.delete` | Soft-delete article / restore version | admin, lead |

Owner Discord ID `909862540945793094` bypass : wildcard `*`. Les rôles `admin`/`lead`/`mod`/`support` sont déjà seedés au boot DB.

---

## 7. API endpoints

### Phase 6a — Annonces (`src/app/api/work/v1/announcements/`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/announcements` | `announcements.read` | Liste filtrée (pinned d'abord, puis created_at DESC). Query params : `severity`, `active_only`, `limit`, `offset` |
| POST | `/announcements` | `announcements.create` | Crée annonce + enqueue 1 notif par staff actif + Discord (si toggle) |
| GET | `/announcements/:id` | `announcements.read` | Détail + flag `acked_by_me` + compteur acks |
| PATCH | `/announcements/:id` | `announcements.update` | Édite. Diff mentions → notifs supplémentaires |
| DELETE | `/announcements/:id` | `announcements.delete` | Soft delete (set `deleted_at`) |
| POST | `/announcements/:id/ack` | `announcements.ack` | Idempotent `INSERT ... ON CONFLICT DO NOTHING` |
| POST | `/announcements/:id/pin` | `announcements.update` | Body `{pinned: bool}` |

### Phase 6a — Upload partagé (`src/app/api/work/v1/uploads/`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| POST | `/uploads/blob` | `announcements.create` OR `kb.create` (au moins une) | multipart/form-data → Vercel Blob `put(name, file, {access: 'public'})`. Renvoie `{url, size, content_type}`. Max 5 MB, types whitelisted : `image/png`, `image/jpeg`, `image/webp`, `image/gif`. |

### Phase 6b — KB (`src/app/api/work/v1/kb/`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/kb/spaces` | `kb.read` | Liste spaces (deleted_at IS NULL) avec compteur categories |
| POST | `/kb/spaces` | `kb.create` | Crée space |
| PATCH | `/kb/spaces/:id` | `kb.update` | Édite |
| DELETE | `/kb/spaces/:id` | `kb.delete` | Soft delete cascade catégories + articles |
| GET | `/kb/spaces/:id/categories` | `kb.read` | Catégories d'un space + compteur articles |
| POST | `/kb/categories` | `kb.create` | Crée categorie (body : `space_id`, `name`, `slug`) |
| PATCH | `/kb/categories/:id` | `kb.update` | Édite |
| DELETE | `/kb/categories/:id` | `kb.delete` | Soft delete cascade articles |
| GET | `/kb/categories/:id/articles` | `kb.read` | Articles d'une catégorie filtrés par status |
| GET | `/kb/articles/:id` | `kb.read` | Détail article + last 5 versions metadata |
| POST | `/kb/articles` | `kb.create` | Crée article (sanitize body_html) |
| PATCH | `/kb/articles/:id` | `kb.update` | Édite. Snapshot ancienne version dans `kb_article_versions` avant update. Incrémente `current_version` |
| DELETE | `/kb/articles/:id` | `kb.delete` | Soft delete |
| GET | `/kb/articles/:id/versions` | `kb.read` | Historique paginé |
| GET | `/kb/articles/:id/versions/:vno` | `kb.read` | Détail version donnée |
| POST | `/kb/articles/:id/versions/:vno/restore` | `kb.delete` | Restaure : copie la version vers l'article, snapshot le current avant écrasement |
| GET | `/kb/search?q=...` | `kb.read` | Recherche fulltext (tsvector). Renvoie articles + headline + rank |

---

## 8. Validators Zod (Phase 6a)

```ts
// src/lib/work/validators.ts — extensions
import { z } from "zod";

const SeverityEnum = z.enum(["info", "important", "critical"]);

export const AnnouncementCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body_html: z.string().min(1).max(50_000),  // sanitize côté serveur
  severity: SeverityEnum,
  pinned: z.boolean().optional().default(false),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
  post_to_discord: z.boolean().optional().default(false),
});

export const AnnouncementPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body_html: z.string().min(1).max(50_000).optional(),
  severity: SeverityEnum.optional(),
  pinned: z.boolean().optional(),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
  post_to_discord: z.boolean().optional(),
});

export const AnnouncementListQuerySchema = z.object({
  severity: SeverityEnum.optional(),
  active_only: z.union([z.literal("true"), z.literal("false")]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const PinPatchSchema = z.object({ pinned: z.boolean() });
```

---

## 9. UI — Annonces

### Page `/admin/work/announcements`

**Layout :**
- Header : titre "Annonces" + bouton "Nouvelle annonce" (gated par `announcements.create`).
- Toolbar filtres : severity multi-select, toggle "actives seulement", recherche texte (filter client-side sur titre).
- Liste :
  - Section 1 : annonces pinned (toujours en haut).
  - Section 2 : annonces actives non-pinned (filtrées par période).
  - Section 3 : annonces expirées/futures (sous accordéon "Archive").
- Chaque carte (composant `AnnouncementCard`) : badge severity coloré (vert/orange/rouge), titre, body excerpt (200 chars stripped HTML), auteur + date relative, compteur acks `12 / 28`, bouton ack si pas encore acked, badge "épinglée" si pinned.

### Modal "Nouvelle annonce" (composant `AnnouncementFormModal`)

- Champ titre (input text).
- Champ severity (radio group : info / important / critical avec couleur badge).
- Éditeur Tiptap partagé (composant `TiptapEditor` Phase 6a).
- Pin toggle.
- Période : 2 datetime-local optionnels (starts_at / ends_at).
- Toggle "Diffuser sur Discord" (post_to_discord).
- CTA "Publier" qui appelle `useCreateAnnouncement`.

> Pas de section "Audience" / "Scope" : toutes les annonces sont visibles par TOUT le staff (décision brainstorm explicite). Voir Section 15.

### Modal détail (composant `AnnouncementDetailModal`)

- Body HTML rendu (déjà sanitize en DB) avec `dangerouslySetInnerHTML` (sécurisé).
- Compteur acks + liste des users qui ont ack (admin only).
- Bouton "Ack" si pas acked et user a `announcements.ack`.
- Boutons Éditer / Supprimer si user a la permission.

### Panneau notifications

- L'intégration existante de notifications dans le header staff (`src/components/work/notifications/NotificationsPanel.tsx`) doit gérer les nouveaux kinds `announcement` et `announcement_mention`.
- Click sur une notification annonce → ouvre `/admin/work/announcements?focus=<id>` qui auto-ouvre le modal détail.

---

## 10. UI — Knowledge Base (Phase 6b)

### Page `/admin/work/kb`

**Layout 3 colonnes :**
- Colonne 1 (sidebar gauche) : arbo Spaces > Categories. Expand/collapse. Bouton "+" par space et par category (gated `kb.create`).
- Colonne 2 (centre) : liste articles de la category sélectionnée (titre, status badge, tags chips, updated_at). Filter status, recherche texte.
- Colonne 3 (droite, panneau quand article sélectionné) : titre + body rendu + tags + historique (last 5 versions cliquables).

### Modal édition article

- Mêmes contrôles que pour Tiptap (réutilisation directe de `TiptapEditor`).
- Champ tags (multi-input chips).
- Status select (draft / published / archived).
- Bouton "Voir historique" → modal qui liste toutes les versions + bouton restore par version.

### Recherche fulltext

- Page `/admin/work/kb` : barre de recherche globale en top header. Resultats inline avec headline (extrait) et lien direct vers l'article.

---

## 11. Éditeur Tiptap partagé

**Localisation :** `src/components/work/editor/TiptapEditor.tsx` (nouveau, séparé du `src/components/work/kanban/TipTapEditor.tsx` existant qui reste pour les cartes).

**Extensions :**
- `@tiptap/starter-kit` (déjà installé v3) — paragraphs, headings, lists, blockquote, code inline, hr.
- `@tiptap/extension-link` (déjà installé) — liens.
- `@tiptap/extension-image` (déjà installé) — images. Customisé pour upload via Blob au lieu d'URL prompt.
- `@tiptap/extension-mention` (déjà installé) — mentions @user (réutilise `TipTapMentionExtension` existant).
- `@tiptap/extension-placeholder` (déjà installé).
- `@tiptap/extension-text-align` (déjà installé).
- `@tiptap/extension-underline` (déjà installé).
- `@tiptap/extension-text-style` + `@tiptap/extension-color` (déjà installés).
- **`@tiptap/extension-code-block-lowlight`** + **`lowlight`** (à installer) — code blocks avec coloration.
- **`@tiptap/extension-table`** + **`@tiptap/extension-table-row`** + **`@tiptap/extension-table-cell`** + **`@tiptap/extension-table-header`** (à installer) — tables.
- **Slash commands** : implémentation custom via `@tiptap/suggestion` (déjà installé) qui ouvre une palette quand l'utilisateur tape `/`. Items : Heading 1/2/3, Code block, Table, Image, Quote, Divider, Bullet list, Ordered list.

**Upload images :**
- Bouton toolbar "Image" → ouvre input file → POST `/api/work/v1/uploads/blob` → URL Blob retournée → insère `<img src="<blob-url>" />` dans l'éditeur.
- Drag & drop sur l'éditeur : même flux.
- Paste depuis clipboard d'image : même flux.

**Sanitize whitelist élargie (`sanitizeTiptapHtml`) :**
- Toutes les balises de `sanitizeCardDescription` actuelles.
- Ajout : `table`, `thead`, `tbody`, `tr`, `td`, `th` avec attribut `colspan`, `rowspan`.
- `pre` + `code` avec attribut `class="language-xxx"` (lowlight ajoute cette classe).
- `img` avec `src` whitelisté http(s) **plus** les URLs Vercel Blob (`https://*.public.blob.vercel-storage.com/...`).

---

## 12. Cross-cutting

### 12.1 Sanitize

- `sanitizeCardDescription` (existant) reste utilisé pour les descriptions de cartes (kanban) — pas touché.
- Nouveau : `sanitizeTiptapHtml(input)` dans `src/lib/work/sanitize.ts` — whitelist élargie incluant `table*`, `pre.code.language-*`, image avec src Blob whitelistée.
- Toutes les routes `POST` / `PATCH` qui acceptent `body_html` (annonces, articles KB) appellent `sanitizeTiptapHtml` avant insert/update.

### 12.2 Audit

- `logAudit({actor, action, target_type, target_id, diff, ip, userAgent})` appelé sur :
  - `announcement.create`, `announcement.update`, `announcement.delete`, `announcement.pin`, `announcement.ack` (oui, même les ack pour traçabilité staff).
  - `kb.space.{create,update,delete}`, `kb.category.{create,update,delete}`, `kb.article.{create,update,delete,restore}`.
- `diff` contient `{before, after}` pour les updates, `{after}` pour les creates, `{before}` pour les deletes.

### 12.3 Notifications

- Extension du type `NotificationKind` dans `src/lib/db/index.ts` :
  - `'announcement'` — notification de masse envoyée à TOUS les staff actifs (chaque user ayant >=1 rôle dans `staff_user_roles` ET `users.deleted_at IS NULL`).
  - `'announcement_mention'` — mention spécifique d'un user dans le body (en plus de la notif `announcement` qu'il a déjà reçue).
- Pas de colonne `payload_json` dans la table `notifications` actuelle. On utilise `link = "/admin/work/announcements?focus=<id>"` pour le routing et on encode le contexte dans `title` / `body` :
  - `title` = `[CRITICAL] <titre annonce>` pour kind `announcement`.
  - `title` = `Vous avez été mentionné dans une annonce` pour kind `announcement_mention`.
  - `body` = 200 chars stripped HTML extract du body annonce.
- Implémentation : INSERT batch en 1 round-trip via `createNotificationsBatch({user_ids: <tous_les_staff_actifs>, kind: 'announcement', ...})`. Pas de logique de filtre d'audience à appliquer.

### 12.4 Discord webhook

- Phase 6a enqueue seulement (sender HTTP en Phase 11).
- Toujours `dispatchWorkEvent({event: "announcement.published", workspaceId: null, payload: {...}})`.
- Si severity = `critical` ET `post_to_discord = true`, enqueue **aussi** un event `announcement.critical` (pour permettre aux webhooks de filter par event_type).

### 12.5 Upload Vercel Blob

- Package `@vercel/blob` à installer.
- Env var `BLOB_READ_WRITE_TOKEN` côté Vercel (déjà disponible en prod normalement, sinon à demander).
- Endpoint single `/api/work/v1/uploads/blob` réutilisable annonces + KB.
- Limites : 5 MB, formats whitelistés (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
- Filename : `work/<year>/<month>/<nanoid>.<ext>` pour éviter collisions et faciliter l'archivage.

---

## 13. Découpage en 2 phases

### Phase 6a — Annonces + éditeur partagé

**Périmètre :**
- Migration `phase7-announcements-kb.sql` (tables annonces + KB, mais KB inerte).
- Permissions seed (annonces + kb).
- Éditeur Tiptap partagé `src/components/work/editor/TiptapEditor.tsx` + extensions + slash commands + image upload.
- `sanitizeTiptapHtml` dans sanitize.ts.
- Type `NotificationKind` étendu.
- DB helpers `src/lib/work/announcements/{mutations,queries}.ts`.
- Endpoint `/api/work/v1/uploads/blob`.
- 7 endpoints annonces.
- Hooks React Query.
- UI page annonces refonte (suppression EmptyState) + composants.
- Panneau notifs gère les nouveaux kinds.
- Smoke test mutations annonces.
- Smoke UI checklist manuelle.

**Critères de succès Phase 6a :**
1. Build `pnpm build` passe (TS + ESLint).
2. Smoke `pnpm tsx scripts/smoke-phase6a-announcements.ts` passe (create / patch / pin / ack / delete).
3. Création d'annonce critical avec `post_to_discord = true` génère une entrée `webhook_deliveries` status pending event_type `announcement.critical`.
4. Création annonce génère N notifs (1 par staff actif) kind `announcement`.
5. Mention @user dans body génère 1 notif supplémentaire kind `announcement_mention`.
6. Upload image via éditeur Tiptap → URL Blob retournée → image insérée affichable.
7. Ack idempotent (second POST renvoie même payload sans 5xx).
8. Soft-delete : `GET /announcements` filtre les `deleted_at IS NOT NULL`.
9. Page `/admin/work/announcements` affiche la liste, le modal create, le modal détail, le bouton ack, sans EmptyState.
10. `docs/permissions.md` mis à jour avec les 5 perms annonces.
11. `docs/knowissue.md` propre (pas de nouvelle entrée nécessaire si pas de bug).

### Phase 6b — Knowledge Base

**Périmètre :**
- DB helpers `src/lib/work/kb/{mutations,queries,search}.ts`.
- 16 endpoints KB.
- UI page kb refonte + composants (TreeSidebar, ArticleList, ArticleDetail, VersionHistory modal).
- Hooks `useKbSpaces`, `useKbCategories`, `useKbArticles`, `useKbSearch`.
- Réutilisation 100 % du `TiptapEditor` livré en 6a.
- Smoke test mutations KB.
- Smoke UI checklist manuelle.

**Critères de succès Phase 6b :**
1. Build passe.
2. Smoke `pnpm tsx scripts/smoke-phase6b-kb.ts` passe (CRUD complet spaces / cats / articles + version + restore + search).
3. Update d'un article snapshot l'ancienne version dans `kb_article_versions` et incrémente `current_version`.
4. Restore d'une version `v2` sur un article actuellement à `v5` snapshot le `v5` actuel puis écrase avec `v2`, incrémente à `v6`.
5. Recherche `/api/work/v1/kb/search?q=mot` trouve un article publié contenant `mot` dans titre / body / tags, classé par rank.
6. Soft-delete d'un space cascade categories + articles (visibles dans GET=non).
7. Page `/admin/work/kb` affiche les 3 colonnes, permet création space / category / article, ouverture détail, historique.
8. `docs/permissions.md` mis à jour avec les 4 perms kb.

---

## 14. Considérations transverses

### 14.1 Performance (500-1000 staff)

- `GET /announcements` avec `active_only=true` doit utiliser `idx_announcements_active_period`.
- Compteur acks calculé en SQL `(SELECT COUNT(*) FROM announcement_acks WHERE announcement_id = a.id)` agrégé une seule fois dans la query liste.
- Insertion des N notifs au moment d'une publication utilise `createNotificationsBatch` (1 round-trip via UNNEST).
- Recherche tsvector toujours via index GIN, pas de `LIKE %...%`.

### 14.2 Concurrence

- Pas de locks DB explicites en Phase 6.
- Update concurrent d'un article KB : last-write-wins en v1. Acceptable (l'historique préserve les versions, pas de perte de données).
- Ack : idempotent via `ON CONFLICT DO NOTHING` sur la PK composite.

### 14.3 Sécurité

- `dangerouslySetInnerHTML` côté UI **uniquement** sur du contenu déjà passé par `sanitizeTiptapHtml`.
- Blob URLs vérifiés par `URL` parse côté serveur dans `sanitizeTiptapHtml` (regex sur hostname `*.public.blob.vercel-storage.com`).
- Endpoint upload exige une des deux perms (`announcements.create` OR `kb.create`) — fail-closed si user n'a aucune.
- Audit log capture IP + UA pour toutes les mutations.

### 14.4 i18n

- FR uniquement (cohérent avec le reste du Work Panel).

---

## 15. Ce qui n'est PAS dans v1 (rappel détaillé)

| Feature | Pourquoi reportée |
|---------|-------------------|
| Réactions emoji annonces | Hors brief — peut venir en Phase 6c si demandée |
| Schedule futur annonces | YAGNI v1 — `starts_at` filtre l'affichage, pas un cron |
| Workflow approbation drafts | Pas demandé pour staff |
| Notifications email | Stack email pas en place — Discord + in-app suffisent |
| Commentaires articles KB | Hors brief |
| Cross-link articles ↔ cartes | Phase ultérieure |
| Export PDF KB | YAGNI v1 |
| i18n EN | Pas dans le périmètre Work Panel |
| Recherche fulltext annonces | YAGNI — filter client suffit en v1 (peu d'annonces) |

---

## 16. Cleanup post-migration

Une fois Phase 6 entière livrée :

- Supprimer les seeds `kb_articles.*` du fichier `src/lib/db/index.ts` (lignes ~880-1040) — ces perms correspondent à une feature jamais buildée et sont remplacées par `kb.*`. À faire dans une PR cleanup séparée pour ne pas mélanger avec la livraison feature.
- Idem si on trouve d'autres perms orphelines liées à des features stubs.

---

## 17. Questions ouvertes

1. **Legacy `kb_articles.*` perms** : confirmer que `kb_articles.create / read / update / delete` dans les seeds existants (`src/lib/db/index.ts` lignes ~880-1040) ne sont utilisées **nulle part** dans le code actuel avant de les supprimer en cleanup post-Phase 6. Un `grep -rn 'kb_articles\.' src/` devrait remonter 0 résultats côté checks `requireStaff(..., "kb_articles.X")`. Si une référence reste, soit on renomme vers `kb.*` à ce moment, soit on garde les deux en alias DB.
2. **Token Vercel Blob en dev** : confirmer que `BLOB_READ_WRITE_TOKEN` est disponible dans `.env.local` du dev local (Vercel l'injecte automatiquement en preview/prod). Si absent en dev, prévoir un fallback "file URL" via le bucket vercel ou une variable séparée.
3. **Quel cap d'historique versions KB ?** En v1 on conserve tout (pas de purge). Si on a beaucoup d'éditions sur un article populaire, la table `kb_article_versions` peut grossir. Acceptable pour le MVP — purge à envisager en Phase 7+ si besoin.
4. **Mentions cross-feature** : si un user est mentionné simultanément dans 2 annonces dans la même seconde, on génère 2 notifs distinctes (1 par annonce). Pas de dedupe. Confirmé OK car contexte différent.
5. **Définition de "staff actif"** : la résolution "tous les staff" se base sur `staff_user_roles` (tous les users qui ont au moins un rôle) AVEC filtre `users.deleted_at IS NULL` (exclure les comptes désactivés). Confirmé : c'est le comportement attendu.
