# Migration Erisclave + Roadmap + Specs vers le Work Panel

**Date** : 2026-05-25
**Statut** : Validé (en attente du plan d'implémentation)

## Goal

Éliminer l'app Electron Erisclave et le contenu statique du submodule `docs/` (`roadmap.html` + `specs/*.html`) au profit d'une expérience équivalente intégrée dans le Work Panel staff (`EriniumFactionWeb`). Source de vérité unique : la DB Neon Postgres. Pas d'export GitHub, pas de fichiers locaux.

## Contexte

**État actuel (avant migration)** :
- App Electron `docs/applications/erisclave/` (~1200 lignes JS) qui génère des specs HTML + sync `roadmap.html`
- 54 specs HTML dans `docs/specs/` (4.4 MB), **0 JSON twin** — tous sont legacy, jamais générés par Erisclave
- `docs/roadmap.html` : 263 KB de HTML statique avec cards par projet, badges status, progression bars, tags
- Workflow d'édition lourd : ouvrir Erisclave → modifier → sauver localement → commit + push manuel du submodule
- Pas d'accès mobile, pas de concurrence multi-user, pas d'audit

**État cible** :
- Page `/admin/work/roadmap` qui affiche la grille des projects (lue depuis DB)
- Page `/admin/work/specs/<slug>` qui rend chaque spec (HTML servi depuis DB)
- Page `/admin/work/erisclave` avec le flow de création/édition guidé (les 9 écrans Erisclave portés en React)
- Édition mobile-friendly, concurrence gérée (lock optimiste), audit log natif
- Submodule `docs/` allégé : on supprime `roadmap.html`, `specs/`, `applications/erisclave/`. On garde les MD de doc dev (`ASSETS_WORKFLOW.md`, `ranks.md`, `permissions.md`, `knowissue.md`, etc.)

## Architecture (3 couches)

```
┌──────────────────────────────────────────────────────────────────┐
│  UI React (Work Panel admin)                                     │
│  - /admin/work/roadmap          (grille des projects)            │
│  - /admin/work/specs/<slug>     (visualisation d'un spec)        │
│  - /admin/work/erisclave        (création/édition guidée)        │
│  Thème : crème/Liquid Glass clair (préserve Erisclave)           │
└──────────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────────┐
│  API REST (Next.js App Router, routes /api/work/v1/roadmap/...)  │
│  - GET    /roadmap                 (liste projects + counts)     │
│  - CRUD   /roadmap/projects        (create/read/update/delete)   │
│  - CRUD   /roadmap/tasks                                         │
│  - CRUD   /roadmap/specs                                         │
│  - POST   /roadmap/specs/:id/assets  (upload Vercel Blob)        │
│  Auth : requireStaff(perm) + permissions granulaires             │
│  Concurrency : header x-expected-updated-at (lock optimiste)     │
└──────────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────────┐
│  DB Neon Postgres                                                │
│  4 tables : work_roadmap_projects / _tasks / _specs / _spec_assets│
└──────────────────────────────────────────────────────────────────┘
```

## Schema DB

```sql
-- Un "card" sur la roadmap = un project. Regroupe des tasks + des specs.
CREATE TABLE work_roadmap_projects (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('todo','wip','test','done','blocked')),
  tags            TEXT[] NOT NULL DEFAULT '{}',     -- ex: ['rpg','combat']
  category        TEXT,                              -- ex: 'gameplay'
  order_idx       INT NOT NULL DEFAULT 0,            -- pour réordonner
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Les sous-tâches affichées dans le card roadmap.
CREATE TABLE work_roadmap_tasks (
  id              SERIAL PRIMARY KEY,
  project_id      INT NOT NULL REFERENCES work_roadmap_projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('todo','done')) DEFAULT 'todo',
  order_idx       INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_work_roadmap_tasks_project ON work_roadmap_tasks(project_id);

-- Le cahier des charges lui-même. Deux 'kind' coexistent.
CREATE TABLE work_roadmap_specs (
  id              SERIAL PRIMARY KEY,
  project_id      INT REFERENCES work_roadmap_projects(id) ON DELETE SET NULL,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('legacy','structured')),
  feature_type    TEXT,                              -- 'bloc','item','gui','system'... (null si legacy)
  answers         JSONB,                             -- JSON twin (null si legacy)
  raw_html        TEXT,                              -- HTML brut (null si structured)
  status          TEXT,
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ( (kind='legacy' AND raw_html IS NOT NULL AND answers IS NULL)
       OR (kind='structured' AND answers IS NOT NULL AND raw_html IS NULL) )
);
CREATE INDEX idx_work_roadmap_specs_slug ON work_roadmap_specs(slug);
CREATE INDEX idx_work_roadmap_specs_project ON work_roadmap_specs(project_id);

-- Assets (images) attachés aux specs structurés.
CREATE TABLE work_roadmap_spec_assets (
  id              SERIAL PRIMARY KEY,
  spec_id         INT NOT NULL REFERENCES work_roadmap_specs(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  blob_url        TEXT NOT NULL,
  uploaded_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Important** : ces tables sont ajoutées au flow `DB_SKIP_INIT=1` actuel (migration manuelle via script, pas auto au boot).

## Permissions (granulaires)

3 nouvelles permissions ajoutées au registre `docs/permissions.md` :

| Permission | Donne accès à | Défaut |
|------------|---------------|--------|
| `work.roadmap.view` | Lire la roadmap + voir les specs (HTML rendu) | Tout staff |
| `work.roadmap.edit` | Toggle tasks done, éditer status/tags, créer specs, éditer specs, éditer projects | Lead staff |
| `work.roadmap.delete` | Supprimer specs / projects / tasks | Owners + Admins |

L'UI hide les boutons d'action selon les perms du user courant. Les routes API checkent côté serveur via `requireStaff(request, 'work.roadmap.edit')`.

## Décomposition en 2 phases

### Phase 1 — Backend + Roadmap read-only

**Objectif** : Migrer les données et offrir la lecture. Pas d'édition encore.

**Livrables** :

1. **Migration SQL** des 4 tables via un fichier `lib/db/migrations/` (pattern existant dans `EriniumFactionWeb`).

2. **Helpers DB** dans `lib/db/index.ts` :
   - `listRoadmapProjects({ status?, tags?, category? })`
   - `getProjectById(id)`
   - `listTasksForProject(projectId)`
   - `getSpecBySlug(slug)`
   - `listSpecsForProject(projectId)`

3. **Routes API** (read-only en Phase 1) :
   - `GET /api/work/v1/roadmap` — liste complète des projects + counts tasks (`{ done, total }`) + lien spec principal
   - `GET /api/work/v1/roadmap/projects/:id` — détail
   - `GET /api/work/v1/roadmap/specs/:slug` — détail (renvoie `{ kind, raw_html?, answers?, html_rendered? }`)
   - Auth : `requireStaff(request, 'work.roadmap.view')`

4. **Script d'import** `scripts/import-legacy-specs.ts` (exécuté localement contre la DB Neon de prod) :
   - Lit `docs/specs/*.html` (sauf `index.html` qui est juste un landing)
   - Pour chaque fichier : extrait `<title>` ou premier `<h1>` via `cheerio`, INSERT en DB avec `kind='legacy'`, `raw_html=contenu`
   - Parse `docs/roadmap.html` avec cheerio : extrait chaque `.cat-card` → INSERT `work_roadmap_projects` + `work_roadmap_tasks`
   - Lie les specs aux projects via `data-erisclave-slug` ou via le `href` du `.spec-link` (`specs/<slug>.html` → slug)
   - Log un rapport final : "X projects, Y specs (Z legacy / 0 structured), W tasks importés, V warnings"
   - Rollback facile : si problème, TRUNCATE les 3 tables et relance

5. **Pages UI read-only** :
   - `/admin/work/roadmap` :
     - Server-side fetch initial (SSR pas d'écran blanc), React Query refresh ensuite
     - Grille des cards avec filtres tags/status/catégorie (React state, pas vanilla JS)
     - Thème crème conservé (palette Erisclave portée en Tailwind)
   - `/admin/work/specs/<slug>` :
     - Si `kind=legacy` → injecte le `raw_html` via `dangerouslySetInnerHTML` après sanitization avec `isomorphic-dompurify`
     - Si `kind=structured` → génère le HTML via `htmlBuilder.renderSpec(answers)` côté serveur (port du `core/html-builder/` Erisclave en TypeScript)
   - Lien sidebar Work Panel : "Roadmap" (visible si `work.roadmap.view`)
   - Mobile responsive : grille passe en 1 colonne sur < 640px, filtres dans un drawer

6. **Outil pour Claude** : `scripts/dump-roadmap.ts` :
   - Authentifie via launcher token en env
   - Call `/api/work/v1/roadmap` + boucle sur les specs
   - Écrit `.cache/roadmap.html` + `.cache/specs/<slug>.html` dans le repo web (gitignored)
   - Documenté dans le README du repo web
   - Usage : `pnpm dump-roadmap` quand Claude (ou un dev) veut un snapshot offline

7. **Cleanup** :
   - Suppression de `docs/roadmap.html` + `docs/specs/` + `docs/applications/erisclave/` du submodule
   - Branche `archive/pre-erisclave-migration-2026-05-25` créée AVANT suppression pour préserver l'archive
   - Commit + push silencieux sur les deux remotes (Erinium-Group + JLSkyzer mirror)
   - Update `CLAUDE.md` : remplacer les 3 références aux chemins par URLs
   - Update `MEMORY.md` global si pertinent (entries qui mentionnent `docs/specs/...`)

**Critère de succès Phase 1** : Après déploiement Vercel, je peux ouvrir `/admin/work/roadmap` sur mon téléphone et voir les 54 specs comme avant (look identique, contenu identique). Les fichiers `docs/specs/` n'existent plus dans le repo.

### Phase 2 — Erisclave UI complète

**Objectif** : Création/édition/suppression de specs et projects via l'UI web.

**Livrables** :

1. **Portage des 9 écrans Erisclave en React** (thème crème conservé) :
   - `0-home` : grille d'accueil avec dernières specs + bouton "Nouveau spec"
   - `1-loading` : (skip — pas nécessaire en web, on a déjà le SSR initial)
   - `2-project` : édition des metadata du project (title, status, tags, category)
   - `3-questionnaire` : le questionnaire variable selon `featureType` (10 variants), avec progression bar
   - `4-tasks` : édition des sous-tâches du project
   - `5-preview` : preview HTML live du spec rendu (utilise `htmlBuilder.renderSpec()`)
   - `6-generate` : confirmation finale (avec hold-button pour éviter clic accidentel)
   - `7-final` : écran de confettis + redirect vers le spec
   - `8-manage` : liste des specs existants avec édition/suppression

2. **Composants réutilisables** portés dans `components/work/erisclave/` :
   - `<HoldButton>` (presse 1s pour valider une action destructive)
   - `<TagPicker>` (multi-select avec création de tag à la volée)
   - `<QuestionField>` (rendu polymorphe : text / textarea / select / multiselect / markdown / asset-upload)
   - `<SpecPreview>` (iframe sandboxed avec le HTML rendu live)

3. **Question engine porté en TypeScript** : `lib/work/erisclave/questions/`
   - `feature-types.ts` (les 10 types : bloc, item, gui, system, command, world, mob, eriapi, pvp, economie)
   - `base-questions.ts` (les sections communes)
   - `variants/` (les 10 fichiers JSON portés en TS const exports)
   - `getQuestionnaire(featureType)` : merge base + variant comme dans Erisclave

4. **HTML builder porté en TypeScript** : `lib/work/erisclave/html-builder.ts`
   - `renderSpec({ project, feature, allFeatures })` retourne du HTML
   - Conserve le visuel exact des specs Erisclave actuels (templates HTML inlines)
   - Sanitize tout HTML user-input avec isomorphic-dompurify

5. **Routes API** (write en Phase 2) :
   - `POST /api/work/v1/roadmap/projects` (requires `work.roadmap.edit`)
   - `PATCH /api/work/v1/roadmap/projects/:id` (avec `x-expected-updated-at`)
   - `DELETE /api/work/v1/roadmap/projects/:id` (requires `work.roadmap.delete`)
   - `POST/PATCH/DELETE /api/work/v1/roadmap/tasks` (toggle done, créer, supprimer)
   - `POST /api/work/v1/roadmap/specs` (créer un structured)
   - `PATCH /api/work/v1/roadmap/specs/:id` (édition, avec lock optimiste)
   - `DELETE /api/work/v1/roadmap/specs/:id`
   - `POST /api/work/v1/roadmap/specs/:id/assets` (upload Vercel Blob)
   - `DELETE /api/work/v1/roadmap/specs/:id/assets/:assetId`

6. **Conversion legacy → structured** : bouton sur les specs `kind=legacy` :
   - Ouvre l'écran 3-questionnaire pré-rempli (title + status + tags récupérés du project parent)
   - User remplit le questionnaire à blanc
   - Save → UPDATE le spec : `kind='structured'`, `answers=...`, `raw_html=NULL`
   - Pas d'auto-extraction du HTML legacy (trop brittle)

7. **Mobile-first** :
   - Tous les écrans testés en 375×667 (iPhone SE) + 414×896 (iPhone Pro Max)
   - Sidebar collapsable en hamburger sur mobile
   - Modales plein-écran sur mobile (pas de centered-popup étouffé)
   - Boutons hold adaptés au touch (`onTouchStart`/`onTouchEnd` au lieu de `onMouseDown`)
   - Tap targets ≥ 44px (Apple HIG)
   - Pas de hover-only interactions
   - Le questionnaire (écran 3) : un step par écran sur mobile, multi-step horizontal sur desktop

8. **Audit log** : chaque action (create/edit/delete project/task/spec) loggée via `lib/work/audit.ts` existant. Format : `action='roadmap.spec.create' target_type='roadmap_spec' target_id=<id>`

**Critère de succès Phase 2** : Je peux créer un nouveau spec via l'UI mobile (questionnaire complet, upload d'une image), le voir apparaître dans la roadmap, l'éditer, et le supprimer. Toutes ces actions apparaissent dans l'audit log.

## Considérations transverses

### Sécurité du HTML legacy injecté

**Risque** : XSS si on rend `raw_html` directement avec `dangerouslySetInnerHTML`.

**Mitigation** : sanitization avec `isomorphic-dompurify` (lib déjà disponible dans le projet) au moment de la lecture. Whitelist d'éléments/attributs HTML alignée sur ce qui est utilisé dans les 54 specs existants (essentiellement `<div>`, `<h1-6>`, `<p>`, `<ul>`, `<li>`, `<code>`, `<pre>`, `<a>`, `<table>`, `<img>`, classes CSS).

**Pas d'iframe sandboxée** : trop lourd, on est dans une zone authentifiée, on contrôle le contenu importé.

### Concurrency

- Header `x-expected-updated-at` sur tous les PATCH (pattern éprouvé sur les events Work Panel ce matin)
- `date_trunc('milliseconds', updated_at) = $X::timestamp` côté SQL (fix de la précision us vs ms appliqué d'office)
- Côté UI : si 412 ou 409 → toast "Modifié ailleurs, rouvre la modale" + invalidate query

### Assets / images

- **Vercel Blob** (free tier 1 GB, largement suffisant pour le volume)
- Upload via `@vercel/blob` SDK côté API route
- URL stockée en DB (`work_roadmap_spec_assets.blob_url`), jamais le binaire
- Suppression cascade : `DELETE spec` → `ON DELETE CASCADE` sur assets → delete blob via SDK
- Pas de cleanup cron en v1 (les orphelins ne devraient pas exister grâce au cascade)

### Theme

- **Erisclave + Roadmap** : thème crème/Liquid Glass clair conservé
- Palette portée dans `tailwind.config.ts` sous un namespace `erisclave-*` :
  - `erisclave-cream` (#f8f4f1), `erisclave-cream-warm` (#f1ebe5), `erisclave-cream-deep` (#e8e0d8)
  - `erisclave-ink` (#2a2530), `erisclave-pink` (#a371a6), `erisclave-pink-deep` (#7d4f86)
  - `erisclave-gold` (#d4a574), `erisclave-green-ok` (#6ab187), `erisclave-red-ko` (#d97070)
- Composants spécifiques : `<ErisclavePanel>` (équivalent crème de `<GlassPanel>`), `<ErisclaveButton>`, etc.
- Reste du Work Panel : inchangé (thème glass dark)
- Le grimoire icon (`grimoire-petit-96px.gif`) déplacé dans `EriniumFactionWeb/public/erisclave/`

### Mobile-first

- Tests prioritaires : iPhone SE (375), iPhone 14 Pro Max (430), iPad (768)
- Breakpoints Tailwind utilisés : `sm` (640), `md` (768), `lg` (1024)
- Le questionnaire : un step par écran sur mobile, multi-step horizontal sur desktop
- Sidebar Work Panel : déjà collapsable en hamburger sur mobile, on hérite

## Ce qui n'est PAS dans v1 (YAGNI)

- Versioning des specs (history des changements)
- Comments / mentions sur les specs (à voir si réutiliser le système Kanban cards)
- Search full-text (on s'appuie sur les filtres tags/status/category simples)
- Assignations de specs à des staff spécifiques
- Export PDF des specs
- Notifications "ton spec a été édité par X"
- API publique pour outils tiers
- Re-ordering des cards par drag & drop (on garde `order_idx` mais édition manuelle pour l'instant)

Ces features seront évaluées une fois la base stable.

## Cleanup post-migration

**Fichiers à supprimer** :
- `docs/applications/erisclave/` (toute l'app Electron)
- `docs/roadmap.html`
- `docs/specs/` (tous les .html + future éventuels .json + dossier `assets/`)

**Fichiers à conserver dans `docs/`** :
- `ASSETS_WORKFLOW.md`, `ranks.md`, `permissions.md`, `knowissue.md`
- `marketing-guide.html`, `design.html`
- `api-web.md`, `performance-mods-compatibility.md`
- `Make the mod work with cleanroom.html`
- `cahiers des charges md/`, `1.12.2/`, `Templates/`, `lootbox/`, `assets-pub/`
- `superpowers/` (ce dossier reste pour les designs/plans futurs)
- `README.md`

**Références textuelles à mettre à jour** :
- `D:\Mods Minecraft\EriniumFaction\CLAUDE.md` :
  - Ancien : `docs/roadmap.html` et `docs/specs/`
  - Nouveau : URLs `https://eriniumfaction.vercel.app/admin/work/roadmap` et `.../admin/work/specs/<slug>`
  - Ancien : "consulter `docs/roadmap.html`" → Nouveau : "consulter la roadmap via l'URL ou `pnpm dump-roadmap` puis lire `.cache/roadmap.html`"
- `EriniumFactionWeb/CLAUDE.md` (si présent) : ajout des nouvelles URLs
- `MEMORY.md` global (`C:\Users\killi\.claude\projects\D--Mods-Minecraft-EriniumFaction\memory\MEMORY.md`) : entries qui mentionnent `docs/specs/...`

**Sauvegarde de l'archive** :
- Avant suppression : créer la branche `archive/pre-erisclave-migration-2026-05-25` sur le submodule `docs/` (Erinium-Group/EriniumWorkflow) + push
- Tag git sur le commit de cleanup : `v0-pre-erisclave-migration`
