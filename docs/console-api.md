# Piskel Console UI and API v2

The primary way to use Piskel automation is the built-in **Console API** panel. Open **`>_ API`** in the right toolbar; DevTools is not required.

The panel exposes every registered Piskel command, complete drawing and settings state, command chains, history, structured output, and live change events. It accepts declarative commands and JSON only—never arbitrary JavaScript.

## Run several commands at once

The panel opens in `chain` mode. Put one command on each line, followed by an optional one-line JSON object:

```text
# Blank lines and full-line comments are ignored.
app.state
document.colors {}
frame.read {"layer":0,"frame":0,"format":"sparse"}
```

Select **Run** or press `Ctrl/Command + Enter`. All lines run sequentially from top to bottom with one execution.

A more complete chain can create and verify a drawing:

```text
document.new {"name":"Robot","width":16,"height":16,"fps":8,"frameCount":2,"layerNames":["Background","Robot"]}
draw.clear {"layer":0,"frame":0,"color":"#222034"}
draw.clear {"layer":0,"frame":1,"color":"#222034"}
draw.rect {"layer":1,"frame":0,"x":4,"y":3,"width":8,"height":10,"color":"#5fcde4","fill":true}
draw.pixels {"layer":1,"frame":0,"pixels":[{"x":6,"y":7,"color":"#ffffff"},{"x":9,"y":7,"color":"#ffffff"}]}
frame.read {"layer":1,"frame":0,"format":"sparse"}
```

### Chain syntax

```text
command.name {"optional":"JSON arguments"}
```

Rules:

- One command per physical line
- Arguments must be a JSON object on the same line
- Omit arguments when the command accepts `{}`
- Empty lines and lines beginning with `#` are ignored
- A trailing semicolon is optional
- Command names and JSON structure are validated before the first command runs
- At most 1,000 commands can run in one chain
- Commands run in order and stop at the first runtime/validation error
- A failed chain does not roll back commands that already completed

The **Format chain** button removes comments and optional semicolons, then normalizes each line. Use **Chain example** to restore a safe, read-only sample.

A successful chain returns:

```json
{
  "count": 3,
  "results": [
    {
      "line": 1,
      "command": "app.state",
      "result": {}
    }
  ]
}
```

Each mutation remains its own undo/history operation. “One execution” means one click for an ordered sequence, not one atomic transaction.

## Run one command

For a large or multiline JSON payload, choose a normal command in the **Command** field and put its JSON object in **Arguments**.

Example:

- Command: `draw.rect`
- Arguments:

```json
{
  "x": 2,
  "y": 2,
  "width": 12,
  "height": 12,
  "color": "#ff004d",
  "fill": true
}
```

Select **Format JSON** to format the object, then run it. The argument field defaults to `{}` when left empty.

The older `batch` pseudo-command remains available for JSON-array workflows:

```json
[
  { "command": "layer.add", "args": { "name": "Effects" } },
  { "command": "frame.add", "args": {} }
]
```

For interactive use, `chain` is shorter and is the recommended mode.

## Discover commands in the panel

Type in the **Command** field to search the complete registry. Selecting a command displays its argument signature, description, and whether it mutates the app.

The panel also provides these utility commands:

| Command | Arguments | Purpose |
| --- | --- | --- |
| `chain` | One command per line | Run an ordered command script |
| `help` | `{"filter":"draw"}` | List commands, optionally by group |
| `capabilities` | `{}` | Show groups, formats, settings, events, and limits |
| `batch` | JSON command array | Run the original array batch format |
| `whenIdle` | `{}` | Wait for queued API work and return current state |
| `waitForChange` | `{"since":0,"type":"document","timeout":30000}` | Wait for a matching public event |

Useful discovery input:

```text
help {"filter":"document"}
help {"filter":"file"}
capabilities
```

Chains accept all registered dotted commands plus `help`, `capabilities`, `whenIdle`, and `waitForChange`. The `chain` and JSON-array `batch` utilities cannot be nested.

## Panel controls

| Control | Behavior |
| --- | --- |
| **Chain example** | Load the default read-only chain |
| **App state** | Load `app.state` |
| **Full snapshot** | Load a complete restorable state read |
| **Document** | Load all layers, frames, and readable pixels |
| **Settings** | Load all current app settings |
| **Commands** | Load `help` |
| `Ctrl/Command + Enter` | Run current input |
| `Alt + Up/Down` | Navigate command history |
| **Copy latest** | Copy the complete latest result/error |
| **Download** | Download the complete latest result/error as text |
| **Follow changes** | Append live public API events |

The panel retains up to 50 history entries for the browser session and up to 100 output entries. A rendered entry is truncated after 250,000 characters, but copy/download retains its complete value.

## Read current state

Use a chain to inspect related state in one run:

```text
app.state
document.state {"pixels":"none"}
file.state {"includeSerialized":false}
settings.state
history.state
selection.state {"includePixels":true}
view.state
palette.state
```

`app.state` includes:

- Document metadata, dimensions, FPS, selected layer/frame, and hashes
- File identity, model version, dirty/saving state, and hash
- Every current app setting
- History, selection, view, palette, tool, colors, and pen size
- API revision and queue state

Request exact data only when needed:

```text
frame.read {"layer":0,"frame":0,"format":"rows"}
frame.read {"layer":0,"frame":0,"format":"sparse"}
document.read {"pixels":"all","format":"uint32"}
app.snapshot {"includePixels":"all","pixelFormat":"uint32","includeSerialized":true,"includePalettes":true}
```

Returned objects are detached, JSON-safe copies. Editing output text does not change the drawing. To restore an edited structured document, run `document.write` as a single command and pass the edited document in its JSON arguments.

### Pixel formats

| Format | Shape | Best use |
| --- | --- | --- |
| `rows` | `pixels[y][x]` color strings | Human-readable inspection |
| `flat` | Row-major color strings | Simple full-frame processing |
| `sparse` | Non-transparent `{x,y,color}` entries | Small reads and patches |
| `uint32` | Exact row-major internal RGBA integers | Lossless round trips |

Indexes start at `0`. Layer `0` is the bottom layer, and pixel `(0, 0)` is the top-left corner.

## Command groups

| Group | Registered commands |
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

Use the panel's `help` command for current arguments and return details instead of relying on copied signatures.

## Common UI recipes

### Layers, frames, and drawing

```text
layer.add {"name":"Highlights"}
layer.update {"layer":1,"name":"Character","opacity":0.9}
frame.add
frame.duplicate {"frame":0}
frame.move {"from":1,"to":2}
draw.clear {"layer":1,"frame":0,"color":"transparent"}
draw.ellipse {"layer":1,"frame":0,"x":2,"y":2,"width":8,"height":8,"color":"#ffffff","fill":false}
draw.replaceColor {"from":"#ffffff","to":"#ffcc00","scope":"document"}
app.state
```

Direct drawing commands can target an unselected layer/frame without changing the current selection. A direct draw or `frame.write` validates its complete pixel change before committing one history snapshot.

### Native tools and transforms

```text
tool.select {"id":"tool-vertical-mirror-pen"}
tool.colors {"primary":"#ffcc00","secondary":"transparent"}
tool.penSize {"size":2}
tool.stroke {"points":[{"x":4,"y":4},{"x":8,"y":12}]}
transform.apply {"id":"tool-flip","shiftKey":true}
tool.state
```

`tool.stroke` uses the selected tool's native press, move, and release behavior. Do not run it during an active real pointer gesture.

### Selection and API clipboard

```text
selection.create {"x":4,"y":4,"width":8,"height":8}
selection.copy
selection.move {"dx":4,"dy":0,"moveContent":true}
selection.paste {"offsetX":0,"offsetY":8,"clip":true}
selection.commit
selection.state
```

The API clipboard is kept in memory and does not require operating-system clipboard permission.

### Settings

```text
settings.schema
settings.set {"key":"GRID_ENABLED","value":true}
settings.setMany {"values":{"GRID_COLOR":"#ffffff","GRID_SPACING":8,"ONION_SKIN":true,"PEN_SIZE":3}}
settings.read
```

`settings.setMany` validates all supplied values before applying any of them. Use `settings.reset {"key":"GRID_ENABLED"}` to restore one default or `settings.reset` to restore all supported settings.

### Import, export, and storage

```text
file.state
file.export {"format":"png","scale":4,"columns":4,"visibleOnly":true,"download":true,"name":"sprite"}
file.export {"format":"gif","scale":4,"repeat":true,"download":true,"name":"animation"}
storage.capabilities
storage.save {"target":"browser","name":"Robot"}
storage.list
```

Export formats are `piskel`, `png`, `gif`, `zip`, `pixi`, and `c`. Set `download:true` only when a browser download is intended.

For `.piskel` or image import, select `file.import`/`file.importImage` as a single command and paste the serialized object or trusted base64 data URL into the JSON editor. Remote image URLs are intentionally rejected.

Browser save targets are `browser`, `download`, `desktop`, and `gallery`. Desktop and gallery availability depends on the running build and authentication; inspect `storage.capabilities` first.

### View and UI

```text
view.zoom {"value":16}
view.pan {"dx":2,"dy":-1}
view.reset
ui.notify {"message":"Command chain complete","hideDelay":2000}
ui.state
```

A chain can open another settings panel or close the Console panel through `ui.settings`, but subsequent commands still continue in the API queue. Popup windows and native prompts remain subject to browser policy.

## Follow live changes

Enable **Follow changes** to append events caused by either normal editor interactions or API commands.

Event types are:

- `document`
- `settings`
- `history`
- `selection`
- `palette`
- `tool`
- `view`
- `save`
- `ui`
- `change` (catch-all)

Read the bounded event log from the panel:

```text
app.state
app.changes {"since":0}
```

Use the `waitForChange` utility as a standalone panel command when waiting for future activity.

## Programmatic API (secondary interface)

Trusted browser automation can call the same registry through `window.piskelAPI`:

```js
const api = window.piskelAPI;
console.table(api.help("draw"));

await api.draw.rect({
  x: 2,
  y: 2,
  width: 12,
  height: 12,
  color: "#ff004d",
  fill: true
});
```

Registered namespaced methods and `execute` are equivalent:

```js
await api.execute("draw.rect", {
  x: 2,
  y: 2,
  width: 12,
  height: 12,
  color: "#ff004d",
  fill: true
});
```

All registered commands return a `Promise`; always `await` them. `help()` and `capabilities()` are synchronous. Commands share a sequential queue, and a rejected command does not block later independent commands.

For Playwright:

```js
await page.waitForFunction(() => Boolean(window.piskelAPI));

const result = await page.evaluate(async () => {
  const api = window.piskelAPI;
  await api.document.new({ width: 16, height: 16 });
  await api.draw.pixels({
    pixels: [{ x: 0, y: 0, color: "#ff004d" }]
  });
  return api.frame.read({ format: "sparse" });
});
```

Direct helpers include `batch`, `whenIdle`, `on`, `off`, `once`, `waitForChange`, and `destroy`. Convenience aliases are `getState`, `getDocument`, and `getSettings`.

For an agent workflow centered on the in-app panel, see [`SKILL.md`](../SKILL.md).

## Safety and limits

- Only registered commands run; there is no `eval` path.
- Output never exposes mutable private editor objects.
- The API does not open an HTTP server, WebSocket listener, or cross-origin message bridge.
- Maximum document dimensions: `2048 x 2048`.
- Maximum layers: `256`; maximum frames: `10,000`.
- Maximum total layer-frame pixels: `16,777,216`.
- Maximum chain/batch length: `1,000` commands.
- Image and `.piskel` inputs are limited to 64 MiB.
- Large exports have canvas-dimension and total-pixel guards.
- Native downloads, popups, file pickers, and system clipboard access remain subject to browser permissions.

Run `capabilities` in the panel for the current runtime limits.

## Testing

```sh
node --test tests/api/console-api.test.cjs
npx playwright test tests/e2e/playwright/integration/console-api.spec.ts
npm run lint
npm run build
```

The Node suite covers API and command-chain validation. The Playwright suite covers the running editor and Console UI.
