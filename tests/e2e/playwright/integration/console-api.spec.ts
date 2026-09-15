import { test, expect } from "@playwright/test";
import { openEditor } from "../testutils";

declare global {
  interface Window {
    piskelAPI: any;
  }
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("API discovers commands, draws atomically and restores undo/redo", async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    await api.document.new({ width: 8, height: 8 });
    await api.draw.rect({ x: 1, y: 1, width: 6, height: 6, color: "#ff0000" });
    await api.draw.fill({ x: 2, y: 2, color: "#00ff00" });
    const before = await api.frame.read();
    await api.history.undo();
    const undone = await api.frame.read();
    await api.history.redo();
    const redone = await api.frame.read();
    let rejected = false;
    try {
      await api.draw.pixels({
        pixels: [
          { x: 0, y: 0, color: "#ffffff" },
          { x: 99, y: 0, color: "#ffffff" }
        ]
      });
    } catch {
      rejected = true;
    }
    return {
      before,
      undone,
      redone,
      rejected,
      after: await api.frame.read(),
      help: api.help()
    };
  });
  expect(result.before[2][2]).toBe("#00ff00");
  expect(result.undone[2][2]).not.toBe("#00ff00");
  expect(result.redone).toEqual(result.before);
  expect(result.after).toEqual(result.before);
  expect(result.rejected).toBe(true);
  expect(result.help.some((item: any) => item.command === "tool.stroke")).toBe(
    true
  );
});

test("layers, frames, visibility, resize and file roundtrip", async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    await api.document.new({ width: 4, height: 4, name: "Robot" });
    await api.layer.add({ name: "Face" });
    await api.draw.line({ x1: 0, y1: 0, x2: 3, y2: 3, color: "#123456" });
    await api.frame.duplicate();
    await api.frame.add();
    await api.frame.toggleVisibility({ frame: 0 });
    await api.frame.move({ from: 1, to: 2 });
    const hidden = (await api.app.state()).hiddenFrames;
    await api.frame.remove({ frame: 0 });
    const removed = (await api.app.state()).hiddenFrames;
    await api.document.resize({ width: 6, height: 5 });
    const data = await api.file.export();
    const png = await api.file.export({ format: "png" });
    await api.document.new();
    await api.file.import({ data });
    return {
      state: await api.app.state(),
      hidden,
      removed,
      png,
      rows: await api.frame.read({ layer: 1, frame: 1 })
    };
  });
  expect(result.hidden).toEqual([0]);
  expect(result.removed).toEqual([]);
  expect(result.state).toMatchObject({
    name: "Robot",
    width: 6,
    height: 5,
    frameCount: 2
  });
  expect(result.state.layers).toHaveLength(2);
  expect(result.rows[0][0]).toBe("#123456");
  expect(result.png).toMatch(/^data:image\/png;base64,/);
});

test("native tools, palettes, settings and command errors", async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    await api.document.new({ width: 8, height: 8 });
    await api.tool.select({ id: "tool-pen" });
    await api.tool.colors({ primary: "#abcdef" });
    await api.tool.stroke({
      points: [
        { x: 0, y: 0 },
        { x: 7, y: 7 }
      ]
    });
    const pixels = await api.frame.read();
    const p = await api.palette.save({
      name: "AI palette",
      colors: ["#abcdef", "#123456"]
    });
    await api.palette.select({ id: p.id });
    const palettes = await api.palette.list();
    await api.palette.remove({ id: p.id });
    await api.settings.set({ key: "GRID_ENABLED", value: true });
    const errors = [];
    for (const command of [
      { command: "__proto__" },
      { command: "layer.remove" },
      { command: "frame.remove" },
      {
        command: "draw.line",
        args: { x1: 0.5, y1: 0, x2: 2, y2: 2, color: "#ffffff" }
      },
      { command: "tool.colors", args: { primary: "bad" } }
    ]) {
      try {
        await api.execute(command);
      } catch (e) {
        errors.push(String(e));
      }
    }
    return {
      pixels,
      palettes,
      errors,
      settings: await api.settings.read(),
      state: await api.app.state()
    };
  });
  expect(result.pixels[3][3]).toBe("#abcdef");
  expect(result.palettes.some((p: any) => p.name === "AI palette")).toBe(true);
  expect(result.errors).toHaveLength(5);
  expect(result.settings.GRID_ENABLED).toBe(true);
  expect(result.state.layers).toHaveLength(1);
});

test("Console API v2 exposes complete state, settings, events and lossless file roundtrips", async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    await api.document.new({
      width: 3,
      height: 2,
      name: "V2 state",
      description: "roundtrip",
      fps: 7,
      frameCount: 2,
      layerNames: ["Back", "Front"],
      hiddenFrames: [1]
    });
    const before = await api.app.state();
    await api.draw.pixels({
      layer: 1,
      frame: 1,
      pixels: [{ x: 2, y: 1, color: "#123456" }]
    });
    await api.settings.setMany({
      values: {
        GRID_ENABLED: true,
        DEFAULT_SIZE: { width: 48, height: 24 },
        PEN_SIZE: 3
      }
    });
    await api.tool.colors({ primary: "#abcdef", secondary: "#fedcba" });

    const document = await api.document.read({ format: "uint32" });
    const file = await api.file.read();
    const png = await api.file.export({
      format: "png",
      scale: 1.5,
      columns: 1
    });
    const pixi = await api.file.export({
      format: "pixi",
      scale: 1.5,
      columns: 1
    });
    const cSource = await api.file.export({ format: "c", frames: [1] });
    const createdPalette = await api.palette.save({
      name: "API v2 palette",
      colors: ["#123456", "#abcdef"]
    });
    const gpl = await api.palette.export({
      id: createdPalette.id,
      format: "gpl"
    });
    const importedPalette = await api.palette.import({
      name: "GPL copy",
      data: gpl,
      format: "gpl"
    });
    const changes = await api.app.changes({ since: before.revision });
    const state = await api.app.state();

    document.name = "Restored v2";
    await api.document.write({ document });
    const restored = await api.document.read({ format: "rows" });
    await api.palette.remove({ id: createdPalette.id });
    await api.palette.remove({ id: importedPalette.id });
    await api.settings.reset({ key: "GRID_ENABLED" });
    await api.settings.reset({ key: "DEFAULT_SIZE" });
    await api.settings.reset({ key: "PEN_SIZE" });

    return {
      version: api.version,
      commandCount: api.help().length,
      fileModelVersion: JSON.parse(file.serialized).modelVersion,
      settings: state.settings,
      colors: [state.primaryColor, state.secondaryColor],
      changeTypes: [...new Set(changes.events.map((event) => event.type))],
      pngPrefix: png.slice(0, 22),
      pixiSize: pixi.json.meta.size,
      pixiFrame: pixi.json.frames["V2 state0.png"].frame,
      cSource,
      gpl,
      importedColors: importedPalette.colors,
      restoredName: restored.name,
      restoredPixel: restored.layers[1].frames[1].pixels[1][2]
    };
  });

  expect(result.version).toBe("2.0.0");
  expect(result.commandCount).toBeGreaterThanOrEqual(95);
  expect(result.fileModelVersion).toBe(2);
  expect(result.settings.GRID_ENABLED).toBe(true);
  expect(result.settings.DEFAULT_SIZE).toEqual({ width: 48, height: 24 });
  expect(result.settings.PEN_SIZE).toBe(3);
  expect(result.colors).toEqual(["#abcdef", "#fedcba"]);
  expect(result.changeTypes).toEqual(
    expect.arrayContaining(["document", "settings", "tool"])
  );
  expect(result.pngPrefix).toBe("data:image/png;base64,");
  expect(result.pixiSize).toEqual({ w: 5, h: 6 });
  expect(result.pixiFrame).toEqual({ x: 0, y: 0, w: 5, h: 3 });
  expect(result.cSource).toContain("#define V2_STATE_FRAME_COUNT 1");
  expect(result.gpl).toContain("GIMP Palette");
  expect(result.importedColors).toEqual(["#123456", "#abcdef"]);
  expect(result.restoredName).toBe("Restored v2");
  expect(result.restoredPixel).toBe("#123456");
});

test("Console API v2 selection clipboard and browser persistence are deterministic", async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    const name = `API-storage-${Date.now()}`;
    await api.document.new({ width: 4, height: 4, name });
    await api.draw.pixels({
      pixels: [
        { x: 0, y: 0, color: "#ff0000" },
        { x: 1, y: 0, color: "#00ff00" }
      ]
    });
    await api.selection.create({ x: 0, y: 0, width: 2, height: 1 });
    const copied = await api.selection.copy();
    await api.selection.cut();
    const afterCut = await api.frame.read();
    await api.selection.paste({ offsetX: 1, offsetY: 2 });
    const afterPaste = await api.frame.read();
    await api.selection.dismiss();

    await api.storage.save({ target: "browser" });
    const saved = await api.storage.list();
    await api.document.new({ width: 1, height: 1, name: "temporary" });
    await api.storage.load({ name });
    const loaded = await api.document.read({ pixels: "none" });
    await api.storage.remove({ name });

    return {
      copiedCount: copied.count,
      cut: [afterCut[0][0], afterCut[0][1]],
      pasted: [afterPaste[2][1], afterPaste[2][2]],
      saved: saved.some((item) => item.name === name),
      loaded: { name: loaded.name, width: loaded.width, height: loaded.height },
      clipboardCount: (await api.selection.clipboard()).length
    };
  });

  expect(result.copiedCount).toBe(2);
  expect(result.cut).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
  expect(result.pasted).toEqual(["#ff0000", "#00ff00"]);
  expect(result.saved).toBe(true);
  expect(result.loaded.width).toBe(4);
  expect(result.loaded.height).toBe(4);
  expect(result.loaded.name).toMatch(/^API-storage-/);
  expect(result.clipboardCount).toBe(2);
});

test("built-in Console API panel runs commands, batches, errors and live events", async ({
  page
}) => {
  await page.getByTestId("console-settings-button").click();
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await expect(page.getByTestId("console-status")).toContainText(
    /Ready · v2\.0\.0/
  );
  await expect(page.locator("#application-action-section")).toHaveClass(
    /console-expanded/
  );

  const command = page.getByTestId("console-command-input");
  const args = page.getByTestId("console-args-input");
  const run = page.getByTestId("console-run");
  const output = page.getByTestId("console-output");

  await command.fill("document.new");
  await args.fill(
    JSON.stringify({
      width: 5,
      height: 3,
      name: "Made in UI console",
      layerNames: ["Pixels"]
    })
  );
  await run.click();
  await expect(output.locator(".console-output-success").last()).toContainText(
    "document.new"
  );
  await expect(page.getByTestId("console-status")).toContainText(
    /Completed document\.new/
  );

  await command.fill("batch");
  await args.fill(
    JSON.stringify([
      {
        command: "draw.pixels",
        args: { pixels: [{ x: 2, y: 1, color: "#abcdef" }] }
      },
      { command: "settings.set", args: { key: "GRID_ENABLED", value: true } }
    ])
  );
  await args.press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter"
  );
  await expect(output.locator(".console-output-success").last()).toContainText(
    "batch"
  );

  expect(
    await page.evaluate(async () => {
      const state = await window.piskelAPI.app.state();
      const rows = await window.piskelAPI.frame.read();
      return {
        width: state.width,
        height: state.height,
        name: state.name,
        grid: state.settings.GRID_ENABLED,
        pixel: rows[1][2]
      };
    })
  ).toEqual({
    width: 5,
    height: 3,
    name: "Made in UI console",
    grid: true,
    pixel: "#abcdef"
  });

  await page.locator(".console-follow-events").check();
  await page.evaluate(() =>
    window.piskelAPI.settings.set({ key: "GRID_ENABLED", value: false })
  );
  await expect(output.locator(".console-output-event").last()).toContainText(
    '"type": "settings"'
  );

  await command.fill("app.state");
  await args.fill("{");
  await run.click();
  await expect(output.locator(".console-output-error").last()).toContainText(
    /SyntaxError|JSON/
  );
  await expect(page.getByTestId("console-status")).toContainText(
    "Invalid JSON"
  );

  // The panel dispatches only registered commands; it never evaluates JavaScript.
  await command.fill("window.alert");
  await args.fill("{}");
  await run.click();
  await expect(output.locator(".console-output-error").last()).toContainText(
    "Unknown command: window.alert"
  );

  await page.locator(".console-clear-output").click();
  await expect(output.locator(".console-output-entry")).toHaveCount(0);
});
