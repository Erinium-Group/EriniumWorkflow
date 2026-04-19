# Block Animation Framework -- Phase 4 : Editeur d'Animation Python (EriAnim Editor)

> **For agentic workers:** This is a standalone Python project. No Java build needed. After each task, verify the app launches with `cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && python main.py` (requires Python 3.11+ and deps from requirements.txt). Type hints everywhere. PyQt6 for GUI, PyOpenGL for 3D, numpy for math, Pillow for textures.

**Goal:** Build a standalone desktop animation editor that imports Blockbench JSON models, provides a 3D viewport with orbit camera, a multi-track timeline with keyframes and easings, a properties panel for editing keyframes/animation settings/events, and exports `.erianim.json` files conforming to the spec (format_version 1). The editor must be fully functional after all 4 tasks.

**Architecture:** Standalone Python project at `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\`. Modular package structure: `editor/model/` (data), `editor/viewport/` (OpenGL), `editor/timeline/` (timeline widget), `editor/panels/` (tree + properties), `editor/commands/` (undo/redo), `editor/export/` (erianim export).

**Reference model:** `C:\Users\killi\Pictures\Mcreator-Resources\3d models\lootbox\lootbox.json` -- 1324 lines, 13 textures, 85 elements, 8 root groups with nested sub-groups (front > midcore > hexadecagon, corner > joint > vertical/horizontal, Top > rocks/raritybeam).

**Reference .erianim format:** See spec section 05 of `docs/specs/block-animation-framework.html`. Key points: format_version 1, model ResourceLocation, animations map with duration/endBehavior/tracks/events. Tracks per group: rotation (float[3] degrees), translation (float[3] BB pixels), scale (float[3]), visible (boolean), spin (speed+axis), texture (target+value). Events: sound, particle, callback, hide_group, show_group, cut.

**Easings supported:** linear, ease_in, ease_out, ease_in_out, ease_in_cubic, ease_out_cubic, bounce, elastic, ease_in_back, ease_out_back, spring.

**EndBehaviors:** freeze, rollback, rollback_instant, wait_server, loop, loop_count, loop_pause.

---

## Task 1: Project Setup + Blockbench Parser + OpenGL Viewport with Textured Model

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\main.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\requirements.txt`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\__init__.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\main_window.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\model\__init__.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\model\model_data.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\model\blockbench_parser.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\model\animation_data.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\model\project.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\viewport\__init__.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\viewport\camera.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\viewport\texture_manager.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\viewport\renderer.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\viewport\gl_widget.py`

**Files to modify:** None (all new).

**Dependencies:** PyQt6, PyOpenGL, numpy, Pillow.

**After this task:** The user can open a Blockbench JSON file via File > Open, see the full 3D model with textures in the viewport, orbit the camera with right-click drag, zoom with mouse wheel, pan with middle-click drag. Grid and colored axes are visible.

- [ ] Step 1: Create `requirements.txt`

```
PyQt6>=6.5
PyOpenGL>=3.1
numpy>=1.24
Pillow>=10.0
```

- [ ] Step 2: Create `editor/__init__.py`

```python
"""EriAnim Editor -- Blockbench animation editor for .erianim format."""
```

- [ ] Step 3: Create `editor/model/__init__.py`

```python
"""Data model classes for Blockbench models and .erianim animations."""
```

- [ ] Step 4: Create `editor/model/model_data.py`

```python
"""Data classes for parsed Blockbench JSON models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class BBFace:
    """A single face of a Blockbench element with UV and texture info."""
    uv: list[float]  # [u1, v1, u2, v2] normalized 0-1
    texture_key: str  # key in BBModel.textures (e.g. "side_cable.png")
    uv_rotation: int = 0  # 0, 90, 180, 270


@dataclass
class BBElement:
    """A single box element from a Blockbench model.
    All coordinates stored in OpenGL units (Blockbench pixels / 16).
    """
    from_pos: list[float]  # [x, y, z] OpenGL units
    to_pos: list[float]    # [x, y, z] OpenGL units
    rotation_angle: float = 0.0  # degrees
    rotation_axis: Optional[str] = None  # "x", "y", "z"
    rotation_origin: Optional[list[float]] = None  # [x, y, z] OpenGL units
    faces: Dict[str, BBFace] = field(default_factory=dict)  # "north","east","south","west","up","down"
    name: Optional[str] = None


@dataclass
class BBGroup:
    """A named group of elements with a pivot point and children."""
    name: str
    origin: list[float]  # pivot [x, y, z] OpenGL units
    elements: List[BBElement] = field(default_factory=list)
    children: List[BBGroup] = field(default_factory=list)
    visible: bool = True


@dataclass
class BBModel:
    """A fully parsed Blockbench model."""
    root_groups: List[BBGroup] = field(default_factory=list)
    groups_by_name: Dict[str, BBGroup] = field(default_factory=dict)
    textures: Dict[str, str] = field(default_factory=dict)  # key -> filename (no path)
    texture_size: list[int] = field(default_factory=lambda: [16, 16])
    all_elements: List[BBElement] = field(default_factory=list)  # flat list for rendering
    source_path: str = ""  # path to the .json file (for locating textures)
```

- [ ] Step 5: Create `editor/model/animation_data.py`

```python
"""Data classes for .erianim animation definitions."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class EndBehavior(Enum):
    FREEZE = "freeze"
    ROLLBACK = "rollback"
    ROLLBACK_INSTANT = "rollback_instant"
    WAIT_SERVER = "wait_server"
    LOOP = "loop"
    LOOP_COUNT = "loop_count"
    LOOP_PAUSE = "loop_pause"


class EasingType(Enum):
    LINEAR = "linear"
    EASE_IN = "ease_in"
    EASE_OUT = "ease_out"
    EASE_IN_OUT = "ease_in_out"
    EASE_IN_CUBIC = "ease_in_cubic"
    EASE_OUT_CUBIC = "ease_out_cubic"
    BOUNCE = "bounce"
    ELASTIC = "elastic"
    EASE_IN_BACK = "ease_in_back"
    EASE_OUT_BACK = "ease_out_back"
    SPRING = "spring"


class TrackType(Enum):
    ROTATION = "rotation"
    TRANSLATION = "translation"
    SCALE = "scale"
    VISIBLE = "visible"
    SPIN = "spin"
    TEXTURE = "texture"


class EventType(Enum):
    SOUND = "sound"
    PARTICLE = "particle"
    CALLBACK = "callback"
    HIDE_GROUP = "hide_group"
    SHOW_GROUP = "show_group"
    CUT = "cut"


@dataclass
class Keyframe:
    """A standard keyframe (rotation, translation, scale)."""
    tick: int
    value: list[float]  # [x, y, z]
    easing: EasingType = EasingType.LINEAR


@dataclass
class VisibleKeyframe:
    """A visibility keyframe (boolean, no interpolation)."""
    tick: int
    value: bool


@dataclass
class SpinKeyframe:
    """A spin keyframe (continuous rotation speed)."""
    tick: int
    axis: str  # "x", "y", "z"
    speed: float  # degrees per second
    easing: EasingType = EasingType.LINEAR


@dataclass
class TextureKeyframe:
    """A texture swap keyframe (no interpolation)."""
    tick: int
    target: str  # texture name to replace
    value: str  # replacement texture name


@dataclass
class AnimEvent:
    """An animation event triggered at a specific tick."""
    tick: int
    event_type: EventType
    value: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)  # volume, pitch, count, spread


@dataclass
class GroupTrack:
    """All animation tracks for a single group."""
    group_name: str
    rotation: List[Keyframe] = field(default_factory=list)
    translation: List[Keyframe] = field(default_factory=list)
    scale: List[Keyframe] = field(default_factory=list)
    visible: List[VisibleKeyframe] = field(default_factory=list)
    spin: List[SpinKeyframe] = field(default_factory=list)
    texture: List[TextureKeyframe] = field(default_factory=list)


@dataclass
class AnimDef:
    """A single animation definition."""
    name: str
    duration: int = 20  # ticks
    end_behavior: EndBehavior = EndBehavior.FREEZE
    rollback_duration: int = 0
    blend_in: int = 0
    blend_out: int = 0
    loop_count: int = 0
    loop_pause: int = 0
    tracks: Dict[str, GroupTrack] = field(default_factory=dict)  # group_name -> GroupTrack
    events: List[AnimEvent] = field(default_factory=list)


@dataclass
class AnimFile:
    """A complete .erianim file with one or more animations."""
    format_version: int = 1
    model: str = ""  # ResourceLocation string e.g. "eriniumfaction:block/lootbox"
    animations: Dict[str, AnimDef] = field(default_factory=dict)
```

- [ ] Step 6: Create `editor/model/project.py`

```python
"""Project state: holds the current model, animations, and editor state."""

from __future__ import annotations

from typing import Dict, List, Optional

from editor.model.animation_data import AnimDef, AnimFile
from editor.model.model_data import BBModel


class Project:
    """Central project state for the editor."""

    def __init__(self) -> None:
        self.model: Optional[BBModel] = None
        self.anim_file: AnimFile = AnimFile()
        self.current_animation_name: Optional[str] = None
        self.current_tick: int = 0
        self.selected_group_name: Optional[str] = None
        self.selected_keyframe_index: Optional[int] = None
        self.selected_track_type: Optional[str] = None
        self.is_dirty: bool = False
        self.project_path: Optional[str] = None

    @property
    def current_animation(self) -> Optional[AnimDef]:
        if self.current_animation_name and self.current_animation_name in self.anim_file.animations:
            return self.anim_file.animations[self.current_animation_name]
        return None

    def group_names(self) -> List[str]:
        """Return all group names from the loaded model."""
        if self.model is None:
            return []
        return list(self.model.groups_by_name.keys())

    def create_animation(self, name: str, duration: int = 20) -> AnimDef:
        """Create a new animation and set it as current."""
        anim = AnimDef(name=name, duration=duration)
        self.anim_file.animations[name] = anim
        self.current_animation_name = name
        self.is_dirty = True
        return anim

    def delete_animation(self, name: str) -> None:
        """Delete an animation by name."""
        if name in self.anim_file.animations:
            del self.anim_file.animations[name]
            if self.current_animation_name == name:
                names = list(self.anim_file.animations.keys())
                self.current_animation_name = names[0] if names else None
            self.is_dirty = True

    def has_model(self) -> bool:
        return self.model is not None
```

- [ ] Step 7: Create `editor/model/blockbench_parser.py`

```python
"""Parser for Blockbench JSON model files (.json)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from editor.model.model_data import BBElement, BBFace, BBGroup, BBModel


def parse_blockbench(file_path: str) -> BBModel:
    """Parse a Blockbench JSON file into a BBModel.

    Coordinates are converted from Blockbench pixels to OpenGL units (/ 16).
    UVs are normalized by texture_size.
    Groups with "particle" texture are skipped in textures map.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        data: Dict[str, Any] = json.load(f)

    model = BBModel()
    model.source_path = file_path

    # --- Texture size ---
    tex_w: int = 16
    tex_h: int = 16
    if "texture_size" in data:
        tex_w = data["texture_size"][0]
        tex_h = data["texture_size"][1]
    model.texture_size = [tex_w, tex_h]

    # --- Textures ---
    raw_textures: Dict[str, str] = data.get("textures", {})
    for key, value in raw_textures.items():
        if key == "particle":
            continue
        model.textures[key] = value

    # --- Elements ---
    raw_elements: List[Dict[str, Any]] = data.get("elements", [])
    parsed_elements: List[BBElement] = []
    for elem_data in raw_elements:
        parsed_elements.append(_parse_element(elem_data, tex_w, tex_h))
    model.all_elements = parsed_elements

    # --- Groups ---
    raw_groups: List[Any] = data.get("groups", [])
    for group_data in raw_groups:
        if isinstance(group_data, dict):
            group = _parse_group(group_data, parsed_elements)
            model.root_groups.append(group)
            _index_groups(group, model.groups_by_name)

    return model


def _parse_element(elem_data: Dict[str, Any], tex_w: int, tex_h: int) -> BBElement:
    """Parse a single element from JSON into BBElement."""
    from_raw = elem_data.get("from", [0, 0, 0])
    to_raw = elem_data.get("to", [0, 0, 0])

    from_pos = [from_raw[0] / 16.0, from_raw[1] / 16.0, from_raw[2] / 16.0]
    to_pos = [to_raw[0] / 16.0, to_raw[1] / 16.0, to_raw[2] / 16.0]

    rotation_angle: float = 0.0
    rotation_axis: Optional[str] = None
    rotation_origin: Optional[list[float]] = None

    rot_data = elem_data.get("rotation")
    if rot_data:
        rotation_angle = float(rot_data.get("angle", 0))
        rotation_axis = rot_data.get("axis")
        origin_raw = rot_data.get("origin", [8, 8, 8])
        rotation_origin = [origin_raw[0] / 16.0, origin_raw[1] / 16.0, origin_raw[2] / 16.0]

    faces: Dict[str, BBFace] = {}
    raw_faces = elem_data.get("faces", {})
    for face_name, face_data in raw_faces.items():
        uv_raw = face_data.get("uv", [0, 0, 16, 16])
        # Normalize UV by texture size
        uv = [
            uv_raw[0] / tex_w,
            uv_raw[1] / tex_h,
            uv_raw[2] / tex_w,
            uv_raw[3] / tex_h,
        ]
        texture_ref: str = face_data.get("texture", "")
        # Strip leading '#'
        if texture_ref.startswith("#"):
            texture_ref = texture_ref[1:]
        uv_rotation: int = face_data.get("rotation", 0)
        faces[face_name] = BBFace(uv=uv, texture_key=texture_ref, uv_rotation=uv_rotation)

    name = elem_data.get("name")

    return BBElement(
        from_pos=from_pos,
        to_pos=to_pos,
        rotation_angle=rotation_angle,
        rotation_axis=rotation_axis,
        rotation_origin=rotation_origin,
        faces=faces,
        name=name,
    )


def _parse_group(group_data: Dict[str, Any], all_elements: List[BBElement]) -> BBGroup:
    """Recursively parse a group from JSON. Children can be int indices or nested group dicts."""
    name: str = group_data.get("name", "unnamed")
    origin_raw = group_data.get("origin", [8, 8, 8])
    origin = [origin_raw[0] / 16.0, origin_raw[1] / 16.0, origin_raw[2] / 16.0]

    elements: List[BBElement] = []
    children: List[BBGroup] = []

    for child in group_data.get("children", []):
        if isinstance(child, int):
            if 0 <= child < len(all_elements):
                elements.append(all_elements[child])
        elif isinstance(child, dict):
            children.append(_parse_group(child, all_elements))

    return BBGroup(name=name, origin=origin, elements=elements, children=children)


def _index_groups(group: BBGroup, index: Dict[str, BBGroup]) -> None:
    """Recursively index all groups by name."""
    index[group.name] = group
    for child in group.children:
        _index_groups(child, index)
```

- [ ] Step 8: Create `editor/viewport/__init__.py`

```python
"""OpenGL viewport for 3D model rendering."""
```

- [ ] Step 9: Create `editor/viewport/camera.py`

```python
"""Orbit camera for the 3D viewport."""

from __future__ import annotations

import math

import numpy as np


class Camera:
    """Orbit camera with yaw, pitch, distance, and target point."""

    def __init__(self) -> None:
        self.yaw: float = -45.0  # degrees
        self.pitch: float = 25.0  # degrees
        self.distance: float = 3.0  # units from target
        self.target: np.ndarray = np.array([0.5, 0.5, 0.5], dtype=np.float32)  # center of a block

        # Limits
        self.min_distance: float = 0.5
        self.max_distance: float = 20.0
        self.min_pitch: float = -89.0
        self.max_pitch: float = 89.0

        # Sensitivity
        self.orbit_sensitivity: float = 0.3
        self.zoom_sensitivity: float = 0.15
        self.pan_sensitivity: float = 0.003

    def orbit(self, dx: float, dy: float) -> None:
        """Orbit the camera (right-click drag)."""
        self.yaw += dx * self.orbit_sensitivity
        self.pitch -= dy * self.orbit_sensitivity
        self.pitch = max(self.min_pitch, min(self.max_pitch, self.pitch))

    def zoom(self, delta: float) -> None:
        """Zoom in/out (mouse wheel)."""
        self.distance -= delta * self.zoom_sensitivity
        self.distance = max(self.min_distance, min(self.max_distance, self.distance))

    def pan(self, dx: float, dy: float) -> None:
        """Pan the camera (middle-click drag)."""
        # Compute right and up vectors from current orientation
        yaw_rad = math.radians(self.yaw)
        pitch_rad = math.radians(self.pitch)

        right = np.array([
            math.cos(yaw_rad),
            0.0,
            math.sin(yaw_rad),
        ], dtype=np.float32)

        forward = np.array([
            math.sin(yaw_rad) * math.cos(pitch_rad),
            math.sin(pitch_rad),
            -math.cos(yaw_rad) * math.cos(pitch_rad),
        ], dtype=np.float32)

        up = np.cross(right, forward)
        up = up / (np.linalg.norm(up) + 1e-8)

        scale = self.distance * self.pan_sensitivity
        self.target += right * (-dx * scale)
        self.target += up * (dy * scale)

    def eye_position(self) -> np.ndarray:
        """Calculate the camera eye position from yaw/pitch/distance."""
        yaw_rad = math.radians(self.yaw)
        pitch_rad = math.radians(self.pitch)

        eye = np.array([
            self.target[0] + self.distance * math.cos(pitch_rad) * math.sin(yaw_rad),
            self.target[1] + self.distance * math.sin(pitch_rad),
            self.target[2] + self.distance * math.cos(pitch_rad) * math.cos(yaw_rad),
        ], dtype=np.float32)
        return eye

    def view_matrix(self) -> np.ndarray:
        """Build a 4x4 lookAt view matrix."""
        eye = self.eye_position()
        target = self.target
        up = np.array([0.0, 1.0, 0.0], dtype=np.float32)

        f = target - eye
        f = f / (np.linalg.norm(f) + 1e-8)

        s = np.cross(f, up)
        s = s / (np.linalg.norm(s) + 1e-8)

        u = np.cross(s, f)

        mat = np.eye(4, dtype=np.float32)
        mat[0, 0] = s[0]; mat[0, 1] = s[1]; mat[0, 2] = s[2]
        mat[1, 0] = u[0]; mat[1, 1] = u[1]; mat[1, 2] = u[2]
        mat[2, 0] = -f[0]; mat[2, 1] = -f[1]; mat[2, 2] = -f[2]
        mat[0, 3] = -np.dot(s, eye)
        mat[1, 3] = -np.dot(u, eye)
        mat[2, 3] = np.dot(f, eye)

        return mat

    def focus_on(self, center: np.ndarray, size: float = 1.0) -> None:
        """Focus the camera on a specific point."""
        self.target = center.copy()
        self.distance = max(self.min_distance, size * 2.5)
```

- [ ] Step 10: Create `editor/viewport/texture_manager.py`

```python
"""Texture loading and caching for OpenGL rendering."""

from __future__ import annotations

import os
from typing import Dict, Optional

from OpenGL.GL import (
    GL_LINEAR,
    GL_NEAREST,
    GL_REPEAT,
    GL_RGBA,
    GL_TEXTURE_2D,
    GL_TEXTURE_MAG_FILTER,
    GL_TEXTURE_MIN_FILTER,
    GL_TEXTURE_WRAP_S,
    GL_TEXTURE_WRAP_T,
    GL_UNSIGNED_BYTE,
    glBindTexture,
    glDeleteTextures,
    glGenTextures,
    glTexImage2D,
    glTexParameteri,
)
from PIL import Image


class TextureManager:
    """Loads PNG textures from disk and caches them as OpenGL texture IDs."""

    def __init__(self) -> None:
        self._cache: Dict[str, int] = {}  # file path -> GL texture ID
        self._key_to_path: Dict[str, str] = {}  # texture key -> file path
        self._fallback_id: Optional[int] = None

    def load_model_textures(self, model_dir: str, textures: Dict[str, str]) -> None:
        """Load all textures for a model.

        Args:
            model_dir: Directory containing the .json file (textures are in the same dir or subdir).
            textures: Map of texture_key -> filename (without .png extension sometimes).
        """
        for key, filename in textures.items():
            # Try with and without .png extension
            candidates = [
                os.path.join(model_dir, filename),
                os.path.join(model_dir, filename + ".png"),
                os.path.join(model_dir, filename.replace(".png", "") + ".png"),
            ]
            loaded = False
            for path in candidates:
                if os.path.isfile(path):
                    gl_id = self._load_texture_file(path)
                    if gl_id is not None:
                        self._key_to_path[key] = path
                        self._cache[path] = gl_id
                        loaded = True
                        break
            if not loaded:
                print(f"[TextureManager] Warning: texture not found for key '{key}': tried {candidates}")

    def get_texture_id(self, texture_key: str) -> int:
        """Get the OpenGL texture ID for a texture key. Returns 0 if not found."""
        path = self._key_to_path.get(texture_key, "")
        return self._cache.get(path, 0)

    def _load_texture_file(self, path: str) -> Optional[int]:
        """Load a PNG file into an OpenGL texture. Returns GL texture ID or None."""
        if path in self._cache:
            return self._cache[path]

        try:
            img = Image.open(path).convert("RGBA")
            img = img.transpose(Image.FLIP_TOP_BOTTOM)
            img_data = img.tobytes()
            width, height = img.size

            tex_id = glGenTextures(1)
            glBindTexture(GL_TEXTURE_2D, tex_id)
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST)
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST)
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT)
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT)
            glTexImage2D(
                GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0,
                GL_RGBA, GL_UNSIGNED_BYTE, img_data,
            )
            glBindTexture(GL_TEXTURE_2D, 0)
            return tex_id
        except Exception as e:
            print(f"[TextureManager] Error loading texture '{path}': {e}")
            return None

    def clear(self) -> None:
        """Delete all cached textures."""
        for tex_id in self._cache.values():
            if tex_id:
                glDeleteTextures([tex_id])
        self._cache.clear()
        self._key_to_path.clear()
```

- [ ] Step 11: Create `editor/viewport/renderer.py`

```python
"""OpenGL renderer for Blockbench models, grid, and axes."""

from __future__ import annotations

import math
from typing import Dict, List, Optional

from OpenGL.GL import (
    GL_BLEND,
    GL_COLOR_BUFFER_BIT,
    GL_DEPTH_BUFFER_BIT,
    GL_DEPTH_TEST,
    GL_LINES,
    GL_MODELVIEW,
    GL_ONE_MINUS_SRC_ALPHA,
    GL_PROJECTION,
    GL_QUADS,
    GL_SRC_ALPHA,
    GL_TEXTURE_2D,
    glBegin,
    glBindTexture,
    glBlendFunc,
    glClear,
    glClearColor,
    glColor3f,
    glColor4f,
    glDisable,
    glEnable,
    glEnd,
    glLineWidth,
    glLoadIdentity,
    glLoadMatrixf,
    glMatrixMode,
    glMultMatrixf,
    glNormal3f,
    glPopMatrix,
    glPushMatrix,
    glRotatef,
    glTexCoord2f,
    glTranslatef,
    glVertex3f,
)
from OpenGL.GLU import gluPerspective

import numpy as np

from editor.model.model_data import BBElement, BBFace, BBGroup, BBModel
from editor.viewport.camera import Camera
from editor.viewport.texture_manager import TextureManager


# Face vertex definitions for a unit cube, keyed by face name.
# Each face has 4 vertices (x, y, z) and corresponding normals.
_FACE_VERTICES = {
    "north": {  # -Z face
        "vertices": [(1, 0, 0), (0, 0, 0), (0, 1, 0), (1, 1, 0)],
        "normal": (0, 0, -1),
    },
    "south": {  # +Z face
        "vertices": [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
        "normal": (0, 0, 1),
    },
    "east": {  # +X face
        "vertices": [(1, 0, 1), (1, 0, 0), (1, 1, 0), (1, 1, 1)],
        "normal": (1, 0, 0),
    },
    "west": {  # -X face
        "vertices": [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)],
        "normal": (-1, 0, 0),
    },
    "up": {  # +Y face
        "vertices": [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
        "normal": (0, 1, 0),
    },
    "down": {  # -Y face
        "vertices": [(0, 0, 1), (0, 0, 0), (1, 0, 0), (1, 0, 1)],
        "normal": (0, -1, 0),
    },
}

# UV corners for each face quad vertex: (u_index, v_index) into [u1, v1, u2, v2]
_UV_CORNERS = [(0, 3), (2, 3), (2, 1), (0, 1)]


class Renderer:
    """Renders Blockbench models, grid, and axes using immediate mode OpenGL."""

    def __init__(self, camera: Camera, texture_manager: TextureManager) -> None:
        self.camera = camera
        self.texture_manager = texture_manager
        self.highlight_group: Optional[str] = None
        self.grid_extent: float = 2.0  # blocks in each direction
        self.grid_step: float = 1.0 / 16.0 * 16  # 1 block = 1.0 in OpenGL

    def init_gl(self) -> None:
        """One-time OpenGL setup."""
        glClearColor(0.18, 0.18, 0.22, 1.0)
        glEnable(GL_DEPTH_TEST)
        glEnable(GL_BLEND)
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)

    def resize(self, width: int, height: int) -> None:
        """Handle viewport resize."""
        if height == 0:
            height = 1
        glMatrixMode(GL_PROJECTION)
        glLoadIdentity()
        gluPerspective(60.0, width / height, 0.01, 100.0)
        glMatrixMode(GL_MODELVIEW)

    def render_scene(self, model: Optional[BBModel], group_transforms: Optional[Dict] = None) -> None:
        """Render the full scene: clear, set camera, draw grid, axes, model."""
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)

        glMatrixMode(GL_MODELVIEW)
        glLoadIdentity()

        # Apply camera view matrix
        view = self.camera.view_matrix()
        glLoadMatrixf(view.T.flatten())

        self._draw_grid()
        self._draw_axes()

        if model is not None:
            glEnable(GL_TEXTURE_2D)
            for group in model.root_groups:
                self._draw_group(group, group_transforms)
            glDisable(GL_TEXTURE_2D)

    def _draw_grid(self) -> None:
        """Draw a ground grid on the XZ plane."""
        glDisable(GL_TEXTURE_2D)
        glLineWidth(1.0)
        glBegin(GL_LINES)

        extent = int(self.grid_extent)
        for i in range(-extent, extent + 1):
            # Lines along Z
            if i == 0:
                glColor4f(0.5, 0.5, 0.5, 0.6)
            else:
                glColor4f(0.35, 0.35, 0.35, 0.4)
            glVertex3f(float(i), 0.0, float(-extent))
            glVertex3f(float(i), 0.0, float(extent))
            # Lines along X
            glVertex3f(float(-extent), 0.0, float(i))
            glVertex3f(float(extent), 0.0, float(i))

        glEnd()

    def _draw_axes(self) -> None:
        """Draw colored RGB axes at the origin."""
        glDisable(GL_TEXTURE_2D)
        glLineWidth(2.5)
        glBegin(GL_LINES)

        # X axis -- red
        glColor3f(0.9, 0.2, 0.2)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(1.5, 0.0, 0.0)

        # Y axis -- green
        glColor3f(0.2, 0.9, 0.2)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(0.0, 1.5, 0.0)

        # Z axis -- blue
        glColor3f(0.2, 0.2, 0.9)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(0.0, 0.0, 1.5)

        glEnd()
        glLineWidth(1.0)

    def _draw_group(self, group: BBGroup, group_transforms: Optional[Dict] = None) -> None:
        """Recursively draw a group and its children with pivot-relative transforms."""
        if not group.visible:
            return

        glPushMatrix()

        ox, oy, oz = group.origin

        # Apply animation transforms if provided
        transforms = None
        if group_transforms and group.name in group_transforms:
            transforms = group_transforms[group.name]

        if transforms:
            tx, ty, tz = transforms.get("translation", (0, 0, 0))
            rx, ry, rz = transforms.get("rotation", (0, 0, 0))
            sx, sy, sz = transforms.get("scale", (1, 1, 1))

            # Translate to pivot, apply transforms, translate back
            glTranslatef(ox + tx / 16.0, oy + ty / 16.0, oz + tz / 16.0)
            if rz != 0:
                glRotatef(rz, 0, 0, 1)
            if ry != 0:
                glRotatef(ry, 0, 1, 0)
            if rx != 0:
                glRotatef(rx, 1, 0, 0)
            # Scale is applied at pivot
            if sx != 1.0 or sy != 1.0 or sz != 1.0:
                from OpenGL.GL import glScalef
                glScalef(sx, sy, sz)
            glTranslatef(-ox, -oy, -oz)
        else:
            # No animation -- identity transform (groups have no static rotation in BB)
            pass

        is_highlighted = (self.highlight_group is not None and group.name == self.highlight_group)

        # Draw elements
        for elem in group.elements:
            self._draw_element(elem, is_highlighted)

        # Draw child groups
        for child in group.children:
            self._draw_group(child, group_transforms)

        glPopMatrix()

    def _draw_element(self, elem: BBElement, highlighted: bool = False) -> None:
        """Draw a single box element with its faces textured."""
        glPushMatrix()

        # Apply element rotation if any
        if elem.rotation_axis and elem.rotation_angle != 0 and elem.rotation_origin:
            ox, oy, oz = elem.rotation_origin
            glTranslatef(ox, oy, oz)
            if elem.rotation_axis == "x":
                glRotatef(elem.rotation_angle, 1, 0, 0)
            elif elem.rotation_axis == "y":
                glRotatef(elem.rotation_angle, 0, 1, 0)
            elif elem.rotation_axis == "z":
                glRotatef(elem.rotation_angle, 0, 0, 1)
            glTranslatef(-ox, -oy, -oz)

        fx, fy, fz = elem.from_pos
        tx, ty, tz = elem.to_pos
        sx = tx - fx
        sy = ty - fy
        sz = tz - fz

        for face_name, face_info in _FACE_VERTICES.items():
            bb_face = elem.faces.get(face_name)
            if bb_face is None:
                continue

            tex_id = self.texture_manager.get_texture_id(bb_face.texture_key)
            if tex_id:
                glEnable(GL_TEXTURE_2D)
                glBindTexture(GL_TEXTURE_2D, tex_id)
            else:
                glDisable(GL_TEXTURE_2D)

            if highlighted:
                glColor4f(0.4, 0.8, 1.0, 0.85)
            else:
                glColor4f(1.0, 1.0, 1.0, 1.0)

            normal = face_info["normal"]
            glNormal3f(*normal)

            u1, v1, u2, v2 = bb_face.uv

            # Handle flipped UVs (u1 > u2 or v1 > v2 means Blockbench mirrored)
            uv_coords = _get_uv_coords(u1, v1, u2, v2, bb_face.uv_rotation)

            glBegin(GL_QUADS)
            for i, (vx, vy, vz) in enumerate(face_info["vertices"]):
                u, v = uv_coords[i]
                glTexCoord2f(u, v)
                glVertex3f(fx + vx * sx, fy + vy * sy, fz + vz * sz)
            glEnd()

        glPopMatrix()


def _get_uv_coords(
    u1: float, v1: float, u2: float, v2: float, rotation: int
) -> list[tuple[float, float]]:
    """Compute the 4 UV coordinates for a quad, handling flips and rotation.

    Returns UV pairs for the 4 vertices in quad order.
    """
    # Base corners: bottom-left, bottom-right, top-right, top-left
    # Note: OpenGL V is flipped relative to Blockbench
    coords = [
        (u1, v1),  # 0: bottom-left
        (u2, v1),  # 1: bottom-right
        (u2, v2),  # 2: top-right
        (u1, v2),  # 3: top-left
    ]

    # Apply UV rotation (Blockbench rotates clockwise)
    if rotation == 90:
        coords = [coords[1], coords[2], coords[3], coords[0]]
    elif rotation == 180:
        coords = [coords[2], coords[3], coords[0], coords[1]]
    elif rotation == 270:
        coords = [coords[3], coords[0], coords[1], coords[2]]

    return coords
```

- [ ] Step 12: Create `editor/viewport/gl_widget.py`

```python
"""QOpenGLWidget subclass for the 3D viewport."""

from __future__ import annotations

from typing import Dict, Optional

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QWheelEvent
from PyQt6.QtOpenGLWidgets import QOpenGLWidget
from PyQt6.QtWidgets import QWidget

from OpenGL.GL import glViewport

from editor.model.model_data import BBModel
from editor.viewport.camera import Camera
from editor.viewport.renderer import Renderer
from editor.viewport.texture_manager import TextureManager


class GLWidget(QOpenGLWidget):
    """OpenGL viewport widget for rendering Blockbench models."""

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.camera = Camera()
        self.texture_manager = TextureManager()
        self.renderer = Renderer(self.camera, self.texture_manager)

        self._model: Optional[BBModel] = None
        self._group_transforms: Optional[Dict] = None
        self._last_mouse_pos: Optional[tuple[int, int]] = None

        # Accept mouse tracking for hover effects
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        # Refresh timer at 60 FPS for smooth interaction
        self._refresh_timer = QTimer(self)
        self._refresh_timer.timeout.connect(self.update)
        self._refresh_timer.start(16)  # ~60 FPS

    def set_model(self, model: BBModel) -> None:
        """Set the model to render and load its textures."""
        self._model = model
        import os
        model_dir = os.path.dirname(model.source_path)
        self.texture_manager.clear()
        self.makeCurrent()
        self.texture_manager.load_model_textures(model_dir, model.textures)
        self.doneCurrent()
        self.update()

    def set_group_transforms(self, transforms: Optional[Dict]) -> None:
        """Set animation transforms for groups. Dict of group_name -> {rotation, translation, scale}."""
        self._group_transforms = transforms
        self.update()

    def set_highlight_group(self, group_name: Optional[str]) -> None:
        """Highlight a specific group in the viewport."""
        self.renderer.highlight_group = group_name
        self.update()

    def initializeGL(self) -> None:
        self.renderer.init_gl()

    def resizeGL(self, w: int, h: int) -> None:
        glViewport(0, 0, w, h)
        self.renderer.resize(w, h)

    def paintGL(self) -> None:
        self.renderer.render_scene(self._model, self._group_transforms)

    # --- Mouse interaction ---

    def mousePressEvent(self, event: QMouseEvent) -> None:
        pos = event.position()
        self._last_mouse_pos = (int(pos.x()), int(pos.y()))
        event.accept()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._last_mouse_pos is None:
            return

        pos = event.position()
        x, y = int(pos.x()), int(pos.y())
        dx = x - self._last_mouse_pos[0]
        dy = y - self._last_mouse_pos[1]
        self._last_mouse_pos = (x, y)

        buttons = event.buttons()
        if buttons & Qt.MouseButton.RightButton:
            self.camera.orbit(dx, dy)
        elif buttons & Qt.MouseButton.MiddleButton:
            self.camera.pan(dx, dy)

        event.accept()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        self._last_mouse_pos = None
        event.accept()

    def wheelEvent(self, event: QWheelEvent) -> None:
        delta = event.angleDelta().y() / 120.0
        self.camera.zoom(delta)
        event.accept()
```

- [ ] Step 13: Create `editor/main_window.py`

```python
"""Main application window with dockable layout."""

from __future__ import annotations

import os
from typing import Optional

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction, QKeySequence
from PyQt6.QtWidgets import (
    QDockWidget,
    QFileDialog,
    QLabel,
    QMainWindow,
    QMessageBox,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from editor.model.blockbench_parser import parse_blockbench
from editor.model.model_data import BBGroup
from editor.model.project import Project
from editor.viewport.gl_widget import GLWidget


class MainWindow(QMainWindow):
    """Main editor window."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("EriAnim Editor")
        self.resize(1600, 900)

        self.project = Project()

        # --- Central: 3D Viewport ---
        self.viewport = GLWidget()
        self.setCentralWidget(self.viewport)

        # --- Left dock: Group Tree ---
        self.group_tree = QTreeWidget()
        self.group_tree.setHeaderLabel("Groups")
        self.group_tree.currentItemChanged.connect(self._on_group_selected)

        left_dock = QDockWidget("Groups", self)
        left_dock.setWidget(self.group_tree)
        left_dock.setMinimumWidth(200)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, left_dock)

        # --- Right dock: Properties (placeholder for Task 3) ---
        self.properties_placeholder = QLabel("Select a group or keyframe to edit properties.")
        self.properties_placeholder.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.properties_placeholder.setWordWrap(True)
        self.properties_placeholder.setStyleSheet("padding: 12px; color: #888;")

        right_dock = QDockWidget("Properties", self)
        right_dock.setWidget(self.properties_placeholder)
        right_dock.setMinimumWidth(250)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, right_dock)

        # --- Bottom dock: Timeline (placeholder for Task 2) ---
        self.timeline_placeholder = QLabel("Open a model and create an animation to use the timeline.")
        self.timeline_placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.timeline_placeholder.setStyleSheet("padding: 12px; color: #888;")
        self.timeline_placeholder.setMinimumHeight(150)

        bottom_dock = QDockWidget("Timeline", self)
        bottom_dock.setWidget(self.timeline_placeholder)
        self.addDockWidget(Qt.DockWidgetArea.BottomDockWidgetArea, bottom_dock)

        # --- Menu bar ---
        self._build_menu()

        # --- Styling ---
        self._apply_dark_theme()

    def _build_menu(self) -> None:
        """Build the menu bar."""
        menu_bar = self.menuBar()

        # File menu
        file_menu = menu_bar.addMenu("&File")

        open_action = QAction("&Open Blockbench Model...", self)
        open_action.setShortcut(QKeySequence("Ctrl+O"))
        open_action.triggered.connect(self._open_model)
        file_menu.addAction(open_action)

        file_menu.addSeparator()

        quit_action = QAction("&Quit", self)
        quit_action.setShortcut(QKeySequence("Ctrl+Q"))
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)

    def _open_model(self) -> None:
        """Open a Blockbench JSON model file."""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Open Blockbench Model",
            "",
            "Blockbench JSON (*.json);;All Files (*)",
        )
        if not file_path:
            return

        try:
            model = parse_blockbench(file_path)
            self.project.model = model
            self.project.anim_file.model = self._make_resource_location(file_path)
            self.viewport.set_model(model)
            self._populate_group_tree(model.root_groups)
            self.setWindowTitle(f"EriAnim Editor -- {os.path.basename(file_path)}")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to parse model:\n{e}")

    def _make_resource_location(self, file_path: str) -> str:
        """Generate a placeholder ResourceLocation from the file path."""
        name = os.path.splitext(os.path.basename(file_path))[0]
        return f"modid:block/{name}"

    def _populate_group_tree(self, root_groups: list[BBGroup]) -> None:
        """Populate the group tree widget from the model hierarchy."""
        self.group_tree.clear()
        for group in root_groups:
            item = self._create_tree_item(group)
            self.group_tree.addTopLevelItem(item)
        self.group_tree.expandAll()

    def _create_tree_item(self, group: BBGroup) -> QTreeWidgetItem:
        """Recursively create tree items for a group and its children."""
        item = QTreeWidgetItem([group.name])
        item.setData(0, Qt.ItemDataRole.UserRole, group.name)
        elem_count = len(group.elements)
        if elem_count > 0:
            item.setToolTip(0, f"{elem_count} elements")
        for child in group.children:
            item.addChild(self._create_tree_item(child))
        return item

    def _on_group_selected(self, current: Optional[QTreeWidgetItem], previous: Optional[QTreeWidgetItem]) -> None:
        """Handle group selection in the tree."""
        if current is None:
            self.project.selected_group_name = None
            self.viewport.set_highlight_group(None)
            return

        group_name = current.data(0, Qt.ItemDataRole.UserRole)
        self.project.selected_group_name = group_name
        self.viewport.set_highlight_group(group_name)

    def _apply_dark_theme(self) -> None:
        """Apply a dark theme stylesheet."""
        self.setStyleSheet("""
            QMainWindow { background: #1e1e2e; }
            QDockWidget { color: #cdd6f4; font-weight: bold; }
            QDockWidget::title {
                background: #313244; padding: 6px;
                border-bottom: 1px solid #45475a;
            }
            QTreeWidget {
                background: #1e1e2e; color: #cdd6f4;
                border: none; font-size: 13px;
            }
            QTreeWidget::item:selected { background: #45475a; color: #89b4fa; }
            QTreeWidget::item:hover { background: #313244; }
            QLabel { color: #6c7086; font-size: 12px; }
            QMenuBar { background: #181825; color: #cdd6f4; }
            QMenuBar::item:selected { background: #313244; }
            QMenu { background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; }
            QMenu::item:selected { background: #45475a; }
        """)
```

- [ ] Step 14: Create `main.py`

```python
"""EriAnim Editor -- Entry point."""

import sys

from PyQt6.QtWidgets import QApplication

from editor.main_window import MainWindow


def main() -> None:
    app = QApplication(sys.argv)
    app.setApplicationName("EriAnim Editor")
    app.setOrganizationName("EriniumGroup")

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
```

---

## Task 2: Timeline Widget with Keyframes, Playback, and Viewport Preview

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\timeline\__init__.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\timeline\track_data.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\timeline\playback.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\timeline\timeline_widget.py`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\main_window.py` -- replace timeline placeholder with real TimelineWidget, add animation creation, wire playback to viewport.

**Dependencies:** Task 1 complete.

**After this task:** The user can create a new animation (Animation > New), see the timeline with track rows for each group/property. Clicking on a track at a tick adds a keyframe. The playhead is draggable. Play/Pause/Stop buttons work. During playback (20 tps), the viewport shows the interpolated animation using linear interpolation. Zoom on timeline with Ctrl+wheel.

- [ ] Step 1: Create `editor/timeline/__init__.py`

```python
"""Timeline widget and playback controller."""
```

- [ ] Step 2: Create `editor/timeline/track_data.py`

```python
"""Track data for the timeline display."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Union

from editor.model.animation_data import (
    EasingType,
    Keyframe,
    SpinKeyframe,
    TextureKeyframe,
    TrackType,
    VisibleKeyframe,
)


@dataclass
class TrackRow:
    """A single visible row in the timeline, representing one property of one group."""
    group_name: str
    track_type: TrackType
    label: str  # e.g. "lid.rotation"
    component: Optional[str] = None  # "X", "Y", "Z" for vec3 tracks, None for boolean/spin/texture

    def get_keyframes(
        self,
        kf_list: Union[
            List[Keyframe],
            List[VisibleKeyframe],
            List[SpinKeyframe],
            List[TextureKeyframe],
        ],
    ) -> list:
        """Return the keyframes from the given list."""
        return list(kf_list)


def build_track_rows(group_names: List[str], animation_tracks: dict) -> List[TrackRow]:
    """Build the list of visible track rows from the animation tracks.

    Only creates rows for groups that have at least one track defined,
    plus always shows a row for the selected group.
    """
    rows: List[TrackRow] = []

    for group_name, group_track in animation_tracks.items():
        if group_track.rotation:
            rows.append(TrackRow(group_name, TrackType.ROTATION, f"{group_name}.rotation"))
        if group_track.translation:
            rows.append(TrackRow(group_name, TrackType.TRANSLATION, f"{group_name}.translation"))
        if group_track.scale:
            rows.append(TrackRow(group_name, TrackType.SCALE, f"{group_name}.scale"))
        if group_track.visible:
            rows.append(TrackRow(group_name, TrackType.VISIBLE, f"{group_name}.visible"))
        if group_track.spin:
            rows.append(TrackRow(group_name, TrackType.SPIN, f"{group_name}.spin"))
        if group_track.texture:
            rows.append(TrackRow(group_name, TrackType.TEXTURE, f"{group_name}.texture"))

    return rows
```

- [ ] Step 3: Create `editor/timeline/playback.py`

```python
"""Playback controller for animation preview."""

from __future__ import annotations

import math
from typing import Callable, Dict, List, Optional, Tuple

from PyQt6.QtCore import QObject, QTimer, pyqtSignal

from editor.model.animation_data import (
    AnimDef,
    EasingType,
    EndBehavior,
    GroupTrack,
    Keyframe,
    SpinKeyframe,
    TrackType,
)


class PlaybackController(QObject):
    """Controls animation playback at 20 ticks/sec with interpolation."""

    tick_changed = pyqtSignal(int)  # emits current tick
    playback_stopped = pyqtSignal()
    transforms_updated = pyqtSignal(dict)  # emits group_transforms dict

    def __init__(self, parent: Optional[QObject] = None) -> None:
        super().__init__(parent)
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._on_tick)
        self._playing: bool = False
        self._current_tick: int = 0
        self._animation: Optional[AnimDef] = None
        self._loop_preview: bool = False
        # Spin accumulators: group_name -> accumulated angle in degrees
        self._spin_accumulators: Dict[str, float] = {}

    @property
    def current_tick(self) -> int:
        return self._current_tick

    @current_tick.setter
    def current_tick(self, value: int) -> None:
        self._current_tick = max(0, value)
        self.tick_changed.emit(self._current_tick)
        self._emit_transforms()

    @property
    def is_playing(self) -> bool:
        return self._playing

    def set_animation(self, animation: Optional[AnimDef]) -> None:
        """Set the animation to play."""
        self.stop()
        self._animation = animation
        self._current_tick = 0
        self._spin_accumulators.clear()
        self.tick_changed.emit(0)
        self._emit_transforms()

    def play(self) -> None:
        """Start or resume playback at 20 tps (50ms interval)."""
        if self._animation is None:
            return
        self._playing = True
        self._timer.start(50)  # 20 ticks per second

    def pause(self) -> None:
        """Pause playback."""
        self._playing = False
        self._timer.stop()

    def stop(self) -> None:
        """Stop playback and reset to tick 0."""
        self._playing = False
        self._timer.stop()
        self._current_tick = 0
        self._spin_accumulators.clear()
        self.tick_changed.emit(0)
        self._emit_transforms()
        self.playback_stopped.emit()

    def toggle_loop(self, enabled: bool) -> None:
        """Enable/disable loop preview."""
        self._loop_preview = enabled

    def _on_tick(self) -> None:
        """Advance one tick."""
        if self._animation is None:
            self.stop()
            return

        self._current_tick += 1

        if self._current_tick > self._animation.duration:
            end = self._animation.end_behavior
            if self._loop_preview or end in (EndBehavior.LOOP, EndBehavior.LOOP_PAUSE, EndBehavior.LOOP_COUNT):
                self._current_tick = 0
                self._spin_accumulators.clear()
            else:
                self._current_tick = self._animation.duration
                self.pause()

        self.tick_changed.emit(self._current_tick)
        self._emit_transforms()

    def _emit_transforms(self) -> None:
        """Calculate and emit the current group transforms."""
        if self._animation is None:
            self.transforms_updated.emit({})
            return

        transforms: Dict[str, Dict] = {}
        tick = self._current_tick

        for group_name, track in self._animation.tracks.items():
            group_t: Dict = {}

            if track.rotation:
                group_t["rotation"] = _interpolate_vec3(track.rotation, tick)
            if track.translation:
                group_t["translation"] = _interpolate_vec3(track.translation, tick)
            if track.scale:
                group_t["scale"] = _interpolate_vec3(track.scale, tick)
            else:
                group_t["scale"] = (1.0, 1.0, 1.0)
            if track.visible:
                group_t["visible"] = _interpolate_visible(track.visible, tick)
            if track.spin:
                accumulated = self._spin_accumulators.get(group_name, 0.0)
                spin_angle, new_acc = _interpolate_spin(track.spin, tick, accumulated)
                self._spin_accumulators[group_name] = new_acc
                # Spin overrides rotation
                axis = track.spin[0].axis if track.spin else "y"
                rot = list(group_t.get("rotation", (0, 0, 0)))
                axis_idx = {"x": 0, "y": 1, "z": 2}.get(axis, 1)
                rot[axis_idx] += spin_angle
                group_t["rotation"] = tuple(rot)

            if group_t:
                transforms[group_name] = group_t

        self.transforms_updated.emit(transforms)

    def compute_transforms_at(self, tick: int) -> Dict[str, Dict]:
        """Compute transforms at a specific tick without advancing the playhead (for scrubbing)."""
        if self._animation is None:
            return {}

        transforms: Dict[str, Dict] = {}

        for group_name, track in self._animation.tracks.items():
            group_t: Dict = {}
            if track.rotation:
                group_t["rotation"] = _interpolate_vec3(track.rotation, tick)
            if track.translation:
                group_t["translation"] = _interpolate_vec3(track.translation, tick)
            if track.scale:
                group_t["scale"] = _interpolate_vec3(track.scale, tick)
            else:
                group_t["scale"] = (1.0, 1.0, 1.0)
            if track.visible:
                group_t["visible"] = _interpolate_visible(track.visible, tick)
            # Spin: approximate by accumulating from tick 0 to tick
            if track.spin:
                spin_angle = _approximate_spin_at_tick(track.spin, tick)
                axis = track.spin[0].axis if track.spin else "y"
                rot = list(group_t.get("rotation", (0, 0, 0)))
                axis_idx = {"x": 0, "y": 1, "z": 2}.get(axis, 1)
                rot[axis_idx] += spin_angle
                group_t["rotation"] = tuple(rot)
            if group_t:
                transforms[group_name] = group_t

        return transforms


# --- Easing functions ---

def _apply_easing(t: float, easing: EasingType) -> float:
    """Apply an easing function to a normalized t in [0, 1]."""
    if easing == EasingType.LINEAR:
        return t
    elif easing == EasingType.EASE_IN:
        return t * t
    elif easing == EasingType.EASE_OUT:
        return 1.0 - (1.0 - t) * (1.0 - t)
    elif easing == EasingType.EASE_IN_OUT:
        return 3 * t * t - 2 * t * t * t if t < 0.5 else 1.0 - ((-2 * t + 2) ** 2) / 2  # Smoothstep variant
    elif easing == EasingType.EASE_IN_CUBIC:
        return t * t * t
    elif easing == EasingType.EASE_OUT_CUBIC:
        return 1.0 - (1.0 - t) ** 3
    elif easing == EasingType.BOUNCE:
        return _bounce_out(t)
    elif easing == EasingType.ELASTIC:
        if t == 0 or t == 1:
            return t
        return -(2.0 ** (10.0 * t - 10.0)) * math.sin((t * 10.0 - 10.75) * (2.0 * math.pi / 3.0))
    elif easing == EasingType.EASE_IN_BACK:
        c1 = 1.70158
        return (c1 + 1) * t * t * t - c1 * t * t
    elif easing == EasingType.EASE_OUT_BACK:
        c1 = 1.70158
        t2 = t - 1
        return 1.0 + (c1 + 1) * t2 * t2 * t2 + c1 * t2 * t2
    elif easing == EasingType.SPRING:
        return 1.0 - math.cos(t * 4.5 * math.pi) * math.exp(-t * 6.0)
    return t


def _bounce_out(t: float) -> float:
    """Bounce easing out."""
    n1 = 7.5625
    d1 = 2.75
    if t < 1.0 / d1:
        return n1 * t * t
    elif t < 2.0 / d1:
        t -= 1.5 / d1
        return n1 * t * t + 0.75
    elif t < 2.5 / d1:
        t -= 2.25 / d1
        return n1 * t * t + 0.9375
    else:
        t -= 2.625 / d1
        return n1 * t * t + 0.984375


def _interpolate_vec3(keyframes: List[Keyframe], tick: int) -> Tuple[float, float, float]:
    """Interpolate a vec3 track at the given tick."""
    if not keyframes:
        return (0.0, 0.0, 0.0)

    # Before first keyframe
    if tick <= keyframes[0].tick:
        return tuple(keyframes[0].value)  # type: ignore

    # After last keyframe
    if tick >= keyframes[-1].tick:
        return tuple(keyframes[-1].value)  # type: ignore

    # Find surrounding keyframes
    for i in range(len(keyframes) - 1):
        kf_a = keyframes[i]
        kf_b = keyframes[i + 1]
        if kf_a.tick <= tick <= kf_b.tick:
            span = kf_b.tick - kf_a.tick
            if span == 0:
                return tuple(kf_b.value)  # type: ignore
            t = (tick - kf_a.tick) / span
            t = _apply_easing(t, kf_b.easing)
            return (
                kf_a.value[0] + (kf_b.value[0] - kf_a.value[0]) * t,
                kf_a.value[1] + (kf_b.value[1] - kf_a.value[1]) * t,
                kf_a.value[2] + (kf_b.value[2] - kf_a.value[2]) * t,
            )

    return tuple(keyframes[-1].value)  # type: ignore


def _interpolate_visible(keyframes: list, tick: int) -> bool:
    """Get the visibility at a tick (instant, no interpolation)."""
    if not keyframes:
        return True
    result = keyframes[0].value
    for kf in keyframes:
        if kf.tick <= tick:
            result = kf.value
        else:
            break
    return result


def _interpolate_spin(keyframes: List[SpinKeyframe], tick: int, accumulated: float) -> Tuple[float, float]:
    """Get the current spin speed and add to accumulator.

    Returns (total_accumulated_angle, new_accumulated).
    Speed is in degrees/second. Each tick = 1/20 second.
    """
    if not keyframes:
        return (accumulated, accumulated)

    # Find current speed by interpolating between spin keyframes
    speed = keyframes[0].speed
    if tick <= keyframes[0].tick:
        speed = keyframes[0].speed
    elif tick >= keyframes[-1].tick:
        speed = keyframes[-1].speed
    else:
        for i in range(len(keyframes) - 1):
            kf_a = keyframes[i]
            kf_b = keyframes[i + 1]
            if kf_a.tick <= tick <= kf_b.tick:
                span = kf_b.tick - kf_a.tick
                if span == 0:
                    speed = kf_b.speed
                else:
                    t = (tick - kf_a.tick) / span
                    t = _apply_easing(t, kf_b.easing)
                    speed = kf_a.speed + (kf_b.speed - kf_a.speed) * t
                break

    # Add degrees for one tick (1/20 second)
    delta = speed / 20.0
    new_acc = accumulated + delta
    return (new_acc, new_acc)


def _approximate_spin_at_tick(keyframes: List[SpinKeyframe], target_tick: int) -> float:
    """Approximate the total spin angle from tick 0 to target_tick by summing each tick."""
    if not keyframes:
        return 0.0

    acc = 0.0
    for t in range(target_tick + 1):
        # Find speed at this tick
        speed = keyframes[0].speed
        if t <= keyframes[0].tick:
            speed = keyframes[0].speed
        elif t >= keyframes[-1].tick:
            speed = keyframes[-1].speed
        else:
            for i in range(len(keyframes) - 1):
                kf_a = keyframes[i]
                kf_b = keyframes[i + 1]
                if kf_a.tick <= t <= kf_b.tick:
                    span = kf_b.tick - kf_a.tick
                    if span == 0:
                        speed = kf_b.speed
                    else:
                        frac = (t - kf_a.tick) / span
                        frac = _apply_easing(frac, kf_b.easing)
                        speed = kf_a.speed + (kf_b.speed - kf_a.speed) * frac
                    break
        acc += speed / 20.0

    return acc
```

- [ ] Step 4: Create `editor/timeline/timeline_widget.py`

```python
"""Custom timeline widget with multi-track keyframes and playhead."""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from PyQt6.QtCore import QRect, QRectF, Qt, pyqtSignal
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QMouseEvent,
    QPainter,
    QPainterPath,
    QPen,
    QWheelEvent,
)
from PyQt6.QtWidgets import QHBoxLayout, QPushButton, QVBoxLayout, QWidget

from editor.model.animation_data import (
    AnimDef,
    EasingType,
    GroupTrack,
    Keyframe,
    SpinKeyframe,
    TextureKeyframe,
    TrackType,
    VisibleKeyframe,
)
from editor.timeline.track_data import TrackRow, build_track_rows


# Easing -> color mapping for keyframe diamonds
_EASING_COLORS: Dict[EasingType, str] = {
    EasingType.LINEAR: "#89b4fa",
    EasingType.EASE_IN: "#a6e3a1",
    EasingType.EASE_OUT: "#a6e3a1",
    EasingType.EASE_IN_OUT: "#f9e2af",
    EasingType.EASE_IN_CUBIC: "#94e2d5",
    EasingType.EASE_OUT_CUBIC: "#94e2d5",
    EasingType.BOUNCE: "#f38ba8",
    EasingType.ELASTIC: "#cba6f7",
    EasingType.EASE_IN_BACK: "#fab387",
    EasingType.EASE_OUT_BACK: "#fab387",
    EasingType.SPRING: "#eba0ac",
}

# Track type -> header color
_TRACK_COLORS: Dict[TrackType, str] = {
    TrackType.ROTATION: "#f38ba8",
    TrackType.TRANSLATION: "#89b4fa",
    TrackType.SCALE: "#a6e3a1",
    TrackType.VISIBLE: "#f9e2af",
    TrackType.SPIN: "#cba6f7",
    TrackType.TEXTURE: "#94e2d5",
}


class TimelineWidget(QWidget):
    """Custom-painted timeline widget with tracks, keyframes, and playhead."""

    keyframe_selected = pyqtSignal(str, str, int)  # group_name, track_type, keyframe_index
    keyframe_added = pyqtSignal(str, str, int)  # group_name, track_type, tick
    tick_scrubbed = pyqtSignal(int)  # tick value when user drags playhead
    selection_cleared = pyqtSignal()

    HEADER_HEIGHT = 30
    TRACK_HEIGHT = 24
    LABEL_WIDTH = 160
    MIN_TICK_SPACING = 8  # min pixels per tick

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setMinimumHeight(100)
        self.setFocusPolicy(Qt.FocusPolicy.ClickFocus)

        self._animation: Optional[AnimDef] = None
        self._track_rows: List[TrackRow] = []
        self._current_tick: int = 0
        self._pixels_per_tick: float = 12.0
        self._scroll_x: float = 0.0

        # Selection
        self._selected_group: Optional[str] = None
        self._selected_track_type: Optional[str] = None
        self._selected_kf_index: Optional[int] = None

        # Interaction
        self._dragging_playhead: bool = False
        self._dragging_keyframe: bool = False
        self._drag_original_tick: int = 0
        self._last_mouse_x: int = 0

    def set_animation(self, animation: Optional[AnimDef]) -> None:
        """Set the animation to display."""
        self._animation = animation
        self._rebuild_tracks()
        self.update()

    def set_current_tick(self, tick: int) -> None:
        """Update the playhead position."""
        self._current_tick = tick
        self.update()

    def _rebuild_tracks(self) -> None:
        """Rebuild the track row list from the current animation."""
        if self._animation is None:
            self._track_rows = []
            return
        self._track_rows = build_track_rows([], self._animation.tracks)

    def _tick_to_x(self, tick: int) -> float:
        """Convert a tick value to an x pixel position."""
        return self.LABEL_WIDTH + tick * self._pixels_per_tick - self._scroll_x

    def _x_to_tick(self, x: float) -> int:
        """Convert an x pixel position to a tick value."""
        tick = (x - self.LABEL_WIDTH + self._scroll_x) / self._pixels_per_tick
        return max(0, round(tick))

    def paintEvent(self, event) -> None:  # type: ignore
        """Paint the timeline."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        w = self.width()
        h = self.height()

        # Background
        painter.fillRect(0, 0, w, h, QColor("#1e1e2e"))

        # Label area background
        painter.fillRect(0, 0, self.LABEL_WIDTH, h, QColor("#181825"))

        if self._animation is None:
            painter.setPen(QColor("#6c7086"))
            painter.drawText(QRectF(0, 0, w, h), Qt.AlignmentFlag.AlignCenter, "No animation loaded")
            painter.end()
            return

        duration = self._animation.duration

        # --- Header: tick ruler ---
        painter.fillRect(0, 0, w, self.HEADER_HEIGHT, QColor("#11111b"))
        painter.setPen(QColor("#6c7086"))
        font = QFont("monospace", 9)
        painter.setFont(font)

        # Draw tick marks
        step = max(1, int(50 / self._pixels_per_tick))
        for tick in range(0, duration + 1, step):
            x = self._tick_to_x(tick)
            if x < self.LABEL_WIDTH or x > w:
                continue
            painter.setPen(QColor("#45475a"))
            painter.drawLine(int(x), self.HEADER_HEIGHT - 8, int(x), self.HEADER_HEIGHT)
            painter.setPen(QColor("#6c7086"))
            painter.drawText(int(x) - 15, 2, 30, self.HEADER_HEIGHT - 10,
                             Qt.AlignmentFlag.AlignCenter, str(tick))

        # --- Tracks ---
        y_offset = self.HEADER_HEIGHT
        for i, row in enumerate(self._track_rows):
            y = y_offset + i * self.TRACK_HEIGHT

            # Track background (alternating)
            bg_color = QColor("#1e1e2e") if i % 2 == 0 else QColor("#181825")
            painter.fillRect(self.LABEL_WIDTH, y, w - self.LABEL_WIDTH, self.TRACK_HEIGHT, bg_color)

            # Label
            track_color = _TRACK_COLORS.get(row.track_type, "#cdd6f4")
            painter.setPen(QColor(track_color))
            painter.setFont(QFont("monospace", 9))
            painter.drawText(8, y, self.LABEL_WIDTH - 16, self.TRACK_HEIGHT,
                             Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
                             row.label)

            # Label separator
            painter.setPen(QColor("#313244"))
            painter.drawLine(self.LABEL_WIDTH, y, self.LABEL_WIDTH, y + self.TRACK_HEIGHT)

            # Draw keyframes
            self._draw_track_keyframes(painter, row, y)

        # --- Duration end line ---
        end_x = self._tick_to_x(duration)
        if self.LABEL_WIDTH < end_x < w:
            painter.setPen(QPen(QColor("#f38ba8"), 1, Qt.PenStyle.DashLine))
            painter.drawLine(int(end_x), self.HEADER_HEIGHT, int(end_x), h)

        # --- Playhead ---
        ph_x = self._tick_to_x(self._current_tick)
        if self.LABEL_WIDTH <= ph_x <= w:
            painter.setPen(QPen(QColor("#f38ba8"), 2))
            painter.drawLine(int(ph_x), 0, int(ph_x), h)
            # Playhead handle (triangle)
            path = QPainterPath()
            path.moveTo(ph_x - 6, 0)
            path.lineTo(ph_x + 6, 0)
            path.lineTo(ph_x, 8)
            path.closeSubpath()
            painter.fillPath(path, QColor("#f38ba8"))

        painter.end()

    def _draw_track_keyframes(self, painter: QPainter, row: TrackRow, y: int) -> None:
        """Draw keyframe diamonds for a track row."""
        if self._animation is None:
            return

        group_track = self._animation.tracks.get(row.group_name)
        if group_track is None:
            return

        keyframes = self._get_keyframes_for_row(group_track, row.track_type)
        mid_y = y + self.TRACK_HEIGHT // 2

        for idx, kf in enumerate(keyframes):
            tick = kf.tick
            x = self._tick_to_x(tick)
            if x < self.LABEL_WIDTH - 6 or x > self.width() + 6:
                continue

            # Determine color from easing
            easing = getattr(kf, "easing", EasingType.LINEAR)
            color = _EASING_COLORS.get(easing, "#cdd6f4")

            # Check if selected
            is_selected = (
                self._selected_group == row.group_name
                and self._selected_track_type == row.track_type.value
                and self._selected_kf_index == idx
            )

            size = 7 if is_selected else 5

            # Draw diamond
            path = QPainterPath()
            path.moveTo(x, mid_y - size)
            path.lineTo(x + size, mid_y)
            path.lineTo(x, mid_y + size)
            path.lineTo(x - size, mid_y)
            path.closeSubpath()

            painter.fillPath(path, QColor(color))
            if is_selected:
                painter.setPen(QPen(QColor("#ffffff"), 1.5))
                painter.drawPath(path)

    def _get_keyframes_for_row(self, group_track: GroupTrack, track_type: TrackType) -> list:
        """Get the list of keyframes for a specific track type."""
        if track_type == TrackType.ROTATION:
            return group_track.rotation
        elif track_type == TrackType.TRANSLATION:
            return group_track.translation
        elif track_type == TrackType.SCALE:
            return group_track.scale
        elif track_type == TrackType.VISIBLE:
            return group_track.visible
        elif track_type == TrackType.SPIN:
            return group_track.spin
        elif track_type == TrackType.TEXTURE:
            return group_track.texture
        return []

    def _hit_test(self, mx: int, my: int) -> Optional[Tuple[str, str, int]]:
        """Test if mouse position hits a keyframe. Returns (group_name, track_type, kf_index) or None."""
        if self._animation is None:
            return None

        y_offset = self.HEADER_HEIGHT
        for i, row in enumerate(self._track_rows):
            y = y_offset + i * self.TRACK_HEIGHT
            if not (y <= my < y + self.TRACK_HEIGHT):
                continue

            group_track = self._animation.tracks.get(row.group_name)
            if group_track is None:
                continue

            keyframes = self._get_keyframes_for_row(group_track, row.track_type)
            for idx, kf in enumerate(keyframes):
                kx = self._tick_to_x(kf.tick)
                if abs(mx - kx) <= 7:
                    return (row.group_name, row.track_type.value, idx)

        return None

    def _hit_test_track(self, mx: int, my: int) -> Optional[Tuple[str, str]]:
        """Test if mouse position is on a track row. Returns (group_name, track_type) or None."""
        y_offset = self.HEADER_HEIGHT
        for i, row in enumerate(self._track_rows):
            y = y_offset + i * self.TRACK_HEIGHT
            if y <= my < y + self.TRACK_HEIGHT and mx >= self.LABEL_WIDTH:
                return (row.group_name, row.track_type.value)
        return None

    def mousePressEvent(self, event: QMouseEvent) -> None:
        mx, my = int(event.position().x()), int(event.position().y())

        # Playhead drag (click on header)
        if my < self.HEADER_HEIGHT and mx >= self.LABEL_WIDTH:
            self._dragging_playhead = True
            tick = self._x_to_tick(mx)
            if self._animation:
                tick = min(tick, self._animation.duration)
            self.tick_scrubbed.emit(tick)
            event.accept()
            return

        # Keyframe hit test
        hit = self._hit_test(mx, my)
        if hit:
            self._selected_group, self._selected_track_type, self._selected_kf_index = hit
            self._dragging_keyframe = True
            group_track = self._animation.tracks.get(hit[0]) if self._animation else None
            if group_track:
                kfs = self._get_keyframes_for_row(group_track, TrackType(hit[1]))
                if 0 <= hit[2] < len(kfs):
                    self._drag_original_tick = kfs[hit[2]].tick
            self.keyframe_selected.emit(*hit)
            self.update()
            event.accept()
            return

        # Double-click to add keyframe
        if event.type().value == 4:  # QEvent.Type.MouseButtonDblClick
            track_hit = self._hit_test_track(mx, my)
            if track_hit:
                tick = self._x_to_tick(mx)
                if self._animation:
                    tick = min(tick, self._animation.duration)
                self.keyframe_added.emit(track_hit[0], track_hit[1], tick)
                event.accept()
                return

        # Clear selection
        self._selected_group = None
        self._selected_track_type = None
        self._selected_kf_index = None
        self.selection_cleared.emit()
        self.update()
        event.accept()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        mx = int(event.position().x())

        if self._dragging_playhead:
            tick = self._x_to_tick(mx)
            if self._animation:
                tick = max(0, min(tick, self._animation.duration))
            self.tick_scrubbed.emit(tick)
            event.accept()
            return

        if self._dragging_keyframe and self._animation and self._selected_group and self._selected_track_type:
            new_tick = self._x_to_tick(mx)
            new_tick = max(0, min(new_tick, self._animation.duration))
            group_track = self._animation.tracks.get(self._selected_group)
            if group_track and self._selected_kf_index is not None:
                kfs = self._get_keyframes_for_row(group_track, TrackType(self._selected_track_type))
                if 0 <= self._selected_kf_index < len(kfs):
                    kfs[self._selected_kf_index].tick = new_tick
                    self.update()
            event.accept()
            return

        event.accept()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if self._dragging_keyframe and self._animation and self._selected_group and self._selected_track_type:
            # Sort keyframes by tick after drag
            group_track = self._animation.tracks.get(self._selected_group)
            if group_track:
                kfs = self._get_keyframes_for_row(group_track, TrackType(self._selected_track_type))
                kfs.sort(key=lambda k: k.tick)

        self._dragging_playhead = False
        self._dragging_keyframe = False
        event.accept()

    def wheelEvent(self, event: QWheelEvent) -> None:
        delta = event.angleDelta().y() / 120.0
        modifiers = event.modifiers()

        if modifiers & Qt.KeyboardModifier.ControlModifier:
            # Zoom
            old_ppt = self._pixels_per_tick
            self._pixels_per_tick = max(4.0, min(80.0, self._pixels_per_tick + delta * 2))
            # Adjust scroll to keep mouse position stable
            mx = event.position().x()
            if old_ppt != 0:
                tick_at_mouse = (mx - self.LABEL_WIDTH + self._scroll_x) / old_ppt
                new_x = tick_at_mouse * self._pixels_per_tick - (mx - self.LABEL_WIDTH)
                self._scroll_x = max(0, new_x)
        else:
            # Scroll
            self._scroll_x = max(0, self._scroll_x - delta * 40)

        self.update()
        event.accept()
```

- [ ] Step 5: Create transport controls wrapper and update `editor/main_window.py`

Replace the `editor/main_window.py` file entirely with the following updated version that integrates the timeline, playback controls, and animation creation:

```python
"""Main application window with dockable layout."""

from __future__ import annotations

import os
from typing import Optional

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction, QKeySequence
from PyQt6.QtWidgets import (
    QDockWidget,
    QFileDialog,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from editor.model.animation_data import AnimDef, GroupTrack, Keyframe, TrackType
from editor.model.blockbench_parser import parse_blockbench
from editor.model.model_data import BBGroup
from editor.model.project import Project
from editor.timeline.playback import PlaybackController
from editor.timeline.timeline_widget import TimelineWidget
from editor.viewport.gl_widget import GLWidget


class MainWindow(QMainWindow):
    """Main editor window."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("EriAnim Editor")
        self.resize(1600, 900)

        self.project = Project()
        self.playback = PlaybackController(self)

        # --- Central: 3D Viewport ---
        self.viewport = GLWidget()
        self.setCentralWidget(self.viewport)

        # --- Left dock: Group Tree ---
        self.group_tree = QTreeWidget()
        self.group_tree.setHeaderLabel("Groups")
        self.group_tree.currentItemChanged.connect(self._on_group_selected)

        left_dock = QDockWidget("Groups", self)
        left_dock.setWidget(self.group_tree)
        left_dock.setMinimumWidth(200)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, left_dock)

        # --- Right dock: Properties (placeholder for Task 3) ---
        self.properties_placeholder = QLabel("Select a group or keyframe to edit properties.")
        self.properties_placeholder.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.properties_placeholder.setWordWrap(True)
        self.properties_placeholder.setStyleSheet("padding: 12px; color: #888;")

        right_dock = QDockWidget("Properties", self)
        right_dock.setWidget(self.properties_placeholder)
        right_dock.setMinimumWidth(250)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, right_dock)

        # --- Bottom dock: Timeline + Transport ---
        self.timeline_widget = TimelineWidget()
        self._transport = self._build_transport()

        timeline_container = QWidget()
        tl_layout = QVBoxLayout(timeline_container)
        tl_layout.setContentsMargins(0, 0, 0, 0)
        tl_layout.setSpacing(0)
        tl_layout.addWidget(self._transport)
        tl_layout.addWidget(self.timeline_widget, 1)
        timeline_container.setMinimumHeight(180)

        bottom_dock = QDockWidget("Timeline", self)
        bottom_dock.setWidget(timeline_container)
        self.addDockWidget(Qt.DockWidgetArea.BottomDockWidgetArea, bottom_dock)

        # --- Menu bar ---
        self._build_menu()

        # --- Connections ---
        self.playback.tick_changed.connect(self.timeline_widget.set_current_tick)
        self.playback.tick_changed.connect(self._on_tick_label_update)
        self.playback.transforms_updated.connect(self.viewport.set_group_transforms)

        self.timeline_widget.tick_scrubbed.connect(self._on_timeline_scrub)
        self.timeline_widget.keyframe_added.connect(self._on_keyframe_added)
        self.timeline_widget.keyframe_selected.connect(self._on_keyframe_selected)

        # --- Styling ---
        self._apply_dark_theme()

    def _build_transport(self) -> QWidget:
        """Build the transport controls bar (Play/Pause/Stop/tick display)."""
        bar = QWidget()
        bar.setFixedHeight(32)
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(8, 2, 8, 2)
        layout.setSpacing(4)

        self._btn_play = QPushButton("Play")
        self._btn_play.setFixedWidth(60)
        self._btn_play.clicked.connect(self._on_play)

        self._btn_pause = QPushButton("Pause")
        self._btn_pause.setFixedWidth(60)
        self._btn_pause.clicked.connect(self._on_pause)

        self._btn_stop = QPushButton("Stop")
        self._btn_stop.setFixedWidth(60)
        self._btn_stop.clicked.connect(self._on_stop)

        self._btn_loop = QPushButton("Loop")
        self._btn_loop.setFixedWidth(60)
        self._btn_loop.setCheckable(True)
        self._btn_loop.clicked.connect(lambda checked: self.playback.toggle_loop(checked))

        self._tick_label = QLabel("Tick: 0 / 0")
        self._tick_label.setStyleSheet("color: #cdd6f4; font-family: monospace; font-size: 12px;")

        layout.addWidget(self._btn_play)
        layout.addWidget(self._btn_pause)
        layout.addWidget(self._btn_stop)
        layout.addWidget(self._btn_loop)
        layout.addStretch()
        layout.addWidget(self._tick_label)

        return bar

    def _build_menu(self) -> None:
        """Build the menu bar."""
        menu_bar = self.menuBar()

        # File menu
        file_menu = menu_bar.addMenu("&File")

        open_action = QAction("&Open Blockbench Model...", self)
        open_action.setShortcut(QKeySequence("Ctrl+O"))
        open_action.triggered.connect(self._open_model)
        file_menu.addAction(open_action)

        file_menu.addSeparator()

        quit_action = QAction("&Quit", self)
        quit_action.setShortcut(QKeySequence("Ctrl+Q"))
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)

        # Animation menu
        anim_menu = menu_bar.addMenu("&Animation")

        new_anim_action = QAction("&New Animation...", self)
        new_anim_action.setShortcut(QKeySequence("Ctrl+N"))
        new_anim_action.triggered.connect(self._new_animation)
        anim_menu.addAction(new_anim_action)

    # --- Slots ---

    def _open_model(self) -> None:
        """Open a Blockbench JSON model file."""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Open Blockbench Model", "",
            "Blockbench JSON (*.json);;All Files (*)",
        )
        if not file_path:
            return

        try:
            model = parse_blockbench(file_path)
            self.project.model = model
            self.project.anim_file.model = self._make_resource_location(file_path)
            self.viewport.set_model(model)
            self._populate_group_tree(model.root_groups)
            self.setWindowTitle(f"EriAnim Editor -- {os.path.basename(file_path)}")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to parse model:\n{e}")

    def _new_animation(self) -> None:
        """Create a new animation."""
        name, ok = QInputDialog.getText(self, "New Animation", "Animation name:")
        if not ok or not name.strip():
            return

        name = name.strip()
        duration, ok = QInputDialog.getInt(self, "New Animation", "Duration (ticks):", 20, 1, 10000)
        if not ok:
            return

        anim = self.project.create_animation(name, duration)
        self.playback.set_animation(anim)
        self.timeline_widget.set_animation(anim)
        self._tick_label.setText(f"Tick: 0 / {duration}")

    def _on_play(self) -> None:
        self.playback.play()

    def _on_pause(self) -> None:
        self.playback.pause()

    def _on_stop(self) -> None:
        self.playback.stop()

    def _on_timeline_scrub(self, tick: int) -> None:
        """Handle scrubbing on the timeline."""
        self.playback.pause()
        self.playback.current_tick = tick

    def _on_tick_label_update(self, tick: int) -> None:
        duration = 0
        if self.project.current_animation:
            duration = self.project.current_animation.duration
        self._tick_label.setText(f"Tick: {tick} / {duration}")

    def _on_keyframe_added(self, group_name: str, track_type_str: str, tick: int) -> None:
        """Handle double-click to add a keyframe."""
        anim = self.project.current_animation
        if anim is None:
            return

        track_type = TrackType(track_type_str)
        if group_name not in anim.tracks:
            anim.tracks[group_name] = GroupTrack(group_name=group_name)

        group_track = anim.tracks[group_name]

        if track_type == TrackType.ROTATION:
            group_track.rotation.append(Keyframe(tick=tick, value=[0.0, 0.0, 0.0]))
            group_track.rotation.sort(key=lambda k: k.tick)
        elif track_type == TrackType.TRANSLATION:
            group_track.translation.append(Keyframe(tick=tick, value=[0.0, 0.0, 0.0]))
            group_track.translation.sort(key=lambda k: k.tick)
        elif track_type == TrackType.SCALE:
            group_track.scale.append(Keyframe(tick=tick, value=[1.0, 1.0, 1.0]))
            group_track.scale.sort(key=lambda k: k.tick)

        self.project.is_dirty = True
        self.timeline_widget.set_animation(anim)
        self.timeline_widget.update()

    def _on_keyframe_selected(self, group_name: str, track_type_str: str, kf_index: int) -> None:
        """Handle keyframe selection."""
        self.project.selected_group_name = group_name
        self.project.selected_track_type = track_type_str
        self.project.selected_keyframe_index = kf_index

    def _on_group_selected(self, current: Optional[QTreeWidgetItem], previous: Optional[QTreeWidgetItem]) -> None:
        """Handle group selection in the tree."""
        if current is None:
            self.project.selected_group_name = None
            self.viewport.set_highlight_group(None)
            return

        group_name = current.data(0, Qt.ItemDataRole.UserRole)
        self.project.selected_group_name = group_name
        self.viewport.set_highlight_group(group_name)

    # --- Helpers ---

    def _make_resource_location(self, file_path: str) -> str:
        name = os.path.splitext(os.path.basename(file_path))[0]
        return f"modid:block/{name}"

    def _populate_group_tree(self, root_groups: list[BBGroup]) -> None:
        self.group_tree.clear()
        for group in root_groups:
            item = self._create_tree_item(group)
            self.group_tree.addTopLevelItem(item)
        self.group_tree.expandAll()

    def _create_tree_item(self, group: BBGroup) -> QTreeWidgetItem:
        item = QTreeWidgetItem([group.name])
        item.setData(0, Qt.ItemDataRole.UserRole, group.name)
        elem_count = len(group.elements)
        if elem_count > 0:
            item.setToolTip(0, f"{elem_count} elements")
        for child in group.children:
            item.addChild(self._create_tree_item(child))
        return item

    def _apply_dark_theme(self) -> None:
        self.setStyleSheet("""
            QMainWindow { background: #1e1e2e; }
            QDockWidget { color: #cdd6f4; font-weight: bold; }
            QDockWidget::title { background: #313244; padding: 6px; border-bottom: 1px solid #45475a; }
            QTreeWidget { background: #1e1e2e; color: #cdd6f4; border: none; font-size: 13px; }
            QTreeWidget::item:selected { background: #45475a; color: #89b4fa; }
            QTreeWidget::item:hover { background: #313244; }
            QLabel { color: #6c7086; font-size: 12px; }
            QMenuBar { background: #181825; color: #cdd6f4; }
            QMenuBar::item:selected { background: #313244; }
            QMenu { background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; }
            QMenu::item:selected { background: #45475a; }
            QPushButton {
                background: #313244; color: #cdd6f4; border: 1px solid #45475a;
                padding: 4px 8px; border-radius: 4px; font-size: 11px;
            }
            QPushButton:hover { background: #45475a; }
            QPushButton:pressed { background: #585b70; }
            QPushButton:checked { background: #89b4fa; color: #1e1e2e; }
        """)
```

- [ ] Step 6: Wire keyboard shortcuts for play/pause/stop and frame stepping

Add the following to `MainWindow.__init__` right before the styling call, inside the updated `main_window.py`:

```python
        # --- Keyboard shortcuts ---
        from PyQt6.QtGui import QShortcut

        QShortcut(QKeySequence("Space"), self).activated.connect(self._toggle_play_pause)
        QShortcut(QKeySequence("Left"), self).activated.connect(self._prev_tick)
        QShortcut(QKeySequence("Right"), self).activated.connect(self._next_tick)
        QShortcut(QKeySequence("Home"), self).activated.connect(lambda: self._goto_tick(0))
        QShortcut(QKeySequence("End"), self).activated.connect(
            lambda: self._goto_tick(self.project.current_animation.duration if self.project.current_animation else 0)
        )
```

And add these methods to the `MainWindow` class:

```python
    def _toggle_play_pause(self) -> None:
        if self.playback.is_playing:
            self.playback.pause()
        else:
            self.playback.play()

    def _prev_tick(self) -> None:
        self.playback.pause()
        self.playback.current_tick = max(0, self.playback.current_tick - 1)

    def _next_tick(self) -> None:
        self.playback.pause()
        duration = self.project.current_animation.duration if self.project.current_animation else 0
        self.playback.current_tick = min(duration, self.playback.current_tick + 1)

    def _goto_tick(self, tick: int) -> None:
        self.playback.pause()
        self.playback.current_tick = tick
```

---

## Task 3: Properties Panel + Event Editor + endBehavior Preview

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\panels\__init__.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\panels\properties_panel.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\panels\event_editor.py`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\main_window.py` -- replace properties placeholder with real PropertiesPanel, connect signals.

**Dependencies:** Tasks 1-2 complete.

**After this task:** The user can select a keyframe and edit its tick, XYZ values, and easing via dropdown. The Animation section shows duration, endBehavior dropdown, blendIn/blendOut/rollbackDuration/loopCount/loopPause fields. The Events section lets the user add/remove events with tick, type dropdown, value, and extra fields. EndBehavior is previewed in the viewport (loop restarts, freeze holds, rollback reverses).

- [ ] Step 1: Create `editor/panels/__init__.py`

```python
"""Property panels and event editors."""
```

- [ ] Step 2: Create `editor/panels/event_editor.py`

```python
"""Widget for editing animation events."""

from __future__ import annotations

from typing import List, Optional

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QComboBox,
    QDoubleSpinBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from editor.model.animation_data import AnimDef, AnimEvent, EventType


class EventEditorWidget(QWidget):
    """Widget that shows and edits the events of the current animation."""

    events_changed = pyqtSignal()

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._animation: Optional[AnimDef] = None
        self._event_widgets: List[_SingleEventWidget] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # Header with Add button
        header = QHBoxLayout()
        header.addWidget(QLabel("Events"))
        self._btn_add = QPushButton("+ Add")
        self._btn_add.setFixedWidth(60)
        self._btn_add.clicked.connect(self._add_event)
        header.addStretch()
        header.addWidget(self._btn_add)
        layout.addLayout(header)

        # Scroll area for event list
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._events_container = QWidget()
        self._events_layout = QVBoxLayout(self._events_container)
        self._events_layout.setContentsMargins(0, 0, 0, 0)
        self._events_layout.setSpacing(4)
        self._events_layout.addStretch()
        self._scroll.setWidget(self._events_container)
        layout.addWidget(self._scroll, 1)

    def set_animation(self, animation: Optional[AnimDef]) -> None:
        self._animation = animation
        self._rebuild()

    def _rebuild(self) -> None:
        """Rebuild event widgets from the current animation."""
        # Clear existing
        for w in self._event_widgets:
            w.setParent(None)
            w.deleteLater()
        self._event_widgets.clear()

        if self._animation is None:
            return

        for i, event in enumerate(self._animation.events):
            widget = _SingleEventWidget(event, i, self._animation.duration)
            widget.changed.connect(self._on_event_changed)
            widget.delete_requested.connect(self._on_delete_event)
            self._events_layout.insertWidget(self._events_layout.count() - 1, widget)
            self._event_widgets.append(widget)

    def _add_event(self) -> None:
        if self._animation is None:
            return
        event = AnimEvent(tick=0, event_type=EventType.SOUND, value="")
        self._animation.events.append(event)
        self._rebuild()
        self.events_changed.emit()

    def _on_event_changed(self) -> None:
        self.events_changed.emit()

    def _on_delete_event(self, index: int) -> None:
        if self._animation is None:
            return
        if 0 <= index < len(self._animation.events):
            self._animation.events.pop(index)
            self._rebuild()
            self.events_changed.emit()


class _SingleEventWidget(QGroupBox):
    """Widget for editing a single animation event."""

    changed = pyqtSignal()
    delete_requested = pyqtSignal(int)

    def __init__(self, event: AnimEvent, index: int, max_tick: int, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._event = event
        self._index = index
        self._updating = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(4)

        # Row 1: tick + type + delete
        row1 = QHBoxLayout()
        row1.addWidget(QLabel("Tick:"))
        self._tick_spin = QSpinBox()
        self._tick_spin.setRange(0, max_tick)
        self._tick_spin.setValue(event.tick)
        self._tick_spin.valueChanged.connect(self._on_tick_changed)
        row1.addWidget(self._tick_spin)

        row1.addWidget(QLabel("Type:"))
        self._type_combo = QComboBox()
        for et in EventType:
            self._type_combo.addItem(et.value, et)
        self._type_combo.setCurrentText(event.event_type.value)
        self._type_combo.currentIndexChanged.connect(self._on_type_changed)
        row1.addWidget(self._type_combo)

        btn_del = QPushButton("X")
        btn_del.setFixedWidth(24)
        btn_del.clicked.connect(lambda: self.delete_requested.emit(self._index))
        row1.addWidget(btn_del)
        layout.addLayout(row1)

        # Row 2: value
        row2 = QHBoxLayout()
        row2.addWidget(QLabel("Value:"))
        self._value_edit = QLineEdit(event.value)
        self._value_edit.textChanged.connect(self._on_value_changed)
        row2.addWidget(self._value_edit)
        layout.addLayout(row2)

        # Row 3: extra fields (volume, pitch, count, spread)
        self._extra_layout = QHBoxLayout()
        layout.addLayout(self._extra_layout)
        self._build_extra_fields()

    def _on_tick_changed(self, val: int) -> None:
        self._event.tick = val
        self.changed.emit()

    def _on_type_changed(self, idx: int) -> None:
        self._event.event_type = self._type_combo.currentData()
        self._build_extra_fields()
        self.changed.emit()

    def _on_value_changed(self, text: str) -> None:
        self._event.value = text
        self.changed.emit()

    def _build_extra_fields(self) -> None:
        """Build extra fields based on event type."""
        # Clear existing
        while self._extra_layout.count():
            item = self._extra_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        et = self._event.event_type

        if et == EventType.SOUND:
            self._extra_layout.addWidget(QLabel("Vol:"))
            vol_spin = QDoubleSpinBox()
            vol_spin.setRange(0.0, 10.0)
            vol_spin.setSingleStep(0.1)
            vol_spin.setValue(self._event.extra.get("volume", 1.0))
            vol_spin.valueChanged.connect(lambda v: self._set_extra("volume", v))
            self._extra_layout.addWidget(vol_spin)

            self._extra_layout.addWidget(QLabel("Pitch:"))
            pitch_spin = QDoubleSpinBox()
            pitch_spin.setRange(0.0, 2.0)
            pitch_spin.setSingleStep(0.1)
            pitch_spin.setValue(self._event.extra.get("pitch", 1.0))
            pitch_spin.valueChanged.connect(lambda v: self._set_extra("pitch", v))
            self._extra_layout.addWidget(pitch_spin)

        elif et == EventType.PARTICLE:
            self._extra_layout.addWidget(QLabel("Count:"))
            count_spin = QSpinBox()
            count_spin.setRange(1, 100)
            count_spin.setValue(self._event.extra.get("count", 1))
            count_spin.valueChanged.connect(lambda v: self._set_extra("count", v))
            self._extra_layout.addWidget(count_spin)

            self._extra_layout.addWidget(QLabel("Spread:"))
            spread_spin = QDoubleSpinBox()
            spread_spin.setRange(0.0, 10.0)
            spread_spin.setSingleStep(0.1)
            spread_spin.setValue(self._event.extra.get("spread", 0.5))
            spread_spin.valueChanged.connect(lambda v: self._set_extra("spread", v))
            self._extra_layout.addWidget(spread_spin)

    def _set_extra(self, key: str, value: float) -> None:
        self._event.extra[key] = value
        self.changed.emit()
```

- [ ] Step 3: Create `editor/panels/properties_panel.py`

```python
"""Properties panel for editing keyframes, animation settings, and events."""

from __future__ import annotations

from typing import Optional

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QComboBox,
    QDoubleSpinBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QScrollArea,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from editor.model.animation_data import (
    AnimDef,
    EasingType,
    EndBehavior,
    GroupTrack,
    Keyframe,
    SpinKeyframe,
    TextureKeyframe,
    TrackType,
    VisibleKeyframe,
)
from editor.model.project import Project
from editor.panels.event_editor import EventEditorWidget


class PropertiesPanel(QWidget):
    """Right-side panel for editing keyframe values, animation settings, and events."""

    animation_settings_changed = pyqtSignal()
    keyframe_value_changed = pyqtSignal()

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._project: Optional[Project] = None
        self._updating: bool = False

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        container = QWidget()
        self._layout = QVBoxLayout(container)
        self._layout.setContentsMargins(8, 8, 8, 8)
        self._layout.setSpacing(8)

        # --- Keyframe section ---
        self._kf_group = QGroupBox("Keyframe")
        kf_layout = QVBoxLayout(self._kf_group)

        # Tick
        tick_row = QHBoxLayout()
        tick_row.addWidget(QLabel("Tick:"))
        self._kf_tick = QSpinBox()
        self._kf_tick.setRange(0, 10000)
        self._kf_tick.valueChanged.connect(self._on_kf_tick_changed)
        tick_row.addWidget(self._kf_tick)
        kf_layout.addLayout(tick_row)

        # Value XYZ
        val_row = QHBoxLayout()
        val_row.addWidget(QLabel("X:"))
        self._kf_x = QDoubleSpinBox()
        self._kf_x.setRange(-10000, 10000)
        self._kf_x.setDecimals(3)
        self._kf_x.valueChanged.connect(self._on_kf_value_changed)
        val_row.addWidget(self._kf_x)
        val_row.addWidget(QLabel("Y:"))
        self._kf_y = QDoubleSpinBox()
        self._kf_y.setRange(-10000, 10000)
        self._kf_y.setDecimals(3)
        self._kf_y.valueChanged.connect(self._on_kf_value_changed)
        val_row.addWidget(self._kf_y)
        val_row.addWidget(QLabel("Z:"))
        self._kf_z = QDoubleSpinBox()
        self._kf_z.setRange(-10000, 10000)
        self._kf_z.setDecimals(3)
        self._kf_z.valueChanged.connect(self._on_kf_value_changed)
        val_row.addWidget(self._kf_z)
        kf_layout.addLayout(val_row)

        # Easing
        easing_row = QHBoxLayout()
        easing_row.addWidget(QLabel("Easing:"))
        self._kf_easing = QComboBox()
        for e in EasingType:
            self._kf_easing.addItem(e.value, e)
        self._kf_easing.currentIndexChanged.connect(self._on_kf_easing_changed)
        easing_row.addWidget(self._kf_easing)
        kf_layout.addLayout(easing_row)

        self._kf_group.setVisible(False)
        self._layout.addWidget(self._kf_group)

        # --- Animation settings section ---
        self._anim_group = QGroupBox("Animation")
        anim_layout = QVBoxLayout(self._anim_group)

        # Name
        name_row = QHBoxLayout()
        name_row.addWidget(QLabel("Name:"))
        self._anim_name = QLineEdit()
        self._anim_name.setReadOnly(True)
        name_row.addWidget(self._anim_name)
        anim_layout.addLayout(name_row)

        # Duration
        dur_row = QHBoxLayout()
        dur_row.addWidget(QLabel("Duration:"))
        self._anim_duration = QSpinBox()
        self._anim_duration.setRange(1, 10000)
        self._anim_duration.setSuffix(" ticks")
        self._anim_duration.valueChanged.connect(self._on_anim_duration_changed)
        dur_row.addWidget(self._anim_duration)
        self._anim_duration_sec = QLabel("(0.0s)")
        dur_row.addWidget(self._anim_duration_sec)
        anim_layout.addLayout(dur_row)

        # EndBehavior
        end_row = QHBoxLayout()
        end_row.addWidget(QLabel("End Behavior:"))
        self._anim_end = QComboBox()
        for eb in EndBehavior:
            self._anim_end.addItem(eb.value, eb)
        self._anim_end.currentIndexChanged.connect(self._on_anim_end_changed)
        end_row.addWidget(self._anim_end)
        anim_layout.addLayout(end_row)

        # Rollback duration
        rb_row = QHBoxLayout()
        rb_row.addWidget(QLabel("Rollback Duration:"))
        self._anim_rollback = QSpinBox()
        self._anim_rollback.setRange(0, 10000)
        self._anim_rollback.valueChanged.connect(self._on_anim_settings_changed)
        rb_row.addWidget(self._anim_rollback)
        anim_layout.addLayout(rb_row)

        # BlendIn / BlendOut
        blend_row = QHBoxLayout()
        blend_row.addWidget(QLabel("Blend In:"))
        self._anim_blend_in = QSpinBox()
        self._anim_blend_in.setRange(0, 1000)
        self._anim_blend_in.valueChanged.connect(self._on_anim_settings_changed)
        blend_row.addWidget(self._anim_blend_in)
        blend_row.addWidget(QLabel("Out:"))
        self._anim_blend_out = QSpinBox()
        self._anim_blend_out.setRange(0, 1000)
        self._anim_blend_out.valueChanged.connect(self._on_anim_settings_changed)
        blend_row.addWidget(self._anim_blend_out)
        anim_layout.addLayout(blend_row)

        # Loop count / pause
        loop_row = QHBoxLayout()
        loop_row.addWidget(QLabel("Loop Count:"))
        self._anim_loop_count = QSpinBox()
        self._anim_loop_count.setRange(0, 10000)
        self._anim_loop_count.valueChanged.connect(self._on_anim_settings_changed)
        loop_row.addWidget(self._anim_loop_count)
        loop_row.addWidget(QLabel("Pause:"))
        self._anim_loop_pause = QSpinBox()
        self._anim_loop_pause.setRange(0, 10000)
        self._anim_loop_pause.valueChanged.connect(self._on_anim_settings_changed)
        loop_row.addWidget(self._anim_loop_pause)
        anim_layout.addLayout(loop_row)

        self._anim_group.setVisible(False)
        self._layout.addWidget(self._anim_group)

        # --- Events section ---
        self._event_editor = EventEditorWidget()
        self._layout.addWidget(self._event_editor)

        self._layout.addStretch()

        scroll.setWidget(container)

        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(0, 0, 0, 0)
        outer_layout.addWidget(scroll)

    def set_project(self, project: Project) -> None:
        self._project = project

    def refresh_animation(self, animation: Optional[AnimDef]) -> None:
        """Refresh the animation settings section."""
        self._updating = True
        if animation is None:
            self._anim_group.setVisible(False)
            self._event_editor.set_animation(None)
        else:
            self._anim_group.setVisible(True)
            self._anim_name.setText(animation.name)
            self._anim_duration.setValue(animation.duration)
            self._anim_duration_sec.setText(f"({animation.duration / 20.0:.1f}s)")
            self._anim_end.setCurrentText(animation.end_behavior.value)
            self._anim_rollback.setValue(animation.rollback_duration)
            self._anim_blend_in.setValue(animation.blend_in)
            self._anim_blend_out.setValue(animation.blend_out)
            self._anim_loop_count.setValue(animation.loop_count)
            self._anim_loop_pause.setValue(animation.loop_pause)
            self._event_editor.set_animation(animation)
        self._updating = False

    def refresh_keyframe(
        self,
        group_name: Optional[str],
        track_type: Optional[str],
        kf_index: Optional[int],
        animation: Optional[AnimDef],
    ) -> None:
        """Refresh the keyframe editing section."""
        self._updating = True
        if group_name is None or track_type is None or kf_index is None or animation is None:
            self._kf_group.setVisible(False)
            self._updating = False
            return

        group_track = animation.tracks.get(group_name)
        if group_track is None:
            self._kf_group.setVisible(False)
            self._updating = False
            return

        tt = TrackType(track_type)
        keyframes = self._get_keyframes(group_track, tt)
        if kf_index < 0 or kf_index >= len(keyframes):
            self._kf_group.setVisible(False)
            self._updating = False
            return

        kf = keyframes[kf_index]
        self._kf_group.setVisible(True)
        self._kf_tick.setMaximum(animation.duration)
        self._kf_tick.setValue(kf.tick)

        # Show/hide XYZ based on track type
        is_vec3 = tt in (TrackType.ROTATION, TrackType.TRANSLATION, TrackType.SCALE)
        self._kf_x.setVisible(is_vec3)
        self._kf_y.setVisible(is_vec3)
        self._kf_z.setVisible(is_vec3)

        if is_vec3 and hasattr(kf, "value") and isinstance(kf.value, list):
            self._kf_x.setValue(kf.value[0])
            self._kf_y.setValue(kf.value[1])
            self._kf_z.setValue(kf.value[2])

        # Easing
        has_easing = hasattr(kf, "easing")
        self._kf_easing.setVisible(has_easing)
        if has_easing:
            self._kf_easing.setCurrentText(kf.easing.value)

        self._updating = False

    def _get_keyframes(self, group_track: GroupTrack, tt: TrackType) -> list:
        if tt == TrackType.ROTATION:
            return group_track.rotation
        elif tt == TrackType.TRANSLATION:
            return group_track.translation
        elif tt == TrackType.SCALE:
            return group_track.scale
        elif tt == TrackType.VISIBLE:
            return group_track.visible
        elif tt == TrackType.SPIN:
            return group_track.spin
        elif tt == TrackType.TEXTURE:
            return group_track.texture
        return []

    # --- Signal handlers ---

    def _on_kf_tick_changed(self, val: int) -> None:
        if self._updating or self._project is None:
            return
        anim = self._project.current_animation
        if anim is None:
            return
        gt = anim.tracks.get(self._project.selected_group_name or "")
        if gt is None or self._project.selected_track_type is None or self._project.selected_keyframe_index is None:
            return
        kfs = self._get_keyframes(gt, TrackType(self._project.selected_track_type))
        idx = self._project.selected_keyframe_index
        if 0 <= idx < len(kfs):
            kfs[idx].tick = val
            kfs.sort(key=lambda k: k.tick)
            self.keyframe_value_changed.emit()

    def _on_kf_value_changed(self) -> None:
        if self._updating or self._project is None:
            return
        anim = self._project.current_animation
        if anim is None:
            return
        gt = anim.tracks.get(self._project.selected_group_name or "")
        if gt is None or self._project.selected_track_type is None or self._project.selected_keyframe_index is None:
            return
        kfs = self._get_keyframes(gt, TrackType(self._project.selected_track_type))
        idx = self._project.selected_keyframe_index
        if 0 <= idx < len(kfs) and hasattr(kfs[idx], "value") and isinstance(kfs[idx].value, list):
            kfs[idx].value = [self._kf_x.value(), self._kf_y.value(), self._kf_z.value()]
            self.keyframe_value_changed.emit()

    def _on_kf_easing_changed(self, index: int) -> None:
        if self._updating or self._project is None:
            return
        anim = self._project.current_animation
        if anim is None:
            return
        gt = anim.tracks.get(self._project.selected_group_name or "")
        if gt is None or self._project.selected_track_type is None or self._project.selected_keyframe_index is None:
            return
        kfs = self._get_keyframes(gt, TrackType(self._project.selected_track_type))
        idx = self._project.selected_keyframe_index
        if 0 <= idx < len(kfs) and hasattr(kfs[idx], "easing"):
            kfs[idx].easing = self._kf_easing.currentData()
            self.keyframe_value_changed.emit()

    def _on_anim_duration_changed(self, val: int) -> None:
        if self._updating or self._project is None:
            return
        anim = self._project.current_animation
        if anim:
            anim.duration = val
            self._anim_duration_sec.setText(f"({val / 20.0:.1f}s)")
            self.animation_settings_changed.emit()

    def _on_anim_end_changed(self, index: int) -> None:
        if self._updating or self._project is None:
            return
        anim = self._project.current_animation
        if anim:
            anim.end_behavior = self._anim_end.currentData()
            self.animation_settings_changed.emit()

    def _on_anim_settings_changed(self) -> None:
        if self._updating or self._project is None:
            return
        anim = self._project.current_animation
        if anim:
            anim.rollback_duration = self._anim_rollback.value()
            anim.blend_in = self._anim_blend_in.value()
            anim.blend_out = self._anim_blend_out.value()
            anim.loop_count = self._anim_loop_count.value()
            anim.loop_pause = self._anim_loop_pause.value()
            self.animation_settings_changed.emit()
```

- [ ] Step 4: Update `editor/main_window.py` to use PropertiesPanel

Replace the properties placeholder section in `MainWindow.__init__` with:

```python
        # --- Right dock: Properties Panel ---
        from editor.panels.properties_panel import PropertiesPanel

        self.properties_panel = PropertiesPanel()
        self.properties_panel.set_project(self.project)

        right_dock = QDockWidget("Properties", self)
        right_dock.setWidget(self.properties_panel)
        right_dock.setMinimumWidth(280)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, right_dock)
```

Add these connections after the existing ones:

```python
        self.properties_panel.keyframe_value_changed.connect(self._on_property_changed)
        self.properties_panel.animation_settings_changed.connect(self._on_animation_settings_changed)
```

Add/update these methods in `MainWindow`:

```python
    def _on_keyframe_selected(self, group_name: str, track_type_str: str, kf_index: int) -> None:
        """Handle keyframe selection."""
        self.project.selected_group_name = group_name
        self.project.selected_track_type = track_type_str
        self.project.selected_keyframe_index = kf_index
        self.properties_panel.refresh_keyframe(
            group_name, track_type_str, kf_index, self.project.current_animation
        )

    def _new_animation(self) -> None:
        """Create a new animation."""
        name, ok = QInputDialog.getText(self, "New Animation", "Animation name:")
        if not ok or not name.strip():
            return
        name = name.strip()
        duration, ok = QInputDialog.getInt(self, "New Animation", "Duration (ticks):", 20, 1, 10000)
        if not ok:
            return
        anim = self.project.create_animation(name, duration)
        self.playback.set_animation(anim)
        self.timeline_widget.set_animation(anim)
        self.properties_panel.refresh_animation(anim)
        self._tick_label.setText(f"Tick: 0 / {duration}")

    def _on_property_changed(self) -> None:
        """Handle keyframe value changed from properties panel."""
        self.project.is_dirty = True
        anim = self.project.current_animation
        self.timeline_widget.set_animation(anim)
        self.playback._emit_transforms()

    def _on_animation_settings_changed(self) -> None:
        """Handle animation settings changed."""
        self.project.is_dirty = True
        anim = self.project.current_animation
        if anim:
            self.playback.set_animation(anim)
            self.timeline_widget.set_animation(anim)
```

Also wire the `selection_cleared` signal:

```python
        self.timeline_widget.selection_cleared.connect(self._on_selection_cleared)
```

And add:

```python
    def _on_selection_cleared(self) -> None:
        self.project.selected_keyframe_index = None
        self.project.selected_track_type = None
        self.properties_panel.refresh_keyframe(None, None, None, None)
```

---

## Task 4: Export .erianim + Undo/Redo + Keyboard Shortcuts

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\export\__init__.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\export\erianim_exporter.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\commands\__init__.py`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\commands\undo_commands.py`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\editor\main_window.py` -- add export action, undo/redo stack, all keyboard shortcuts, save/load project.

**Dependencies:** Tasks 1-3 complete.

**After this task:** The user can export a valid `.erianim.json` file via File > Export or Ctrl+E. The export validates the data before writing. Undo/Redo works for all keyframe add/delete/move operations via Ctrl+Z/Ctrl+Y. All keyboard shortcuts from the spec are functional (K=add keyframe, Del=delete, Space=play/pause, arrows=step, F=focus, Ctrl+S=save, Ctrl+D=duplicate, Ctrl+A=select all).

- [ ] Step 1: Create `editor/export/__init__.py`

```python
"""Export functionality for .erianim format."""
```

- [ ] Step 2: Create `editor/export/erianim_exporter.py`

```python
"""Exporter that writes AnimFile data to .erianim.json format."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from editor.model.animation_data import (
    AnimDef,
    AnimEvent,
    AnimFile,
    EasingType,
    EndBehavior,
    EventType,
    GroupTrack,
    Keyframe,
    SpinKeyframe,
    TextureKeyframe,
    VisibleKeyframe,
)


class ValidationError:
    """A validation issue found during export."""

    def __init__(self, level: str, message: str) -> None:
        self.level = level  # "error" or "warning"
        self.message = message

    def __str__(self) -> str:
        return f"[{self.level.upper()}] {self.message}"


def validate(anim_file: AnimFile, group_names: List[str]) -> List[ValidationError]:
    """Validate an AnimFile before export.

    Returns a list of validation errors/warnings.
    """
    issues: List[ValidationError] = []

    if not anim_file.model:
        issues.append(ValidationError("error", "Model ResourceLocation is not set."))

    if not anim_file.animations:
        issues.append(ValidationError("error", "No animations defined."))

    for anim_name, anim in anim_file.animations.items():
        if anim.duration <= 0:
            issues.append(ValidationError("error", f"Animation '{anim_name}': duration must be > 0."))

        # Validate tracks reference existing groups
        for group_name in anim.tracks:
            if group_names and group_name not in group_names:
                issues.append(ValidationError("warning",
                    f"Animation '{anim_name}': track '{group_name}' references a group not found in the model."))

        # Validate keyframe ticks are in range
        for group_name, track in anim.tracks.items():
            for kf in track.rotation:
                if kf.tick < 0 or kf.tick > anim.duration:
                    issues.append(ValidationError("error",
                        f"Animation '{anim_name}', {group_name}.rotation: keyframe tick {kf.tick} out of range [0, {anim.duration}]."))
            for kf in track.translation:
                if kf.tick < 0 or kf.tick > anim.duration:
                    issues.append(ValidationError("error",
                        f"Animation '{anim_name}', {group_name}.translation: keyframe tick {kf.tick} out of range."))
            for kf in track.scale:
                if kf.tick < 0 or kf.tick > anim.duration:
                    issues.append(ValidationError("error",
                        f"Animation '{anim_name}', {group_name}.scale: keyframe tick {kf.tick} out of range."))
            for kf in track.visible:
                if kf.tick < 0 or kf.tick > anim.duration:
                    issues.append(ValidationError("error",
                        f"Animation '{anim_name}', {group_name}.visible: keyframe tick {kf.tick} out of range."))
            for kf in track.spin:
                if kf.tick < 0 or kf.tick > anim.duration:
                    issues.append(ValidationError("error",
                        f"Animation '{anim_name}', {group_name}.spin: keyframe tick {kf.tick} out of range."))
            for kf in track.texture:
                if kf.tick < 0 or kf.tick > anim.duration:
                    issues.append(ValidationError("error",
                        f"Animation '{anim_name}', {group_name}.texture: keyframe tick {kf.tick} out of range."))

            # Warning: no keyframe at tick 0
            for track_name, kf_list in [
                ("rotation", track.rotation),
                ("translation", track.translation),
                ("scale", track.scale),
            ]:
                if kf_list and kf_list[0].tick != 0:
                    issues.append(ValidationError("warning",
                        f"Animation '{anim_name}', {group_name}.{track_name}: no keyframe at tick 0."))

        # Validate events
        for evt in anim.events:
            if evt.tick < 0 or evt.tick > anim.duration:
                issues.append(ValidationError("error",
                    f"Animation '{anim_name}': event at tick {evt.tick} out of range [0, {anim.duration}]."))

        # Validate endBehavior-specific fields
        if anim.end_behavior == EndBehavior.ROLLBACK and anim.rollback_duration <= 0:
            issues.append(ValidationError("warning",
                f"Animation '{anim_name}': endBehavior is 'rollback' but rollbackDuration is 0."))
        if anim.end_behavior == EndBehavior.LOOP_COUNT and anim.loop_count <= 0:
            issues.append(ValidationError("warning",
                f"Animation '{anim_name}': endBehavior is 'loop_count' but loopCount is 0."))

    return issues


def export(anim_file: AnimFile) -> str:
    """Export an AnimFile to a JSON string conforming to .erianim format.

    Fields with default values are omitted to reduce file size.
    Output is indented with 2 spaces for human readability.
    """
    data: Dict[str, Any] = {
        "format_version": anim_file.format_version,
        "model": anim_file.model,
        "animations": {},
    }

    for anim_name, anim in anim_file.animations.items():
        anim_data: Dict[str, Any] = {
            "duration": anim.duration,
        }

        # Only include non-default values
        if anim.end_behavior != EndBehavior.FREEZE:
            anim_data["endBehavior"] = anim.end_behavior.value
        if anim.rollback_duration > 0:
            anim_data["rollbackDuration"] = anim.rollback_duration
        if anim.blend_in > 0:
            anim_data["blendIn"] = anim.blend_in
        if anim.blend_out > 0:
            anim_data["blendOut"] = anim.blend_out
        if anim.loop_count > 0:
            anim_data["loopCount"] = anim.loop_count
        if anim.loop_pause > 0:
            anim_data["loopPause"] = anim.loop_pause

        # Tracks
        tracks_data: Dict[str, Any] = {}
        for group_name, track in anim.tracks.items():
            group_data: Dict[str, Any] = {}

            if track.rotation:
                group_data["rotation"] = [_serialize_keyframe(kf) for kf in track.rotation]
            if track.translation:
                group_data["translation"] = [_serialize_keyframe(kf) for kf in track.translation]
            if track.scale:
                group_data["scale"] = [_serialize_keyframe(kf) for kf in track.scale]
            if track.visible:
                group_data["visible"] = [{"tick": kf.tick, "value": kf.value} for kf in track.visible]
            if track.spin:
                group_data["spin"] = [_serialize_spin_keyframe(kf) for kf in track.spin]
            if track.texture:
                group_data["texture"] = [
                    {"tick": kf.tick, "target": kf.target, "value": kf.value}
                    for kf in track.texture
                ]

            if group_data:
                tracks_data[group_name] = group_data

        anim_data["tracks"] = tracks_data

        # Events
        if anim.events:
            anim_data["events"] = [_serialize_event(evt) for evt in anim.events]
        else:
            anim_data["events"] = []

        data["animations"][anim_name] = anim_data

    return json.dumps(data, indent=2, ensure_ascii=False)


def _serialize_keyframe(kf: Keyframe) -> Dict[str, Any]:
    """Serialize a standard keyframe."""
    result: Dict[str, Any] = {
        "tick": kf.tick,
        "value": [round(v, 4) for v in kf.value],
    }
    if kf.easing != EasingType.LINEAR:
        result["easing"] = kf.easing.value
    return result


def _serialize_spin_keyframe(kf: SpinKeyframe) -> Dict[str, Any]:
    """Serialize a spin keyframe."""
    result: Dict[str, Any] = {
        "tick": kf.tick,
        "axis": kf.axis,
        "speed": round(kf.speed, 4),
    }
    if kf.easing != EasingType.LINEAR:
        result["easing"] = kf.easing.value
    return result


def _serialize_event(evt: AnimEvent) -> Dict[str, Any]:
    """Serialize an animation event."""
    result: Dict[str, Any] = {
        "tick": evt.tick,
        "type": evt.event_type.value,
    }
    if evt.value:
        result["value"] = evt.value
    # Extra fields
    for key, value in evt.extra.items():
        result[key] = value
    return result
```

- [ ] Step 3: Create `editor/commands/__init__.py`

```python
"""Undo/redo command classes."""
```

- [ ] Step 4: Create `editor/commands/undo_commands.py`

```python
"""QUndoCommand subclasses for reversible operations."""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional

from PyQt6.QtGui import QUndoCommand

from editor.model.animation_data import (
    AnimDef,
    EasingType,
    GroupTrack,
    Keyframe,
    SpinKeyframe,
    TextureKeyframe,
    TrackType,
    VisibleKeyframe,
)


class AddKeyframeCommand(QUndoCommand):
    """Add a keyframe to a track."""

    def __init__(
        self,
        animation: AnimDef,
        group_name: str,
        track_type: TrackType,
        keyframe: Any,
        description: str = "Add Keyframe",
    ) -> None:
        super().__init__(description)
        self._animation = animation
        self._group_name = group_name
        self._track_type = track_type
        self._keyframe = keyframe

    def redo(self) -> None:
        if self._group_name not in self._animation.tracks:
            self._animation.tracks[self._group_name] = GroupTrack(group_name=self._group_name)
        track = self._animation.tracks[self._group_name]
        kf_list = _get_kf_list(track, self._track_type)
        kf_list.append(self._keyframe)
        kf_list.sort(key=lambda k: k.tick)

    def undo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if self._keyframe in kf_list:
            kf_list.remove(self._keyframe)


class DeleteKeyframeCommand(QUndoCommand):
    """Delete a keyframe from a track."""

    def __init__(
        self,
        animation: AnimDef,
        group_name: str,
        track_type: TrackType,
        kf_index: int,
        description: str = "Delete Keyframe",
    ) -> None:
        super().__init__(description)
        self._animation = animation
        self._group_name = group_name
        self._track_type = track_type
        self._kf_index = kf_index
        self._saved_keyframe: Optional[Any] = None

    def redo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if 0 <= self._kf_index < len(kf_list):
            self._saved_keyframe = kf_list.pop(self._kf_index)

    def undo(self) -> None:
        if self._saved_keyframe is None:
            return
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            self._animation.tracks[self._group_name] = GroupTrack(group_name=self._group_name)
            track = self._animation.tracks[self._group_name]
        kf_list = _get_kf_list(track, self._track_type)
        kf_list.append(self._saved_keyframe)
        kf_list.sort(key=lambda k: k.tick)


class MoveKeyframeCommand(QUndoCommand):
    """Change the tick of a keyframe."""

    def __init__(
        self,
        animation: AnimDef,
        group_name: str,
        track_type: TrackType,
        kf_index: int,
        old_tick: int,
        new_tick: int,
        description: str = "Move Keyframe",
    ) -> None:
        super().__init__(description)
        self._animation = animation
        self._group_name = group_name
        self._track_type = track_type
        self._kf_index = kf_index
        self._old_tick = old_tick
        self._new_tick = new_tick

    def redo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if 0 <= self._kf_index < len(kf_list):
            kf_list[self._kf_index].tick = self._new_tick
            kf_list.sort(key=lambda k: k.tick)

    def undo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        # Find the keyframe by new_tick and revert
        for kf in kf_list:
            if kf.tick == self._new_tick:
                kf.tick = self._old_tick
                break
        kf_list.sort(key=lambda k: k.tick)


class ChangeKeyframeValueCommand(QUndoCommand):
    """Change the value(s) of a keyframe."""

    def __init__(
        self,
        animation: AnimDef,
        group_name: str,
        track_type: TrackType,
        kf_index: int,
        old_value: Any,
        new_value: Any,
        description: str = "Change Keyframe Value",
    ) -> None:
        super().__init__(description)
        self._animation = animation
        self._group_name = group_name
        self._track_type = track_type
        self._kf_index = kf_index
        self._old_value = copy.deepcopy(old_value)
        self._new_value = copy.deepcopy(new_value)

    def redo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if 0 <= self._kf_index < len(kf_list):
            kf_list[self._kf_index].value = copy.deepcopy(self._new_value)

    def undo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if 0 <= self._kf_index < len(kf_list):
            kf_list[self._kf_index].value = copy.deepcopy(self._old_value)


class ChangeKeyframeEasingCommand(QUndoCommand):
    """Change the easing of a keyframe."""

    def __init__(
        self,
        animation: AnimDef,
        group_name: str,
        track_type: TrackType,
        kf_index: int,
        old_easing: EasingType,
        new_easing: EasingType,
        description: str = "Change Easing",
    ) -> None:
        super().__init__(description)
        self._animation = animation
        self._group_name = group_name
        self._track_type = track_type
        self._kf_index = kf_index
        self._old_easing = old_easing
        self._new_easing = new_easing

    def redo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if 0 <= self._kf_index < len(kf_list) and hasattr(kf_list[self._kf_index], "easing"):
            kf_list[self._kf_index].easing = self._new_easing

    def undo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if 0 <= self._kf_index < len(kf_list) and hasattr(kf_list[self._kf_index], "easing"):
            kf_list[self._kf_index].easing = self._old_easing


class DuplicateKeyframeCommand(QUndoCommand):
    """Duplicate a keyframe at tick + 1."""

    def __init__(
        self,
        animation: AnimDef,
        group_name: str,
        track_type: TrackType,
        kf_index: int,
        description: str = "Duplicate Keyframe",
    ) -> None:
        super().__init__(description)
        self._animation = animation
        self._group_name = group_name
        self._track_type = track_type
        self._kf_index = kf_index
        self._new_keyframe: Optional[Any] = None

    def redo(self) -> None:
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if 0 <= self._kf_index < len(kf_list):
            original = kf_list[self._kf_index]
            self._new_keyframe = copy.deepcopy(original)
            self._new_keyframe.tick = min(original.tick + 1, self._animation.duration)
            kf_list.append(self._new_keyframe)
            kf_list.sort(key=lambda k: k.tick)

    def undo(self) -> None:
        if self._new_keyframe is None:
            return
        track = self._animation.tracks.get(self._group_name)
        if track is None:
            return
        kf_list = _get_kf_list(track, self._track_type)
        if self._new_keyframe in kf_list:
            kf_list.remove(self._new_keyframe)


def _get_kf_list(track: GroupTrack, track_type: TrackType) -> list:
    """Get the keyframe list for a track type."""
    if track_type == TrackType.ROTATION:
        return track.rotation
    elif track_type == TrackType.TRANSLATION:
        return track.translation
    elif track_type == TrackType.SCALE:
        return track.scale
    elif track_type == TrackType.VISIBLE:
        return track.visible
    elif track_type == TrackType.SPIN:
        return track.spin
    elif track_type == TrackType.TEXTURE:
        return track.texture
    return []
```

- [ ] Step 5: Update `editor/main_window.py` with export, undo/redo stack, and all keyboard shortcuts

Add these imports at the top:

```python
import json

from PyQt6.QtGui import QKeySequence, QShortcut, QUndoStack

from editor.commands.undo_commands import (
    AddKeyframeCommand,
    DeleteKeyframeCommand,
    DuplicateKeyframeCommand,
)
from editor.export.erianim_exporter import export, validate
```

Add to `__init__` before styling:

```python
        # --- Undo/Redo stack ---
        self.undo_stack = QUndoStack(self)

        # --- All keyboard shortcuts ---
        QShortcut(QKeySequence("Space"), self).activated.connect(self._toggle_play_pause)
        QShortcut(QKeySequence("Left"), self).activated.connect(self._prev_tick)
        QShortcut(QKeySequence("Right"), self).activated.connect(self._next_tick)
        QShortcut(QKeySequence("Home"), self).activated.connect(lambda: self._goto_tick(0))
        QShortcut(QKeySequence("End"), self).activated.connect(
            lambda: self._goto_tick(self.project.current_animation.duration if self.project.current_animation else 0)
        )
        QShortcut(QKeySequence("K"), self).activated.connect(self._add_keyframe_at_playhead)
        QShortcut(QKeySequence("Delete"), self).activated.connect(self._delete_selected_keyframe)
        QShortcut(QKeySequence("Ctrl+Z"), self).activated.connect(self.undo_stack.undo)
        QShortcut(QKeySequence("Ctrl+Y"), self).activated.connect(self.undo_stack.redo)
        QShortcut(QKeySequence("Ctrl+Shift+Z"), self).activated.connect(self.undo_stack.redo)
        QShortcut(QKeySequence("Ctrl+S"), self).activated.connect(self._save_project)
        QShortcut(QKeySequence("Ctrl+E"), self).activated.connect(self._export_erianim)
        QShortcut(QKeySequence("Ctrl+D"), self).activated.connect(self._duplicate_selected_keyframe)
        QShortcut(QKeySequence("F"), self).activated.connect(self._focus_selected_group)
        QShortcut(QKeySequence("Ctrl+A"), self).activated.connect(self._select_all_keyframes)
```

Add export action to the File menu in `_build_menu`:

```python
        file_menu.addSeparator()

        save_action = QAction("&Save Project...", self)
        save_action.setShortcut(QKeySequence("Ctrl+S"))
        save_action.triggered.connect(self._save_project)
        file_menu.addAction(save_action)

        export_action = QAction("&Export .erianim...", self)
        export_action.setShortcut(QKeySequence("Ctrl+E"))
        export_action.triggered.connect(self._export_erianim)
        file_menu.addAction(export_action)
```

Add edit menu:

```python
        # Edit menu
        edit_menu = menu_bar.addMenu("&Edit")

        undo_action = self.undo_stack.createUndoAction(self, "&Undo")
        undo_action.setShortcut(QKeySequence("Ctrl+Z"))
        edit_menu.addAction(undo_action)

        redo_action = self.undo_stack.createRedoAction(self, "&Redo")
        redo_action.setShortcut(QKeySequence("Ctrl+Y"))
        edit_menu.addAction(redo_action)
```

Add these methods to `MainWindow`:

```python
    def _add_keyframe_at_playhead(self) -> None:
        """Add a keyframe at the current playhead tick for the selected group (K shortcut)."""
        anim = self.project.current_animation
        group_name = self.project.selected_group_name
        if anim is None or group_name is None:
            return

        tick = self.playback.current_tick
        # Default to rotation track
        track_type = TrackType.ROTATION
        kf = Keyframe(tick=tick, value=[0.0, 0.0, 0.0])

        cmd = AddKeyframeCommand(anim, group_name, track_type, kf)
        self.undo_stack.push(cmd)
        self.project.is_dirty = True
        self.timeline_widget.set_animation(anim)

    def _delete_selected_keyframe(self) -> None:
        """Delete the currently selected keyframe (Delete shortcut)."""
        anim = self.project.current_animation
        group = self.project.selected_group_name
        tt = self.project.selected_track_type
        idx = self.project.selected_keyframe_index
        if anim is None or group is None or tt is None or idx is None:
            return

        cmd = DeleteKeyframeCommand(anim, group, TrackType(tt), idx)
        self.undo_stack.push(cmd)
        self.project.selected_keyframe_index = None
        self.project.is_dirty = True
        self.timeline_widget.set_animation(anim)
        self.properties_panel.refresh_keyframe(None, None, None, None)

    def _duplicate_selected_keyframe(self) -> None:
        """Duplicate the selected keyframe (Ctrl+D)."""
        anim = self.project.current_animation
        group = self.project.selected_group_name
        tt = self.project.selected_track_type
        idx = self.project.selected_keyframe_index
        if anim is None or group is None or tt is None or idx is None:
            return

        cmd = DuplicateKeyframeCommand(anim, group, TrackType(tt), idx)
        self.undo_stack.push(cmd)
        self.project.is_dirty = True
        self.timeline_widget.set_animation(anim)

    def _focus_selected_group(self) -> None:
        """Focus camera on the selected group (F shortcut)."""
        if self.project.model is None or self.project.selected_group_name is None:
            return
        group = self.project.model.groups_by_name.get(self.project.selected_group_name)
        if group is None:
            return
        import numpy as np
        center = np.array(group.origin, dtype=np.float32)
        self.viewport.camera.focus_on(center, 1.0)

    def _select_all_keyframes(self) -> None:
        """Select all keyframes in the active track (Ctrl+A). Currently a no-op placeholder."""
        pass  # Multi-selection is handled at the timeline widget level in a future iteration

    def _save_project(self) -> None:
        """Save the project as .erianim.json."""
        self._export_erianim()

    def _export_erianim(self) -> None:
        """Export the current animation file to .erianim.json."""
        if not self.project.anim_file.animations:
            QMessageBox.warning(self, "Export", "No animations to export.")
            return

        # Validate
        group_names = self.project.group_names()
        issues = validate(self.project.anim_file, group_names)
        errors = [i for i in issues if i.level == "error"]
        warnings = [i for i in issues if i.level == "warning"]

        if errors:
            msg = "Cannot export. Fix these errors:\n\n"
            msg += "\n".join(str(e) for e in errors)
            if warnings:
                msg += "\n\nWarnings:\n" + "\n".join(str(w) for w in warnings)
            QMessageBox.critical(self, "Export Validation Failed", msg)
            return

        if warnings:
            msg = "Warnings found:\n\n" + "\n".join(str(w) for w in warnings)
            msg += "\n\nExport anyway?"
            result = QMessageBox.warning(
                self, "Export Warnings", msg,
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if result != QMessageBox.StandardButton.Yes:
                return

        # Choose file
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Export .erianim",
            self.project.project_path or "",
            "EriAnim JSON (*.erianim.json);;All Files (*)",
        )
        if not file_path:
            return

        try:
            json_str = export(self.project.anim_file)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(json_str)
            self.project.project_path = file_path
            self.project.is_dirty = False
            QMessageBox.information(self, "Export", f"Exported successfully to:\n{file_path}")
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Failed to export:\n{e}")

    def _toggle_play_pause(self) -> None:
        if self.playback.is_playing:
            self.playback.pause()
        else:
            self.playback.play()

    def _prev_tick(self) -> None:
        self.playback.pause()
        self.playback.current_tick = max(0, self.playback.current_tick - 1)

    def _next_tick(self) -> None:
        self.playback.pause()
        duration = self.project.current_animation.duration if self.project.current_animation else 0
        self.playback.current_tick = min(duration, self.playback.current_tick + 1)

    def _goto_tick(self, tick: int) -> None:
        self.playback.pause()
        self.playback.current_tick = tick
```
