# WORKFLOW DES ASSETS — EriniumFaction

## REGLE POUR TOUS LES ASSETS (TEXTURES, ICONS, GUI, etc.)

### Items, Blocks & Armures — Generateur CLI

Les textures d'items, blocks et armures sont generees via l'outil en ligne de commande :
**`D:\Mods Minecraft\EriniumFaction\texture-gen`**

Les textures GUI et quelconque icone sont en SVG

**Processus obligatoire :**

1. **Lister les categories disponibles** — `node cli.js list`
2. **Generer les variations** — Specifier la categorie et jusqu'a 4 couleurs
3. **Validation** — L'utilisateur choisit parmi les 5 variations generees
4. **Import** — Copier la texture choisie dans `src/main/resources/assets/eriniumfaction/textures/`

**Commandes d'exemple :**
```bash
cd "D:/Mods Minecraft/EriniumFaction/texture-gen"

# Lister toutes les categories disponibles
node cli.js list

# Generer un minerai avec 2 couleurs (base pierre + veine coloree)
node cli.js gen ore_1 "#7B8794" "#5B9BD5"

# Generer une epee avec 3 couleurs (lame + garde + poignee)
node cli.js gen sword "#C0C0C0" "#6B2FA0" "#3A1F5E"

# Generer une pioche avec 2 couleurs
node cli.js gen pickaxe "#00E5FF" "#005F6B"

# Generer une armure avec 4 couleurs
node cli.js gen armor "#6B2FA0" "#9B59D0" "#00E5FF" "#1A1A2E"

# Generer un bloc de stockage
node cli.js gen block_1 "#F59E0B" "#D97706"
```

**Sortie :** Un dossier `output/<categorie>_<timestamp>/` contenant 5 variations PNG.
Pour les categories a texture superposee (outils, minerais), le dossier contient aussi les layers separees (base + overlay).

### GUI — SVG + ImageMagick

Les elements GUI restent en SVG → PNG via **ImageMagick** :

```bash
# GUI elements: taille libre (max 1920x1080, pas de multiples imposes)
magick -density 400 -background none "input.svg" -resize WxH -quality 100 "output.png"
```

---

## Structure des fichiers

### Assets generes (texture-gen)
```
texture-gen/output/
├── sword_2026-03-08_01/
│   ├── sword_v1.png
│   ├── sword_v2.png
│   └── ...
└── ore_1_2026-03-08_02/
    ├── ore_1_v1.png
    ├── ore_1_base.png
    └── ore_1_v1_overlay.png
```

### Assets en cours de creation (SVG — GUI uniquement)
```
assets_wip/
└── gui/
    ├── faction_menu_bg.svg
    └── icons/
        └── power_icon.svg
```

### Assets finaux (PNG)
```
src/main/resources/assets/eriniumfaction/
├── textures/
│   ├── items/
│   │   └── faction_badge.png (32x32)
│   ├── blocks/
│   │   └── faction_core.png (32x32)
│   ├── models/armor/
│   │   ├── valterite_layer_1.png (128x64)
│   │   └── valterite_layer_2.png (128x64)
│   └── gui/
│       ├── faction_menu_bg.png (taille libre, max 1920x1080)
│       └── icons/
│           └── power_icon.png
└── models/
    └── item/
        └── faction_badge.json
```

---

## Standards de design

### Palette de couleurs du mod

**Faction — Couleurs principales:**
- Gold (tag/prefixe): `#FFD700`
- Dark Purple: `#1A1A2E`
- Violet: `#6B2FA0`
- Cyan accent: `#00E5FF`

**Territoire:**
- Safezone Green: `#2ECC71`
- Warzone Red: `#E74C3C`
- Neutral Gray: `#95A5A6`
- Ally Blue: `#3498DB`
- Enemy Red: `#C0392B`

**UI / HUD:**
- Background dark: `#0A0A0F`
- Glass panel: `rgba(14, 14, 22, 0.55)`
- Border subtle: `rgba(255, 255, 255, 0.06)`
- Text white: `#F0F2FF`
- Text muted: `#8892A4`

**Block Health:**
- HP full green: `#00FF00`
- HP mid yellow: `#FFFF00`
- HP low red: `#FF0000`

### Dimensions requises
- **Items:** 32x32 pixels
- **Blocks:** 32x32 pixels (top/side/bottom si necessaire)
- **Armures:** 128x64 pixels (layer_1 et layer_2)
- **GUI:** Taille libre, max 1920x1080 (espace design EriAPI). Aucune contrainte de multiples.
- **Icons GUI:** Taille libre selon le besoin

### Workflow GUI — rendu obligatoire

Quand on design un GUI complet:
1. **Creation SVG** — Creer TOUS les SVG en meme temps:
   - Un SVG **complet** avec tous les elements assembles (preview du GUI final)
   - Un SVG **par asset individuel** (bouton, fond, icone, barre, etc.)
2. **Validation** — L'utilisateur valide le rendu global + les assets individuels
3. **Conversion PNG** — Une fois valide, convertir TOUS les SVG en PNG avec ImageMagick
4. **Integration** — Utiliser les assets PNG individuels dans le code EriAPI (`TextureRenderer`, etc.)

---

## Checklist de creation

### Items / Blocks / Armures
- [ ] Lister les categories : `node cli.js list`
- [ ] Generer les variations : `node cli.js gen <categorie> <couleurs...>` (jusqu'a 4 couleurs)
- [ ] **ATTENDRE** que l'utilisateur choisisse quelle texture parmi les variations generees — ne JAMAIS importer sans son choix explicite
- [ ] Copier le PNG choisi dans `src/main/resources/assets/eriniumfaction/textures/`
- [ ] Verifier les dimensions (items/blocks: 32x32, armures: 128x64)
- [ ] Creer model JSON si item/block
- [ ] Tester en jeu

### GUI
- [ ] Creer SVG complet (tous les elements assembles, max 1920x1080)
- [ ] Creer SVG de chaque asset individuel (bouton, fond, icone, barre, etc.)
- [ ] Demander validation (rendu global + assets individuels)
- [ ] Appliquer corrections si demandees
- [ ] Convertir TOUS les SVG en PNG avec ImageMagick
- [ ] Placer les PNG individuels dans `textures/gui/`
- [ ] Integrer dans le code EriAPI
- [ ] Tester en jeu

---

## Assets crees

*(Aucun asset cree pour le moment)*

---

## Configuration technique

### Item Models
Les modeles d'items sont enregistres via EriAPI `EriItem.create()` / `EriBlock.create()` qui gerent automatiquement les `ModelRegistryEvent`.

Pour les assets manuels, creer le JSON model dans `models/item/`:
```json
{
  "parent": "item/generated",
  "textures": {
    "layer0": "eriniumfaction:items/nom_item"
  }
}
```

---

**Derniere mise a jour:** 6 mars 2026
**Assets valides:** 0
**Assets en attente:** 0
