import { test, expect } from '@playwright/test';
import { openEditor } from '../testutils';

declare global { interface Window { piskelAPI: any; } }

test.beforeEach(async ({ page }) => { await openEditor(page); });

test('API discovers commands, draws atomically and restores undo/redo', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    await api.document.new({ width: 8, height: 8 });
    await api.draw.rect({ x: 1, y: 1, width: 6, height: 6, color: '#ff0000' });
    await api.draw.fill({ x: 2, y: 2, color: '#00ff00' });
    const before = await api.frame.read();
    await api.history.undo();
    const undone = await api.frame.read();
    await api.history.redo();
    const redone = await api.frame.read();
    let rejected = false;
    try {
      await api.draw.pixels({ pixels: [{ x: 0, y: 0, color: '#ffffff' }, { x: 99, y: 0, color: '#ffffff' }] });
    } catch { rejected = true; }
    return { before, undone, redone, rejected, after: await api.frame.read(), help: api.help() };
  });
  expect(result.before[2][2]).toBe('#00ff00');
  expect(result.undone[2][2]).not.toBe('#00ff00');
  expect(result.redone).toEqual(result.before);
  expect(result.after).toEqual(result.before);
  expect(result.rejected).toBe(true);
  expect(result.help.some((item: any) => item.command === 'tool.stroke')).toBe(true);
});

test('layers, frames, visibility, resize and file roundtrip', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    await api.document.new({ width: 4, height: 4, name: 'Robot' });
    await api.layer.add({ name: 'Face' });
    await api.draw.line({ x1: 0, y1: 0, x2: 3, y2: 3, color: '#123456' });
    await api.frame.duplicate();
    await api.frame.add();
    await api.frame.toggleVisibility({ frame: 0 });
    await api.frame.move({ from: 1, to: 2 });
    const hidden = (await api.app.state()).hiddenFrames;
    await api.frame.remove({ frame: 0 });
    const removed = (await api.app.state()).hiddenFrames;
    await api.document.resize({ width: 6, height: 5 });
    const data = await api.file.export();
    const png = await api.file.export({ format: 'png' });
    await api.document.new();
    await api.file.import({ data });
    return { state: await api.app.state(), hidden, removed, png, rows: await api.frame.read({ layer: 1, frame: 1 }) };
  });
  expect(result.hidden).toEqual([0]);
  expect(result.removed).toEqual([]);
  expect(result.state).toMatchObject({ name: 'Robot', width: 6, height: 5, frameCount: 2 });
  expect(result.state.layers).toHaveLength(2);
  expect(result.rows[0][0]).toBe('#123456');
  expect(result.png).toMatch(/^data:image\/png;base64,/);
});

test('native tools, palettes, settings and command errors', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const api = window.piskelAPI;
    await api.document.new({ width: 8, height: 8 });
    await api.tool.select({ id: 'tool-pen' });
    await api.tool.colors({ primary: '#abcdef' });
    await api.tool.stroke({ points: [{ x: 0, y: 0 }, { x: 7, y: 7 }] });
    const pixels = await api.frame.read();
    const p = await api.palette.save({ name: 'AI palette', colors: ['#abcdef', '#123456'] });
    await api.palette.select({ id: p.id });
    const palettes = await api.palette.list();
    await api.palette.remove({ id: p.id });
    await api.settings.set({ key: 'GRID_ENABLED', value: true });
    const errors = [];
    for (const command of [
      { command: '__proto__' },
      { command: 'layer.remove' },
      { command: 'frame.remove' },
      { command: 'draw.line', args: { x1: 0.5, y1: 0, x2: 2, y2: 2, color: '#ffffff' } },
      { command: 'tool.colors', args: { primary: 'bad' } }
    ]) {
      try { await api.execute(command); } catch (e) { errors.push(String(e)); }
    }
    return { pixels, palettes, errors, settings: await api.settings.read(), state: await api.app.state() };
  });
  expect(result.pixels[3][3]).toBe('#abcdef');
  expect(result.palettes.some((p: any) => p.name === 'AI palette')).toBe(true);
  expect(result.errors).toHaveLength(5);
  expect(result.settings.GRID_ENABLED).toBe(true);
  expect(result.state.layers).toHaveLength(1);
});
