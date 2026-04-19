# Mods de Performance 1.12.2 — Compatibilite avec EriniumFaction

> Analyse de compatibilite entre les mods d'optimisation serveur Forge 1.12.2 et le systeme de performance integre d'EriniumFaction (MobCapEnforcer, InactiveEntityCuller, AutoViewDistance, PerformanceTickHandler, PerformanceMonitor).
>
> Date : 22 Mars 2026

---

## Stack Recommande

```
Mods a installer avec EriniumFaction :
├── FoamFix              (memoire)
├── Phosphor/Hesperus    (eclairage) — un seul des 3
├── FastFurnace          (recettes four)
├── FastWorkbench        (recettes crafting)
├── CensoredASM          (memoire avance)
├── Clumps               (XP orbs groupes)
├── Surge                (temps de chargement)
├── Chunk-Pregenerator   (pre-gen du monde)
├── Get It Together      (items au sol groupes)
├── AI Improvements      (pathfinding IA — desactiver son culling)
├── Let Me Despawn        (despawn mobs ameliore)
├── BetterFPS            (maths optimisees)
├── VintageFix           (optimisations modernes)
└── NoiseThreader        (worldgen multithread — ~50% plus rapide)

Mods a NE PAS installer :
├── Tick Dynamic         (conflit avec MobCapEnforcer)
├── Tiquality            (conflit avec PerformanceTickHandler)
├── Performant           (overlap trop important, double-culling)
├── Vintagium            (instable, conflits Mixin)
├── EntityThreading      (conflits acces concurrent avec nos systemes)
└── Dimensional Threading (pas dispo en 1.12.2 Forge)
```

---

## Compatibles — Aucun conflit (dont WorldGen threading)

| Mod | Type | Fonction | Pourquoi compatible |
|-----|------|----------|---------------------|
| FoamFix | Both | Optimise RAM, reduit allocations memoire | Agit sur la memoire, pas sur les ticks/entites |
| Phosphor | Both | Optimise le moteur d'eclairage | Notre systeme ne touche pas a la lumiere |
| Hesperus | Both | Continuation de Phosphor avec bugfixes | Meme chose que Phosphor, prendre l'un ou l'autre |
| Alfheim Lighting Engine | Server | Fork de Hesperus | Meme chose, prendre un seul des 3 |
| FastFurnace | Server | Cache les recettes de four | Aucun overlap |
| FastWorkbench | Server | Optimise le crafting (shift-click fix) | Aucun overlap |
| CensoredASM (LoliASM) | Both | Optimise RAM (deduplication strings) | Agit au niveau JVM/memoire |
| Clumps | Both | Regroupe les orbs d'XP en une entite | Complementaire avec notre EntityCuller |
| Surge | Both | Optimise le temps de chargement | Agit au demarrage, pas en runtime |
| VintageFix | Both | Optimisations modernes pour 1.12.2 | Memoire + modeles + textures, pas de conflit serveur |
| Chunk-Pregenerator | Both | Pre-genere les chunks | Reduit le cout de notre WorldGen custom. **Recommande** |
| PortalSuperCache | Server | Accelere la recherche de portails | Aucun overlap |
| Get It Together, Drops! | Server | Combine les items au sol | Reduit les entites items, complementaire |
| Nothirium | Client | Rendu chunks OpenGL moderne | Client-only, aucun impact serveur |
| Entity Culling | Client | Ne rend pas les entites hors vue | Client-only |
| TexFix | Client | Optimise le chargement de textures | Client-only |
| Particle Culling | Client | Arrete le rendu des particules hors vue | Client-only |
| BetterFPS | Both | Optimisations mathematiques (sin/cos) | Aucun overlap serveur |
| Better Biome Blend | Client | Accelere le blending couleurs biomes | Client-only, compatible avec nos biomes custom |
| Raw Mouse Input | Client | Fix input souris | Client-only |
| Stackie | Server | Augmente les stacks d'items/XP au sol | Similaire a Clumps, prendre l'un ou l'autre |
| Let Me Despawn | Server | Ameliore le despawn des mobs | Complementaire avec InactiveEntityCuller |
| NoiseThreader | Server | Multithreade la generation de bruit (noise) du worldgen | Agit en aval de notre EriniumBiomeProvider. ~50-60% plus rapide sur le worldgen. **Recommande** pour compenser le cout de nos 53 biomes custom |

---

## Attention — Overlap partiel, configurer avec soin

| Mod | Risque | Notre equivalent | Solution |
|-----|--------|-----------------|----------|
| AI Improvements | MOYEN | MobCapEnforcer + InactiveEntityCuller | Optimise le pathfinding IA (complementaire). **Desactiver son entity culling integre** et garder le notre |
| Performant | MOYEN | MobCapEnforcer + AutoViewDistance | A son propre entity culling et collision optimization. **Risque de double-culling.** Desactiver les features qui chevauchent les notres |
| Tick Dynamic | HAUT | MobCapEnforcer + InactiveEntityCuller | Limite dynamiquement les ticks d'entites/TileEntities. **Conflit direct.** Utiliser l'un OU l'autre |
| Tiquality | HAUT | PerformanceTickHandler | Distribue le temps de tick par joueur. **Conflit potentiel** avec notre PerformanceTickHandler |
| VanillaFix | FAIBLE | Aucun equivalent direct | Corrige des bugs vanilla + optimise. Generalement safe, verifier les interactions |
| Universal Tweaks | FAIBLE | Partiel | Compilation de fixes. Configurable — desactiver les modules qui chevauchent nos systemes |

---

## Incompatibles — Ne pas utiliser

| Mod | Raison |
|-----|--------|
| Dimensional Threading | **Pas de version 1.12.2 Forge disponible.** Existe pour Fabric et Forge 1.16.5+ uniquement |
| Vintagium (Sodium 1.12.2) | Fork non-officiel de Sodium. **Instable**, bugs reportes, potentiellement incompatible avec nos Mixins sur le rendu (MixinLayerCape, MixinTileEntityBannerRenderer) |
| EntityThreading (Threading Entity Mod) | Coremod experimental qui parallelise le tick des entites sur 12 threads. **Conflits multiples** : acces concurrent a chunk.getEntityLists() (MobCapEnforcer), iteration world.loadedEntityList (InactiveEntityCuller), LivingAttackEvent depuis worker threads (CheckCombat), manipulation inventaire non-thread-safe (DeathHandler). Peu de retours communautaires, repo peu actif |

---

## Liens utiles

- [Performance Mods 1.12.x - UsefulMods](https://github.com/TheUsefulLists/UsefulMods/blob/main/Performance/Performance112.md)
- [FoamFix - CurseForge](https://www.curseforge.com/minecraft/mc-mods/foamfix-optimization-mod)
- [Phosphor - CurseForge](https://www.curseforge.com/minecraft/mc-mods/phosphor-forge)
- [Hesperus - CurseForge](https://www.curseforge.com/minecraft/mc-mods/hesperus)
- [FastFurnace - CurseForge](https://www.curseforge.com/minecraft/mc-mods/fastfurnace)
- [FastWorkbench - CurseForge](https://www.curseforge.com/minecraft/mc-mods/fastworkbench)
- [CensoredASM - CurseForge](https://www.curseforge.com/minecraft/mc-mods/lolasm)
- [Clumps - Modrinth](https://modrinth.com/mod/clumps)
- [Surge - Modrinth](https://modrinth.com/mod/surge)
- [VintageFix - Modrinth](https://modrinth.com/mod/vintagefix)
- [Chunk-Pregenerator - CurseForge](https://www.curseforge.com/minecraft/mc-mods/chunkpregenerator)
- [AI Improvements - CurseForge](https://www.curseforge.com/minecraft/mc-mods/ai-improvements)
- [Performant - CurseForge](https://www.curseforge.com/minecraft/mc-mods/performant)
- [Tick Dynamic - CurseForge](https://www.curseforge.com/minecraft/mc-mods/tick-dynamic)
- [Tiquality - CurseForge](https://www.curseforge.com/minecraft/mc-mods/tiquality)
- [Get It Together, Drops! - CurseForge](https://www.curseforge.com/minecraft/mc-mods/get-it-together-drops)
- [Let Me Despawn - Modrinth](https://modrinth.com/plugin/lmd)
- [BetterFPS - CurseForge](https://www.curseforge.com/minecraft/mc-mods/betterfps)
- [Dimensional Threading Reforked - CurseForge](https://www.curseforge.com/minecraft/mc-mods/dimthreads)
- [Akliz Performance Mods List](https://help.akliz.net/docs/performance-mods)
