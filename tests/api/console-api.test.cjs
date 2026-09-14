// Run with node --test tests/api/console-api.test.cjs.
// Real models/controllers, with only browser/UI dependencies replaced by small fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  const events = [];
  const $ = { publish: (...args) => events.push(args) };
  const context = vm.createContext({ console, $, jQuery: $, setTimeout, clearTimeout });
  context.window = context;
  const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/js', file), 'utf8'), context);
  ['utils/core.js', 'Constants.js', 'Events.js', 'utils/Uuid.js', 'utils/Math.js',
    'model/Frame.js', 'model/Layer.js', 'model/Palette.js', 'model/Piskel.js',
    'model/piskel/Descriptor.js', 'controller/piskel/PiskelController.js',
    'controller/piskel/PublicPiskelController.js', 'api/ConsoleAPI.js'].forEach(load);
  const p = context.pskl;
  // Deterministic color parser, not a browser rendering mock.
  context.tinycolor = value => ({ ok: true, toRgb: () => {
    const hex = /^#[0-9a-f]{6}$/i.test(value);
    return { r: hex ? parseInt(value.slice(1, 3), 16) : 0,
      g: hex ? parseInt(value.slice(3, 5), 16) : 0,
      b: hex ? parseInt(value.slice(5, 7), 16) : 0, a: hex ? 1 : 0 };
  } });
  const model = new p.model.Piskel(8, 8, 12, new p.model.piskel.Descriptor('Test', ''));
  const layer = new p.model.Layer('Layer 1');
  layer.addFrame(new p.model.Frame(8, 8)); model.addLayer(layer);
  const core = new p.controller.piskel.PiskelController(model);
  p.service = { HistoryService: { SNAPSHOT: 'SNAPSHOT' }, keyboard: { Shortcuts: { MISC: {} } } };
  const app = p.app = {
    corePiskelController: core,
    shortcutService: { registerShortcut() {} },
    toolController: { currentSelectedTool: { toolId: 'tool-pen' } },
    selectedColorsService: { getPrimaryColor: () => '#000000', getSecondaryColor: () => 'transparent' },
    penSizeService: { getPenSize: () => 1 }
  };
  app.piskelController = new p.controller.piskel.PublicPiskelController(core);
  app.piskelController.init();
  return { api: p.api.create(app), core, events };
}

test('atomic draw validation, snapshot and queue recovery', async () => {
  const { api, core, events } = setup();
  await api.draw.pixels({ pixels: [{ x: 1, y: 1, color: '#ff0000' }] });
  const before = Array.from(core.getCurrentFrame().getPixels());
  const count = events.length;
  await assert.rejects(api.draw.pixels({ pixels: [{ x: 2, y: 2, color: '#ffffff' }, { x: -1, y: 0, color: '#ffffff' }] }), /x must/);
  assert.deepEqual(Array.from(core.getCurrentFrame().getPixels()), before);
  assert.equal(events.length, count);
  await assert.rejects(api.execute('__proto__'), /Unknown command/);
  assert.equal((await api.app.state()).width, 8);
  assert.ok(events.some(e => e[0] === 'PISKEL_SAVE_STATE' && e[1].type === 'SNAPSHOT'));
});

test('shapes, flood fill, erasure and off-current-frame drawing', async () => {
  const { api } = setup();
  await api.draw.rect({ x: 1, y: 1, width: 6, height: 6, color: '#ff0000' });
  await api.draw.fill({ x: 2, y: 2, color: '#00ff00' });
  let rows = await api.frame.read();
  assert.equal(rows[1][1], '#ff0000');
  assert.equal(rows[2][2], '#00ff00');
  await api.frame.add();
  await api.draw.line({ x1: 0, y1: 0, x2: 7, y2: 7, frame: 0, color: '#0000ff' });
  assert.equal((await api.app.state()).frame, 1);
  rows = await api.frame.read({ frame: 0 });
  assert.equal(rows[3][3], '#0000ff');
  await api.draw.clear({ frame: 0 });
  rows = await api.frame.read({ frame: 0 });
  assert.notEqual(rows[3][3], '#0000ff');
});

test('layer/frame invariants and hidden frame reorder/delete', async () => {
  const { api } = setup();
  await assert.rejects(api.layer.remove(), /last layer/);
  await assert.rejects(api.frame.remove(), /last frame/);
  await api.layer.add({ name: 'Face' });
  await api.frame.add(); await api.frame.add();
  await api.frame.toggleVisibility({ frame: 0 });
  await api.frame.move({ from: 1, to: 2 });
  assert.deepEqual(Array.from((await api.app.state()).hiddenFrames), [0]);
  await api.frame.remove({ frame: 0 });
  const state = await api.app.state();
  assert.equal(state.frameCount, 2);
  assert.equal(state.layers.length, 2);
  assert.deepEqual(Array.from(state.hiddenFrames), []);
  const copied = await api.app.state(); copied.layers[0].name = 'Modified';
  assert.equal((await api.app.state()).layers[0].name, 'Layer 1');
});

test('resize preserves pixels across layers and frames', async () => {
  const { api } = setup();
  await api.draw.pixels({ pixels: [{ x: 1, y: 1, color: '#123456' }] });
  await api.document.resize({ width: 4, height: 5 });
  assert.equal((await api.frame.read())[1][1], '#123456');
  const before = await api.app.state();
  await assert.rejects(api.document.resize({ width: 0, height: 5 }), /width must/);
  assert.deepEqual(await api.app.state(), before);
  const results = await api.batch([{ command: 'frame.add' }, { command: 'layer.add', args: { name: 'Batch' } }]);
  assert.equal(results[1].layers.length, 2);
  assert.ok(api.help().length >= 40);
});
