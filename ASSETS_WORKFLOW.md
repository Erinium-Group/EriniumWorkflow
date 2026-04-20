# WORKFLOW DES ASSETS — EriniumFaction

> Lire ce fichier AVANT toute création d'asset. Il définit les règles, les outils et les dimensions pour chaque type d'asset.

---

## Règle générale

Tous les assets non finaux vont dans `assets_wip/`. **JAMAIS** directement dans `src/main/resources/` sans validation.

---

## 1. Textures Blocs & Items

### Ordre de priorité obligatoire

#### Étape 1 — texture-gen CLI (toujours essayer en premier)

```bash
cd "D:/Mods Minecraft/EriniumFaction/texture-gen"
node cli.js generate <category> <name> #COLOR1 [#COLOR2...]
```

Lister les catégories disponibles : `node cli.js list`

Les catégories ont des comportements spéciaux — certaines génèrent plusieurs fichiers ou des tailles non carrées :

| Catégorie | Taille | Fichiers produits |
|-----------|--------|-------------------|
| `ore` | 32×32 | `<name>_1…5.png` + `_overlay` (base pierre + veine colorée) |
| `grass` | 32×32 | `<name>_top.png` · `<name>_side.png` · `<name>_dirt.png` |
| `log` | 32×32 | `<name>_side.png` (root) · `<name>_top.png` (sous-dossier `top/`) |
| `anvil` | 32×32 | `<name>_body.png` · `<name>_top.png` |
| `armorlayer` | **128×64** | `<name>_layer_1.png` · `<name>_layer_2.png` |
| `shelf` | **128×64** | `<name>_1…5.png` |
| `razor_wire` | **128×128** | `<name>_1…5.png` |
| `apple` | 32×32 | `<name>_fruit.png` · `<name>_wood.png` |
| `arrow` | 32×32 | `<name>_head.png` · `<name>_stick.png` · `<name>_tail.png` |
| `bow` | 32×32 | `<name>_standby.png` · `<name>_pulling_0/1/2.png` |
| Tous les autres | 32×32 | `<name>_1…5.png` |

Upscale pixel-perfect 32→64 :
```bash
magick convert in.png -filter Point -resize 200% out.png
```

#### Étape 2 — Preset Mcreator BW (si aucune catégorie ne correspond)

Explorer `C:\Users\killi\Pictures\Mcreator-Resources\texture\` pour trouver une source en niveaux de gris (ou à désaturer) :

| Dossier | Contenu utile |
|---------|---------------|
| `Dokucraft/block/` | ~1100 textures + `.mcmeta` animées — **source principale fluides animés** (`water_still.png` 32×1632 51 frames, `water_flow.png` 64×2304 36 frames, `lava_still.png`…) |
| `Dokucraft/item/`, `entity/`, `particle/`… | Items, entités, particules, GUI Dokucraft |
| `Foreck textures/blocks/` | ~40 blocs custom (champignons, glace, fours, briques lunaires…) |
| `from mcreator/blocks/` | Pack Foreck étendu (convoyeurs, cuivres, plantes) + `x16items/x32items/x64items/` |
| `Kompy/` | Templates vanilla étendus — **nombreux `_mono.png` grayscale prêts** |
| `Expanded Texture templates/` | Contenu identique à Kompy |
| `geometrical pack/blocks/`, `items/`, `fluids/` | Pack géométrique minimaliste |
| `unused-textures/blocks/` | Blocs exclus du jeu (alabaster, battery, gem blocks…) |
| `Assorted Textures/` | Textures disparates (items, buckets, patterns) |
| `preset/` | Templates items classés (armures, épées, outils, fragments, ingots) |

Une fois la source trouvée, l'ajouter comme nouveau preset :
```bash
magick convert "<source>" -colorspace Gray -resize 64x64 \
  "texture-gen/assets/<new_category>/<name>.png"
node cli.js generate <new_category> <name> #COLOR
```

**Fluides animés** (coloriser sans casser les frames) :
```bash
magick convert "...Dokucraft/block/water_still.png" -colorspace Gray \
  -fill "#00CCDD" -tint 80 "assets_wip/.../plasma_liquid_still.png"
cp "...water_still.png.mcmeta" "assets_wip/.../plasma_liquid_still.png.mcmeta"
```

#### Étape 3 — SVG fallback + création de preset

Seulement si les étapes 1 et 2 sont impossibles.

1. Créer le SVG 64×64 dans `assets_wip/` (silhouette/forme du bloc)
2. Convertir en PNG coloré : `magick convert -background none in.svg -resize 64x64 out_color.png`
3. Convertir en niveaux de gris et enregistrer comme preset : `magick convert out_color.png -colorspace Gray "texture-gen/assets/<new_category>/<name>.png"`
4. Générer les variantes : `node cli.js generate <new_category> <name> #COLOR`

**RÈGLE** : Un SVG créé en fallback DOIT toujours devenir un preset réutilisable. Ne pas créer de SVG "jetables".

**RÈGLE** : Ne JAMAIS réutiliser un preset existant qui ne correspond pas visuellement à ce qu'on veut créer. Créer un SVG propre → nouveau preset dédié.

---

### Blocs avec modèle 3D custom

Les blocs qui ont un modèle 3D (JSON/Blockbench) — ex : `rocket_maker`, `rnd_table`, `plasma_extractor`, `faction_beacon` — ont leurs textures PNG conçues **dans Blockbench** avec le modèle, car elles doivent correspondre au mapping UV.

Ne PAS générer leurs textures via texture-gen si le modèle 3D n'existe pas encore.  
Exception : les faces répétitives simples (même texture sur tous les côtés) peuvent être préparées à l'avance.

---

## 2. GUI — SVG + ImageMagick

Les éléments GUI sont créés en SVG puis convertis en PNG.

```bash
magick -density 400 -background none "input.svg" -resize WxH -quality 100 "output.png"
```

**Workflow GUI complet :**
1. Créer un SVG **complet** avec tous les éléments assemblés (preview du GUI final)
2. Créer un SVG par asset individuel (bouton, fond, icône, barre, etc.)
3. Attendre validation avant de convertir
4. Convertir TOUS les SVG en PNG avec ImageMagick
5. Placer les PNG individuels dans `textures/gui/`

---

## 3. Dimensions requises

| Type | Dimensions |
|------|-----------|
| Items | 64×64 px |
| Blocs | 64×64 px (top/side/bottom selon les faces) |
| Armures | 128×64 px (layer_1 + layer_2) |
| GUI | Libre, max 1920×1080 (espace design EriAPI) |

---

## 4. Palette de couleurs du mod

**Matériaux :**
- Valterite (cyan) : `#4AE0E0`
- Aetherite (violet) : `#9B59B6`
- Erinium (or) : `#FFD700`

**Faction — couleurs principales :**
- Gold (tag/préfixe) : `#FFD700`
- Dark Purple : `#1A1A2E`
- Violet : `#6B2FA0`
- Cyan accent : `#00E5FF`

**Territoire :**
- Safezone Green : `#2ECC71`
- Warzone Red : `#E74C3C`
- Neutral Gray : `#95A5A6`
- Ally Blue : `#3498DB`

**UI / HUD :**
- Background dark : `#0A0A0F`
- Glass panel : `rgba(14, 14, 22, 0.55)`
- Border subtle : `rgba(255, 255, 255, 0.06)`
- Text white : `#F0F2FF`
- Text muted : `#8892A4`

---

## 5. Structure des fichiers

```
assets_wip/                    ← Tous les assets non finaux (WIP)
└── <feature>/
    ├── blocks/
    └── items/

texture-gen/
├── assets/<category>/         ← Presets grayscale (PNG source des générateurs)
└── output/<name>/             ← Résultats générés (5 variations)

src/main/resources/assets/eriniumfaction/textures/
├── blocks/                    ← Assets finaux validés
├── items/
├── models/armor/
└── gui/
```

---

## 6. Checklist création

### Blocs / Items
- [ ] Identifier si le bloc a un modèle 3D (Blockbench/JSON) — si oui, voir section 1.3
- [ ] Essayer texture-gen CLI en premier (`node cli.js list` pour voir les catégories)
- [ ] Si pas de catégorie : chercher dans `Mcreator-Resources/texture/`
- [ ] Si rien trouvé : créer SVG → grayscale → ajouter comme preset → générer
- [ ] Attendre validation de l'utilisateur avant de copier dans `src/main/resources/`
- [ ] Vérifier les dimensions (64×64 blocs/items, 128×64 armures)
- [ ] Créer le model JSON si nécessaire

### GUI
- [ ] Créer SVG complet (preview assemblé, max 1920×1080)
- [ ] Créer SVG de chaque asset individuel
- [ ] Attendre validation
- [ ] Convertir TOUS les SVG en PNG
- [ ] Placer dans `textures/gui/`
- [ ] Intégrer dans le code EriAPI

---

*Dernière mise à jour : 2026-04-20*
