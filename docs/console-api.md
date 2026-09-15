# Piskel Console API v2

Piskel exposes a JSON-safe automation facade at `window.piskelAPI` after the editor has initialized. It is available in production and development builds.

Use it to inspect or change drawings, files, settings, layers, frames, palettes, tools, selections, storage, and UI state without reaching into Piskel's private model objects.

## Quick start

```js
const api = window.piskelAPI;

console.log(api.version);       // "2.0.0"
console.table(api.help());      // registered commands and argument schemas
console.log(api.capabilities());

const state = await api.app.state();
await api.draw.pixels({
  pixels: [{ x: 1, y: 1, color: "#ff004d" }]
});
```

All registered commands return a `Promise`; always `await` them. `help()` and `capabilities()` are synchronous discovery helpers.

## Built-in command panel

Select **`>_ API`** in the editor's right toolbar to use the API without opening DevTools.

The panel includes:

- A searchable command field with argument help
- A JSON argument editor and formatting control
- Presets for app state, complete snapshots, documents, settings, and help
- `Ctrl/Command + Enter` execution
- Command history with `Alt + Up/Down`
- Success, error, and change-event output
- Copy and download actions for the complete latest result
- A **Follow changes** live event stream

The panel accepts only registered command names and JSON arguments. It does not evaluate arbitrary JavaScript.

In addition to registered commands, the panel provides `help`, `batch`, `capabilities`, `whenIdle`, and `waitForChange` helpers.

## Discovery

Treat runtime discovery as the canonical command reference:

```js
api.help();            // all registered commands
api.help("document"); // one command group
api.capabilities();    // groups, formats, events, settings, and limits
```

Each `help()` entry contains:

```js
{
  command: "draw.rect",
  group: "draw",
  args: "{x,y,width,height,color,fill=false,layer?,frame?}",
  description: "...",
  mutates: true,
  returns: "JSON"
}
```

## Calling commands

Namespaced, string, and object forms are equivalent:

```js
await api.draw.rect({
  x: 2,
  y: 2,
  width: 12,
  height: 12,
  color: "#ff004d",
  fill: true
});

await api.execute("draw.rect", {
  x: 2,
  y: 2,
  width: 12,
  height: 12,
  color: "#ff004d",
  fill: true
});

await api.execute({
  command: "draw.rect",
  args: {
    x: 2,
    y: 2,
    width: 12,
    height: 12,
    color: "#ff004d",
    fill: true
  }
});
```

Commands share a sequential queue. A rejected command does not block later commands.

Run several commands in order with `batch()`:

```js
const results = await api.batch([
  { command: "layer.add", args: { name: "Effects" } },
  {
    command: "draw.ellipse",
    args: {
      x: 2,
      y: 2,
      width: 8,
      height: 8,
      color: "#ffffff"
    }
  }
]);

await api.whenIdle();
```

A batch stops at its first failure. It does not roll back commands that already completed.

## Complete state

`app.state()` returns a lightweight snapshot of the live editor:

```js
const state = await api.app.state();

state.document;  // metadata, dimensions, FPS, layers, frames, and hash
state.file;      // file identity, model version, save status, and hash
state.settings;  // every current app setting
state.history;   // undo/redo availability and queue position
state.selection;
state.view;
state.palette;
```

Pixels and serialized file data are opt-in:

```js
const currentPixels = await api.app.state({
  includePixels: "current",
  pixelFormat: "sparse"
});

const complete = await api.app.snapshot({
  includePixels: "all",
  pixelFormat: "uint32",
  includeSerialized: true,
  includePalettes: true
});
```

Returned values are detached, JSON-safe copies. Mutating a returned object does not mutate the editor.

Convenience aliases are available:

```js
await api.getState();
await api.getDocument();
await api.getSettings();
```

## Command groups

| Group | Commands |
| --- | --- |
| App | `app.state`, `snapshot`, `capabilities`, `changes` |
| Document | `document.new`, `read`, `state`, `write`, `update`, `resize`, `colors` |
| File | `file.state`, `read`, `export`, `import`, `importImage` |
| Storage | `storage.capabilities`, `list`, `save`, `load`, `remove` |
| Backup | `backup.list`, `snapshots`, `create`, `load`, `remove` |
| Layer | `layer.list`, `read`, `select`, `add`, `update`, `remove`, `duplicate`, `mergeDown`, `up`, `down`, `move` |
| Frame | `frame.list`, `read`, `write`, `select`, `add`, `remove`, `duplicate`, `move`, `toggleVisibility`, `setVisibility` |
| Direct drawing | `draw.pixels`, `clear`, `line`, `rect`, `ellipse`, `fill`, `replaceColor`, `image` |
| Native tools | `tool.list`, `state`, `select`, `colors`, `swapColors`, `resetColors`, `pick`, `penSize`, `stroke` |
| Selection | `selection.read`, `state`, `create`, `copy`, `cut`, `paste`, `move`, `commit`, `erase`, `dismiss`, `clipboard` |
| Transform | `transform.apply` |
| Palette | `palette.list`, `state`, `get`, `save`, `import`, `export`, `select`, `remove` |
| Settings | `settings.read`, `state`, `schema`, `set`, `setMany`, `reset` |
| History | `history.state`, `undo`, `redo` |
| View | `view.state`, `zoom`, `pan`, `reset`, `popupPreview` |
| UI | `ui.state`, `settings`, `dialog`, `notify` |
| Shortcut | `shortcut.list`, `set`, `reset`, `trigger` |

Use `api.help("group")` for current argument and return details instead of relying on a copied static signature.

## Drawing and animation

Indexes are zero-based. Layer `0` is the bottom layer, and pixel `(0, 0)` is the top-left corner.

```js
await api.document.new({
  name: "Robot",
  description: "Created with the Console API",
  width: 32,
  height: 32,
  fps: 8,
  frameCount: 2,
  layerNames: ["Background", "Robot"]
});

await api.layer.select({ layer: 0 });
await api.draw.clear({ color: "#222034" });
await api.frame.select({ frame: 1 });
await api.draw.clear({ color: "#222034" });

await api.layer.select({ layer: 1 });
await api.frame.select({ frame: 0 });
await api.draw.rect({
  x: 8,
  y: 6,
  width: 16,
  height: 20,
  color: "#5fcde4",
  fill: true
});
await api.frame.duplicate({ frame: 0 });
```

Direct drawing commands can target an unselected `layer` and `frame` without changing the current selection. Their validation completes before pixel data is committed.

### Structured pixels

`frame.read`, `frame.write`, `document.read`, and `document.write` support four formats:

| Format | Shape |
| --- | --- |
| `rows` | `pixels[y][x]` color strings |
| `flat` | Row-major color strings |
| `sparse` | Non-transparent `{x, y, color}` entries |
| `uint32` | Exact row-major internal RGBA integers |

Use `uint32` for compact, lossless round trips and `sparse` for small patches.

```js
const document = await api.document.read({
  pixels: "all",
  format: "uint32"
});

document.name = "Robot copy";
await api.document.write({ document });

await api.frame.write({
  format: "sparse",
  clear: false,
  pixels: [
    { x: 1, y: 1, color: "#ff0000" },
    { x: 2, y: 1, color: "transparent" }
  ]
});
```

`document.write` validates the complete replacement before changing the current drawing.

### Native tools and transforms

Use `tool.stroke` when native tool behavior matters:

```js
const tools = await api.tool.list();

await api.tool.select({ id: "tool-vertical-mirror-pen" });
await api.tool.colors({ primary: "#ffcc00", secondary: "transparent" });
await api.tool.penSize({ size: 2 });
await api.tool.stroke({
  points: [
    { x: 4, y: 4 },
    { x: 8, y: 12 }
  ]
});

await api.transform.apply({ id: "tool-flip", shiftKey: true });
```

`tool.stroke` follows the native press, move, and release lifecycle. Do not run it while the user is performing an active pointer gesture.

## Settings

Read all settings or inspect the writable schema:

```js
const values = await api.settings.read();
const schema = await api.settings.schema();

await api.settings.set({ key: "GRID_ENABLED", value: true });
await api.settings.setMany({
  values: {
    GRID_COLOR: "#ffffff",
    GRID_SPACING: 8,
    DEFAULT_SIZE: { width: 64, height: 64 },
    ONION_SKIN: true,
    PEN_SIZE: 3
  }
});

await api.settings.reset({ key: "GRID_ENABLED" });
```

`settings.setMany` validates every supplied value before applying any of them. Shortcut mappings use the separate `shortcut` group.

## Import, export, and persistence

Export formats are `piskel`, `png`, `gif`, `zip`, `pixi`, and `c`:

```js
const file = await api.file.read();
const png = await api.file.export({
  format: "png",
  scale: 4,
  columns: 4,
  visibleOnly: true
});
const gif = await api.file.export({ format: "gif", scale: 4, repeat: true });
const pixi = await api.file.export({ format: "pixi", columns: 4 });

await api.file.import({ data: file.serialized });
```

Set `download: true` to invoke the browser download flow. Binary exports return data URLs; Pixi export returns `{image, json}`.

Image import accepts base64 PNG, JPEG, BMP, WebP, animated GIF, and spritesheet data URLs:

```js
await api.file.importImage({
  data: "data:image/png;base64,...",
  mode: "spritesheet",
  name: "Walk",
  frameWidth: 16,
  frameHeight: 16
});
```

Remote image URLs are intentionally rejected. Fetch trusted data separately and provide a data URL.

Browser persistence and backup commands use the editor's existing services:

```js
await api.storage.save({ target: "browser", name: "Robot" });
const saved = await api.storage.list();
await api.storage.load({ name: "Robot" });
await api.storage.remove({ name: "Robot" });

const sessions = await api.backup.list();
```

Available save targets are `browser`, `download`, `desktop`, and `gallery`. Desktop and gallery depend on the running build and authentication state; inspect `storage.capabilities()` first.

## Selection and API clipboard

The API clipboard is in memory and does not require operating-system clipboard permission:

```js
await api.selection.create({ x: 4, y: 4, width: 8, height: 8 });
await api.selection.copy();
await api.selection.move({ dx: 4, dy: 0, moveContent: true });
await api.selection.paste({ offsetX: 0, offsetY: 8, clip: true });
await api.selection.commit();
```

## UI automation

```js
await api.view.zoom({ value: 16 });
await api.view.pan({ dx: 2, dy: -1 });
await api.view.reset();

await api.ui.settings({ panel: "console" });
await api.ui.settings({ panel: null });
await api.ui.dialog({ id: "cheatsheet" });
await api.ui.dialog({ open: false });
await api.ui.notify({ message: "Done", hideDelay: 2000 });
```

`ui.settings` accepts `user`, `resize`, `save`, `export`, `import`, `localstorage`, `console`, or `null`. Popup windows and native file or clipboard prompts remain subject to browser permissions.

## Change events

The API exposes a bounded change log and live subscriptions. Events caused through either the normal UI or the API are observable.

```js
const initial = await api.app.state();

const unsubscribe = api.on("document", event => {
  console.log(event.revision, event.details);
});

await api.draw.pixels({
  pixels: [{ x: 0, y: 0, color: "#ff0000" }]
});

const changes = await api.app.changes({ since: initial.revision });
unsubscribe();

const nextSettingsChange = await api.waitForChange({
  since: initial.revision,
  type: "settings",
  timeout: 30000
});
```

Event types are `document`, `settings`, `history`, `selection`, `palette`, `tool`, `view`, `save`, and `ui`, plus the catch-all `change` event. Lifecycle helpers include `on`, `off`, `once`, `waitForChange`, and `destroy`.

## Browser automation

```js
await page.waitForFunction(() => Boolean(window.piskelAPI));

const result = await page.evaluate(async () => {
  const api = window.piskelAPI;
  await api.document.new({ width: 16, height: 16 });
  await api.draw.rect({
    x: 2,
    y: 2,
    width: 12,
    height: 12,
    color: "#ff004d",
    fill: true
  });
  return api.document.read({ pixels: "current", format: "sparse" });
});
```

For a workflow optimized for AI agents, see [`SKILL.md`](../SKILL.md).

## Safety and limits

- Only registered commands are executable; the API has no `eval` path.
- Commands do not expose mutable private editor objects.
- There is no HTTP server, WebSocket listener, or cross-origin `postMessage` bridge.
- A direct draw or frame-write command creates one undo snapshot.
- Import and history commands wait for asynchronous decode or restore work.
- Maximum dimensions: `2048 x 2048`.
- Maximum layers: `256`; maximum frames: `10,000`.
- Maximum total layer-frame pixels: `16,777,216`.
- Maximum batch length: `1,000` commands.
- Image and `.piskel` inputs are limited to 64 MiB.
- Large image exports have canvas-dimension and total-pixel guards.

Use `api.capabilities().limits` as the runtime source of truth.

## Testing

```sh
node --test tests/api/console-api.test.cjs
npx playwright test tests/e2e/playwright/integration/console-api.spec.ts
npm run lint
npm run build
```

The Node suite covers API validation and model behavior. The Playwright suite covers integration with the running editor and the built-in command panel.
