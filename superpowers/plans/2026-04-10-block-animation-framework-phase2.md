# Block Animation Framework -- Phase 2 : Animation Runtime

> **For agentic workers:** REQUIRED SUB-SKILL -- Read `CLAUDE.md` and `docs/knowissue.md` before touching any file. Build with `cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build` after every task. Java 8 only -- no `var`, no Java 9+ features. No streams in hot paths. Reuse the existing `Easing` enum at `fr.eri.eriapi.gui.anim.Easing` -- never duplicate it. All new files go in `fr.eri.eriapi.anim` unless stated otherwise. The existing Phase 1 code is in the same package and must not be broken.

**Goal:** Add full animation runtime to the block animation framework: parse `.erianim` files, interpolate keyframes with easing, manage animation state on TileEntities, sync state via network packets, implement all 7 end behaviors, blend between animations, and fire timed events (sound, particle, callback, hide/show group, cut).

**Architecture:** 16 new files in `fr.eri.eriapi.anim`, 2 modified files. The runtime splits into: data structures (parsed from `.erianim`), a client-side `AnimationController` that computes interpolated poses per frame, an extended `AnimatedBlockTileEntity` with state machine and ITickable, 3 network packets for state sync, and event dispatch. The TESR is modified to apply `AnimationPose` transforms instead of rendering statically.

**Tech Stack:** Java 8, Forge 1.12.2, GSON (bundled), OpenGL via GlStateManager, `SimpleNetworkWrapper` for packets, existing `Easing` enum from `fr.eri.eriapi.gui.anim`.

**Existing Phase 1 files (in `fr.eri.eriapi.anim`):**
- `FaceData` -- UV/texture per face
- `ModelElement` -- cube with from/to/rotation/faces
- `ModelGroup` -- named group with pivot, children, visible
- `AnimatedBlockModel` -- complete model (rootGroups, groupsByName, textures, displayTransforms, allElements)
- `BlockbenchModelParser` -- parses JSON Blockbench to AnimatedBlockModel
- `AnimModelCache` -- singleton cache `get(modelId)`, `clear()`, `invalidate()`
- `AnimatedBlockTileEntity` -- TileEntity base with modelId, NBT sync, render distance/bounding box
- `AnimatedBlockTESR` -- TESR that renders statically (recursive group render, multi-texture, element rotation)
- `AnimatedBlockItemRenderer` -- TEISR for item rendering with display transforms
- `DisplayTransform` -- rotation/translation/scale per display context

---

## Task 1: Data Structures -- EndBehavior, AnimState, Keyframe, SpinKeyframe, TextureKeyframe, AnimationEvent, GroupTrack, AnimationDef, AnimationFile

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\EndBehavior.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimState.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\Keyframe.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\SpinKeyframe.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\TextureKeyframe.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimationEvent.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\GroupTrack.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimationDef.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimationFile.java`

**Files to modify:** None.

**Dependencies:** None -- pure data classes.

- [ ] Step 1: Create `EndBehavior.java`

```java
package fr.eri.eriapi.anim;

/**
 * Defines what happens when an animation reaches its last tick.
 */
public enum EndBehavior {

    /** Stays at the last frame indefinitely. */
    FREEZE,

    /** Plays the animation in reverse over rollbackDuration ticks back to frame 0. */
    ROLLBACK,

    /** Snaps instantly back to frame 0. */
    ROLLBACK_INSTANT,

    /** Freezes at the last frame, waits for server signal (te.resetAnimation()). */
    WAIT_SERVER,

    /** Loops the animation infinitely. */
    LOOP,

    /** Loops the animation N times (loopCount) then freezes. */
    LOOP_COUNT,

    /** Loops infinitely with a pause of loopPause ticks between each cycle. */
    LOOP_PAUSE;

    /**
     * Parses from JSON string. Case-insensitive. Defaults to FREEZE if unknown.
     */
    public static EndBehavior fromString(String s) {
        if (s == null || s.isEmpty()) return FREEZE;
        switch (s.toLowerCase()) {
            case "freeze":           return FREEZE;
            case "rollback":         return ROLLBACK;
            case "rollback_instant": return ROLLBACK_INSTANT;
            case "wait_server":      return WAIT_SERVER;
            case "loop":             return LOOP;
            case "loop_count":       return LOOP_COUNT;
            case "loop_pause":       return LOOP_PAUSE;
            default:                 return FREEZE;
        }
    }
}
```

- [ ] Step 2: Create `AnimState.java`

```java
package fr.eri.eriapi.anim;

/**
 * The current state of an animated block's animation playback.
 */
public enum AnimState {

    /** No animation playing, no ticking required. */
    IDLE,

    /** Animation is actively playing, events are being dispatched. */
    PLAYING,

    /** Animation is frozen at a specific tick (user-paused). */
    PAUSED,

    /** Animation finished and is frozen at the last frame (endBehavior = FREEZE or WAIT_SERVER completed). */
    FROZEN,

    /** Animation is playing in reverse back to frame 0 (endBehavior = ROLLBACK). */
    ROLLING_BACK,

    /** Animation finished and is frozen, waiting for a server-side resetAnimation() call. */
    WAITING_SERVER;

    /**
     * Returns true if this state requires ITickable updates.
     */
    public boolean needsTicking() {
        return this == PLAYING || this == ROLLING_BACK;
    }
}
```

- [ ] Step 3: Create `Keyframe.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.gui.anim.Easing;

/**
 * A keyframe for rotation, translation, or scale tracks.
 * Stores a float[3] value at a specific tick with an easing function.
 */
public class Keyframe {

    private final int tick;
    private final float[] value; // [x, y, z]
    private final Easing easing;

    public Keyframe(int tick, float[] value, Easing easing) {
        this.tick = tick;
        this.value = value;
        this.easing = easing;
    }

    public int getTick() { return tick; }
    public float[] getValue() { return value; }
    public Easing getEasing() { return easing; }

    /**
     * Parses an easing string into an Easing enum value.
     * Case-insensitive, converts hyphens/spaces to underscores.
     * Defaults to LINEAR if not recognized.
     */
    public static Easing parseEasing(String s) {
        if (s == null || s.isEmpty()) return Easing.LINEAR;
        String normalized = s.toUpperCase().replace('-', '_').replace(' ', '_');
        try {
            return Easing.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            return Easing.LINEAR;
        }
    }
}
```

- [ ] Step 4: Create `SpinKeyframe.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.gui.anim.Easing;

/**
 * A keyframe for continuous spin tracks.
 * Defines a spin speed (degrees per tick) on a given axis, with easing
 * controlling the transition from the previous speed to this one.
 */
public class SpinKeyframe {

    private final int tick;
    private final String axis; // "x", "y", or "z"
    private final float speed; // degrees per tick
    private final Easing easing;

    public SpinKeyframe(int tick, String axis, float speed, Easing easing) {
        this.tick = tick;
        this.axis = axis;
        this.speed = speed;
        this.easing = easing;
    }

    public int getTick() { return tick; }
    public String getAxis() { return axis; }
    public float getSpeed() { return speed; }
    public Easing getEasing() { return easing; }

    /**
     * Returns the axis index: 0=x, 1=y, 2=z. Defaults to 1 (y) if unknown.
     */
    public int getAxisIndex() {
        if ("x".equals(axis)) return 0;
        if ("z".equals(axis)) return 2;
        return 1; // "y" or default
    }
}
```

- [ ] Step 5: Create `TextureKeyframe.java`

```java
package fr.eri.eriapi.anim;

/**
 * A keyframe for texture swap tracks.
 * At the specified tick, the texture identified by 'target' is replaced by 'value'.
 * Texture swaps are instantaneous (no interpolation).
 */
public class TextureKeyframe {

    private final int tick;
    private final String target; // texture key to replace (e.g. "side_core")
    private final String value;  // replacement texture key (e.g. "side_core_active")

    public TextureKeyframe(int tick, String target, String value) {
        this.tick = tick;
        this.target = target;
        this.value = value;
    }

    public int getTick() { return tick; }
    public String getTarget() { return target; }
    public String getValue() { return value; }
}
```

- [ ] Step 6: Create `AnimationEvent.java`

```java
package fr.eri.eriapi.anim;

/**
 * An event triggered at a specific tick during animation playback.
 * Types: sound, particle, callback, hide_group, show_group, cut.
 */
public class AnimationEvent {

    public enum EventType {
        SOUND,
        PARTICLE,
        CALLBACK,
        HIDE_GROUP,
        SHOW_GROUP,
        CUT;

        public static EventType fromString(String s) {
            if (s == null || s.isEmpty()) return CALLBACK;
            switch (s.toLowerCase()) {
                case "sound":      return SOUND;
                case "particle":   return PARTICLE;
                case "callback":   return CALLBACK;
                case "hide_group": return HIDE_GROUP;
                case "show_group": return SHOW_GROUP;
                case "cut":        return CUT;
                default:           return CALLBACK;
            }
        }
    }

    private final int tick;
    private final EventType type;
    private final String value;   // sound id, particle name, callback name, group name, or empty for cut
    private final float volume;   // for sound events, default 1.0
    private final float pitch;    // for sound events, default 1.0
    private final int count;      // for particle events, default 1
    private final float spread;   // for particle events, default 0.5

    public AnimationEvent(int tick, EventType type, String value,
                          float volume, float pitch, int count, float spread) {
        this.tick = tick;
        this.type = type;
        this.value = value;
        this.volume = volume;
        this.pitch = pitch;
        this.count = count;
        this.spread = spread;
    }

    public int getTick() { return tick; }
    public EventType getType() { return type; }
    public String getValue() { return value; }
    public float getVolume() { return volume; }
    public float getPitch() { return pitch; }
    public int getCount() { return count; }
    public float getSpread() { return spread; }
}
```

- [ ] Step 7: Create `GroupTrack.java`

```java
package fr.eri.eriapi.anim;

import java.util.Collections;
import java.util.List;

/**
 * All animation tracks for a single named group.
 * Each track is a sorted (by tick) list of keyframes.
 */
public class GroupTrack {

    private final String groupName;
    private final List<Keyframe> rotation;
    private final List<Keyframe> translation;
    private final List<Keyframe> scale;
    private final List<Keyframe> visible; // value[0] > 0.5 = visible, else hidden. Instantaneous.
    private final List<SpinKeyframe> spin;
    private final List<TextureKeyframe> texture;

    public GroupTrack(String groupName,
                      List<Keyframe> rotation,
                      List<Keyframe> translation,
                      List<Keyframe> scale,
                      List<Keyframe> visible,
                      List<SpinKeyframe> spin,
                      List<TextureKeyframe> texture) {
        this.groupName = groupName;
        this.rotation = rotation != null ? rotation : Collections.<Keyframe>emptyList();
        this.translation = translation != null ? translation : Collections.<Keyframe>emptyList();
        this.scale = scale != null ? scale : Collections.<Keyframe>emptyList();
        this.visible = visible != null ? visible : Collections.<Keyframe>emptyList();
        this.spin = spin != null ? spin : Collections.<SpinKeyframe>emptyList();
        this.texture = texture != null ? texture : Collections.<TextureKeyframe>emptyList();
    }

    public String getGroupName() { return groupName; }
    public List<Keyframe> getRotation() { return rotation; }
    public List<Keyframe> getTranslation() { return translation; }
    public List<Keyframe> getScale() { return scale; }
    public List<Keyframe> getVisible() { return visible; }
    public List<SpinKeyframe> getSpin() { return spin; }
    public List<TextureKeyframe> getTexture() { return texture; }

    public boolean hasRotation() { return !rotation.isEmpty(); }
    public boolean hasTranslation() { return !translation.isEmpty(); }
    public boolean hasScale() { return !scale.isEmpty(); }
    public boolean hasVisible() { return !visible.isEmpty(); }
    public boolean hasSpin() { return !spin.isEmpty(); }
    public boolean hasTexture() { return !texture.isEmpty(); }
}
```

- [ ] Step 8: Create `AnimationDef.java`

```java
package fr.eri.eriapi.anim;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Definition of a single named animation within an .erianim file.
 * Contains duration, end behavior settings, blend settings, group tracks, and timed events.
 */
public class AnimationDef {

    private final String name;
    private final int duration;           // total ticks
    private final EndBehavior endBehavior;
    private final int rollbackDuration;   // ticks for ROLLBACK end behavior
    private final int blendIn;            // ticks to blend in from previous pose
    private final int blendOut;           // ticks to blend out (before end)
    private final int loopCount;          // number of loops for LOOP_COUNT
    private final int loopPause;          // ticks between loops for LOOP_PAUSE
    private final Map<String, GroupTrack> tracks; // groupName -> GroupTrack
    private final List<AnimationEvent> events;    // sorted by tick

    public AnimationDef(String name, int duration, EndBehavior endBehavior,
                        int rollbackDuration, int blendIn, int blendOut,
                        int loopCount, int loopPause,
                        Map<String, GroupTrack> tracks,
                        List<AnimationEvent> events) {
        this.name = name;
        this.duration = duration;
        this.endBehavior = endBehavior;
        this.rollbackDuration = rollbackDuration;
        this.blendIn = blendIn;
        this.blendOut = blendOut;
        this.loopCount = loopCount;
        this.loopPause = loopPause;
        this.tracks = tracks != null ? tracks : Collections.<String, GroupTrack>emptyMap();
        this.events = events != null ? events : Collections.<AnimationEvent>emptyList();
    }

    public String getName() { return name; }
    public int getDuration() { return duration; }
    public EndBehavior getEndBehavior() { return endBehavior; }
    public int getRollbackDuration() { return rollbackDuration; }
    public int getBlendIn() { return blendIn; }
    public int getBlendOut() { return blendOut; }
    public int getLoopCount() { return loopCount; }
    public int getLoopPause() { return loopPause; }
    public Map<String, GroupTrack> getTracks() { return tracks; }
    public List<AnimationEvent> getEvents() { return events; }

    public GroupTrack getTrack(String groupName) {
        return tracks.get(groupName);
    }

    public boolean hasTrack(String groupName) {
        return tracks.containsKey(groupName);
    }
}
```

- [ ] Step 9: Create `AnimationFile.java`

```java
package fr.eri.eriapi.anim;

import java.util.Map;

/**
 * Root structure parsed from a .erianim JSON file.
 * Contains the format version, the associated model ID, and all animation definitions.
 */
public class AnimationFile {

    private final int formatVersion;
    private final String modelId;  // e.g. "eriniumfaction:block/lootbox"
    private final Map<String, AnimationDef> animations; // animName -> AnimationDef

    public AnimationFile(int formatVersion, String modelId, Map<String, AnimationDef> animations) {
        this.formatVersion = formatVersion;
        this.modelId = modelId;
        this.animations = animations;
    }

    public int getFormatVersion() { return formatVersion; }
    public String getModelId() { return modelId; }
    public Map<String, AnimationDef> getAnimations() { return animations; }

    public AnimationDef getAnimation(String name) {
        return animations.get(name);
    }

    public boolean hasAnimation(String name) {
        return animations.containsKey(name);
    }

    public int getAnimationCount() {
        return animations.size();
    }
}
```

- [ ] Step 10: Build and verify

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 2: Parser -- EriAnimParser and EriAnimCache

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\EriAnimParser.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\EriAnimCache.java`

**Files to modify:** None.

**Dependencies:** Task 1 (data structures), GSON (bundled with Minecraft).

- [ ] Step 1: Create `EriAnimParser.java`

```java
package fr.eri.eriapi.anim;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import fr.eri.eriapi.core.Reference;
import fr.eri.eriapi.gui.anim.Easing;
import net.minecraft.client.Minecraft;
import net.minecraft.util.ResourceLocation;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses .erianim JSON files into AnimationFile structures.
 * File location: assets/{domain}/animations/{path}.erianim.json
 *
 * The animId format is "domain:path" (e.g. "eriniumfaction:block/lootbox").
 * This resolves to: assets/eriniumfaction/animations/block/lootbox.erianim.json
 */
public class EriAnimParser {

    private static final Comparator<Keyframe> KEYFRAME_COMPARATOR = new Comparator<Keyframe>() {
        @Override
        public int compare(Keyframe a, Keyframe b) {
            return Integer.compare(a.getTick(), b.getTick());
        }
    };

    private static final Comparator<SpinKeyframe> SPIN_COMPARATOR = new Comparator<SpinKeyframe>() {
        @Override
        public int compare(SpinKeyframe a, SpinKeyframe b) {
            return Integer.compare(a.getTick(), b.getTick());
        }
    };

    private static final Comparator<TextureKeyframe> TEXTURE_COMPARATOR = new Comparator<TextureKeyframe>() {
        @Override
        public int compare(TextureKeyframe a, TextureKeyframe b) {
            return Integer.compare(a.getTick(), b.getTick());
        }
    };

    private static final Comparator<AnimationEvent> EVENT_COMPARATOR = new Comparator<AnimationEvent>() {
        @Override
        public int compare(AnimationEvent a, AnimationEvent b) {
            return Integer.compare(a.getTick(), b.getTick());
        }
    };

    /**
     * Parses an .erianim file from the resource pack.
     *
     * @param animId resource ID in the format "domain:path"
     *               e.g. "eriniumfaction:block/lootbox"
     *               resolves to assets/eriniumfaction/animations/block/lootbox.erianim.json
     * @return parsed AnimationFile, or null on failure
     */
    public static AnimationFile parse(String animId) {
        String domain;
        String path;
        int colonIdx = animId.indexOf(':');
        if (colonIdx >= 0) {
            domain = animId.substring(0, colonIdx);
            path = animId.substring(colonIdx + 1);
        } else {
            domain = "minecraft";
            path = animId;
        }

        ResourceLocation resLoc = new ResourceLocation(domain, "animations/" + path + ".erianim.json");

        try {
            InputStream is = Minecraft.getMinecraft().getResourceManager()
                    .getResource(resLoc).getInputStream();
            InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8);
            JsonParser jsonParser = new JsonParser();
            JsonObject root = jsonParser.parse(reader).getAsJsonObject();
            reader.close();

            return parseJson(animId, root);
        } catch (Exception e) {
            Reference.LOGGER.error("EriAPI - Failed to parse .erianim file: {}", animId, e);
            return null;
        }
    }

    /**
     * Parses an AnimationFile from an already-loaded JsonObject.
     */
    public static AnimationFile parseJson(String animId, JsonObject root) {
        int formatVersion = root.has("format_version") ? root.get("format_version").getAsInt() : 1;
        String modelId = root.has("model") ? root.get("model").getAsString() : "";

        Map<String, AnimationDef> animations = new HashMap<String, AnimationDef>();

        if (root.has("animations")) {
            JsonObject animsObj = root.getAsJsonObject("animations");
            for (Map.Entry<String, JsonElement> entry : animsObj.entrySet()) {
                String animName = entry.getKey();
                if (entry.getValue().isJsonObject()) {
                    AnimationDef def = parseAnimationDef(animName, entry.getValue().getAsJsonObject());
                    animations.put(animName, def);
                }
            }
        }

        Reference.LOGGER.info("EriAPI - Parsed .erianim: {} ({} animations, model={})",
                animId, animations.size(), modelId);

        return new AnimationFile(formatVersion, modelId, animations);
    }

    private static AnimationDef parseAnimationDef(String name, JsonObject obj) {
        int duration = obj.has("duration") ? obj.get("duration").getAsInt() : 20;
        EndBehavior endBehavior = obj.has("endBehavior")
                ? EndBehavior.fromString(obj.get("endBehavior").getAsString())
                : EndBehavior.FREEZE;
        int rollbackDuration = obj.has("rollbackDuration") ? obj.get("rollbackDuration").getAsInt() : 10;
        int blendIn = obj.has("blendIn") ? obj.get("blendIn").getAsInt() : 0;
        int blendOut = obj.has("blendOut") ? obj.get("blendOut").getAsInt() : 0;
        int loopCount = obj.has("loopCount") ? obj.get("loopCount").getAsInt() : 0;
        int loopPause = obj.has("loopPause") ? obj.get("loopPause").getAsInt() : 0;

        // Parse tracks
        Map<String, GroupTrack> tracks = new HashMap<String, GroupTrack>();
        if (obj.has("tracks")) {
            JsonObject tracksObj = obj.getAsJsonObject("tracks");
            for (Map.Entry<String, JsonElement> entry : tracksObj.entrySet()) {
                String groupName = entry.getKey();
                if (entry.getValue().isJsonObject()) {
                    GroupTrack track = parseGroupTrack(groupName, entry.getValue().getAsJsonObject());
                    tracks.put(groupName, track);
                }
            }
        }

        // Parse events
        List<AnimationEvent> events = new ArrayList<AnimationEvent>();
        if (obj.has("events")) {
            JsonArray eventsArr = obj.getAsJsonArray("events");
            for (int i = 0; i < eventsArr.size(); i++) {
                if (eventsArr.get(i).isJsonObject()) {
                    events.add(parseEvent(eventsArr.get(i).getAsJsonObject()));
                }
            }
            Collections.sort(events, EVENT_COMPARATOR);
        }

        return new AnimationDef(name, duration, endBehavior, rollbackDuration,
                blendIn, blendOut, loopCount, loopPause, tracks, events);
    }

    private static GroupTrack parseGroupTrack(String groupName, JsonObject obj) {
        List<Keyframe> rotation = obj.has("rotation")
                ? parseKeyframeList(obj.getAsJsonArray("rotation"))
                : null;
        List<Keyframe> translation = obj.has("translation")
                ? parseKeyframeList(obj.getAsJsonArray("translation"))
                : null;
        List<Keyframe> scale = obj.has("scale")
                ? parseKeyframeList(obj.getAsJsonArray("scale"))
                : null;
        List<Keyframe> visible = obj.has("visible")
                ? parseVisibleList(obj.getAsJsonArray("visible"))
                : null;
        List<SpinKeyframe> spin = obj.has("spin")
                ? parseSpinList(obj.getAsJsonArray("spin"))
                : null;
        List<TextureKeyframe> texture = obj.has("texture")
                ? parseTextureList(obj.getAsJsonArray("texture"))
                : null;

        return new GroupTrack(groupName, rotation, translation, scale, visible, spin, texture);
    }

    private static List<Keyframe> parseKeyframeList(JsonArray arr) {
        List<Keyframe> list = new ArrayList<Keyframe>(arr.size());
        for (int i = 0; i < arr.size(); i++) {
            if (arr.get(i).isJsonObject()) {
                list.add(parseKeyframe(arr.get(i).getAsJsonObject()));
            }
        }
        Collections.sort(list, KEYFRAME_COMPARATOR);
        return list;
    }

    private static Keyframe parseKeyframe(JsonObject obj) {
        int tick = obj.has("tick") ? obj.get("tick").getAsInt() : 0;
        float[] value = new float[]{0, 0, 0};
        if (obj.has("value")) {
            JsonArray valArr = obj.getAsJsonArray("value");
            value[0] = valArr.get(0).getAsFloat();
            value[1] = valArr.get(1).getAsFloat();
            value[2] = valArr.get(2).getAsFloat();
        }
        Easing easing = obj.has("easing")
                ? Keyframe.parseEasing(obj.get("easing").getAsString())
                : Easing.LINEAR;
        return new Keyframe(tick, value, easing);
    }

    private static List<Keyframe> parseVisibleList(JsonArray arr) {
        List<Keyframe> list = new ArrayList<Keyframe>(arr.size());
        for (int i = 0; i < arr.size(); i++) {
            if (arr.get(i).isJsonObject()) {
                JsonObject obj = arr.get(i).getAsJsonObject();
                int tick = obj.has("tick") ? obj.get("tick").getAsInt() : 0;
                boolean vis = !obj.has("value") || obj.get("value").getAsBoolean();
                // Encode boolean as float: 1.0 = visible, 0.0 = hidden
                float[] value = new float[]{vis ? 1.0f : 0.0f, 0, 0};
                list.add(new Keyframe(tick, value, Easing.LINEAR));
            }
        }
        Collections.sort(list, KEYFRAME_COMPARATOR);
        return list;
    }

    private static List<SpinKeyframe> parseSpinList(JsonArray arr) {
        List<SpinKeyframe> list = new ArrayList<SpinKeyframe>(arr.size());
        for (int i = 0; i < arr.size(); i++) {
            if (arr.get(i).isJsonObject()) {
                JsonObject obj = arr.get(i).getAsJsonObject();
                int tick = obj.has("tick") ? obj.get("tick").getAsInt() : 0;
                String axis = obj.has("axis") ? obj.get("axis").getAsString() : "y";
                float speed = obj.has("speed") ? obj.get("speed").getAsFloat() : 0;
                Easing easing = obj.has("easing")
                        ? Keyframe.parseEasing(obj.get("easing").getAsString())
                        : Easing.LINEAR;
                list.add(new SpinKeyframe(tick, axis, speed, easing));
            }
        }
        Collections.sort(list, SPIN_COMPARATOR);
        return list;
    }

    private static List<TextureKeyframe> parseTextureList(JsonArray arr) {
        List<TextureKeyframe> list = new ArrayList<TextureKeyframe>(arr.size());
        for (int i = 0; i < arr.size(); i++) {
            if (arr.get(i).isJsonObject()) {
                JsonObject obj = arr.get(i).getAsJsonObject();
                int tick = obj.has("tick") ? obj.get("tick").getAsInt() : 0;
                String target = obj.has("target") ? obj.get("target").getAsString() : "";
                String value = obj.has("value") ? obj.get("value").getAsString() : "";
                list.add(new TextureKeyframe(tick, target, value));
            }
        }
        Collections.sort(list, TEXTURE_COMPARATOR);
        return list;
    }

    private static AnimationEvent parseEvent(JsonObject obj) {
        int tick = obj.has("tick") ? obj.get("tick").getAsInt() : 0;
        AnimationEvent.EventType type = obj.has("type")
                ? AnimationEvent.EventType.fromString(obj.get("type").getAsString())
                : AnimationEvent.EventType.CALLBACK;
        String value = obj.has("value") ? obj.get("value").getAsString() : "";
        float volume = obj.has("volume") ? obj.get("volume").getAsFloat() : 1.0f;
        float pitch = obj.has("pitch") ? obj.get("pitch").getAsFloat() : 1.0f;
        int count = obj.has("count") ? obj.get("count").getAsInt() : 1;
        float spread = obj.has("spread") ? obj.get("spread").getAsFloat() : 0.5f;

        return new AnimationEvent(tick, type, value, volume, pitch, count, spread);
    }
}
```

- [ ] Step 2: Create `EriAnimCache.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.core.Reference;

import java.util.HashMap;
import java.util.Map;

/**
 * Singleton cache for parsed .erianim files.
 * Render thread only -- no synchronization needed.
 *
 * Usage:
 *   AnimationFile animFile = EriAnimCache.get("eriniumfaction:block/lootbox");
 *   AnimationDef openAnim = animFile.getAnimation("open");
 */
public class EriAnimCache {

    private static final Map<String, AnimationFile> cache = new HashMap<String, AnimationFile>();

    private EriAnimCache() {}

    /**
     * Gets or parses an animation file. Returns null if parsing fails.
     *
     * @param animId resource ID in "domain:path" format
     */
    public static AnimationFile get(String animId) {
        AnimationFile file = cache.get(animId);
        if (file != null) return file;

        file = EriAnimParser.parse(animId);
        if (file != null) {
            cache.put(animId, file);
            Reference.LOGGER.info("EriAPI - Cached animation file: {} ({} animations)",
                    animId, file.getAnimationCount());
        } else {
            Reference.LOGGER.warn("EriAPI - Failed to cache animation file: {}", animId);
        }
        return file;
    }

    /**
     * Gets an animation file only if already cached. Does NOT trigger parsing.
     */
    public static AnimationFile getCached(String animId) {
        return cache.get(animId);
    }

    public static boolean has(String animId) { return cache.containsKey(animId); }

    public static void clear() {
        int size = cache.size();
        cache.clear();
        if (size > 0) Reference.LOGGER.info("EriAPI - Cleared {} cached animation files", size);
    }

    public static void invalidate(String animId) { cache.remove(animId); }

    public static int size() { return cache.size(); }
}
```

- [ ] Step 3: Build and verify

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 3: Keyframe Interpolation -- AnimationPose and AnimationController

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimationPose.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimationController.java`

**Files to modify:** None.

**Dependencies:** Task 1, Task 2.

- [ ] Step 1: Create `AnimationPose.java`

```java
package fr.eri.eriapi.anim;

import java.util.HashMap;
import java.util.Map;

/**
 * The result of interpolating an animation at a specific point in time.
 * Contains per-group transforms (rotation, translation, scale), visibility, and texture overrides.
 *
 * This is a mutable snapshot -- the AnimationController reuses and updates it each frame
 * to avoid allocations in the render hot path.
 */
public class AnimationPose {

    /**
     * Per-group transform data. Keyed by group name.
     */
    public static class GroupPose {
        public final float[] rotation = new float[]{0, 0, 0};
        public final float[] translation = new float[]{0, 0, 0};
        public final float[] scale = new float[]{1, 1, 1};
        public boolean visible = true;

        public void reset() {
            rotation[0] = 0; rotation[1] = 0; rotation[2] = 0;
            translation[0] = 0; translation[1] = 0; translation[2] = 0;
            scale[0] = 1; scale[1] = 1; scale[2] = 1;
            visible = true;
        }

        /**
         * Linearly interpolates this pose toward 'target' by factor t.
         * Modifies this pose in place.
         */
        public void lerpToward(GroupPose target, float t) {
            for (int i = 0; i < 3; i++) {
                rotation[i] = rotation[i] + (target.rotation[i] - rotation[i]) * t;
                translation[i] = translation[i] + (target.translation[i] - translation[i]) * t;
                scale[i] = scale[i] + (target.scale[i] - scale[i]) * t;
            }
            // Visibility snaps at t >= 0.5
            if (t >= 0.5f) {
                visible = target.visible;
            }
        }
    }

    private final Map<String, GroupPose> groups = new HashMap<String, GroupPose>();
    private final Map<String, String> textureOverrides = new HashMap<String, String>();

    /**
     * Gets or creates the GroupPose for the named group.
     */
    public GroupPose getOrCreate(String groupName) {
        GroupPose pose = groups.get(groupName);
        if (pose == null) {
            pose = new GroupPose();
            groups.put(groupName, pose);
        }
        return pose;
    }

    /**
     * Gets the GroupPose for the named group, or null if not present.
     */
    public GroupPose get(String groupName) {
        return groups.get(groupName);
    }

    public float[] getRotation(String groupName) {
        GroupPose p = groups.get(groupName);
        return p != null ? p.rotation : null;
    }

    public float[] getTranslation(String groupName) {
        GroupPose p = groups.get(groupName);
        return p != null ? p.translation : null;
    }

    public float[] getScale(String groupName) {
        GroupPose p = groups.get(groupName);
        return p != null ? p.scale : null;
    }

    public boolean isGroupVisible(String groupName) {
        GroupPose p = groups.get(groupName);
        return p == null || p.visible;
    }

    public Map<String, String> getTextureOverrides() {
        return textureOverrides;
    }

    public void setTextureOverride(String target, String value) {
        textureOverrides.put(target, value);
    }

    public void clearTextureOverrides() {
        textureOverrides.clear();
    }

    /**
     * Resets all group poses to identity and clears texture overrides.
     */
    public void reset() {
        for (GroupPose pose : groups.values()) {
            pose.reset();
        }
        textureOverrides.clear();
    }

    /**
     * Copies all data from another pose into this one.
     */
    public void copyFrom(AnimationPose other) {
        for (Map.Entry<String, GroupPose> entry : other.groups.entrySet()) {
            GroupPose src = entry.getValue();
            GroupPose dst = getOrCreate(entry.getKey());
            System.arraycopy(src.rotation, 0, dst.rotation, 0, 3);
            System.arraycopy(src.translation, 0, dst.translation, 0, 3);
            System.arraycopy(src.scale, 0, dst.scale, 0, 3);
            dst.visible = src.visible;
        }
        textureOverrides.clear();
        textureOverrides.putAll(other.textureOverrides);
    }

    /**
     * Linearly interpolates all groups in this pose toward the target pose by factor t.
     * Groups present in target but not in this are created first (identity).
     * Modifies this pose in place.
     */
    public void lerpToward(AnimationPose target, float t) {
        for (Map.Entry<String, GroupPose> entry : target.groups.entrySet()) {
            GroupPose dst = getOrCreate(entry.getKey());
            dst.lerpToward(entry.getValue(), t);
        }
        // Texture overrides snap at t >= 0.5
        if (t >= 0.5f) {
            textureOverrides.clear();
            textureOverrides.putAll(target.textureOverrides);
        }
    }

    public Map<String, GroupPose> getGroups() {
        return groups;
    }
}
```

- [ ] Step 2: Create `AnimationController.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.gui.anim.Easing;

import java.util.List;
import java.util.Map;

/**
 * Client-side animation controller that computes interpolated poses.
 *
 * This is NOT a TileEntity -- it is a lightweight client-only object that takes
 * the synced animation state from the TE and produces an AnimationPose each frame.
 *
 * The controller handles:
 * - Keyframe interpolation with easing for rotation/translation/scale
 * - Spin track accumulation (continuous rotation)
 * - Instantaneous visible/texture keyframes (no interpolation)
 * - Rollback (reverse playback)
 * - Blend between a saved pose and the current animation
 * - Loop pause gaps
 *
 * Usage (in TESR):
 *   AnimationPose pose = controller.computePose(animDef, animState, animTickFloat, blendPose, blendProgress);
 *   // apply pose transforms to each group during rendering
 */
public class AnimationController {

    // Reusable pose to avoid allocations -- one per controller instance
    private final AnimationPose currentPose = new AnimationPose();

    // Accumulated spin angles per group per axis [groupName -> [rx, ry, rz]]
    // Spin accumulation tracks total rotation from spin keyframes.
    // This is recalculated each frame from tick 0 to current tick to stay deterministic.
    // For long animations with spin, this could be optimized with caching,
    // but for typical animation lengths (< 200 ticks) this is fast enough.

    /**
     * Computes the interpolated pose for the given animation at the given time.
     *
     * @param animDef       the animation definition
     * @param state         current animation state (PLAYING, ROLLING_BACK, etc.)
     * @param tickFloat     current animation tick with partial ticks (e.g. 12.5)
     *                      For ROLLING_BACK: this is the rollback tick (0 = start of rollback, rollbackDuration = end)
     * @param duration      total animation duration in ticks
     * @param rollbackDuration rollback duration in ticks (only used when state = ROLLING_BACK)
     * @param blendPose     the saved pose to blend FROM (null if no blend active)
     * @param blendProgress blend progress 0.0 to 1.0 (0 = full blendPose, 1 = full current anim)
     * @return the computed pose (reused internal instance -- do NOT hold a reference across frames)
     */
    public AnimationPose computePose(AnimationDef animDef, AnimState state,
                                     float tickFloat, int duration, int rollbackDuration,
                                     AnimationPose blendPose, float blendProgress) {
        currentPose.reset();

        if (animDef == null || state == AnimState.IDLE) {
            return currentPose;
        }

        // Determine the effective animation tick
        float effectiveTick;
        if (state == AnimState.ROLLING_BACK) {
            // Rollback: map rollback progress to animation time in reverse
            // tickFloat here is the rollback elapsed time (0..rollbackDuration)
            float rollbackProgress = Math.min(tickFloat / (float) Math.max(rollbackDuration, 1), 1.0f);
            effectiveTick = duration * (1.0f - rollbackProgress);
        } else if (state == AnimState.FROZEN || state == AnimState.WAITING_SERVER) {
            effectiveTick = duration;
        } else if (state == AnimState.PAUSED) {
            effectiveTick = tickFloat; // paused at a specific tick
        } else {
            // PLAYING
            effectiveTick = tickFloat;
        }

        // Clamp
        effectiveTick = Math.max(0, Math.min(effectiveTick, duration));

        // Interpolate each group track
        for (Map.Entry<String, GroupTrack> entry : animDef.getTracks().entrySet()) {
            String groupName = entry.getKey();
            GroupTrack track = entry.getValue();
            AnimationPose.GroupPose groupPose = currentPose.getOrCreate(groupName);

            // Rotation
            if (track.hasRotation()) {
                interpolateKeyframes(track.getRotation(), effectiveTick, groupPose.rotation);
            }

            // Translation
            if (track.hasTranslation()) {
                interpolateKeyframes(track.getTranslation(), effectiveTick, groupPose.translation);
            }

            // Scale
            if (track.hasScale()) {
                interpolateKeyframes(track.getScale(), effectiveTick, groupPose.scale);
            } else {
                groupPose.scale[0] = 1; groupPose.scale[1] = 1; groupPose.scale[2] = 1;
            }

            // Visible (instantaneous -- use last keyframe at or before current tick)
            if (track.hasVisible()) {
                groupPose.visible = getVisibleAtTick(track.getVisible(), effectiveTick);
            }

            // Spin (accumulate rotation)
            if (track.hasSpin()) {
                accumulateSpin(track.getSpin(), effectiveTick, groupPose.rotation);
            }

            // Texture (instantaneous -- apply last texture keyframe at or before current tick)
            if (track.hasTexture()) {
                applyTextureAtTick(track.getTexture(), effectiveTick, currentPose);
            }
        }

        // Apply blend if active
        if (blendPose != null && blendProgress < 1.0f) {
            // blendProgress goes from 0 (full old pose) to 1 (full new animation)
            // We want: result = lerp(blendPose, currentPose, blendProgress)
            // Since lerpToward modifies in place: copy current to temp, copy blendPose to current, lerp toward temp
            // To avoid extra allocation, we do it differently:
            // For each group in currentPose, lerp from blendPose toward currentPose
            for (Map.Entry<String, AnimationPose.GroupPose> entry : currentPose.getGroups().entrySet()) {
                String groupName = entry.getKey();
                AnimationPose.GroupPose animGroupPose = entry.getValue();
                AnimationPose.GroupPose blendGroupPose = blendPose.get(groupName);

                if (blendGroupPose != null) {
                    // Interpolate: result = blendGroup + (animGroup - blendGroup) * progress
                    for (int i = 0; i < 3; i++) {
                        animGroupPose.rotation[i] = blendGroupPose.rotation[i]
                                + (animGroupPose.rotation[i] - blendGroupPose.rotation[i]) * blendProgress;
                        animGroupPose.translation[i] = blendGroupPose.translation[i]
                                + (animGroupPose.translation[i] - blendGroupPose.translation[i]) * blendProgress;
                        animGroupPose.scale[i] = blendGroupPose.scale[i]
                                + (animGroupPose.scale[i] - blendGroupPose.scale[i]) * blendProgress;
                    }
                    if (blendProgress < 0.5f) {
                        animGroupPose.visible = blendGroupPose.visible;
                    }
                }
            }
        }

        return currentPose;
    }

    /**
     * Interpolates between keyframes at the given tick, writing the result into 'out'.
     * Uses the easing function of the NEXT keyframe (the one being interpolated toward).
     */
    private void interpolateKeyframes(List<Keyframe> keyframes, float tick, float[] out) {
        int size = keyframes.size();
        if (size == 0) return;

        // Before first keyframe -- use first value
        Keyframe first = keyframes.get(0);
        if (tick <= first.getTick()) {
            float[] v = first.getValue();
            out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
            return;
        }

        // After last keyframe -- use last value
        Keyframe last = keyframes.get(size - 1);
        if (tick >= last.getTick()) {
            float[] v = last.getValue();
            out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
            return;
        }

        // Find the two keyframes surrounding the tick
        for (int i = 0; i < size - 1; i++) {
            Keyframe kfA = keyframes.get(i);
            Keyframe kfB = keyframes.get(i + 1);

            if (tick >= kfA.getTick() && tick <= kfB.getTick()) {
                float span = kfB.getTick() - kfA.getTick();
                float localT = (span > 0) ? (tick - kfA.getTick()) / span : 1.0f;

                // Apply easing from the target keyframe (kfB)
                float easedT = kfB.getEasing().apply(localT);

                float[] vA = kfA.getValue();
                float[] vB = kfB.getValue();
                out[0] = vA[0] + (vB[0] - vA[0]) * easedT;
                out[1] = vA[1] + (vB[1] - vA[1]) * easedT;
                out[2] = vA[2] + (vB[2] - vA[2]) * easedT;
                return;
            }
        }

        // Fallback -- should not reach here if keyframes are sorted
        float[] v = last.getValue();
        out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
    }

    /**
     * Returns the visibility state at the given tick.
     * Visibility is instantaneous: uses the last keyframe at or before the tick.
     */
    private boolean getVisibleAtTick(List<Keyframe> visibleKeyframes, float tick) {
        boolean visible = true;
        for (int i = 0; i < visibleKeyframes.size(); i++) {
            Keyframe kf = visibleKeyframes.get(i);
            if (kf.getTick() <= tick) {
                visible = kf.getValue()[0] > 0.5f;
            } else {
                break; // sorted by tick, no need to continue
            }
        }
        return visible;
    }

    /**
     * Accumulates spin rotation into the rotation array.
     * Spin is a continuous rotation: between two SpinKeyframes, the speed is interpolated
     * with easing, and the total accumulated angle is added to the rotation.
     *
     * For determinism, this integrates from tick 0 to the current tick every frame.
     * This is acceptable for typical animation durations (< 200 ticks, < 10 spin keyframes).
     */
    private void accumulateSpin(List<SpinKeyframe> spinKeyframes, float tick, float[] rotation) {
        if (spinKeyframes.isEmpty()) return;

        float totalAngle = 0;
        int axisIndex = spinKeyframes.get(0).getAxisIndex();

        // Integrate speed over time from tick 0 to current tick
        // For each tick interval between spin keyframes, compute the interpolated speed
        // and accumulate the angle.
        for (int i = 0; i < spinKeyframes.size(); i++) {
            SpinKeyframe current = spinKeyframes.get(i);
            float segmentStart = current.getTick();
            float segmentEnd;
            float startSpeed = current.getSpeed();
            float endSpeed;
            Easing easing;

            if (segmentStart >= tick) break;

            if (i + 1 < spinKeyframes.size()) {
                SpinKeyframe next = spinKeyframes.get(i + 1);
                segmentEnd = Math.min(next.getTick(), tick);
                endSpeed = next.getSpeed();
                easing = next.getEasing();
                axisIndex = current.getAxisIndex();
            } else {
                // After last keyframe: constant speed until tick
                segmentEnd = tick;
                endSpeed = startSpeed;
                easing = Easing.LINEAR;
            }

            float segmentDuration = segmentEnd - segmentStart;
            if (segmentDuration <= 0) continue;

            // For LINEAR easing, the integral of lerp(a, b, t) from 0 to 1 is (a+b)/2
            // For non-linear easing, approximate with midpoint sampling
            if (easing == Easing.LINEAR) {
                // Average speed * duration
                float avgSpeed = (startSpeed + endSpeed) * 0.5f;
                totalAngle += avgSpeed * segmentDuration;
            } else {
                // Sample at 4 points for a reasonable approximation
                float sum = 0;
                int samples = 4;
                float dt = segmentDuration / samples;
                for (int s = 0; s < samples; s++) {
                    float sampleT = (s + 0.5f) / samples; // midpoint of each sub-interval
                    float easedT = easing.apply(sampleT);
                    float speed = startSpeed + (endSpeed - startSpeed) * easedT;
                    sum += speed * dt;
                }
                totalAngle += sum;
            }
        }

        rotation[axisIndex] += totalAngle;
    }

    /**
     * Applies texture overrides from texture keyframes at or before the given tick.
     */
    private void applyTextureAtTick(List<TextureKeyframe> textureKeyframes, float tick, AnimationPose pose) {
        for (int i = 0; i < textureKeyframes.size(); i++) {
            TextureKeyframe kf = textureKeyframes.get(i);
            if (kf.getTick() <= tick) {
                pose.setTextureOverride(kf.getTarget(), kf.getValue());
            } else {
                break; // sorted by tick
            }
        }
    }
}
```

- [ ] Step 3: Build and verify

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 4: Network Packets -- AnimPlayPacket, AnimResetPacket, AnimPausePacket, AnimNetworkHandler

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimPlayPacket.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimResetPacket.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimPausePacket.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimNetworkHandler.java`

**Files to modify:** `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\EriAPI.java` (add AnimNetworkHandler.init() call in preInit).

**Dependencies:** Task 1 (EndBehavior enum).

- [ ] Step 1: Create `AnimPlayPacket.java`

```java
package fr.eri.eriapi.anim;

import io.netty.buffer.ByteBuf;
import net.minecraft.client.Minecraft;
import net.minecraft.tileentity.TileEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraftforge.fml.common.network.ByteBufUtils;
import net.minecraftforge.fml.common.network.simpleimpl.IMessage;
import net.minecraftforge.fml.common.network.simpleimpl.IMessageHandler;
import net.minecraftforge.fml.common.network.simpleimpl.MessageContext;
import net.minecraftforge.fml.relauncher.Side;
import net.minecraftforge.fml.relauncher.SideOnly;

/**
 * Packet sent from server to client to start an animation on an AnimatedBlockTileEntity.
 * Contains the block position, animation name, the world tick when the animation started,
 * and an optional end behavior override.
 */
public class AnimPlayPacket implements IMessage {

    private BlockPos pos;
    private String animationName;
    private long startWorldTick;
    private String endBehaviorOverride; // empty string = use animation default

    public AnimPlayPacket() {}

    public AnimPlayPacket(BlockPos pos, String animationName, long startWorldTick, String endBehaviorOverride) {
        this.pos = pos;
        this.animationName = animationName;
        this.startWorldTick = startWorldTick;
        this.endBehaviorOverride = endBehaviorOverride != null ? endBehaviorOverride : "";
    }

    @Override
    public void fromBytes(ByteBuf buf) {
        this.pos = BlockPos.fromLong(buf.readLong());
        this.animationName = ByteBufUtils.readUTF8String(buf);
        this.startWorldTick = buf.readLong();
        this.endBehaviorOverride = ByteBufUtils.readUTF8String(buf);
    }

    @Override
    public void toBytes(ByteBuf buf) {
        buf.writeLong(pos.toLong());
        ByteBufUtils.writeUTF8String(buf, animationName);
        buf.writeLong(startWorldTick);
        ByteBufUtils.writeUTF8String(buf, endBehaviorOverride);
    }

    public static class Handler implements IMessageHandler<AnimPlayPacket, IMessage> {
        @Override
        @SideOnly(Side.CLIENT)
        public IMessage onMessage(AnimPlayPacket message, MessageContext ctx) {
            Minecraft.getMinecraft().addScheduledTask(() -> {
                World world = Minecraft.getMinecraft().world;
                if (world == null) return;
                TileEntity te = world.getTileEntity(message.pos);
                if (te instanceof AnimatedBlockTileEntity) {
                    AnimatedBlockTileEntity animTe = (AnimatedBlockTileEntity) te;
                    EndBehavior override = null;
                    if (!message.endBehaviorOverride.isEmpty()) {
                        override = EndBehavior.fromString(message.endBehaviorOverride);
                    }
                    animTe.onAnimPlayReceived(message.animationName, message.startWorldTick, override);
                }
            });
            return null;
        }
    }
}
```

- [ ] Step 2: Create `AnimResetPacket.java`

```java
package fr.eri.eriapi.anim;

import io.netty.buffer.ByteBuf;
import net.minecraft.client.Minecraft;
import net.minecraft.tileentity.TileEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraftforge.fml.common.network.simpleimpl.IMessage;
import net.minecraftforge.fml.common.network.simpleimpl.IMessageHandler;
import net.minecraftforge.fml.common.network.simpleimpl.MessageContext;
import net.minecraftforge.fml.relauncher.Side;
import net.minecraftforge.fml.relauncher.SideOnly;

/**
 * Packet sent from server to client to reset an animation on an AnimatedBlockTileEntity.
 * If instant is true, snaps to idle immediately. Otherwise, triggers rollback if applicable.
 */
public class AnimResetPacket implements IMessage {

    private BlockPos pos;
    private boolean instant;

    public AnimResetPacket() {}

    public AnimResetPacket(BlockPos pos, boolean instant) {
        this.pos = pos;
        this.instant = instant;
    }

    @Override
    public void fromBytes(ByteBuf buf) {
        this.pos = BlockPos.fromLong(buf.readLong());
        this.instant = buf.readBoolean();
    }

    @Override
    public void toBytes(ByteBuf buf) {
        buf.writeLong(pos.toLong());
        buf.writeBoolean(instant);
    }

    public static class Handler implements IMessageHandler<AnimResetPacket, IMessage> {
        @Override
        @SideOnly(Side.CLIENT)
        public IMessage onMessage(AnimResetPacket message, MessageContext ctx) {
            Minecraft.getMinecraft().addScheduledTask(() -> {
                World world = Minecraft.getMinecraft().world;
                if (world == null) return;
                TileEntity te = world.getTileEntity(message.pos);
                if (te instanceof AnimatedBlockTileEntity) {
                    ((AnimatedBlockTileEntity) te).onAnimResetReceived(message.instant);
                }
            });
            return null;
        }
    }
}
```

- [ ] Step 3: Create `AnimPausePacket.java`

```java
package fr.eri.eriapi.anim;

import io.netty.buffer.ByteBuf;
import net.minecraft.client.Minecraft;
import net.minecraft.tileentity.TileEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import net.minecraftforge.fml.common.network.simpleimpl.IMessage;
import net.minecraftforge.fml.common.network.simpleimpl.IMessageHandler;
import net.minecraftforge.fml.common.network.simpleimpl.MessageContext;
import net.minecraftforge.fml.relauncher.Side;
import net.minecraftforge.fml.relauncher.SideOnly;

/**
 * Packet sent from server to client to pause or resume an animation.
 * When pausing, resumeTick stores the animation tick to freeze at.
 * When resuming (pause=false), resumeTick stores the world tick to resume from.
 */
public class AnimPausePacket implements IMessage {

    private BlockPos pos;
    private boolean pause; // true = pause, false = resume
    private long resumeTick;

    public AnimPausePacket() {}

    public AnimPausePacket(BlockPos pos, boolean pause, long resumeTick) {
        this.pos = pos;
        this.pause = pause;
        this.resumeTick = resumeTick;
    }

    @Override
    public void fromBytes(ByteBuf buf) {
        this.pos = BlockPos.fromLong(buf.readLong());
        this.pause = buf.readBoolean();
        this.resumeTick = buf.readLong();
    }

    @Override
    public void toBytes(ByteBuf buf) {
        buf.writeLong(pos.toLong());
        buf.writeBoolean(pause);
        buf.writeLong(resumeTick);
    }

    public static class Handler implements IMessageHandler<AnimPausePacket, IMessage> {
        @Override
        @SideOnly(Side.CLIENT)
        public IMessage onMessage(AnimPausePacket message, MessageContext ctx) {
            Minecraft.getMinecraft().addScheduledTask(() -> {
                World world = Minecraft.getMinecraft().world;
                if (world == null) return;
                TileEntity te = world.getTileEntity(message.pos);
                if (te instanceof AnimatedBlockTileEntity) {
                    AnimatedBlockTileEntity animTe = (AnimatedBlockTileEntity) te;
                    if (message.pause) {
                        animTe.onAnimPauseReceived(message.resumeTick);
                    } else {
                        animTe.onAnimResumeReceived(message.resumeTick);
                    }
                }
            });
            return null;
        }
    }
}
```

- [ ] Step 4: Create `AnimNetworkHandler.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.core.Reference;
import net.minecraft.entity.player.EntityPlayerMP;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.WorldServer;
import net.minecraftforge.fml.common.network.NetworkRegistry;
import net.minecraftforge.fml.common.network.simpleimpl.SimpleNetworkWrapper;
import net.minecraftforge.fml.relauncher.Side;

/**
 * Network handler for animation sync packets.
 * Uses a dedicated SimpleNetworkWrapper channel separate from the GUI network.
 *
 * Call AnimNetworkHandler.init() during FMLPreInitializationEvent (handled by EriAPI main class).
 */
public class AnimNetworkHandler {

    private static SimpleNetworkWrapper INSTANCE;
    private static int discriminator = 0;

    private AnimNetworkHandler() {}

    /**
     * Registers all animation packets. Must be called once during preInit.
     */
    public static void init() {
        INSTANCE = NetworkRegistry.INSTANCE.newSimpleChannel(Reference.MODID + "_anim");

        INSTANCE.registerMessage(
                AnimPlayPacket.Handler.class,
                AnimPlayPacket.class,
                discriminator++,
                Side.CLIENT
        );

        INSTANCE.registerMessage(
                AnimResetPacket.Handler.class,
                AnimResetPacket.class,
                discriminator++,
                Side.CLIENT
        );

        INSTANCE.registerMessage(
                AnimPausePacket.Handler.class,
                AnimPausePacket.class,
                discriminator++,
                Side.CLIENT
        );

        Reference.LOGGER.info("EriAPI Anim Network -- {} packets registered", discriminator);
    }

    /**
     * Sends an animation play packet to all players tracking the given block position.
     *
     * @param world         the server world
     * @param pos           block position of the animated TE
     * @param animationName name of the animation to play
     * @param startWorldTick the world tick at which the animation started
     * @param endBehaviorOverride optional override, or null to use animation default
     */
    public static void sendPlay(WorldServer world, BlockPos pos, String animationName,
                                long startWorldTick, EndBehavior endBehaviorOverride) {
        if (INSTANCE == null) return;
        String override = endBehaviorOverride != null ? endBehaviorOverride.name().toLowerCase() : "";
        INSTANCE.sendToAllTracking(
                new AnimPlayPacket(pos, animationName, startWorldTick, override),
                new NetworkRegistry.TargetPoint(
                        world.provider.getDimension(),
                        pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 0)
        );
    }

    /**
     * Sends an animation play packet to a specific player.
     */
    public static void sendPlayTo(EntityPlayerMP player, BlockPos pos, String animationName,
                                  long startWorldTick, EndBehavior endBehaviorOverride) {
        if (INSTANCE == null) return;
        String override = endBehaviorOverride != null ? endBehaviorOverride.name().toLowerCase() : "";
        INSTANCE.sendTo(new AnimPlayPacket(pos, animationName, startWorldTick, override), player);
    }

    /**
     * Sends an animation reset packet to all players tracking the given block position.
     */
    public static void sendReset(WorldServer world, BlockPos pos, boolean instant) {
        if (INSTANCE == null) return;
        INSTANCE.sendToAllTracking(
                new AnimResetPacket(pos, instant),
                new NetworkRegistry.TargetPoint(
                        world.provider.getDimension(),
                        pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 0)
        );
    }

    /**
     * Sends an animation pause packet to all players tracking the given block position.
     *
     * @param pause     true to pause, false to resume
     * @param tickValue when pausing: the animation tick to freeze at.
     *                  when resuming: the world tick to resume from.
     */
    public static void sendPause(WorldServer world, BlockPos pos, boolean pause, long tickValue) {
        if (INSTANCE == null) return;
        INSTANCE.sendToAllTracking(
                new AnimPausePacket(pos, pause, tickValue),
                new NetworkRegistry.TargetPoint(
                        world.provider.getDimension(),
                        pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 0)
        );
    }

    /**
     * Returns true if the network handler has been initialized.
     */
    public static boolean isInitialized() {
        return INSTANCE != null;
    }
}
```

- [ ] Step 5: Modify `EriAPI.java` -- add AnimNetworkHandler.init() in preInit

Add the import and init call. Insert `AnimNetworkHandler.init();` right after `ToastNetwork.init();` in the `preInit` method.

```java
// Add import at the top:
import fr.eri.eriapi.anim.AnimNetworkHandler;

// In preInit(), after ToastNetwork.init():
AnimNetworkHandler.init();
```

The preInit method should look like:

```java
@EventHandler
public void preInit(FMLPreInitializationEvent event) {
    Reference.LOGGER.info("EriAPI - PreInit");
    GuiNetworkHandler.init(Reference.MODID);
    ToastNetwork.init();
    AnimNetworkHandler.init();
    MinecraftForge.EVENT_BUS.register(CommandTickHandler.INSTANCE);
    ConfigParser.register(ExampleConfig.class, event.getModConfigurationDirectory());
    ConfigSyncHandler.init();
    proxy.preInit();
}
```

- [ ] Step 6: Build and verify

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 5: Extended AnimatedBlockTileEntity -- State Machine, ITickable, Callbacks, Events

**Files to create:** None.

**Files to modify:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTileEntity.java`

**Dependencies:** Tasks 1-4.

- [ ] Step 1: Rewrite `AnimatedBlockTileEntity.java` with full animation state machine

Replace the entire file with:

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.core.Reference;
import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.network.NetworkManager;
import net.minecraft.network.play.server.SPacketUpdateTileEntity;
import net.minecraft.tileentity.TileEntity;
import net.minecraft.util.ITickable;
import net.minecraft.util.SoundCategory;
import net.minecraft.util.SoundEvent;
import net.minecraft.util.ResourceLocation;
import net.minecraft.util.math.AxisAlignedBB;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.WorldServer;
import net.minecraftforge.fml.relauncher.Side;
import net.minecraftforge.fml.relauncher.SideOnly;

import javax.annotation.Nullable;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * TileEntity for blocks rendered with Blockbench models and animated via .erianim files.
 *
 * <p><b>Server-side API:</b>
 * <pre>
 *   AnimatedBlockTileEntity te = (AnimatedBlockTileEntity) world.getTileEntity(pos);
 *   te.playAnimation("open");                      // play with default end behavior
 *   te.playAnimation("open", EndBehavior.LOOP);     // play with override
 *   te.pauseAnimation();
 *   te.resumeAnimation();
 *   te.resetAnimation();                            // rollback or instant reset
 *   te.resetAnimationInstant();                     // always instant
 *   te.setTexture("side_core", "side_core_active"); // runtime texture swap
 *   te.clearTexture("side_core");
 *   te.clearAllTextures();
 * </pre>
 *
 * <p><b>Callbacks:</b> Override these methods in subclasses:
 * <pre>
 *   protected void onAnimationEvent(AnimationEvent event) {}
 *   protected void onAnimationComplete(String animName) {}
 *   protected void onAnimationCallback(String callbackName) {}
 * </pre>
 *
 * <p>Implements ITickable but returns immediately when in IDLE/FROZEN/PAUSED/WAITING_SERVER
 * states to avoid unnecessary overhead with 500-1000 players.
 */
public class AnimatedBlockTileEntity extends TileEntity implements ITickable {

    // -- Model --
    private String modelId = "";
    private double maxRenderDistance = 64.0;

    // -- Animation state (synced via packets, NOT NBT for live state) --
    private String animFileId = "";         // resource ID for the .erianim file
    private String currentAnimName = "";    // name of the currently loaded animation
    private AnimState animState = AnimState.IDLE;
    private long animStartWorldTick = 0;    // world tick when the animation started
    private long pausedAtAnimTick = 0;      // animation tick where we paused
    private int lastCheckedEventTick = -1;  // last animation tick where events were checked
    private int currentLoopIteration = 0;   // for LOOP_COUNT tracking
    private long loopPauseEndTick = 0;      // world tick when a loop pause ends
    private EndBehavior endBehaviorOverride = null; // null = use animation default

    // -- Rollback state --
    private long rollbackStartWorldTick = 0;

    // -- Texture overrides (synced via NBT) --
    private final Map<String, String> textureOverrides = new HashMap<String, String>();

    // -- Client-side only: blend support --
    @SideOnly(Side.CLIENT)
    private AnimationPose blendFromPose;
    @SideOnly(Side.CLIENT)
    private long blendStartWorldTick;
    @SideOnly(Side.CLIENT)
    private int blendDuration;

    // -- Client-side only: controller --
    @SideOnly(Side.CLIENT)
    private AnimationController controller;

    public AnimatedBlockTileEntity() {}

    public AnimatedBlockTileEntity(String modelId) {
        this.modelId = modelId;
    }

    public AnimatedBlockTileEntity(String modelId, String animFileId) {
        this.modelId = modelId;
        this.animFileId = animFileId;
    }

    // =========================================================================
    // Model / render config
    // =========================================================================

    public String getModelId() { return modelId; }

    public void setModelId(String modelId) {
        this.modelId = modelId;
        markDirty();
    }

    public String getAnimFileId() { return animFileId; }

    public void setAnimFileId(String animFileId) {
        this.animFileId = animFileId;
        markDirty();
    }

    public void setMaxRenderDistance(double distance) {
        this.maxRenderDistance = distance;
    }

    @Override
    @SideOnly(Side.CLIENT)
    public double getMaxRenderDistanceSquared() {
        return maxRenderDistance * maxRenderDistance;
    }

    @Override
    @SideOnly(Side.CLIENT)
    public AxisAlignedBB getRenderBoundingBox() {
        return new AxisAlignedBB(
                pos.getX() - 1.0, pos.getY() - 1.0, pos.getZ() - 1.0,
                pos.getX() + 2.0, pos.getY() + 2.0, pos.getZ() + 2.0);
    }

    // =========================================================================
    // Animation state getters
    // =========================================================================

    public AnimState getAnimState() { return animState; }
    public String getCurrentAnimName() { return currentAnimName; }
    public long getAnimStartWorldTick() { return animStartWorldTick; }
    public long getPausedAtAnimTick() { return pausedAtAnimTick; }
    public Map<String, String> getTextureOverrides() { return textureOverrides; }

    // =========================================================================
    // Server-side API: play/pause/reset/texture
    // =========================================================================

    /**
     * Plays an animation by name. Uses the animation's default EndBehavior.
     * Must be called server-side. Sends packets to all tracking clients.
     */
    public void playAnimation(String animName) {
        playAnimation(animName, null);
    }

    /**
     * Plays an animation by name with an optional EndBehavior override.
     * Must be called server-side.
     */
    public void playAnimation(String animName, EndBehavior endBehaviorOverride) {
        if (world == null || world.isRemote) return;

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

    /**
     * Pauses the current animation at the current tick.
     */
    public void pauseAnimation() {
        if (world == null || world.isRemote) return;
        if (animState != AnimState.PLAYING) return;

        long currentAnimTick = world.getTotalWorldTime() - animStartWorldTick;
        this.pausedAtAnimTick = currentAnimTick;
        this.animState = AnimState.PAUSED;
        markDirty();

        AnimNetworkHandler.sendPause((WorldServer) world, pos, true, pausedAtAnimTick);
    }

    /**
     * Resumes a paused animation.
     */
    public void resumeAnimation() {
        if (world == null || world.isRemote) return;
        if (animState != AnimState.PAUSED) return;

        // Adjust startWorldTick so that the animation continues from where it was paused
        this.animStartWorldTick = world.getTotalWorldTime() - pausedAtAnimTick;
        this.animState = AnimState.PLAYING;
        markDirty();

        AnimNetworkHandler.sendPause((WorldServer) world, pos, false, world.getTotalWorldTime());
    }

    /**
     * Resets the animation. If the current animation has rollback EndBehavior,
     * triggers a rollback. Otherwise, resets instantly.
     */
    public void resetAnimation() {
        if (world == null || world.isRemote) return;

        AnimationDef def = getServerAnimDef();
        EndBehavior behavior = getEffectiveEndBehavior(def);

        if (behavior == EndBehavior.ROLLBACK && def != null) {
            startRollback();
            AnimNetworkHandler.sendReset((WorldServer) world, pos, false);
        } else {
            resetAnimationInstant();
        }
    }

    /**
     * Instantly resets to IDLE regardless of EndBehavior.
     */
    public void resetAnimationInstant() {
        if (world == null || world.isRemote) return;

        this.animState = AnimState.IDLE;
        this.currentAnimName = "";
        this.lastCheckedEventTick = -1;
        this.currentLoopIteration = 0;
        this.endBehaviorOverride = null;
        markDirty();

        AnimNetworkHandler.sendReset((WorldServer) world, pos, true);
    }

    /**
     * Sets a texture override. Synced to client via NBT.
     */
    public void setTexture(String target, String value) {
        textureOverrides.put(target, value);
        markDirty();
        syncToClient();
    }

    /**
     * Removes a specific texture override.
     */
    public void clearTexture(String target) {
        textureOverrides.remove(target);
        markDirty();
        syncToClient();
    }

    /**
     * Removes all texture overrides.
     */
    public void clearAllTextures() {
        textureOverrides.clear();
        markDirty();
        syncToClient();
    }

    // =========================================================================
    // ITickable -- server-side event dispatch and state transitions
    // =========================================================================

    @Override
    public void update() {
        // Fast exit for non-ticking states
        if (!animState.needsTicking()) return;
        if (world == null) return;

        // Only tick on server side for event dispatch and state transitions
        if (world.isRemote) return;

        if (animState == AnimState.PLAYING) {
            tickPlaying();
        } else if (animState == AnimState.ROLLING_BACK) {
            tickRollingBack();
        }
    }

    private void tickPlaying() {
        long worldTick = world.getTotalWorldTime();
        int currentAnimTick = (int) (worldTick - animStartWorldTick);

        AnimationDef def = getServerAnimDef();
        if (def == null) return;

        int duration = def.getDuration();

        // Dispatch events between lastCheckedEventTick and currentAnimTick
        dispatchEvents(def, lastCheckedEventTick + 1, Math.min(currentAnimTick, duration));
        lastCheckedEventTick = Math.min(currentAnimTick, duration);

        // Check if animation finished
        if (currentAnimTick >= duration) {
            onAnimationFinished(def);
        }
    }

    private void tickRollingBack() {
        long worldTick = world.getTotalWorldTime();
        AnimationDef def = getServerAnimDef();
        if (def == null) {
            animState = AnimState.IDLE;
            return;
        }

        int rollbackDuration = def.getRollbackDuration();
        int rollbackElapsed = (int) (worldTick - rollbackStartWorldTick);

        if (rollbackElapsed >= rollbackDuration) {
            animState = AnimState.IDLE;
            currentAnimName = "";
            endBehaviorOverride = null;
            markDirty();
            onAnimationComplete(def.getName());
        }
    }

    private void onAnimationFinished(AnimationDef def) {
        EndBehavior behavior = getEffectiveEndBehavior(def);

        switch (behavior) {
            case FREEZE:
                animState = AnimState.FROZEN;
                onAnimationComplete(def.getName());
                break;

            case ROLLBACK:
                startRollback();
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
                break;

            case LOOP:
                restartLoop();
                break;

            case LOOP_COUNT:
                currentLoopIteration++;
                if (currentLoopIteration >= def.getLoopCount()) {
                    animState = AnimState.FROZEN;
                    onAnimationComplete(def.getName());
                } else {
                    restartLoop();
                }
                break;

            case LOOP_PAUSE:
                loopPauseEndTick = world.getTotalWorldTime() + def.getLoopPause();
                // We handle the pause in a special way: set state to PLAYING but
                // adjust startWorldTick so the animation restarts after the pause
                animStartWorldTick = world.getTotalWorldTime() + def.getLoopPause();
                lastCheckedEventTick = -1;
                // The animation will naturally be at tick < 0 during the pause,
                // which means it stays at frame 0 until the pause ends
                break;
        }
    }

    private void startRollback() {
        rollbackStartWorldTick = world.getTotalWorldTime();
        animState = AnimState.ROLLING_BACK;
        markDirty();
    }

    private void restartLoop() {
        animStartWorldTick = world.getTotalWorldTime();
        lastCheckedEventTick = -1;
        // State stays PLAYING, no need for a new packet since the client
        // handles looping locally based on the EndBehavior
    }

    private void dispatchEvents(AnimationDef def, int fromTick, int toTick) {
        if (fromTick > toTick) return;
        List<AnimationEvent> events = def.getEvents();
        for (int i = 0; i < events.size(); i++) {
            AnimationEvent event = events.get(i);
            int eventTick = event.getTick();
            if (eventTick >= fromTick && eventTick <= toTick) {
                dispatchSingleEvent(event);
            }
            if (eventTick > toTick) break; // events are sorted
        }
    }

    private void dispatchSingleEvent(AnimationEvent event) {
        switch (event.getType()) {
            case SOUND:
                // Sound events are played on the server, audible to nearby clients
                if (event.getValue() != null && !event.getValue().isEmpty()) {
                    SoundEvent sound = SoundEvent.REGISTRY.getObject(new ResourceLocation(event.getValue()));
                    if (sound != null) {
                        world.playSound(null, pos, sound, SoundCategory.BLOCKS,
                                event.getVolume(), event.getPitch());
                    }
                }
                break;

            case PARTICLE:
                // Particle events are dispatched via callback -- mods handle spawning
                onAnimationEvent(event);
                break;

            case CALLBACK:
                onAnimationCallback(event.getValue());
                onAnimationEvent(event);
                break;

            case HIDE_GROUP:
            case SHOW_GROUP:
                // Group visibility is handled by the client via the animation tracks.
                // The event is still dispatched for server-side awareness.
                onAnimationEvent(event);
                break;

            case CUT:
                // Cut = instant stop. Reset to IDLE.
                resetAnimationInstant();
                break;
        }
    }

    // =========================================================================
    // Callbacks -- override in subclasses
    // =========================================================================

    /**
     * Called when any animation event fires on the server side.
     * Override in subclasses to handle particles, custom logic, etc.
     */
    protected void onAnimationEvent(AnimationEvent event) {
        // Default: no-op. Override in subclasses.
    }

    /**
     * Called when an animation completes (after endBehavior resolves).
     */
    protected void onAnimationComplete(String animName) {
        // Default: no-op. Override in subclasses.
    }

    /**
     * Called when a "callback" type event fires.
     * @param callbackName the value field of the callback event
     */
    protected void onAnimationCallback(String callbackName) {
        // Default: no-op. Override in subclasses.
    }

    // =========================================================================
    // Client-side packet handlers
    // =========================================================================

    /**
     * Called on the client when AnimPlayPacket is received.
     */
    @SideOnly(Side.CLIENT)
    public void onAnimPlayReceived(String animName, long startWorldTick, EndBehavior override) {
        // If currently playing another animation, save current pose for blending
        AnimationDef newDef = getClientAnimDef(animName);
        if (animState == AnimState.PLAYING && newDef != null && newDef.getBlendIn() > 0) {
            saveCurrentPoseForBlend();
            blendStartWorldTick = startWorldTick;
            blendDuration = newDef.getBlendIn();
        } else {
            blendFromPose = null;
            blendDuration = 0;
        }

        this.currentAnimName = animName;
        this.animStartWorldTick = startWorldTick;
        this.animState = AnimState.PLAYING;
        this.lastCheckedEventTick = -1;
        this.currentLoopIteration = 0;
        this.endBehaviorOverride = override;
    }

    /**
     * Called on the client when AnimResetPacket is received.
     */
    @SideOnly(Side.CLIENT)
    public void onAnimResetReceived(boolean instant) {
        if (instant) {
            this.animState = AnimState.IDLE;
            this.currentAnimName = "";
            this.endBehaviorOverride = null;
            blendFromPose = null;
        } else {
            // Non-instant = rollback
            this.rollbackStartWorldTick = world.getTotalWorldTime();
            this.animState = AnimState.ROLLING_BACK;
        }
    }

    /**
     * Called on the client when AnimPausePacket is received (pause=true).
     * @param animTick the animation tick to freeze at
     */
    @SideOnly(Side.CLIENT)
    public void onAnimPauseReceived(long animTick) {
        this.pausedAtAnimTick = animTick;
        this.animState = AnimState.PAUSED;
    }

    /**
     * Called on the client when AnimPausePacket is received (pause=false).
     * @param newStartWorldTick adjusted world tick for seamless resume
     */
    @SideOnly(Side.CLIENT)
    public void onAnimResumeReceived(long newStartWorldTick) {
        // Recalculate animStartWorldTick so animation continues from paused position
        this.animStartWorldTick = newStartWorldTick - pausedAtAnimTick;
        this.animState = AnimState.PLAYING;
    }

    // =========================================================================
    // Client-side: pose computation (called by TESR)
    // =========================================================================

    /**
     * Called by the TESR each frame to get the current interpolated pose.
     * Returns null if no animation is active (IDLE state).
     *
     * @param partialTicks render partial ticks (0.0 - 1.0)
     * @return the interpolated pose, or null if IDLE
     */
    @SideOnly(Side.CLIENT)
    public AnimationPose getCurrentPose(float partialTicks) {
        if (animState == AnimState.IDLE) return null;

        if (controller == null) {
            controller = new AnimationController();
        }

        AnimationFile animFile = getClientAnimFile();
        if (animFile == null) return null;

        AnimationDef def = animFile.getAnimation(currentAnimName);
        if (def == null) return null;

        float tickFloat = computeClientAnimTick(def, partialTicks);
        int duration = def.getDuration();

        // Compute blend
        AnimationPose blendPose = null;
        float blendProgress = 1.0f;
        if (blendFromPose != null && blendDuration > 0 && animState == AnimState.PLAYING) {
            long worldTick = world.getTotalWorldTime();
            float blendElapsed = (worldTick - blendStartWorldTick) + partialTicks;
            blendProgress = Math.min(blendElapsed / blendDuration, 1.0f);
            if (blendProgress >= 1.0f) {
                blendFromPose = null; // blend complete
            } else {
                blendPose = blendFromPose;
            }
        }

        int rollbackDur = def.getRollbackDuration();
        return controller.computePose(def, animState, tickFloat, duration, rollbackDur, blendPose, blendProgress);
    }

    /**
     * Computes the current animation tick for client-side rendering.
     * Handles PLAYING, PAUSED, FROZEN, WAITING_SERVER, ROLLING_BACK states.
     */
    @SideOnly(Side.CLIENT)
    private float computeClientAnimTick(AnimationDef def, float partialTicks) {
        long worldTick = world.getTotalWorldTime();

        switch (animState) {
            case PLAYING: {
                float tick = (worldTick - animStartWorldTick) + partialTicks;
                int duration = def.getDuration();
                EndBehavior behavior = getEffectiveEndBehavior(def);

                // Handle client-side loop behavior
                if (tick >= duration) {
                    switch (behavior) {
                        case LOOP:
                            tick = tick % duration;
                            break;
                        case LOOP_COUNT:
                            if (currentLoopIteration < def.getLoopCount()) {
                                tick = tick % duration;
                            } else {
                                tick = duration;
                            }
                            break;
                        case LOOP_PAUSE:
                            // Client approximation: loop with gap
                            int cycleDuration = duration + def.getLoopPause();
                            float cyclePos = tick % cycleDuration;
                            tick = Math.min(cyclePos, duration);
                            break;
                        default:
                            tick = Math.min(tick, duration);
                            break;
                    }
                }
                return tick;
            }

            case PAUSED:
                return pausedAtAnimTick;

            case FROZEN:
            case WAITING_SERVER:
                return def.getDuration();

            case ROLLING_BACK: {
                float rollbackElapsed = (worldTick - rollbackStartWorldTick) + partialTicks;
                return rollbackElapsed; // AnimationController handles the reverse mapping
            }

            default:
                return 0;
        }
    }

    @SideOnly(Side.CLIENT)
    private void saveCurrentPoseForBlend() {
        if (controller == null) return;
        AnimationFile animFile = getClientAnimFile();
        if (animFile == null) return;
        AnimationDef def = animFile.getAnimation(currentAnimName);
        if (def == null) return;

        float tick = computeClientAnimTick(def, 0);
        AnimationPose current = controller.computePose(def, animState, tick,
                def.getDuration(), def.getRollbackDuration(), null, 1.0f);

        blendFromPose = new AnimationPose();
        blendFromPose.copyFrom(current);
    }

    // =========================================================================
    // Helper: get AnimationDef from the cache
    // =========================================================================

    /**
     * Gets the current AnimationDef from the server-side animation file cache.
     * On server, we parse the file via resource pack (if available) or return null.
     * Animations are primarily client-side; the server only needs the definition
     * for event dispatch and duration checking.
     */
    private AnimationDef getServerAnimDef() {
        if (currentAnimName.isEmpty() || animFileId.isEmpty()) return null;
        AnimationFile file = EriAnimCache.get(animFileId);
        return file != null ? file.getAnimation(currentAnimName) : null;
    }

    @SideOnly(Side.CLIENT)
    private AnimationFile getClientAnimFile() {
        if (animFileId.isEmpty()) return null;
        return EriAnimCache.get(animFileId);
    }

    @SideOnly(Side.CLIENT)
    private AnimationDef getClientAnimDef(String animName) {
        AnimationFile file = getClientAnimFile();
        return file != null ? file.getAnimation(animName) : null;
    }

    private EndBehavior getEffectiveEndBehavior(AnimationDef def) {
        if (endBehaviorOverride != null) return endBehaviorOverride;
        return def != null ? def.getEndBehavior() : EndBehavior.FREEZE;
    }

    // =========================================================================
    // NBT serialization
    // =========================================================================

    @Override
    public NBTTagCompound writeToNBT(NBTTagCompound compound) {
        super.writeToNBT(compound);
        compound.setString("animModelId", modelId);
        compound.setString("animFileId", animFileId);
        compound.setString("animName", currentAnimName);
        compound.setInteger("animState", animState.ordinal());
        compound.setLong("animStartTick", animStartWorldTick);
        compound.setLong("animPausedTick", pausedAtAnimTick);
        compound.setLong("rollbackStartTick", rollbackStartWorldTick);
        compound.setInteger("loopIteration", currentLoopIteration);

        if (endBehaviorOverride != null) {
            compound.setString("endBehaviorOvr", endBehaviorOverride.name());
        }

        // Texture overrides
        if (!textureOverrides.isEmpty()) {
            NBTTagCompound texNbt = new NBTTagCompound();
            for (Map.Entry<String, String> entry : textureOverrides.entrySet()) {
                texNbt.setString(entry.getKey(), entry.getValue());
            }
            compound.setTag("texOverrides", texNbt);
        }

        return compound;
    }

    @Override
    public void readFromNBT(NBTTagCompound compound) {
        super.readFromNBT(compound);
        modelId = compound.getString("animModelId");
        animFileId = compound.getString("animFileId");
        currentAnimName = compound.getString("animName");

        int stateOrd = compound.getInteger("animState");
        AnimState[] states = AnimState.values();
        animState = (stateOrd >= 0 && stateOrd < states.length) ? states[stateOrd] : AnimState.IDLE;

        animStartWorldTick = compound.getLong("animStartTick");
        pausedAtAnimTick = compound.getLong("animPausedTick");
        rollbackStartWorldTick = compound.getLong("rollbackStartTick");
        currentLoopIteration = compound.getInteger("loopIteration");

        if (compound.hasKey("endBehaviorOvr")) {
            endBehaviorOverride = EndBehavior.fromString(compound.getString("endBehaviorOvr"));
        } else {
            endBehaviorOverride = null;
        }

        textureOverrides.clear();
        if (compound.hasKey("texOverrides")) {
            NBTTagCompound texNbt = compound.getCompoundTag("texOverrides");
            for (String key : texNbt.getKeySet()) {
                textureOverrides.put(key, texNbt.getString(key));
            }
        }
    }

    // =========================================================================
    // Network sync (block update packets for initial chunk load)
    // =========================================================================

    @Nullable
    @Override
    public SPacketUpdateTileEntity getUpdatePacket() {
        return new SPacketUpdateTileEntity(pos, 0, getUpdateTag());
    }

    @Override
    public NBTTagCompound getUpdateTag() {
        return writeToNBT(new NBTTagCompound());
    }

    @Override
    public void onDataPacket(NetworkManager net, SPacketUpdateTileEntity pkt) {
        readFromNBT(pkt.getNbtCompound());
    }

    private void syncToClient() {
        if (world != null && !world.isRemote) {
            world.notifyBlockUpdate(pos, world.getBlockState(pos), world.getBlockState(pos), 3);
        }
    }
}
```

- [ ] Step 2: Build and verify

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

**Note:** The `@SideOnly(Side.CLIENT)` fields (`blendFromPose`, `blendStartWorldTick`, `blendDuration`, `controller`) may cause issues at compile time because they are declared with `@SideOnly` but accessed in methods that are also `@SideOnly`. If the build fails on these fields, remove the `@SideOnly` annotations from the field declarations only (keep them on the methods). The fields will simply be unused on the server (null/0), which is harmless.

---

## Task 6: Modified TESR -- Apply AnimationPose Transforms

**Files to create:** None.

**Files to modify:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTESR.java`

**Dependencies:** Tasks 1-5.

- [ ] Step 1: Rewrite `AnimatedBlockTESR.java` to use AnimationPose

Replace the entire file with:

```java
package fr.eri.eriapi.anim;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.BufferBuilder;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.renderer.Tessellator;
import net.minecraft.client.renderer.tileentity.TileEntitySpecialRenderer;
import net.minecraft.client.renderer.vertex.DefaultVertexFormats;
import net.minecraft.util.EnumFacing;
import net.minecraft.util.ResourceLocation;
import net.minecraftforge.fml.relauncher.Side;
import net.minecraftforge.fml.relauncher.SideOnly;
import org.lwjgl.opengl.GL11;

import java.util.List;
import java.util.Map;

/**
 * TESR that renders Blockbench models from AnimModelCache.
 * Phase 2: applies AnimationPose transforms to groups when an animation is active.
 * Falls back to static rendering when no animation is playing (IDLE state).
 */
@SideOnly(Side.CLIENT)
public class AnimatedBlockTESR extends TileEntitySpecialRenderer<AnimatedBlockTileEntity> {

    private ResourceLocation lastBoundTexture = null;
    private Map<String, ResourceLocation> currentTextures = null;
    private AnimationPose currentPose = null;
    private Map<String, String> activeTextureOverrides = null;

    @Override
    public void render(AnimatedBlockTileEntity te, double x, double y, double z,
                       float partialTicks, int destroyStage, float alpha) {
        String modelId = te.getModelId();
        if (modelId == null || modelId.isEmpty()) return;

        AnimatedBlockModel model = AnimModelCache.get(modelId);
        if (model == null) return;

        currentTextures = model.getTextures();
        lastBoundTexture = null;

        // Get animation pose (null if IDLE)
        currentPose = te.getCurrentPose(partialTicks);

        // Merge texture overrides: TE overrides + animation overrides
        activeTextureOverrides = te.getTextureOverrides();
        if (currentPose != null && !currentPose.getTextureOverrides().isEmpty()) {
            // Animation overrides take precedence over TE overrides for same keys
            // (but we don't want to allocate a merged map every frame)
            // The lookupTexture method handles priority
        }

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
    }

    private void renderGroup(ModelGroup group) {
        String groupName = group.getName();

        // Check visibility from animation pose
        if (currentPose != null) {
            if (!currentPose.isGroupVisible(groupName)) return;
        } else {
            if (!group.isVisible()) return;
        }

        GlStateManager.pushMatrix();

        float[] pivot = group.getOrigin();
        GlStateManager.translate(pivot[0], pivot[1], pivot[2]);

        // Apply animated transforms if available
        if (currentPose != null) {
            AnimationPose.GroupPose groupPose = currentPose.get(groupName);
            if (groupPose != null) {
                // Translation
                float[] t = groupPose.translation;
                if (t[0] != 0 || t[1] != 0 || t[2] != 0) {
                    // Translation values from animation are in Blockbench pixels (1/16 block)
                    GlStateManager.translate(t[0] / 16.0f, t[1] / 16.0f, t[2] / 16.0f);
                }

                // Rotation (applied around the pivot)
                float[] r = groupPose.rotation;
                if (r[2] != 0) GlStateManager.rotate(r[2], 0, 0, 1);
                if (r[1] != 0) GlStateManager.rotate(r[1], 0, 1, 0);
                if (r[0] != 0) GlStateManager.rotate(r[0], 1, 0, 0);

                // Scale
                float[] s = groupPose.scale;
                if (s[0] != 1 || s[1] != 1 || s[2] != 1) {
                    GlStateManager.scale(s[0], s[1], s[2]);
                }
            }
        }

        GlStateManager.translate(-pivot[0], -pivot[1], -pivot[2]);

        List<ModelElement> elements = group.getElements();
        for (int i = 0; i < elements.size(); i++) {
            renderElement(elements.get(i));
        }

        List<ModelGroup> children = group.getChildren();
        for (int i = 0; i < children.size(); i++) {
            renderGroup(children.get(i));
        }

        GlStateManager.popMatrix();
    }

    private void renderElement(ModelElement elem) {
        float[] from = elem.getFrom();
        float[] to = elem.getTo();

        boolean hasRotation = elem.getRotationAxis() != null && elem.getRotationAngle() != 0f;
        if (hasRotation) {
            GlStateManager.pushMatrix();
            float[] rotOrigin = elem.getRotationOrigin();
            if (rotOrigin != null) {
                GlStateManager.translate(rotOrigin[0], rotOrigin[1], rotOrigin[2]);
            }

            float angle = elem.getRotationAngle();
            String axis = elem.getRotationAxis();
            if ("x".equals(axis)) GlStateManager.rotate(angle, 1, 0, 0);
            else if ("y".equals(axis)) GlStateManager.rotate(angle, 0, 1, 0);
            else if ("z".equals(axis)) GlStateManager.rotate(angle, 0, 0, 1);

            if (rotOrigin != null) {
                GlStateManager.translate(-rotOrigin[0], -rotOrigin[1], -rotOrigin[2]);
            }
        }

        Map<EnumFacing, FaceData> faces = elem.getFaces();
        for (Map.Entry<EnumFacing, FaceData> entry : faces.entrySet()) {
            bindTexture(entry.getValue().getTextureKey());
            drawFace(from, to, entry.getKey(), entry.getValue());
        }

        if (hasRotation) {
            GlStateManager.popMatrix();
        }
    }

    /**
     * Binds a texture, checking overrides in this order:
     * 1. Animation pose texture overrides (highest priority)
     * 2. TE texture overrides (setTexture API)
     * 3. Model's original texture map (default)
     */
    private void bindTexture(String textureKey) {
        if (currentTextures == null || textureKey == null || textureKey.isEmpty()) return;

        // Check animation texture overrides
        String resolvedKey = textureKey;
        if (currentPose != null) {
            Map<String, String> animOverrides = currentPose.getTextureOverrides();
            if (animOverrides.containsKey(textureKey)) {
                resolvedKey = animOverrides.get(textureKey);
            }
        }

        // Check TE texture overrides
        if (resolvedKey.equals(textureKey) && activeTextureOverrides != null) {
            if (activeTextureOverrides.containsKey(textureKey)) {
                resolvedKey = activeTextureOverrides.get(textureKey);
            }
        }

        ResourceLocation tex = currentTextures.get(resolvedKey);
        if (tex == null) {
            // Fallback: try original key if override key not found in texture map
            tex = currentTextures.get(textureKey);
        }
        if (tex == null) return;

        if (!tex.equals(lastBoundTexture)) {
            Minecraft.getMinecraft().getTextureManager().bindTexture(tex);
            lastBoundTexture = tex;
        }
    }

    private void drawFace(float[] from, float[] to, EnumFacing facing, FaceData face) {
        float[] uv = face.getUv();
        float[][] uvCoords = computeUvCoords(uv[0], uv[1], uv[2], uv[3], face.getUvRotation());

        float x0 = from[0], y0 = from[1], z0 = from[2];
        float x1 = to[0], y1 = to[1], z1 = to[2];

        Tessellator tessellator = Tessellator.getInstance();
        BufferBuilder buffer = tessellator.getBuffer();
        buffer.begin(GL11.GL_QUADS, DefaultVertexFormats.POSITION_TEX_NORMAL);

        switch (facing) {
            case DOWN:
                buffer.pos(x0, y0, z1).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, -1, 0).endVertex();
                buffer.pos(x0, y0, z0).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, -1, 0).endVertex();
                buffer.pos(x1, y0, z0).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, -1, 0).endVertex();
                buffer.pos(x1, y0, z1).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, -1, 0).endVertex();
                break;
            case UP:
                buffer.pos(x0, y1, z0).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, 1, 0).endVertex();
                buffer.pos(x0, y1, z1).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, 1, 0).endVertex();
                buffer.pos(x1, y1, z1).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, 1, 0).endVertex();
                buffer.pos(x1, y1, z0).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, 1, 0).endVertex();
                break;
            case NORTH:
                buffer.pos(x1, y1, z0).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, 0, -1).endVertex();
                buffer.pos(x1, y0, z0).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, 0, -1).endVertex();
                buffer.pos(x0, y0, z0).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, 0, -1).endVertex();
                buffer.pos(x0, y1, z0).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, 0, -1).endVertex();
                break;
            case SOUTH:
                buffer.pos(x0, y1, z1).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, 0, 1).endVertex();
                buffer.pos(x0, y0, z1).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, 0, 1).endVertex();
                buffer.pos(x1, y0, z1).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, 0, 1).endVertex();
                buffer.pos(x1, y1, z1).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, 0, 1).endVertex();
                break;
            case WEST:
                buffer.pos(x0, y1, z0).tex(uvCoords[0][0], uvCoords[0][1]).normal(-1, 0, 0).endVertex();
                buffer.pos(x0, y0, z0).tex(uvCoords[1][0], uvCoords[1][1]).normal(-1, 0, 0).endVertex();
                buffer.pos(x0, y0, z1).tex(uvCoords[2][0], uvCoords[2][1]).normal(-1, 0, 0).endVertex();
                buffer.pos(x0, y1, z1).tex(uvCoords[3][0], uvCoords[3][1]).normal(-1, 0, 0).endVertex();
                break;
            case EAST:
                buffer.pos(x1, y1, z1).tex(uvCoords[0][0], uvCoords[0][1]).normal(1, 0, 0).endVertex();
                buffer.pos(x1, y0, z1).tex(uvCoords[1][0], uvCoords[1][1]).normal(1, 0, 0).endVertex();
                buffer.pos(x1, y0, z0).tex(uvCoords[2][0], uvCoords[2][1]).normal(1, 0, 0).endVertex();
                buffer.pos(x1, y1, z0).tex(uvCoords[3][0], uvCoords[3][1]).normal(1, 0, 0).endVertex();
                break;
        }

        tessellator.draw();
    }

    private float[][] computeUvCoords(float u1, float v1, float u2, float v2, int rotation) {
        float[][] base = new float[][]{
                {u1, v1}, {u1, v2}, {u2, v2}, {u2, v1}
        };

        int shift = (rotation / 90) % 4;
        if (shift == 0) return base;

        float[][] rotated = new float[4][2];
        for (int i = 0; i < 4; i++) {
            rotated[i] = base[(i + shift) % 4];
        }
        return rotated;
    }
}
```

- [ ] Step 2: Build and verify

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

---

## Task 7: Build EriniumFaction against updated EriAPI

**Files to create:** None.

**Files to modify:** Potentially the EriniumFaction `build.gradle` if the EriAPI jar name changes.

**Dependencies:** Tasks 1-6 (all EriAPI changes must build successfully first).

- [ ] Step 1: Build EriAPI final

```bash
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] Step 2: Copy the new EriAPI jar to EriniumFaction libs

Check the current jar name and version in `build/libs/`. If the version changed, update accordingly:

```bash
cp "D:/Mods Minecraft/EriAPI/build/libs/eriapi-1.2.0-1.12.2.jar" "D:/Mods Minecraft/EriniumFaction/libs/"
```

If the version was bumped (e.g., to 1.3.0), also update the jar reference in `D:\Mods Minecraft\EriniumFaction\build.gradle`.

- [ ] Step 3: Build EriniumFaction

```bash
cd "D:/Mods Minecraft/EriniumFaction" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] Step 4: Verify no compilation errors related to AnimatedBlockTileEntity API changes

The Phase 1 integration in EriniumFaction may reference the old `AnimatedBlockTileEntity` API (constructor with just `modelId`). That constructor is still present, so no breakage is expected. But if any EriniumFaction code calls methods that changed signatures, fix them.

Grep for usages:

```bash
grep -rn "AnimatedBlockTileEntity\|AnimatedBlockTESR\|AnimModelCache" "D:/Mods Minecraft/EriniumFaction/src/"
```

Fix any compilation errors found.

---

## Summary of all files

### New files (14 files in `fr.eri.eriapi.anim`):

| File | Purpose |
|------|---------|
| `EndBehavior.java` | Enum: 7 end-of-animation behaviors |
| `AnimState.java` | Enum: 6 animation playback states |
| `Keyframe.java` | Keyframe with tick + float[3] value + easing |
| `SpinKeyframe.java` | Spin keyframe with tick + axis + speed + easing |
| `TextureKeyframe.java` | Texture swap keyframe with tick + target + value |
| `AnimationEvent.java` | Timed event with tick + type + parameters |
| `GroupTrack.java` | All tracks for one group (rotation, translation, scale, visible, spin, texture) |
| `AnimationDef.java` | One animation definition (duration, endBehavior, tracks, events) |
| `AnimationFile.java` | Root structure from .erianim (version, model, animations map) |
| `EriAnimParser.java` | Parses .erianim JSON to AnimationFile |
| `EriAnimCache.java` | Cache for parsed AnimationFile instances |
| `AnimationPose.java` | Interpolation result: per-group rotation/translation/scale/visible + texture overrides |
| `AnimationController.java` | Client-side interpolation engine |
| `AnimPlayPacket.java` | Server-to-client: play animation |
| `AnimResetPacket.java` | Server-to-client: reset animation |
| `AnimPausePacket.java` | Server-to-client: pause/resume animation |
| `AnimNetworkHandler.java` | Packet registration and send helpers |

### Modified files (3 files):

| File | Changes |
|------|---------|
| `EriAPI.java` | Add `AnimNetworkHandler.init()` call in preInit |
| `AnimatedBlockTileEntity.java` | Full rewrite: ITickable, state machine, events, blend, texture overrides, network handlers |
| `AnimatedBlockTESR.java` | Full rewrite: applies AnimationPose transforms, texture override resolution |
