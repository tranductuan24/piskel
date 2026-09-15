// Run with node --test tests/api/console-api.test.cjs.
// Real models/controllers, with only browser/UI dependencies replaced by small fakes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function setup() {
  const events = [];
  const subscriptions = new Map();
  const $ = {
    publish: (...args) => {
      events.push(args);
      const [type, extra] = args;
      const callbackArgs = [{ type }].concat(
        Array.isArray(extra) ? extra : extra === undefined ? [] : [extra]
      );
      for (const callback of (subscriptions.get(type) || []).slice()) {
        callback(...callbackArgs);
      }
    },
    subscribe: (type, callback) => {
      subscriptions.set(type, [...(subscriptions.get(type) || []), callback]);
    },
    unsubscribe: (type, callback) => {
      subscriptions.set(
        type,
        (subscriptions.get(type) || []).filter((item) => item !== callback)
      );
    }
  };
  const context = vm.createContext({
    console,
    $,
    jQuery: $,
    setTimeout,
    clearTimeout
  });
  context.window = context;
  const load = (file) =>
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../../src/js", file), "utf8"),
      context
    );
  [
    "utils/core.js",
    "Constants.js",
    "Events.js",
    "utils/Uuid.js",
    "utils/Math.js",
    "model/Frame.js",
    "model/Layer.js",
    "model/Palette.js",
    "model/Piskel.js",
    "model/piskel/Descriptor.js",
    "controller/piskel/PiskelController.js",
    "controller/piskel/PublicPiskelController.js",
    "api/ConsoleAPI.js"
  ].forEach(load);
  const p = context.pskl;
  // Deterministic color parser, not a browser rendering mock.
  context.tinycolor = (value) => ({
    ok: true,
    toRgb: () => {
      const hex = /^#[0-9a-f]{6}$/i.test(value);
      return {
        r: hex ? parseInt(value.slice(1, 3), 16) : 0,
        g: hex ? parseInt(value.slice(3, 5), 16) : 0,
        b: hex ? parseInt(value.slice(5, 7), 16) : 0,
        a: hex ? 1 : 0
      };
    }
  });
  const model = new p.model.Piskel(
    8,
    8,
    12,
    new p.model.piskel.Descriptor("Test", "")
  );
  const layer = new p.model.Layer("Layer 1");
  layer.addFrame(new p.model.Frame(8, 8));
  model.addLayer(layer);
  const core = new p.controller.piskel.PiskelController(model);
  p.service = {
    HistoryService: { SNAPSHOT: "SNAPSHOT" },
    keyboard: { Shortcuts: { MISC: {} } }
  };
  const settingValues = {
    GRID_COLOR: "transparent",
    GRID_ENABLED: false,
    GRID_WIDTH: 1,
    GRID_SPACING: 1,
    MAX_FPS: 24,
    DEFAULT_SIZE: { width: 32, height: 32 },
    CANVAS_BACKGROUND: "lowcont-dark-canvas-background",
    SELECTED_PALETTE: "__current-colors",
    SEAMLESS_OPACITY: 0.3,
    SEAMLESS_MODE: false,
    PREVIEW_SIZE: "original",
    ONION_SKIN: false,
    LAYER_PREVIEW: true,
    LAYER_OPACITY: 0.2,
    EXPORT_SCALE: 1,
    EXPORT_TAB: "gif",
    EXPORT_GIF_REPEAT: true,
    PEN_SIZE: 1,
    RESIZE_SETTINGS: {
      maintainRatio: true,
      resizeContent: false,
      origin: "TOPLEFT"
    },
    COLOR_FORMAT: "hex",
    TRANSFORM_SHOW_MORE: false,
    PREFERENCES_TAB: "misc"
  };
  p.UserSettings = {
    ...Object.fromEntries(Object.keys(settingValues).map((key) => [key, key])),
    KEY_TO_DEFAULT_VALUE_MAP_: JSON.parse(JSON.stringify(settingValues)),
    get: (key) => settingValues[key],
    set: (key, value) => {
      settingValues[key] = JSON.parse(JSON.stringify(value));
    }
  };
  let penSize = 1;
  const palettes = [];
  const paletteService = {
    dynamicPalettes: [],
    getPalettes: () => palettes.slice(),
    getPaletteById: (id) =>
      palettes.find((palette) => palette.id === id) || null,
    savePalette: (palette) => {
      const index = palettes.findIndex((item) => item.id === palette.id);
      if (index === -1) {
        palettes.push(palette);
      } else {
        palettes[index] = palette;
      }
    },
    deletePaletteById: (id) => {
      const index = palettes.findIndex((item) => item.id === id);
      if (index !== -1) {
        palettes.splice(index, 1);
      }
    }
  };
  const app = (p.app = {
    corePiskelController: core,
    paletteService,
    shortcutService: { registerShortcut() {} },
    toolController: { currentSelectedTool: { toolId: "tool-pen" } },
    selectedColorsService: {
      getPrimaryColor: () => "#000000",
      getSecondaryColor: () => "transparent"
    },
    penSizeService: {
      getPenSize: () => penSize,
      setPenSize: (value) => {
        penSize = value;
        settingValues.PEN_SIZE = value;
      }
    }
  });
  app.piskelController = new p.controller.piskel.PublicPiskelController(core);
  app.piskelController.init();
  return { api: p.api.create(app), core, events, settingValues };
}

test("atomic draw validation, snapshot and queue recovery", async () => {
  const { api, core, events } = setup();
  await api.draw.pixels({ pixels: [{ x: 1, y: 1, color: "#ff0000" }] });
  const before = Array.from(core.getCurrentFrame().getPixels());
  const count = events.length;
  await assert.rejects(
    api.draw.pixels({
      pixels: [
        { x: 2, y: 2, color: "#ffffff" },
        { x: -1, y: 0, color: "#ffffff" }
      ]
    }),
    /x must/
  );
  assert.deepEqual(Array.from(core.getCurrentFrame().getPixels()), before);
  assert.equal(events.length, count);
  await assert.rejects(api.execute("__proto__"), /Unknown command/);
  assert.equal((await api.app.state()).width, 8);
  assert.ok(
    events.some((e) => e[0] === "PISKEL_SAVE_STATE" && e[1].type === "SNAPSHOT")
  );
});

test("shapes, flood fill, erasure and off-current-frame drawing", async () => {
  const { api } = setup();
  await api.draw.rect({ x: 1, y: 1, width: 6, height: 6, color: "#ff0000" });
  await api.draw.fill({ x: 2, y: 2, color: "#00ff00" });
  let rows = await api.frame.read();
  assert.equal(rows[1][1], "#ff0000");
  assert.equal(rows[2][2], "#00ff00");
  await api.frame.add();
  await api.draw.line({
    x1: 0,
    y1: 0,
    x2: 7,
    y2: 7,
    frame: 0,
    color: "#0000ff"
  });
  assert.equal((await api.app.state()).frame, 1);
  rows = await api.frame.read({ frame: 0 });
  assert.equal(rows[3][3], "#0000ff");
  await api.draw.clear({ frame: 0 });
  rows = await api.frame.read({ frame: 0 });
  assert.notEqual(rows[3][3], "#0000ff");
});

test("layer/frame invariants and hidden frame reorder/delete", async () => {
  const { api } = setup();
  await assert.rejects(api.layer.remove(), /last layer/);
  await assert.rejects(api.frame.remove(), /last frame/);
  await api.layer.add({ name: "Face" });
  await api.frame.add();
  await api.frame.add();
  await api.frame.toggleVisibility({ frame: 0 });
  await api.frame.move({ from: 1, to: 2 });
  assert.deepEqual(Array.from((await api.app.state()).hiddenFrames), [0]);
  await api.frame.remove({ frame: 0 });
  const state = await api.app.state();
  assert.equal(state.frameCount, 2);
  assert.equal(state.layers.length, 2);
  assert.deepEqual(Array.from(state.hiddenFrames), []);
  const copied = await api.app.state();
  copied.layers[0].name = "Modified";
  assert.equal((await api.app.state()).layers[0].name, "Layer 1");
});

test("resize preserves pixels across layers and frames", async () => {
  const { api } = setup();
  await api.draw.pixels({ pixels: [{ x: 1, y: 1, color: "#123456" }] });
  await api.document.resize({ width: 4, height: 5 });
  assert.equal((await api.frame.read())[1][1], "#123456");
  const before = await api.app.state();
  await assert.rejects(
    api.document.resize({ width: 0, height: 5 }),
    /width must/
  );
  assert.deepEqual(await api.app.state(), before);
  const results = await api.batch([
    { command: "frame.add" },
    { command: "layer.add", args: { name: "Batch" } }
  ]);
  assert.equal(results[1].layers.length, 2);
  assert.ok(api.help().length >= 40);
});

test("full document state is JSON-safe and structured snapshots roundtrip", async () => {
  const { api } = setup();
  await api.document.new({
    width: 3,
    height: 2,
    name: "State",
    description: "full",
    fps: 9,
    frameCount: 2,
    layerNames: ["Back", "Front"],
    hiddenFrames: [1]
  });
  await api.draw.pixels({
    layer: 1,
    frame: 1,
    pixels: [{ x: 2, y: 1, color: "#123456" }]
  });
  const document = await api.document.read({ format: "uint32" });
  assert.equal(document.layers.length, 2);
  assert.equal(document.layers[1].frames.length, 2);
  assert.equal(document.layers[1].frames[1].pixels.length, 6);
  assert.deepEqual(Array.from(document.hiddenFrames), [1]);

  document.name = "Restored";
  await api.document.new({ width: 1, height: 1 });
  await api.document.write({ document });
  const restored = await api.document.read({ format: "rows" });
  assert.equal(restored.name, "Restored");
  assert.equal(restored.layers[1].frames[1].pixels[1][2], "#123456");
  assert.equal((await api.file.state()).modelVersion, 2);
});

test("resize supports all anchors and nearest-neighbor content scaling", async () => {
  const { api } = setup();
  await api.document.new({ width: 2, height: 2 });
  await api.draw.pixels({ pixels: [{ x: 0, y: 0, color: "#ff0000" }] });
  await api.document.resize({ width: 4, height: 4, origin: "BOTTOMRIGHT" });
  let rows = await api.frame.read();
  assert.equal(rows[2][2], "#ff0000");

  await api.document.resize({ width: 8, height: 8, resizeContent: true });
  rows = await api.frame.read();
  assert.equal(rows[4][4], "#ff0000");
  assert.equal(rows[5][5], "#ff0000");
});

test("all app settings are readable, validated atomically and resettable", async () => {
  const { api } = setup();
  const help = api.help();
  assert.ok(help.length >= 95);
  assert.equal(help.find((item) => item.command === "layer.add").mutates, true);
  assert.equal(
    help.find((item) => item.command === "layer.list").mutates,
    false
  );
  assert.ok(api.capabilities().events.includes("settings"));

  const initial = await api.app.state();
  assert.equal(initial.settings.GRID_ENABLED, false);
  assert.equal(initial.file.modelVersion, 2);
  assert.equal(initial.document.currentFrame, 0);

  await api.settings.setMany({
    values: {
      GRID_ENABLED: true,
      CANVAS_BACKGROUND: "light-canvas-background",
      DEFAULT_SIZE: { width: 48, height: 24 },
      PEN_SIZE: 4
    }
  });
  let settings = await api.settings.read();
  assert.equal(settings.GRID_ENABLED, true);
  assert.equal(settings.DEFAULT_SIZE.width, 48);
  assert.equal(settings.DEFAULT_SIZE.height, 24);
  assert.equal((await api.app.state()).penSize, 4);

  await assert.rejects(
    api.settings.setMany({
      values: {
        GRID_ENABLED: false,
        MAX_FPS: 999
      }
    }),
    /value must/
  );
  assert.equal(await api.settings.read({ key: "GRID_ENABLED" }), true);
  await api.settings.reset({ key: "GRID_ENABLED" });
  assert.equal((await api.settings.read()).GRID_ENABLED, false);
});

test("palette import parses standard GPL and palette state/export roundtrips", async () => {
  const { api } = setup();
  const imported = await api.palette.import({
    format: "gpl",
    data: "GIMP Palette\nName: Standard\n#\n255 0 17 Red\n0 128 255 Blue\n"
  });
  assert.equal(imported.name, "Standard");
  assert.equal(imported.colors.join(","), "#ff0011,#0080ff");

  await api.palette.select({ id: imported.id });
  const state = await api.palette.state();
  assert.equal(state.selectedId, imported.id);
  assert.equal(state.selected.name, "Standard");
  const json = JSON.parse(
    await api.palette.export({ id: imported.id, format: "json" })
  );
  assert.equal(json.colors.join(","), "#ff0011,#0080ff");
  await api.palette.remove({ id: imported.id });
  assert.equal((await api.palette.list()).length, 0);
});

test("change subscriptions, bounded log reads and waitForChange return isolated events", async () => {
  const { api } = setup();
  const before = await api.app.state();
  let observed = null;
  const unsubscribe = api.on("document", (event) => {
    observed = event;
  });
  await api.draw.pixels({ pixels: [{ x: 0, y: 0, color: "#010203" }] });
  unsubscribe();

  assert.ok(observed);
  assert.ok(observed.revision > before.revision);
  const changes = await api.app.changes({ since: before.revision });
  assert.ok(changes.events.some((event) => event.type === "document"));
  changes.events[0].details = { corrupted: true };
  const reread = await api.app.changes({ since: before.revision });
  assert.notEqual(reread.events[0].details?.corrupted, true);

  const waited = await api.waitForChange({
    since: before.revision,
    type: "document",
    timeout: 1
  });
  assert.equal(waited.type, "document");
});
