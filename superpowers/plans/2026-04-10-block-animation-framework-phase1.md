# Block Animation Framework -- Phase 1 : Parseur & Rendu Statique

> **For agentic workers:** REQUIRED SUB-SKILL -- Read `CLAUDE.md` and `docs/knowissue.md` before touching any file. Build with `cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build` after every task. For task 5, also build EriniumFaction with `cd "D:/Mods Minecraft/EriniumFaction" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build`. Java 8 only -- no `var`, no Java 9+ features. No streams in hot paths.

**Goal:** Parse Blockbench JSON models into Java structures, cache them, and render them statically via TESR. Validate with the real lootbox model (75 elements, 8 root groups, 13 textures) placed in-game as a test block.

**Architecture:** New package `fr.eri.eriapi.anim` in EriAPI. 4 data classes (AnimatedBlockModel, ModelGroup, ModelElement, FaceData), 1 parser (BlockbenchModelParser), 1 cache (AnimModelCache), 1 TileEntity (AnimatedBlockTileEntity), 1 TESR (AnimatedBlockTESR). The Easing enum already exists at `fr.eri.eriapi.gui.anim.Easing` -- reuse it, never duplicate.

**Tech Stack:** Java 8, Forge 1.12.2, GSON (bundled with Minecraft), OpenGL via GlStateManager + Tessellator/BufferBuilder.

**Reference model:** `C:\Users\killi\Pictures\Mcreator-Resources\3d models\lootbox\lootbox.json` -- 1324 lines, 13 textures (logo_animated, rarity_top, top_pedestral, interior_cube, corner_cube, corner_joint, side_plate, side_middle_plate, side_plate_core, side_cable, side_core, rocks + particle), 75+ elements, 8 root groups with nested sub-groups (e.g. corner > joint > vertical/horizontal, Top > rocks/raritybeam).

---

## Task 1: Data Classes -- AnimatedBlockModel, ModelGroup, ModelElement, FaceData

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockModel.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\ModelGroup.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\ModelElement.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\FaceData.java`

**Files to modify:** None.

**Dependencies:** None -- pure data classes.

- [ ] Step 1: Create `FaceData.java`

```java
package fr.eri.eriapi.anim;

/**
 * UV and texture data for a single face of a ModelElement.
 * UV values are normalized 0-1 (converted from pixel coordinates at parse time).
 */
public class FaceData {

    private final float[] uv; // [u1, v1, u2, v2] normalized 0-1
    private final String textureKey; // key in AnimatedBlockModel.textures map (e.g. "side_cable.png")
    private final int uvRotation; // 0, 90, 180, 270
    private final int tintIndex; // -1 if no tint

    public FaceData(float[] uv, String textureKey, int uvRotation, int tintIndex) {
        this.uv = uv;
        this.textureKey = textureKey;
        this.uvRotation = uvRotation;
        this.tintIndex = tintIndex;
    }

    public float[] getUv() {
        return uv;
    }

    public String getTextureKey() {
        return textureKey;
    }

    public int getUvRotation() {
        return uvRotation;
    }

    public int getTintIndex() {
        return tintIndex;
    }
}
```

- [ ] Step 2: Create `ModelElement.java`

```java
package fr.eri.eriapi.anim;

import net.minecraft.util.EnumFacing;

import java.util.Map;

/**
 * A single box element parsed from a Blockbench model.
 * All coordinates are in OpenGL units (Blockbench pixels / 16).
 */
public class ModelElement {

    private final float[] from; // [x, y, z] in OpenGL units
    private final float[] to;   // [x, y, z] in OpenGL units
    private final float rotationAngle; // degrees, 0 if no rotation
    private final String rotationAxis; // "x", "y", "z", or null
    private final float[] rotationOrigin; // [x, y, z] in OpenGL units, or null
    private final Map<EnumFacing, FaceData> faces;

    public ModelElement(float[] from, float[] to, float rotationAngle, String rotationAxis,
                        float[] rotationOrigin, Map<EnumFacing, FaceData> faces) {
        this.from = from;
        this.to = to;
        this.rotationAngle = rotationAngle;
        this.rotationAxis = rotationAxis;
        this.rotationOrigin = rotationOrigin;
        this.faces = faces;
    }

    public float[] getFrom() {
        return from;
    }

    public float[] getTo() {
        return to;
    }

    public float getRotationAngle() {
        return rotationAngle;
    }

    public String getRotationAxis() {
        return rotationAxis;
    }

    public float[] getRotationOrigin() {
        return rotationOrigin;
    }

    public Map<EnumFacing, FaceData> getFaces() {
        return faces;
    }
}
```

- [ ] Step 3: Create `ModelGroup.java`

```java
package fr.eri.eriapi.anim;

import java.util.List;

/**
 * A named group of elements with a pivot point, supporting nested sub-groups.
 * Pivot coordinates are in OpenGL units (Blockbench pixels / 16).
 */
public class ModelGroup {

    private final String name;
    private final float[] origin; // pivot [x, y, z] in OpenGL units
    private final List<ModelElement> elements;
    private final List<ModelGroup> children;
    private boolean visible;

    public ModelGroup(String name, float[] origin, List<ModelElement> elements,
                      List<ModelGroup> children, boolean visible) {
        this.name = name;
        this.origin = origin;
        this.elements = elements;
        this.children = children;
        this.visible = visible;
    }

    public String getName() {
        return name;
    }

    public float[] getOrigin() {
        return origin;
    }

    public List<ModelElement> getElements() {
        return elements;
    }

    public List<ModelGroup> getChildren() {
        return children;
    }

    public boolean isVisible() {
        return visible;
    }

    public void setVisible(boolean visible) {
        this.visible = visible;
    }
}
```

- [ ] Step 4: Create `AnimatedBlockModel.java`

```java
package fr.eri.eriapi.anim;

import net.minecraft.util.ResourceLocation;

import java.util.List;
import java.util.Map;

/**
 * A fully parsed Blockbench model ready for rendering.
 * Contains the element/group hierarchy, texture mappings, and lookup indices.
 */
public class AnimatedBlockModel {

    private final String modelId;
    private final List<ModelGroup> rootGroups;
    private final Map<String, ModelGroup> groupsByName;
    private final Map<String, ResourceLocation> textures; // texture key -> ResourceLocation
    private final List<ModelElement> allElements;

    public AnimatedBlockModel(String modelId, List<ModelGroup> rootGroups,
                              Map<String, ModelGroup> groupsByName,
                              Map<String, ResourceLocation> textures,
                              List<ModelElement> allElements) {
        this.modelId = modelId;
        this.rootGroups = rootGroups;
        this.groupsByName = groupsByName;
        this.textures = textures;
        this.allElements = allElements;
    }

    public String getModelId() {
        return modelId;
    }

    public List<ModelGroup> getRootGroups() {
        return rootGroups;
    }

    public Map<String, ModelGroup> getGroupsByName() {
        return groupsByName;
    }

    public ModelGroup getGroup(String name) {
        return groupsByName.get(name);
    }

    public Map<String, ResourceLocation> getTextures() {
        return textures;
    }

    public ResourceLocation getTexture(String key) {
        return textures.get(key);
    }

    public List<ModelElement> getAllElements() {
        return allElements;
    }

    public int getElementCount() {
        return allElements.size();
    }

    public int getGroupCount() {
        return groupsByName.size();
    }

    public int getTextureCount() {
        return textures.size();
    }
}
```

**Verification:** Build EriAPI. All 4 classes must compile with zero errors.

---

## Task 2: Blockbench JSON Parser -- BlockbenchModelParser

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\BlockbenchModelParser.java`

**Files to read before coding:**
- The lootbox.json reference model at `C:\Users\killi\Pictures\Mcreator-Resources\3d models\lootbox\lootbox.json` (already analyzed -- 1324 lines)

**Dependencies:** Task 1 must be complete.

- [ ] Step 1: Create `BlockbenchModelParser.java`

This class parses a Blockbench JSON file from Minecraft resource assets. It is called with a model ID like `"eriniumfaction:block/lootbox"` which maps to `assets/eriniumfaction/models/block/lootbox.json`.

```java
package fr.eri.eriapi.anim;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import fr.eri.eriapi.core.Reference;
import net.minecraft.client.Minecraft;
import net.minecraft.util.EnumFacing;
import net.minecraft.util.ResourceLocation;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses Blockbench JSON models (format "Java Block/Item") into {@link AnimatedBlockModel}.
 *
 * <p>Supports:
 * <ul>
 *   <li>Multi-texture references by name ("#side_cable.png") and by index ("#0")</li>
 *   <li>Nested groups with mixed children (int element indices + object sub-groups)</li>
 *   <li>Element rotation (optional, single-axis)</li>
 *   <li>UV rotation per face (0, 90, 180, 270)</li>
 *   <li>Coordinate conversion: Blockbench pixels / 16 = OpenGL units</li>
 *   <li>UV normalization: pixel UV / textureSize = normalized 0-1</li>
 * </ul>
 */
public class BlockbenchModelParser {

    private static final float PIXEL_TO_GL = 1.0f / 16.0f;
    /** Default texture size in pixels. Blockbench standard is 16x16 but models can use larger. */
    private static final float DEFAULT_TEXTURE_SIZE = 16.0f;

    /**
     * Parse a Blockbench model from mod resources.
     *
     * @param modelId resource path in format "modid:path/to/model" (without .json).
     *                Maps to assets/modid/models/path/to/model.json
     * @return the parsed model, or null if the resource cannot be found or parsed
     */
    public static AnimatedBlockModel parse(String modelId) {
        // Split modelId into domain and path
        String domain;
        String path;
        int colonIdx = modelId.indexOf(':');
        if (colonIdx >= 0) {
            domain = modelId.substring(0, colonIdx);
            path = modelId.substring(colonIdx + 1);
        } else {
            domain = "minecraft";
            path = modelId;
        }

        ResourceLocation resLoc = new ResourceLocation(domain, "models/" + path + ".json");

        try {
            InputStream is = Minecraft.getMinecraft().getResourceManager()
                    .getResource(resLoc).getInputStream();
            InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8);
            JsonParser jsonParser = new JsonParser();
            JsonObject root = jsonParser.parse(reader).getAsJsonObject();
            reader.close();

            return parseJson(modelId, domain, root);
        } catch (Exception e) {
            Reference.LOGGER.error("EriAPI - Failed to parse Blockbench model: {}", modelId, e);
            return null;
        }
    }

    /**
     * Parse from a raw JsonObject (useful for testing or pre-loaded JSON).
     */
    public static AnimatedBlockModel parseJson(String modelId, String modId, JsonObject root) {
        // --- 1. Parse texture map ---
        // Blockbench textures: {"particle": "logo_animated", "side_cable.png": "side_cable", ...}
        // Or indexed: {"0": "modid:blocks/name", "1": "modid:blocks/name2"}
        Map<String, ResourceLocation> textureMap = new HashMap<String, ResourceLocation>();
        float textureSize = DEFAULT_TEXTURE_SIZE;

        if (root.has("textures")) {
            JsonObject texObj = root.getAsJsonObject("textures");
            for (Map.Entry<String, JsonElement> entry : texObj.entrySet()) {
                String key = entry.getKey();
                String value = entry.getValue().getAsString();

                // Skip "particle" -- it is the break particle texture, not used in TESR rendering
                if ("particle".equals(key)) continue;

                // Build ResourceLocation for the texture
                // Value can be "modid:blocks/name" or just "name" (short form)
                ResourceLocation textureLoc;
                if (value.contains(":")) {
                    // Already qualified: "modid:blocks/name"
                    String texDomain = value.substring(0, value.indexOf(':'));
                    String texPath = value.substring(value.indexOf(':') + 1);
                    textureLoc = new ResourceLocation(texDomain, "textures/" + texPath + ".png");
                } else {
                    // Short form: just the texture name, assumed to be in the mod's textures/blocks/ folder
                    // We need to resolve this relative to the model path
                    // The model is at models/block/lootbox, textures are at textures/blocks/lootbox/<name>.png
                    // But Blockbench short names are ambiguous -- we use a convention:
                    // texture goes in textures/blocks/<modelBaseName>/<value>.png
                    String modelBaseName = path(modelId);
                    textureLoc = new ResourceLocation(modId,
                            "textures/blocks/" + modelBaseName + "/" + value + ".png");
                }

                textureMap.put(key, textureLoc);
            }
        }

        // Detect texture size from the JSON if present (texture_size field from Blockbench)
        if (root.has("texture_size")) {
            JsonArray sizeArr = root.getAsJsonArray("texture_size");
            // Use the width (index 0) as the normalization base
            textureSize = sizeArr.get(0).getAsFloat();
        }

        // --- 2. Parse all elements ---
        List<ModelElement> allElements = new ArrayList<ModelElement>();
        if (root.has("elements")) {
            JsonArray elemArr = root.getAsJsonArray("elements");
            for (int i = 0; i < elemArr.size(); i++) {
                JsonObject elemObj = elemArr.get(i).getAsJsonObject();
                allElements.add(parseElement(elemObj, textureSize));
            }
        }

        // --- 3. Parse groups ---
        List<ModelGroup> rootGroups = new ArrayList<ModelGroup>();
        Map<String, ModelGroup> groupsByName = new HashMap<String, ModelGroup>();

        if (root.has("groups")) {
            JsonArray groupsArr = root.getAsJsonArray("groups");
            for (int i = 0; i < groupsArr.size(); i++) {
                JsonElement ge = groupsArr.get(i);
                if (ge.isJsonObject()) {
                    ModelGroup group = parseGroup(ge.getAsJsonObject(), allElements);
                    rootGroups.add(group);
                    indexGroups(group, groupsByName);
                }
                // Top-level int children (elements not in any group) are ignored --
                // they would need a synthetic root group. In practice, Blockbench
                // exports always wrap elements in groups.
            }
        }

        return new AnimatedBlockModel(modelId, rootGroups, groupsByName, textureMap, allElements);
    }

    // ---- Internal parsing methods ----

    private static ModelElement parseElement(JsonObject obj, float textureSize) {
        // from / to -- convert from Blockbench pixels to OpenGL units
        float[] from = parseFloat3(obj.getAsJsonArray("from"), PIXEL_TO_GL);
        float[] to = parseFloat3(obj.getAsJsonArray("to"), PIXEL_TO_GL);

        // rotation (optional)
        float rotAngle = 0f;
        String rotAxis = null;
        float[] rotOrigin = null;

        if (obj.has("rotation")) {
            JsonObject rotObj = obj.getAsJsonObject("rotation");
            rotAngle = rotObj.get("angle").getAsFloat();
            rotAxis = rotObj.get("axis").getAsString();
            rotOrigin = parseFloat3(rotObj.getAsJsonArray("origin"), PIXEL_TO_GL);
        }

        // faces
        Map<EnumFacing, FaceData> faces = new EnumMap<EnumFacing, FaceData>(EnumFacing.class);
        if (obj.has("faces")) {
            JsonObject facesObj = obj.getAsJsonObject("faces");
            parseFace(facesObj, "north", EnumFacing.NORTH, faces, textureSize);
            parseFace(facesObj, "south", EnumFacing.SOUTH, faces, textureSize);
            parseFace(facesObj, "east", EnumFacing.EAST, faces, textureSize);
            parseFace(facesObj, "west", EnumFacing.WEST, faces, textureSize);
            parseFace(facesObj, "up", EnumFacing.UP, faces, textureSize);
            parseFace(facesObj, "down", EnumFacing.DOWN, faces, textureSize);
        }

        return new ModelElement(from, to, rotAngle, rotAxis, rotOrigin, faces);
    }

    private static void parseFace(JsonObject facesObj, String jsonKey, EnumFacing facing,
                                  Map<EnumFacing, FaceData> faces, float textureSize) {
        if (!facesObj.has(jsonKey)) return;

        JsonObject faceObj = facesObj.getAsJsonObject(jsonKey);

        // UV -- normalize from texture pixels to 0-1
        float[] uv = new float[4];
        if (faceObj.has("uv")) {
            JsonArray uvArr = faceObj.getAsJsonArray("uv");
            uv[0] = uvArr.get(0).getAsFloat() / textureSize;
            uv[1] = uvArr.get(1).getAsFloat() / textureSize;
            uv[2] = uvArr.get(2).getAsFloat() / textureSize;
            uv[3] = uvArr.get(3).getAsFloat() / textureSize;
        }

        // Texture key -- strip the "#" prefix
        String textureKey = "";
        if (faceObj.has("texture")) {
            String raw = faceObj.get("texture").getAsString();
            if (raw.startsWith("#")) {
                textureKey = raw.substring(1);
            } else {
                textureKey = raw;
            }
        }

        // UV rotation
        int uvRotation = 0;
        if (faceObj.has("rotation")) {
            uvRotation = faceObj.get("rotation").getAsInt();
        }

        // Tint index
        int tintIndex = -1;
        if (faceObj.has("tintindex")) {
            tintIndex = faceObj.get("tintindex").getAsInt();
        }

        faces.put(facing, new FaceData(uv, textureKey, uvRotation, tintIndex));
    }

    private static ModelGroup parseGroup(JsonObject obj, List<ModelElement> allElements) {
        String name = obj.has("name") ? obj.get("name").getAsString() : "unnamed";

        float[] origin = new float[]{0.5f, 0.5f, 0.5f}; // default center
        if (obj.has("origin")) {
            origin = parseFloat3(obj.getAsJsonArray("origin"), PIXEL_TO_GL);
        }

        boolean visible = true;
        if (obj.has("visibility")) {
            visible = obj.get("visibility").getAsBoolean();
        }

        List<ModelElement> groupElements = new ArrayList<ModelElement>();
        List<ModelGroup> children = new ArrayList<ModelGroup>();

        if (obj.has("children")) {
            JsonArray childArr = obj.getAsJsonArray("children");
            for (int i = 0; i < childArr.size(); i++) {
                JsonElement child = childArr.get(i);
                if (child.isJsonPrimitive() && child.getAsJsonPrimitive().isNumber()) {
                    // Integer index -> reference to an element in allElements
                    int idx = child.getAsInt();
                    if (idx >= 0 && idx < allElements.size()) {
                        groupElements.add(allElements.get(idx));
                    }
                } else if (child.isJsonObject()) {
                    // Nested sub-group
                    children.add(parseGroup(child.getAsJsonObject(), allElements));
                }
            }
        }

        return new ModelGroup(name, origin, groupElements, children, visible);
    }

    /**
     * Recursively index all groups by name into the lookup map.
     */
    private static void indexGroups(ModelGroup group, Map<String, ModelGroup> map) {
        map.put(group.getName(), group);
        for (ModelGroup child : group.getChildren()) {
            indexGroups(child, map);
        }
    }

    /**
     * Parse a JSON array of 3 floats into a float[3], applying a scale factor.
     */
    private static float[] parseFloat3(JsonArray arr, float scale) {
        return new float[]{
                arr.get(0).getAsFloat() * scale,
                arr.get(1).getAsFloat() * scale,
                arr.get(2).getAsFloat() * scale
        };
    }

    /**
     * Extract the last path segment from a model ID.
     * "eriniumfaction:block/lootbox" -> "lootbox"
     */
    private static String path(String modelId) {
        String p = modelId;
        int colon = p.indexOf(':');
        if (colon >= 0) {
            p = p.substring(colon + 1);
        }
        int slash = p.lastIndexOf('/');
        if (slash >= 0) {
            p = p.substring(slash + 1);
        }
        return p;
    }
}
```

**Verification:**
- Build EriAPI.
- Grep for all 6 EnumFacing directions in `parseFace` calls to confirm none are missing.
- Grep for `PIXEL_TO_GL` to confirm it is applied to from, to, origin, and rotationOrigin.
- Confirm UV normalization divides by `textureSize` (not hardcoded 16).

---

## Task 3: Cache -- AnimModelCache

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimModelCache.java`

**Dependencies:** Tasks 1 and 2 must be complete.

- [ ] Step 1: Create `AnimModelCache.java`

```java
package fr.eri.eriapi.anim;

import fr.eri.eriapi.core.Reference;

import java.util.HashMap;
import java.util.Map;

/**
 * Singleton cache for parsed Blockbench models.
 * Each model is parsed exactly once from resources, then stored in memory.
 *
 * <p>Thread-safety: this cache is only accessed from the render thread (client side),
 * so no synchronization is needed.
 */
public class AnimModelCache {

    private static final Map<String, AnimatedBlockModel> cache = new HashMap<String, AnimatedBlockModel>();

    private AnimModelCache() {
        // Static utility class
    }

    /**
     * Get a parsed model by its ID. Parses from resources on first access.
     *
     * @param modelId resource path in format "modid:path/to/model" (e.g. "eriniumfaction:block/lootbox")
     * @return the cached model, or null if parsing failed
     */
    public static AnimatedBlockModel get(String modelId) {
        AnimatedBlockModel model = cache.get(modelId);
        if (model != null) {
            return model;
        }

        // Not cached yet -- parse from resources
        model = BlockbenchModelParser.parse(modelId);
        if (model != null) {
            cache.put(modelId, model);
            Reference.LOGGER.info("EriAPI - Cached animated block model: {} ({} elements, {} groups, {} textures)",
                    modelId, model.getElementCount(), model.getGroupCount(), model.getTextureCount());
        } else {
            Reference.LOGGER.warn("EriAPI - Failed to cache animated block model: {}", modelId);
        }

        return model;
    }

    /**
     * Check if a model is already cached.
     */
    public static boolean has(String modelId) {
        return cache.containsKey(modelId);
    }

    /**
     * Clear all cached models. Call on resource reload or world unload.
     */
    public static void clear() {
        int size = cache.size();
        cache.clear();
        if (size > 0) {
            Reference.LOGGER.info("EriAPI - Cleared {} cached animated block models", size);
        }
    }

    /**
     * Remove a single model from the cache (forces re-parse on next access).
     */
    public static void invalidate(String modelId) {
        cache.remove(modelId);
    }

    /**
     * Get the number of currently cached models.
     */
    public static int size() {
        return cache.size();
    }
}
```

**Verification:** Build EriAPI. Confirm the class compiles and uses `HashMap` (not `ConcurrentHashMap` -- render thread only).

---

## Task 4: AnimatedBlockTESR + AnimatedBlockTileEntity -- Static Rendering

**Files to create:**
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTileEntity.java`
- `D:\Mods Minecraft\EriAPI\src\main\java\fr\eri\eriapi\anim\AnimatedBlockTESR.java`

**Dependencies:** Tasks 1, 2, 3 must be complete.

- [ ] Step 1: Create `AnimatedBlockTileEntity.java`

```java
package fr.eri.eriapi.anim;

import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.network.NetworkManager;
import net.minecraft.network.play.server.SPacketUpdateTileEntity;
import net.minecraft.tileentity.TileEntity;
import net.minecraft.util.math.AxisAlignedBB;
import net.minecraftforge.fml.relauncher.Side;
import net.minecraftforge.fml.relauncher.SideOnly;

import javax.annotation.Nullable;

/**
 * Base TileEntity for blocks rendered with a Blockbench model via {@link AnimatedBlockTESR}.
 *
 * <p>Phase 1: stores the model ID and syncs it to the client. No animation state yet --
 * the TESR renders the model statically in its default pose.
 *
 * <p>Subclass this or use directly. Set the modelId before the TE is loaded on the client
 * (via NBT sync or constructor).
 */
public class AnimatedBlockTileEntity extends TileEntity {

    private String modelId = "";
    private double maxRenderDistance = 64.0;

    public AnimatedBlockTileEntity() {
    }

    public AnimatedBlockTileEntity(String modelId) {
        this.modelId = modelId;
    }

    // ---- Model ID ----

    public String getModelId() {
        return modelId;
    }

    public void setModelId(String modelId) {
        this.modelId = modelId;
        markDirty();
    }

    // ---- Render distance ----

    public void setMaxRenderDistance(double distance) {
        this.maxRenderDistance = distance;
    }

    @Override
    @SideOnly(Side.CLIENT)
    public double getMaxRenderDistanceSquared() {
        return maxRenderDistance * maxRenderDistance;
    }

    /**
     * Override bounding box to prevent culling of the TESR when the camera
     * is close but the block center is not in the frustum. Uses a 2-block
     * bounding box to give enough margin for models that extend beyond 1x1x1.
     */
    @Override
    @SideOnly(Side.CLIENT)
    public AxisAlignedBB getRenderBoundingBox() {
        return new AxisAlignedBB(
                pos.getX() - 1.0, pos.getY() - 1.0, pos.getZ() - 1.0,
                pos.getX() + 2.0, pos.getY() + 2.0, pos.getZ() + 2.0
        );
    }

    // ---- NBT persistence ----

    @Override
    public NBTTagCompound writeToNBT(NBTTagCompound compound) {
        super.writeToNBT(compound);
        compound.setString("animModelId", modelId);
        return compound;
    }

    @Override
    public void readFromNBT(NBTTagCompound compound) {
        super.readFromNBT(compound);
        modelId = compound.getString("animModelId");
    }

    // ---- Client sync ----

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
}
```

- [ ] Step 2: Create `AnimatedBlockTESR.java`

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
 * TileEntitySpecialRenderer that renders Blockbench models loaded via {@link AnimModelCache}.
 *
 * <p>Phase 1: static rendering only (no animation). Renders the model in its default
 * pose with full multi-texture support. Each element is drawn as a textured box with
 * per-face UV mapping and optional element-level rotation.
 *
 * <p>Rendering pipeline per frame:
 * <ol>
 *   <li>Retrieve cached model from {@link AnimModelCache}</li>
 *   <li>Push global matrix, translate to block position</li>
 *   <li>For each root group, recursively render: push matrix, translate to pivot,
 *       render elements, render child groups, pop matrix</li>
 *   <li>Each element: apply element rotation around its origin, then draw 6 faces
 *       as textured quads with the appropriate texture bound</li>
 * </ol>
 */
@SideOnly(Side.CLIENT)
public class AnimatedBlockTESR extends TileEntitySpecialRenderer<AnimatedBlockTileEntity> {

    /** The last bound texture key, used to minimize texture bind calls. */
    private ResourceLocation lastBoundTexture = null;
    /** Reference to the current model's texture map during a render pass. */
    private Map<String, ResourceLocation> currentTextures = null;

    @Override
    public void render(AnimatedBlockTileEntity te, double x, double y, double z,
                       float partialTicks, int destroyStage, float alpha) {
        String modelId = te.getModelId();
        if (modelId == null || modelId.isEmpty()) return;

        AnimatedBlockModel model = AnimModelCache.get(modelId);
        if (model == null) return;

        currentTextures = model.getTextures();
        lastBoundTexture = null;

        GlStateManager.pushMatrix();
        GlStateManager.translate(x, y, z);

        // Enable standard rendering state
        GlStateManager.enableRescaleNormal();
        GlStateManager.color(1.0f, 1.0f, 1.0f, 1.0f);

        // Render all root groups recursively
        List<ModelGroup> rootGroups = model.getRootGroups();
        for (int i = 0; i < rootGroups.size(); i++) {
            renderGroup(rootGroups.get(i));
        }

        GlStateManager.disableRescaleNormal();
        GlStateManager.popMatrix();

        currentTextures = null;
        lastBoundTexture = null;
    }

    private void renderGroup(ModelGroup group) {
        if (!group.isVisible()) return;

        GlStateManager.pushMatrix();

        // Translate to pivot point (the group's origin in OpenGL units)
        float[] pivot = group.getOrigin();
        GlStateManager.translate(pivot[0], pivot[1], pivot[2]);

        // Phase 1: no animated rotation/translation/scale -- default pose only
        // Future phases will apply AnimationController state here:
        //   GlStateManager.translate(trans[0], trans[1], trans[2]);
        //   GlStateManager.rotate(rot[0], 1, 0, 0); etc.

        // Translate back from pivot (so elements render at their absolute positions)
        GlStateManager.translate(-pivot[0], -pivot[1], -pivot[2]);

        // Render elements belonging to this group
        List<ModelElement> elements = group.getElements();
        for (int i = 0; i < elements.size(); i++) {
            renderElement(elements.get(i));
        }

        // Render child groups recursively
        List<ModelGroup> children = group.getChildren();
        for (int i = 0; i < children.size(); i++) {
            renderGroup(children.get(i));
        }

        GlStateManager.popMatrix();
    }

    private void renderElement(ModelElement elem) {
        float[] from = elem.getFrom();
        float[] to = elem.getTo();

        // Apply element-level rotation if present
        boolean hasRotation = elem.getRotationAxis() != null && elem.getRotationAngle() != 0f;
        if (hasRotation) {
            GlStateManager.pushMatrix();
            float[] rotOrigin = elem.getRotationOrigin();
            if (rotOrigin != null) {
                GlStateManager.translate(rotOrigin[0], rotOrigin[1], rotOrigin[2]);
            }

            float angle = elem.getRotationAngle();
            String axis = elem.getRotationAxis();
            if ("x".equals(axis)) {
                GlStateManager.rotate(angle, 1, 0, 0);
            } else if ("y".equals(axis)) {
                GlStateManager.rotate(angle, 0, 1, 0);
            } else if ("z".equals(axis)) {
                GlStateManager.rotate(angle, 0, 0, 1);
            }

            if (rotOrigin != null) {
                GlStateManager.translate(-rotOrigin[0], -rotOrigin[1], -rotOrigin[2]);
            }
        }

        // Draw each face
        Map<EnumFacing, FaceData> faces = elem.getFaces();
        for (Map.Entry<EnumFacing, FaceData> entry : faces.entrySet()) {
            EnumFacing facing = entry.getKey();
            FaceData face = entry.getValue();

            // Bind texture if different from last
            bindTexture(face.getTextureKey());

            // Draw the quad for this face
            drawFace(from, to, facing, face);
        }

        if (hasRotation) {
            GlStateManager.popMatrix();
        }
    }

    private void bindTexture(String textureKey) {
        if (currentTextures == null || textureKey == null || textureKey.isEmpty()) return;

        ResourceLocation tex = currentTextures.get(textureKey);
        if (tex == null) return;

        // Only re-bind if texture changed
        if (!tex.equals(lastBoundTexture)) {
            Minecraft.getMinecraft().getTextureManager().bindTexture(tex);
            lastBoundTexture = tex;
        }
    }

    /**
     * Draw a single face of a box as a textured quad.
     *
     * @param from box min corner [x, y, z] in OpenGL units
     * @param to   box max corner [x, y, z] in OpenGL units
     * @param facing which face to draw
     * @param face UV and texture data for this face
     */
    private void drawFace(float[] from, float[] to, EnumFacing facing, FaceData face) {
        float[] uv = face.getUv();
        float u1 = uv[0];
        float v1 = uv[1];
        float u2 = uv[2];
        float v2 = uv[3];

        // Apply UV rotation
        // UV rotation rotates the UV coordinates on the face quad
        float[][] uvCoords = computeUvCoords(u1, v1, u2, v2, face.getUvRotation());

        float x0 = from[0];
        float y0 = from[1];
        float z0 = from[2];
        float x1 = to[0];
        float y1 = to[1];
        float z1 = to[2];

        Tessellator tessellator = Tessellator.getInstance();
        BufferBuilder buffer = tessellator.getBuffer();
        buffer.begin(GL11.GL_QUADS, DefaultVertexFormats.POSITION_TEX_NORMAL);

        switch (facing) {
            case DOWN: // -Y face
                buffer.pos(x0, y0, z1).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, -1, 0).endVertex();
                buffer.pos(x0, y0, z0).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, -1, 0).endVertex();
                buffer.pos(x1, y0, z0).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, -1, 0).endVertex();
                buffer.pos(x1, y0, z1).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, -1, 0).endVertex();
                break;
            case UP: // +Y face
                buffer.pos(x0, y1, z0).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, 1, 0).endVertex();
                buffer.pos(x0, y1, z1).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, 1, 0).endVertex();
                buffer.pos(x1, y1, z1).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, 1, 0).endVertex();
                buffer.pos(x1, y1, z0).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, 1, 0).endVertex();
                break;
            case NORTH: // -Z face
                buffer.pos(x1, y1, z0).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, 0, -1).endVertex();
                buffer.pos(x1, y0, z0).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, 0, -1).endVertex();
                buffer.pos(x0, y0, z0).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, 0, -1).endVertex();
                buffer.pos(x0, y1, z0).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, 0, -1).endVertex();
                break;
            case SOUTH: // +Z face
                buffer.pos(x0, y1, z1).tex(uvCoords[0][0], uvCoords[0][1]).normal(0, 0, 1).endVertex();
                buffer.pos(x0, y0, z1).tex(uvCoords[1][0], uvCoords[1][1]).normal(0, 0, 1).endVertex();
                buffer.pos(x1, y0, z1).tex(uvCoords[2][0], uvCoords[2][1]).normal(0, 0, 1).endVertex();
                buffer.pos(x1, y1, z1).tex(uvCoords[3][0], uvCoords[3][1]).normal(0, 0, 1).endVertex();
                break;
            case WEST: // -X face
                buffer.pos(x0, y1, z0).tex(uvCoords[0][0], uvCoords[0][1]).normal(-1, 0, 0).endVertex();
                buffer.pos(x0, y0, z0).tex(uvCoords[1][0], uvCoords[1][1]).normal(-1, 0, 0).endVertex();
                buffer.pos(x0, y0, z1).tex(uvCoords[2][0], uvCoords[2][1]).normal(-1, 0, 0).endVertex();
                buffer.pos(x0, y1, z1).tex(uvCoords[3][0], uvCoords[3][1]).normal(-1, 0, 0).endVertex();
                break;
            case EAST: // +X face
                buffer.pos(x1, y1, z1).tex(uvCoords[0][0], uvCoords[0][1]).normal(1, 0, 0).endVertex();
                buffer.pos(x1, y0, z1).tex(uvCoords[1][0], uvCoords[1][1]).normal(1, 0, 0).endVertex();
                buffer.pos(x1, y0, z0).tex(uvCoords[2][0], uvCoords[2][1]).normal(1, 0, 0).endVertex();
                buffer.pos(x1, y1, z0).tex(uvCoords[3][0], uvCoords[3][1]).normal(1, 0, 0).endVertex();
                break;
        }

        tessellator.draw();
    }

    /**
     * Compute the 4 UV coordinate pairs for a quad, applying UV rotation.
     *
     * <p>Base UV layout (rotation = 0):
     * <pre>
     *   [0] = top-left     (u1, v1)
     *   [1] = bottom-left  (u1, v2)
     *   [2] = bottom-right (u2, v2)
     *   [3] = top-right    (u2, v1)
     * </pre>
     *
     * @param u1 left U
     * @param v1 top V
     * @param u2 right U
     * @param v2 bottom V
     * @param rotation 0, 90, 180, or 270 degrees
     * @return array of 4 float[2] UV pairs
     */
    private float[][] computeUvCoords(float u1, float v1, float u2, float v2, int rotation) {
        float[][] base = new float[][]{
                {u1, v1}, // top-left
                {u1, v2}, // bottom-left
                {u2, v2}, // bottom-right
                {u2, v1}  // top-right
        };

        // Rotate UV indices: rotation of 90 shifts indices by 1
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

**Verification:**
- Build EriAPI.
- Confirm all 6 `EnumFacing` cases are handled in `drawFace` switch.
- Confirm the TESR uses `Tessellator` + `BufferBuilder` (the standard Forge 1.12.2 approach).
- Confirm `getMaxRenderDistanceSquared` is overridden on the TE.
- Confirm `getRenderBoundingBox` returns an expanded AABB to prevent frustum culling.

---

## Task 5: Validation Test Block in EriniumFaction

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\src\main\java\fr\eriniumgroup\eriniumfaction\content\lootbox\TileLootbox.java`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\src\main\java\fr\eriniumgroup\eriniumfaction\proxy\ClientProxy.java` -- register TESR
- `D:\Mods Minecraft\EriniumFaction\src\main\java\fr\eriniumgroup\eriniumfaction\EriniumFaction.java` -- register TE + block via EriBlock builder (or wherever blocks are registered)

**Assets to copy:**
- `C:\Users\killi\Pictures\Mcreator-Resources\3d models\lootbox\lootbox.json` --> `src/main/resources/assets/eriniumfaction/models/block/lootbox.json`
- All 13 PNG textures from `C:\Users\killi\Pictures\Mcreator-Resources\3d models\lootbox\` --> `src/main/resources/assets/eriniumfaction/textures/blocks/lootbox/`
  - `logo_animated.png`, `rarity_top.png`, `top_pedestral.png`, `interior_cube.png`, `corner_cube.png`, `corner_joint.png`, `side_plate.png`, `side_middle_plate.png`, `side_plate_core.png`, `side_cable.png`, `side_core.png`, `rocks.png`
  - Skip `rarity_beam.png` only if it is not referenced in the model (check the JSON -- it IS referenced as texture key `rarity_beam.png` is NOT in the textures map, but double-check)

**Lang keys to add:**
- `src/main/resources/assets/eriniumfaction/lang/en_US.lang`: `tile.eriniumfaction.lootbox.name=Lootbox`
- `src/main/resources/assets/eriniumfaction/lang/fr_FR.lang`: `tile.eriniumfaction.lootbox.name=Lootbox`

**Dependencies:** Tasks 1-4 must be complete. EriAPI must be rebuilt and its jar copied to EriniumFaction/libs/.

- [ ] Step 1: Copy textures from the lootbox source folder

```bash
# Create target directory
mkdir -p "D:/Mods Minecraft/EriniumFaction/src/main/resources/assets/eriniumfaction/textures/blocks/lootbox"

# Copy all PNG textures
cp "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/logo_animated.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/rarity_top.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/top_pedestral.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/interior_cube.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/corner_cube.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/corner_joint.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/side_plate.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/side_middle_plate.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/side_plate_core.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/side_cable.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/side_core.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/rocks.png" \
   "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/rarity_beam.png" \
   "D:/Mods Minecraft/EriniumFaction/src/main/resources/assets/eriniumfaction/textures/blocks/lootbox/"
```

- [ ] Step 2: Copy the Blockbench model JSON

```bash
mkdir -p "D:/Mods Minecraft/EriniumFaction/src/main/resources/assets/eriniumfaction/models/block"
cp "C:/Users/killi/Pictures/Mcreator-Resources/3d models/lootbox/lootbox.json" \
   "D:/Mods Minecraft/EriniumFaction/src/main/resources/assets/eriniumfaction/models/block/lootbox.json"
```

- [ ] Step 3: Create `TileLootbox.java`

```java
package fr.eriniumgroup.eriniumfaction.content.lootbox;

import fr.eri.eriapi.anim.AnimatedBlockTileEntity;

/**
 * Test TileEntity for the lootbox animated block.
 * Uses the EriAPI animation framework to render the Blockbench model.
 */
public class TileLootbox extends AnimatedBlockTileEntity {

    public TileLootbox() {
        super("eriniumfaction:block/lootbox");
    }
}
```

- [ ] Step 4: Register the block, TileEntity, and TESR

In `EriniumFaction.java` preInit (or wherever blocks are registered -- check existing registration pattern):

```java
// Register TileEntity for the lootbox
GameRegistry.registerTileEntity(TileLootbox.class,
        new ResourceLocation(MODID, "lootbox"));

// Register block via EriBlock builder
EriBlock.create(MODID, "lootbox")
        .material(Material.IRON)
        .hardness(5.0f)
        .resistance(10.0f)
        .opaque(false)
        .fullCube(false)
        .tileEntity(TileLootbox.class)
        .creativeTab(CreativeTabs.DECORATIONS)
        .register();
```

In `ClientProxy.java` preInit, add the TESR binding:

```java
// Register lootbox TESR (Blockbench animated model via EriAPI)
net.minecraftforge.fml.client.registry.ClientRegistry.bindTileEntitySpecialRenderer(
        fr.eriniumgroup.eriniumfaction.content.lootbox.TileLootbox.class,
        new fr.eri.eriapi.anim.AnimatedBlockTESR());
```

- [ ] Step 5: Add lang keys

Append to `en_US.lang`:
```
tile.eriniumfaction.lootbox.name=Lootbox
```

Append to `fr_FR.lang`:
```
tile.eriniumfaction.lootbox.name=Lootbox
```

- [ ] Step 6: Rebuild EriAPI, copy jar, build EriniumFaction

```bash
# Build EriAPI
cd "D:/Mods Minecraft/EriAPI" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build

# Copy the updated jar (check the exact filename after build)
cp "D:/Mods Minecraft/EriAPI/build/libs/eriapi-1.2.0-1.12.2.jar" "D:/Mods Minecraft/EriniumFaction/libs/"

# Build EriniumFaction
cd "D:/Mods Minecraft/EriniumFaction" && JAVA_HOME="C:/Users/killi/.jdks/corretto-1.8.0_482" ./gradlew build
```

- [ ] Step 7: Verify registration completeness

```bash
# Verify TileLootbox extends AnimatedBlockTileEntity
grep -r "extends AnimatedBlockTileEntity" "D:/Mods Minecraft/EriniumFaction/src/"

# Verify TESR registration in ClientProxy
grep -r "TileLootbox" "D:/Mods Minecraft/EriniumFaction/src/main/java/fr/eriniumgroup/eriniumfaction/proxy/ClientProxy.java"

# Verify TE registration
grep -r "registerTileEntity.*lootbox" "D:/Mods Minecraft/EriniumFaction/src/"

# Verify EriBlock registration
grep -r "EriBlock.create.*lootbox" "D:/Mods Minecraft/EriniumFaction/src/"

# Verify lang keys
grep -r "lootbox" "D:/Mods Minecraft/EriniumFaction/src/main/resources/assets/eriniumfaction/lang/"

# Verify all 13 textures are present
ls "D:/Mods Minecraft/EriniumFaction/src/main/resources/assets/eriniumfaction/textures/blocks/lootbox/"

# Verify model JSON is present
ls "D:/Mods Minecraft/EriniumFaction/src/main/resources/assets/eriniumfaction/models/block/lootbox.json"
```

**Verification:** Both EriAPI and EriniumFaction build with zero errors. The lootbox block can be placed in-game (Creative tab: Decorations) and the Blockbench model renders statically via the TESR with all 13 textures correctly mapped.

---

## Implementation Order & Commit Strategy

| Commit | Task | Scope | Build Target |
|--------|------|-------|--------------|
| 1 | Task 1 | Data classes (4 files in `fr.eri.eriapi.anim`) | EriAPI |
| 2 | Task 2 | Parser (`BlockbenchModelParser.java`) | EriAPI |
| 3 | Task 3 | Cache (`AnimModelCache.java`) | EriAPI |
| 4 | Task 4 | TESR + TileEntity (2 files in `fr.eri.eriapi.anim`) | EriAPI |
| 5 | Task 5 | Test block + assets + TESR registration in EriniumFaction | EriniumFaction (after copying EriAPI jar) |

## Known Risks & Mitigations

1. **UV mapping mismatch**: Blockbench UV can have u2 < u1 or v2 < v1 (flipped faces). The TESR drawFace method handles this naturally because it passes raw UV coordinates to the vertex buffer -- OpenGL handles the flip.

2. **Texture path resolution**: The parser assumes textures are at `textures/blocks/<modelBaseName>/<value>.png`. If a model uses a different path convention, the texture will fail to load (white faces). Check the model's texture map against the actual file paths.

3. **Display list optimization**: Phase 1 uses immediate mode (Tessellator per face). This is fine for a handful of blocks but will need display list or VBO optimization in later phases for scenes with many animated blocks. The spec mentions this under Performance (Section 10).

4. **Element rotation rescale**: Blockbench supports `rescale: true` on element rotations which scales the element to fill the block bounds after rotation. This is rare and not supported in Phase 1. If the lootbox model uses it, elements may appear slightly too small after rotation.

5. **Texture size detection**: If the model JSON has no `texture_size` field, the parser defaults to 16x16. If the actual textures are larger (32x32, 64x64), UVs will be wrong. Check the lootbox model for this field. If missing but textures are larger, the parser needs to read the actual PNG dimensions or the field must be added to the JSON manually.
