# Block Animation Framework -- Phase 3 : Builder API, Events, Commands & Optimisations

> **For agentic workers:** REQUIRED SUB-SKILL -- Read `CLAUDE.md` and `docs/knowissue.md` before touching any file. Build EriAPI with `cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build` after every task. For task 1, also build EriniumFaction with `cd "D:/Mods Minecraft/EriniumFaction" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build` to verify backward compatibility. Java 8 only -- no `var`, no Java 9+ features. No streams in hot paths. All new files go in `fr.eri.eriapi.anim` unless stated otherwise. The existing Phase 1+2 code MUST NOT be broken. Existing `TileLootbox extends AnimatedBlockTileEntity` in EriniumFaction MUST continue to compile and work without changes.

**Goal:** Complete the block animation framework with a high-level builder API (`EriAnimBlock.create()`), Forge events for animation lifecycle, debug commands (`/erianim`), IDLE render caching, and performance instrumentation.

**Architecture:** 7 new files in EriAPI, 3 modified files. The builder (`EriAnimBlock`) extends the existing `EriBlock` pattern and introduces `AnimatedBlockTileEntityGeneric` (a parameterized subclass of `AnimatedBlockTileEntity` that does not require manual subclassing). 4 Forge events are posted on `MinecraftForge.EVENT_BUS`. The `/erianim` command uses EriAPI's `EriCommand` framework. The TESR gets IDLE render caching via a dirty flag. `AnimPerf` tracks render timing for the `/erianim perf` command.

**Tech Stack:** Java 8, Forge 1.12.2, EriAPI command framework (`EriCommand`/`CommandNode`/`CommandRegistry`), `MinecraftForge.EVENT_BUS` for events, `System.nanoTime()` for perf tracking.

**Existing Phase 1+2 files (in `fr.eri.eriapi.anim`):**
- Data: `FaceData`, `ModelElement`, `ModelGroup`, `AnimatedBlockModel`, `DisplayTransform`
- Parsers: `BlockbenchModelParser`, `AnimModelCache`, `EriAnimParser`, `EriAnimCache`
- Animation data: `EndBehavior`, `AnimState`, `Keyframe`, `SpinKeyframe`, `TextureKeyframe`, `AnimationEvent`, `GroupTrack`, `AnimationDef`, `AnimationFile`
- Runtime: `AnimationPose`, `AnimationController`
- Network: `AnimPlayPacket`, `AnimResetPacket`, `AnimPausePacket`, `AnimNetworkHandler`
- TileEntity: `AnimatedBlockTileEntity` (685 lines, state machine, ITickable, events, endBehaviors, blend, texture overrides)
- Render: `AnimatedBlockTESR`, `AnimatedBlockItemRenderer`

**Existing content framework (in `fr.eri.eriapi.content`):**
- `EriBlock` -- builder with `material()`, `hardness()`, `resistance()`, `tileEntity()`, `tesrOnly()`, `onRightClick()`, `register()`
- `BlockDefinition` -- data bag (fields: `tileEntityClass`, `useTesrOnly`, `tesrModelId`, callbacks)
- `GeneratedBlock` -- extends `Block`, reads `BlockDefinition`, delegates `getRenderType()`, `hasTileEntity()`, `createTileEntity()`, callbacks
- `ContentRegistry` -- singleton, `@EventBusSubscriber`, handles `RegistryEvent.Register<Block>`, `Register<Item>`, `ModelRegistryEvent`. TESR binding is currently done manually in EriniumFaction's `ClientProxy`.

**Existing command framework (in `fr.eri.eriapi.command`):**
- `EriCommand.create("name")` -- root builder, `.sub("subname")` for sub-commands, `.arg(Argument)` for args, `.runs(ctx -> ...)` for executor, `.permission(level)`, `.register()` for auto-registration via `CommandRegistry`
- `CommandContext` -- `.getString()`, `.getInt()`, `.getBlockPos()`, `.success()`, `.error()`, `.info()`, `.reply()`
- `PosArg.of("pos")` -- 3-token position with `~` relative support
- `StringArg.of("name")` with `.suggests()` / `.suggestsDynamic()`
- `EnumArg.of("name", Enum.class)` -- auto-completion of enum values
- `IntArg.of("name")` with `.optional()` / `.range()`

---

## Task 1: EriAnimBlock Builder API + AnimatedBlockTileEntityGeneric

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\EriAnimBlock.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTileEntityGeneric.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimBlockDefinition.java`

**Files to modify:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\content\ContentRegistry.java` -- add TESR auto-registration for animated blocks in `onRegisterModels`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\content\GeneratedBlock.java` -- support `AnimBlockDefinition` in `createTileEntity()` to pass modelId/animFileId/renderDistance/defaultAnimation

**Dependencies:** Phase 1+2 complete, `EriBlock`/`BlockDefinition`/`ContentRegistry`/`GeneratedBlock` unchanged API.

**Backward compatibility:** `TileLootbox extends AnimatedBlockTileEntity` in EriniumFaction continues to work because `AnimatedBlockTileEntity` is NOT modified. The generic TE is a separate subclass. Manual TESR binding in ClientProxy still works for custom TEs. The new auto-binding only applies to blocks that use `AnimBlockDefinition`.

- [ ] Step 1: Create `AnimBlockDefinition.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.content.BlockDefinition;

/**
 * Extended block definition for animated blocks created via EriAnimBlock.
 * Carries animation-specific fields alongside the standard BlockDefinition fields.
 *
 * Package-private -- only used by EriAnimBlock and ContentRegistry internals.
 */
public class AnimBlockDefinition extends BlockDefinition {

    String modelId = "";
    String animFileId = "";
    double renderDistance = 64.0;
    String defaultAnimation = "";

    /**
     * Returns true if this definition has enough data for an animated block.
     */
    boolean isValid() {
        return modelId != null && !modelId.isEmpty();
    }
}
```

- [ ] Step 2: Create `AnimatedBlockTileEntityGeneric.java`

```java
package fr.eri.eriapi.anim;

/**
 * Generic animated block TileEntity that takes modelId, animFileId, renderDistance,
 * and defaultAnimation as construction parameters.
 *
 * <p>This eliminates the need to create a custom subclass for every animated block.
 * The ContentRegistry creates instances via the no-arg constructor (required by Forge),
 * then GeneratedBlock configures the fields in createTileEntity().
 *
 * <p>For blocks that need custom animation callbacks (onAnimationEvent, onAnimationComplete,
 * onAnimationCallback), subclass AnimatedBlockTileEntity directly instead.
 *
 * <p>Usage via EriAnimBlock:
 * <pre>
 *   EriAnimBlock.create("modid", "lootbox")
 *       .model("modid:block/lootbox")
 *       .animation("modid:animations/lootbox")
 *       .defaultAnimation("idle_breathe")
 *       .register();
 * </pre>
 */
public class AnimatedBlockTileEntityGeneric extends AnimatedBlockTileEntity {

    /** No-arg constructor required by Forge for TE registration. */
    public AnimatedBlockTileEntityGeneric() {
        super();
    }

    /**
     * Configures this TE after construction (called by GeneratedBlock.createTileEntity).
     * This is separate from the constructor because Forge requires no-arg constructors
     * for TileEntity registration and the parameters are only known from the BlockDefinition.
     */
    public void configure(String modelId, String animFileId, double renderDistance, String defaultAnimation) {
        setModelId(modelId);
        if (animFileId != null && !animFileId.isEmpty()) {
            setAnimFileId(animFileId);
        }
        setMaxRenderDistance(renderDistance);
        // defaultAnimation is handled in onLoad() -- store it for later
        this.pendingDefaultAnimation = defaultAnimation;
    }

    private String pendingDefaultAnimation = "";

    @Override
    public void onLoad() {
        super.onLoad();
        // Auto-play the default animation on first load (server-side only)
        if (!pendingDefaultAnimation.isEmpty() && world != null && !world.isRemote) {
            if (getAnimState() == AnimState.IDLE && getCurrentAnimName().isEmpty()) {
                playAnimation(pendingDefaultAnimation, EndBehavior.LOOP);
            }
        }
    }
}
```

- [ ] Step 3: Create `EriAnimBlock.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.content.BlockActionContext;
import fr.eri.eriapi.content.ContentRegistry;
import net.minecraft.block.SoundType;
import net.minecraft.block.material.Material;
import net.minecraft.creativetab.CreativeTabs;
import net.minecraft.item.Item;

import java.util.function.Consumer;

/**
 * Builder for animated blocks with Blockbench 3D models.
 *
 * <p>Wraps EriBlock and auto-configures TileEntity, TESR, and blockstate for animated rendering.
 * The moddeur only needs to specify the model and animation file -- everything else is automatic.
 *
 * <p>Usage:
 * <pre>
 *   EriAnimBlock.create("modid", "lootbox")
 *       .material(Material.IRON)
 *       .hardness(5.0f)
 *       .model("modid:block/lootbox")
 *       .animation("modid:animations/lootbox")
 *       .renderDistance(64)
 *       .defaultAnimation("idle_breathe")
 *       .onRightClick(ctx -> { ... })
 *       .register();
 * </pre>
 *
 * <p>This auto-configures:
 * <ul>
 *   <li>TileEntity: AnimatedBlockTileEntityGeneric (or custom class via tileEntity())</li>
 *   <li>TESR: AnimatedBlockTESR (auto-bound in ContentRegistry)</li>
 *   <li>Block render type: ENTITYBLOCK_ANIMATED (tesrOnly)</li>
 *   <li>Item renderer: AnimatedBlockItemRenderer with display transforms</li>
 *   <li>Opaque/fullCube set to false (3D models are non-standard shapes)</li>
 * </ul>
 *
 * <p>For blocks that need custom animation callbacks, use tileEntity(MyCustomTE.class)
 * where MyCustomTE extends AnimatedBlockTileEntity. The TESR will still be auto-bound.
 */
public class EriAnimBlock {

    private final AnimBlockDefinition def;

    private EriAnimBlock(String modId, String registryName) {
        this.def = new AnimBlockDefinition();
        this.def.modId = modId;
        this.def.registryName = registryName;
        // Defaults for animated blocks
        this.def.isOpaque = false;
        this.def.isFullCube = false;
    }

    /** Creates a new animated block builder. */
    public static EriAnimBlock create(String modId, String registryName) {
        return new EriAnimBlock(modId, registryName);
    }

    // -- Standard block properties (delegated to BlockDefinition) --

    public EriAnimBlock material(Material mat) {
        def.material = mat;
        return this;
    }

    public EriAnimBlock hardness(float hardness) {
        def.hardness = hardness;
        return this;
    }

    public EriAnimBlock resistance(float resistance) {
        def.resistance = resistance;
        return this;
    }

    public EriAnimBlock harvestTool(String tool, int level) {
        def.harvestTool = tool;
        def.harvestLevel = level;
        return this;
    }

    public EriAnimBlock soundType(SoundType sound) {
        def.soundType = sound;
        return this;
    }

    public EriAnimBlock lightLevel(float light) {
        def.lightLevel = light;
        return this;
    }

    public EriAnimBlock creativeTab(CreativeTabs tab) {
        def.creativeTab = tab;
        return this;
    }

    public EriAnimBlock drops(Item item, int min, int max) {
        def.dropItem = item;
        def.dropMin = min;
        def.dropMax = max;
        return this;
    }

    public EriAnimBlock silkTouchable(boolean silk) {
        def.silkTouchable = silk;
        return this;
    }

    // -- Animation-specific properties --

    /**
     * Sets the Blockbench model resource ID.
     * Format: "modid:path/to/model" (without .json extension).
     * The model JSON must be at assets/modid/models/path/to/model.json.
     *
     * @param modelId e.g. "eriniumfaction:block/lootbox"
     */
    public EriAnimBlock model(String modelId) {
        def.modelId = modelId;
        // Also configure tesrOnly with this model
        def.useTesrOnly = true;
        def.tesrModelId = modelId;
        return this;
    }

    /**
     * Sets the .erianim animation file resource ID.
     * Format: "modid:path/to/animations" (without .erianim extension).
     * The file must be at assets/modid/animations/path/to/animations.erianim.
     *
     * @param animFileId e.g. "eriniumfaction:animations/lootbox"
     */
    public EriAnimBlock animation(String animFileId) {
        def.animFileId = animFileId;
        return this;
    }

    /**
     * Sets the maximum render distance in blocks. Default: 64.
     */
    public EriAnimBlock renderDistance(double distance) {
        def.renderDistance = distance;
        return this;
    }

    /**
     * Sets the default animation to auto-play on block load (with LOOP endBehavior).
     * Leave unset for no auto-play animation.
     *
     * @param animName the animation name from the .erianim file
     */
    public EriAnimBlock defaultAnimation(String animName) {
        def.defaultAnimation = animName;
        return this;
    }

    /**
     * Overrides the TileEntity class. Use this when you need custom animation callbacks
     * (onAnimationEvent, onAnimationComplete, onAnimationCallback).
     * The class MUST extend AnimatedBlockTileEntity and have a no-arg constructor.
     *
     * <p>If not called, AnimatedBlockTileEntityGeneric is used automatically.
     */
    public EriAnimBlock tileEntity(Class<?> tileClass) {
        def.tileEntityClass = tileClass;
        return this;
    }

    // -- Callbacks --

    public EriAnimBlock onBreak(Consumer<BlockActionContext> handler) {
        def.onBreak = handler;
        return this;
    }

    public EriAnimBlock onPlace(Consumer<BlockActionContext> handler) {
        def.onPlace = handler;
        return this;
    }

    public EriAnimBlock onRightClick(Consumer<BlockActionContext> handler) {
        def.onRightClick = handler;
        return this;
    }

    // -- Registration --

    /**
     * Registers the animated block. Auto-configures:
     * - TileEntity (AnimatedBlockTileEntityGeneric or custom class)
     * - TESR binding (auto-registered in ContentRegistry on client)
     * - Block render type (ENTITYBLOCK_ANIMATED)
     * - Item renderer (AnimatedBlockItemRenderer with display transforms)
     * - Opaque/fullCube = false
     */
    public EriAnimBlock register() {
        // If no custom TE class was set, use the generic one
        if (def.tileEntityClass == null) {
            def.tileEntityClass = AnimatedBlockTileEntityGeneric.class;
        }

        ContentRegistry.getInstance().registerBlock(def);
        return this;
    }
}
```

- [ ] Step 4: Modify `GeneratedBlock.java` -- support AnimBlockDefinition in createTileEntity

In `GeneratedBlock.createTileEntity()`, detect `AnimBlockDefinition` and configure the generic TE:

```java
// In GeneratedBlock.java, REPLACE the createTileEntity method:

@Nullable
@Override
public TileEntity createTileEntity(World world, IBlockState state) {
    if (def.tileEntityClass != null) {
        try {
            TileEntity te = (TileEntity) def.tileEntityClass.newInstance();
            // If this is an AnimBlockDefinition, configure the generic TE
            if (def instanceof fr.eri.eriapi.anim.AnimBlockDefinition
                    && te instanceof fr.eri.eriapi.anim.AnimatedBlockTileEntityGeneric) {
                fr.eri.eriapi.anim.AnimBlockDefinition animDef =
                        (fr.eri.eriapi.anim.AnimBlockDefinition) def;
                ((fr.eri.eriapi.anim.AnimatedBlockTileEntityGeneric) te).configure(
                        animDef.modelId,
                        animDef.animFileId,
                        animDef.renderDistance,
                        animDef.defaultAnimation);
            }
            return te;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    return null;
}
```

- [ ] Step 5: Modify `ContentRegistry.java` -- auto-register TESR for animated blocks

Add TESR auto-binding in `onRegisterModels`. The binding must happen for ALL blocks whose `BlockDefinition` has a `tileEntityClass` that is assignable from `AnimatedBlockTileEntity` (covers both generic and custom subclasses).

```java
// In ContentRegistry.onRegisterModels(), ADD after the existing model registration loop:

// Auto-bind TESR for animated blocks
for (BlockDefinition def : reg.blockDefs) {
    if (def.tileEntityClass != null
            && fr.eri.eriapi.anim.AnimatedBlockTileEntity.class.isAssignableFrom(def.tileEntityClass)) {
        //noinspection unchecked
        net.minecraftforge.fml.client.registry.ClientRegistry.bindTileEntitySpecialRenderer(
                (Class<? extends fr.eri.eriapi.anim.AnimatedBlockTileEntity>) def.tileEntityClass,
                new fr.eri.eriapi.anim.AnimatedBlockTESR());
        Reference.LOGGER.info("EriAPI - Auto-bound AnimatedBlockTESR for TE: {}",
                def.tileEntityClass.getSimpleName());
    }
}
```

**IMPORTANT:** This auto-binding must NOT conflict with manual bindings. If a mod already binds a TESR for a specific TE class in its ClientProxy (like EriniumFaction does for `TileLootbox`), the later manual binding will simply override the auto-binding. This is safe because `ClientRegistry.bindTileEntitySpecialRenderer` replaces any existing binding. However, for clean behavior, EriniumFaction should eventually remove its manual binding after migrating to EriAnimBlock or leave it in place (harmless either way).

- [ ] Step 6: Register `AnimatedBlockTileEntityGeneric` with Forge

The generic TE must be registered with `GameRegistry.registerTileEntity()`. Add this in EriAPI's `preInit`:

```java
// In EriAPI.java preInit(), ADD after AnimNetworkHandler.init():
net.minecraftforge.fml.common.registry.GameRegistry.registerTileEntity(
        fr.eri.eriapi.anim.AnimatedBlockTileEntityGeneric.class,
        new net.minecraft.util.ResourceLocation(Reference.MODID, "animated_block_generic"));
```

- [ ] Step 7: Build both EriAPI and EriniumFaction to verify backward compatibility

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
cd "D:/Mods Minecraft/EriniumFaction" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

Both must succeed. EriniumFaction's TileLootbox (which extends AnimatedBlockTileEntity directly) must compile without changes. The manual TESR binding in EriniumFaction's ClientProxy must not cause errors (double-binding is harmless).

---

## Task 2: Forge Events for Animation Lifecycle

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\event\AnimationStartEvent.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\event\AnimationEndEvent.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\event\AnimationResetEvent.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\event\AnimationLoopEvent.java`

**Files to modify:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTileEntity.java` -- post events in `playAnimation()`, `onAnimationFinished()`, `resetAnimation()`, and loop restart points

**Dependencies:** Task 1 (for AnimBlockDefinition visibility), but functionally independent -- events are in the base `AnimatedBlockTileEntity`.

- [ ] Step 1: Create `AnimationStartEvent.java`

```java
package fr.eri.eriapi.anim.event;

import fr.eri.eriapi.anim.AnimatedBlockTileEntity;
import fr.eri.eriapi.anim.EndBehavior;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraftforge.fml.common.eventhandler.Cancelable;
import net.minecraftforge.fml.common.eventhandler.Event;

/**
 * Fired on MinecraftForge.EVENT_BUS when an animation is about to start playing.
 * Posted BEFORE the animation state changes. If cancelled, the animation is NOT played.
 *
 * <p>Server-side only -- fired in AnimatedBlockTileEntity.playAnimation().
 *
 * <p>Usage:
 * <pre>
 *   EriEvents.on(AnimationStartEvent.class, e -> {
 *       if ("forbidden".equals(e.getAnimName())) {
 *           e.setCanceled(true);
 *       }
 *   });
 * </pre>
 */
@Cancelable
public class AnimationStartEvent extends Event {

    private final World world;
    private final BlockPos pos;
    private final AnimatedBlockTileEntity tileEntity;
    private final String animName;
    private final EndBehavior endBehavior;

    public AnimationStartEvent(World world, BlockPos pos, AnimatedBlockTileEntity tileEntity,
                               String animName, EndBehavior endBehavior) {
        this.world = world;
        this.pos = pos;
        this.tileEntity = tileEntity;
        this.animName = animName;
        this.endBehavior = endBehavior;
    }

    public World getWorld() { return world; }
    public BlockPos getPos() { return pos; }
    public AnimatedBlockTileEntity getTileEntity() { return tileEntity; }
    public String getAnimName() { return animName; }
    public EndBehavior getEndBehavior() { return endBehavior; }
}
```

- [ ] Step 2: Create `AnimationEndEvent.java`

```java
package fr.eri.eriapi.anim.event;

import fr.eri.eriapi.anim.AnimatedBlockTileEntity;
import fr.eri.eriapi.anim.EndBehavior;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraftforge.fml.common.eventhandler.Cancelable;
import net.minecraftforge.fml.common.eventhandler.Event;

/**
 * Fired on MinecraftForge.EVENT_BUS when an animation reaches its final tick
 * and the EndBehavior is about to resolve.
 * If cancelled, the EndBehavior is NOT applied and the animation freezes at the last frame.
 *
 * <p>Server-side only -- fired in AnimatedBlockTileEntity.onAnimationFinished().
 */
@Cancelable
public class AnimationEndEvent extends Event {

    private final World world;
    private final BlockPos pos;
    private final AnimatedBlockTileEntity tileEntity;
    private final String animName;
    private final EndBehavior endBehavior;

    public AnimationEndEvent(World world, BlockPos pos, AnimatedBlockTileEntity tileEntity,
                             String animName, EndBehavior endBehavior) {
        this.world = world;
        this.pos = pos;
        this.tileEntity = tileEntity;
        this.animName = animName;
        this.endBehavior = endBehavior;
    }

    public World getWorld() { return world; }
    public BlockPos getPos() { return pos; }
    public AnimatedBlockTileEntity getTileEntity() { return tileEntity; }
    public String getAnimName() { return animName; }
    public EndBehavior getEndBehavior() { return endBehavior; }
}
```

- [ ] Step 3: Create `AnimationResetEvent.java`

```java
package fr.eri.eriapi.anim.event;

import fr.eri.eriapi.anim.AnimatedBlockTileEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraftforge.fml.common.eventhandler.Cancelable;
import net.minecraftforge.fml.common.eventhandler.Event;

/**
 * Fired on MinecraftForge.EVENT_BUS when an animation is about to be reset.
 * Posted BEFORE the reset occurs. If cancelled, the reset is NOT applied.
 *
 * <p>Server-side only -- fired in AnimatedBlockTileEntity.resetAnimation().
 */
@Cancelable
public class AnimationResetEvent extends Event {

    private final World world;
    private final BlockPos pos;
    private final AnimatedBlockTileEntity tileEntity;
    private final String previousAnim;
    private final boolean instant;

    public AnimationResetEvent(World world, BlockPos pos, AnimatedBlockTileEntity tileEntity,
                               String previousAnim, boolean instant) {
        this.world = world;
        this.pos = pos;
        this.tileEntity = tileEntity;
        this.previousAnim = previousAnim;
        this.instant = instant;
    }

    public World getWorld() { return world; }
    public BlockPos getPos() { return pos; }
    public AnimatedBlockTileEntity getTileEntity() { return tileEntity; }
    public String getPreviousAnim() { return previousAnim; }
    public boolean isInstant() { return instant; }
}
```

- [ ] Step 4: Create `AnimationLoopEvent.java`

```java
package fr.eri.eriapi.anim.event;

import fr.eri.eriapi.anim.AnimatedBlockTileEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraftforge.fml.common.eventhandler.Cancelable;
import net.minecraftforge.fml.common.eventhandler.Event;

/**
 * Fired on MinecraftForge.EVENT_BUS when a looping animation is about to restart.
 * Posted for LOOP, LOOP_COUNT, and LOOP_PAUSE EndBehaviors.
 * If cancelled, the animation stops looping and freezes at the last frame.
 *
 * <p>Server-side only -- fired in AnimatedBlockTileEntity.onAnimationFinished().
 */
@Cancelable
public class AnimationLoopEvent extends Event {

    private final World world;
    private final BlockPos pos;
    private final AnimatedBlockTileEntity tileEntity;
    private final String animName;
    private final int currentLoop;
    private final int maxLoops;

    /**
     * @param currentLoop 0-based loop iteration count (0 = first loop completing)
     * @param maxLoops    max loops for LOOP_COUNT, or -1 for infinite (LOOP/LOOP_PAUSE)
     */
    public AnimationLoopEvent(World world, BlockPos pos, AnimatedBlockTileEntity tileEntity,
                              String animName, int currentLoop, int maxLoops) {
        this.world = world;
        this.pos = pos;
        this.tileEntity = tileEntity;
        this.animName = animName;
        this.currentLoop = currentLoop;
        this.maxLoops = maxLoops;
    }

    public World getWorld() { return world; }
    public BlockPos getPos() { return pos; }
    public AnimatedBlockTileEntity getTileEntity() { return tileEntity; }
    public String getAnimName() { return animName; }
    /** 0-based iteration count. First time the animation completes = 0. */
    public int getCurrentLoop() { return currentLoop; }
    /** Max loops for LOOP_COUNT, or -1 for infinite loops (LOOP/LOOP_PAUSE). */
    public int getMaxLoops() { return maxLoops; }
}
```

- [ ] Step 5: Modify `AnimatedBlockTileEntity.java` -- post events

The modifications are surgical insertions at 4 points in the existing code:

**5a. In `playAnimation(String animName, EndBehavior endBehaviorOverride)`** -- post `AnimationStartEvent` BEFORE changing state:

```java
// REPLACE the entire playAnimation(String, EndBehavior) method:

public void playAnimation(String animName, EndBehavior endBehaviorOverride) {
    if (world == null || world.isRemote) return;

    // Post start event -- cancelable
    EndBehavior effectiveBehavior = endBehaviorOverride;
    if (effectiveBehavior == null) {
        AnimationFile file = EriAnimCache.get(animFileId);
        AnimationDef def = file != null ? file.getAnimation(animName) : null;
        effectiveBehavior = def != null ? def.getEndBehavior() : EndBehavior.FREEZE;
    }
    fr.eri.eriapi.anim.event.AnimationStartEvent startEvent =
            new fr.eri.eriapi.anim.event.AnimationStartEvent(
                    world, pos, this, animName, effectiveBehavior);
    if (net.minecraftforge.common.MinecraftForge.EVENT_BUS.post(startEvent)) {
        return; // cancelled
    }

    this.currentAnimName = animName;
    this.animState = AnimState.PLAYING;
    this.animStartWorldTick = world.getTotalWorldTime();
    this.lastCheckedEventTick = -1;
    this.currentLoopIteration = 0;
    this.endBehaviorOverride = endBehaviorOverride;

    markDirty();

    AnimNetworkHandler.sendPlay(
            (WorldServer) world, pos, animName,
            animStartWorldTick, endBehaviorOverride);
}
```

**5b. In `resetAnimation(boolean instant)`** -- post `AnimationResetEvent` BEFORE resetting:

```java
// REPLACE the entire resetAnimation(boolean) method:

public void resetAnimation(boolean instant) {
    if (world == null || world.isRemote) return;

    // Post reset event -- cancelable
    fr.eri.eriapi.anim.event.AnimationResetEvent resetEvent =
            new fr.eri.eriapi.anim.event.AnimationResetEvent(
                    world, pos, this, currentAnimName, instant);
    if (net.minecraftforge.common.MinecraftForge.EVENT_BUS.post(resetEvent)) {
        return; // cancelled
    }

    if (!instant) {
        AnimationDef def = getServerAnimDef();
        EndBehavior behavior = getEffectiveEndBehavior(def);

        if (behavior == EndBehavior.ROLLBACK && def != null && def.getRollbackDuration() > 0) {
            startRollback();
            AnimNetworkHandler.sendReset((WorldServer) world, pos, false);
            return;
        }
    }

    resetAnimationInstant();
}
```

**5c. In `onAnimationFinished(AnimationDef def)`** -- post `AnimationEndEvent` before endBehavior resolution, and `AnimationLoopEvent` before loop restart:

```java
// REPLACE the entire onAnimationFinished(AnimationDef) method:

private void onAnimationFinished(AnimationDef def) {
    EndBehavior behavior = getEffectiveEndBehavior(def);

    // Post end event -- cancelable
    fr.eri.eriapi.anim.event.AnimationEndEvent endEvent =
            new fr.eri.eriapi.anim.event.AnimationEndEvent(
                    world, pos, this, def.getName(), behavior);
    if (net.minecraftforge.common.MinecraftForge.EVENT_BUS.post(endEvent)) {
        // Cancelled -- freeze at last frame
        animState = AnimState.FROZEN;
        markDirty();
        return;
    }

    switch (behavior) {
        case FREEZE:
            animState = AnimState.FROZEN;
            markDirty();
            onAnimationComplete(def.getName());
            break;

        case ROLLBACK:
            startRollback();
            AnimNetworkHandler.sendReset((WorldServer) world, pos, false);
            break;

        case ROLLBACK_INSTANT:
            animState = AnimState.IDLE;
            currentAnimName = "";
            endBehaviorOverride = null;
            markDirty();
            AnimNetworkHandler.sendReset((WorldServer) world, pos, true);
            onAnimationComplete(def.getName());
            break;

        case WAIT_SERVER:
            animState = AnimState.WAITING_SERVER;
            markDirty();
            break;

        case LOOP: {
            fr.eri.eriapi.anim.event.AnimationLoopEvent loopEvent =
                    new fr.eri.eriapi.anim.event.AnimationLoopEvent(
                            world, pos, this, def.getName(), currentLoopIteration, -1);
            if (net.minecraftforge.common.MinecraftForge.EVENT_BUS.post(loopEvent)) {
                animState = AnimState.FROZEN;
                markDirty();
                return;
            }
            restartLoop();
            break;
        }

        case LOOP_COUNT: {
            currentLoopIteration++;
            if (currentLoopIteration >= def.getLoopCount()) {
                animState = AnimState.FROZEN;
                markDirty();
                onAnimationComplete(def.getName());
            } else {
                fr.eri.eriapi.anim.event.AnimationLoopEvent loopEvent =
                        new fr.eri.eriapi.anim.event.AnimationLoopEvent(
                                world, pos, this, def.getName(),
                                currentLoopIteration, def.getLoopCount());
                if (net.minecraftforge.common.MinecraftForge.EVENT_BUS.post(loopEvent)) {
                    animState = AnimState.FROZEN;
                    markDirty();
                    return;
                }
                restartLoop();
            }
            break;
        }

        case LOOP_PAUSE: {
            currentLoopIteration++;
            fr.eri.eriapi.anim.event.AnimationLoopEvent loopEvent =
                    new fr.eri.eriapi.anim.event.AnimationLoopEvent(
                            world, pos, this, def.getName(), currentLoopIteration, -1);
            if (net.minecraftforge.common.MinecraftForge.EVENT_BUS.post(loopEvent)) {
                animState = AnimState.FROZEN;
                markDirty();
                return;
            }
            loopPauseEndTick = world.getTotalWorldTime() + def.getLoopPause();
            animStartWorldTick = world.getTotalWorldTime() + def.getLoopPause();
            lastCheckedEventTick = -1;
            break;
        }
    }
}
```

**NOTE on field access:** The `currentAnimName`, `animState`, `animStartWorldTick`, `lastCheckedEventTick`, `currentLoopIteration`, `endBehaviorOverride`, `loopPauseEndTick` fields are `private` in the existing code. Since we are modifying the same class, this is fine -- the replacement methods have direct access to private fields.

- [ ] Step 6: Build

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 3: Debug Command /erianim

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\command\CommandEriAnim.java`

**Files to modify:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\EriAPI.java` -- register the command in `init()`

**Dependencies:** Task 1 (AnimPerf), Task 2 (events), AnimModelCache/EriAnimCache for reload. But the command can be written independently -- it only calls existing APIs on AnimatedBlockTileEntity.

- [ ] Step 1: Create `CommandEriAnim.java`

```java
package fr.eri.eriapi.anim.command;

import fr.eri.eriapi.anim.AnimatedBlockTileEntity;
import fr.eri.eriapi.anim.AnimModelCache;
import fr.eri.eriapi.anim.AnimPerf;
import fr.eri.eriapi.anim.AnimState;
import fr.eri.eriapi.anim.AnimationDef;
import fr.eri.eriapi.anim.AnimationFile;
import fr.eri.eriapi.anim.EndBehavior;
import fr.eri.eriapi.anim.EriAnimCache;
import fr.eri.eriapi.command.EriCommand;
import fr.eri.eriapi.command.args.EnumArg;
import fr.eri.eriapi.command.args.PosArg;
import fr.eri.eriapi.command.args.StringArg;
import net.minecraft.tileentity.TileEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.text.TextFormatting;
import net.minecraft.world.World;

/**
 * Debug command for the block animation framework.
 * All subcommands require OP level 2, except reload which requires level 3.
 *
 * <p>Subcommands:
 * <ul>
 *   <li>/erianim play x y z animName [endBehavior]</li>
 *   <li>/erianim reset x y z [instant]</li>
 *   <li>/erianim stop x y z</li>
 *   <li>/erianim list x y z</li>
 *   <li>/erianim state x y z</li>
 *   <li>/erianim perf</li>
 *   <li>/erianim reload</li>
 * </ul>
 */
public class CommandEriAnim {

    private CommandEriAnim() {}

    public static void register() {
        EriCommand cmd = EriCommand.create("erianim")
                .description("EriAPI block animation debug tools")
                .permission(2);

        // /erianim play <pos> <anim> [endBehavior]
        cmd.sub("play")
                .arg(PosArg.of("pos"))
                .arg(StringArg.of("anim").suggestsDynamic(() -> new String[]{"idle", "open", "close", "idle_breathe"}))
                .arg(EnumArg.of("endBehavior", EndBehavior.class).optional(null))
                .description("Play an animation on an animated block")
                .runs(ctx -> {
                    BlockPos pos = ctx.getBlockPos("pos");
                    String animName = ctx.getString("anim");
                    EndBehavior endBehavior = ctx.get("endBehavior");

                    AnimatedBlockTileEntity te = getTileEntity(ctx.getServer().getEntityWorld(), pos);
                    if (te == null) {
                        ctx.error("No animated block at " + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                        return 0;
                    }

                    // Validate animation name against the TE's anim file
                    String animFileId = te.getAnimFileId();
                    if (animFileId != null && !animFileId.isEmpty()) {
                        AnimationFile file = EriAnimCache.get(animFileId);
                        if (file != null && !file.hasAnimation(animName)) {
                            ctx.error("Animation '" + animName + "' not found. Use /erianim list to see available animations.");
                            return 0;
                        }
                    }

                    te.playAnimation(animName, endBehavior);
                    String behaviorStr = endBehavior != null ? " (" + endBehavior.name() + ")" : "";
                    ctx.success("Playing '" + animName + "'" + behaviorStr + " at "
                            + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                    return 1;
                });

        // /erianim reset <pos> [instant]
        cmd.sub("reset")
                .arg(PosArg.of("pos"))
                .arg(StringArg.of("instant").optional("false").suggests("true", "false"))
                .description("Reset animation (with rollback or instant)")
                .runs(ctx -> {
                    BlockPos pos = ctx.getBlockPos("pos");
                    String instantStr = ctx.getString("instant");
                    boolean instant = "true".equalsIgnoreCase(instantStr);

                    AnimatedBlockTileEntity te = getTileEntity(ctx.getServer().getEntityWorld(), pos);
                    if (te == null) {
                        ctx.error("No animated block at " + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                        return 0;
                    }

                    te.resetAnimation(instant);
                    ctx.success("Reset animation " + (instant ? "(instant)" : "(rollback)")
                            + " at " + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                    return 1;
                });

        // /erianim stop <pos>
        cmd.sub("stop")
                .arg(PosArg.of("pos"))
                .description("Stop animation immediately (no rollback, no callback)")
                .runs(ctx -> {
                    BlockPos pos = ctx.getBlockPos("pos");

                    AnimatedBlockTileEntity te = getTileEntity(ctx.getServer().getEntityWorld(), pos);
                    if (te == null) {
                        ctx.error("No animated block at " + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                        return 0;
                    }

                    te.stopAnimation();
                    ctx.success("Stopped animation at " + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                    return 1;
                });

        // /erianim list <pos>
        cmd.sub("list")
                .arg(PosArg.of("pos"))
                .description("List available animations for an animated block")
                .runs(ctx -> {
                    BlockPos pos = ctx.getBlockPos("pos");

                    AnimatedBlockTileEntity te = getTileEntity(ctx.getServer().getEntityWorld(), pos);
                    if (te == null) {
                        ctx.error("No animated block at " + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                        return 0;
                    }

                    String animFileId = te.getAnimFileId();
                    if (animFileId == null || animFileId.isEmpty()) {
                        ctx.info("No animation file configured for this block.");
                        return 0;
                    }

                    AnimationFile file = EriAnimCache.get(animFileId);
                    if (file == null) {
                        ctx.error("Failed to load animation file: " + animFileId);
                        return 0;
                    }

                    ctx.reply(TextFormatting.GOLD + "=== Animations for " + animFileId + " ===");
                    for (java.util.Map.Entry<String, AnimationDef> entry : file.getAnimations().entrySet()) {
                        AnimationDef def = entry.getValue();
                        String name = entry.getKey();
                        String info = TextFormatting.YELLOW + name
                                + TextFormatting.GRAY + " | "
                                + def.getDuration() + " ticks | "
                                + def.getEndBehavior().name()
                                + " | " + def.getTracks().size() + " tracks"
                                + " | " + def.getEvents().size() + " events";
                        ctx.reply(info);
                    }
                    ctx.info("Total: " + file.getAnimationCount() + " animation(s)");
                    return 1;
                });

        // /erianim state <pos>
        cmd.sub("state")
                .arg(PosArg.of("pos"))
                .description("Show current animation state of an animated block")
                .runs(ctx -> {
                    BlockPos pos = ctx.getBlockPos("pos");

                    AnimatedBlockTileEntity te = getTileEntity(ctx.getServer().getEntityWorld(), pos);
                    if (te == null) {
                        ctx.error("No animated block at " + pos.getX() + " " + pos.getY() + " " + pos.getZ());
                        return 0;
                    }

                    ctx.reply(TextFormatting.GOLD + "=== Block State at "
                            + pos.getX() + " " + pos.getY() + " " + pos.getZ() + " ===");
                    ctx.reply(TextFormatting.GRAY + "Model: " + TextFormatting.WHITE + te.getModelId());
                    ctx.reply(TextFormatting.GRAY + "Anim File: " + TextFormatting.WHITE + te.getAnimFileId());
                    ctx.reply(TextFormatting.GRAY + "State: " + TextFormatting.WHITE + te.getAnimState().name());
                    ctx.reply(TextFormatting.GRAY + "Current Anim: " + TextFormatting.WHITE
                            + (te.getCurrentAnimName().isEmpty() ? "(none)" : te.getCurrentAnimName()));
                    ctx.reply(TextFormatting.GRAY + "Progress: " + TextFormatting.WHITE
                            + String.format("%.1f%%", te.getAnimationProgress() * 100));

                    java.util.Map<String, String> texOverrides = te.getTextureOverrides();
                    if (!texOverrides.isEmpty()) {
                        ctx.reply(TextFormatting.GRAY + "Texture overrides: " + TextFormatting.WHITE
                                + texOverrides.size());
                        for (java.util.Map.Entry<String, String> entry : texOverrides.entrySet()) {
                            ctx.reply(TextFormatting.DARK_GRAY + "  " + entry.getKey()
                                    + " -> " + entry.getValue());
                        }
                    }
                    return 1;
                });

        // /erianim perf
        cmd.sub("perf")
                .description("Show animation render performance stats")
                .runs(ctx -> {
                    ctx.reply(TextFormatting.GOLD + "=== Animation Performance ===");
                    ctx.reply(TextFormatting.GRAY + "Blocks rendered last frame: "
                            + TextFormatting.WHITE + AnimPerf.getLastBlockCount());
                    ctx.reply(TextFormatting.GRAY + "Render time last frame: "
                            + TextFormatting.WHITE + String.format("%.3f ms", AnimPerf.getLastRenderTimeMs()));
                    ctx.reply(TextFormatting.GRAY + "Avg render time (last 100 frames): "
                            + TextFormatting.WHITE + String.format("%.3f ms", AnimPerf.getAvgRenderTimeMs()));
                    ctx.reply(TextFormatting.GRAY + "Cached models: "
                            + TextFormatting.WHITE + AnimModelCache.size());
                    ctx.reply(TextFormatting.GRAY + "Cached anim files: "
                            + TextFormatting.WHITE + EriAnimCache.size());
                    return 1;
                });

        // /erianim reload
        cmd.sub("reload")
                .permission(3)
                .description("Hot-reload all cached models and animations")
                .runs(ctx -> {
                    int models = AnimModelCache.size();
                    int anims = EriAnimCache.size();
                    AnimModelCache.clear();
                    EriAnimCache.clear();
                    ctx.success("Cleared " + models + " cached models and " + anims
                            + " cached animations. They will be re-parsed on next render.");
                    return 1;
                });

        cmd.register();
    }

    /**
     * Gets the AnimatedBlockTileEntity at the given position, or null if not found.
     */
    private static AnimatedBlockTileEntity getTileEntity(World world, BlockPos pos) {
        if (world == null) return null;
        TileEntity te = world.getTileEntity(pos);
        if (te instanceof AnimatedBlockTileEntity) {
            return (AnimatedBlockTileEntity) te;
        }
        return null;
    }
}
```

- [ ] Step 2: Modify `EriAPI.java` -- register the command

```java
// In EriAPI.init(), ADD after CommandDemo.register():
fr.eri.eriapi.anim.command.CommandEriAnim.register();
```

- [ ] Step 3: Build

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 4: IDLE Render Caching (FastTESR optimization)

**Files to modify:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTESR.java` -- add dirty flag, skip pose computation when IDLE and clean
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTileEntity.java` -- add `idleRenderDirty` flag, set it to true on state transitions

**Dependencies:** None -- works on existing TESR and TE code.

**Concept:** When an animated block is in IDLE state, its visual representation never changes. There is no need to call `getCurrentPose()` or recompute anything. The TESR should detect IDLE state and skip the pose computation, rendering the static model directly. The `idleRenderDirty` flag is set to `true` whenever the animation state changes (play, reset, pause, resume, texture override change). When the TESR sees IDLE + dirty=false, it renders statically without calling `getCurrentPose()`.

- [ ] Step 1: Add `idleRenderDirty` flag to `AnimatedBlockTileEntity`

```java
// ADD field after the existing fields (near line 70):

/** Client-side flag: true when the visual state has changed and TESR needs to re-evaluate.
 *  Reset to false by the TESR after rendering. Only meaningful in IDLE state. */
private boolean idleRenderDirty = true;

// ADD public methods:

/**
 * Returns true if the TESR should re-evaluate the render.
 * When false and state is IDLE, the TESR can skip pose computation entirely.
 */
public boolean isIdleRenderDirty() {
    return idleRenderDirty;
}

/**
 * Called by the TESR after rendering to mark the idle state as clean.
 */
public void clearIdleRenderDirty() {
    idleRenderDirty = false;
}
```

Then set `idleRenderDirty = true` in every method that changes visual state:
- `onAnimPlayReceived(...)` -- already changes state to PLAYING
- `onAnimResetReceived(...)` -- changes to IDLE or ROLLING_BACK
- `onAnimPauseReceived(...)` -- changes to PAUSED
- `onAnimResumeReceived(...)` -- changes to PLAYING
- `setTexture(...)`, `clearTexture(...)`, `clearAllTextures()` -- texture changes
- `readFromNBT(...)` -- state restored from disk/network

Add `idleRenderDirty = true;` as the FIRST line of each of these methods. This is a one-line addition in 8 methods.

- [ ] Step 2: Modify `AnimatedBlockTESR.render()` -- skip pose computation for clean IDLE

```java
// REPLACE the render() method in AnimatedBlockTESR:

@Override
public void render(AnimatedBlockTileEntity te, double x, double y, double z,
                   float partialTicks, int destroyStage, float alpha) {
    String modelId = te.getModelId();
    if (modelId == null || modelId.isEmpty()) return;

    AnimatedBlockModel model = AnimModelCache.get(modelId);
    if (model == null) return;

    // --- Perf tracking start ---
    long perfStart = AnimPerf.isTracking() ? System.nanoTime() : 0;

    currentTextures = model.getTextures();
    lastBoundTexture = null;

    // IDLE optimization: if state is IDLE and render is not dirty, skip pose computation
    AnimState state = te.getAnimState();
    if (state == AnimState.IDLE && !te.isIdleRenderDirty()) {
        currentPose = null;
    } else {
        currentPose = te.getCurrentPose(partialTicks);
        if (state == AnimState.IDLE) {
            te.clearIdleRenderDirty();
        }
    }

    // Merge texture overrides
    activeTextureOverrides = te.getTextureOverrides();

    GlStateManager.pushMatrix();
    GlStateManager.translate(x, y, z);
    GlStateManager.enableRescaleNormal();
    GlStateManager.color(1.0f, 1.0f, 1.0f, 1.0f);

    List<ModelGroup> rootGroups = model.getRootGroups();
    for (int i = 0; i < rootGroups.size(); i++) {
        renderGroup(rootGroups.get(i));
    }

    GlStateManager.disableRescaleNormal();
    GlStateManager.popMatrix();

    currentTextures = null;
    lastBoundTexture = null;
    currentPose = null;
    activeTextureOverrides = null;

    // --- Perf tracking end ---
    if (perfStart != 0) {
        AnimPerf.recordRender(System.nanoTime() - perfStart);
    }
}
```

**NOTE:** The import for `AnimState` is already implicit since `AnimatedBlockTESR` works with `AnimatedBlockTileEntity` which uses `AnimState`. Add the explicit import:
```java
import fr.eri.eriapi.anim.AnimState;
```

- [ ] Step 3: Build

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 5: AnimPerf -- Performance Instrumentation

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimPerf.java`

**Files to modify:** None directly (Task 4 already integrates AnimPerf into the TESR, Task 3 reads from it in /erianim perf).

**Dependencies:** Must be created BEFORE Task 3 and Task 4 (they reference `AnimPerf`). In practice, implement this task FIRST among tasks 3-5, or at minimum before building tasks 3 and 4.

- [ ] Step 1: Create `AnimPerf.java`

```java
package fr.eri.eriapi.anim;

/**
 * Lightweight performance tracker for animated block rendering.
 * Tracks per-frame block count and render time. Thread-safe for the render thread
 * (all access is from the client render thread, no synchronization needed).
 *
 * <p>The TESR calls recordRender() for each animated block rendered.
 * Call beginFrame() at the start of each frame (or let the first recordRender auto-detect).
 * Call endFrame() at the end of each frame to finalize stats.
 *
 * <p>Stats are accessible via /erianim perf.
 */
public class AnimPerf {

    private static boolean tracking = false;

    // Current frame accumulators
    private static int frameBlockCount = 0;
    private static long frameRenderTimeNs = 0;

    // Last completed frame stats
    private static int lastBlockCount = 0;
    private static double lastRenderTimeMs = 0;

    // Rolling average (last WINDOW_SIZE frames)
    private static final int WINDOW_SIZE = 100;
    private static final double[] renderTimeSamples = new double[WINDOW_SIZE];
    private static int sampleIndex = 0;
    private static int sampleCount = 0;

    private AnimPerf() {}

    /**
     * Enables performance tracking. When disabled, recordRender() is a no-op.
     */
    public static void setTracking(boolean enabled) {
        tracking = enabled;
        if (!enabled) {
            frameBlockCount = 0;
            frameRenderTimeNs = 0;
        }
    }

    public static boolean isTracking() {
        return tracking;
    }

    /**
     * Records a single animated block render.
     * Called by AnimatedBlockTESR.render() for each block.
     *
     * @param renderTimeNs time in nanoseconds to render this block
     */
    public static void recordRender(long renderTimeNs) {
        if (!tracking) return;
        frameBlockCount++;
        frameRenderTimeNs += renderTimeNs;
    }

    /**
     * Finalizes the current frame and stores the results.
     * Should be called once per render frame (e.g. from a client tick handler
     * or the first render call of a new frame).
     *
     * <p>In practice, the TESR does not know when a frame starts/ends.
     * Instead, we use a simpler approach: each call to recordRender() accumulates,
     * and endFrame() snapshots and resets. The /erianim perf command calls endFrame()
     * to get a snapshot, or we can auto-snapshot every N calls.
     *
     * <p>For simplicity, we auto-snapshot when beginFrame() is called.
     */
    public static void beginFrame() {
        if (!tracking) return;
        // Snapshot previous frame
        lastBlockCount = frameBlockCount;
        lastRenderTimeMs = frameRenderTimeNs / 1_000_000.0;

        // Store in rolling window
        renderTimeSamples[sampleIndex] = lastRenderTimeMs;
        sampleIndex = (sampleIndex + 1) % WINDOW_SIZE;
        if (sampleCount < WINDOW_SIZE) sampleCount++;

        // Reset accumulators for new frame
        frameBlockCount = 0;
        frameRenderTimeNs = 0;
    }

    // --- Accessors ---

    public static int getLastBlockCount() {
        return lastBlockCount;
    }

    public static double getLastRenderTimeMs() {
        return lastRenderTimeMs;
    }

    public static double getAvgRenderTimeMs() {
        if (sampleCount == 0) return 0;
        double sum = 0;
        for (int i = 0; i < sampleCount; i++) {
            sum += renderTimeSamples[i];
        }
        return sum / sampleCount;
    }

    /**
     * Resets all tracking data.
     */
    public static void reset() {
        frameBlockCount = 0;
        frameRenderTimeNs = 0;
        lastBlockCount = 0;
        lastRenderTimeMs = 0;
        sampleIndex = 0;
        sampleCount = 0;
        for (int i = 0; i < WINDOW_SIZE; i++) {
            renderTimeSamples[i] = 0;
        }
    }
}
```

- [ ] Step 2: Add frame boundary detection to the TESR

The TESR does not have a direct "begin frame" signal. We use a simple heuristic: track the last world tick rendered, and call `beginFrame()` when the tick changes.

Add this to `AnimatedBlockTESR` as a static field and check in `render()`:

```java
// ADD to AnimatedBlockTESR class body (static field):
private static long lastFrameTick = -1;

// ADD at the very beginning of render(), BEFORE the modelId null check:
if (AnimPerf.isTracking()) {
    long worldTick = te.getWorld() != null ? te.getWorld().getTotalWorldTime() : 0;
    if (worldTick != lastFrameTick) {
        AnimPerf.beginFrame();
        lastFrameTick = worldTick;
    }
}
```

**NOTE:** Using world tick means we get 20 snapshots per second, not 60+. This is acceptable for a debug tool -- render times are accumulated over all draw calls within a tick, giving a meaningful per-tick metric.

- [ ] Step 3: Auto-enable tracking when `/erianim perf` is used

In `CommandEriAnim`, the `perf` subcommand should auto-enable tracking:

```java
// In the perf subcommand's runs() lambda, ADD at the beginning:
if (!AnimPerf.isTracking()) {
    AnimPerf.setTracking(true);
    ctx.info("Performance tracking enabled. Run again in a few seconds for data.");
    return 1;
}
```

- [ ] Step 4: Build

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Implementation Order

The tasks have compile-time dependencies. The correct order is:

1. **Task 5 (AnimPerf)** -- no dependencies, referenced by tasks 3 and 4
2. **Task 1 (EriAnimBlock builder)** -- depends on AnimPerf only indirectly (AnimBlockDefinition is standalone)
3. **Task 2 (Forge events)** -- depends on nothing (modifies AnimatedBlockTileEntity)
4. **Task 4 (IDLE render caching)** -- depends on AnimPerf (Task 5) and modifies TESR
5. **Task 3 (Commands)** -- depends on AnimPerf (Task 5), can reference all other systems

**Recommended sequential order:** Task 5 -> Task 1 -> Task 2 -> Task 4 -> Task 3

Each task = 1 commit. Build after each task.

---

## Verification Checklist

After all 5 tasks are complete, verify:

- [ ] `EriAnimBlock.create("mod", "test").model("mod:block/test").register()` compiles
- [ ] `TileLootbox extends AnimatedBlockTileEntity` in EriniumFaction still compiles (backward compat)
- [ ] EriniumFaction builds without changes
- [ ] All 4 events exist in `fr.eri.eriapi.anim.event` and are `@Cancelable`
- [ ] `/erianim` has 7 subcommands: play, reset, stop, list, state, perf, reload
- [ ] `/erianim reload` clears both AnimModelCache and EriAnimCache
- [ ] `/erianim perf` shows block count, render time, avg render time, cache sizes
- [ ] `AnimPerf.isTracking()` defaults to false (no overhead when not debugging)
- [ ] IDLE blocks skip pose computation after first clean render
- [ ] `idleRenderDirty` is set to true on every state transition
- [ ] `AnimatedBlockTileEntityGeneric` is registered with Forge via GameRegistry
- [ ] ContentRegistry auto-binds TESR for all AnimatedBlockTileEntity subclasses
- [ ] No Java 9+ features used anywhere
- [ ] No streams in hot paths (TESR render loop, tick methods)
