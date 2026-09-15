# Piskel Console API (v2)

Piskel cung cấp facade automation ổn định tại **`window.piskelAPI`** sau khi editor khởi tạo. API có trong cả production lẫn debug build và có thể điều khiển editor mà không cần click lên canvas.

```js
const api = window.piskelAPI;
console.log(api.version);                  // "2.0.0"
console.table(api.help());                 // toàn bộ command
console.log(api.capabilities());           // nhóm, event và giới hạn an toàn
```

Mọi command đã đăng ký đều trả `Promise`; luôn dùng `await`. Riêng `help()` và `capabilities()` là các hàm discovery đồng bộ.

## Dùng Console API ngay trong UI (không cần DevTools)

Nhấn nút **`>_ API`** ở thanh công cụ bên phải để mở Console API toàn màn hình dạng drawer. Bảng này cung cấp:

- Danh sách tìm kiếm được của toàn bộ command và schema tham số ngay bên dưới.
- Preset đọc App state, Full snapshot, Document, Settings và danh sách Commands.
- JSON editor, format JSON và chạy nhanh bằng `Ctrl/⌘ + Enter`.
- Pseudo-command `batch`, `help`, `capabilities`, `whenIdle`, `waitForChange`.
- Command history bằng nút `↑`/`↓` hoặc `Alt + ↑`/`Alt + ↓`.
- Output phân biệt success/error/event, tự cắt phần hiển thị quá lớn nhưng vẫn cho copy/download kết quả đầy đủ.
- Tùy chọn **Follow changes** để xem live event stream của editor.

Ví dụ chọn command `draw.rect`, rồi nhập vào ô **Arguments**:

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

Console UI chỉ nhận JSON và command đã đăng ký; nó không dùng `eval` và không chạy JavaScript tùy ý. Có thể mở panel bằng API với `await api.ui.settings({ panel: "console" })`.

## Lấy đầy đủ file vẽ và app settings hiện tại

`app.state()` trả tổng quan live tương đối nhẹ: trạng thái file, metadata document, **toàn bộ app settings hiện tại**, history, selection, tool và viewport.

```js
const state = await api.app.state();

state.document; // kích thước, FPS, layer, frame hiện tại, hidden frames, hash
state.file;     // tên/path .piskel, model version, dirty/saving, hash
state.settings; // toàn bộ giá trị UserSettings hiện tại
state.history;  // canUndo, canRedo, index, length
state.selection;
state.view;
```

Pixel là tùy chọn để các command thường không phải tạo payload lớn:

```js
// Toàn bộ drawing dễ đọc: layers -> frames -> rows[y][x]
const drawing = await api.document.read({ pixels: "all", format: "rows" });

// Pixel uint32 chính xác, giữ nguyên alpha và gọn hơn string
const exact = await api.document.read({ pixels: "all", format: "uint32" });

// Chỉ kèm pixel của layer/frame đang chọn
const current = await api.app.state({
  includePixels: "current",
  pixelFormat: "sparse"
});

// JSON .piskel có thể restore cùng trạng thái file/save
const file = await api.file.read();
await api.file.import({ data: file.serialized });

// Snapshot toàn diện: file, settings, palettes và structured pixels
const snapshot = await api.app.snapshot({
  includePixels: "all",
  pixelFormat: "uint32",
  includeSerialized: true
});
```

Mọi giá trị trả về đều JSON-safe và là bản sao. Sửa object đã nhận không làm thay đổi model trong editor.

## Cách gọi command

Ba cách sau tương đương:

```js
await api.draw.rect({
  x: 0, y: 0, width: 8, height: 8,
  color: "#ff0000", fill: true
});

await api.execute({
  command: "draw.rect",
  args: {
    x: 0, y: 0, width: 8, height: 8,
    color: "#ff0000", fill: true
  }
});

await api.execute("draw.rect", {
  x: 0, y: 0, width: 8, height: 8,
  color: "#ff0000", fill: true
});
```

Command chạy tuần tự qua một queue. Một command reject không làm kẹt các command sau.

```js
const results = await api.batch([
  { command: "layer.add", args: { name: "Effects" } },
  {
    command: "draw.ellipse",
    args: { x: 2, y: 2, width: 8, height: 8, color: "#ffffff" }
  }
]);

await api.whenIdle();
```

`batch` chạy đúng thứ tự, dừng ở lỗi đầu tiên và **không rollback** command đã hoàn thành.

## Các nhóm tính năng

| Nhóm | Command |
| --- | --- |
| App/state | `app.state`, `app.snapshot`, `app.capabilities`, `app.changes` |
| Document | `document.new`, `read`, `state`, `write`, `update`, `resize`, `colors` |
| File/import/export | `file.state`, `read`, `export`, `import`, `importImage` |
| Browser storage | `storage.capabilities`, `list`, `save`, `load`, `remove` |
| Automatic backup | `backup.list`, `snapshots`, `create`, `load`, `remove` |
| Layer | `layer.list`, `read`, `select`, `add`, `update`, `remove`, `duplicate`, `mergeDown`, `up`, `down`, `move` |
| Frame | `frame.list`, `read`, `write`, `select`, `add`, `remove`, `duplicate`, `move`, `toggleVisibility`, `setVisibility` |
| Vẽ trực tiếp | `draw.pixels`, `line`, `rect`, `ellipse`, `fill`, `clear`, `replaceColor`, `image` |
| Native tool | `tool.list`, `state`, `select`, `colors`, `swapColors`, `resetColors`, `pick`, `penSize`, `stroke` |
| Selection/API clipboard | `selection.read`, `state`, `create`, `copy`, `cut`, `paste`, `move`, `erase`, `commit`, `dismiss`, `clipboard` |
| Transform | `transform.apply` |
| Palette | `palette.list`, `state`, `get`, `save`, `import`, `export`, `select`, `remove` |
| Settings | `settings.read`, `state`, `schema`, `set`, `setMany`, `reset` |
| History | `history.state`, `undo`, `redo` |
| Canvas/preview | `view.state`, `zoom`, `pan`, `reset`, `popupPreview` |
| UI | `ui.state`, `settings`, `dialog`, `notify` |
| Shortcut | `shortcut.list`, `set`, `reset`, `trigger` |

Discovery theo từng nhóm:

```js
console.table(api.help("file"));
console.table(api.help("settings"));
console.log((await api.app.capabilities()).limits);
```

Mỗi entry từ `help()` cho biết args, mô tả, kiểu kết quả và command có mutate state hay không.

## Tạo và chỉnh sửa animation hoàn chỉnh

```js
await api.document.new({
  name: "AI robot",
  description: "Generated through Console API v2",
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
  x: 8, y: 6, width: 16, height: 20,
  color: "#5fcde4", fill: true
});
await api.draw.pixels({ pixels: [
  { x: 12, y: 12, color: "#ffffff" },
  { x: 19, y: 12, color: "#ffffff" }
] });
await api.frame.duplicate({ frame: 0 });
await api.frame.move({ from: 1, to: 2 });
await api.frame.setVisibility({ frame: 2, visible: true });

await api.layer.update({ layer: 1, opacity: 0.9, name: "Animated robot" });
await api.layer.move({ from: 1, to: 0 });
```

Index layer/frame bắt đầu từ `0`; layer `0` nằm dưới cùng. Các lệnh draw trực tiếp có thể nhắm tới layer/frame không được chọn mà không đổi selection hiện tại.

## Pixel format và structured round-trip

`frame.read`, `frame.write`, `document.read` và `document.write` hỗ trợ:

- `rows`: `pixels[y][x]`, màu dạng `#RRGGBB`/`rgba(...)`.
- `flat`: mảng màu row-major.
- `sparse`: chỉ các pixel có dữ liệu dạng `{x, y, color}`.
- `uint32`: mảng RGBA integer nội bộ chính xác; phù hợp nhất cho automation lossless.

```js
const rows = await api.frame.read({ layer: 0, frame: 0 });
const merged = await api.frame.read({ frame: 0, merged: true });
const sparse = await api.frame.read({ format: "sparse" });

await api.frame.write({
  format: "sparse",
  clear: false,
  pixels: [
    { x: 1, y: 1, color: "#ff0000" },
    { x: 2, y: 1, color: "transparent" }
  ]
});

const structured = await api.document.read({ format: "uint32" });
structured.name = "Copy";
await api.document.write({ document: structured });
```

`document.write` kiểm tra toàn bộ payload trước khi thay drawing hiện tại.

## Resize, thay màu và chèn ảnh

Resize hỗ trợ chín anchor như UI và nearest-neighbor content scaling:

```js
await api.document.resize({
  width: 64,
  height: 48,
  resizeContent: false,
  origin: "MIDDLE"
});

await api.document.resize({
  width: 128,
  height: 96,
  resizeContent: true
});

await api.draw.replaceColor({
  from: "#5fcde4",
  to: "#639bff",
  scope: "document"
});

await api.draw.image({
  data: "data:image/png;base64,...",
  x: 0,
  y: 0,
  width: 16,
  height: 16,
  smoothing: false
});
```

Tọa độ là pixel nguyên, gốc `(0, 0)` ở trên trái. Shape trực tiếp reject tọa độ ngoài canvas thay vì âm thầm clip.

## Dùng mọi native drawing tool và transform

```js
const tools = await api.tool.list();
console.log(tools.drawing, tools.transforms);

await api.tool.select({ id: "tool-vertical-mirror-pen" });
await api.tool.colors({ primary: "#ffcc00", secondary: "transparent" });
await api.tool.penSize({ size: 2 });
await api.tool.stroke({
  points: [{ x: 4, y: 4 }, { x: 8, y: 12 }]
});

await api.tool.pick({ x: 4, y: 4, target: "secondary" });
await api.tool.swapColors();

await api.transform.apply({
  id: "tool-flip",
  shiftKey: true,
  ctrlKey: false,
  altKey: false
});
```

`tool.stroke` chạy native press → move → release bằng tọa độ sprite. Nó hỗ trợ pen, mirror pen, bucket, color swap, eraser, line, rectangle, circle, move, mọi selection tool, lighten, dithering và color picker. `button: 2` dùng secondary color. Modifier giữ nguyên scope semantics của UI; `ctrlKey` cũng được ánh xạ sang Command trên macOS khi transform.

Không chạy native API stroke đồng thời với pointer gesture thật của người dùng.

## Selection và API clipboard biệt lập

```js
await api.selection.create({ x: 4, y: 4, width: 8, height: 8 });
await api.selection.copy();
await api.selection.move({ dx: 4, dy: 0, moveContent: true });
await api.selection.paste({ offsetX: 0, offsetY: 8, clip: true });
await api.selection.commit();

console.log(await api.selection.state());
console.log(await api.selection.clipboard());
```

API clipboard nằm trong memory và tách khỏi clipboard hệ điều hành. Nhờ đó automation có tính xác định và không cần browser clipboard permission.

## Palette

```js
const palette = await api.palette.save({
  name: "Robot",
  colors: ["#222034", "#5fcde4", "#ffffff"]
});
await api.palette.select({ id: palette.id });

const gpl = await api.palette.export({ id: palette.id, format: "gpl" });
await api.palette.import({ name: "Robot copy", data: gpl, format: "gpl" });
```

Import/export hỗ trợ JSON, chuẩn GIMP GPL và danh sách hex. Palette được lưu trong `localStorage`, không nhúng vào `.piskel` và không thuộc document undo history. Palette động như “Current colors” chỉ đọc.

## Đọc và ghi toàn bộ app settings

`settings.schema()` trả mọi setting có thể ghi cùng giá trị hiện tại, default, type, allowed values và range.

```js
console.table(await api.settings.schema());

await api.settings.set({ key: "GRID_ENABLED", value: true });
await api.settings.setMany({ values: {
  GRID_COLOR: "#ffffff",
  GRID_WIDTH: 2,
  GRID_SPACING: 8,
  CANVAS_BACKGROUND: "light-canvas-background",
  ONION_SKIN: true,
  SEAMLESS_MODE: false,
  PREVIEW_SIZE: "best",
  MAX_FPS: 30,
  DEFAULT_SIZE: { width: 64, height: 64 },
  PEN_SIZE: 3
} });

await api.settings.reset({ key: "GRID_ENABLED" });
// Reset toàn bộ app settings:
await api.settings.reset();
```

`settings.setMany` validate tất cả giá trị trước rồi mới áp dụng. Vì vậy lỗi validation không để lại một phần settings đã đổi.

Các setting hiện hỗ trợ gồm grid, preview/tile, onion skin/layer preview, background, palette đang chọn, export, pen size, resize defaults, color format và tab UI. Shortcut mapping có API riêng ở nhóm `shortcut.*`.

## Import và export mọi định dạng của app

```js
const piskel = await api.file.export({ format: "piskel" });
const png = await api.file.export({
  format: "png",
  scale: 4,
  columns: 4,
  visibleOnly: true
});
const oneFrame = await api.file.export({ format: "png", frame: 0, scale: 8 });
const gif = await api.file.export({ format: "gif", scale: 4, repeat: true });
const zip = await api.file.export({
  format: "zip",
  splitLayers: true,
  useLayerNames: true,
  prefix: "walk_"
});
const pixi = await api.file.export({ format: "pixi", columns: 4 });
const cSource = await api.file.export({ format: "c" });

// Thêm download: true để dùng browser download flow.
await api.file.export({ format: "png", download: true, name: "robot" });
```

Kiểu kết quả:

- `piskel`, `c`: string.
- `png`, `gif`, `zip`: data URL.
- `pixi`: `{ image: dataURL, json: object }`.

PNG/Pixi/GIF có thể chọn `frame`, `frames`, `visibleOnly`, `layer`, `columns` và `scale` khi phù hợp. Spritesheet scale theo từng cell để metadata Pixi luôn khớp chính xác pixel output.

Image import nhận base64 PNG, JPEG, BMP, WebP, animated GIF và spritesheet:

```js
await api.file.importImage({
  data: "data:image/png;base64,...",
  mode: "spritesheet",
  name: "Walk",
  frameWidth: 16,
  frameHeight: 16,
  offsetX: 0,
  offsetY: 0,
  smoothing: false
});
```

URL ngoài bị từ chối có chủ đích. Trusted automation nên tự fetch rồi truyền data URL.

## Browser save, gallery và automatic backup

```js
await api.storage.save({ target: "browser", name: "Robot" });
console.table(await api.storage.list());
await api.storage.load({ name: "Robot" });
await api.storage.remove({ name: "Robot" });

const sessions = await api.backup.list();
const snapshots = await api.backup.snapshots({ sessionId: sessions[0].id });
await api.backup.load({ snapshotId: snapshots[0].id });
```

Các save target:

- `browser`: IndexedDB của app.
- `download`: browser file download.
- `desktop`: chỉ NW.js desktop build.
- `gallery`: chỉ khi người dùng đã đăng nhập.

`storage.capabilities()` cho biết target thực sự khả dụng. API cũng đọc/xóa dữ liệu `legacy` localStorage. Native open-file picker vẫn cần thao tác/quyền của người dùng; dùng `file.import` để automation có tính xác định.

## View, UI và shortcut

```js
await api.view.zoom({ value: 16 });
await api.view.pan({ dx: 2, dy: -1 });
await api.view.reset();

await api.ui.settings({ panel: "export" });
await api.ui.settings({ panel: null });
await api.ui.dialog({ id: "cheatsheet" });
await api.ui.dialog({ open: false });
await api.ui.notify({ message: "Automation complete", hideDelay: 2000 });

console.table(await api.shortcut.list());
await api.shortcut.set({ id: "tool-pen", key: "Q" });
await api.shortcut.trigger({ id: "tool-pen" });
await api.shortcut.reset({ id: "tool-pen" });
```

`ui.settings` hỗ trợ `user`, `resize`, `save`, `export`, `import`, `localstorage`, `console` hoặc `null`. Detached preview dùng `window.open`, do đó browser có thể chặn nếu lệnh không gắn với user gesture.

## Theo dõi thay đổi live

API giữ change log có giới hạn và hỗ trợ subscription trực tiếp. Thay đổi từ cả UI lẫn API đều được quan sát.

```js
const initial = await api.app.state();

const unsubscribe = api.on("document", event => {
  console.log(event.revision, event.type, event.details);
});

await api.draw.pixels({ pixels: [{ x: 0, y: 0, color: "#ff0000" }] });
console.log(await api.app.changes({ since: initial.revision }));
unsubscribe();

// Helper trực tiếp, không chiếm command queue.
const nextChange = await api.waitForChange({
  since: initial.revision,
  type: "settings",
  timeout: 30000
});
```

Event type hỗ trợ: `document`, `settings`, `history`, `selection`, `palette`, `tool`, `view`, `save`, `ui`, cùng catch-all `change`. Ngoài ra có `api.once`, `api.off` và `api.destroy`.

## Playwright / browser automation

```js
await page.waitForFunction(() => !!window.piskelAPI);

const state = await page.evaluate(() => window.piskelAPI.app.state());

const result = await page.evaluate(async () => {
  const api = window.piskelAPI;
  await api.document.new({ width: 16, height: 16 });
  await api.draw.rect({
    x: 2, y: 2, width: 12, height: 12,
    color: "#ff004d", fill: true
  });
  return api.document.read({ pixels: "current", format: "sparse" });
});
```

API chỉ thực thi command đã đăng ký. Nó không dùng `eval`, không trả mutable app model, không mở HTTP/WebSocket server và không nhận cross-origin `postMessage`. Đây là browser console/automation API, không phải REST hay MCP server.

## Thứ tự, undo và giới hạn

- Direct draw/frame write là atomic và tạo một undo snapshot cho mỗi command.
- Native stroke/transform dùng đúng history behavior của app.
- Metadata, palette, preference, shortcut mapping và viewport không phải pixel-history operation.
- Import và history command chờ decode/restore bất đồng bộ trước khi queue tiếp tục.
- Kích thước tối đa: `2048`; tối đa `256` layer, `10.000` frame và `16.777.216` tổng pixel layer × frame.
- Một batch có tối đa `1.000` command.
- Image và `.piskel` import giới hạn 64 MiB data; export lớn có canvas-size guard.
- OS clipboard và native file picker vẫn phụ thuộc browser/user permission. Dùng `selection.*`, data URL, `file.import` và dữ liệu export trả về cho automation xác định.

## Tương thích v1

Mọi command v1 và default behavior của chúng vẫn hoạt động. Các bổ sung chính ở v2 gồm `state.document`, `state.file`, `state.settings`, structured pixel read/write đầy đủ, mọi app setting, mọi export format, image import, persistence/backup, selection clipboard, view/UI/shortcut control và live change event.

Các alias tiện dụng:

```js
await api.getState();
await api.getDocument();
await api.getSettings();
```

## Kiểm thử

```sh
node --test tests/api/console-api.test.cjs
npx playwright test tests/e2e/playwright/integration/console-api.spec.ts
npm run lint
npm run build
```

Node tests dùng model/controller thật với browser/UI fake. Playwright tests chạy app thật để kiểm tra undo/redo, structured/file round-trip, native tool, palette, settings, selection, IndexedDB persistence, export và input không hợp lệ.
