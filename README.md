# Piskel AI Fork

> [!IMPORTANT]
> This repository is a fork of the official [`piskelapp/piskel`](https://github.com/piskelapp/piskel) project; it is not the official Piskel distribution. The original editor and commit history remain credited to the upstream Piskel authors and contributors. **Fork-specific modifications are implemented primarily by AI coding agents from user-directed requirements**, then checked with the repository's automated lint, build, and test tooling.

The underlying Piskel editor is a browser-based tool for pixel art, game sprites, and frame-by-frame animation. The official editor powers [piskelapp.com](https://www.piskelapp.com). This fork adds an expanded Console API and an in-app, JSON-only automation workflow intended for AI-assisted drawing.

<img
  src="https://screenletstore.appspot.com/img/95aaa0f0-37a4-11e7-a652-7b8128ce3e3b.png"
  alt="Piskel editor"
  width="500">

## Features

- Pixel drawing tools, selections, transforms, palettes, layers, and frames
- Animated preview with configurable FPS, onion skinning, and tile preview
- Piskel, PNG spritesheet, animated GIF, ZIP, PixiJS, and C export
- Image, GIF, spritesheet, and `.piskel` import
- Browser storage, automatic backups, and offline desktop builds
- A built-in Console API for automation and AI-assisted workflows

## Console API

Open **`>_ API`** in the right toolbar to use Piskel's Console API without DevTools. The panel can run a single JSON command or a command chain with one click:

```text
app.state
document.colors
frame.read {"layer":0,"frame":0,"format":"sparse"}
```

Put one command and an optional one-line JSON object on each line, then select **Run** or press `Ctrl/Command + Enter`. The panel provides command discovery, history, formatted output, downloads, and live change events.

Piskel also exposes the same API as `window.piskelAPI` for Playwright and other trusted browser automation.

- [Console UI and API reference](docs/console-api.md)
- [AI agent skill](SKILL.md)

Only registered commands are dispatched; arbitrary JavaScript is never evaluated.

## Browser support

Piskel supports current versions of Chrome, Firefox, and Edge. Brave works when canvas fingerprinting protection is disabled; see the [Brave compatibility note](https://github.com/piskelapp/piskel/wiki/About-canvas%E2%80%90based-browser-fingerprinting-and-Brave-browser).

Mobile and tablet layouts are not supported.

## Development

Install dependencies and start the editor:

```sh
npm ci
npm start
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run start:test` | Build and serve in integration-test mode |
| `npm run lint` | Check source files with Biome |
| `npm run build` | Create the production build in `dest/prod` |
| `npm run unit-tests` | Run Karma unit tests |
| `npm run e2e` | Run Playwright end-to-end tests |
| `node --test tests/api/console-api.test.cjs` | Run Console API integration tests |

Playwright requires its browser binary. Install it with `npx playwright install chromium` when it is not already available.

See the [upstream Piskel wiki](https://github.com/piskelapp/piskel/wiki) for additional development and desktop-build information.

## Technology

The editor is built with JavaScript, HTML, and CSS. Its browser-side dependencies include jQuery, gif.js, a modified SuperGif decoder, JSZip, Spectrum, and canvas-toBlob. End-to-end tests use Playwright.

Several interface icons come from [The Noun Project](https://thenounproject.com/), including the Folder icon by Simple Icons.

## Contributing

Use this fork's [GitHub Issues](https://github.com/tranductuan24/piskel/issues) for fork-specific bugs and feature requests. Report issues with the original editor to the [upstream project](https://github.com/piskelapp/piskel/issues) when appropriate.

Keep changes focused and reviewable. Whether written by a person or an AI coding agent, changes should pass lint, build, and the relevant automated tests before they are merged.

## License and attribution

The original Piskel project is copyright 2017 Julian Descottes and its contributors. This fork retains the upstream [Apache License 2.0](LICENSE).
