# Erisclave Migration — Phase 2b : Builder structured (Plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter le builder structured Erisclave (Q&A → HTML rendu) de l'app Electron vers le Work Panel Next.js, avec création/édition/preview/publication de specs depuis `/admin/work/specs/[slug]/edit`.

**Architecture:** Server library (port TypeScript de `question-engine` + `html-builder` Electron) consommée par 5 routes API qui persistent JSON answers + régénèrent `raw_html`. Client editor 3-zones (sidebar features + form Q&A sectionné + toolbar) avec `useReducer` local et autosave React Query debounce 1.5s. Drafts isolés via flag `is_draft` en DB.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Neon Postgres, `@tanstack/react-query` v5, `@dnd-kit/core` + `@dnd-kit/sortable` v10, Zod v4, `nanoid` v5 (à installer), Tailwind v4.

**Référence spec :** `docs/superpowers/specs/2026-05-26-erisclave-migration-phase2b-design.md`

**Référence source à porter :** `docs/applications/erisclave/core/question-engine/` + `core/html-builder/` (Electron, JavaScript)

**Méthodologie de test (pas de framework de tests dans ce projet) :**
- Build = check : `JAVA_HOME=... pnpm build` doit passer (compile TS + lint Next.js).
- Lib = scripts smoke `pnpm tsx scripts/smoke-erisclave-lib.ts` qui compare HTML rendu vs snapshots attendus.
- API = smoke via `pnpm tsx scripts/smoke-erisclave-api.ts` (pattern P2a).
- UI = checklist manuelle Task 24, exécutée en fin de plan.

---

## Structure des fichiers

```
EriniumFactionWeb/
├── src/
│   ├── app/
│   │   ├── migrations/
│   │   │   └── phase2b-erisclave-specs.sql                 [NEW] +answers JSONB +is_draft
│   │   ├── api/work/v1/roadmap/specs/
│   │   │   ├── route.ts                                    [NEW] POST create draft
│   │   │   ├── drafts/route.ts                             [NEW] GET liste drafts user
│   │   │   ├── preview/route.ts                            [NEW] POST render sans persister
│   │   │   └── [slug]/route.ts                             [MODIFIED] +PATCH +GET étendu
│   │   └── (admin)/admin/work/
│   │       ├── roadmap/page.tsx                            [MODIFIED] +trigger DraftsDrawer
│   │       └── specs/[slug]/
│   │           ├── page.tsx                                 [MODIFIED] +badge draft +Éditer
│   │           └── edit/
│   │               ├── page.tsx                             [NEW] server entry
│   │               └── SpecEditorClient.tsx                 [NEW] "use client" reducer + layout
│   ├── lib/work/erisclave/
│   │   ├── data/
│   │   │   ├── feature-types.json                          [NEW] 11 types
│   │   │   ├── base-questions.json                         [NEW] 14 sections (s1-s14)
│   │   │   └── variants/
│   │   │       ├── bloc.json                                [NEW]
│   │   │       ├── item.json                                [NEW]
│   │   │       ├── gui.json                                 [NEW]
│   │   │       ├── system.json                              [NEW]
│   │   │       ├── command.json                             [NEW]
│   │   │       ├── world.json                               [NEW]
│   │   │       ├── mob.json                                 [NEW]
│   │   │       ├── pvp.json                                 [NEW]
│   │   │       ├── economie.json                            [NEW]
│   │   │       └── eriapi.json                              [NEW]
│   │   ├── types.ts                                         [NEW] Feature, AnswersV1, etc.
│   │   ├── schemas.ts                                       [NEW] Zod schemas API
│   │   ├── question-engine.ts                               [NEW] port API public
│   │   ├── mutations.ts                                     [NEW] DB helpers (create/update/list drafts)
│   │   └── html-builder/
│   │       ├── escape.ts                                    [NEW]
│   │       ├── markdown.ts                                  [NEW]
│   │       ├── fieldRenderers.ts                            [NEW]
│   │       ├── styles.ts                                    [NEW]
│   │       └── index.ts                                     [NEW] orchestration
│   ├── lib/work/roadmap/
│   │   ├── types.ts                                         [MODIFIED] +RoadmapSpec.answers +isDraft
│   │   └── queries.ts                                       [MODIFIED] getRoadmapSpec retourne answers
│   ├── hooks/work/
│   │   ├── useRoadmap.ts                                    [MODIFIED] useRoadmapSpec étendu
│   │   ├── useSpecsMutations.ts                             [NEW] useCreateSpec, useUpdateSpec, usePreviewSpec, useDrafts
│   │   ├── useSpecEditor.ts                                 [NEW] useReducer state
│   │   ├── useAutosave.ts                                   [NEW] debounce 1500ms + retry
│   │   └── useNavigationGuard.ts                            [NEW] beforeunload + intercept Link
│   └── components/work/
│       ├── roadmap/
│       │   └── RoadmapCard.tsx                              [MODIFIED] +bouton 📋
│       └── specs/
│           ├── NewSpecModal.tsx                             [NEW]
│           ├── DraftsDrawer.tsx                             [NEW]
│           └── editor/
│               ├── SpecEditorHeader.tsx                     [NEW]
│               ├── FeaturesSidebar.tsx                      [NEW]
│               ├── FeatureFormPanel.tsx                     [NEW]
│               ├── FieldRenderer.tsx                        [NEW]
│               ├── PreviewModal.tsx                         [NEW]
│               ├── AutosaveIndicator.tsx                    [NEW]
│               └── fields/
│                   ├── TextField.tsx                        [NEW]
│                   ├── LongTextField.tsx                    [NEW]
│                   ├── SelectField.tsx                      [NEW]
│                   ├── ListField.tsx                        [NEW]
│                   ├── TableField.tsx                       [NEW]
│                   ├── ChecklistField.tsx                   [NEW]
│                   └── ImageField.tsx                       [NEW]
├── scripts/
│   ├── smoke-erisclave-lib.ts                               [NEW] snapshots question-engine + html-builder
│   └── smoke-erisclave-api.ts                               [NEW] smoke curl-like des 5 endpoints
└── package.json                                              [MODIFIED] +nanoid

docs/
└── knowissue.md                                             [MODIFIED] +entrée concurrence + legacy
```

---

## Phase A — Foundation (lib + data)

### Task 1: Migration SQL + nanoid install

**Files:**
- Create: `EriniumFactionWeb/src/app/migrations/phase2b-erisclave-specs.sql`
- Modify: `EriniumFactionWeb/src/lib/db/index.ts` (ajouter le fichier à la liste init)
- Modify: `EriniumFactionWeb/package.json` (+nanoid)

- [ ] **Step 1: Créer la migration SQL**

Fichier `EriniumFactionWeb/src/app/migrations/phase2b-erisclave-specs.sql` :
```sql
-- Migration Phase 2b — Erisclave Builder structured
-- Ajoute answers (JSONB) + is_draft (BOOL) sur work_roadmap_specs.
-- Idempotent : ADD COLUMN IF NOT EXISTS.

ALTER TABLE work_roadmap_specs
  ADD COLUMN IF NOT EXISTS answers JSONB NULL,
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by INT NULL;

CREATE INDEX IF NOT EXISTS work_roadmap_specs_draft_idx
  ON work_roadmap_specs (project_id, is_draft)
  WHERE is_draft = true;

CREATE INDEX IF NOT EXISTS work_roadmap_specs_created_by_idx
  ON work_roadmap_specs (created_by)
  WHERE created_by IS NOT NULL;
```

- [ ] **Step 2: Wire la migration dans initDb**

Lire `EriniumFactionWeb/src/lib/db/index.ts` pour trouver le bloc qui charge les SQL Phase 6. Ajouter à la suite (après `phase6-roadmap.sql`) :
```typescript
const phase2bSql = await readFile(
  path.join(process.cwd(), "src/app/migrations/phase2b-erisclave-specs.sql"),
  "utf8",
);
await sql(phase2bSql);
```

- [ ] **Step 3: Installer nanoid**

```bash
cd EriniumFactionWeb && pnpm add nanoid
```
Expected: `+ nanoid@5.x.x` dans `package.json`.

- [ ] **Step 4: Vérifier le build**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: build PASS (la migration ne s'exécute pas au build).

- [ ] **Step 5: Commit**

```bash
git add EriniumFactionWeb/src/app/migrations/phase2b-erisclave-specs.sql \
        EriniumFactionWeb/src/lib/db/index.ts \
        EriniumFactionWeb/package.json EriniumFactionWeb/pnpm-lock.yaml
git commit -m "feat(work/erisclave): migration P2b answers+is_draft + nanoid"
```

> **Note:** la migration s'exécutera automatiquement au prochain démarrage local (et en prod via Task 23 manuelle dans Neon SQL editor).

---

### Task 2: Data files — feature-types + base-questions + 10 variants

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/erisclave/data/feature-types.json`
- Create: `EriniumFactionWeb/src/lib/work/erisclave/data/base-questions.json`
- Create: `EriniumFactionWeb/src/lib/work/erisclave/data/variants/{bloc,item,gui,system,command,world,mob,pvp,economie,eriapi}.json`

- [ ] **Step 1: Copier feature-types.json depuis Electron**

```bash
mkdir -p EriniumFactionWeb/src/lib/work/erisclave/data/variants
cp "docs/applications/erisclave/core/question-engine/feature-types.json" \
   EriniumFactionWeb/src/lib/work/erisclave/data/feature-types.json
```

Vérifier : 11 entries `[{ "id": "bloc", "label": "Bloc" }, ...]`.

- [ ] **Step 2: Copier base-questions.json**

```bash
cp "docs/applications/erisclave/core/question-engine/base-questions.json" \
   EriniumFactionWeb/src/lib/work/erisclave/data/base-questions.json
```

Vérifier : 14 sections (s1-s14), ~30 fields total.

- [ ] **Step 3: Copier les 10 variants**

```bash
cp docs/applications/erisclave/core/question-engine/variants/*.json \
   EriniumFactionWeb/src/lib/work/erisclave/data/variants/
```

Vérifier : `ls EriniumFactionWeb/src/lib/work/erisclave/data/variants/` retourne 10 fichiers (pas de `autre.json` — c'est le fallback sans overlay).

- [ ] **Step 4: Vérifier qu'aucun fichier ne contient du commentaire JS (JSON pur)**

```bash
grep -r "^//" EriniumFactionWeb/src/lib/work/erisclave/data/ && echo "FAIL: commentaire trouvé" || echo "OK: JSON pur"
```
Expected: "OK: JSON pur".

- [ ] **Step 5: Commit**

```bash
git add EriniumFactionWeb/src/lib/work/erisclave/data/
git commit -m "feat(work/erisclave): data files - feature-types + 14 sections + 10 variants"
```

---

### Task 3: Types TypeScript

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/erisclave/types.ts`

- [ ] **Step 1: Écrire types.ts**

```typescript
/**
 * Types pour le builder structured Erisclave (Phase 2b).
 * Source : port Electron `docs/applications/erisclave/core/question-engine/`.
 */

export type FeatureTypeId =
  | "bloc"
  | "item"
  | "gui"
  | "system"
  | "command"
  | "world"
  | "mob"
  | "pvp"
  | "economie"
  | "eriapi"
  | "autre";

export interface FeatureTypeDescriptor {
  id: FeatureTypeId;
  label: string;
}

export type FieldKind =
  | "text"
  | "longtext"
  | "select"
  | "list"
  | "table"
  | "checklist"
  | "image";

export interface FieldDescriptor {
  id: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[]; // pour select / checklist
  columns?: string[]; // pour table
  multi?: boolean;    // pour image / checklist
}

export interface SectionDescriptor {
  id: string;       // ex: "s1"
  title: string;
  intro?: string;
  fields: FieldDescriptor[];
}

export interface Questionnaire {
  featureType: FeatureTypeId;
  featureTypeLabel: string;
  sections: SectionDescriptor[];
}

/** Valeur stockée pour un champ. Type discriminé par kind. */
export type FieldValue =
  | string                                    // text, longtext, select, image (single URL)
  | string[]                                  // list, checklist, image (multi URLs)
  | Array<Record<string, string>>             // table : tableau de lignes (colonne -> valeur)
  | null;

export interface Feature {
  id: string;                                 // nanoid()
  type: FeatureTypeId;
  title: string;                              // titre éditable affiché sidebar
  answers: Record<string, FieldValue>;        // keyed by field.id
}

export interface AnswersV1 {
  version: 1;
  project: { id: number; title: string } | null;
  features: Feature[];
  meta: {
    createdAt: string;                        // ISO
    updatedAt: string;                        // ISO
    createdBy: number | null;                 // userId
  };
}
```

- [ ] **Step 2: Vérifier compile TS**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm tsc --noEmit
```
Expected: PASS (aucune erreur).

- [ ] **Step 3: Commit**

```bash
git add EriniumFactionWeb/src/lib/work/erisclave/types.ts
git commit -m "feat(work/erisclave): types TS - FeatureTypeId, Feature, AnswersV1"
```

---

### Task 4: question-engine.ts (port + tests snapshot)

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/erisclave/question-engine.ts`
- Create: `EriniumFactionWeb/scripts/smoke-erisclave-lib.ts` (premier scaffold, on étoffe Task 5)

- [ ] **Step 1: Écrire question-engine.ts**

Source à porter : `docs/applications/erisclave/core/question-engine/index.js`. API publique : `listFeatureTypes()` + `getQuestionnaire(featureType)`.

```typescript
/**
 * Port TypeScript du question-engine Erisclave Electron.
 * Charge feature-types + base-questions + variants au module load.
 * API : listFeatureTypes() + getQuestionnaire(featureType).
 */

import featureTypesData from "./data/feature-types.json";
import baseQuestionsData from "./data/base-questions.json";
import blocVariant from "./data/variants/bloc.json";
import itemVariant from "./data/variants/item.json";
import guiVariant from "./data/variants/gui.json";
import systemVariant from "./data/variants/system.json";
import commandVariant from "./data/variants/command.json";
import worldVariant from "./data/variants/world.json";
import mobVariant from "./data/variants/mob.json";
import pvpVariant from "./data/variants/pvp.json";
import economieVariant from "./data/variants/economie.json";
import eriapiVariant from "./data/variants/eriapi.json";

import type {
  FeatureTypeDescriptor,
  FeatureTypeId,
  FieldDescriptor,
  Questionnaire,
  SectionDescriptor,
} from "./types";

interface VariantSection {
  bonusFields?: FieldDescriptor[];
  fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
}
interface Variant {
  sections?: Record<string, VariantSection>;
}

const VARIANTS: Record<Exclude<FeatureTypeId, "autre">, Variant> = {
  bloc: blocVariant as Variant,
  item: itemVariant as Variant,
  gui: guiVariant as Variant,
  system: systemVariant as Variant,
  command: commandVariant as Variant,
  world: worldVariant as Variant,
  mob: mobVariant as Variant,
  pvp: pvpVariant as Variant,
  economie: economieVariant as Variant,
  eriapi: eriapiVariant as Variant,
};

const FEATURE_TYPES = featureTypesData as FeatureTypeDescriptor[];
const BASE_SECTIONS = baseQuestionsData as SectionDescriptor[];

/** Renvoie les 11 types de feature (id + label affichable). */
export function listFeatureTypes(): FeatureTypeDescriptor[] {
  return FEATURE_TYPES;
}

/**
 * Renvoie le questionnaire pour un type donné : 14 sections de base +
 * fusion des overlays variant (bonusFields ajoutés à la fin de la section,
 * fieldOverrides mergés par id).
 */
export function getQuestionnaire(featureType: FeatureTypeId): Questionnaire {
  const descriptor = FEATURE_TYPES.find((f) => f.id === featureType);
  if (!descriptor) throw new Error(`Unknown feature type: ${featureType}`);

  const variant = featureType !== "autre" ? VARIANTS[featureType] : undefined;

  const mergedSections: SectionDescriptor[] = BASE_SECTIONS.map((baseSection) => {
    const overlay = variant?.sections?.[baseSection.id];
    if (!overlay) return baseSection;

    let mergedFields = baseSection.fields;
    if (overlay.fieldOverrides) {
      mergedFields = baseSection.fields.map((f) => {
        const override = overlay.fieldOverrides?.[f.id];
        return override ? { ...f, ...override } : f;
      });
    }
    if (overlay.bonusFields && overlay.bonusFields.length > 0) {
      mergedFields = [...mergedFields, ...overlay.bonusFields];
    }
    return { ...baseSection, fields: mergedFields };
  });

  return {
    featureType,
    featureTypeLabel: descriptor.label,
    sections: mergedSections,
  };
}
```

- [ ] **Step 2: Configurer tsconfig pour resolveJsonModule**

Vérifier `EriniumFactionWeb/tsconfig.json` contient :
```json
{ "compilerOptions": { "resolveJsonModule": true } }
```
Si absent, l'ajouter. (Note: déjà true par défaut sur Next.js 16, mais à confirmer.)

- [ ] **Step 3: Écrire le script smoke initial (juste question-engine)**

```typescript
// EriniumFactionWeb/scripts/smoke-erisclave-lib.ts
import { listFeatureTypes, getQuestionnaire } from "../src/lib/work/erisclave/question-engine";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`OK  ${name}`);
  else { console.error(`FAIL ${name} ${detail}`); failures++; }
}

// listFeatureTypes : 11 entries
const types = listFeatureTypes();
check("listFeatureTypes returns 11 types", types.length === 11, `got ${types.length}`);
check("first type is bloc", types[0]?.id === "bloc");

// getQuestionnaire bloc : 14 sections + bonusFields injectés
const blocQ = getQuestionnaire("bloc");
check("bloc has 14 sections", blocQ.sections.length === 14, `got ${blocQ.sections.length}`);

const s4 = blocQ.sections.find((s) => s.id === "s4");
check("bloc s4 has tileEntity bonus field", !!s4?.fields.find((f) => f.id === "tileEntity"));
check("bloc s4 has hitbox bonus field", !!s4?.fields.find((f) => f.id === "hitbox"));

const s5 = blocQ.sections.find((s) => s.id === "s5");
check("bloc s5 has textures bonus field", !!s5?.fields.find((f) => f.id === "textures"));

// autre : fallback sans overlay
const autreQ = getQuestionnaire("autre");
check("autre has 14 sections (no overlay)", autreQ.sections.length === 14);

// Unknown type throws
try { getQuestionnaire("xxx" as never); check("unknown throws", false); }
catch { check("unknown throws", true); }

if (failures > 0) { console.error(`\n${failures} failures`); process.exit(1); }
console.log("\nAll question-engine smoke OK.");
```

- [ ] **Step 4: Run le smoke**

```bash
cd EriniumFactionWeb && pnpm tsx scripts/smoke-erisclave-lib.ts
```
Expected: tous les checks OK, exit 0.

- [ ] **Step 5: Commit**

```bash
git add EriniumFactionWeb/src/lib/work/erisclave/question-engine.ts \
        EriniumFactionWeb/scripts/smoke-erisclave-lib.ts
git commit -m "feat(work/erisclave): question-engine port + smoke tests"
```

---

### Task 5: html-builder (escape + markdown + fieldRenderers + styles + index) + smoke

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/erisclave/html-builder/escape.ts`
- Create: `EriniumFactionWeb/src/lib/work/erisclave/html-builder/markdown.ts`
- Create: `EriniumFactionWeb/src/lib/work/erisclave/html-builder/fieldRenderers.ts`
- Create: `EriniumFactionWeb/src/lib/work/erisclave/html-builder/styles.ts`
- Create: `EriniumFactionWeb/src/lib/work/erisclave/html-builder/index.ts`
- Modify: `EriniumFactionWeb/scripts/smoke-erisclave-lib.ts` (ajouter tests html-builder)

- [ ] **Step 1: escape.ts**

Source : `docs/applications/erisclave/core/html-builder/escape.js`. Port direct.

```typescript
/** Échappement HTML pour text content. */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Alias pour attributs (même règles). */
export const escapeAttr = escapeHtml;
```

- [ ] **Step 2: markdown.ts**

Source : `docs/applications/erisclave/core/html-builder/markdown.js`. Port direct (parseur maison).

```typescript
import { escapeHtml } from "./escape";

/** Inline markdown : **bold**, *italic*, `code`, [text](url), \n→<br>. */
export function renderInlineMd(input: string): string {
  if (!input) return "";
  let s = escapeHtml(input);
  // Links [text](url) — avant bold/italic pour éviter conflits
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safeUrl = url.replace(/"/g, "&quot;");
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  // Code inline
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Linebreaks
  s = s.replace(/\n/g, "<br>");
  return s;
}

/** Block markdown : double-newline = paragraphes, lignes "- " ou "* " = bullet list. */
export function renderBlockMd(input: string): string {
  if (!input) return "";
  const blocks = input.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split(/\n/);
      const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
      if (isList) {
        const items = lines
          .map((l) => l.replace(/^\s*[-*]\s+/, ""))
          .map((l) => `<li>${renderInlineMd(l)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      // Single block paragraph (newlines deviennent <br>)
      return `<p>${renderInlineMd(block)}</p>`;
    })
    .join("\n");
}
```

- [ ] **Step 3: fieldRenderers.ts**

Source : `docs/applications/erisclave/core/html-builder/fieldRenderers.js`. Port avec types.

```typescript
import type { FieldDescriptor, FieldValue } from "../types";
import { escapeHtml } from "./escape";
import { renderBlockMd, renderInlineMd } from "./markdown";

interface RenderArgs {
  field: FieldDescriptor;
  value: FieldValue;
}

/** Dispatch un champ vers son renderer selon field.kind. */
export function renderField({ field, value }: RenderArgs): string {
  switch (field.kind) {
    case "text":      return renderText(field, value as string | null);
    case "longtext":  return renderLongtext(field, value as string | null);
    case "select":    return renderSelect(field, value as string | null);
    case "list":      return renderList(field, value as string[] | null);
    case "checklist": return renderChecklist(field, value as string[] | null);
    case "table":     return renderTable(field, value as Array<Record<string, string>> | null);
    case "image":     return renderImage(field, value as string[] | string | null);
    default: {
      const _exhaust: never = field.kind;
      return "";
    }
  }
}

function fieldShell(field: FieldDescriptor, inner: string): string {
  return `<section class="field"><h3>${escapeHtml(field.label)}</h3>${inner}</section>`;
}

function renderText(field: FieldDescriptor, value: string | null): string {
  if (!value) return fieldShell(field, `<p class="empty">—</p>`);
  return fieldShell(field, `<p>${renderInlineMd(value)}</p>`);
}

function renderLongtext(field: FieldDescriptor, value: string | null): string {
  if (!value) return fieldShell(field, `<p class="empty">—</p>`);
  return fieldShell(field, renderBlockMd(value));
}

function renderSelect(field: FieldDescriptor, value: string | null): string {
  if (!value) return fieldShell(field, `<p class="empty">—</p>`);
  return fieldShell(field, `<p><span class="badge">${escapeHtml(value)}</span></p>`);
}

function renderList(field: FieldDescriptor, value: string[] | null): string {
  if (!value || value.length === 0) return fieldShell(field, `<p class="empty">—</p>`);
  const items = value.map((v) => `<li>${renderInlineMd(v)}</li>`).join("");
  return fieldShell(field, `<ul>${items}</ul>`);
}

function renderChecklist(field: FieldDescriptor, value: string[] | null): string {
  if (!value || value.length === 0) return fieldShell(field, `<p class="empty">—</p>`);
  const items = value
    .map((v) => `<li class="check"><span class="box">✓</span> ${escapeHtml(v)}</li>`)
    .join("");
  return fieldShell(field, `<ul class="checklist">${items}</ul>`);
}

function renderTable(field: FieldDescriptor, value: Array<Record<string, string>> | null): string {
  const cols = field.columns ?? [];
  if (!value || value.length === 0 || cols.length === 0) {
    return fieldShell(field, `<p class="empty">—</p>`);
  }
  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const rows = value
    .map((row) => {
      const cells = cols.map((c) => `<td>${renderInlineMd(row[c] ?? "")}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return fieldShell(
    field,
    `<table class="table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
  );
}

function renderImage(field: FieldDescriptor, value: string[] | string | null): string {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return fieldShell(field, `<p class="empty">—</p>`);
  }
  const urls = Array.isArray(value) ? value : [value];
  const figures = urls
    .map((url) => {
      const safe = escapeHtml(url);
      return `<figure class="img"><img loading="lazy" src="${safe}" alt="${escapeHtml(field.label)}" /></figure>`;
    })
    .join("");
  return fieldShell(field, `<div class="img-grid">${figures}</div>`);
}
```

- [ ] **Step 4: styles.ts**

Source : `docs/applications/erisclave/core/html-builder/styles.js`. Export CSS string.

```typescript
/** CSS embarqué du HTML rendu (port direct du theme Erisclave Electron). */
export const SPEC_STYLES = `
:root {
  --bg: #0e0f17;
  --bg-soft: #161825;
  --ink: #e6e7ee;
  --ink-soft: #a8aabb;
  --violet: #9b59ff;
  --cyan: #38d9ff;
  --pink: #ff6b9d;
  --border: rgba(255,255,255,0.08);
  --radius: 14px;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px; line-height: 1.55;
}
.layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
.sidebar {
  background: var(--bg-soft); border-right: 1px solid var(--border);
  padding: 20px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto;
}
.sidebar h2 { font-size: 13px; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 12px; letter-spacing: 0.05em; }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar li { margin: 2px 0; }
.sidebar a { display: block; padding: 6px 10px; border-radius: 8px; color: var(--ink-soft); text-decoration: none; font-size: 14px; }
.sidebar a:hover { background: rgba(155,89,255,0.1); color: var(--ink); }
.main { padding: 32px 40px; max-width: 900px; }
.header {
  background: linear-gradient(135deg, var(--violet), var(--cyan));
  border-radius: var(--radius); padding: 28px 32px; margin-bottom: 24px;
}
.header h1 { margin: 0 0 6px; font-size: 28px; color: #fff; }
.header .meta { color: rgba(255,255,255,0.85); font-size: 14px; }
.feature {
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 24px 28px; margin-bottom: 24px;
}
.feature > h2 { margin: 0 0 4px; font-size: 22px; color: var(--cyan); }
.feature > .feature-type { color: var(--ink-soft); font-size: 13px; text-transform: uppercase; margin-bottom: 18px; letter-spacing: 0.05em; }
.section { margin: 24px 0; }
.section > h2 { font-size: 18px; color: var(--violet); margin: 0 0 4px; }
.section > .intro { color: var(--ink-soft); font-size: 14px; margin: 0 0 14px; }
.field { margin: 14px 0; padding: 12px 16px; background: rgba(255,255,255,0.02); border-radius: 10px; }
.field h3 { font-size: 14px; color: var(--ink); margin: 0 0 6px; font-weight: 600; }
.field p, .field ul, .field table { margin: 0; }
.field .empty { color: var(--ink-soft); font-style: italic; }
.badge { display: inline-block; padding: 3px 10px; background: rgba(56,217,255,0.12); color: var(--cyan); border-radius: 999px; font-size: 13px; }
.checklist { list-style: none; padding: 0; }
.checklist .check { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.checklist .box { display: inline-flex; width: 18px; height: 18px; border: 1px solid var(--cyan); border-radius: 4px; align-items: center; justify-content: center; color: var(--cyan); font-size: 12px; }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th, .table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); }
.table th { color: var(--ink-soft); font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
.img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.img { margin: 0; }
.img img { width: 100%; border-radius: 8px; border: 1px solid var(--border); }
code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
a { color: var(--cyan); }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { position: relative; height: auto; }
  .main { padding: 20px; }
}
`;
```

- [ ] **Step 5: index.ts (orchestration multi-feature)**

**Différence par rapport à Electron** : un spec contient N features (vs Electron = 1 feature). On itère.

```typescript
import type { AnswersV1, Feature, FeatureTypeId } from "../types";
import { getQuestionnaire, listFeatureTypes } from "../question-engine";
import { renderField } from "./fieldRenderers";
import { escapeHtml } from "./escape";
import { SPEC_STYLES } from "./styles";

const TYPE_LABELS: Record<FeatureTypeId, string> = Object.fromEntries(
  listFeatureTypes().map((t) => [t.id, t.label]),
) as Record<FeatureTypeId, string>;

/** Renvoie le HTML complet d'un spec structured (page autonome avec CSS inline). */
export function renderSpecHtml(answers: AnswersV1): string {
  const projectTitle = answers.project?.title ?? "Spec sans projet";
  const featuresHtml = answers.features.map(renderFeature).join("\n");
  const nav = renderSidebar(answers.features);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(projectTitle)}</title>
<style>${SPEC_STYLES}</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <h2>Features</h2>
    ${nav}
  </aside>
  <main class="main">
    <header class="header">
      <h1>${escapeHtml(projectTitle)}</h1>
      <div class="meta">${answers.features.length} feature(s) — version 1 — màj ${escapeHtml(answers.meta.updatedAt)}</div>
    </header>
    ${featuresHtml}
  </main>
</div>
</body>
</html>`;
}

function renderSidebar(features: Feature[]): string {
  if (features.length === 0) return `<p style="color:var(--ink-soft);font-size:13px;">Aucune feature.</p>`;
  const items = features
    .map((f) => `<li><a href="#f-${escapeHtml(f.id)}">${escapeHtml(f.title || "(sans titre)")}</a></li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

function renderFeature(feature: Feature): string {
  const q = getQuestionnaire(feature.type);
  const sections = q.sections.map((sec) => {
    const fields = sec.fields
      .map((field) => renderField({ field, value: feature.answers[field.id] ?? null }))
      .join("\n");
    return `<div class="section">
      <h2>${escapeHtml(sec.title)}</h2>
      ${sec.intro ? `<p class="intro">${escapeHtml(sec.intro)}</p>` : ""}
      ${fields}
    </div>`;
  }).join("\n");

  return `<article class="feature" id="f-${escapeHtml(feature.id)}">
    <h2>${escapeHtml(feature.title || "(sans titre)")}</h2>
    <div class="feature-type">${escapeHtml(TYPE_LABELS[feature.type])}</div>
    ${sections}
  </article>`;
}
```

- [ ] **Step 6: Ajouter tests html-builder au smoke**

Append à `EriniumFactionWeb/scripts/smoke-erisclave-lib.ts` :
```typescript
import { renderSpecHtml } from "../src/lib/work/erisclave/html-builder";
import type { AnswersV1 } from "../src/lib/work/erisclave/types";

const fixture: AnswersV1 = {
  version: 1,
  project: { id: 1, title: "Test Project" },
  features: [
    {
      id: "abc123",
      type: "bloc",
      title: "Plasma Extractor",
      answers: {
        summary: "Un bloc qui **extrait** du plasma.",
        objective: "Permettre l'automation\n\n- Crafter du plasma\n- Améliorer la prog",
        audience: ["Joueurs PvE", "Factions techniques"],
        actions: [{ "Action": "Clic droit", "Résultat": "Ouvre GUI", "Cond.": "Énergie>0" }],
      },
    },
  ],
  meta: { createdAt: "2026-05-26T10:00:00Z", updatedAt: "2026-05-26T10:00:00Z", createdBy: null },
};

const html = renderSpecHtml(fixture);
check("html contains <!DOCTYPE", html.startsWith("<!DOCTYPE html>"));
check("html contains project title", html.includes("Test Project"));
check("html contains feature title", html.includes("Plasma Extractor"));
check("html contains type label", html.includes("Bloc"));
check("html escapes summary <strong>", html.includes("<strong>extrait</strong>"));
check("html renders block list", html.includes("<ul><li>Crafter du plasma</li>"));
check("html renders checklist", html.includes("Joueurs PvE"));
check("html renders table cell", html.includes("Clic droit"));
check("html has sidebar nav anchor", html.includes('href="#f-abc123"'));
check("html has CSS inline", html.includes(":root"));
```

- [ ] **Step 7: Run smoke**

```bash
cd EriniumFactionWeb && pnpm tsx scripts/smoke-erisclave-lib.ts
```
Expected: tous les checks OK.

- [ ] **Step 8: Commit**

```bash
git add EriniumFactionWeb/src/lib/work/erisclave/html-builder/ \
        EriniumFactionWeb/scripts/smoke-erisclave-lib.ts
git commit -m "feat(work/erisclave): html-builder port (escape+md+renderers+styles+orchestration multi-feature)"
```

---

### Task 6: schemas.ts (Zod validation)

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/erisclave/schemas.ts`

- [ ] **Step 1: Écrire schemas.ts**

```typescript
import { z } from "zod";

/** Types feature autorisés (doit matcher FeatureTypeId du types.ts). */
export const FeatureTypeIdSchema = z.enum([
  "bloc", "item", "gui", "system", "command",
  "world", "mob", "pvp", "economie", "eriapi", "autre",
]);

/** Valeur d'un champ : string OU string[] OU table OU null. */
const FieldValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.array(z.record(z.string(), z.string())),
  z.null(),
]);

const FeatureSchema = z.object({
  id: z.string().min(1).max(64),
  type: FeatureTypeIdSchema,
  title: z.string().min(0).max(200),
  answers: z.record(z.string(), FieldValueSchema),
});

export const AnswersV1Schema = z.object({
  version: z.literal(1),
  project: z.object({ id: z.number().int().positive(), title: z.string() }).nullable(),
  features: z.array(FeatureSchema).max(50),
  meta: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    createdBy: z.number().int().nullable(),
  }),
});

/** Body POST /specs (create draft). */
export const CreateSpecSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().min(1).max(200),
});

/** Body PATCH /specs/[slug]. Champs optionnels. */
export const UpdateSpecSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  answers: AnswersV1Schema.optional(),
  isDraft: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });

/** Body POST /specs/preview. */
export const PreviewSpecSchema = z.object({
  project: z.object({ id: z.number().int().positive(), title: z.string() }).nullable(),
  features: z.array(FeatureSchema).max(50),
});

export type CreateSpecInput = z.infer<typeof CreateSpecSchema>;
export type UpdateSpecInput = z.infer<typeof UpdateSpecSchema>;
export type PreviewSpecInput = z.infer<typeof PreviewSpecSchema>;
```

- [ ] **Step 2: Compile check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add EriniumFactionWeb/src/lib/work/erisclave/schemas.ts
git commit -m "feat(work/erisclave): Zod schemas AnswersV1, Create/Update/PreviewSpec"
```

---

## Phase B — API

### Task 7: mutations.ts (DB helpers) + extend roadmap/queries

**Files:**
- Create: `EriniumFactionWeb/src/lib/work/erisclave/mutations.ts`
- Modify: `EriniumFactionWeb/src/lib/work/roadmap/types.ts`
- Modify: `EriniumFactionWeb/src/lib/work/roadmap/queries.ts`

- [ ] **Step 1: Étendre RoadmapSpec type**

Lire `EriniumFactionWeb/src/lib/work/roadmap/types.ts`, repérer l'interface `RoadmapSpec`, ajouter :
```typescript
export interface RoadmapSpec {
  // ...existing fields (id, slug, title, rawHtml, projectId, etc.)
  answers: AnswersV1 | null;
  isDraft: boolean;
  createdBy: number | null;
}
```
+ ajouter `import type { AnswersV1 } from "../erisclave/types";` en haut.

- [ ] **Step 2: Étendre getRoadmapSpec query**

Dans `EriniumFactionWeb/src/lib/work/roadmap/queries.ts`, fonction `getRoadmapSpec(slug)` : modifier le SELECT pour inclure `answers, is_draft, created_by` + le mapping :
```typescript
const row = result.rows[0];
return {
  // ...existing fields
  answers: row.answers as AnswersV1 | null,
  isDraft: row.is_draft as boolean,
  createdBy: row.created_by as number | null,
};
```

- [ ] **Step 3: Créer mutations.ts**

```typescript
import { customAlphabet } from "nanoid";
import { sql } from "../../db";
import { initDb } from "../../db";
import type { AnswersV1, Feature } from "./types";
import { renderSpecHtml } from "./html-builder";
import type { RoadmapSpec } from "../roadmap/types";

const nano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Crée un draft de spec.
 * Génère slug = slugify(title) + "-draft-YYYYMMDD-" + nanoid(6).
 * answers initial = features vide ; raw_html = "" (sera regénéré au premier PATCH).
 */
export async function createSpec(input: {
  projectId: number;
  title: string;
  userId: number;
}): Promise<RoadmapSpec> {
  await initDb();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = `${slugify(input.title)}-draft-${today}-${nano()}`;
  const now = new Date().toISOString();
  const answers: AnswersV1 = {
    version: 1,
    project: { id: input.projectId, title: input.title },
    features: [],
    meta: { createdAt: now, updatedAt: now, createdBy: input.userId },
  };
  const rows = await sql`
    INSERT INTO work_roadmap_specs (project_id, slug, title, raw_html, answers, is_draft, created_by)
    VALUES (${input.projectId}, ${slug}, ${input.title}, '', ${JSON.stringify(answers)}::jsonb, true, ${input.userId})
    RETURNING id, slug, title, raw_html, project_id, answers, is_draft, created_by;
  `;
  const row = rows[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    rawHtml: row.raw_html,
    projectId: row.project_id,
    answers: row.answers,
    isDraft: row.is_draft,
    createdBy: row.created_by,
  };
}

/** Met à jour answers + isDraft + title ; régénère raw_html si answers fourni. */
export async function updateSpec(
  slug: string,
  input: { title?: string; answers?: AnswersV1; isDraft?: boolean },
): Promise<RoadmapSpec | null> {
  await initDb();
  const existing = await sql`SELECT id, project_id, title, answers FROM work_roadmap_specs WHERE slug = ${slug}`;
  if (existing.length === 0) return null;
  const current = existing[0];
  if (input.answers && current.answers === null) {
    throw new Error("legacy_not_editable");
  }

  let nextAnswers: AnswersV1 | null = current.answers as AnswersV1 | null;
  let nextRawHtml: string | undefined;
  if (input.answers) {
    nextAnswers = {
      ...input.answers,
      meta: { ...input.answers.meta, updatedAt: new Date().toISOString() },
    };
    nextRawHtml = renderSpecHtml(nextAnswers);
  }

  const rows = await sql`
    UPDATE work_roadmap_specs
    SET
      title = COALESCE(${input.title ?? null}, title),
      answers = COALESCE(${nextAnswers ? JSON.stringify(nextAnswers) : null}::jsonb, answers),
      raw_html = COALESCE(${nextRawHtml ?? null}, raw_html),
      is_draft = COALESCE(${input.isDraft ?? null}::boolean, is_draft)
    WHERE slug = ${slug}
    RETURNING id, slug, title, raw_html, project_id, answers, is_draft, created_by;
  `;
  const row = rows[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    rawHtml: row.raw_html,
    projectId: row.project_id,
    answers: row.answers,
    isDraft: row.is_draft,
    createdBy: row.created_by,
  };
}

/** Liste les drafts d'un user (pour DraftsDrawer). */
export async function listUserDrafts(userId: number): Promise<Array<{
  slug: string; title: string; projectId: number; updatedAt: string;
}>> {
  await initDb();
  const rows = await sql`
    SELECT slug, title, project_id, updated_at
    FROM work_roadmap_specs
    WHERE is_draft = true AND created_by = ${userId}
    ORDER BY updated_at DESC
    LIMIT 50;
  `;
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    projectId: r.project_id,
    updatedAt: r.updated_at,
  }));
}
```

- [ ] **Step 4: Vérifier que work_roadmap_specs a une colonne updated_at**

Si le schéma P1 n'a pas `updated_at`, ajouter dans la migration P2b :
```sql
ALTER TABLE work_roadmap_specs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE FUNCTION trigger_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_updated_at ON work_roadmap_specs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON work_roadmap_specs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```
Si oui (probable), skip cette étape.

- [ ] **Step 5: Compile check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm tsc --noEmit
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add EriniumFactionWeb/src/lib/work/erisclave/mutations.ts \
        EriniumFactionWeb/src/lib/work/roadmap/types.ts \
        EriniumFactionWeb/src/lib/work/roadmap/queries.ts \
        EriniumFactionWeb/src/app/migrations/phase2b-erisclave-specs.sql
git commit -m "feat(work/erisclave): mutations DB createSpec/updateSpec/listUserDrafts + extend RoadmapSpec"
```

---

### Task 8: POST /api/work/v1/roadmap/specs (create draft)

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/route.ts`

- [ ] **Step 1: Écrire route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { CreateSpecSchema } from "@/lib/work/erisclave/schemas";
import { createSpec } from "@/lib/work/erisclave/mutations";

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff(request, "work.roadmap.edit");

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

    const parsed = CreateSpecSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }

    const spec = await createSpec({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      userId: session.userId,
    });
    return NextResponse.json({ spec }, { status: 201 });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Vérifier `requireStaff` retourne bien `{ userId }`**

Si `requireStaff` ne retourne pas userId, ajuster : `const session = await requireStaff(request, ...)` puis lire la propriété correspondante (probablement `session.user.id` ou `session.userId`). Adapter à la signature réelle.

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/route.ts
git commit -m "feat(api): POST /specs create draft"
```

---

### Task 9: GET /api/work/v1/roadmap/specs/drafts

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/drafts/route.ts`

- [ ] **Step 1: Écrire route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { listUserDrafts } from "@/lib/work/erisclave/mutations";

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff(request, "work.roadmap.view");
    const drafts = await listUserDrafts(session.userId);
    return NextResponse.json({ drafts });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/drafts/route.ts
git commit -m "feat(api): GET /specs/drafts liste user drafts"
```

---

### Task 10: PATCH /api/work/v1/roadmap/specs/[slug] + extend GET

**Files:**
- Modify: `EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/[slug]/route.ts`

- [ ] **Step 1: Lire le fichier actuel pour savoir quels handlers existent déjà**

```bash
cat EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/[slug]/route.ts
```
Repérer les exports existants (GET déjà présent depuis P1, DELETE depuis P2a). Conserver ces handlers.

- [ ] **Step 2: Ajouter PATCH handler**

```typescript
import { UpdateSpecSchema } from "@/lib/work/erisclave/schemas";
import { updateSpec } from "@/lib/work/erisclave/mutations";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await requireStaff(request, "work.roadmap.edit");
    const { slug } = await params;

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

    const parsed = UpdateSpecSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }

    try {
      const spec = await updateSpec(slug, parsed.data);
      if (!spec) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ spec });
    } catch (e) {
      if (e instanceof Error && e.message === "legacy_not_editable") {
        return NextResponse.json({ error: "legacy_not_editable" }, { status: 403 });
      }
      throw e;
    }
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 3: Vérifier que GET existant retourne déjà `answers` + `isDraft`**

Le `getRoadmapSpec` étendu en Task 7 alimente le GET. Si la sérialisation actuelle filtre les champs (ex: ne renvoie que `id, slug, title, rawHtml`), ajouter `answers, isDraft, createdBy` au payload retourné :
```typescript
return NextResponse.json({
  spec: {
    id: spec.id,
    slug: spec.slug,
    title: spec.title,
    rawHtml: spec.rawHtml,
    projectId: spec.projectId,
    answers: spec.answers,
    isDraft: spec.isDraft,
    createdBy: spec.createdBy,
  },
});
```

- [ ] **Step 4: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/[slug]/route.ts
git commit -m "feat(api): PATCH /specs/[slug] + GET étendu (answers + isDraft)"
```

---

### Task 11: POST /api/work/v1/roadmap/specs/preview

**Files:**
- Create: `EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/preview/route.ts`

- [ ] **Step 1: Écrire route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleWorkAuthError } from "@/lib/work/permissions";
import { PreviewSpecSchema } from "@/lib/work/erisclave/schemas";
import { renderSpecHtml } from "@/lib/work/erisclave/html-builder";
import type { AnswersV1 } from "@/lib/work/erisclave/types";

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request, "work.roadmap.view");

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

    const parsed = PreviewSpecSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const answers: AnswersV1 = {
      version: 1,
      project: parsed.data.project,
      features: parsed.data.features,
      meta: { createdAt: now, updatedAt: now, createdBy: null },
    };
    const html = renderSpecHtml(answers);
    return NextResponse.json({ html });
  } catch (err) {
    return handleWorkAuthError(err);
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add EriniumFactionWeb/src/app/api/work/v1/roadmap/specs/preview/route.ts
git commit -m "feat(api): POST /specs/preview render sans persister"
```

---

### Task 12: Smoke script API

**Files:**
- Create: `EriniumFactionWeb/scripts/smoke-erisclave-api.ts`

- [ ] **Step 1: Écrire le smoke**

```typescript
/**
 * Smoke test des 4 endpoints Erisclave Phase 2b.
 * Run : pnpm tsx scripts/smoke-erisclave-api.ts
 * Pré-requis : `ERISCLAVE_DUMP_TOKEN` (JWT staff) + serveur tournant sur localhost:3000.
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.ERISCLAVE_DUMP_TOKEN;
if (!TOKEN) { console.error("ERISCLAVE_DUMP_TOKEN missing"); process.exit(1); }

const headers = { "Content-Type": "application/json", Cookie: `next-auth.session-token=${TOKEN}` };
let failures = 0;
function check(n: string, c: boolean) { c ? console.log(`OK  ${n}`) : (console.error(`FAIL ${n}`), failures++); }

// 1. Create draft
const createRes = await fetch(`${BASE}/api/work/v1/roadmap/specs`, {
  method: "POST", headers,
  body: JSON.stringify({ projectId: 1, title: "Smoke Test Spec" }),
});
const createJson = await createRes.json();
check("POST /specs 201", createRes.status === 201);
const slug = createJson.spec?.slug;
check("POST /specs returns slug", typeof slug === "string");

// 2. PATCH update answers
const patchRes = await fetch(`${BASE}/api/work/v1/roadmap/specs/${slug}`, {
  method: "PATCH", headers,
  body: JSON.stringify({
    answers: {
      version: 1, project: { id: 1, title: "Smoke" },
      features: [{ id: "f1", type: "bloc", title: "Test Block", answers: { summary: "Hello" } }],
      meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: null },
    },
  }),
});
check("PATCH /specs/[slug] 200", patchRes.status === 200);

// 3. GET étendu
const getRes = await fetch(`${BASE}/api/work/v1/roadmap/specs/${slug}`, { headers });
const getJson = await getRes.json();
check("GET /specs/[slug] returns answers", !!getJson.spec?.answers);
check("GET /specs/[slug] returns isDraft=true", getJson.spec?.isDraft === true);

// 4. PATCH publish
const pubRes = await fetch(`${BASE}/api/work/v1/roadmap/specs/${slug}`, {
  method: "PATCH", headers, body: JSON.stringify({ isDraft: false }),
});
check("PATCH publish 200", pubRes.status === 200);

// 5. GET drafts (le spec n'y est plus)
const draftsRes = await fetch(`${BASE}/api/work/v1/roadmap/specs/drafts`, { headers });
const draftsJson = await draftsRes.json();
check("GET /drafts excludes published", !draftsJson.drafts?.some((d: { slug: string }) => d.slug === slug));

// 6. POST preview
const previewRes = await fetch(`${BASE}/api/work/v1/roadmap/specs/preview`, {
  method: "POST", headers,
  body: JSON.stringify({
    project: null,
    features: [{ id: "f1", type: "item", title: "Test", answers: { summary: "Preview only" } }],
  }),
});
const previewJson = await previewRes.json();
check("POST /preview returns html", typeof previewJson.html === "string" && previewJson.html.length > 100);

// 7. DELETE cleanup
await fetch(`${BASE}/api/work/v1/roadmap/specs/${slug}`, { method: "DELETE", headers });

if (failures > 0) { console.error(`\n${failures} failures`); process.exit(1); }
console.log("\nAll API smoke OK.");
```

- [ ] **Step 2: Démarrer le serveur dev + run**

Dans un terminal : `cd EriniumFactionWeb && pnpm dev` puis dans un autre :
```bash
cd EriniumFactionWeb && ERISCLAVE_DUMP_TOKEN=<jwt> pnpm tsx scripts/smoke-erisclave-api.ts
```
Expected: tous les checks OK.

- [ ] **Step 3: Commit**

```bash
git add EriniumFactionWeb/scripts/smoke-erisclave-api.ts
git commit -m "test(work/erisclave): smoke API 5 endpoints"
```

---

## Phase C — Editor UI core

### Task 13: Hooks React Query

**Files:**
- Create: `EriniumFactionWeb/src/hooks/work/useSpecsMutations.ts`
- Modify: `EriniumFactionWeb/src/hooks/work/useRoadmap.ts` (étendre useRoadmapSpec)

- [ ] **Step 1: useSpecsMutations.ts**

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnswersV1 } from "@/lib/work/erisclave/types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    let msg = res.statusText;
    try { const body = await res.json(); msg = body.error ?? msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function useCreateSpec() {
  return useMutation({
    mutationFn: (input: { projectId: number; title: string }) =>
      jsonFetch<{ spec: { slug: string; title: string } }>("/api/work/v1/roadmap/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
  });
}

interface UpdateSpecInput {
  title?: string;
  answers?: AnswersV1;
  isDraft?: boolean;
}

export function useUpdateSpec(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["update-spec", slug],
    mutationFn: (input: UpdateSpecInput) =>
      jsonFetch<{ spec: unknown }>(`/api/work/v1/roadmap/specs/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roadmap-spec", slug] });
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
}

export function usePreviewSpec() {
  return useMutation({
    mutationFn: (input: { project: { id: number; title: string } | null; features: unknown[] }) =>
      jsonFetch<{ html: string }>("/api/work/v1/roadmap/specs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
  });
}

export function useDrafts() {
  return useQuery({
    queryKey: ["drafts"],
    queryFn: () =>
      jsonFetch<{ drafts: Array<{ slug: string; title: string; projectId: number; updatedAt: string }> }>(
        "/api/work/v1/roadmap/specs/drafts",
      ),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Étendre useRoadmapSpec**

Dans `EriniumFactionWeb/src/hooks/work/useRoadmap.ts`, repérer `useRoadmapSpec`. Adapter le typage du payload retourné pour inclure `answers + isDraft + createdBy` (mirror du GET API). Le hook fait déjà un GET sur `/api/work/v1/roadmap/specs/[slug]` qui retourne le payload étendu — donc seul le type change.

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/hooks/work/useSpecsMutations.ts \
        EriniumFactionWeb/src/hooks/work/useRoadmap.ts
git commit -m "feat(hooks/specs): useCreateSpec, useUpdateSpec, usePreviewSpec, useDrafts + extend useRoadmapSpec"
```

---

### Task 14: NewSpecModal + bouton 📋 sur RoadmapCard

**Files:**
- Create: `EriniumFactionWeb/src/components/work/specs/NewSpecModal.tsx`
- Modify: `EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx`

- [ ] **Step 1: NewSpecModal.tsx**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCreateSpec } from "@/hooks/work/useSpecsMutations";

interface Props {
  open: boolean;
  projectId: number;
  projectTitle: string;
  onClose: () => void;
}

export default function NewSpecModal({ open, projectId, projectTitle, onClose }: Props) {
  const [title, setTitle] = useState(projectTitle);
  const [error, setError] = useState<string | null>(null);
  const createMut = useCreateSpec();
  const router = useRouter();

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 1) { setError("Titre requis"); return; }
    try {
      const res = await createMut.mutateAsync({ projectId, title: title.trim() });
      router.push(`/admin/work/specs/${res.spec.slug}/edit`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-erisclave-cream rounded-2xl p-6 w-full max-w-md shadow-xl border border-erisclave-cream-deep"
      >
        <h2 className="text-lg font-bold text-erisclave-ink mb-4">Nouveau brouillon de spec</h2>
        <label className="block text-sm font-medium text-erisclave-ink-soft mb-1">Titre du spec</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoFocus
          className="w-full bg-white border border-erisclave-cream-deep rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-erisclave-pink"
        />
        <p className="text-xs text-erisclave-ink-soft mt-2">
          Lié au projet : <span className="font-semibold">{projectTitle}</span>
        </p>
        {error && <p className="text-xs text-erisclave-red-ko mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-erisclave-ink-soft hover:text-erisclave-ink"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="px-4 py-2 text-sm font-semibold bg-erisclave-pink-deep text-white rounded hover:bg-erisclave-pink-deep/90 disabled:opacity-50"
          >
            {createMut.isPending ? "Création…" : "Créer brouillon"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter bouton 📋 sur RoadmapCard**

Dans `EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx`, dans le cluster de boutons à droite du header (déjà StatusDropdown + ✏ + 🗑) :

1. Importer en haut : `import NewSpecModal from "@/components/work/specs/NewSpecModal";`
2. State : `const [showNewSpec, setShowNewSpec] = useState(false);`
3. Bouton dans le cluster header (avant le ✏) :
```tsx
{canEdit && (
  <button
    type="button"
    onClick={() => setShowNewSpec(true)}
    aria-label="Nouveau spec"
    title="Nouveau spec"
    className="opacity-0 group-hover:opacity-100 transition
               text-erisclave-ink-soft hover:text-erisclave-pink-deep
               focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-erisclave-pink
               text-sm"
  >
    📋
  </button>
)}
```
4. Modal en fin de JSX (avant `</article>`) :
```tsx
<NewSpecModal
  open={showNewSpec}
  projectId={project.id}
  projectTitle={project.title}
  onClose={() => setShowNewSpec(false)}
/>
```

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/components/work/specs/NewSpecModal.tsx \
        EriniumFactionWeb/src/components/work/roadmap/RoadmapCard.tsx
git commit -m "feat(ui/specs): NewSpecModal + bouton sur RoadmapCard"
```

---

### Task 15: Page /edit scaffold + useSpecEditor reducer

**Files:**
- Create: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/page.tsx`
- Create: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx`
- Create: `EriniumFactionWeb/src/hooks/work/useSpecEditor.ts`

- [ ] **Step 1: useSpecEditor.ts reducer**

```typescript
"use client";

import { useReducer } from "react";
import { nanoid } from "nanoid";
import type { AnswersV1, Feature, FeatureTypeId, FieldValue } from "@/lib/work/erisclave/types";

export interface EditorState {
  spec: { id: number; slug: string; title: string; isDraft: boolean; projectId: number };
  features: Feature[];
  selectedFeatureId: string | null;
  lastSavedAt: number | null;
  isDirty: boolean;
}

export type EditorAction =
  | { type: "ADD_FEATURE"; featureType: FeatureTypeId; defaultTitle: string }
  | { type: "DELETE_FEATURE"; featureId: string }
  | { type: "SELECT_FEATURE"; featureId: string }
  | { type: "UPDATE_FEATURE_TITLE"; featureId: string; title: string }
  | { type: "UPDATE_FIELD"; featureId: string; fieldId: string; value: FieldValue }
  | { type: "REORDER_FEATURES"; orderedIds: string[] }
  | { type: "RENAME_SPEC"; title: string }
  | { type: "TOGGLE_DRAFT"; isDraft: boolean }
  | { type: "MARK_SAVED"; timestamp: number };

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "ADD_FEATURE": {
      const id = nanoid(8);
      const newFeature: Feature = {
        id, type: action.featureType, title: action.defaultTitle, answers: {},
      };
      return { ...state, features: [...state.features, newFeature], selectedFeatureId: id, isDirty: true };
    }
    case "DELETE_FEATURE": {
      const features = state.features.filter((f) => f.id !== action.featureId);
      const selectedFeatureId = state.selectedFeatureId === action.featureId
        ? features[0]?.id ?? null
        : state.selectedFeatureId;
      return { ...state, features, selectedFeatureId, isDirty: true };
    }
    case "SELECT_FEATURE":
      return { ...state, selectedFeatureId: action.featureId };
    case "UPDATE_FEATURE_TITLE":
      return {
        ...state,
        features: state.features.map((f) => (f.id === action.featureId ? { ...f, title: action.title } : f)),
        isDirty: true,
      };
    case "UPDATE_FIELD":
      return {
        ...state,
        features: state.features.map((f) =>
          f.id === action.featureId
            ? { ...f, answers: { ...f.answers, [action.fieldId]: action.value } }
            : f,
        ),
        isDirty: true,
      };
    case "REORDER_FEATURES": {
      const map = new Map(state.features.map((f) => [f.id, f]));
      return { ...state, features: action.orderedIds.map((id) => map.get(id)!).filter(Boolean), isDirty: true };
    }
    case "RENAME_SPEC":
      return { ...state, spec: { ...state.spec, title: action.title }, isDirty: true };
    case "TOGGLE_DRAFT":
      return { ...state, spec: { ...state.spec, isDraft: action.isDraft }, isDirty: true };
    case "MARK_SAVED":
      return { ...state, lastSavedAt: action.timestamp, isDirty: false };
    default: return state;
  }
}

export function useSpecEditor(initial: EditorState) {
  return useReducer(reducer, initial);
}

export function buildAnswersFromState(state: EditorState): AnswersV1 {
  return {
    version: 1,
    project: { id: state.spec.projectId, title: state.spec.title },
    features: state.features,
    meta: {
      createdAt: new Date(state.lastSavedAt ?? Date.now()).toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
    },
  };
}
```

- [ ] **Step 2: page.tsx (server entry)**

```tsx
import SpecEditorClient from "./SpecEditorClient";

export default async function SpecEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SpecEditorClient slug={slug} />;
}
```

- [ ] **Step 3: SpecEditorClient.tsx (layout 3 zones, scaffold sans contenus)**

```tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRoadmapSpec } from "@/hooks/work/useRoadmap";
import { useWorkPerms } from "@/hooks/work/useWorkPerms";
import { useSpecEditor, type EditorState } from "@/hooks/work/useSpecEditor";

interface Props { slug: string; }

export default function SpecEditorClient({ slug }: Props) {
  const { hasPerm } = useWorkPerms();
  const canEdit = hasPerm("work.roadmap.edit");
  const { data: spec, isLoading, error } = useRoadmapSpec(slug);

  const initialState: EditorState | null = useMemo(() => {
    if (!spec) return null;
    if (spec.answers === null) return null; // legacy non éditable
    return {
      spec: { id: spec.id, slug: spec.slug, title: spec.title, isDraft: spec.isDraft, projectId: spec.projectId },
      features: spec.answers.features,
      selectedFeatureId: spec.answers.features[0]?.id ?? null,
      lastSavedAt: Date.now(),
      isDirty: false,
    };
  }, [spec]);

  if (!canEdit) {
    return <div className="p-8 text-erisclave-ink">Permission <code>work.roadmap.edit</code> requise.</div>;
  }
  if (isLoading) return <div className="p-8 text-erisclave-ink-soft">Chargement…</div>;
  if (error) return <div className="p-8 text-erisclave-red-ko">Erreur : {(error as Error).message}</div>;
  if (!spec) return <div className="p-8">Spec introuvable.</div>;
  if (spec.answers === null) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-xl font-bold text-erisclave-ink mb-2">Spec legacy non éditable</h1>
        <p className="text-sm text-erisclave-ink-soft mb-4">
          Ce spec a été importé depuis l'ancien Erisclave (HTML statique) et ne peut pas être édité dans le builder structured.
        </p>
        <Link href={`/admin/work/specs/${slug}`} className="text-erisclave-pink-deep hover:underline">
          ← Voir en lecture
        </Link>
      </div>
    );
  }
  return <SpecEditorInner initial={initialState!} />;
}

function SpecEditorInner({ initial }: { initial: EditorState }) {
  const [state, dispatch] = useSpecEditor(initial);

  return (
    <div className="flex flex-col h-screen bg-erisclave-cream">
      {/* Header sticky — vide pour MVP scaffold, Task 17 ajoute le contenu */}
      <header className="border-b border-erisclave-cream-deep p-3 bg-erisclave-cream-warm">
        <div className="text-sm font-semibold">{state.spec.title}</div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-erisclave-cream-deep p-3 overflow-y-auto">
          {/* FeaturesSidebar — Task 16 */}
          <p className="text-xs text-erisclave-ink-soft">Sidebar (Task 16)</p>
        </aside>
        <main className="flex-1 overflow-y-auto p-6">
          {/* FeatureFormPanel — Task 17 */}
          <p className="text-sm text-erisclave-ink-soft">Form panel (Task 17)</p>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/ \
        EriniumFactionWeb/src/hooks/work/useSpecEditor.ts
git commit -m "feat(ui/specs/edit): scaffold page + useSpecEditor reducer + redirect legacy"
```

---

### Task 16: FeaturesSidebar (DnD + add/delete)

**Files:**
- Create: `EriniumFactionWeb/src/components/work/specs/editor/FeaturesSidebar.tsx`
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx`

- [ ] **Step 1: FeaturesSidebar.tsx**

```tsx
"use client";

import { useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { listFeatureTypes } from "@/lib/work/erisclave/question-engine";
import type { Feature, FeatureTypeId } from "@/lib/work/erisclave/types";
import type { EditorAction } from "@/hooks/work/useSpecEditor";

interface Props {
  features: Feature[];
  selectedFeatureId: string | null;
  dispatch: (action: EditorAction) => void;
}

export default function FeaturesSidebar({ features, selectedFeatureId, dispatch }: Props) {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const types = listFeatureTypes();
  const ids = features.map((f) => f.id);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    dispatch({ type: "REORDER_FEATURES", orderedIds: next });
  }

  function addFeature(type: FeatureTypeId) {
    const label = types.find((t) => t.id === type)?.label ?? type;
    dispatch({ type: "ADD_FEATURE", featureType: type, defaultTitle: `Nouvelle ${label.toLowerCase()}` });
    setShowTypeMenu(false);
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowTypeMenu((s) => !s)}
          className="w-full px-3 py-2 text-sm font-semibold bg-erisclave-pink-deep text-white rounded hover:bg-erisclave-pink-deep/90"
        >
          + Feature
        </button>
        {showTypeMenu && (
          <div
            className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-erisclave-cream-deep rounded shadow-lg max-h-72 overflow-y-auto"
            onMouseLeave={() => setShowTypeMenu(false)}
          >
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => addFeature(t.id)}
                className="block w-full text-left px-3 py-2 text-sm text-erisclave-ink hover:bg-erisclave-cream"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {features.length === 0 ? (
        <p className="text-xs text-erisclave-ink-soft italic">Aucune feature. Cliquer "+ Feature" pour commencer.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1">
              {features.map((f) => (
                <SortableFeatureItem
                  key={f.id}
                  feature={f}
                  selected={selectedFeatureId === f.id}
                  typeLabel={types.find((t) => t.id === f.type)?.label ?? f.type}
                  onSelect={() => dispatch({ type: "SELECT_FEATURE", featureId: f.id })}
                  onDelete={() => {
                    if (confirm(`Supprimer la feature "${f.title}" ?`)) {
                      dispatch({ type: "DELETE_FEATURE", featureId: f.id });
                    }
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface ItemProps {
  feature: Feature; selected: boolean; typeLabel: string;
  onSelect: () => void; onDelete: () => void;
}
function SortableFeatureItem({ feature, selected, typeLabel, onSelect, onDelete }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: feature.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer ${
        selected ? "bg-erisclave-pink/15 border border-erisclave-pink/40" : "hover:bg-erisclave-cream-deep/30"
      }`}
      onClick={onSelect}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ touchAction: "none" }}
        className="text-erisclave-ink-soft cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-erisclave-ink truncate">{feature.title || "(sans titre)"}</div>
        <div className="text-[10px] uppercase tracking-wide text-erisclave-ink-soft">{typeLabel}</div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Supprimer"
        className="opacity-0 group-hover:opacity-100 transition text-erisclave-red-ko text-xs"
      >
        🗑
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Intégrer dans SpecEditorClient**

Dans `SpecEditorInner`, remplacer le placeholder sidebar :
```tsx
import FeaturesSidebar from "@/components/work/specs/editor/FeaturesSidebar";

// dans le JSX :
<aside className="w-64 border-r border-erisclave-cream-deep p-3 overflow-y-auto">
  <FeaturesSidebar
    features={state.features}
    selectedFeatureId={state.selectedFeatureId}
    dispatch={dispatch}
  />
</aside>
```

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/components/work/specs/editor/FeaturesSidebar.tsx \
        EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx
git commit -m "feat(ui/specs/edit): FeaturesSidebar avec DnD + add/delete feature"
```

---

### Task 17: FieldRenderer + 7 FieldComponents

**Files:**
- Create: `EriniumFactionWeb/src/components/work/specs/editor/FieldRenderer.tsx`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/fields/TextField.tsx`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/fields/LongTextField.tsx`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/fields/SelectField.tsx`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/fields/ListField.tsx`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/fields/TableField.tsx`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/fields/ChecklistField.tsx`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/fields/ImageField.tsx`

- [ ] **Step 1: FieldRenderer.tsx (dispatch)**

```tsx
"use client";

import type { FieldDescriptor, FieldValue } from "@/lib/work/erisclave/types";
import TextField from "./fields/TextField";
import LongTextField from "./fields/LongTextField";
import SelectField from "./fields/SelectField";
import ListField from "./fields/ListField";
import TableField from "./fields/TableField";
import ChecklistField from "./fields/ChecklistField";
import ImageField from "./fields/ImageField";

interface Props {
  field: FieldDescriptor;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}

export default function FieldRenderer({ field, value, onChange }: Props) {
  const wrapperCls = "py-3";
  const common = (
    <div className="mb-1">
      <label className="block text-sm font-medium text-erisclave-ink">{field.label}{field.required && <span className="text-erisclave-red-ko ml-1">*</span>}</label>
      {field.help && <p className="text-xs text-erisclave-ink-soft mt-0.5">{field.help}</p>}
    </div>
  );

  return (
    <div className={wrapperCls}>
      {common}
      {(() => {
        switch (field.kind) {
          case "text":      return <TextField field={field} value={value as string | null} onChange={onChange} />;
          case "longtext":  return <LongTextField field={field} value={value as string | null} onChange={onChange} />;
          case "select":    return <SelectField field={field} value={value as string | null} onChange={onChange} />;
          case "list":      return <ListField value={value as string[] | null} onChange={onChange} />;
          case "checklist": return <ChecklistField field={field} value={value as string[] | null} onChange={onChange} />;
          case "table":     return <TableField field={field} value={value as Array<Record<string, string>> | null} onChange={onChange} />;
          case "image":     return <ImageField field={field} value={value as string[] | null} onChange={onChange} />;
        }
      })()}
    </div>
  );
}
```

- [ ] **Step 2: TextField.tsx**

```tsx
"use client";
import type { FieldDescriptor, FieldValue } from "@/lib/work/erisclave/types";

export default function TextField({ field, value, onChange }: {
  field: FieldDescriptor; value: string | null; onChange: (v: FieldValue) => void;
}) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={field.placeholder}
      maxLength={500}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full bg-white border border-erisclave-cream-deep rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-erisclave-pink"
    />
  );
}
```

- [ ] **Step 3: LongTextField.tsx**

```tsx
"use client";
import type { FieldDescriptor, FieldValue } from "@/lib/work/erisclave/types";

export default function LongTextField({ field, value, onChange }: {
  field: FieldDescriptor; value: string | null; onChange: (v: FieldValue) => void;
}) {
  return (
    <textarea
      value={value ?? ""}
      placeholder={field.placeholder ?? "Markdown supporté (**gras**, *italique*, listes - …)"}
      rows={5}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full bg-white border border-erisclave-cream-deep rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-erisclave-pink"
    />
  );
}
```

- [ ] **Step 4: SelectField.tsx**

```tsx
"use client";
import type { FieldDescriptor, FieldValue } from "@/lib/work/erisclave/types";

export default function SelectField({ field, value, onChange }: {
  field: FieldDescriptor; value: string | null; onChange: (v: FieldValue) => void;
}) {
  const options = field.options ?? [];
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full bg-white border border-erisclave-cream-deep rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-erisclave-pink"
    >
      <option value="">— Sélectionner —</option>
      {options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
    </select>
  );
}
```

- [ ] **Step 5: ListField.tsx**

```tsx
"use client";
import { useState } from "react";
import type { FieldValue } from "@/lib/work/erisclave/types";

export default function ListField({ value, onChange }: {
  value: string[] | null; onChange: (v: FieldValue) => void;
}) {
  const [draft, setDraft] = useState("");
  const items = value ?? [];

  function add() {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  }
  function remove(i: number) { onChange(items.filter((_, idx) => idx !== i)); }
  function update(i: number, v: string) { onChange(items.map((x, idx) => (idx === i ? v : x))); }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => update(i, e.target.value)}
            className="flex-1 bg-white border border-erisclave-cream-deep rounded px-2 py-1 text-sm"
          />
          <button type="button" onClick={() => remove(i)} className="text-erisclave-red-ko text-sm px-2">🗑</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Ajouter un item…"
          className="flex-1 bg-white border border-erisclave-cream-deep rounded px-2 py-1 text-sm"
        />
        <button type="button" onClick={add} className="px-3 py-1 text-sm bg-erisclave-pink-deep text-white rounded">+</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: ChecklistField.tsx**

```tsx
"use client";
import type { FieldDescriptor, FieldValue } from "@/lib/work/erisclave/types";

export default function ChecklistField({ field, value, onChange }: {
  field: FieldDescriptor; value: string[] | null; onChange: (v: FieldValue) => void;
}) {
  const options = field.options ?? [];
  const selected = new Set(value ?? []);
  function toggle(opt: string) {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt); else next.add(opt);
    onChange(Array.from(next));
  }
  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(opt)}
            onChange={() => toggle(opt)}
            className="accent-erisclave-pink-deep"
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: TableField.tsx**

```tsx
"use client";
import type { FieldDescriptor, FieldValue } from "@/lib/work/erisclave/types";

export default function TableField({ field, value, onChange }: {
  field: FieldDescriptor;
  value: Array<Record<string, string>> | null;
  onChange: (v: FieldValue) => void;
}) {
  const cols = field.columns ?? [];
  const rows = value ?? [];
  function addRow() { onChange([...rows, Object.fromEntries(cols.map((c) => [c, ""]))]); }
  function removeRow(i: number) { onChange(rows.filter((_, idx) => idx !== i)); }
  function updateCell(i: number, col: string, v: string) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [col]: v } : r)));
  }

  return (
    <div className="overflow-x-auto border border-erisclave-cream-deep rounded">
      <table className="w-full text-sm">
        <thead className="bg-erisclave-cream-warm">
          <tr>
            {cols.map((c) => (<th key={c} className="px-2 py-1 text-left text-xs font-semibold text-erisclave-ink-soft uppercase">{c}</th>))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length + 1} className="px-2 py-3 text-center text-xs text-erisclave-ink-soft italic">Aucune ligne</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-erisclave-cream-deep">
              {cols.map((c) => (
                <td key={c} className="p-0">
                  <input
                    type="text"
                    value={row[c] ?? ""}
                    onChange={(e) => updateCell(i, c, e.target.value)}
                    className="w-full bg-transparent px-2 py-1 text-sm focus:outline-none focus:bg-white"
                  />
                </td>
              ))}
              <td className="text-center">
                <button type="button" onClick={() => removeRow(i)} className="text-erisclave-red-ko text-xs">🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="block w-full text-xs py-1.5 text-erisclave-pink-deep hover:bg-erisclave-cream"
      >
        + Ajouter une ligne
      </button>
    </div>
  );
}
```

- [ ] **Step 8: ImageField.tsx**

```tsx
"use client";
import { useState } from "react";
import type { FieldDescriptor, FieldValue } from "@/lib/work/erisclave/types";

export default function ImageField({ field, value, onChange }: {
  field: FieldDescriptor; value: string[] | null; onChange: (v: FieldValue) => void;
}) {
  const [draft, setDraft] = useState("");
  const urls = value ?? [];

  function add() {
    const url = draft.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) { alert("URL doit commencer par http:// ou https://"); return; }
    onChange([...urls, url]);
    setDraft("");
  }
  function remove(i: number) { onChange(urls.filter((_, idx) => idx !== i)); }

  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {urls.map((url, i) => (
            <div key={i} className="relative group border border-erisclave-cream-deep rounded overflow-hidden">
              <img src={url} alt="" className="w-full h-24 object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-white/90 rounded px-2 py-0.5 text-xs text-erisclave-red-ko"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="https://example.com/image.png"
          className="flex-1 bg-white border border-erisclave-cream-deep rounded px-2 py-1 text-sm"
        />
        <button type="button" onClick={add} className="px-3 py-1 text-sm bg-erisclave-pink-deep text-white rounded">+</button>
      </div>
      <p className="text-[11px] text-erisclave-ink-soft">URL HTTP(S) uniquement. Upload prévu V2.</p>
    </div>
  );
}
```

- [ ] **Step 9: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add EriniumFactionWeb/src/components/work/specs/editor/FieldRenderer.tsx \
        EriniumFactionWeb/src/components/work/specs/editor/fields/
git commit -m "feat(ui/specs/edit): FieldRenderer dispatch + 7 field components"
```

---

### Task 18: FeatureFormPanel (sectioned form)

**Files:**
- Create: `EriniumFactionWeb/src/components/work/specs/editor/FeatureFormPanel.tsx`
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx`

- [ ] **Step 1: FeatureFormPanel.tsx**

```tsx
"use client";

import { useMemo } from "react";
import { getQuestionnaire, listFeatureTypes } from "@/lib/work/erisclave/question-engine";
import type { Feature, FieldValue } from "@/lib/work/erisclave/types";
import type { EditorAction } from "@/hooks/work/useSpecEditor";
import FieldRenderer from "./FieldRenderer";

interface Props {
  feature: Feature | null;
  dispatch: (action: EditorAction) => void;
}

export default function FeatureFormPanel({ feature, dispatch }: Props) {
  if (!feature) {
    return (
      <div className="text-erisclave-ink-soft text-sm italic">
        Sélectionner une feature dans la sidebar, ou ajouter une nouvelle feature.
      </div>
    );
  }

  const questionnaire = useMemo(() => getQuestionnaire(feature.type), [feature.type]);
  const typeLabel = listFeatureTypes().find((t) => t.id === feature.type)?.label ?? feature.type;

  function updateField(fieldId: string, value: FieldValue) {
    dispatch({ type: "UPDATE_FIELD", featureId: feature!.id, fieldId, value });
  }

  return (
    <article className="max-w-3xl space-y-6">
      {/* Header feature */}
      <header>
        <div className="text-xs uppercase tracking-wide text-erisclave-ink-soft mb-1">{typeLabel}</div>
        <input
          type="text"
          value={feature.title}
          onChange={(e) => dispatch({ type: "UPDATE_FEATURE_TITLE", featureId: feature.id, title: e.target.value })}
          placeholder="Titre de la feature"
          maxLength={200}
          className="w-full text-2xl font-bold bg-transparent border-b border-erisclave-cream-deep focus:outline-none focus:border-erisclave-pink-deep py-1"
        />
      </header>

      {/* Sections */}
      {questionnaire.sections.map((section) => (
        <section key={section.id} className="bg-white rounded-xl p-5 border border-erisclave-cream-deep">
          <header className="mb-3">
            <h2 className="text-base font-bold text-erisclave-pink-deep">{section.title}</h2>
            {section.intro && <p className="text-xs text-erisclave-ink-soft mt-1">{section.intro}</p>}
          </header>
          <div className="divide-y divide-erisclave-cream-deep">
            {section.fields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={feature.answers[field.id] ?? null}
                onChange={(v) => updateField(field.id, v)}
              />
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
```

- [ ] **Step 2: Intégrer dans SpecEditorInner**

Dans `SpecEditorClient.tsx`, remplacer le placeholder du `<main>` :
```tsx
import FeatureFormPanel from "@/components/work/specs/editor/FeatureFormPanel";

// dans le JSX :
<main className="flex-1 overflow-y-auto p-6">
  <FeatureFormPanel
    feature={state.features.find((f) => f.id === state.selectedFeatureId) ?? null}
    dispatch={dispatch}
  />
</main>
```

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/components/work/specs/editor/FeatureFormPanel.tsx \
        EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx
git commit -m "feat(ui/specs/edit): FeatureFormPanel sectioned form"
```

---

### Task 19: useAutosave + AutosaveIndicator + useNavigationGuard

**Files:**
- Create: `EriniumFactionWeb/src/hooks/work/useAutosave.ts`
- Create: `EriniumFactionWeb/src/hooks/work/useNavigationGuard.ts`
- Create: `EriniumFactionWeb/src/components/work/specs/editor/AutosaveIndicator.tsx`
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx`

- [ ] **Step 1: useAutosave.ts**

```typescript
"use client";

import { useEffect, useRef } from "react";

interface Options<T> {
  data: T;
  enabled: boolean;
  delayMs?: number;
  save: (data: T) => Promise<void>;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Autosave debounce : déclenche `save(data)` `delayMs` ms après la dernière modif.
 * Annule les saves en cours si data change. `enabled = false` désactive (utile pendant drag).
 */
export function useAutosave<T>(opts: Options<T>): void {
  const { data, enabled, save, onSuccess, onError } = opts;
  const delayMs = opts.delayMs ?? 1500;
  const lastSavedRef = useRef<string>(JSON.stringify(data));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await save(data);
        lastSavedRef.current = serialized;
        onSuccess?.();
      } catch (e) {
        onError?.(e as Error);
      }
    }, delayMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [data, enabled, delayMs, save, onSuccess, onError]);
}
```

- [ ] **Step 2: useNavigationGuard.ts**

```typescript
"use client";

import { useEffect } from "react";

/** Affiche un confirm browser tant que `active === true` (avant unload). */
export function useNavigationGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = ""; // requis Chrome
      return "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
```

- [ ] **Step 3: AutosaveIndicator.tsx**

```tsx
"use client";

interface Props {
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  lastSavedAt: number | null;
  onRetry: () => void;
}

export default function AutosaveIndicator({ isDirty, isSaving, error, lastSavedAt, onRetry }: Props) {
  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-erisclave-red-ko">
        Erreur sauvegarde ✗
        <button type="button" onClick={onRetry} className="underline">Réessayer</button>
      </div>
    );
  }
  if (isSaving) return <div className="text-xs text-erisclave-ink-soft">Enregistrement…</div>;
  if (isDirty) return <div className="text-xs text-erisclave-ink-soft italic">Modifications non sauvegardées</div>;
  if (lastSavedAt) {
    const sec = Math.max(1, Math.round((Date.now() - lastSavedAt) / 1000));
    return <div className="text-xs text-erisclave-ink-soft">Enregistré ✓ (il y a {sec}s)</div>;
  }
  return null;
}
```

- [ ] **Step 4: Câbler dans SpecEditorClient**

Dans `SpecEditorInner`, ajouter les imports et la logique :
```tsx
import { useCallback, useState } from "react";
import { useUpdateSpec } from "@/hooks/work/useSpecsMutations";
import { useAutosave } from "@/hooks/work/useAutosave";
import { useNavigationGuard } from "@/hooks/work/useNavigationGuard";
import AutosaveIndicator from "@/components/work/specs/editor/AutosaveIndicator";
import { buildAnswersFromState } from "@/hooks/work/useSpecEditor";

// dans le composant SpecEditorInner :
const updateMut = useUpdateSpec(initial.spec.slug);
const [saveError, setSaveError] = useState<string | null>(null);

const save = useCallback(async (currentState: typeof state) => {
  setSaveError(null);
  const answers = buildAnswersFromState(currentState);
  await updateMut.mutateAsync({ answers, title: currentState.spec.title });
  dispatch({ type: "MARK_SAVED", timestamp: Date.now() });
}, [updateMut, dispatch]);

useAutosave({
  data: state,
  enabled: state.isDirty,
  save,
  onError: (err) => setSaveError(err.message),
});

useNavigationGuard(state.isDirty);
```

Ajouter le `<AutosaveIndicator />` dans le header :
```tsx
<header className="border-b border-erisclave-cream-deep p-3 bg-erisclave-cream-warm flex items-center justify-between">
  <div className="text-sm font-semibold">{state.spec.title}</div>
  <AutosaveIndicator
    isDirty={state.isDirty}
    isSaving={updateMut.isPending}
    error={saveError}
    lastSavedAt={state.lastSavedAt}
    onRetry={() => save(state)}
  />
</header>
```

- [ ] **Step 5: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add EriniumFactionWeb/src/hooks/work/useAutosave.ts \
        EriniumFactionWeb/src/hooks/work/useNavigationGuard.ts \
        EriniumFactionWeb/src/components/work/specs/editor/AutosaveIndicator.tsx \
        EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx
git commit -m "feat(ui/specs/edit): useAutosave debounce 1.5s + navigation guard + indicator"
```

---

### Task 20: SpecEditorHeader (titre + boutons Aperçu/Publier/Supprimer)

**Files:**
- Create: `EriniumFactionWeb/src/components/work/specs/editor/SpecEditorHeader.tsx`
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx`

- [ ] **Step 1: SpecEditorHeader.tsx**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/work/roadmap/ConfirmDialog";
import { useDeleteSpec } from "@/hooks/work/useRoadmapMutations";
import type { EditorAction } from "@/hooks/work/useSpecEditor";

interface Props {
  slug: string;
  title: string;
  isDraft: boolean;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  lastSavedAt: number | null;
  onRetrySave: () => void;
  onPreview: () => void;
  onTogglePublish: () => void;
  dispatch: (action: EditorAction) => void;
}

export default function SpecEditorHeader({
  slug, title, isDraft, isDirty, isSaving, saveError, lastSavedAt,
  onRetrySave, onPreview, onTogglePublish, dispatch,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [confirmDel, setConfirmDel] = useState(false);
  const deleteMut = useDeleteSpec();
  const router = useRouter();

  function commitTitle() {
    const t = titleDraft.trim();
    if (t && t !== title) dispatch({ type: "RENAME_SPEC", title: t });
    else setTitleDraft(title);
    setEditingTitle(false);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-erisclave-cream-deep p-3 bg-erisclave-cream-warm flex items-center gap-3">
        <Link
          href={`/admin/work/specs/${slug}`}
          className="text-erisclave-ink-soft hover:text-erisclave-pink-deep text-sm"
        >
          ← Retour
        </Link>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {editingTitle ? (
            <input
              type="text"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitleDraft(title); setEditingTitle(false); } }}
              maxLength={200}
              className="flex-1 text-sm font-semibold bg-white border border-erisclave-cream-deep rounded px-2 py-1"
            />
          ) : (
            <h1
              onDoubleClick={() => setEditingTitle(true)}
              title="Double-clic pour renommer"
              className="text-sm font-semibold text-erisclave-ink truncate cursor-text"
            >
              {title}
            </h1>
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${isDraft ? "bg-erisclave-pink/15 text-erisclave-pink-deep" : "bg-green-100 text-green-800"}`}>
            {isDraft ? "Brouillon" : "Publié"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Indicator inline */}
          {saveError ? (
            <span className="text-xs text-erisclave-red-ko">Erreur ✗ <button onClick={onRetrySave} className="underline ml-1">Réessayer</button></span>
          ) : isSaving ? (
            <span className="text-xs text-erisclave-ink-soft">Enregistrement…</span>
          ) : isDirty ? (
            <span className="text-xs text-erisclave-ink-soft italic">Non sauvegardé</span>
          ) : lastSavedAt ? (
            <span className="text-xs text-erisclave-ink-soft">Enregistré ✓</span>
          ) : null}

          <button type="button" onClick={onPreview} className="text-xs px-3 py-1 border border-erisclave-cream-deep rounded hover:bg-white">
            Aperçu
          </button>
          <button
            type="button"
            onClick={onTogglePublish}
            className={`text-xs px-3 py-1 rounded text-white ${isDraft ? "bg-erisclave-pink-deep hover:bg-erisclave-pink-deep/90" : "bg-erisclave-ink-soft hover:bg-erisclave-ink"}`}
          >
            {isDraft ? "Publier" : "Dépublier"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            aria-label="Supprimer ce spec"
            className="text-erisclave-red-ko text-sm hover:opacity-80"
          >
            🗑
          </button>
        </div>
      </header>

      <ConfirmDialog
        open={confirmDel}
        title="Supprimer ce spec ?"
        message={`Spec "${title}" — cette action est irreversible.`}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        loading={deleteMut.isPending}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteMut.mutate(slug, {
            onSuccess: () => { setConfirmDel(false); router.push("/admin/work/roadmap"); },
          });
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Intégrer dans SpecEditorInner**

Remplacer le `<header>` minimal par :
```tsx
import SpecEditorHeader from "@/components/work/specs/editor/SpecEditorHeader";
import { useState } from "react";

// dans SpecEditorInner :
function handleTogglePublish() {
  const next = !state.spec.isDraft;
  updateMut.mutate({ isDraft: next }, {
    onSuccess: () => dispatch({ type: "TOGGLE_DRAFT", isDraft: next }),
  });
}

// dans le JSX, remplacer <header> par :
<SpecEditorHeader
  slug={initial.spec.slug}
  title={state.spec.title}
  isDraft={state.spec.isDraft}
  isDirty={state.isDirty}
  isSaving={updateMut.isPending}
  saveError={saveError}
  lastSavedAt={state.lastSavedAt}
  onRetrySave={() => save(state)}
  onPreview={() => setShowPreview(true)}  // state local + PreviewModal Task 21
  onTogglePublish={handleTogglePublish}
  dispatch={dispatch}
/>
```

(Le bouton "Aperçu" appelle un setter `setShowPreview(true)` — `showPreview` state local — qui contrôlera le PreviewModal en Task 21. Pour l'instant le bouton fait rien d'utile mais ne casse rien.)

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/components/work/specs/editor/SpecEditorHeader.tsx \
        EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx
git commit -m "feat(ui/specs/edit): SpecEditorHeader avec titre inline + publish/dépublier + delete"
```

---

## Phase D — Aperçu + finition

### Task 21: PreviewModal

**Files:**
- Create: `EriniumFactionWeb/src/components/work/specs/editor/PreviewModal.tsx`
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx`

- [ ] **Step 1: PreviewModal.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePreviewSpec } from "@/hooks/work/useSpecsMutations";
import type { Feature } from "@/lib/work/erisclave/types";

interface Props {
  open: boolean;
  project: { id: number; title: string } | null;
  features: Feature[];
  onClose: () => void;
}

export default function PreviewModal({ open, project, features, onClose }: Props) {
  const previewMut = usePreviewSpec();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setHtml(null); return; }
    previewMut.mutate(
      { project, features },
      { onSuccess: (res) => setHtml(res.html) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      <div className="flex items-center justify-between p-3 bg-erisclave-cream border-b border-erisclave-cream-deep">
        <div className="text-sm font-semibold text-erisclave-ink">Aperçu du spec (non sauvegardé)</div>
        <button type="button" onClick={onClose} className="text-erisclave-ink-soft hover:text-erisclave-ink text-sm">
          Fermer (Echap)
        </button>
      </div>
      <div className="flex-1 bg-white overflow-hidden">
        {previewMut.isPending ? (
          <div className="p-8 text-center text-erisclave-ink-soft">Génération de l'aperçu…</div>
        ) : html ? (
          <iframe
            srcDoc={html}
            sandbox="allow-same-origin"
            className="w-full h-full border-0"
            title="Aperçu spec"
          />
        ) : (
          <div className="p-8 text-center text-erisclave-red-ko">Erreur de génération.</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Câbler dans SpecEditorInner**

```tsx
import PreviewModal from "@/components/work/specs/editor/PreviewModal";
const [showPreview, setShowPreview] = useState(false);

// fin du JSX :
<PreviewModal
  open={showPreview}
  project={{ id: state.spec.projectId, title: state.spec.title }}
  features={state.features}
  onClose={() => setShowPreview(false)}
/>
```

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/components/work/specs/editor/PreviewModal.tsx \
        EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx
git commit -m "feat(ui/specs/edit): PreviewModal iframe sandboxed"
```

---

### Task 22: DraftsDrawer + badge count dans header roadmap

**Files:**
- Create: `EriniumFactionWeb/src/components/work/specs/DraftsDrawer.tsx`
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/roadmap/page.tsx`

- [ ] **Step 1: DraftsDrawer.tsx**

```tsx
"use client";

import Link from "next/link";
import { useDrafts } from "@/hooks/work/useSpecsMutations";

interface Props { open: boolean; onClose: () => void; }

export default function DraftsDrawer({ open, onClose }: Props) {
  const { data, isLoading } = useDrafts();
  if (!open) return null;
  const drafts = data?.drafts ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative w-96 max-w-full h-full bg-erisclave-cream border-l border-erisclave-cream-deep p-5 overflow-y-auto shadow-xl"
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-erisclave-ink">Brouillons</h2>
          <button onClick={onClose} className="text-erisclave-ink-soft hover:text-erisclave-ink">✕</button>
        </header>
        {isLoading ? (
          <p className="text-sm text-erisclave-ink-soft">Chargement…</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-erisclave-ink-soft italic">Aucun brouillon. Crée-en un depuis une card project (bouton 📋).</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/admin/work/specs/${d.slug}/edit`}
                  onClick={onClose}
                  className="block p-3 bg-white border border-erisclave-cream-deep rounded hover:border-erisclave-pink/40"
                >
                  <div className="text-sm font-semibold text-erisclave-ink truncate">{d.title}</div>
                  <div className="text-xs text-erisclave-ink-soft mt-1">
                    Project #{d.projectId} — màj {new Date(d.updatedAt).toLocaleString("fr-FR")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Intégrer dans la page roadmap**

Dans `EriniumFactionWeb/src/app/(admin)/admin/work/roadmap/page.tsx` :
```tsx
import { useState } from "react";
import { useDrafts } from "@/hooks/work/useSpecsMutations";
import DraftsDrawer from "@/components/work/specs/DraftsDrawer";

// dans le composant :
const [showDrafts, setShowDrafts] = useState(false);
const { data: draftsData } = useDrafts();
const draftCount = draftsData?.drafts.length ?? 0;
```

Ajouter le bouton dans le header (à côté de "+ Nouveau project") :
```tsx
<button
  type="button"
  onClick={() => setShowDrafts(true)}
  className="shrink-0 px-3 py-2 rounded-md text-sm bg-white border border-erisclave-cream-deep hover:border-erisclave-pink/40 relative"
>
  Brouillons
  {draftCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-erisclave-pink-deep text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center">
      {draftCount}
    </span>
  )}
</button>
```

Ajouter le drawer en fin de JSX :
```tsx
<DraftsDrawer open={showDrafts} onClose={() => setShowDrafts(false)} />
```

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add EriniumFactionWeb/src/components/work/specs/DraftsDrawer.tsx \
        EriniumFactionWeb/src/app/(admin)/admin/work/roadmap/page.tsx
git commit -m "feat(ui/specs): DraftsDrawer + bouton brouillons sur header roadmap"
```

---

### Task 23: Viewer page — badge draft + bouton Éditer

**Files:**
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/page.tsx`

- [ ] **Step 1: Lire le fichier actuel pour repérer la structure**

```bash
cat "EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/page.tsx"
```

- [ ] **Step 2: Ajouter badge brouillon + bouton Éditer**

Dans le composant viewer, dans le header (où se trouve déjà le bouton "🗑 Supprimer ce spec" de P2a) :
```tsx
import Link from "next/link";

// après le titre, avant les boutons :
{spec.isDraft && (
  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-erisclave-pink/15 text-erisclave-pink-deep ml-2">
    Brouillon
  </span>
)}

// dans le cluster de boutons (avant le bouton supprimer) :
{canEdit && spec.answers !== null && (
  <Link
    href={`/admin/work/specs/${slug}/edit`}
    className="px-3 py-1.5 text-sm bg-erisclave-pink-deep text-white rounded hover:bg-erisclave-pink-deep/90"
  >
    ✏ Éditer
  </Link>
)}
```

- [ ] **Step 3: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/page.tsx"
git commit -m "feat(ui/specs/viewer): badge brouillon + bouton Éditer (caché si legacy)"
```

---

### Task 24: Polish UX + knowissue.md

**Files:**
- Modify: `EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx` (toasts erreur + loading)
- Modify: `docs/knowissue.md`

- [ ] **Step 1: Toast erreur autosave**

Dans `SpecEditorInner`, le `saveError` est déjà affiché dans le header (via `SpecEditorHeader.saveError`). Vérifier que le message est explicite. Si erreur 403 `legacy_not_editable`, basculer en read-only :
```tsx
useEffect(() => {
  if (saveError === "legacy_not_editable") {
    alert("Ce spec est legacy et ne peut pas être édité.");
    router.push(`/admin/work/specs/${initial.spec.slug}`);
  }
}, [saveError, router, initial.spec.slug]);
```

- [ ] **Step 2: Loading state quand draft fraîchement créé est vide**

Le `FeatureFormPanel` affiche déjà "Sélectionner une feature" quand `feature === null`. Polish : si `features.length === 0`, afficher un CTA plus visible :
```tsx
if (!feature) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
      <div className="text-6xl mb-4">📋</div>
      <h2 className="text-lg font-bold text-erisclave-ink mb-2">Ajouter votre première feature</h2>
      <p className="text-sm text-erisclave-ink-soft mb-4">
        Un spec contient une ou plusieurs features (bloc, item, system, etc.). Clique "+ Feature" dans la sidebar pour commencer.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Documenter dans docs/knowissue.md**

Ajouter dans `D:/Mods Minecraft/EriniumFaction/docs/knowissue.md` (en haut de la section actuelle) :
```markdown
## 2026-05-26 — Erisclave P2b : concurrence multi-user + legacy non-éditable

**Système** : Builder structured spec (Phase 2b Erisclave migration).

**Problème 1 — Concurrence** : Si 2 staffs éditent le même spec simultanément, le dernier qui sauvegarde écrase l'autre. Pas de lock optimiste ni de versioning en MVP.

**Mitigation MVP** : Communiquer en interne avant d'éditer un spec partagé. V2 prévue avec versioning + diff visuel + résolution de conflit.

**Problème 2 — Specs legacy non-éditables** : Les 54 specs importés depuis l'app Electron Erisclave (P1) ont `answers IS NULL` en DB. Le bouton "Éditer" est masqué sur ces specs. Le builder structured ne peut pas les convertir (parsing HTML maison trop complexe pour l'effort).

**Workaround** : Créer un nouveau spec structured pour remplacer un legacy, puis supprimer le legacy via "🗑 Supprimer ce spec".

**Problème 3 — Édition d'un spec publié écrase la version live** : Un spec publié reste éditable. Chaque autosave réécrit directement la version live (pas de branchement "draft d'une publication"). Si vous voulez tester de gros changements, dépubliez d'abord (passage en brouillon).

**V2 prévue** : draft d'une version publiée séparé du live.
```

- [ ] **Step 4: Build check**

```bash
cd EriniumFactionWeb && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" pnpm build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "EriniumFactionWeb/src/app/(admin)/admin/work/specs/[slug]/edit/SpecEditorClient.tsx" \
        EriniumFactionWeb/src/components/work/specs/editor/FeatureFormPanel.tsx
git commit -m "polish(ui/specs/edit): empty state + redirect legacy si saveError"

# Puis dans le submodule docs :
cd docs && git add knowissue.md && git commit -m "knowissue: P2b concurrence + legacy non-éditable + édition spec publié"
cd .. && git add docs && git commit -m "docs: bump submodule (knowissue P2b)"
```

---

## Phase E — QA + déploiement

### Task 25: Run migration sur prod Neon (GATE USER)

**Files:** (aucun changement de code, action manuelle)

- [ ] **Step 1: Backup snapshot Neon AVANT migration**

Via Neon console : créer un snapshot manuel de la branche prod (Branches → main → "Take snapshot now").

- [ ] **Step 2: Coller le contenu du SQL dans Neon SQL editor (prod)**

Coller le contenu de `EriniumFactionWeb/src/app/migrations/phase2b-erisclave-specs.sql` dans le SQL editor de Neon prod, lancer.
Expected: 3 ALTER + 2 CREATE INDEX, aucun erreur (idempotent).

- [ ] **Step 3: Vérifier le schéma**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'work_roadmap_specs'
ORDER BY ordinal_position;
```
Expected: voir `answers (jsonb, YES, null)`, `is_draft (boolean, NO, false)`, `created_by (integer, YES, null)`.

- [ ] **Step 4: Marquer task complete (pas de commit)**

> **GATE USER** : confirmer avec killian avant Task 26.

---

### Task 26: Smoke UI prod + bump submodule

**Files:**
- (aucun code, gate user)

- [ ] **Step 1: Smoke UI checklist sur https://eriniumfaction.vercel.app/admin/work/roadmap**

Tester en se loguant comme staff :

- [ ] **CREATE** : Hover une card project → click 📋 → modal s'ouvre → renommer le spec → "Créer brouillon" → redirect vers `/admin/work/specs/<slug>/edit` ✓
- [ ] **DRAFTS DRAWER** : Bouton "Brouillons" en header roadmap → badge count s'affiche → drawer s'ouvre → spec visible → click redirect vers `/edit` ✓
- [ ] **ADD FEATURE** : Sidebar "+ Feature" → dropdown 11 types → sélectionner "bloc" → feature ajoutée + sélectionnée ✓
- [ ] **AUTOSAVE** : Remplir un champ text → après ~1.5s, indicator "Enregistré ✓" ✓
- [ ] **RELOAD** : F5 sur la page → données persistées ✓
- [ ] **DnD SIDEBAR** : Ajouter 2 features → drag-reorder dans sidebar → autosave OK ✓
- [ ] **APERÇU** : Click "Aperçu" → modal iframe s'ouvre avec HTML rendu (sections + champs) → Echap ferme ✓
- [ ] **PUBLIER** : Click "Publier" → badge passe "Publié" + bouton devient "Dépublier" ✓
- [ ] **EDIT EXISTING** : Sur `/admin/work/specs/<slug>` (viewer P1) d'un spec structured → bouton "✏ Éditer" visible → redirect vers `/edit` avec données chargées ✓
- [ ] **LEGACY** : Sur `/admin/work/specs/<slug-legacy>` (un des 54 imports) → bouton "✏ Éditer" caché ✓
- [ ] **NAVIGATION GUARD** : Modifier un champ sans attendre l'autosave → click "← Retour" → prompt browser apparait ✓
- [ ] **DELETE** : Click 🗑 → ConfirmDialog → confirmer → redirect roadmap, spec disparu ✓

Si une étape échoue : retourner aux tasks correspondantes pour fix.

- [ ] **Step 2: Bump submodule pointer**

```bash
git -C "D:/Mods Minecraft/EriniumFaction" add EriniumFactionWeb
git -C "D:/Mods Minecraft/EriniumFaction" commit -m "EriniumFactionWeb: bump submodule (Phase 2b Erisclave Builder structured)"
git -C "D:/Mods Minecraft/EriniumFaction" push
```

Expected: push OK vers les 2 remotes (Erinium-Group + JLSkyzer).

- [ ] **Step 3: Vérifier déploiement Vercel**

Attendre 1-2 min, vérifier sur https://eriniumfaction.vercel.app/admin/work/roadmap que les nouveaux boutons (📋 + Brouillons) sont visibles.

---

## Récapitulatif

**26 tasks, ~10 commits par phase :**
- Phase A (Foundation) : Tasks 1-6 (6 commits)
- Phase B (API) : Tasks 7-12 (6 commits)
- Phase C (Editor UI core) : Tasks 13-20 (8 commits)
- Phase D (Aperçu + finition) : Tasks 21-24 (4 commits + 2 docs)
- Phase E (QA + déploiement) : Tasks 25-26 (1 submodule bump)

**Critères d'acceptation MVP** (cf. spec §9) : tous validés par la checklist Task 26.

**Si une task BLOCKED :**
- Migration SQL fail prod → restore snapshot Neon
- Build fail TS → vérifier resolveJsonModule dans tsconfig
- requireStaff signature mismatch → adapter dans toutes les routes
- DnD sidebar conflit → vérifier que `DndContext` est local au sidebar (pas wrappé par celui de la page roadmap)
