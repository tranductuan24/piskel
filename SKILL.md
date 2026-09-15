---
name: piskel-console-ui
description: Use Piskel's built-in Console API panel to inspect, create, edit, verify, import, export, and automate pixel art with safe JSON command chains.
---

# Piskel Console UI Automation

Use the in-app **`>_ API`** panel as the primary automation interface. It runs registered Piskel commands and JSON arguments without DevTools or `eval`.

Use `window.piskelAPI` directly only when the task requires passing one command's returned value into another, handling large binary data, or integrating with external browser automation code.

## Open the panel

Select **`>_ API`** in the right toolbar. The panel opens in `chain` mode with a safe read-only example.

With Playwright:

```ts
await page.getByTestId("console-settings-button").click();
await expect(page.getByTestId("console-panel")).toBeVisible();
```

Main controls:

- **Command**: choose `chain` for multiple commands or a registered command for one operation
- **Command chain / Arguments**: enter chain lines or JSON
- **Run**: execute; shortcut `Ctrl/Command + Enter`
- **Format chain / Format JSON**: validate and normalize input
- **Up/Down**: session history; shortcut `Alt + Up/Down`
- **Copy latest / Download**: preserve the complete latest result
- **Follow changes**: stream public editor events

## Preferred format: command chains

Put one command and an optional one-line JSON object on each line:

```text
app.state
document.colors
frame.read {"layer":0,"frame":0,"format":"sparse"}
```

Full-line comments, blank lines, and trailing semicolons are supported:

```text
# Create a small two-frame sprite.
document.new {"name":"Sprite","width":16,"height":16,"fps":8,"frameCount":2,"layerNames":["Background","Subject"]};
draw.clear {"layer":0,"frame":0,"color":"#222034"}
draw.clear {"layer":0,"frame":1,"color":"#222034"}
draw.rect {"layer":1,"frame":0,"x":4,"y":3,"width":8,"height":10,"color":"#5fcde4","fill":true}
frame.read {"layer":1,"frame":0,"format":"sparse"}
```

Chain rules:

- Arguments must be a JSON object on the same physical line.
- Omitted arguments become `{}`.
- All command names and JSON structures are checked before execution starts.
- Commands run from top to bottom and stop on the first runtime error.
- Completed commands are not rolled back after a later failure.
- Each mutation remains a separate undo operation.
- A chain can contain at most 1,000 commands.
- Chains do not support variables, interpolation, or piping results between lines.
- Registered dotted commands and the helpers `help`, `capabilities`, `whenIdle`, and `waitForChange` are chainable.
- `chain` and `batch` cannot be nested.

## Run a chain through the UI

```ts
const command = page.getByTestId("console-command-input");
const input = page.getByTestId("console-args-input");
const output = page.getByTestId("console-output");

await command.fill("chain");
await input.fill(
  [
    'document.new {"width":8,"height":8,"name":"Agent sprite"}',
    'draw.pixels {"pixels":[{"x":3,"y":3,"color":"#ff004d"}]}',
    'frame.read {"format":"sparse"}'
  ].join("\n")
);
await page.getByTestId("console-run").click();

const result = output.locator(".console-output-success").last();
await expect(result).toContainText('"count": 3');
await expect(result).toContainText('"command": "frame.read"');
```

A chain result contains `count` and ordered `results`. Each result records its source line, command name, and returned value.

## Required workflow

1. **Discover** available commands; never guess names or arguments.
2. **Inspect** current state before mutation.
3. **Plan** zero-based layer, frame, and pixel coordinates.
4. **Run** one chain for independent ordered operations.
5. **Verify** by placing read commands at the end of the same chain.
6. **Persist or download** only when explicitly requested.

A safe inspection chain:

```text
help {"filter":"draw"}
capabilities
app.state
document.state {"pixels":"none"}
settings.state
```

The output of `help` is the source of truth for argument signatures. Useful groups are `app`, `document`, `file`, `layer`, `frame`, `draw`, `tool`, `selection`, `transform`, `palette`, `settings`, `history`, `storage`, `backup`, `view`, `ui`, and `shortcut`.

## State and coordinates

- Layer, frame, and pixel indexes start at `0`.
- Layer `0` is the bottom layer.
- Pixel `(0, 0)` is the top-left corner.
- Colors are normally `#RRGGBB` or `transparent`.
- `app.state` returns document/file metadata, all settings, history, selection, view, palette, tool, colors, and queue state.
- Returned data is a detached JSON-safe copy, not a mutable private model.

Read only the required pixel scope:

```text
frame.read {"layer":1,"frame":0,"format":"rows"}
frame.read {"layer":1,"frame":0,"format":"sparse"}
document.read {"pixels":"all","format":"uint32"}
```

Use:

- `rows` for readable `pixels[y][x]`
- `sparse` for small reads and patches
- `uint32` for compact, lossless round trips

## Verify every mutation

Append an appropriate read command instead of assuming a resolved mutation produced the intended pixels:

```text
draw.pixels {"layer":0,"frame":0,"pixels":[{"x":2,"y":1,"color":"#abcdef"}]}
frame.read {"layer":0,"frame":0,"format":"sparse"}
app.state
```

Check dimensions, layer/frame indexes, metadata, and the exact changed pixels in the chain output. Compare document/file hashes when only change detection is needed.

## Use single-command mode for large input

Select a registered command directly when its JSON is multiline or too large for one chain line. Typical cases include:

- `document.write` with a complete structured document
- `frame.write` with full pixel arrays
- `file.import` with serialized `.piskel` data
- `file.importImage` or `draw.image` with a base64 data URL
- JSON-array `batch`

The command field's inline help shows the required argument schema. Use **Format JSON** before running.

When a returned value must feed another command, run the read command, copy its complete output, edit it, then use a single write command. For complex data dependencies, use the secondary programmatic interface.

## Native tools and selections

Prefer deterministic `draw.*` commands for exact pixel operations. Use native behavior only when required:

```text
tool.select {"id":"tool-vertical-mirror-pen"}
tool.colors {"primary":"#ffcc00","secondary":"transparent"}
tool.penSize {"size":2}
tool.stroke {"points":[{"x":4,"y":4},{"x":8,"y":12}]}
transform.apply {"id":"tool-flip","shiftKey":true}
frame.read {"format":"sparse"}
```

Do not run `tool.stroke` during a real user pointer gesture.

The `selection.*` group uses an in-memory API clipboard and does not require operating-system clipboard permission.

## Settings and persistence

Inspect the schema before changing settings:

```text
settings.schema
settings.read
settings.set {"key":"GRID_ENABLED","value":true}
settings.read {"key":"GRID_ENABLED"}
```

Restore temporary settings when finished. Use `settings.setMany` when all supplied values must validate before any are applied.

Before saving, inspect availability:

```text
storage.capabilities
```

Do not trigger downloads, popups, native pickers, persistent saves, or backup deletion unless requested. `desktop` and `gallery` targets depend on the running build and authentication state.

Remote image URLs are rejected. Provide trusted base64 data URLs in single-command mode.

## Errors

Input errors appear before execution and identify the chain line. Runtime failures use `ChainError` and report:

- The failing line and command
- The number of commands already completed
- The original API error message

Do not silently retry a mutation. After a runtime chain failure, inspect state because earlier lines may have succeeded.

## Live changes

Enable **Follow changes** to observe changes from either the normal editor UI or API commands. Public event types are `document`, `settings`, `history`, `selection`, `palette`, `tool`, `view`, `save`, `ui`, and catch-all `change`.

Use `waitForChange` only when waiting for a future user or external action:

```text
waitForChange {"since":0,"type":"document","timeout":30000}
```

## Secondary programmatic interface

When UI chains cannot express a data dependency, use `window.piskelAPI` from trusted browser automation:

```js
await page.waitForFunction(() => Boolean(window.piskelAPI));

const result = await page.evaluate(async () => {
  const api = window.piskelAPI;
  const document = await api.document.read({ format: "uint32" });
  document.name = "Copy";
  await api.document.write({ document });
  return api.app.state();
});
```

Always `await` registered commands. Do not mutate private `pskl.*` objects or evaluate untrusted JavaScript.

## References

- Console UI and API reference: [`docs/console-api.md`](docs/console-api.md)
- Runtime command source of truth: panel command `help`
- Console UI controller: `src/js/controller/settings/ConsoleController.js`
- Public API implementation: `src/js/api/ConsoleAPI.js`
