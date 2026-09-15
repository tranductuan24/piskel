# Piskel

[![E2E Tests](https://github.com/piskelapp/piskel/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/piskelapp/piskel/actions/workflows/ci.yml)

Piskel is a browser-based editor for pixel art, game sprites, and frame-by-frame animation. It powers [piskelapp.com](https://www.piskelapp.com).

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

See the [project wiki](https://github.com/piskelapp/piskel/wiki) for additional development and desktop-build information.

## Technology

The editor is built with JavaScript, HTML, and CSS. Its browser-side dependencies include jQuery, gif.js, a modified SuperGif decoder, JSZip, Spectrum, and canvas-toBlob. End-to-end tests use Playwright.

Several interface icons come from [The Noun Project](https://thenounproject.com/), including the Folder icon by Simple Icons.

## Contributing

Use [GitHub Issues](https://github.com/piskelapp/piskel/issues) for bug reports and feature requests.

Small, focused fixes and documentation improvements are the easiest contributions to review. Large or complex fixes, major refactors, and user-experience changes are unlikely to be reviewed or merged because the project has limited maintenance capacity.

## License

Copyright 2017 Julian Descottes.

Licensed under the [Apache License 2.0](LICENSE).
