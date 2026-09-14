# Piskel Console API (v1)

API có sẵn ở **`window.piskelAPI`** sau khi editor khởi tạo, cả production lẫn debug.
Mở DevTools → Console. Không cần bật devtools nội bộ hay cài plugin.

```js
const api = window.piskelAPI;
console.table(api.help()); // danh sách đầy đủ, tham số, mô tả
await api.app.state();     // trạng thái JSON, không trả model mutable
```

## Ví dụ tạo sprite, layer, animation, palette và file

```js
await api.document.new({ name: "AI sprite", width: 32, height: 32, fps: 8 });
const palette = await api.palette.save({
  name: "Robot", colors: ["#222034", "#5fcde4", "#ffffff"]
});
await api.palette.select({ id: palette.id });
await api.layer.update({ name: "Background" });
await api.draw.clear({ color: "#222034" });
await api.layer.add({ name: "Robot" });
await api.draw.rect({ x: 8, y: 6, width: 16, height: 20, color: "#5fcde4", fill: true });
await api.draw.pixels({ pixels: [
  { x: 12, y: 12, color: "#ffffff" },
  { x: 19, y: 12, color: "#ffffff" }
] });
await api.frame.duplicate();
await api.draw.line({ x1: 12, y1: 12, x2: 14, y2: 12, color: "#222034" });
await api.file.export({ format: "piskel", download: true });
await api.file.export({ format: "png", download: true });
```

## Gọi bằng JSON từ AI / browser automation

Mọi lệnh trả **Promise**. Luôn `await` để nhận kết quả/lỗi. `help()` là đồng bộ.
Hai cách gọi tương đương:

```js
await api.draw.rect({ x: 0, y: 0, width: 4, height: 4, color: "#ff0000" });
await api.execute({
  command: "draw.rect",
  args: { x: 0, y: 0, width: 4, height: 4, color: "#ff0000" }
});
// Hoặc api.execute("draw.rect", args)

await api.batch([
  { command: "layer.add", args: { name: "Effects" } },
  { command: "draw.ellipse", args: { x: 2, y: 2, width: 8, height: 8, color: "#ffffff" } }
]);
```

Với Playwright (không cần click canvas):

```js
await page.waitForFunction(() => !!window.piskelAPI);
const commands = await page.evaluate(() => window.piskelAPI.help());
const result = await page.evaluate(
  command => window.piskelAPI.execute(command),
  { command: "app.state" }
);
```

API chỉ nhận lệnh đăng ký, không `eval`, không mở HTTP/WebSocket hay nhận `postMessage` từ origin khác.
AI cần quyền chạy JavaScript trong tab editor. Đây **không** phải REST/MCP server.

## Nhóm chức năng

| Nhóm | Lệnh |
| --- | --- |
| App | `app.state` |
| Document | `document.new`, `document.update`, `document.resize` |
| File | `file.export`, `file.import` |
| Layer | `layer.add`, `select`, `update`, `remove`, `duplicate`, `mergeDown`, `up`, `down` |
| Frame | `frame.add`, `select`, `remove`, `duplicate`, `move`, `toggleVisibility`, `read` |
| Draw | `draw.pixels`, `line`, `rect`, `ellipse`, `fill`, `clear` |
| Palette | `palette.list`, `save`, `select`, `remove` |
| Tool | `tool.list`, `select`, `colors`, `penSize`, `stroke` |
| Selection | `selection.read`, `commit`, `erase` |
| Transform | `transform.apply` |
| Settings | `settings.read`, `settings.set` |
| History | `history.undo`, `history.redo` |

Dùng `api.help()` để xem tham số, giá trị mặc định của từng lệnh.

### Tọa độ và màu

- Layer/frame bắt đầu từ **0**. Layer 0 ở dưới cùng.
- `draw.*` và `frame.read` nhận `layer`, `frame` tùy chọn; mặc định mục đang chọn.
  Vẽ đích khác không đổi layer/frame đang chọn.
- Gốc `(0,0)` ở trên trái, x sang phải, y xuống dưới. Tọa độ phải nguyên và nằm trong canvas.
- Màu đầu vào: `#RRGGBB` hoặc `"transparent"` (xóa). Không tự cắt tọa độ ngoài canvas.
- `frame.read` trả ma trận **rows[y][x]**, màu hex hoặc rgba theo cache màu của app, có thể gồm alpha từ file import.
- `rect`/`ellipse` dùng kích thước pixel, `fill: true` để tô kín; mặc định chỉ viền.
- `draw.fill` là flood fill liên thông 4 hướng, còn `draw.clear` tô/xóa toàn bộ frame đích.
- Các hàm draw trực tiếp không áp dụng pen size, màu tool hay selection mask; dùng `tool.stroke` cho hành vi tool gốc.

### Dùng mọi công cụ gốc

```js
await api.tool.list(); // drawing và transforms chứa ID thực của app
await api.tool.select({ id: "tool-vertical-mirror-pen" });
await api.tool.colors({ primary: "#ffcc00", secondary: "transparent" });
await api.tool.penSize({ size: 2 });
await api.tool.stroke({ points: [{ x: 4, y: 4 }, { x: 8, y: 12 }] });

await api.tool.select({ id: "tool-rectangle-select" });
await api.tool.stroke({ points: [{ x: 4, y: 4 }, { x: 12, y: 12 }] });
await api.selection.read();
await api.selection.erase();
await api.selection.commit();

await api.transform.apply({ id: "tool-flip", shiftKey: true });
```

`tool.stroke` chạy press → move → release bằng tọa độ pixel, trên frame/layer đang chọn,
không phụ thuộc zoom. `button: 2` dùng màu phụ. Modifier được chuyển cho tool gốc;
Alt trong lệnh này không mô phỏng chế độ eyedropper tạm thời của canvas.
Transform dùng cùng modifier/scope với nút UI; tra tooltip app cho ý nghĩa Shift/Ctrl/Alt.
Không chạy lệnh đồng thời với thao tác chuột của người dùng.

### File và dữ liệu

```js
const saved = await api.file.export();       // chuỗi JSON .piskel
const png = await api.file.export({ format: "png" }); // data URL spritesheet
await api.file.import({ data: saved });      // await decode ảnh + cập nhật editor
```

- Import hỗ trợ định dạng `.piskel` phiên bản model hiện tại với PNG nhúng. Không hỗ trợ URL ngoài.
- Export PNG là spritesheet, không phải GIF. Download do trình duyệt quản lý;
  API không tự ghi đường dẫn tùy ý trên máy người dùng.
- `document.new`/`file.import` thay document đang mở: nên export trước.
- Resize crop/pad từ góc trên trái, không resample.
- Palettes lưu trong localStorage, không nhúng trong `.piskel` và không thuộc undo document.
  Palette động “Current colors” chỉ đọc. Dùng `palette.save({id, name, colors})` để cập nhật palette đã có.

### Thứ tự, lỗi và undo

- Các lệnh `execute` được xếp hàng; lệnh sau chờ import/history hoàn tất.
- `batch` chạy lần lượt và dừng ở lỗi đầu tiên; **không rollback** những lệnh đã thành công,
  không gom thành một undo. Không xen các chuỗi batch khi cần thứ tự độc quyền.
- `draw.pixels` xử lý trên bản sao: một pixel không hợp lệ làm cả lệnh thất bại, không vẽ dở dang.
  Mỗi lệnh draw trực tiếp tạo một snapshot undo, thay vì mỗi pixel một snapshot.
- Thao tác layer/frame dùng history của editor. Native stroke/transform dùng history của tool.
- Undo/redo tuân theo editor hiện tại: metadata tên/mô tả, palette, preference và tool selection
  không được khôi phục như pixel/layer/frame. API không thay đổi chính sách này.
- Lỗi đầu vào reject Promise, không làm kẹt hàng đợi. Import decode có timeout 15 giây.
- Giới hạn kích thước 2048 mỗi chiều; thao tác tăng tài nguyên giới hạn 16 triệu pixel
  tổng layer × frame, tối đa 256 layers/10.000 frames. Batch tối đa 1000 lệnh.
- API v1 chưa bao bọc mọi dialog/cloud/desktop storage, clipboard hệ điều hành hay export GIF/ZIP.
  Không dùng object nội bộ `pskl.app` làm hợp đồng API ổn định.

## Kiểm thử

```sh
node --test tests/api/console-api.test.cjs
npx playwright test tests/e2e/playwright/integration/console-api.spec.ts
npm run build
```

Node tests dùng model/controller thật với UI giả lập. Playwright tests kiểm tra app thật:
undo/redo, file roundtrip, native stroke, palette, settings và đầu vào không hợp lệ.
