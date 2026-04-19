# EriAnim Editor -- Electron Desktop Application

> **For agentic workers:** This is a standalone Electron app, NOT a Forge mod. No Java, no Gradle. The project lives at `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\`. Use `npm install` then `npm start` to test. Vanilla JS only (ES6 modules) -- no TypeScript, no React, no bundler. Three.js loaded as a global via a vendor copy. Read CLAUDE.md before any work. CSS must be polished from Task 1 -- dark theme, no "we'll fix later".

**Goal:** Build a production-ready desktop animation editor for Blockbench 3D block models. The editor creates `.erianim.json` files consumed by EriAPI's `EriAnimParser` in Minecraft Forge 1.12.2. It replaces an abandoned Python/PyQt6 prototype.

**Architecture:** Electron main process + renderer with 4 panels (group tree, 3D viewport, properties, timeline). Three.js for WebGL rendering. Canvas 2D for the timeline. All state managed by a central `Project` singleton. Undo/redo via command pattern.

**Tech Stack:** Electron, Three.js (vendor copy, global `THREE`), HTML/CSS (dark theme, CSS Grid), Vanilla JS (ES6 modules via inline script), Node.js `fs` via preload bridge.

**Output format:** `.erianim.json` matching the exact schema parsed by `EriAnimParser.java` in EriAPI:

```json
{
  "format_version": 1,
  "model": "eriniumfaction:block/lootbox",
  "animations": {
    "open": {
      "duration": 40,
      "endBehavior": "freeze",
      "rollbackDuration": 10,
      "blendIn": 0,
      "blendOut": 0,
      "loopCount": 0,
      "loopPause": 0,
      "tracks": {
        "lid": {
          "rotation": [
            { "tick": 0, "value": [0, 0, 0], "easing": "linear" },
            { "tick": 20, "value": [-110, 0, 0], "easing": "ease_out_back" }
          ],
          "translation": [],
          "scale": [],
          "visible": [{ "tick": 0, "value": true }],
          "spin": [{ "tick": 0, "axis": "y", "speed": 5.0, "easing": "linear" }],
          "texture": [{ "tick": 10, "target": "side_core", "value": "side_core_active" }]
        }
      },
      "events": [
        { "tick": 5, "type": "sound", "value": "minecraft:block.chest.open", "volume": 1.0, "pitch": 1.2 },
        { "tick": 20, "type": "particle", "value": "minecraft:end_rod", "count": 10, "spread": 1.0 },
        { "tick": 20, "type": "callback", "value": "onOpened" },
        { "tick": 0, "type": "hide_group", "value": "interior" },
        { "tick": 10, "type": "show_group", "value": "interior" },
        { "tick": 15, "type": "cut", "value": "" }
      ]
    }
  }
}
```

**13 Easings** (from `Easing.java`): `linear`, `ease_in`, `ease_out`, `ease_in_out`, `ease_in_cubic`, `ease_out_cubic`, `bounce`, `elastic`, `ease_in_back`, `ease_out_back`, `ease_in_expo`, `ease_out_expo`, `spring`.

**7 EndBehaviors** (from `EndBehavior.java`): `freeze`, `rollback`, `rollback_instant`, `wait_server`, `loop`, `loop_count`, `loop_pause`.

**6 Event Types** (from `AnimationEvent.java`): `sound` (value + volume + pitch), `particle` (value + count + spread), `callback` (value), `hide_group` (value = group name), `show_group` (value = group name), `cut` (value = "").

**6 Track Types per group** (from `GroupTrack.java`): `rotation` (Keyframe[3]), `translation` (Keyframe[3]), `scale` (Keyframe[3]), `visible` (boolean keyframes), `spin` (SpinKeyframe: axis + speed), `texture` (TextureKeyframe: target + value).

**Reference Blockbench model for testing:** `C:\Users\killi\Pictures\Mcreator-Resources\3d models\lootbox\lootbox.json` -- 1324 lines, 13 textures, 75+ elements, 8 root groups with nested sub-groups.

---

## File Structure

```
tools/erianim-editor/
├── package.json
├── main.js                         -- Electron main process (BrowserWindow, menus, IPC)
├── preload.js                      -- contextBridge: exposes fileAPI (read/write/dialog)
├── vendor/
│   └── three.min.js                -- Three.js r152+ (global THREE, includes OrbitControls + TransformControls)
├── src/
│   ├── index.html                  -- Layout: toolbar + 4 panels + status bar
│   ├── styles/
│   │   ├── main.css                -- Reset, CSS variables, dark theme, CSS Grid layout
│   │   ├── viewport.css            -- Viewport canvas, gizmo mode buttons overlay
│   │   ├── timeline.css            -- Timeline canvas, ruler, transport bar
│   │   └── panels.css              -- Group tree, properties panel, scrollbars
│   ├── app.js                      -- Entry point: init all modules, wire events
│   ├── model/
│   │   ├── blockbench-parser.js    -- Parse Blockbench JSON -> JS objects (same logic as Java BlockbenchModelParser)
│   │   ├── model-data.js           -- Classes: BBModel, BBGroup, BBElement, BBFace
│   │   ├── animation-data.js       -- Classes: AnimFile, AnimDef, GroupTrack, Keyframe, SpinKeyframe, TextureKeyframe, AnimEvent
│   │   ├── project.js              -- Singleton: holds model + animations + selection + dirty state
│   │   └── easing.js               -- 13 easing functions (match Easing.java exactly)
│   ├── viewport/
│   │   ├── viewport.js             -- Three.js scene, camera, OrbitControls, resize, render loop
│   │   ├── model-renderer.js       -- Build THREE.Mesh per element, THREE.Group per group, multi-texture UV
│   │   ├── gizmo-controller.js     -- TransformControls (R/T/S), auto-keyframe on drag end
│   │   ├── grid-axes.js            -- GridHelper + colored axis lines
│   │   └── animation-preview.js    -- Apply interpolated transforms to meshes each frame
│   ├── timeline/
│   │   ├── timeline.js             -- Canvas 2D: ruler, tracks, keyframe diamonds, playhead, selection
│   │   ├── playback.js             -- Play/pause/stop/loop controller at 20 TPS
│   │   └── track-builder.js        -- Build visible track list from animation data
│   ├── panels/
│   │   ├── group-tree.js           -- DOM tree: expand/collapse, click select, visibility toggle
│   │   ├── properties-panel.js     -- Contextual panel: keyframe editor, animation settings
│   │   └── event-editor.js         -- Event list editor (add/remove/edit events)
│   ├── commands/
│   │   └── undo-manager.js         -- Command pattern: execute/undo/redo with stack
│   └── export/
│       └── erianim-exporter.js     -- Serialize to .erianim.json matching EriAnimParser schema
```

---

## Task 1: Electron Shell + Three.js Viewport + Blockbench Parser

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\package.json`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\main.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\preload.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\index.html`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\styles\main.css`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\styles\viewport.css`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\app.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\model\blockbench-parser.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\model\model-data.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\viewport\viewport.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\viewport\model-renderer.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\viewport\grid-axes.js`

**Files to modify:** None (greenfield).

**Dependencies:** `electron` (npm), `three` (copy `node_modules/three/build/three.min.js` to `vendor/` post-install).

**Result:** Open a Blockbench JSON file and see the textured 3D model in the viewport with orbit camera.

---

- [ ] Step 1: Create `package.json`

```json
{
  "name": "erianim-editor",
  "version": "1.0.0",
  "description": "EriAnim Editor - 3D Block Animation Editor for Minecraft",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "postinstall": "node -e \"const fs=require('fs');const p='node_modules/three/build/three.min.js';if(fs.existsSync(p)){fs.mkdirSync('vendor',{recursive:true});fs.copyFileSync(p,'vendor/three.min.js');console.log('Copied three.min.js to vendor/');}\"",
    "copy-three-addons": "node -e \"const fs=require('fs');const src='node_modules/three/examples/js/controls/';const dst='vendor/controls/';fs.mkdirSync(dst,{recursive:true});['OrbitControls.js','TransformControls.js'].forEach(f=>{if(fs.existsSync(src+f)){fs.copyFileSync(src+f,dst+f);console.log('Copied '+f);}});\""
  },
  "devDependencies": {
    "electron": "^28.0.0"
  },
  "dependencies": {
    "three": "^0.152.0"
  }
}
```

> **Note on Three.js loading:** Three.js r152 uses ES modules natively. Since we avoid bundlers, we load `three.min.js` via a `<script>` tag that sets the global `THREE`. For OrbitControls and TransformControls (which are add-ons), we use the legacy `examples/js/controls/` files that extend the global `THREE`. The `postinstall` and `copy-three-addons` scripts handle copying these files to `vendor/`.

After creating the file, run:
```bash
cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && npm install && npm run copy-three-addons
```

Verify `vendor/three.min.js`, `vendor/controls/OrbitControls.js`, and `vendor/controls/TransformControls.js` exist.

---

- [ ] Step 2: Create `main.js` (Electron main process)

```js
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 700,
        backgroundColor: '#11111b',
        title: 'EriAnim Editor',
        icon: path.join(__dirname, 'src', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    buildMenu();
}

function buildMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Blockbench Model...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => mainWindow.webContents.send('menu:open-model')
                },
                {
                    label: 'Open Animation File...',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: () => mainWindow.webContents.send('menu:open-anim')
                },
                { type: 'separator' },
                {
                    label: 'Save Animation',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => mainWindow.webContents.send('menu:save')
                },
                {
                    label: 'Save Animation As...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => mainWindow.webContents.send('menu:save-as')
                },
                {
                    label: 'Export .erianim.json...',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => mainWindow.webContents.send('menu:export')
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    click: () => mainWindow.webContents.send('menu:undo')
                },
                {
                    label: 'Redo',
                    accelerator: 'CmdOrCtrl+Y',
                    click: () => mainWindow.webContents.send('menu:redo')
                },
                { type: 'separator' },
                {
                    label: 'Copy Keyframes',
                    accelerator: 'CmdOrCtrl+C',
                    click: () => mainWindow.webContents.send('menu:copy')
                },
                {
                    label: 'Paste Keyframes',
                    accelerator: 'CmdOrCtrl+V',
                    click: () => mainWindow.webContents.send('menu:paste')
                },
                {
                    label: 'Duplicate Keyframes',
                    accelerator: 'CmdOrCtrl+D',
                    click: () => mainWindow.webContents.send('menu:duplicate')
                },
                {
                    label: 'Select All Keyframes',
                    accelerator: 'CmdOrCtrl+A',
                    click: () => mainWindow.webContents.send('menu:select-all')
                },
                {
                    label: 'Delete Selection',
                    accelerator: 'Delete',
                    click: () => mainWindow.webContents.send('menu:delete')
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Onion Skinning',
                    type: 'checkbox',
                    checked: false,
                    click: (item) => mainWindow.webContents.send('menu:onion-skin', item.checked)
                },
                { type: 'separator' },
                {
                    label: 'Focus Selected Group',
                    accelerator: 'F',
                    click: () => mainWindow.webContents.send('menu:focus')
                },
                { type: 'separator' },
                { role: 'toggleDevTools' },
                { role: 'reload' }
            ]
        },
        {
            label: 'Animation',
            submenu: [
                {
                    label: 'New Animation',
                    click: () => mainWindow.webContents.send('menu:new-anim')
                },
                {
                    label: 'Delete Animation',
                    click: () => mainWindow.webContents.send('menu:delete-anim')
                },
                { type: 'separator' },
                {
                    label: 'Add Keyframe',
                    accelerator: 'K',
                    click: () => mainWindow.webContents.send('menu:add-keyframe')
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC handlers for file operations
ipcMain.handle('dialog:open-file', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('dialog:save-file', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    if (result.canceled) return null;
    return result.filePath;
});

ipcMain.handle('fs:read-file', async (event, filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
        throw new Error('Failed to read file: ' + e.message);
    }
});

ipcMain.handle('fs:write-file', async (event, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    } catch (e) {
        throw new Error('Failed to write file: ' + e.message);
    }
});

ipcMain.handle('fs:read-file-buffer', async (event, filePath) => {
    try {
        const buf = fs.readFileSync(filePath);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (e) {
        throw new Error('Failed to read binary file: ' + e.message);
    }
});

ipcMain.handle('fs:file-exists', async (event, filePath) => {
    return fs.existsSync(filePath);
});

ipcMain.handle('fs:resolve-path', async (event, base, relative) => {
    return path.resolve(path.dirname(base), relative);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});
```

---

- [ ] Step 3: Create `preload.js`

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileAPI', {
    openFileDialog: (options) => ipcRenderer.invoke('dialog:open-file', options),
    saveFileDialog: (options) => ipcRenderer.invoke('dialog:save-file', options),
    readFile: (path) => ipcRenderer.invoke('fs:read-file', path),
    writeFile: (path, content) => ipcRenderer.invoke('fs:write-file', path, content),
    readFileBuffer: (path) => ipcRenderer.invoke('fs:read-file-buffer', path),
    fileExists: (path) => ipcRenderer.invoke('fs:file-exists', path),
    resolvePath: (base, relative) => ipcRenderer.invoke('fs:resolve-path', base, relative),
    onMenuEvent: (channel, callback) => {
        const validChannels = [
            'menu:open-model', 'menu:open-anim', 'menu:save', 'menu:save-as',
            'menu:export', 'menu:undo', 'menu:redo', 'menu:copy', 'menu:paste',
            'menu:duplicate', 'menu:select-all', 'menu:delete',
            'menu:onion-skin', 'menu:focus', 'menu:new-anim', 'menu:delete-anim',
            'menu:add-keyframe'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    }
});
```

---

- [ ] Step 4: Create `src/styles/main.css`

Full dark theme CSS with CSS Grid layout for 4 panels.

```css
/* === Reset === */
*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

:root {
    --bg-deep: #11111b;
    --bg-panel: #1e1e2e;
    --bg-surface: #181825;
    --bg-input: #313244;
    --bg-input-hover: #3b3b52;
    --bg-button: #45475a;
    --bg-button-hover: #585b70;
    --bg-selected: rgba(107, 47, 160, 0.2);
    --bg-hover: rgba(107, 47, 160, 0.1);

    --border: #313244;
    --border-light: #45475a;
    --border-focus: #6B2FA0;

    --accent-violet: #6B2FA0;
    --accent-violet-light: #9B4FCF;
    --accent-cyan: #00E5FF;
    --accent-red: #f38ba8;
    --accent-green: #a6e3a1;
    --accent-blue: #89b4fa;
    --accent-yellow: #f9e2af;
    --accent-orange: #fab387;
    --accent-pink: #f5c2e7;

    --text-primary: #cdd6f4;
    --text-secondary: #a6adc8;
    --text-muted: #6c7086;
    --text-dim: #585b70;

    --font-ui: 'Segoe UI', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;

    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;

    --transition: 150ms ease;

    /* Layout sizing */
    --toolbar-height: 40px;
    --status-height: 28px;
    --tree-width: 220px;
    --props-width: 280px;
    --timeline-height: 220px;
}

html, body {
    height: 100%;
    overflow: hidden;
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-deep);
    user-select: none;
    -webkit-user-select: none;
}

/* === App Layout (CSS Grid) === */
#app {
    display: grid;
    grid-template-rows: var(--toolbar-height) 1fr var(--timeline-height) var(--status-height);
    grid-template-columns: var(--tree-width) 1fr var(--props-width);
    grid-template-areas:
        "toolbar  toolbar    toolbar"
        "tree     viewport   props"
        "timeline timeline   timeline"
        "status   status     status";
    height: 100vh;
    width: 100vw;
}

/* === Toolbar === */
#toolbar {
    grid-area: toolbar;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    z-index: 10;
}

.toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
}

.toolbar-separator {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 8px;
}

.toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all var(--transition);
}

.toolbar-btn:hover {
    background: var(--bg-button);
    color: var(--text-primary);
    border-color: var(--border);
}

.toolbar-btn.active {
    background: var(--accent-violet);
    color: white;
    border-color: var(--accent-violet-light);
}

.toolbar-btn-text {
    width: auto;
    padding: 0 10px;
    font-size: 12px;
    gap: 4px;
}

.toolbar-label {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0 4px;
}

/* === Panels === */
#group-tree {
    grid-area: tree;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    overflow-x: hidden;
}

#viewport-container {
    grid-area: viewport;
    position: relative;
    background: var(--bg-deep);
    overflow: hidden;
}

#viewport-canvas {
    width: 100%;
    height: 100%;
    display: block;
}

#properties-panel {
    grid-area: props;
    background: var(--bg-panel);
    border-left: 1px solid var(--border);
    overflow-y: auto;
    overflow-x: hidden;
}

#timeline-container {
    grid-area: timeline;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
}

#status-bar {
    grid-area: status;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 16px;
    background: var(--bg-panel);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
}

.status-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-green);
}

.status-dot.off { background: var(--text-dim); }

/* === Scrollbars === */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-light); }

/* === Common Input Styles === */
input[type="text"],
input[type="number"],
select {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 4px 8px;
    outline: none;
    transition: border-color var(--transition);
}

input[type="text"]:focus,
input[type="number"]:focus,
select:focus {
    border-color: var(--accent-violet);
}

input[type="number"] {
    width: 70px;
    text-align: right;
}

select {
    font-family: var(--font-ui);
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236c7086'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
}

/* === Section headers in panels === */
.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
}

.panel-section {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
}

.panel-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.panel-row:last-child {
    margin-bottom: 0;
}

.panel-label {
    font-size: 11px;
    color: var(--text-muted);
    min-width: 60px;
    flex-shrink: 0;
}

/* === Buttons === */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-button);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: 12px;
    cursor: pointer;
    transition: all var(--transition);
}

.btn:hover {
    background: var(--bg-button-hover);
    border-color: var(--border-light);
}

.btn-sm {
    padding: 2px 8px;
    font-size: 11px;
}

.btn-accent {
    background: var(--accent-violet);
    border-color: var(--accent-violet-light);
    color: white;
}

.btn-accent:hover {
    background: var(--accent-violet-light);
}

.btn-danger {
    color: var(--accent-red);
}

.btn-danger:hover {
    background: rgba(243, 139, 168, 0.15);
    border-color: var(--accent-red);
}
```

---

- [ ] Step 5: Create `src/styles/viewport.css`

```css
/* === Viewport overlay (gizmo mode buttons) === */
.viewport-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 4px;
    z-index: 5;
}

.gizmo-btn {
    width: 32px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    background: rgba(30, 30, 46, 0.85);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition);
    backdrop-filter: blur(8px);
}

.gizmo-btn:hover {
    background: rgba(69, 71, 90, 0.9);
    color: var(--text-primary);
    border-color: rgba(255, 255, 255, 0.2);
}

.gizmo-btn.active-rotate {
    background: rgba(243, 139, 168, 0.3);
    border-color: var(--accent-red);
    color: var(--accent-red);
}

.gizmo-btn.active-translate {
    background: rgba(166, 227, 161, 0.3);
    border-color: var(--accent-green);
    color: var(--accent-green);
}

.gizmo-btn.active-scale {
    background: rgba(137, 180, 250, 0.3);
    border-color: var(--accent-blue);
    color: var(--accent-blue);
}

/* === Viewport info overlay (bottom-left) === */
.viewport-info {
    position: absolute;
    bottom: 8px;
    left: 8px;
    font-size: 11px;
    color: var(--text-dim);
    background: rgba(17, 17, 27, 0.7);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    backdrop-filter: blur(4px);
    pointer-events: none;
}
```

---

- [ ] Step 6: Create `src/model/model-data.js`

Data classes mirroring the Java `AnimatedBlockModel`, `ModelGroup`, `ModelElement`, `FaceData`. All coordinate conversions (Blockbench pixels / 16 = OpenGL units) happen at parse time.

```js
/**
 * A single face of a box element.
 * UV values are normalized 0-1 (pixel / textureSize).
 */
class BBFace {
    /**
     * @param {string} direction - 'north','south','east','west','up','down'
     * @param {number[]} uv - [u1, v1, u2, v2] normalized 0-1
     * @param {string} textureKey - texture key from the model's texture map
     * @param {number} uvRotation - 0, 90, 180, 270
     * @param {number} tintIndex - -1 if no tint
     */
    constructor(direction, uv, textureKey, uvRotation, tintIndex) {
        this.direction = direction;
        this.uv = uv;
        this.textureKey = textureKey;
        this.uvRotation = uvRotation;
        this.tintIndex = tintIndex;
    }
}

/**
 * A box element parsed from a Blockbench model.
 * Coordinates are in Blockbench pixels (NOT OpenGL units).
 * The renderer converts to Three.js coordinates.
 */
class BBElement {
    /**
     * @param {number[]} from - [x, y, z] in Blockbench pixels (0-16 range typically)
     * @param {number[]} to - [x, y, z]
     * @param {number} rotationAngle - degrees, 0 if none
     * @param {string|null} rotationAxis - 'x', 'y', 'z', or null
     * @param {number[]|null} rotationOrigin - [x, y, z] in pixels, or null
     * @param {Object.<string, BBFace>} faces - direction -> BBFace
     */
    constructor(from, to, rotationAngle, rotationAxis, rotationOrigin, faces) {
        this.from = from;
        this.to = to;
        this.rotationAngle = rotationAngle;
        this.rotationAxis = rotationAxis;
        this.rotationOrigin = rotationOrigin;
        this.faces = faces; // { north: BBFace, south: BBFace, ... }
    }
}

/**
 * A named group with a pivot point, containing elements and child groups.
 * Origin is in Blockbench pixels.
 */
class BBGroup {
    /**
     * @param {string} name
     * @param {number[]} origin - [x, y, z] pivot in Blockbench pixels
     * @param {BBElement[]} elements
     * @param {BBGroup[]} children
     * @param {boolean} visible
     */
    constructor(name, origin, elements, children, visible) {
        this.name = name;
        this.origin = origin;
        this.elements = elements;
        this.children = children;
        this.visible = visible;
    }
}

/**
 * A fully parsed Blockbench model.
 * Contains the hierarchy (groups > elements), texture map, and a flat lookup of groups by name.
 */
class BBModel {
    /**
     * @param {string} modelId - e.g. "eriniumfaction:block/lootbox"
     * @param {BBGroup[]} rootGroups
     * @param {Object.<string, BBGroup>} groupsByName
     * @param {Object.<string, string>} textures - textureKey -> relative path
     * @param {BBElement[]} allElements
     * @param {number} textureWidth
     * @param {number} textureHeight
     */
    constructor(modelId, rootGroups, groupsByName, textures, allElements, textureWidth, textureHeight) {
        this.modelId = modelId;
        this.rootGroups = rootGroups;
        this.groupsByName = groupsByName;
        this.textures = textures;
        this.allElements = allElements;
        this.textureWidth = textureWidth;
        this.textureHeight = textureHeight;
    }

    /** Get all group names (flat list). */
    getGroupNames() {
        return Object.keys(this.groupsByName);
    }
}

// Export for use in other modules loaded via <script>
window.BBFace = BBFace;
window.BBElement = BBElement;
window.BBGroup = BBGroup;
window.BBModel = BBModel;
```

---

- [ ] Step 7: Create `src/model/blockbench-parser.js`

Parses Blockbench JSON exactly like `BlockbenchModelParser.java`. Handles texture map, elements with face UVs, group hierarchy with element index references and nested children.

```js
/**
 * Parses a Blockbench JSON model file into BBModel / BBGroup / BBElement / BBFace objects.
 * Mirrors the logic of fr.eri.eriapi.anim.BlockbenchModelParser.
 *
 * Key differences from Java parser:
 * - Coordinates stay in Blockbench pixels (not divided by 16) -- Three.js renderer handles conversion
 * - Texture paths are stored as strings (not ResourceLocations)
 * - Uses window globals (BBModel, BBGroup, etc.) since we avoid ES module bundling
 */
const BlockbenchParser = {

    /**
     * @param {string} jsonString - raw JSON content of the .json Blockbench file
     * @param {string} filePath - absolute path to the file (for resolving textures)
     * @returns {BBModel}
     */
    parse(jsonString, filePath) {
        const root = JSON.parse(jsonString);

        // 1. Parse texture map
        const textures = {};
        let textureWidth = 16;
        let textureHeight = 16;

        if (root.texture_size) {
            textureWidth = root.texture_size[0] || 16;
            textureHeight = root.texture_size[1] || 16;
        }

        if (root.textures) {
            for (const [key, value] of Object.entries(root.textures)) {
                if (key === 'particle') continue;
                // Blockbench stores texture refs as "0", "1", etc. or as full paths
                // The value is a relative path like "logo_animated" or full "modid:textures/..."
                textures[key] = value;
            }
        }

        // 2. Parse all elements
        const allElements = [];
        if (root.elements) {
            for (const elemObj of root.elements) {
                allElements.push(this._parseElement(elemObj, textureWidth, textureHeight));
            }
        }

        // 3. Parse group hierarchy
        const rootGroups = [];
        const groupsByName = {};

        if (root.groups) {
            for (const groupEntry of root.groups) {
                if (typeof groupEntry === 'object' && groupEntry !== null && !Array.isArray(groupEntry)) {
                    const group = this._parseGroup(groupEntry, allElements);
                    rootGroups.push(group);
                    this._indexGroups(group, groupsByName);
                }
            }
        }

        // Derive modelId from filename
        const fileName = filePath.split(/[/\\]/).pop().replace(/\.json$/i, '');
        const modelId = fileName;

        return new BBModel(modelId, rootGroups, groupsByName, textures, allElements, textureWidth, textureHeight);
    },

    _parseElement(obj, texWidth, texHeight) {
        const from = obj.from ? [...obj.from] : [0, 0, 0];
        const to = obj.to ? [...obj.to] : [0, 0, 0];

        let rotAngle = 0;
        let rotAxis = null;
        let rotOrigin = null;

        if (obj.rotation) {
            rotAngle = obj.rotation.angle || 0;
            rotAxis = obj.rotation.axis || null;
            rotOrigin = obj.rotation.origin ? [...obj.rotation.origin] : null;
        }

        const faces = {};
        if (obj.faces) {
            const directions = ['north', 'south', 'east', 'west', 'up', 'down'];
            for (const dir of directions) {
                if (obj.faces[dir]) {
                    faces[dir] = this._parseFace(dir, obj.faces[dir], texWidth, texHeight);
                }
            }
        }

        return new BBElement(from, to, rotAngle, rotAxis, rotOrigin, faces);
    },

    _parseFace(direction, faceObj, texWidth, texHeight) {
        let uv = [0, 0, 1, 1];
        if (faceObj.uv) {
            uv = [
                faceObj.uv[0] / texWidth,
                faceObj.uv[1] / texHeight,
                faceObj.uv[2] / texWidth,
                faceObj.uv[3] / texHeight
            ];
        }

        let textureKey = '';
        if (faceObj.texture != null) {
            const raw = String(faceObj.texture);
            textureKey = raw.startsWith('#') ? raw.substring(1) : raw;
        }

        const uvRotation = faceObj.rotation || 0;
        const tintIndex = faceObj.tintindex != null ? faceObj.tintindex : -1;

        return new BBFace(direction, uv, textureKey, uvRotation, tintIndex);
    },

    _parseGroup(obj, allElements) {
        const name = obj.name || 'unnamed';
        const origin = obj.origin ? [...obj.origin] : [8, 8, 8];
        const visible = obj.visibility !== false;

        const groupElements = [];
        const children = [];

        if (obj.children) {
            for (const child of obj.children) {
                if (typeof child === 'number') {
                    // Element index reference
                    if (child >= 0 && child < allElements.length) {
                        groupElements.push(allElements[child]);
                    }
                } else if (typeof child === 'object' && child !== null) {
                    // Nested group
                    children.push(this._parseGroup(child, allElements));
                }
            }
        }

        return new BBGroup(name, origin, groupElements, children, visible);
    },

    _indexGroups(group, map) {
        map[group.name] = group;
        for (const child of group.children) {
            this._indexGroups(child, map);
        }
    }
};

window.BlockbenchParser = BlockbenchParser;
```

---

- [ ] Step 8: Create `src/viewport/grid-axes.js`

```js
/**
 * Creates a grid and colored axis lines for the viewport scene.
 * Grid is 16x16 (one Minecraft block = 16 pixels).
 * X axis = red, Y axis = green, Z axis = blue.
 */
const GridAxes = {

    /**
     * @param {THREE.Scene} scene
     */
    create(scene) {
        // Grid on the XZ plane, 16 units wide, 16 divisions
        const grid = new THREE.GridHelper(16, 16, 0x45475a, 0x313244);
        grid.position.set(8, 0, 8); // Center at block center
        scene.add(grid);

        // Axis lines (length 20, extending from origin)
        const axisLength = 20;
        const axisMaterial = {
            x: new THREE.LineBasicMaterial({ color: 0xf38ba8 }), // red
            y: new THREE.LineBasicMaterial({ color: 0xa6e3a1 }), // green
            z: new THREE.LineBasicMaterial({ color: 0x89b4fa })  // blue
        };

        // X axis
        const xGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(axisLength, 0, 0)
        ]);
        scene.add(new THREE.Line(xGeo, axisMaterial.x));

        // Y axis
        const yGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, axisLength, 0)
        ]);
        scene.add(new THREE.Line(yGeo, axisMaterial.y));

        // Z axis
        const zGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, axisLength)
        ]);
        scene.add(new THREE.Line(zGeo, axisMaterial.z));

        return grid;
    }
};

window.GridAxes = GridAxes;
```

---

- [ ] Step 9: Create `src/viewport/viewport.js`

Three.js scene setup: renderer, camera, OrbitControls, render loop, resize handling.

```js
/**
 * Manages the Three.js viewport: scene, camera, renderer, controls, render loop.
 */
const Viewport = {

    /** @type {THREE.Scene} */
    scene: null,
    /** @type {THREE.PerspectiveCamera} */
    camera: null,
    /** @type {THREE.WebGLRenderer} */
    renderer: null,
    /** @type {THREE.OrbitControls} */
    controls: null,
    /** @type {THREE.Group} Root group containing the entire model */
    modelRoot: null,
    /** @type {HTMLCanvasElement} */
    canvas: null,
    /** @type {boolean} */
    _running: false,

    /**
     * Initialize the viewport.
     * @param {HTMLCanvasElement} canvas
     */
    init(canvas) {
        this.canvas = canvas;
        const container = canvas.parentElement;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x11111b);

        // Ambient light (soft overall illumination)
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        // Directional light (from top-right-front for subtle shading)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(10, 20, 15);
        this.scene.add(dirLight);

        // Secondary fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
        fillLight.position.set(-10, 5, -10);
        this.scene.add(fillLight);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        // Default position: looking at block center from front-right-top
        this.camera.position.set(24, 20, 24);
        this.camera.lookAt(8, 8, 8);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, canvas);
        this.controls.target.set(8, 8, 8); // Center of a Minecraft block
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.8;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE
        };
        this.controls.update();

        // Grid + axes
        GridAxes.create(this.scene);

        // Model root group
        this.modelRoot = new THREE.Group();
        this.scene.add(this.modelRoot);

        // Resize observer
        const resizeObserver = new ResizeObserver(() => this._onResize());
        resizeObserver.observe(container);

        // Start render loop
        this._running = true;
        this._animate();
    },

    _animate() {
        if (!this._running) return;
        requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    },

    _onResize() {
        const container = this.canvas.parentElement;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    },

    /**
     * Clear the model from the scene.
     */
    clearModel() {
        while (this.modelRoot.children.length > 0) {
            const child = this.modelRoot.children[0];
            this.modelRoot.remove(child);
            this._disposeObject(child);
        }
    },

    _disposeObject(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            } else {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        }
        if (obj.children) {
            for (const child of obj.children) {
                this._disposeObject(child);
            }
        }
    },

    /**
     * Focus the camera on a specific point with animation.
     * @param {THREE.Vector3} target
     */
    focusOn(target) {
        // Simple snap (animation will be added in Task 5 polish)
        this.controls.target.copy(target);
        this.controls.update();
    }
};

window.Viewport = Viewport;
```

---

- [ ] Step 10: Create `src/viewport/model-renderer.js`

Builds Three.js meshes from a parsed BBModel. Each BBElement becomes a `THREE.Mesh` with a `THREE.BoxGeometry`. Each BBGroup becomes a `THREE.Group` positioned at the pivot. Multi-texture is handled by loading PNG textures from disk via the preload bridge.

```js
/**
 * Renders a BBModel into Three.js objects in the viewport.
 * Handles element geometry, face UV mapping, multi-texture, element rotation,
 * and group hierarchy with pivots.
 */
const ModelRenderer = {

    /** @type {Object.<string, THREE.Texture>} Loaded textures by key */
    _textures: {},

    /** @type {Object.<string, THREE.Group>} Three.js groups by group name */
    groupMap: {},

    /** @type {THREE.TextureLoader} */
    _loader: new THREE.TextureLoader(),

    /**
     * Load a BBModel into the viewport.
     * @param {BBModel} model
     * @param {string} modelFilePath - absolute path to the .json file (for resolving textures)
     */
    async load(model, modelFilePath) {
        Viewport.clearModel();
        this._textures = {};
        this.groupMap = {};

        // 1. Load textures from disk
        await this._loadTextures(model, modelFilePath);

        // 2. Build Three.js group hierarchy
        for (const rootGroup of model.rootGroups) {
            const threeGroup = this._buildGroup(rootGroup, model);
            Viewport.modelRoot.add(threeGroup);
        }
    },

    async _loadTextures(model, modelFilePath) {
        // Blockbench textures can be embedded (data URI) or file references
        // For file references, resolve relative to the model file location
        for (const [key, texPath] of Object.entries(model.textures)) {
            try {
                let resolvedPath;
                if (texPath.startsWith('data:')) {
                    // Data URI - load directly
                    this._textures[key] = this._loader.load(texPath);
                    this._textures[key].magFilter = THREE.NearestFilter;
                    this._textures[key].minFilter = THREE.NearestFilter;
                    continue;
                }

                // Resolve relative to model file
                const cleanPath = texPath.replace(/^#/, '');
                resolvedPath = await window.fileAPI.resolvePath(modelFilePath, cleanPath + '.png');

                // Check if file exists, also try without .png (Blockbench sometimes stores with extension)
                let exists = await window.fileAPI.fileExists(resolvedPath);
                if (!exists) {
                    resolvedPath = await window.fileAPI.resolvePath(modelFilePath, cleanPath);
                    exists = await window.fileAPI.fileExists(resolvedPath);
                }

                if (exists) {
                    // Read the file as a buffer and create a data URL
                    const buffer = await window.fileAPI.readFileBuffer(resolvedPath);
                    const blob = new Blob([buffer], { type: 'image/png' });
                    const dataUrl = await this._blobToDataUrl(blob);

                    const tex = this._loader.load(dataUrl);
                    tex.magFilter = THREE.NearestFilter; // Pixel art style
                    tex.minFilter = THREE.NearestFilter;
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                    this._textures[key] = tex;
                } else {
                    console.warn(`Texture not found: ${resolvedPath}`);
                }
            } catch (e) {
                console.warn(`Failed to load texture ${key}: ${e.message}`);
            }
        }
    },

    _blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    /**
     * Build a THREE.Group from a BBGroup, recursively.
     * @param {BBGroup} group
     * @param {BBModel} model
     * @returns {THREE.Group}
     */
    _buildGroup(group, model) {
        const threeGroup = new THREE.Group();
        threeGroup.name = group.name;
        threeGroup.userData.bbGroup = group;

        // Set pivot: Blockbench origin is in pixel coordinates
        // Three.js group position = pivot point
        threeGroup.position.set(
            group.origin[0],
            group.origin[1],
            group.origin[2]
        );

        threeGroup.visible = group.visible;

        // Add elements (offset relative to group pivot)
        for (const element of group.elements) {
            const mesh = this._buildElement(element, model, group.origin);
            threeGroup.add(mesh);
        }

        // Add child groups (their position is relative to parent)
        for (const childGroup of group.children) {
            const childThree = this._buildGroup(childGroup, model);
            // Child position needs to be relative to parent pivot
            childThree.position.set(
                childGroup.origin[0] - group.origin[0],
                childGroup.origin[1] - group.origin[1],
                childGroup.origin[2] - group.origin[2]
            );
            threeGroup.add(childThree);
        }

        this.groupMap[group.name] = threeGroup;
        return threeGroup;
    },

    /**
     * Build a THREE.Mesh from a BBElement.
     * @param {BBElement} element
     * @param {BBModel} model
     * @param {number[]} groupOrigin - parent group pivot in pixels
     * @returns {THREE.Mesh}
     */
    _buildElement(element, model, groupOrigin) {
        // Calculate size and center relative to group pivot
        const sizeX = Math.abs(element.to[0] - element.from[0]);
        const sizeY = Math.abs(element.to[1] - element.from[1]);
        const sizeZ = Math.abs(element.to[2] - element.from[2]);

        const centerX = (element.from[0] + element.to[0]) / 2 - groupOrigin[0];
        const centerY = (element.from[1] + element.to[1]) / 2 - groupOrigin[1];
        const centerZ = (element.from[2] + element.to[2]) / 2 - groupOrigin[2];

        const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);

        // Build materials array (6 faces: +x, -x, +y, -y, +z, -z)
        // Three.js BoxGeometry face order: right(+x), left(-x), top(+y), bottom(-y), front(+z), back(-z)
        // Blockbench face names: east(+x), west(-x), up(+y), down(-y), south(+z), north(-z)
        const faceOrder = ['east', 'west', 'up', 'down', 'south', 'north'];

        const materials = faceOrder.map(dir => {
            const face = element.faces[dir];
            if (!face) {
                // No face defined = transparent
                return new THREE.MeshBasicMaterial({ visible: false });
            }

            const tex = this._textures[face.textureKey];
            if (tex) {
                const mat = new THREE.MeshLambertMaterial({
                    map: tex.clone(),
                    transparent: true,
                    alphaTest: 0.1
                });

                // Apply UV offset/repeat for this face
                // UV in Blockbench is in texture pixel coords, normalized during parse
                mat.map.offset.set(face.uv[0], 1 - face.uv[3]);
                mat.map.repeat.set(
                    face.uv[2] - face.uv[0],
                    face.uv[3] - face.uv[1]
                );
                mat.map.needsUpdate = true;

                return mat;
            } else {
                // No texture found - use a placeholder color
                return new THREE.MeshLambertMaterial({
                    color: 0x6B2FA0,
                    transparent: true,
                    opacity: 0.6
                });
            }
        });

        const mesh = new THREE.Mesh(geometry, materials);
        mesh.position.set(centerX, centerY, centerZ);

        // Apply element rotation if present
        if (element.rotationAngle !== 0 && element.rotationAxis) {
            // Element rotation is around a specific origin
            // We need to adjust position for the pivot
            if (element.rotationOrigin) {
                const pivotX = element.rotationOrigin[0] - groupOrigin[0];
                const pivotY = element.rotationOrigin[1] - groupOrigin[1];
                const pivotZ = element.rotationOrigin[2] - groupOrigin[2];

                // Translate to pivot, rotate, translate back
                // We use a parent group for this
                const rotGroup = new THREE.Group();
                rotGroup.position.set(pivotX, pivotY, pivotZ);

                mesh.position.set(centerX - pivotX, centerY - pivotY, centerZ - pivotZ);

                const angleRad = element.rotationAngle * Math.PI / 180;
                switch (element.rotationAxis) {
                    case 'x': rotGroup.rotation.x = angleRad; break;
                    case 'y': rotGroup.rotation.y = angleRad; break;
                    case 'z': rotGroup.rotation.z = angleRad; break;
                }

                rotGroup.add(mesh);
                return rotGroup;
            } else {
                const angleRad = element.rotationAngle * Math.PI / 180;
                switch (element.rotationAxis) {
                    case 'x': mesh.rotation.x = angleRad; break;
                    case 'y': mesh.rotation.y = angleRad; break;
                    case 'z': mesh.rotation.z = angleRad; break;
                }
            }
        }

        return mesh;
    },

    /**
     * Get the THREE.Group for a named group.
     * @param {string} name
     * @returns {THREE.Group|undefined}
     */
    getGroup(name) {
        return this.groupMap[name];
    },

    /**
     * Get the world-space pivot position of a named group.
     * @param {string} name
     * @returns {THREE.Vector3|null}
     */
    getGroupWorldPivot(name) {
        const group = this.groupMap[name];
        if (!group) return null;
        const pos = new THREE.Vector3();
        group.getWorldPosition(pos);
        return pos;
    }
};

window.ModelRenderer = ModelRenderer;
```

---

- [ ] Step 11: Create `src/app.js`

Entry point for the renderer process. Initializes the viewport and wires up the File > Open Model action.

```js
/**
 * EriAnim Editor - Main application entry point.
 * Initializes all modules and wires up event handling.
 */
const App = {

    /** @type {BBModel|null} */
    model: null,

    /** @type {string|null} Current model file path */
    modelFilePath: null,

    init() {
        // Initialize viewport
        const canvas = document.getElementById('viewport-canvas');
        Viewport.init(canvas);

        // Wire menu events
        this._wireMenuEvents();

        // Update status
        this._updateStatus('Ready - Open a Blockbench model (Ctrl+O)');
    },

    _wireMenuEvents() {
        window.fileAPI.onMenuEvent('menu:open-model', () => this.openModel());
    },

    async openModel() {
        const filePath = await window.fileAPI.openFileDialog({
            title: 'Open Blockbench Model',
            filters: [
                { name: 'Blockbench Model', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!filePath) return;

        try {
            this._updateStatus('Loading model...');

            const jsonStr = await window.fileAPI.readFile(filePath);
            this.model = BlockbenchParser.parse(jsonStr, filePath);
            this.modelFilePath = filePath;

            await ModelRenderer.load(this.model, filePath);

            const groupCount = Object.keys(this.model.groupsByName).length;
            const elemCount = this.model.allElements.length;
            const texCount = Object.keys(this.model.textures).length;

            this._updateStatus(
                `Model loaded: ${this.model.modelId} | ` +
                `${groupCount} groups, ${elemCount} elements, ${texCount} textures`
            );

            console.log('Model loaded:', this.model);
        } catch (e) {
            console.error('Failed to load model:', e);
            this._updateStatus('Error loading model: ' + e.message);
        }
    },

    _updateStatus(text) {
        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.textContent = text;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

window.App = App;
```

---

- [ ] Step 12: Create `src/index.html`

The main HTML layout with CSS Grid for 4 panels. Loads Three.js from vendor, then all app scripts in order.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EriAnim Editor</title>
    <link rel="stylesheet" href="styles/main.css">
    <link rel="stylesheet" href="styles/viewport.css">
</head>
<body>
    <div id="app">
        <!-- Toolbar -->
        <div id="toolbar">
            <div class="toolbar-group">
                <button class="toolbar-btn toolbar-btn-text" id="btn-open" title="Open Blockbench Model (Ctrl+O)">
                    Open
                </button>
                <button class="toolbar-btn toolbar-btn-text" id="btn-save" title="Save (Ctrl+S)" disabled>
                    Save
                </button>
                <button class="toolbar-btn toolbar-btn-text" id="btn-export" title="Export .erianim.json (Ctrl+E)" disabled>
                    Export
                </button>
            </div>

            <div class="toolbar-separator"></div>

            <!-- Gizmo mode buttons -->
            <div class="toolbar-group">
                <button class="toolbar-btn" id="btn-rotate" title="Rotate (R)" disabled>R</button>
                <button class="toolbar-btn" id="btn-translate" title="Translate (T)" disabled>T</button>
                <button class="toolbar-btn" id="btn-scale" title="Scale (S)" disabled>S</button>
            </div>

            <div class="toolbar-separator"></div>

            <!-- Auto-key toggle -->
            <div class="toolbar-group">
                <button class="toolbar-btn toolbar-btn-text" id="btn-autokey" title="Auto-Keyframe: drag gizmo creates keyframes" disabled>
                    Auto-Key
                </button>
            </div>

            <div class="toolbar-separator"></div>

            <!-- Transport controls -->
            <div class="toolbar-group">
                <button class="toolbar-btn" id="btn-start" title="Go to start (Home)" disabled>|&lt;</button>
                <button class="toolbar-btn" id="btn-prev" title="Previous tick (Left)" disabled>&lt;</button>
                <button class="toolbar-btn" id="btn-play" title="Play/Pause (Space)" disabled>&#9654;</button>
                <button class="toolbar-btn" id="btn-next" title="Next tick (Right)" disabled>&gt;</button>
                <button class="toolbar-btn" id="btn-end" title="Go to end (End)" disabled>&gt;|</button>
                <button class="toolbar-btn" id="btn-loop" title="Toggle loop" disabled>&#8635;</button>
            </div>

            <div class="toolbar-separator"></div>

            <span class="toolbar-label" id="toolbar-frame-info">--/-- | --s</span>
        </div>

        <!-- Group Tree Panel -->
        <div id="group-tree">
            <div class="panel-header">
                Groups
            </div>
            <div id="group-tree-content">
                <div style="padding: 12px; color: var(--text-muted); font-size: 12px;">
                    No model loaded
                </div>
            </div>
        </div>

        <!-- Viewport -->
        <div id="viewport-container">
            <canvas id="viewport-canvas"></canvas>
            <div class="viewport-info" id="viewport-info">
                No model
            </div>
        </div>

        <!-- Properties Panel -->
        <div id="properties-panel">
            <div class="panel-header">
                Properties
            </div>
            <div id="properties-content">
                <div style="padding: 12px; color: var(--text-muted); font-size: 12px;">
                    Select a group or keyframe
                </div>
            </div>
        </div>

        <!-- Timeline -->
        <div id="timeline-container">
            <div style="padding: 8px 12px; color: var(--text-muted); font-size: 12px; text-align: center;">
                Timeline (load a model and create an animation)
            </div>
        </div>

        <!-- Status Bar -->
        <div id="status-bar">
            <span class="status-item">
                <span class="status-dot off"></span>
                <span id="status-text">Ready</span>
            </span>
        </div>
    </div>

    <!-- Three.js (global THREE) -->
    <script src="../vendor/three.min.js"></script>
    <script src="../vendor/controls/OrbitControls.js"></script>
    <script src="../vendor/controls/TransformControls.js"></script>

    <!-- App modules (order matters: dependencies first) -->
    <script src="model/model-data.js"></script>
    <script src="model/blockbench-parser.js"></script>
    <script src="viewport/grid-axes.js"></script>
    <script src="viewport/viewport.js"></script>
    <script src="viewport/model-renderer.js"></script>
    <script src="app.js"></script>
</body>
</html>
```

---

- [ ] Step 13: Wire the Open button to the same action as the menu

Add this to `app.js` inside `init()`, after `this._wireMenuEvents()`:

```js
// Toolbar button click handlers
document.getElementById('btn-open').addEventListener('click', () => this.openModel());
```

---

- [ ] Step 14: Run and verify

```bash
cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && npm start
```

**Verification checklist:**
1. Electron window opens with dark theme, 4-panel layout visible
2. File > Open Blockbench Model dialog works
3. Loading `C:\Users\killi\Pictures\Mcreator-Resources\3d models\lootbox\lootbox.json` shows the lootbox model
4. Model is textured (pixel art nearest-neighbor filtering)
5. Orbit camera works: right-click drag rotates, middle-click pans, scroll zooms
6. Grid and colored axes visible
7. Status bar updates with model info
8. No console errors

---

## Task 2: Group Tree + Properties Panel + Selection

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\model\animation-data.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\model\project.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\panels\group-tree.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\panels\properties-panel.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\styles\panels.css`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\index.html` (add script tags + panels.css)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\app.js` (init new modules, update on model load)

**Result:** Navigate the group tree, click to select groups, see them highlighted in the viewport. Properties panel shows animation settings and group info.

---

- [ ] Step 1: Create `src/model/animation-data.js`

Animation data classes matching the EriAPI Java structures exactly.

```js
/**
 * Animation data classes matching EriAPI's .erianim.json format.
 * These mirror: AnimationFile, AnimationDef, GroupTrack, Keyframe,
 * SpinKeyframe, TextureKeyframe, AnimationEvent.
 */

class AnimKeyframe {
    /**
     * @param {number} tick
     * @param {number[]} value - [x, y, z]
     * @param {string} easing - one of the 13 easing names
     */
    constructor(tick, value, easing) {
        this.tick = tick;
        this.value = [...value];
        this.easing = easing || 'linear';
        this.id = AnimKeyframe._nextId++;
    }

    clone() {
        return new AnimKeyframe(this.tick, [...this.value], this.easing);
    }
}
AnimKeyframe._nextId = 1;

class AnimSpinKeyframe {
    /**
     * @param {number} tick
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} speed - degrees per tick
     * @param {string} easing
     */
    constructor(tick, axis, speed, easing) {
        this.tick = tick;
        this.axis = axis || 'y';
        this.speed = speed || 0;
        this.easing = easing || 'linear';
        this.id = AnimSpinKeyframe._nextId++;
    }

    clone() {
        return new AnimSpinKeyframe(this.tick, this.axis, this.speed, this.easing);
    }
}
AnimSpinKeyframe._nextId = 1;

class AnimTextureKeyframe {
    /**
     * @param {number} tick
     * @param {string} target - texture key to replace
     * @param {string} value - replacement texture key
     */
    constructor(tick, target, value) {
        this.tick = tick;
        this.target = target || '';
        this.value = value || '';
        this.id = AnimTextureKeyframe._nextId++;
    }

    clone() {
        return new AnimTextureKeyframe(this.tick, this.target, this.value);
    }
}
AnimTextureKeyframe._nextId = 1;

class AnimGroupTrack {
    /**
     * @param {string} groupName
     */
    constructor(groupName) {
        this.groupName = groupName;
        /** @type {AnimKeyframe[]} */ this.rotation = [];
        /** @type {AnimKeyframe[]} */ this.translation = [];
        /** @type {AnimKeyframe[]} */ this.scale = [];
        /** @type {AnimKeyframe[]} */ this.visible = [];
        /** @type {AnimSpinKeyframe[]} */ this.spin = [];
        /** @type {AnimTextureKeyframe[]} */ this.texture = [];
    }

    /** @returns {boolean} Whether this track has any keyframes at all. */
    isEmpty() {
        return this.rotation.length === 0 &&
               this.translation.length === 0 &&
               this.scale.length === 0 &&
               this.visible.length === 0 &&
               this.spin.length === 0 &&
               this.texture.length === 0;
    }

    /** Sort all keyframe lists by tick. */
    sortAll() {
        const byTick = (a, b) => a.tick - b.tick;
        this.rotation.sort(byTick);
        this.translation.sort(byTick);
        this.scale.sort(byTick);
        this.visible.sort(byTick);
        this.spin.sort(byTick);
        this.texture.sort(byTick);
    }
}

class AnimEvent {
    /**
     * @param {number} tick
     * @param {string} type - 'sound','particle','callback','hide_group','show_group','cut'
     * @param {string} value
     * @param {number} volume
     * @param {number} pitch
     * @param {number} count
     * @param {number} spread
     */
    constructor(tick, type, value, volume, pitch, count, spread) {
        this.tick = tick;
        this.type = type || 'callback';
        this.value = value || '';
        this.volume = volume != null ? volume : 1.0;
        this.pitch = pitch != null ? pitch : 1.0;
        this.count = count != null ? count : 1;
        this.spread = spread != null ? spread : 0.5;
        this.id = AnimEvent._nextId++;
    }

    clone() {
        return new AnimEvent(this.tick, this.type, this.value,
            this.volume, this.pitch, this.count, this.spread);
    }
}
AnimEvent._nextId = 1;

/**
 * Matches EriAPI AnimationDef.
 * 7 EndBehaviors: freeze, rollback, rollback_instant, wait_server, loop, loop_count, loop_pause
 */
class AnimDef {
    /**
     * @param {string} name
     */
    constructor(name) {
        this.name = name;
        this.duration = 40; // ticks
        this.endBehavior = 'freeze';
        this.rollbackDuration = 10;
        this.blendIn = 0;
        this.blendOut = 0;
        this.loopCount = 0;
        this.loopPause = 0;
        /** @type {Object.<string, AnimGroupTrack>} groupName -> AnimGroupTrack */
        this.tracks = {};
        /** @type {AnimEvent[]} */
        this.events = [];
    }

    /**
     * Get or create a track for the given group name.
     * @param {string} groupName
     * @returns {AnimGroupTrack}
     */
    getOrCreateTrack(groupName) {
        if (!this.tracks[groupName]) {
            this.tracks[groupName] = new AnimGroupTrack(groupName);
        }
        return this.tracks[groupName];
    }
}

/**
 * Matches EriAPI AnimationFile.
 * Contains format_version, model ID, and named animations.
 */
class AnimFile {
    constructor() {
        this.formatVersion = 1;
        this.modelId = '';
        /** @type {Object.<string, AnimDef>} animName -> AnimDef */
        this.animations = {};
    }

    /**
     * Create a new animation with the given name.
     * @param {string} name
     * @returns {AnimDef}
     */
    createAnimation(name) {
        const anim = new AnimDef(name);
        this.animations[name] = anim;
        return anim;
    }

    /**
     * Get the list of animation names.
     * @returns {string[]}
     */
    getAnimationNames() {
        return Object.keys(this.animations);
    }
}

// Valid values (constants)
const EASING_NAMES = [
    'linear', 'ease_in', 'ease_out', 'ease_in_out',
    'ease_in_cubic', 'ease_out_cubic', 'bounce', 'elastic',
    'ease_in_back', 'ease_out_back', 'ease_in_expo', 'ease_out_expo', 'spring'
];

const END_BEHAVIORS = [
    'freeze', 'rollback', 'rollback_instant', 'wait_server',
    'loop', 'loop_count', 'loop_pause'
];

const EVENT_TYPES = [
    'sound', 'particle', 'callback', 'hide_group', 'show_group', 'cut'
];

// Export to global
window.AnimKeyframe = AnimKeyframe;
window.AnimSpinKeyframe = AnimSpinKeyframe;
window.AnimTextureKeyframe = AnimTextureKeyframe;
window.AnimGroupTrack = AnimGroupTrack;
window.AnimEvent = AnimEvent;
window.AnimDef = AnimDef;
window.AnimFile = AnimFile;
window.EASING_NAMES = EASING_NAMES;
window.END_BEHAVIORS = END_BEHAVIORS;
window.EVENT_TYPES = EVENT_TYPES;
```

---

- [ ] Step 2: Create `src/model/project.js`

Singleton that holds the entire editor state: the loaded model, animation file, current animation, selection, current tick, etc. Emits events when state changes so panels can update.

```js
/**
 * Central project state singleton.
 * All UI panels read/write through this.
 * Emits events via a simple listener system.
 */
const Project = {

    /** @type {BBModel|null} */
    model: null,

    /** @type {AnimFile} */
    animFile: new AnimFile(),

    /** @type {string|null} Current animation name */
    currentAnimName: null,

    /** @type {string|null} Selected group name */
    selectedGroup: null,

    /** @type {Set<number>} Selected keyframe IDs */
    selectedKeyframes: new Set(),

    /** @type {number} Current tick (playhead position) */
    currentTick: 0,

    /** @type {boolean} Auto-keyframe mode */
    autoKey: false,

    /** @type {string} Gizmo mode: 'rotate', 'translate', 'scale' */
    gizmoMode: 'rotate',

    /** @type {string|null} Path to the model file */
    modelFilePath: null,

    /** @type {string|null} Path to the current anim file (for save) */
    animFilePath: null,

    /** @type {boolean} Whether the project has unsaved changes */
    dirty: false,

    // --- Event system ---
    _listeners: {},

    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    },

    emit(event, data) {
        const cbs = this._listeners[event];
        if (cbs) cbs.forEach(cb => cb(data));
    },

    // --- Getters ---

    /** @returns {AnimDef|null} */
    getCurrentAnim() {
        if (!this.currentAnimName) return null;
        return this.animFile.animations[this.currentAnimName] || null;
    },

    /** @returns {number} Duration of current animation in ticks */
    getDuration() {
        const anim = this.getCurrentAnim();
        return anim ? anim.duration : 0;
    },

    // --- Actions ---

    setModel(model, filePath) {
        this.model = model;
        this.modelFilePath = filePath;
        this.animFile = new AnimFile();
        this.animFile.modelId = model.modelId;
        this.currentAnimName = null;
        this.selectedGroup = null;
        this.selectedKeyframes.clear();
        this.currentTick = 0;
        this.dirty = false;
        this.emit('model-changed', model);
    },

    selectGroup(groupName) {
        if (this.selectedGroup === groupName) return;
        this.selectedGroup = groupName;
        this.selectedKeyframes.clear();
        this.emit('selection-changed', { group: groupName, keyframes: [] });
    },

    deselectAll() {
        this.selectedGroup = null;
        this.selectedKeyframes.clear();
        this.emit('selection-changed', { group: null, keyframes: [] });
    },

    selectKeyframe(keyframeId, addToSelection) {
        if (!addToSelection) {
            this.selectedKeyframes.clear();
        }
        this.selectedKeyframes.add(keyframeId);
        this.emit('keyframe-selection-changed', { keyframes: [...this.selectedKeyframes] });
    },

    deselectKeyframe(keyframeId) {
        this.selectedKeyframes.delete(keyframeId);
        this.emit('keyframe-selection-changed', { keyframes: [...this.selectedKeyframes] });
    },

    setCurrentTick(tick) {
        const duration = this.getDuration();
        tick = Math.max(0, Math.min(tick, duration));
        if (this.currentTick === tick) return;
        this.currentTick = tick;
        this.emit('tick-changed', tick);
    },

    setGizmoMode(mode) {
        this.gizmoMode = mode;
        this.emit('gizmo-mode-changed', mode);
    },

    toggleAutoKey() {
        this.autoKey = !this.autoKey;
        this.emit('autokey-changed', this.autoKey);
    },

    createAnimation(name) {
        const anim = this.animFile.createAnimation(name);
        this.currentAnimName = name;
        this.dirty = true;
        this.emit('animation-changed', anim);
        return anim;
    },

    selectAnimation(name) {
        if (!this.animFile.animations[name]) return;
        this.currentAnimName = name;
        this.currentTick = 0;
        this.selectedKeyframes.clear();
        this.emit('animation-changed', this.animFile.animations[name]);
        this.emit('tick-changed', 0);
    },

    markDirty() {
        this.dirty = true;
        this.emit('dirty-changed', true);
    }
};

window.Project = Project;
```

---

- [ ] Step 3: Create `src/styles/panels.css`

```css
/* === Group Tree === */
.tree-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    padding-left: calc(8px + var(--depth, 0) * 16px);
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    transition: background var(--transition), color var(--transition);
    border-left: 2px solid transparent;
    min-height: 26px;
}

.tree-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.tree-item.selected {
    background: var(--bg-selected);
    color: var(--text-primary);
    border-left-color: var(--accent-violet);
}

.tree-item.has-keyframes::after {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent-cyan);
    margin-left: auto;
    flex-shrink: 0;
}

.tree-item.no-animation {
    color: var(--text-dim);
}

.tree-expand {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    color: var(--text-muted);
    flex-shrink: 0;
    transition: transform var(--transition);
}

.tree-expand.expanded {
    transform: rotate(90deg);
}

.tree-icon {
    font-size: 11px;
    flex-shrink: 0;
}

.tree-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tree-vis-btn {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 10px;
    cursor: pointer;
    border-radius: 2px;
    flex-shrink: 0;
    opacity: 0.5;
    transition: opacity var(--transition);
}

.tree-vis-btn:hover {
    opacity: 1;
    background: var(--bg-button);
}

.tree-vis-btn.hidden-group {
    opacity: 0.3;
    color: var(--accent-red);
}

/* === Properties Panel === */
.prop-section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent-violet-light);
    padding: 8px 12px 4px;
    border-top: 1px solid var(--border);
}

.prop-section-title:first-child {
    border-top: none;
}

.prop-field {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
}

.prop-field label {
    font-size: 11px;
    color: var(--text-muted);
    min-width: 70px;
    flex-shrink: 0;
}

.prop-field input,
.prop-field select {
    flex: 1;
    min-width: 0;
}

.prop-xyz {
    display: flex;
    gap: 4px;
    flex: 1;
}

.prop-xyz input {
    width: 0;
    flex: 1;
    text-align: center;
}

.prop-xyz-label {
    font-size: 10px;
    font-weight: 700;
    width: 14px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    flex-shrink: 0;
}

.prop-xyz-label.x { color: var(--accent-red); background: rgba(243, 139, 168, 0.1); }
.prop-xyz-label.y { color: var(--accent-green); background: rgba(166, 227, 161, 0.1); }
.prop-xyz-label.z { color: var(--accent-blue); background: rgba(137, 180, 250, 0.1); }

.prop-buttons {
    display: flex;
    gap: 4px;
    padding: 6px 12px;
    flex-wrap: wrap;
}

/* === Animation selector dropdown in properties === */
.anim-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
}

.anim-selector select {
    flex: 1;
}

.anim-selector .btn {
    flex-shrink: 0;
}

/* === Easing preview (small curve icon next to dropdown) === */
.easing-preview {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    border: 1px solid var(--border);
}
```

---

- [ ] Step 4: Create `src/panels/group-tree.js`

Builds the group tree DOM from the model's group hierarchy. Handles click to select, expand/collapse, and visibility toggle.

```js
/**
 * Group Tree panel - displays the model's group hierarchy.
 * Click to select a group (updates viewport highlight + properties panel).
 * Eye icon toggles viewport visibility.
 */
const GroupTree = {

    /** @type {HTMLElement} */
    _container: null,

    init() {
        this._container = document.getElementById('group-tree-content');

        Project.on('model-changed', () => this.rebuild());
        Project.on('selection-changed', (data) => this._updateSelection(data.group));
        Project.on('tick-changed', () => this._updateKeyframeIndicators());
        Project.on('animation-changed', () => this._updateKeyframeIndicators());
    },

    rebuild() {
        this._container.innerHTML = '';

        if (!Project.model) {
            this._container.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;">No model loaded</div>';
            return;
        }

        for (const group of Project.model.rootGroups) {
            this._buildGroupItem(group, 0);
        }
    },

    _buildGroupItem(group, depth) {
        const hasChildren = group.children.length > 0;

        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.groupName = group.name;
        item.style.setProperty('--depth', depth);

        // Expand arrow (if has children)
        const expandEl = document.createElement('span');
        expandEl.className = 'tree-expand' + (hasChildren ? ' expanded' : '');
        expandEl.textContent = hasChildren ? '\u25B6' : '';
        item.appendChild(expandEl);

        // Group icon
        const iconEl = document.createElement('span');
        iconEl.className = 'tree-icon';
        iconEl.textContent = '\u25A1'; // box icon
        item.appendChild(iconEl);

        // Name
        const nameEl = document.createElement('span');
        nameEl.className = 'tree-name';
        nameEl.textContent = group.name;
        item.appendChild(nameEl);

        // Visibility toggle button
        const visBtn = document.createElement('button');
        visBtn.className = 'tree-vis-btn' + (group.visible ? '' : ' hidden-group');
        visBtn.textContent = group.visible ? '\u25C9' : '\u25CE'; // filled/empty circle
        visBtn.title = 'Toggle visibility';
        visBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            group.visible = !group.visible;
            const threeGroup = ModelRenderer.getGroup(group.name);
            if (threeGroup) threeGroup.visible = group.visible;
            visBtn.className = 'tree-vis-btn' + (group.visible ? '' : ' hidden-group');
            visBtn.textContent = group.visible ? '\u25C9' : '\u25CE';
        });
        item.appendChild(visBtn);

        // Click to select
        item.addEventListener('click', () => {
            Project.selectGroup(group.name);
        });

        this._container.appendChild(item);

        // Children container
        if (hasChildren) {
            const childContainer = document.createElement('div');
            childContainer.className = 'tree-children';
            childContainer.dataset.parentGroup = group.name;

            for (const child of group.children) {
                this._buildGroupItem(child, depth + 1);
            }

            // Toggle expand/collapse
            expandEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = expandEl.classList.toggle('expanded');
                // Find all direct children items and toggle visibility
                const items = this._container.querySelectorAll(
                    `.tree-item[data-group-name]`
                );
                // Simple approach: toggle children visibility by depth
                // This is handled by the CSS --depth variable
            });
        }
    },

    _updateSelection(groupName) {
        const items = this._container.querySelectorAll('.tree-item');
        items.forEach(item => {
            item.classList.toggle('selected', item.dataset.groupName === groupName);
        });

        // Highlight in viewport
        this._highlightViewportGroup(groupName);
    },

    _highlightViewportGroup(groupName) {
        // Reset all groups to normal
        for (const [name, threeGroup] of Object.entries(ModelRenderer.groupMap)) {
            threeGroup.traverse(obj => {
                if (obj.isMesh && obj.userData._originalMaterials) {
                    obj.material = obj.userData._originalMaterials;
                    delete obj.userData._originalMaterials;
                }
            });
        }

        if (!groupName) return;

        // Add subtle highlight to selected group's meshes
        const group = ModelRenderer.getGroup(groupName);
        if (group) {
            group.traverse(obj => {
                if (obj.isMesh && !obj.userData._originalMaterials) {
                    obj.userData._originalMaterials = obj.material;
                    // Create highlighted copies
                    if (Array.isArray(obj.material)) {
                        obj.material = obj.material.map(m => {
                            const clone = m.clone();
                            if (clone.visible) {
                                clone.emissive = new THREE.Color(0x6B2FA0);
                                clone.emissiveIntensity = 0.3;
                            }
                            return clone;
                        });
                    } else {
                        const clone = obj.material.clone();
                        if (clone.visible) {
                            clone.emissive = new THREE.Color(0x6B2FA0);
                            clone.emissiveIntensity = 0.3;
                        }
                        obj.material = clone;
                    }
                }
            });
        }
    },

    _updateKeyframeIndicators() {
        const anim = Project.getCurrentAnim();
        const tick = Project.currentTick;
        const items = this._container.querySelectorAll('.tree-item');

        items.forEach(item => {
            const name = item.dataset.groupName;
            let hasKf = false;
            let hasAnyKf = false;

            if (anim && anim.tracks[name]) {
                const track = anim.tracks[name];
                hasAnyKf = !track.isEmpty();

                // Check if there's a keyframe at the current tick
                const allKfs = [
                    ...track.rotation, ...track.translation, ...track.scale,
                    ...track.visible, ...track.spin, ...track.texture
                ];
                hasKf = allKfs.some(kf => kf.tick === tick);
            }

            item.classList.toggle('has-keyframes', hasKf);
            item.classList.toggle('no-animation', !hasAnyKf);
        });
    }
};

window.GroupTree = GroupTree;
```

---

- [ ] Step 5: Create `src/panels/properties-panel.js`

Contextual properties panel that shows different content depending on the selection state: animation settings (always), group info (when a group is selected), keyframe editor (when a keyframe is selected).

```js
/**
 * Properties panel - contextual editor for animation settings,
 * group properties, and keyframe values.
 */
const PropertiesPanel = {

    /** @type {HTMLElement} */
    _container: null,

    init() {
        this._container = document.getElementById('properties-content');

        Project.on('model-changed', () => this.refresh());
        Project.on('selection-changed', () => this.refresh());
        Project.on('animation-changed', () => this.refresh());
        Project.on('keyframe-selection-changed', () => this.refresh());
    },

    refresh() {
        this._container.innerHTML = '';

        // 1. Animation selector (always shown if model loaded)
        if (Project.model) {
            this._buildAnimSelector();
        }

        // 2. Animation settings (if an animation is active)
        const anim = Project.getCurrentAnim();
        if (anim) {
            this._buildAnimSettings(anim);
        }

        // 3. Group quick actions (if a group is selected and animation exists)
        if (Project.selectedGroup && anim) {
            this._buildGroupActions();
        }

        // If nothing to show
        if (!Project.model) {
            this._container.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;">Open a model to start</div>';
        }
    },

    _buildAnimSelector() {
        const div = document.createElement('div');
        div.className = 'anim-selector';

        const select = document.createElement('select');
        select.style.flex = '1';

        const names = Project.animFile.getAnimationNames();
        if (names.length === 0) {
            const opt = document.createElement('option');
            opt.textContent = '(no animation)';
            opt.disabled = true;
            opt.selected = true;
            select.appendChild(opt);
        } else {
            for (const name of names) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                opt.selected = (name === Project.currentAnimName);
                select.appendChild(opt);
            }
        }

        select.addEventListener('change', () => {
            Project.selectAnimation(select.value);
        });

        div.appendChild(select);

        // New animation button
        const newBtn = document.createElement('button');
        newBtn.className = 'btn btn-sm btn-accent';
        newBtn.textContent = '+ New';
        newBtn.addEventListener('click', () => {
            const name = prompt('Animation name:');
            if (name && name.trim()) {
                Project.createAnimation(name.trim());
                this.refresh();
            }
        });
        div.appendChild(newBtn);

        this._container.appendChild(div);
    },

    _buildAnimSettings(anim) {
        const title = document.createElement('div');
        title.className = 'prop-section-title';
        title.textContent = 'Animation Settings';
        this._container.appendChild(title);

        // Duration
        this._addField('Duration', 'number', anim.duration, (v) => {
            anim.duration = Math.max(1, parseInt(v) || 1);
            Project.markDirty();
            Project.emit('animation-changed', anim);
        }, { suffix: ' ticks (' + (anim.duration / 20).toFixed(2) + 's)' });

        // End Behavior
        this._addSelect('End Behavior', END_BEHAVIORS, anim.endBehavior, (v) => {
            anim.endBehavior = v;
            Project.markDirty();
            this.refresh(); // Refresh to show/hide conditional fields
        });

        // Conditional fields based on endBehavior
        if (anim.endBehavior === 'rollback') {
            this._addField('Rollback Duration', 'number', anim.rollbackDuration, (v) => {
                anim.rollbackDuration = Math.max(1, parseInt(v) || 1);
                Project.markDirty();
            });
        }

        if (anim.endBehavior === 'loop_count') {
            this._addField('Loop Count', 'number', anim.loopCount, (v) => {
                anim.loopCount = Math.max(1, parseInt(v) || 1);
                Project.markDirty();
            });
        }

        if (anim.endBehavior === 'loop_pause') {
            this._addField('Loop Pause', 'number', anim.loopPause, (v) => {
                anim.loopPause = Math.max(0, parseInt(v) || 0);
                Project.markDirty();
            }, { suffix: ' ticks' });
        }

        // Blend settings (always available)
        this._addField('Blend In', 'number', anim.blendIn, (v) => {
            anim.blendIn = Math.max(0, parseInt(v) || 0);
            Project.markDirty();
        }, { suffix: ' ticks' });

        this._addField('Blend Out', 'number', anim.blendOut, (v) => {
            anim.blendOut = Math.max(0, parseInt(v) || 0);
            Project.markDirty();
        }, { suffix: ' ticks' });
    },

    _buildGroupActions() {
        const title = document.createElement('div');
        title.className = 'prop-section-title';
        title.textContent = 'Group: ' + Project.selectedGroup;
        this._container.appendChild(title);

        const btnsDiv = document.createElement('div');
        btnsDiv.className = 'prop-buttons';

        const trackTypes = [
            { label: '+ Rotation KF', type: 'rotation', default: [0, 0, 0] },
            { label: '+ Translation KF', type: 'translation', default: [0, 0, 0] },
            { label: '+ Scale KF', type: 'scale', default: [1, 1, 1] },
            { label: '+ Visible KF', type: 'visible', default: [1, 0, 0] }
        ];

        for (const tt of trackTypes) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm';
            btn.textContent = tt.label;
            btn.addEventListener('click', () => {
                const anim = Project.getCurrentAnim();
                if (!anim) return;
                const track = anim.getOrCreateTrack(Project.selectedGroup);
                const kf = new AnimKeyframe(Project.currentTick, tt.default, 'linear');
                track[tt.type].push(kf);
                track.sortAll();
                Project.markDirty();
                Project.emit('animation-changed', anim);
                Project.selectKeyframe(kf.id, false);
            });
            btnsDiv.appendChild(btn);
        }

        this._container.appendChild(btnsDiv);
    },

    // --- Helper methods ---

    _addField(label, type, value, onChange, options) {
        const div = document.createElement('div');
        div.className = 'prop-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;
        div.appendChild(lbl);

        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.addEventListener('change', () => onChange(input.value));
        div.appendChild(input);

        if (options && options.suffix) {
            const suffix = document.createElement('span');
            suffix.style.fontSize = '10px';
            suffix.style.color = 'var(--text-muted)';
            suffix.textContent = options.suffix;
            div.appendChild(suffix);
        }

        this._container.appendChild(div);
    },

    _addSelect(label, options, value, onChange) {
        const div = document.createElement('div');
        div.className = 'prop-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;
        div.appendChild(lbl);

        const select = document.createElement('select');
        for (const opt of options) {
            const optEl = document.createElement('option');
            optEl.value = opt;
            optEl.textContent = opt;
            optEl.selected = (opt === value);
            select.appendChild(optEl);
        }
        select.addEventListener('change', () => onChange(select.value));
        div.appendChild(select);

        this._container.appendChild(div);
    }
};

window.PropertiesPanel = PropertiesPanel;
```

---

- [ ] Step 6: Update `src/index.html`

Add the new CSS and script tags. Add panels.css link and new script tags before `app.js`.

In `<head>`, add after the viewport.css link:
```html
<link rel="stylesheet" href="styles/panels.css">
```

Before the `app.js` script tag, add:
```html
<script src="model/animation-data.js"></script>
<script src="model/project.js"></script>
<script src="panels/group-tree.js"></script>
<script src="panels/properties-panel.js"></script>
```

---

- [ ] Step 7: Update `src/app.js`

Add initialization of new modules and update the `openModel` flow to use `Project` and rebuild panels.

Replace the `init()` method to also initialize GroupTree and PropertiesPanel:
```js
init() {
    const canvas = document.getElementById('viewport-canvas');
    Viewport.init(canvas);
    GroupTree.init();
    PropertiesPanel.init();
    this._wireMenuEvents();
    this._wireToolbar();
    this._updateStatus('Ready - Open a Blockbench model (Ctrl+O)');
},
```

Add `_wireToolbar()`:
```js
_wireToolbar() {
    document.getElementById('btn-open').addEventListener('click', () => this.openModel());

    // Gizmo mode buttons
    document.getElementById('btn-rotate').addEventListener('click', () => Project.setGizmoMode('rotate'));
    document.getElementById('btn-translate').addEventListener('click', () => Project.setGizmoMode('translate'));
    document.getElementById('btn-scale').addEventListener('click', () => Project.setGizmoMode('scale'));

    // Auto-key toggle
    document.getElementById('btn-autokey').addEventListener('click', () => Project.toggleAutoKey());

    // Update toolbar button states
    Project.on('gizmo-mode-changed', (mode) => {
        document.getElementById('btn-rotate').className =
            'toolbar-btn' + (mode === 'rotate' ? ' active-rotate' : '');
        document.getElementById('btn-translate').className =
            'toolbar-btn' + (mode === 'translate' ? ' active-translate' : '');
        document.getElementById('btn-scale').className =
            'toolbar-btn' + (mode === 'scale' ? ' active-scale' : '');
    });

    Project.on('autokey-changed', (on) => {
        document.getElementById('btn-autokey').classList.toggle('active', on);
    });

    Project.on('model-changed', () => {
        // Enable buttons that require a model
        ['btn-rotate', 'btn-translate', 'btn-scale', 'btn-autokey'].forEach(id => {
            document.getElementById(id).disabled = false;
        });
    });
},
```

Update `openModel()` to use `Project`:
```js
async openModel() {
    const filePath = await window.fileAPI.openFileDialog({
        title: 'Open Blockbench Model',
        filters: [
            { name: 'Blockbench Model', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (!filePath) return;

    try {
        this._updateStatus('Loading model...');
        const jsonStr = await window.fileAPI.readFile(filePath);
        const model = BlockbenchParser.parse(jsonStr, filePath);
        Project.setModel(model, filePath);

        await ModelRenderer.load(model, filePath);

        const groupCount = Object.keys(model.groupsByName).length;
        const elemCount = model.allElements.length;
        const texCount = Object.keys(model.textures).length;

        this._updateStatus(
            `Model: ${model.modelId} | ${groupCount} groups, ${elemCount} elements, ${texCount} textures`
        );
    } catch (e) {
        console.error('Failed to load model:', e);
        this._updateStatus('Error: ' + e.message);
    }
},
```

---

- [ ] Step 8: Verify

```bash
cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && npm start
```

**Verification checklist:**
1. Group tree shows all groups from the lootbox model (8 root groups with children)
2. Clicking a group highlights it in the viewport with violet emissive tint
3. Properties panel shows animation selector with "+ New" button
4. Creating a new animation shows settings (duration, endBehavior, etc.)
5. Selecting a group while animation is active shows "Add Rotation/Translation/Scale/Visible KF" buttons
6. Changing endBehavior shows/hides conditional fields (rollbackDuration, loopCount, loopPause)
7. Visibility toggle in tree hides/shows groups in viewport

---

## Task 3: Timeline + Playback + Easing

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\model\easing.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\timeline\timeline.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\timeline\playback.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\timeline\track-builder.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\viewport\animation-preview.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\styles\timeline.css`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\index.html` (add scripts + CSS)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\app.js` (init timeline, playback, preview)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\panels\properties-panel.js` (add keyframe editor fields when keyframe selected)

**Result:** Full timeline with ruler, tracks, keyframe diamonds, playhead scrubbing. Playback at 20 TPS with loop. Keyframes animate the model in the viewport via easing interpolation.

---

- [ ] Step 1: Create `src/model/easing.js`

13 easing functions matching `Easing.java` exactly. Each takes `t` in [0,1] and returns the eased value.

```js
/**
 * 13 easing functions matching fr.eri.eriapi.gui.anim.Easing exactly.
 * Each function: (t: number) => number, where t is in [0, 1].
 */
const EasingFunctions = {

    linear(t) {
        return t;
    },

    ease_in(t) {
        return t * t;
    },

    ease_out(t) {
        return t * (2 - t);
    },

    ease_in_out(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },

    ease_in_cubic(t) {
        return t * t * t;
    },

    ease_out_cubic(t) {
        const f = t - 1;
        return f * f * f + 1;
    },

    bounce(t) {
        if (t < 1 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
            const f = t - 1.5 / 2.75;
            return 7.5625 * f * f + 0.75;
        } else if (t < 2.5 / 2.75) {
            const f = t - 2.25 / 2.75;
            return 7.5625 * f * f + 0.9375;
        } else {
            const f = t - 2.625 / 2.75;
            return 7.5625 * f * f + 0.984375;
        }
    },

    elastic(t) {
        if (t === 0 || t === 1) return t;
        const p = 0.3;
        const s = p / 4;
        return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1;
    },

    ease_in_back(t) {
        const s = 1.70158;
        return t * t * ((s + 1) * t - s);
    },

    ease_out_back(t) {
        const s = 1.70158;
        const f = t - 1;
        return f * f * ((s + 1) * f + s) + 1;
    },

    ease_in_expo(t) {
        return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
    },

    ease_out_expo(t) {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    },

    spring(t) {
        return 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6);
    },

    /**
     * Get easing function by name.
     * @param {string} name
     * @returns {function(number): number}
     */
    get(name) {
        return this[name] || this.linear;
    },

    /**
     * Interpolate between two float[3] values using the given easing.
     * @param {number[]} from - [x, y, z]
     * @param {number[]} to - [x, y, z]
     * @param {number} t - raw progress 0-1
     * @param {string} easingName
     * @returns {number[]}
     */
    interpolate3(from, to, t, easingName) {
        const eased = this.get(easingName)(t);
        return [
            from[0] + (to[0] - from[0]) * eased,
            from[1] + (to[1] - from[1]) * eased,
            from[2] + (to[2] - from[2]) * eased
        ];
    }
};

window.EasingFunctions = EasingFunctions;
```

---

- [ ] Step 2: Create `src/styles/timeline.css`

```css
/* === Timeline === */
#timeline-container {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

#timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    min-height: 28px;
    flex-shrink: 0;
}

#timeline-header .transport-info {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
}

#timeline-body {
    display: flex;
    flex: 1;
    overflow: hidden;
}

#timeline-labels {
    width: 140px;
    flex-shrink: 0;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    overflow-x: hidden;
}

.timeline-label {
    height: 22px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 11px;
    color: var(--text-secondary);
    border-bottom: 1px solid rgba(49, 50, 68, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.timeline-label .track-type-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 6px;
    flex-shrink: 0;
}

.track-type-dot.rotation { background: var(--accent-red); }
.track-type-dot.translation { background: var(--accent-green); }
.track-type-dot.scale { background: var(--accent-blue); }
.track-type-dot.visible { background: var(--accent-yellow); }
.track-type-dot.spin { background: var(--accent-orange); }
.track-type-dot.texture { background: var(--accent-pink); }
.track-type-dot.events { background: var(--accent-cyan); }

#timeline-canvas-wrapper {
    flex: 1;
    position: relative;
    overflow: hidden;
}

#timeline-canvas {
    display: block;
    cursor: crosshair;
}

/* === Transport bar === */
#transport-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: var(--bg-panel);
    border-top: 1px solid var(--border);
    min-height: 28px;
    flex-shrink: 0;
}

.transport-btn {
    width: 26px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-button);
    color: var(--text-secondary);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--transition);
}

.transport-btn:hover {
    background: var(--bg-button-hover);
    color: var(--text-primary);
}

.transport-btn.active {
    background: var(--accent-violet);
    color: white;
    border-color: var(--accent-violet-light);
}

.transport-info {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    margin-left: 8px;
}
```

---

- [ ] Step 3: Create `src/timeline/track-builder.js`

Builds the list of visible tracks from the current animation data -- each track is a { groupName, trackType, keyframes } object rendered as one row in the timeline.

```js
/**
 * Builds the list of visible timeline tracks from the current animation.
 * Each track corresponds to one row in the timeline canvas.
 */
const TrackBuilder = {

    /** Track type order for display */
    TRACK_TYPES: ['rotation', 'translation', 'scale', 'visible', 'spin', 'texture'],

    /**
     * Build visible tracks for the current animation.
     * If a group is selected, only show that group's tracks.
     * Otherwise, show all groups that have keyframes.
     * Always appends an "Events" track at the end.
     *
     * @returns {{ label: string, groupName: string|null, trackType: string, keyframes: Array }[]}
     */
    build() {
        const anim = Project.getCurrentAnim();
        if (!anim) return [];

        const tracks = [];
        const selectedGroup = Project.selectedGroup;

        if (selectedGroup && anim.tracks[selectedGroup]) {
            // Show only selected group's tracks
            this._addGroupTracks(tracks, selectedGroup, anim.tracks[selectedGroup]);
        } else {
            // Show all groups that have keyframes
            for (const [groupName, groupTrack] of Object.entries(anim.tracks)) {
                if (!groupTrack.isEmpty()) {
                    this._addGroupTracks(tracks, groupName, groupTrack);
                }
            }
        }

        // Events track (always at the bottom)
        tracks.push({
            label: 'Events',
            groupName: null,
            trackType: 'events',
            keyframes: anim.events
        });

        return tracks;
    },

    _addGroupTracks(tracks, groupName, groupTrack) {
        for (const type of this.TRACK_TYPES) {
            const kfs = groupTrack[type];
            if (kfs && kfs.length > 0) {
                tracks.push({
                    label: groupName + '.' + type,
                    groupName: groupName,
                    trackType: type,
                    keyframes: kfs
                });
            }
        }
    }
};

window.TrackBuilder = TrackBuilder;
```

---

- [ ] Step 4: Create `src/timeline/timeline.js`

Canvas 2D timeline widget: ruler with tick marks, track rows with keyframe diamonds, playhead, mouse interactions (click to select, double-click to add, drag to move keyframes, drag playhead to scrub).

```js
/**
 * Canvas 2D timeline widget.
 * Renders ruler, tracks, keyframe diamonds, playhead.
 * Handles: click-select, double-click-add, drag-move keyframes, scrub playhead.
 */
const Timeline = {

    /** @type {HTMLCanvasElement} */
    canvas: null,
    /** @type {CanvasRenderingContext2D} */
    ctx: null,

    /** Horizontal pixels per tick */
    pixelsPerTick: 12,

    /** Scroll offset in pixels */
    scrollX: 0,

    /** Ruler height in pixels */
    RULER_HEIGHT: 24,
    /** Track row height in pixels */
    TRACK_HEIGHT: 22,
    /** Keyframe diamond size (half-width) */
    KF_SIZE: 5,

    /** @type {Array} Current visible tracks (from TrackBuilder) */
    _tracks: [],

    /** Drag state */
    _drag: null, // { type: 'playhead'|'keyframe'|'select', startX, startTick, kf, track }

    init() {
        const wrapper = document.getElementById('timeline-canvas-wrapper');
        this.canvas = document.getElementById('timeline-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Size canvas to wrapper
        this._resize();
        const resizeObserver = new ResizeObserver(() => this._resize());
        resizeObserver.observe(wrapper);

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

        // Listen to project events
        Project.on('animation-changed', () => this._rebuildAndPaint());
        Project.on('tick-changed', () => this.paint());
        Project.on('selection-changed', () => this._rebuildAndPaint());
        Project.on('keyframe-selection-changed', () => this.paint());
    },

    _resize() {
        const wrapper = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = wrapper.clientWidth * dpr;
        this.canvas.height = wrapper.clientHeight * dpr;
        this.canvas.style.width = wrapper.clientWidth + 'px';
        this.canvas.style.height = wrapper.clientHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._width = wrapper.clientWidth;
        this._height = wrapper.clientHeight;
        this.paint();
    },

    _rebuildAndPaint() {
        this._tracks = TrackBuilder.build();
        this._updateLabels();
        this.paint();
    },

    _updateLabels() {
        const labelsEl = document.getElementById('timeline-labels');
        if (!labelsEl) return;
        labelsEl.innerHTML = '';

        // Spacer for ruler
        const rulerSpacer = document.createElement('div');
        rulerSpacer.style.height = this.RULER_HEIGHT + 'px';
        rulerSpacer.style.borderBottom = '1px solid var(--border)';
        labelsEl.appendChild(rulerSpacer);

        for (const track of this._tracks) {
            const label = document.createElement('div');
            label.className = 'timeline-label';

            const dot = document.createElement('span');
            dot.className = 'track-type-dot ' + track.trackType;
            label.appendChild(dot);

            const text = document.createTextNode(track.label);
            label.appendChild(text);

            labelsEl.appendChild(label);
        }
    },

    /**
     * Convert a tick to canvas X coordinate.
     */
    tickToX(tick) {
        return tick * this.pixelsPerTick - this.scrollX;
    },

    /**
     * Convert canvas X coordinate to tick (float).
     */
    xToTick(x) {
        return (x + this.scrollX) / this.pixelsPerTick;
    },

    /**
     * Get the track index from a Y coordinate.
     * Returns -1 if in ruler area.
     */
    yToTrackIndex(y) {
        if (y < this.RULER_HEIGHT) return -1;
        return Math.floor((y - this.RULER_HEIGHT) / this.TRACK_HEIGHT);
    },

    paint() {
        if (!this.ctx || !this._width) return;
        const ctx = this.ctx;
        const w = this._width;
        const h = this._height;
        const duration = Project.getDuration();

        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = '#181825';
        ctx.fillRect(0, 0, w, h);

        // --- Ruler ---
        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, w, this.RULER_HEIGHT);
        ctx.strokeStyle = '#313244';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.RULER_HEIGHT);
        ctx.lineTo(w, this.RULER_HEIGHT);
        ctx.stroke();

        // Tick marks
        const startTick = Math.max(0, Math.floor(this.xToTick(0)));
        const endTick = Math.ceil(this.xToTick(w));

        ctx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');

        for (let tick = startTick; tick <= endTick && tick <= duration; tick++) {
            const x = this.tickToX(tick);
            if (x < 0 || x > w) continue;

            if (tick % 10 === 0) {
                // Major tick
                ctx.strokeStyle = '#585b70';
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, this.RULER_HEIGHT);
                ctx.stroke();

                ctx.fillStyle = '#a6adc8';
                ctx.textAlign = 'center';
                ctx.fillText(String(tick), x, 10);

                // Seconds label
                ctx.fillStyle = '#6c7086';
                ctx.fillText((tick / 20).toFixed(1) + 's', x, 20);
            } else if (tick % 5 === 0) {
                // Minor tick
                ctx.strokeStyle = '#45475a';
                ctx.beginPath();
                ctx.moveTo(x, this.RULER_HEIGHT - 8);
                ctx.lineTo(x, this.RULER_HEIGHT);
                ctx.stroke();
            } else {
                // Sub tick
                ctx.strokeStyle = '#313244';
                ctx.beginPath();
                ctx.moveTo(x, this.RULER_HEIGHT - 4);
                ctx.lineTo(x, this.RULER_HEIGHT);
                ctx.stroke();
            }
        }

        // Duration end marker
        const endX = this.tickToX(duration);
        if (endX >= 0 && endX <= w) {
            ctx.strokeStyle = '#f38ba888';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(endX, 0);
            ctx.lineTo(endX, h);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // --- Track rows ---
        for (let i = 0; i < this._tracks.length; i++) {
            const track = this._tracks[i];
            const y = this.RULER_HEIGHT + i * this.TRACK_HEIGHT;

            // Alternating row background
            if (i % 2 === 0) {
                ctx.fillStyle = 'rgba(30, 30, 46, 0.3)';
                ctx.fillRect(0, y, w, this.TRACK_HEIGHT);
            }

            // Row separator
            ctx.strokeStyle = 'rgba(49, 50, 68, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y + this.TRACK_HEIGHT);
            ctx.lineTo(w, y + this.TRACK_HEIGHT);
            ctx.stroke();

            // Keyframe diamonds
            const keyframes = track.keyframes;
            const cy = y + this.TRACK_HEIGHT / 2;

            for (const kf of keyframes) {
                const kfTick = kf.tick;
                const kfX = this.tickToX(kfTick);
                if (kfX < -this.KF_SIZE || kfX > w + this.KF_SIZE) continue;

                const isSelected = Project.selectedKeyframes.has(kf.id);

                // Diamond color based on easing
                ctx.fillStyle = this._getEasingColor(kf.easing || 'linear');
                if (isSelected) {
                    ctx.fillStyle = '#00E5FF';
                }

                // Draw diamond
                ctx.beginPath();
                ctx.moveTo(kfX, cy - this.KF_SIZE);
                ctx.lineTo(kfX + this.KF_SIZE, cy);
                ctx.lineTo(kfX, cy + this.KF_SIZE);
                ctx.lineTo(kfX - this.KF_SIZE, cy);
                ctx.closePath();
                ctx.fill();

                // Outline
                ctx.strokeStyle = isSelected ? '#00E5FF' : 'rgba(255,255,255,0.3)';
                ctx.lineWidth = isSelected ? 1.5 : 0.5;
                ctx.stroke();
            }
        }

        // --- Playhead ---
        const playX = this.tickToX(Project.currentTick);
        if (playX >= 0 && playX <= w) {
            // Vertical line
            ctx.strokeStyle = '#f38ba8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(playX, 0);
            ctx.lineTo(playX, h);
            ctx.stroke();

            // Triangle at top
            ctx.fillStyle = '#f38ba8';
            ctx.beginPath();
            ctx.moveTo(playX - 5, 0);
            ctx.lineTo(playX + 5, 0);
            ctx.lineTo(playX, 7);
            ctx.closePath();
            ctx.fill();
        }
    },

    _getEasingColor(easing) {
        switch (easing) {
            case 'linear': return '#cdd6f4';      // white
            case 'ease_in':
            case 'ease_out': return '#89b4fa';     // blue
            case 'ease_in_out': return '#a6e3a1';  // green
            case 'bounce':
            case 'elastic': return '#fab387';      // orange
            case 'ease_in_back':
            case 'ease_out_back': return '#f5c2e7'; // pink
            case 'ease_in_cubic':
            case 'ease_out_cubic': return '#89b4fa'; // blue
            case 'ease_in_expo':
            case 'ease_out_expo': return '#89b4fa';  // blue
            case 'spring': return '#f9e2af';       // yellow
            default: return '#cdd6f4';
        }
    },

    // --- Mouse Handlers ---

    _getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },

    _onMouseDown(e) {
        const pos = this._getCanvasPos(e);

        // Click in ruler = set playhead
        if (pos.y < this.RULER_HEIGHT) {
            const tick = Math.round(this.xToTick(pos.x));
            Project.setCurrentTick(tick);
            this._drag = { type: 'playhead' };
            return;
        }

        // Check if clicking on a keyframe
        const trackIdx = this.yToTrackIndex(pos.y);
        if (trackIdx >= 0 && trackIdx < this._tracks.length) {
            const track = this._tracks[trackIdx];
            for (const kf of track.keyframes) {
                const kfX = this.tickToX(kf.tick);
                if (Math.abs(pos.x - kfX) <= this.KF_SIZE + 2) {
                    // Clicked on a keyframe
                    Project.selectKeyframe(kf.id, e.ctrlKey);
                    this._drag = {
                        type: 'keyframe',
                        kf: kf,
                        track: track,
                        startTick: kf.tick,
                        startX: pos.x
                    };
                    this.paint();
                    return;
                }
            }

            // Clicked on empty track area = deselect
            if (!e.ctrlKey) {
                Project.selectedKeyframes.clear();
                Project.emit('keyframe-selection-changed', { keyframes: [] });
                // Set playhead
                const tick = Math.round(this.xToTick(pos.x));
                Project.setCurrentTick(tick);
            }
        }
    },

    _onMouseMove(e) {
        if (!this._drag) return;

        const pos = this._getCanvasPos(e);

        if (this._drag.type === 'playhead') {
            const tick = Math.round(this.xToTick(pos.x));
            Project.setCurrentTick(tick);
        } else if (this._drag.type === 'keyframe') {
            const newTick = Math.max(0, Math.round(this.xToTick(pos.x)));
            this._drag.kf.tick = newTick;
            this.paint();
        }
    },

    _onMouseUp(e) {
        if (this._drag && this._drag.type === 'keyframe') {
            // Sort the track after moving a keyframe
            if (this._drag.track.groupName) {
                const anim = Project.getCurrentAnim();
                if (anim && anim.tracks[this._drag.track.groupName]) {
                    anim.tracks[this._drag.track.groupName].sortAll();
                }
            }
            if (this._drag.kf.tick !== this._drag.startTick) {
                Project.markDirty();
            }
        }
        this._drag = null;
    },

    _onDoubleClick(e) {
        const pos = this._getCanvasPos(e);
        const trackIdx = this.yToTrackIndex(pos.y);

        if (trackIdx < 0 || trackIdx >= this._tracks.length) return;

        const track = this._tracks[trackIdx];
        const tick = Math.max(0, Math.round(this.xToTick(pos.x)));

        // Don't add to events track via double-click (use the event editor)
        if (track.trackType === 'events') return;
        if (!track.groupName) return;

        const anim = Project.getCurrentAnim();
        if (!anim) return;

        const groupTrack = anim.getOrCreateTrack(track.groupName);

        // Create appropriate keyframe based on track type
        let kf;
        switch (track.trackType) {
            case 'rotation':
                kf = new AnimKeyframe(tick, [0, 0, 0], 'linear');
                groupTrack.rotation.push(kf);
                break;
            case 'translation':
                kf = new AnimKeyframe(tick, [0, 0, 0], 'linear');
                groupTrack.translation.push(kf);
                break;
            case 'scale':
                kf = new AnimKeyframe(tick, [1, 1, 1], 'linear');
                groupTrack.scale.push(kf);
                break;
            case 'visible':
                kf = new AnimKeyframe(tick, [1, 0, 0], 'linear');
                groupTrack.visible.push(kf);
                break;
            case 'spin':
                kf = new AnimSpinKeyframe(tick, 'y', 0, 'linear');
                groupTrack.spin.push(kf);
                break;
            case 'texture':
                kf = new AnimTextureKeyframe(tick, '', '');
                groupTrack.texture.push(kf);
                break;
            default:
                return;
        }

        groupTrack.sortAll();
        Project.markDirty();
        Project.selectKeyframe(kf.id, false);
        this._rebuildAndPaint();
        Project.emit('animation-changed', anim);
    },

    _onWheel(e) {
        e.preventDefault();

        if (e.ctrlKey) {
            // Zoom
            const pos = this._getCanvasPos(e);
            const tickAtMouse = this.xToTick(pos.x);

            const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
            this.pixelsPerTick = Math.max(2, Math.min(60, this.pixelsPerTick * zoomFactor));

            // Keep the tick under the mouse at the same position
            this.scrollX = tickAtMouse * this.pixelsPerTick - pos.x;
            this.scrollX = Math.max(0, this.scrollX);
        } else {
            // Horizontal scroll
            this.scrollX = Math.max(0, this.scrollX + e.deltaY);
        }

        this.paint();
    }
};

window.Timeline = Timeline;
```

---

- [ ] Step 5: Create `src/timeline/playback.js`

Playback controller: play/pause/stop/loop at 20 TPS (ticks per second). Uses `setInterval` with 50ms period.

```js
/**
 * Animation playback controller.
 * Runs at 20 TPS (50ms interval) to match Minecraft tick rate.
 */
const Playback = {

    /** @type {boolean} */
    playing: false,

    /** @type {boolean} */
    looping: false,

    /** @type {number|null} */
    _intervalId: null,

    init() {
        Project.on('animation-changed', () => this.stop());
    },

    play() {
        if (this.playing) return;
        const anim = Project.getCurrentAnim();
        if (!anim) return;

        this.playing = true;
        this._updatePlayButton();

        this._intervalId = setInterval(() => {
            const duration = Project.getDuration();
            let tick = Project.currentTick + 1;

            if (tick > duration) {
                if (this.looping) {
                    tick = 0;
                } else {
                    this.stop();
                    return;
                }
            }

            Project.setCurrentTick(tick);
        }, 50); // 20 TPS
    },

    pause() {
        if (!this.playing) return;
        this.playing = false;
        if (this._intervalId !== null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._updatePlayButton();
    },

    stop() {
        this.pause();
        Project.setCurrentTick(0);
    },

    togglePlay() {
        if (this.playing) {
            this.pause();
        } else {
            // If at end, restart from beginning
            if (Project.currentTick >= Project.getDuration()) {
                Project.setCurrentTick(0);
            }
            this.play();
        }
    },

    toggleLoop() {
        this.looping = !this.looping;
        this._updateLoopButton();
    },

    goToStart() {
        this.pause();
        Project.setCurrentTick(0);
    },

    goToEnd() {
        this.pause();
        Project.setCurrentTick(Project.getDuration());
    },

    prevTick() {
        Project.setCurrentTick(Project.currentTick - 1);
    },

    nextTick() {
        Project.setCurrentTick(Project.currentTick + 1);
    },

    _updatePlayButton() {
        const btn = document.getElementById('btn-play');
        if (btn) {
            btn.innerHTML = this.playing ? '&#9646;&#9646;' : '&#9654;';
            btn.classList.toggle('active', this.playing);
        }
    },

    _updateLoopButton() {
        const btn = document.getElementById('btn-loop');
        if (btn) {
            btn.classList.toggle('active', this.looping);
        }
    }
};

window.Playback = Playback;
```

---

- [ ] Step 6: Create `src/viewport/animation-preview.js`

Applies interpolated animation transforms to the Three.js meshes each time the tick changes. Reads the current animation's tracks, finds the surrounding keyframes, interpolates using the easing function, and sets rotation/translation/scale on the Three.js groups.

```js
/**
 * Applies animation transforms to the Three.js model at the current tick.
 * Called whenever the tick changes (scrub, playback, manual).
 */
const AnimationPreview = {

    init() {
        Project.on('tick-changed', () => this.apply());
        Project.on('animation-changed', () => this.apply());
    },

    apply() {
        const anim = Project.getCurrentAnim();
        if (!anim || !Project.model) {
            this._resetAll();
            return;
        }

        const tick = Project.currentTick;

        for (const [groupName, track] of Object.entries(anim.tracks)) {
            const threeGroup = ModelRenderer.getGroup(groupName);
            if (!threeGroup) continue;

            const bbGroup = threeGroup.userData.bbGroup;
            if (!bbGroup) continue;

            // Rotation (degrees -> radians)
            if (track.rotation.length > 0) {
                const val = this._interpolateTrack(track.rotation, tick);
                threeGroup.rotation.set(
                    val[0] * Math.PI / 180,
                    val[1] * Math.PI / 180,
                    val[2] * Math.PI / 180
                );
            } else {
                threeGroup.rotation.set(0, 0, 0);
            }

            // Translation (Blockbench pixels, added to position)
            if (track.translation.length > 0) {
                const val = this._interpolateTrack(track.translation, tick);
                // Base position is already set by model-renderer (pivot)
                // We add the animation offset
                const parent = threeGroup.parent;
                const baseOrigin = bbGroup.origin;

                if (parent && parent.userData.bbGroup) {
                    const parentOrigin = parent.userData.bbGroup.origin;
                    threeGroup.position.set(
                        baseOrigin[0] - parentOrigin[0] + val[0],
                        baseOrigin[1] - parentOrigin[1] + val[1],
                        baseOrigin[2] - parentOrigin[2] + val[2]
                    );
                } else {
                    threeGroup.position.set(
                        baseOrigin[0] + val[0],
                        baseOrigin[1] + val[1],
                        baseOrigin[2] + val[2]
                    );
                }
            }

            // Scale
            if (track.scale.length > 0) {
                const val = this._interpolateTrack(track.scale, tick);
                threeGroup.scale.set(val[0], val[1], val[2]);
            } else {
                threeGroup.scale.set(1, 1, 1);
            }

            // Visible (instant, no interpolation)
            if (track.visible.length > 0) {
                const val = this._getStepValue(track.visible, tick);
                threeGroup.visible = val[0] > 0.5;
            }
        }

        // Reset groups that have no tracks
        if (Project.model) {
            for (const groupName of Project.model.getGroupNames()) {
                if (!anim.tracks[groupName]) {
                    const threeGroup = ModelRenderer.getGroup(groupName);
                    if (threeGroup) {
                        threeGroup.rotation.set(0, 0, 0);
                        threeGroup.scale.set(1, 1, 1);
                        // Don't reset position or visibility as those are model defaults
                    }
                }
            }
        }
    },

    /**
     * Interpolate a keyframe track (rotation/translation/scale) at the given tick.
     * @param {AnimKeyframe[]} keyframes - sorted by tick
     * @param {number} tick
     * @returns {number[]} [x, y, z]
     */
    _interpolateTrack(keyframes, tick) {
        if (keyframes.length === 0) return [0, 0, 0];

        // Before first keyframe
        if (tick <= keyframes[0].tick) {
            return [...keyframes[0].value];
        }

        // After last keyframe
        if (tick >= keyframes[keyframes.length - 1].tick) {
            return [...keyframes[keyframes.length - 1].value];
        }

        // Find surrounding keyframes
        for (let i = 0; i < keyframes.length - 1; i++) {
            const kfA = keyframes[i];
            const kfB = keyframes[i + 1];

            if (tick >= kfA.tick && tick <= kfB.tick) {
                const tickRange = kfB.tick - kfA.tick;
                if (tickRange === 0) return [...kfB.value];

                const t = (tick - kfA.tick) / tickRange;
                return EasingFunctions.interpolate3(kfA.value, kfB.value, t, kfB.easing);
            }
        }

        return [...keyframes[keyframes.length - 1].value];
    },

    /**
     * Get the step value for visible/instant tracks (no interpolation).
     * Returns the value of the most recent keyframe at or before the given tick.
     * @param {AnimKeyframe[]} keyframes - sorted by tick
     * @param {number} tick
     * @returns {number[]}
     */
    _getStepValue(keyframes, tick) {
        if (keyframes.length === 0) return [1, 0, 0];

        let result = keyframes[0].value;
        for (const kf of keyframes) {
            if (kf.tick <= tick) {
                result = kf.value;
            } else {
                break;
            }
        }
        return [...result];
    },

    /**
     * Reset all group transforms to default.
     */
    _resetAll() {
        if (!Project.model) return;
        for (const groupName of Project.model.getGroupNames()) {
            const threeGroup = ModelRenderer.getGroup(groupName);
            if (threeGroup) {
                threeGroup.rotation.set(0, 0, 0);
                threeGroup.scale.set(1, 1, 1);
            }
        }
    }
};

window.AnimationPreview = AnimationPreview;
```

---

- [ ] Step 7: Update `src/index.html`

Add new CSS link and script tags. Add timeline.css to head. Replace the static timeline placeholder with the actual timeline structure. Add script tags for easing.js, track-builder.js, timeline.js, playback.js, animation-preview.js.

In `<head>`, add:
```html
<link rel="stylesheet" href="styles/timeline.css">
```

Replace the `#timeline-container` content:
```html
<div id="timeline-container">
    <div id="timeline-body">
        <div id="timeline-labels"></div>
        <div id="timeline-canvas-wrapper">
            <canvas id="timeline-canvas"></canvas>
        </div>
    </div>
    <div id="transport-bar">
        <button class="transport-btn" id="btn-start" title="Go to start (Home)">|&lt;</button>
        <button class="transport-btn" id="btn-prev" title="Previous tick (Left)">&lt;</button>
        <button class="transport-btn" id="btn-play" title="Play/Pause (Space)">&#9654;</button>
        <button class="transport-btn" id="btn-next" title="Next tick (Right)">&gt;</button>
        <button class="transport-btn" id="btn-end" title="Go to end (End)">&gt;|</button>
        <div style="width:1px;height:16px;background:var(--border);margin:0 4px;"></div>
        <button class="transport-btn" id="btn-loop" title="Toggle loop">&#8635;</button>
        <span class="transport-info" id="transport-info">Frame 0/0 | 0.00s / 0.00s</span>
    </div>
</div>
```

Add script tags before `app.js`:
```html
<script src="model/easing.js"></script>
<script src="timeline/track-builder.js"></script>
<script src="timeline/timeline.js"></script>
<script src="timeline/playback.js"></script>
<script src="viewport/animation-preview.js"></script>
```

---

- [ ] Step 8: Update `src/app.js`

Add initialization of Timeline, Playback, AnimationPreview. Wire transport buttons. Update the transport info display on tick changes.

In `init()`, add after PropertiesPanel.init():
```js
Timeline.init();
Playback.init();
AnimationPreview.init();
```

In `_wireToolbar()`, add transport button handlers:
```js
document.getElementById('btn-start').addEventListener('click', () => Playback.goToStart());
document.getElementById('btn-prev').addEventListener('click', () => Playback.prevTick());
document.getElementById('btn-play').addEventListener('click', () => Playback.togglePlay());
document.getElementById('btn-next').addEventListener('click', () => Playback.nextTick());
document.getElementById('btn-end').addEventListener('click', () => Playback.goToEnd());
document.getElementById('btn-loop').addEventListener('click', () => Playback.toggleLoop());
```

Add transport info updater:
```js
Project.on('tick-changed', (tick) => {
    const duration = Project.getDuration();
    const infoEl = document.getElementById('transport-info');
    if (infoEl) {
        infoEl.textContent = `Frame ${tick}/${duration} | ${(tick/20).toFixed(2)}s / ${(duration/20).toFixed(2)}s`;
    }
    const toolbarInfo = document.getElementById('toolbar-frame-info');
    if (toolbarInfo) {
        toolbarInfo.textContent = `${tick}/${duration} | ${(tick/20).toFixed(2)}s`;
    }
});
```

---

- [ ] Step 9: Update `src/panels/properties-panel.js`

Add keyframe editing when a keyframe is selected. After `_buildGroupActions()` in `refresh()`, add a section that shows the selected keyframe's tick, value, and easing dropdown. Insert this block after the group actions block:

```js
// 4. Keyframe editor (if keyframes are selected)
if (Project.selectedKeyframes.size > 0 && anim) {
    this._buildKeyframeEditor(anim);
}
```

Add the `_buildKeyframeEditor` method:
```js
_buildKeyframeEditor(anim) {
    // Find the selected keyframe object(s)
    const selectedIds = [...Project.selectedKeyframes];
    let foundKf = null;
    let foundTrackType = null;

    // Search all tracks for the selected keyframe
    for (const [groupName, track] of Object.entries(anim.tracks)) {
        for (const type of ['rotation', 'translation', 'scale', 'visible']) {
            for (const kf of track[type]) {
                if (selectedIds.includes(kf.id)) {
                    foundKf = kf;
                    foundTrackType = type;
                    break;
                }
            }
            if (foundKf) break;
        }
        if (foundKf) break;

        for (const kf of track.spin) {
            if (selectedIds.includes(kf.id)) {
                foundKf = kf;
                foundTrackType = 'spin';
                break;
            }
        }
        if (foundKf) break;

        for (const kf of track.texture) {
            if (selectedIds.includes(kf.id)) {
                foundKf = kf;
                foundTrackType = 'texture';
                break;
            }
        }
        if (foundKf) break;
    }

    if (!foundKf) return;

    const title = document.createElement('div');
    title.className = 'prop-section-title';
    title.textContent = 'Keyframe (' + foundTrackType + ')';
    this._container.appendChild(title);

    // Tick
    this._addField('Tick', 'number', foundKf.tick, (v) => {
        foundKf.tick = Math.max(0, parseInt(v) || 0);
        Project.markDirty();
        Project.emit('animation-changed', anim);
    });

    // Value (depends on type)
    if (foundTrackType === 'rotation' || foundTrackType === 'translation' || foundTrackType === 'scale') {
        this._addXYZField(foundKf.value, (axis, v) => {
            foundKf.value[axis] = parseFloat(v) || 0;
            Project.markDirty();
            Project.emit('tick-changed', Project.currentTick); // Force preview update
        });

        // Easing dropdown
        this._addSelect('Easing', EASING_NAMES, foundKf.easing, (v) => {
            foundKf.easing = v;
            Project.markDirty();
            Project.emit('animation-changed', anim);
        });
    } else if (foundTrackType === 'visible') {
        // Boolean toggle
        const isVisible = foundKf.value[0] > 0.5;
        this._addSelect('Visible', ['true', 'false'], isVisible ? 'true' : 'false', (v) => {
            foundKf.value[0] = v === 'true' ? 1 : 0;
            Project.markDirty();
            Project.emit('tick-changed', Project.currentTick);
        });
    } else if (foundTrackType === 'spin') {
        this._addSelect('Axis', ['x', 'y', 'z'], foundKf.axis, (v) => {
            foundKf.axis = v;
            Project.markDirty();
        });
        this._addField('Speed', 'number', foundKf.speed, (v) => {
            foundKf.speed = parseFloat(v) || 0;
            Project.markDirty();
        });
        this._addSelect('Easing', EASING_NAMES, foundKf.easing, (v) => {
            foundKf.easing = v;
            Project.markDirty();
        });
    } else if (foundTrackType === 'texture') {
        this._addField('Target', 'text', foundKf.target, (v) => {
            foundKf.target = v;
            Project.markDirty();
        });
        this._addField('Value', 'text', foundKf.value, (v) => {
            foundKf.value = v;
            Project.markDirty();
        });
    }

    // Delete button
    const delDiv = document.createElement('div');
    delDiv.className = 'prop-buttons';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = 'Delete Keyframe';
    delBtn.addEventListener('click', () => {
        this._deleteKeyframe(foundKf, anim);
    });
    delDiv.appendChild(delBtn);
    this._container.appendChild(delDiv);
},

_addXYZField(value, onChange) {
    const div = document.createElement('div');
    div.className = 'prop-field';

    const lbl = document.createElement('label');
    lbl.textContent = 'Value';
    div.appendChild(lbl);

    const xyz = document.createElement('div');
    xyz.className = 'prop-xyz';

    const labels = ['X', 'Y', 'Z'];
    const classes = ['x', 'y', 'z'];

    for (let i = 0; i < 3; i++) {
        const axisLabel = document.createElement('span');
        axisLabel.className = 'prop-xyz-label ' + classes[i];
        axisLabel.textContent = labels[i];
        xyz.appendChild(axisLabel);

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.value = value[i];
        const axis = i;
        input.addEventListener('change', () => onChange(axis, input.value));
        xyz.appendChild(input);
    }

    div.appendChild(xyz);
    this._container.appendChild(div);
},

_deleteKeyframe(kf, anim) {
    for (const [groupName, track] of Object.entries(anim.tracks)) {
        for (const type of ['rotation', 'translation', 'scale', 'visible']) {
            const idx = track[type].indexOf(kf);
            if (idx >= 0) {
                track[type].splice(idx, 1);
                Project.selectedKeyframes.delete(kf.id);
                Project.markDirty();
                Project.emit('animation-changed', anim);
                Project.emit('keyframe-selection-changed', { keyframes: [...Project.selectedKeyframes] });
                return;
            }
        }
        const spinIdx = track.spin.indexOf(kf);
        if (spinIdx >= 0) {
            track.spin.splice(spinIdx, 1);
            Project.selectedKeyframes.delete(kf.id);
            Project.markDirty();
            Project.emit('animation-changed', anim);
            return;
        }
        const texIdx = track.texture.indexOf(kf);
        if (texIdx >= 0) {
            track.texture.splice(texIdx, 1);
            Project.selectedKeyframes.delete(kf.id);
            Project.markDirty();
            Project.emit('animation-changed', anim);
            return;
        }
    }
}
```

---

- [ ] Step 10: Verify

```bash
cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && npm start
```

**Verification checklist:**
1. Create a new animation via the properties panel
2. Select a group, click "Add Rotation KF" -- keyframe appears in timeline
3. Double-click on a track in the timeline to add a keyframe
4. Click a keyframe diamond to select it -- properties panel shows tick/value/easing editor
5. Drag a keyframe horizontally to move it
6. Change easing via dropdown -- diamond color changes in timeline
7. Press Space or click play -- model animates in the viewport
8. Playhead scrubs correctly (drag in ruler area)
9. Ctrl+mousewheel zooms the timeline
10. Transport info shows correct frame/time
11. All 13 easing functions interpolate correctly

---

## Task 4: Gizmos + Auto-Key

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\viewport\gizmo-controller.js`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\index.html` (add script tag)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\app.js` (init gizmo controller, wire keyboard shortcuts)

**Result:** TransformControls gizmo appears when a group is selected. Drag gizmo to rotate/translate/scale. Auto-key mode creates keyframes on drag end.

---

- [ ] Step 1: Create `src/viewport/gizmo-controller.js`

Manages a `THREE.TransformControls` instance. Attaches to the selected group. Supports 3 modes (rotate/translate/scale). On drag end with auto-key enabled, creates or updates a keyframe at the current tick.

```js
/**
 * Manages the Three.js TransformControls gizmo.
 * Attaches to the selected group's THREE.Group.
 * On drag end with auto-key enabled, creates a keyframe.
 */
const GizmoController = {

    /** @type {THREE.TransformControls} */
    controls: null,

    /** @type {THREE.Group|null} Currently attached group */
    _attachedGroup: null,

    /** Values before drag started (for undo) */
    _dragStartValues: null,

    init() {
        this.controls = new THREE.TransformControls(Viewport.camera, Viewport.canvas);
        this.controls.setSize(0.8);
        this.controls.setSpace('local');
        Viewport.scene.add(this.controls);

        // Disable orbit controls while dragging gizmo
        this.controls.addEventListener('dragging-changed', (event) => {
            Viewport.controls.enabled = !event.value;

            if (event.value) {
                // Drag started -- save current values
                this._onDragStart();
            } else {
                // Drag ended -- create keyframe if auto-key
                this._onDragEnd();
            }
        });

        // Update mode when project changes
        Project.on('gizmo-mode-changed', (mode) => this._setMode(mode));
        Project.on('selection-changed', (data) => this._onSelectionChanged(data.group));

        // Set initial mode
        this._setMode('rotate');
    },

    _setMode(mode) {
        switch (mode) {
            case 'rotate':
                this.controls.setMode('rotate');
                break;
            case 'translate':
                this.controls.setMode('translate');
                break;
            case 'scale':
                this.controls.setMode('scale');
                break;
        }
    },

    _onSelectionChanged(groupName) {
        if (this._attachedGroup) {
            this.controls.detach();
            this._attachedGroup = null;
        }

        if (!groupName) return;

        const threeGroup = ModelRenderer.getGroup(groupName);
        if (!threeGroup) return;

        this.controls.attach(threeGroup);
        this._attachedGroup = threeGroup;
    },

    _onDragStart() {
        if (!this._attachedGroup) return;

        this._dragStartValues = {
            rotation: [
                this._attachedGroup.rotation.x * 180 / Math.PI,
                this._attachedGroup.rotation.y * 180 / Math.PI,
                this._attachedGroup.rotation.z * 180 / Math.PI
            ],
            position: [
                this._attachedGroup.position.x,
                this._attachedGroup.position.y,
                this._attachedGroup.position.z
            ],
            scale: [
                this._attachedGroup.scale.x,
                this._attachedGroup.scale.y,
                this._attachedGroup.scale.z
            ]
        };
    },

    _onDragEnd() {
        if (!this._attachedGroup || !Project.autoKey) return;

        const anim = Project.getCurrentAnim();
        if (!anim || !Project.selectedGroup) return;

        const mode = Project.gizmoMode;
        const track = anim.getOrCreateTrack(Project.selectedGroup);
        const tick = Project.currentTick;

        let value;
        let trackType;

        switch (mode) {
            case 'rotate':
                value = [
                    this._attachedGroup.rotation.x * 180 / Math.PI,
                    this._attachedGroup.rotation.y * 180 / Math.PI,
                    this._attachedGroup.rotation.z * 180 / Math.PI
                ];
                trackType = 'rotation';
                break;
            case 'translate': {
                // Calculate the offset from base position
                const bbGroup = this._attachedGroup.userData.bbGroup;
                const parent = this._attachedGroup.parent;
                let baseX, baseY, baseZ;

                if (parent && parent.userData.bbGroup) {
                    const parentOrigin = parent.userData.bbGroup.origin;
                    baseX = bbGroup.origin[0] - parentOrigin[0];
                    baseY = bbGroup.origin[1] - parentOrigin[1];
                    baseZ = bbGroup.origin[2] - parentOrigin[2];
                } else {
                    baseX = bbGroup.origin[0];
                    baseY = bbGroup.origin[1];
                    baseZ = bbGroup.origin[2];
                }

                value = [
                    this._attachedGroup.position.x - baseX,
                    this._attachedGroup.position.y - baseY,
                    this._attachedGroup.position.z - baseZ
                ];
                trackType = 'translation';
                break;
            }
            case 'scale':
                value = [
                    this._attachedGroup.scale.x,
                    this._attachedGroup.scale.y,
                    this._attachedGroup.scale.z
                ];
                trackType = 'scale';
                break;
            default:
                return;
        }

        // Check if a keyframe already exists at this tick
        const existing = track[trackType].find(kf => kf.tick === tick);
        if (existing) {
            existing.value = value;
        } else {
            const kf = new AnimKeyframe(tick, value, 'linear');
            track[trackType].push(kf);
            track.sortAll();
            Project.selectKeyframe(kf.id, false);
        }

        Project.markDirty();
        Project.emit('animation-changed', anim);
    }
};

window.GizmoController = GizmoController;
```

---

- [ ] Step 2: Update `src/index.html`

Add script tag for gizmo-controller.js before app.js:
```html
<script src="viewport/gizmo-controller.js"></script>
```

---

- [ ] Step 3: Update `src/app.js`

Add GizmoController initialization in `init()`:
```js
GizmoController.init();
```

Add keyboard shortcut handling. Add a `_wireKeyboard()` method called from `init()`:
```js
_wireKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Don't capture when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key) {
            case 'r': case 'R':
                if (!e.ctrlKey) { Project.setGizmoMode('rotate'); e.preventDefault(); }
                break;
            case 't': case 'T':
                if (!e.ctrlKey) { Project.setGizmoMode('translate'); e.preventDefault(); }
                break;
            case 's': case 'S':
                if (!e.ctrlKey) { Project.setGizmoMode('scale'); e.preventDefault(); }
                break;
            case ' ':
                Playback.togglePlay();
                e.preventDefault();
                break;
            case 'f': case 'F':
                if (!e.ctrlKey) { this._focusSelected(); e.preventDefault(); }
                break;
            case 'k': case 'K':
                if (!e.ctrlKey) { this._addKeyframeAtCurrentTick(); e.preventDefault(); }
                break;
            case 'Delete':
                this._deleteSelectedKeyframes();
                e.preventDefault();
                break;
            case 'ArrowLeft':
                Playback.prevTick();
                e.preventDefault();
                break;
            case 'ArrowRight':
                Playback.nextTick();
                e.preventDefault();
                break;
            case 'Home':
                Playback.goToStart();
                e.preventDefault();
                break;
            case 'End':
                Playback.goToEnd();
                e.preventDefault();
                break;
        }
    });
},

_focusSelected() {
    if (!Project.selectedGroup) return;
    const pivot = ModelRenderer.getGroupWorldPivot(Project.selectedGroup);
    if (pivot) Viewport.focusOn(pivot);
},

_addKeyframeAtCurrentTick() {
    const anim = Project.getCurrentAnim();
    if (!anim || !Project.selectedGroup) return;

    const track = anim.getOrCreateTrack(Project.selectedGroup);
    const tick = Project.currentTick;
    const mode = Project.gizmoMode;
    let trackType;
    let defaultValue;

    switch (mode) {
        case 'rotate': trackType = 'rotation'; defaultValue = [0, 0, 0]; break;
        case 'translate': trackType = 'translation'; defaultValue = [0, 0, 0]; break;
        case 'scale': trackType = 'scale'; defaultValue = [1, 1, 1]; break;
        default: return;
    }

    // Don't duplicate if one exists at this tick
    if (track[trackType].some(kf => kf.tick === tick)) return;

    const kf = new AnimKeyframe(tick, defaultValue, 'linear');
    track[trackType].push(kf);
    track.sortAll();
    Project.markDirty();
    Project.selectKeyframe(kf.id, false);
    Project.emit('animation-changed', anim);
},

_deleteSelectedKeyframes() {
    const anim = Project.getCurrentAnim();
    if (!anim || Project.selectedKeyframes.size === 0) return;

    const ids = [...Project.selectedKeyframes];
    for (const [groupName, track] of Object.entries(anim.tracks)) {
        for (const type of ['rotation', 'translation', 'scale', 'visible']) {
            track[type] = track[type].filter(kf => !ids.includes(kf.id));
        }
        track.spin = track.spin.filter(kf => !ids.includes(kf.id));
        track.texture = track.texture.filter(kf => !ids.includes(kf.id));
    }

    Project.selectedKeyframes.clear();
    Project.markDirty();
    Project.emit('animation-changed', anim);
    Project.emit('keyframe-selection-changed', { keyframes: [] });
}
```

---

- [ ] Step 4: Wire menu events for gizmo/focus

In `_wireMenuEvents()`:
```js
window.fileAPI.onMenuEvent('menu:focus', () => this._focusSelected());
window.fileAPI.onMenuEvent('menu:add-keyframe', () => this._addKeyframeAtCurrentTick());
window.fileAPI.onMenuEvent('menu:delete', () => this._deleteSelectedKeyframes());
```

---

- [ ] Step 5: Verify

```bash
cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && npm start
```

**Verification checklist:**
1. Select a group -- gizmo appears at its pivot
2. Press R/T/S to switch gizmo mode -- toolbar buttons update
3. Drag gizmo to rotate the group -- model updates in real-time
4. Enable Auto-Key, drag gizmo -- a keyframe is created at the current tick
5. Move playhead to a different tick, drag gizmo again -- second keyframe created
6. Play animation -- model interpolates between the keyframes
7. Press K to add keyframe, Delete to remove selected keyframes
8. Press F to focus camera on selected group
9. Space toggles play/pause
10. Left/Right arrows step through ticks

---

## Task 5: Events + Undo/Redo + Clipboard

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\panels\event-editor.js`
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\commands\undo-manager.js`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\index.html` (add script tags)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\app.js` (init undo, wire undo/redo/copy/paste, menu events)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\panels\properties-panel.js` (integrate event editor)

**Result:** Full event editor in properties panel. Undo/redo for all keyframe operations. Copy/paste/duplicate keyframes.

---

- [ ] Step 1: Create `src/commands/undo-manager.js`

```js
/**
 * Undo/Redo manager using the Command pattern.
 * Each command has execute() and undo() methods.
 * Stack is truncated when a new command is executed after undo.
 */
const UndoManager = {

    /** @type {Array<{execute: Function, undo: Function, label: string}>} */
    _stack: [],

    /** @type {number} Index of the last executed command */
    _index: -1,

    /** Maximum stack size */
    MAX_SIZE: 100,

    /**
     * Execute a command and push it to the stack.
     * @param {{ execute: Function, undo: Function, label: string }} cmd
     */
    execute(cmd) {
        // Truncate any redo history
        this._stack.splice(this._index + 1);

        cmd.execute();
        this._stack.push(cmd);
        this._index++;

        // Limit stack size
        if (this._stack.length > this.MAX_SIZE) {
            this._stack.shift();
            this._index--;
        }

        Project.markDirty();
    },

    undo() {
        if (this._index < 0) return;
        this._stack[this._index].undo();
        this._index--;
        Project.emit('animation-changed', Project.getCurrentAnim());
    },

    redo() {
        if (this._index >= this._stack.length - 1) return;
        this._index++;
        this._stack[this._index].execute();
        Project.emit('animation-changed', Project.getCurrentAnim());
    },

    canUndo() {
        return this._index >= 0;
    },

    canRedo() {
        return this._index < this._stack.length - 1;
    },

    clear() {
        this._stack = [];
        this._index = -1;
    }
};

// --- Command factories ---

const Commands = {

    addKeyframe(track, trackType, keyframe) {
        return {
            label: 'Add keyframe',
            execute() {
                track[trackType].push(keyframe);
                track.sortAll();
            },
            undo() {
                const idx = track[trackType].indexOf(keyframe);
                if (idx >= 0) track[trackType].splice(idx, 1);
            }
        };
    },

    deleteKeyframe(track, trackType, keyframe) {
        let index = -1;
        return {
            label: 'Delete keyframe',
            execute() {
                index = track[trackType].indexOf(keyframe);
                if (index >= 0) track[trackType].splice(index, 1);
            },
            undo() {
                track[trackType].push(keyframe);
                track.sortAll();
            }
        };
    },

    moveKeyframe(keyframe, oldTick, newTick) {
        return {
            label: 'Move keyframe',
            execute() { keyframe.tick = newTick; },
            undo() { keyframe.tick = oldTick; }
        };
    },

    changeValue(keyframe, field, oldValue, newValue) {
        return {
            label: 'Change ' + field,
            execute() {
                if (Array.isArray(newValue)) {
                    keyframe[field] = [...newValue];
                } else {
                    keyframe[field] = newValue;
                }
            },
            undo() {
                if (Array.isArray(oldValue)) {
                    keyframe[field] = [...oldValue];
                } else {
                    keyframe[field] = oldValue;
                }
            }
        };
    },

    addEvent(anim, event) {
        return {
            label: 'Add event',
            execute() {
                anim.events.push(event);
                anim.events.sort((a, b) => a.tick - b.tick);
            },
            undo() {
                const idx = anim.events.indexOf(event);
                if (idx >= 0) anim.events.splice(idx, 1);
            }
        };
    },

    deleteEvent(anim, event) {
        return {
            label: 'Delete event',
            execute() {
                const idx = anim.events.indexOf(event);
                if (idx >= 0) anim.events.splice(idx, 1);
            },
            undo() {
                anim.events.push(event);
                anim.events.sort((a, b) => a.tick - b.tick);
            }
        };
    },

    /**
     * Batch command: groups multiple commands into one undo step.
     * @param {string} label
     * @param {Array} cmds
     */
    batch(label, cmds) {
        return {
            label: label,
            execute() { cmds.forEach(c => c.execute()); },
            undo() { for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(); }
        };
    }
};

window.UndoManager = UndoManager;
window.Commands = Commands;
```

---

- [ ] Step 2: Create `src/panels/event-editor.js`

```js
/**
 * Event editor - displays and edits AnimEvents in the properties panel.
 * Shows a list of events with add/remove/edit capabilities.
 * 6 event types: sound, particle, callback, hide_group, show_group, cut
 */
const EventEditor = {

    /**
     * Build the event editor section in the properties panel.
     * @param {HTMLElement} container
     * @param {AnimDef} anim
     */
    build(container, anim) {
        const title = document.createElement('div');
        title.className = 'prop-section-title';
        title.textContent = 'Events (' + anim.events.length + ')';
        container.appendChild(title);

        // Event list
        const listDiv = document.createElement('div');
        listDiv.style.maxHeight = '200px';
        listDiv.style.overflowY = 'auto';
        listDiv.style.padding = '4px 0';

        for (let i = 0; i < anim.events.length; i++) {
            const event = anim.events[i];
            const row = this._buildEventRow(event, anim, i);
            listDiv.appendChild(row);
        }

        container.appendChild(listDiv);

        // Add event button
        const addDiv = document.createElement('div');
        addDiv.className = 'prop-buttons';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm btn-accent';
        addBtn.textContent = '+ Add Event';
        addBtn.addEventListener('click', () => {
            const event = new AnimEvent(Project.currentTick, 'callback', '', 1.0, 1.0, 1, 0.5);
            UndoManager.execute(Commands.addEvent(anim, event));
            Project.emit('animation-changed', anim);
        });
        addDiv.appendChild(addBtn);
        container.appendChild(addDiv);
    },

    _buildEventRow(event, anim, index) {
        const row = document.createElement('div');
        row.style.padding = '4px 12px';
        row.style.borderBottom = '1px solid var(--border)';
        row.style.fontSize = '11px';

        // Header line: tick + type + delete
        const headerLine = document.createElement('div');
        headerLine.style.display = 'flex';
        headerLine.style.alignItems = 'center';
        headerLine.style.gap = '6px';
        headerLine.style.marginBottom = '4px';

        // Tick
        const tickInput = document.createElement('input');
        tickInput.type = 'number';
        tickInput.value = event.tick;
        tickInput.style.width = '50px';
        tickInput.style.fontSize = '11px';
        tickInput.addEventListener('change', () => {
            event.tick = Math.max(0, parseInt(tickInput.value) || 0);
            anim.events.sort((a, b) => a.tick - b.tick);
            Project.markDirty();
            Project.emit('animation-changed', anim);
        });
        headerLine.appendChild(tickInput);

        // Type dropdown
        const typeSelect = document.createElement('select');
        typeSelect.style.flex = '1';
        typeSelect.style.fontSize = '11px';
        for (const t of EVENT_TYPES) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            opt.selected = (t === event.type);
            typeSelect.appendChild(opt);
        }
        typeSelect.addEventListener('change', () => {
            event.type = typeSelect.value;
            Project.markDirty();
            Project.emit('animation-changed', anim);
        });
        headerLine.appendChild(typeSelect);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-sm btn-danger';
        delBtn.textContent = 'x';
        delBtn.style.padding = '1px 6px';
        delBtn.addEventListener('click', () => {
            UndoManager.execute(Commands.deleteEvent(anim, event));
            Project.emit('animation-changed', anim);
        });
        headerLine.appendChild(delBtn);

        row.appendChild(headerLine);

        // Value (always shown except for 'cut')
        if (event.type !== 'cut') {
            const valueField = this._makeInlineField('Value', event.value, (v) => {
                event.value = v;
                Project.markDirty();
            });
            row.appendChild(valueField);
        }

        // Type-specific fields
        if (event.type === 'sound') {
            row.appendChild(this._makeInlineNumField('Volume', event.volume, (v) => {
                event.volume = parseFloat(v) || 1.0;
                Project.markDirty();
            }));
            row.appendChild(this._makeInlineNumField('Pitch', event.pitch, (v) => {
                event.pitch = parseFloat(v) || 1.0;
                Project.markDirty();
            }));
        } else if (event.type === 'particle') {
            row.appendChild(this._makeInlineNumField('Count', event.count, (v) => {
                event.count = parseInt(v) || 1;
                Project.markDirty();
            }));
            row.appendChild(this._makeInlineNumField('Spread', event.spread, (v) => {
                event.spread = parseFloat(v) || 0.5;
                Project.markDirty();
            }));
        }

        return row;
    },

    _makeInlineField(label, value, onChange) {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '6px';
        div.style.marginBottom = '2px';

        const lbl = document.createElement('span');
        lbl.style.fontSize = '10px';
        lbl.style.color = 'var(--text-muted)';
        lbl.style.minWidth = '40px';
        lbl.textContent = label;
        div.appendChild(lbl);

        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.style.flex = '1';
        input.style.fontSize = '11px';
        input.addEventListener('change', () => onChange(input.value));
        div.appendChild(input);

        return div;
    },

    _makeInlineNumField(label, value, onChange) {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '6px';
        div.style.marginBottom = '2px';

        const lbl = document.createElement('span');
        lbl.style.fontSize = '10px';
        lbl.style.color = 'var(--text-muted)';
        lbl.style.minWidth = '40px';
        lbl.textContent = label;
        div.appendChild(lbl);

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.value = value;
        input.style.flex = '1';
        input.style.fontSize = '11px';
        input.addEventListener('change', () => onChange(input.value));
        div.appendChild(input);

        return div;
    }
};

window.EventEditor = EventEditor;
```

---

- [ ] Step 3: Update `src/index.html`

Add script tags before `app.js`:
```html
<script src="commands/undo-manager.js"></script>
<script src="panels/event-editor.js"></script>
```

---

- [ ] Step 4: Update `src/panels/properties-panel.js`

Add event editor section at the end of `refresh()`, after the keyframe editor block:

```js
// 5. Event editor (if animation exists)
if (anim) {
    EventEditor.build(this._container, anim);
}
```

---

- [ ] Step 5: Update `src/app.js`

Add undo/redo/copy/paste handling. Wire menu events and keyboard shortcuts.

Add clipboard state:
```js
/** @type {Array|null} Clipboard for keyframe copy/paste */
_clipboard: null,
```

Wire menu events for undo/redo/copy/paste in `_wireMenuEvents()`:
```js
window.fileAPI.onMenuEvent('menu:undo', () => UndoManager.undo());
window.fileAPI.onMenuEvent('menu:redo', () => UndoManager.redo());
window.fileAPI.onMenuEvent('menu:copy', () => this._copyKeyframes());
window.fileAPI.onMenuEvent('menu:paste', () => this._pasteKeyframes());
window.fileAPI.onMenuEvent('menu:duplicate', () => this._duplicateKeyframes());
window.fileAPI.onMenuEvent('menu:select-all', () => this._selectAllKeyframes());
```

Add keyboard shortcuts in `_wireKeyboard()`:
```js
case 'z': case 'Z':
    if (e.ctrlKey && !e.shiftKey) { UndoManager.undo(); e.preventDefault(); }
    if (e.ctrlKey && e.shiftKey) { UndoManager.redo(); e.preventDefault(); }
    break;
case 'y': case 'Y':
    if (e.ctrlKey) { UndoManager.redo(); e.preventDefault(); }
    break;
case 'c': case 'C':
    if (e.ctrlKey) { this._copyKeyframes(); e.preventDefault(); }
    break;
case 'v': case 'V':
    if (e.ctrlKey) { this._pasteKeyframes(); e.preventDefault(); }
    break;
case 'd': case 'D':
    if (e.ctrlKey) { this._duplicateKeyframes(); e.preventDefault(); }
    break;
case 'a': case 'A':
    if (e.ctrlKey) { this._selectAllKeyframes(); e.preventDefault(); }
    break;
```

Add clipboard methods:
```js
_copyKeyframes() {
    const anim = Project.getCurrentAnim();
    if (!anim || Project.selectedKeyframes.size === 0) return;

    this._clipboard = [];
    const ids = [...Project.selectedKeyframes];

    for (const [groupName, track] of Object.entries(anim.tracks)) {
        for (const type of ['rotation', 'translation', 'scale', 'visible']) {
            for (const kf of track[type]) {
                if (ids.includes(kf.id)) {
                    this._clipboard.push({ groupName, trackType: type, keyframe: kf.clone() });
                }
            }
        }
    }
},

_pasteKeyframes() {
    if (!this._clipboard || this._clipboard.length === 0) return;
    const anim = Project.getCurrentAnim();
    if (!anim) return;

    // Find the min tick in clipboard to compute offset
    const minTick = Math.min(...this._clipboard.map(c => c.keyframe.tick));
    const offset = Project.currentTick - minTick;

    const newKfs = [];
    for (const entry of this._clipboard) {
        const kf = entry.keyframe.clone();
        kf.tick += offset;
        const track = anim.getOrCreateTrack(entry.groupName);
        track[entry.trackType].push(kf);
        newKfs.push(kf);
    }

    // Sort and select pasted keyframes
    for (const track of Object.values(anim.tracks)) {
        track.sortAll();
    }

    Project.selectedKeyframes.clear();
    newKfs.forEach(kf => Project.selectedKeyframes.add(kf.id));
    Project.markDirty();
    Project.emit('animation-changed', anim);
    Project.emit('keyframe-selection-changed', { keyframes: [...Project.selectedKeyframes] });
},

_duplicateKeyframes() {
    this._copyKeyframes();
    this._pasteKeyframes();
},

_selectAllKeyframes() {
    const anim = Project.getCurrentAnim();
    if (!anim) return;

    Project.selectedKeyframes.clear();
    for (const track of Object.values(anim.tracks)) {
        for (const type of ['rotation', 'translation', 'scale', 'visible']) {
            track[type].forEach(kf => Project.selectedKeyframes.add(kf.id));
        }
        track.spin.forEach(kf => Project.selectedKeyframes.add(kf.id));
        track.texture.forEach(kf => Project.selectedKeyframes.add(kf.id));
    }
    Project.emit('keyframe-selection-changed', { keyframes: [...Project.selectedKeyframes] });
}
```

---

- [ ] Step 6: Verify

```bash
cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && npm start
```

**Verification checklist:**
1. Event editor shows in properties panel when animation exists
2. Click "+ Add Event" creates an event at the current tick
3. Change event type dropdown -- conditional fields appear (volume/pitch for sound, count/spread for particle)
4. Delete event via "x" button
5. Ctrl+Z undoes event addition/deletion
6. Ctrl+Y redoes
7. Select keyframes, Ctrl+C, move playhead, Ctrl+V -- keyframes pasted at new position
8. Ctrl+D duplicates selected keyframes
9. Ctrl+A selects all keyframes

---

## Task 6: Export + Save/Load + Onion Skinning + Polish

**Files to create:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\export\erianim-exporter.js`

**Files to modify:**
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\index.html` (add script tag)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\app.js` (wire export/save/load, onion skinning, menu events)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\viewport\viewport.js` (add onion skinning)
- `D:\Mods Minecraft\EriniumFaction\tools\erianim-editor\src\styles\main.css` (polish: tooltips, transitions)

**Result:** Export valid `.erianim.json` files. Save/load project state. Onion skinning toggle. Polished UI.

---

- [ ] Step 1: Create `src/export/erianim-exporter.js`

Serializes the AnimFile to JSON matching the exact schema parsed by `EriAnimParser.java`. Validates group names exist in model. Omits default values to keep the file clean.

```js
/**
 * Exports animation data to .erianim.json format.
 * Output matches the exact schema parsed by EriAnimParser.java in EriAPI.
 *
 * Schema:
 * {
 *   "format_version": 1,
 *   "model": "modid:path",
 *   "animations": {
 *     "animName": {
 *       "duration": int,
 *       "endBehavior": string,     // omit if "freeze"
 *       "rollbackDuration": int,   // omit if 10
 *       "blendIn": int,            // omit if 0
 *       "blendOut": int,           // omit if 0
 *       "loopCount": int,          // omit if 0
 *       "loopPause": int,          // omit if 0
 *       "tracks": { ... },
 *       "events": [ ... ]          // omit if empty
 *     }
 *   }
 * }
 */
const EriAnimExporter = {

    /**
     * Export the current AnimFile to a JSON string.
     * @param {AnimFile} animFile
     * @param {BBModel|null} model - for validation
     * @returns {{ json: string, warnings: string[] }}
     */
    export(animFile, model) {
        const warnings = [];

        const output = {
            format_version: animFile.formatVersion || 1,
            model: animFile.modelId || ''
        };

        if (!output.model) {
            warnings.push('No model ID set. The animation file needs a model reference.');
        }

        const animations = {};

        for (const [name, anim] of Object.entries(animFile.animations)) {
            const animObj = { duration: anim.duration };

            // Only include non-default values
            if (anim.endBehavior !== 'freeze') animObj.endBehavior = anim.endBehavior;
            if (anim.rollbackDuration !== 10) animObj.rollbackDuration = anim.rollbackDuration;
            if (anim.blendIn !== 0) animObj.blendIn = anim.blendIn;
            if (anim.blendOut !== 0) animObj.blendOut = anim.blendOut;
            if (anim.loopCount !== 0) animObj.loopCount = anim.loopCount;
            if (anim.loopPause !== 0) animObj.loopPause = anim.loopPause;

            // Tracks
            const tracks = {};
            for (const [groupName, track] of Object.entries(anim.tracks)) {
                if (track.isEmpty()) continue;

                // Validate group name exists in model
                if (model && !model.groupsByName[groupName]) {
                    warnings.push(`Animation "${name}": track references unknown group "${groupName}"`);
                }

                const trackObj = {};

                if (track.rotation.length > 0) {
                    trackObj.rotation = track.rotation.map(kf => this._serializeKeyframe(kf));
                }
                if (track.translation.length > 0) {
                    trackObj.translation = track.translation.map(kf => this._serializeKeyframe(kf));
                }
                if (track.scale.length > 0) {
                    trackObj.scale = track.scale.map(kf => this._serializeKeyframe(kf));
                }
                if (track.visible.length > 0) {
                    trackObj.visible = track.visible.map(kf => ({
                        tick: kf.tick,
                        value: kf.value[0] > 0.5
                    }));
                }
                if (track.spin.length > 0) {
                    trackObj.spin = track.spin.map(kf => {
                        const obj = { tick: kf.tick, axis: kf.axis, speed: kf.speed };
                        if (kf.easing !== 'linear') obj.easing = kf.easing;
                        return obj;
                    });
                }
                if (track.texture.length > 0) {
                    trackObj.texture = track.texture.map(kf => ({
                        tick: kf.tick,
                        target: kf.target,
                        value: kf.value
                    }));
                }

                tracks[groupName] = trackObj;
            }

            animObj.tracks = tracks;

            // Events
            if (anim.events.length > 0) {
                animObj.events = anim.events.map(ev => this._serializeEvent(ev));
            }

            // Validate ticks in range
            this._validateTicks(anim, name, warnings);

            animations[name] = animObj;
        }

        output.animations = animations;

        const json = JSON.stringify(output, null, 2);
        return { json, warnings };
    },

    _serializeKeyframe(kf) {
        const obj = {
            tick: kf.tick,
            value: [
                Math.round(kf.value[0] * 1000) / 1000,
                Math.round(kf.value[1] * 1000) / 1000,
                Math.round(kf.value[2] * 1000) / 1000
            ]
        };
        if (kf.easing !== 'linear') {
            obj.easing = kf.easing;
        }
        return obj;
    },

    _serializeEvent(ev) {
        const obj = {
            tick: ev.tick,
            type: ev.type,
            value: ev.value
        };

        // Only include type-specific fields with non-default values
        if (ev.type === 'sound') {
            if (ev.volume !== 1.0) obj.volume = ev.volume;
            if (ev.pitch !== 1.0) obj.pitch = ev.pitch;
        } else if (ev.type === 'particle') {
            if (ev.count !== 1) obj.count = ev.count;
            if (ev.spread !== 0.5) obj.spread = ev.spread;
        }

        return obj;
    },

    _validateTicks(anim, name, warnings) {
        for (const [groupName, track] of Object.entries(anim.tracks)) {
            const allKfs = [
                ...track.rotation, ...track.translation, ...track.scale,
                ...track.visible, ...track.spin, ...track.texture
            ];
            for (const kf of allKfs) {
                if (kf.tick < 0 || kf.tick > anim.duration) {
                    warnings.push(
                        `Animation "${name}", group "${groupName}": ` +
                        `keyframe at tick ${kf.tick} is outside range [0, ${anim.duration}]`
                    );
                }
            }
        }

        for (const ev of anim.events) {
            if (ev.tick < 0 || ev.tick > anim.duration) {
                warnings.push(
                    `Animation "${name}": event at tick ${ev.tick} is outside range [0, ${anim.duration}]`
                );
            }
        }
    },

    /**
     * Parse a .erianim.json file into an AnimFile.
     * Used for "Open Animation File" to load previously exported animations.
     * @param {string} jsonString
     * @returns {AnimFile}
     */
    parseAnimFile(jsonString) {
        const root = JSON.parse(jsonString);
        const animFile = new AnimFile();
        animFile.formatVersion = root.format_version || 1;
        animFile.modelId = root.model || '';

        if (root.animations) {
            for (const [name, animObj] of Object.entries(root.animations)) {
                const anim = animFile.createAnimation(name);
                anim.duration = animObj.duration || 40;
                anim.endBehavior = animObj.endBehavior || 'freeze';
                anim.rollbackDuration = animObj.rollbackDuration != null ? animObj.rollbackDuration : 10;
                anim.blendIn = animObj.blendIn || 0;
                anim.blendOut = animObj.blendOut || 0;
                anim.loopCount = animObj.loopCount || 0;
                anim.loopPause = animObj.loopPause || 0;

                // Parse tracks
                if (animObj.tracks) {
                    for (const [groupName, trackObj] of Object.entries(animObj.tracks)) {
                        const track = anim.getOrCreateTrack(groupName);

                        if (trackObj.rotation) {
                            track.rotation = trackObj.rotation.map(kf =>
                                new AnimKeyframe(kf.tick, kf.value, kf.easing || 'linear')
                            );
                        }
                        if (trackObj.translation) {
                            track.translation = trackObj.translation.map(kf =>
                                new AnimKeyframe(kf.tick, kf.value, kf.easing || 'linear')
                            );
                        }
                        if (trackObj.scale) {
                            track.scale = trackObj.scale.map(kf =>
                                new AnimKeyframe(kf.tick, kf.value, kf.easing || 'linear')
                            );
                        }
                        if (trackObj.visible) {
                            track.visible = trackObj.visible.map(kf =>
                                new AnimKeyframe(kf.tick, [kf.value ? 1 : 0, 0, 0], 'linear')
                            );
                        }
                        if (trackObj.spin) {
                            track.spin = trackObj.spin.map(kf =>
                                new AnimSpinKeyframe(kf.tick, kf.axis, kf.speed, kf.easing || 'linear')
                            );
                        }
                        if (trackObj.texture) {
                            track.texture = trackObj.texture.map(kf =>
                                new AnimTextureKeyframe(kf.tick, kf.target, kf.value)
                            );
                        }

                        track.sortAll();
                    }
                }

                // Parse events
                if (animObj.events) {
                    anim.events = animObj.events.map(ev =>
                        new AnimEvent(ev.tick, ev.type, ev.value || '',
                            ev.volume != null ? ev.volume : 1.0,
                            ev.pitch != null ? ev.pitch : 1.0,
                            ev.count != null ? ev.count : 1,
                            ev.spread != null ? ev.spread : 0.5)
                    );
                    anim.events.sort((a, b) => a.tick - b.tick);
                }
            }
        }

        return animFile;
    }
};

window.EriAnimExporter = EriAnimExporter;
```

---

- [ ] Step 2: Update `src/index.html`

Add script tag before `app.js`:
```html
<script src="export/erianim-exporter.js"></script>
```

---

- [ ] Step 3: Update `src/app.js`

Wire export, save, load (both model and animation file), and onion skinning toggle.

Add to `_wireMenuEvents()`:
```js
window.fileAPI.onMenuEvent('menu:open-anim', () => this.openAnimFile());
window.fileAPI.onMenuEvent('menu:save', () => this.saveAnimFile());
window.fileAPI.onMenuEvent('menu:save-as', () => this.saveAnimFileAs());
window.fileAPI.onMenuEvent('menu:export', () => this.exportAnimFile());
window.fileAPI.onMenuEvent('menu:onion-skin', (checked) => {
    Viewport.setOnionSkinning(checked);
});
window.fileAPI.onMenuEvent('menu:new-anim', () => {
    const name = prompt('Animation name:');
    if (name && name.trim()) {
        Project.createAnimation(name.trim());
    }
});
window.fileAPI.onMenuEvent('menu:delete-anim', () => {
    const name = Project.currentAnimName;
    if (!name) return;
    if (confirm('Delete animation "' + name + '"?')) {
        delete Project.animFile.animations[name];
        Project.currentAnimName = null;
        Project.markDirty();
        Project.emit('animation-changed', null);
    }
});
```

Add Ctrl+S and Ctrl+E to `_wireKeyboard()`:
```js
case 's': case 'S':
    if (e.ctrlKey) { this.saveAnimFile(); e.preventDefault(); }
    else if (!e.ctrlKey) { Project.setGizmoMode('scale'); e.preventDefault(); }
    break;
case 'e': case 'E':
    if (e.ctrlKey) { this.exportAnimFile(); e.preventDefault(); }
    break;
```

Add methods:
```js
async openAnimFile() {
    const filePath = await window.fileAPI.openFileDialog({
        title: 'Open Animation File',
        filters: [
            { name: 'EriAnim JSON', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (!filePath) return;

    try {
        const jsonStr = await window.fileAPI.readFile(filePath);
        const animFile = EriAnimExporter.parseAnimFile(jsonStr);

        Project.animFile = animFile;
        Project.animFilePath = filePath;
        Project.dirty = false;

        // Select first animation
        const names = animFile.getAnimationNames();
        if (names.length > 0) {
            Project.selectAnimation(names[0]);
        }

        this._updateStatus('Animation loaded: ' + filePath.split(/[/\\]/).pop());
        Project.emit('animation-changed', Project.getCurrentAnim());
    } catch (e) {
        console.error('Failed to load animation file:', e);
        this._updateStatus('Error loading animation: ' + e.message);
    }
},

async saveAnimFile() {
    if (!Project.animFilePath) {
        return this.saveAnimFileAs();
    }

    const { json, warnings } = EriAnimExporter.export(Project.animFile, Project.model);

    if (warnings.length > 0) {
        console.warn('Export warnings:', warnings);
    }

    try {
        await window.fileAPI.writeFile(Project.animFilePath, json);
        Project.dirty = false;
        this._updateStatus('Saved: ' + Project.animFilePath.split(/[/\\]/).pop());
    } catch (e) {
        this._updateStatus('Error saving: ' + e.message);
    }
},

async saveAnimFileAs() {
    const filePath = await window.fileAPI.saveFileDialog({
        title: 'Save Animation File',
        defaultPath: Project.animFile.modelId
            ? Project.animFile.modelId.replace(/[:/]/g, '_') + '.erianim.json'
            : 'animation.erianim.json',
        filters: [
            { name: 'EriAnim JSON', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!filePath) return;

    Project.animFilePath = filePath;
    return this.saveAnimFile();
},

async exportAnimFile() {
    // Ask for model ID if not set
    if (!Project.animFile.modelId) {
        const modelId = prompt('Model ID (e.g. "eriniumfaction:block/lootbox"):');
        if (!modelId) return;
        Project.animFile.modelId = modelId;
    }

    const { json, warnings } = EriAnimExporter.export(Project.animFile, Project.model);

    if (warnings.length > 0) {
        const proceed = confirm(
            'Export warnings:\n\n' + warnings.join('\n') + '\n\nExport anyway?'
        );
        if (!proceed) return;
    }

    const filePath = await window.fileAPI.saveFileDialog({
        title: 'Export .erianim.json',
        defaultPath: Project.animFile.modelId.replace(/[:/]/g, '_') + '.erianim.json',
        filters: [
            { name: 'EriAnim JSON', extensions: ['json'] }
        ]
    });

    if (!filePath) return;

    try {
        await window.fileAPI.writeFile(filePath, json);
        this._updateStatus('Exported: ' + filePath.split(/[/\\]/).pop());
    } catch (e) {
        this._updateStatus('Export error: ' + e.message);
    }
}
```

---

- [ ] Step 4: Add onion skinning to `src/viewport/viewport.js`

Add the `setOnionSkinning` method and supporting state. Onion skinning clones the model meshes at tick-5 and tick+5 with semi-transparent materials.

```js
// Add to Viewport object:

/** @type {boolean} */
_onionSkinEnabled: false,
/** @type {THREE.Group[]} Ghost groups */
_onionGhosts: [],

setOnionSkinning(enabled) {
    this._onionSkinEnabled = enabled;
    this._clearOnionGhosts();
    if (enabled) {
        this._updateOnionGhosts();
    }
},

_clearOnionGhosts() {
    for (const ghost of this._onionGhosts) {
        this.modelRoot.parent.remove(ghost);
        // Dispose all materials in ghost
        ghost.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }
    this._onionGhosts = [];
},

_updateOnionGhosts() {
    if (!this._onionSkinEnabled) return;
    this._clearOnionGhosts();

    // Create ghosts at tick-5 and tick+5
    const offsets = [-5, 5];
    const opacities = [0.12, 0.12];
    const colors = [0x89b4fa, 0xf38ba8]; // blue for past, red for future

    for (let i = 0; i < offsets.length; i++) {
        const ghostTick = Project.currentTick + offsets[i];
        if (ghostTick < 0 || ghostTick > Project.getDuration()) continue;

        const ghost = this.modelRoot.clone(true);

        // Make all materials semi-transparent with tint
        ghost.traverse(obj => {
            if (obj.isMesh) {
                if (Array.isArray(obj.material)) {
                    obj.material = obj.material.map(m => {
                        const clone = new THREE.MeshBasicMaterial({
                            color: colors[i],
                            transparent: true,
                            opacity: opacities[i],
                            wireframe: false,
                            depthWrite: false
                        });
                        return clone;
                    });
                } else {
                    obj.material = new THREE.MeshBasicMaterial({
                        color: colors[i],
                        transparent: true,
                        opacity: opacities[i],
                        wireframe: false,
                        depthWrite: false
                    });
                }
            }
        });

        // Apply animation at the ghost tick
        // (This requires temporarily changing the tick, applying, then reverting)
        // To avoid side effects, we manually compute transforms here
        const anim = Project.getCurrentAnim();
        if (anim) {
            for (const [groupName, track] of Object.entries(anim.tracks)) {
                const gGroup = this._findGroupInHierarchy(ghost, groupName);
                if (!gGroup) continue;

                if (track.rotation.length > 0) {
                    const val = AnimationPreview._interpolateTrack(track.rotation, ghostTick);
                    gGroup.rotation.set(
                        val[0] * Math.PI / 180,
                        val[1] * Math.PI / 180,
                        val[2] * Math.PI / 180
                    );
                }
                if (track.scale.length > 0) {
                    const val = AnimationPreview._interpolateTrack(track.scale, ghostTick);
                    gGroup.scale.set(val[0], val[1], val[2]);
                }
            }
        }

        this.scene.add(ghost);
        this._onionGhosts.push(ghost);
    }
},

_findGroupInHierarchy(root, name) {
    if (root.name === name) return root;
    for (const child of root.children) {
        const found = this._findGroupInHierarchy(child, name);
        if (found) return found;
    }
    return null;
}
```

Add onion ghost update to the tick-changed listener in `app.js`:
```js
Project.on('tick-changed', () => {
    if (Viewport._onionSkinEnabled) {
        Viewport._updateOnionGhosts();
    }
});
```

---

- [ ] Step 5: Enable Save/Export buttons when model is loaded

In `src/app.js`, in the `Project.on('model-changed', ...)` handler or after loading:
```js
Project.on('model-changed', () => {
    document.getElementById('btn-save').disabled = false;
    document.getElementById('btn-export').disabled = false;
});

Project.on('animation-changed', () => {
    const hasAnim = Project.getCurrentAnim() != null;
    ['btn-play', 'btn-start', 'btn-prev', 'btn-next', 'btn-end', 'btn-loop'].forEach(id => {
        document.getElementById(id).disabled = !hasAnim;
    });
});
```

---

- [ ] Step 6: Verify

```bash
cd "D:/Mods Minecraft/EriniumFaction/tools/erianim-editor" && npm start
```

**Verification checklist:**
1. Load model, create animation, add keyframes
2. File > Export .erianim.json -- prompts for model ID if missing
3. Exported JSON matches EriAnimParser schema exactly (format_version, model, animations, tracks, events)
4. Default values are omitted (no endBehavior:"freeze", no blendIn:0, etc.)
5. File > Save saves to disk; File > Save As prompts for path
6. Ctrl+S saves; subsequent Ctrl+S overwrites same file
7. File > Open Animation File loads a previously saved .erianim.json
8. View > Onion Skinning shows ghost poses at tick-5 (blue) and tick+5 (red)
9. Warnings shown for out-of-range ticks or unknown group names
10. Validate the exported JSON by loading it back into the editor -- all keyframes, events, and settings preserved

**Final validation:** Export a .erianim.json, copy it to `src/main/resources/assets/eriniumfaction/animations/block/`, load it in the Minecraft mod via `EriAnimParser.parse()`, and verify the animation plays correctly in-game.
