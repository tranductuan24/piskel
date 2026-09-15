---
name: piskel-console-api
description: Inspect, create, edit, import, export, and verify Piskel pixel art through window.piskelAPI v2 or the built-in JSON command panel.
---

# Piskel Console Automation

Use this skill when an agent needs to inspect or modify a drawing in a running Piskel editor. Prefer the public Console API over DOM clicks or private `pskl.*` objects.

## Preconditions

Wait until the editor and API are ready:

```js
await page.waitForFunction(() => Boolean(window.piskelAPI));
```

When operating manually, open **`>_ API`** in the right toolbar. Enter a registered command and a JSON argument object, then select **Run** or press `Ctrl/Command + Enter`.

## Required workflow

1. **Discover** instead of guessing command signatures.
2. **Inspect** the current document and relevant settings.
3. **Plan** zero-based layer, frame, and pixel coordinates.
4. **Execute** commands sequentially and await every result.
5. **Verify** dimensions, metadata, and changed pixels.
6. **Export or persist** only when requested.

```js
const result = await page.evaluate(async () => {
  const api = window.piskelAPI;
  const capabilities = api.capabilities();
  const help = api.help("draw");
  const before = await api.app.state();

  // Perform requested operations here.

  await api.whenIdle();
  const after = await api.app.state();
  return { capabilities, help, before, after };
});
```

## Core rules

- Use only `window.piskelAPI`; do not mutate private model/controller objects.
- Every registered command is asynchronous. Always use `await`.
- `help()` and `capabilities()` are synchronous.
- Coordinates, layer indexes, and frame indexes start at `0`.
- Layer `0` is the bottom layer; `(0, 0)` is the top-left pixel.
- Colors are `#RRGGBB` or `transparent` unless discovery says otherwise.
- Use `uint32` pixels for lossless document round trips.
- Use `sparse` pixels for small reads and patches.
- A `batch()` is ordered but not transactional: completed commands remain if a later command fails.
- Use `document.write` when an entire validated replacement must be atomic.
- Do not run `tool.stroke` during a real user pointer gesture.
- Do not pass remote image URLs. Supply trusted base64 data URLs.
- Do not trigger downloads, popups, native pickers, or persistent saves unless requested.

## Discovery

Never invent a command or argument name:

```js
const allCommands = window.piskelAPI.help();
const fileCommands = window.piskelAPI.help("file");
const capabilities = window.piskelAPI.capabilities();
```

Useful groups include `app`, `document`, `file`, `layer`, `frame`, `draw`, `tool`, `selection`, `transform`, `palette`, `settings`, `history`, `storage`, `backup`, `view`, `ui`, and `shortcut`.

## Inspect state

Use a lightweight state read first:

```js
const state = await window.piskelAPI.app.state();
```

It includes document/file metadata, all app settings, history, selection, tool, palette, and viewport state.

Request pixels only when needed:

```js
const current = await window.piskelAPI.document.read({
  pixels: "current",
  format: "sparse"
});

const complete = await window.piskelAPI.app.snapshot({
  includePixels: "all",
  pixelFormat: "uint32",
  includeSerialized: true,
  includePalettes: true
});
```

## Create or edit a drawing

A deterministic creation sequence:

```js
await window.piskelAPI.document.new({
  name: "Sprite",
  width: 16,
  height: 16,
  fps: 8,
  frameCount: 2,
  layerNames: ["Background", "Subject"]
});

await window.piskelAPI.draw.clear({
  layer: 0,
  frame: 0,
  color: "#222034"
});

await window.piskelAPI.draw.rect({
  layer: 1,
  frame: 0,
  x: 4,
  y: 3,
  width: 8,
  height: 10,
  color: "#5fcde4",
  fill: true
});
```

Use `draw.pixels`, `line`, `rect`, `ellipse`, `fill`, `clear`, `replaceColor`, or `image` for direct deterministic edits. Use `tool.select` plus `tool.stroke` when native pen, mirror, dithering, selection, or other tool behavior is required.

For many ordered edits:

```js
await window.piskelAPI.batch([
  { command: "frame.select", args: { frame: 1 } },
  {
    command: "draw.pixels",
    args: {
      pixels: [{ x: 8, y: 8, color: "#ffffff" }]
    }
  }
]);
```

## Verify work

Do not infer success only from a resolved command. Read back the relevant scope:

```js
const verification = await window.piskelAPI.app.state({
  includePixels: "current",
  pixelFormat: "sparse"
});

if (verification.width !== 16 || verification.height !== 16) {
  throw new Error("Unexpected document dimensions");
}
```

For exact pixel verification:

```js
const rows = await window.piskelAPI.frame.read({
  layer: 1,
  frame: 0,
  format: "rows"
});
```

Compare file or document hashes before and after when only change detection is needed.

## Settings and temporary changes

Discover valid keys, types, ranges, and defaults before writing:

```js
const schema = await window.piskelAPI.settings.schema();
const original = await window.piskelAPI.settings.read({ key: "GRID_ENABLED" });

await window.piskelAPI.settings.set({
  key: "GRID_ENABLED",
  value: true
});

// Restore temporary changes when finished.
await window.piskelAPI.settings.set({
  key: "GRID_ENABLED",
  value: original
});
```

Use `settings.setMany` when all values must validate before any are applied.

## Import, export, and persistence

Read a restorable `.piskel` representation:

```js
const file = await window.piskelAPI.file.read();
await window.piskelAPI.file.import({ data: file.serialized });
```

Export without starting a browser download unless the user explicitly asks for one:

```js
const pngDataUrl = await window.piskelAPI.file.export({
  format: "png",
  scale: 4,
  columns: 4,
  download: false
});
```

Supported export formats are `piskel`, `png`, `gif`, `zip`, `pixi`, and `c`. Inspect `api.help("file")` for format-specific options.

Before persistent storage, inspect availability:

```js
const storage = await window.piskelAPI.storage.capabilities();
```

`desktop` and `gallery` targets depend on the build and authentication state.

## Events and synchronization

Commands already share an ordered queue. Use `whenIdle()` before final verification when other API work may be pending.

To observe UI-originated changes:

```js
const state = await window.piskelAPI.app.state();
const change = await window.piskelAPI.waitForChange({
  since: state.revision,
  type: "document",
  timeout: 30000
});
```

Live event types are `document`, `settings`, `history`, `selection`, `palette`, `tool`, `view`, `save`, and `ui`.

## Error handling

Return command errors with their original name and message. Do not silently retry mutations.

```js
try {
  await window.piskelAPI.execute("draw.pixels", args);
} catch (error) {
  return {
    ok: false,
    name: error.name || "Error",
    message: error.message || String(error)
  };
}
```

After a validation failure, inspect state before deciding whether to retry. Direct drawing and structured replacement commands are atomic; a failed multi-command batch may be partially complete.

## References

- Full API reference: [`docs/console-api.md`](docs/console-api.md)
- Runtime source of truth: `window.piskelAPI.help()`
- API implementation: `src/js/api/ConsoleAPI.js`
- Built-in panel: `src/js/controller/settings/ConsoleController.js`
