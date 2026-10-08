# Architecture

This document describes the architectural concepts of the playable ad framework.

## 1. Lifecycle & Bootstrap

- **Build Time**: Webpack runs `BuilderPlugin` (`core/builder/Index.js`), which compresses and encodes raw assets from `assets/` into base64 payload strings inside HTML template shells (`core/template/mraid.html` or `dapi.html`).
- **Runtime Startup**:
  1. The selected network SDK initializes (`core/networks/<Network>.js`) and waits for network readiness (e.g. MRAID `ready` or DAPI `ready`).
  2. When ready, `App` (`Phaser.Game` subclass) is instantiated.
  3. `Preloader` scene parses base64 payloads into Phaser texture, JSON, and audio caches.
  4. The first gameplay scene in the active version flow (`src/Game.js`) launches.

## 2. Inlined Asset Pipeline

Playable ads must be self-contained (often a single `.html` under 2MB–5MB or a single `.zip`).
- **Textures & Sheets**: Packed into sprite atlases or compressed via `pngquant`/`mozjpeg` and injected into `window.App.resources.textures` and `.sheets`.
- **Audio**: Converted into an audiosprite containing `.m4a` and `.ogg` base64 strings under `window.App.resources.audio`.
- **Fonts**: TTF files converted to base64 `@font-face` rules.
- **Spine**: JSON skeletons and atlas textures inlined into `window.App.resources.spine`.
- **No Runtime Network Requests**: All assets must be bundled at build time; runtime `fetch`/`this.load.image` with URLs is prohibited.

## 3. Viewport & Coordinate Space

- **Logical World Dimensions**: Fixed 600x900 coordinate space.
- **`mainContainer`**: Every scene inheriting from `Scene.js` has a root `this.mainContainer`.
- **Window Scaling**: On resize, `App.resize()` dynamically scales `mainContainer` uniformly (`Math.min(deviceWidth / 600, deviceHeight / 900)`) and centers it within the viewport (`this.scale.width / 2 - 300 * scale`, `this.scale.height / 2 - 450 * scale`).

## 4. Reactive Orientation System

Instead of destroying and recreating game objects during device rotation, objects use a reactive property system enabled by `Utils.addDefaultProperties(prototype)`:

| Property | Description |
|---|---|
| `px`, `py` / `lx`, `ly` | Positions in Portrait / Landscape relative to anchor |
| `pScaleX`, `pScaleY` / `lScaleX`, `lScaleY` | Scale in Portrait / Landscape |
| `pAngle` / `lAngle` | Rotation in Portrait / Landscape |
| `pAlpha` / `lAlpha` | Opacity in Portrait / Landscape |
| `pVisible` / `lVisible` | Visibility in Portrait / Landscape |
| `pImage` / `lImage` | Texture swap in Portrait / Landscape |
| `align` | Screen anchor: `'Center'`, `'Top'`, `'Bottom'`, `'Left'`, `'Right'` |

When orientation changes, `App.resizeObj(container)` traverses objects and applies the corresponding property set automatically.

## 5. Network Abstraction & Store Redirection

- **Encapsulation**: Network-specific SDK handling (e.g. MRAID `mraid.open()`, IronSource DAPI, Google Ads `ExitApi.exit()`) is isolated in `core/networks/`.
- **Unified Call**: Game code triggers store navigation exclusively via `window.App.network.ctaClick()` or `Network.addClickToStore(gameObject)`.
- **Analytics Bridge**: AppLovin Axon tracking (`trackAxonEvent`) is intercepted and automatically dispatched or shimmed safely on other networks.

## 6. Audio Lifecycle

- **Autoplay Restriction Compliance**: Mobile browsers and ad platforms block unmuted audio without prior user gesture.
- **Policy**: `Scene.preload()` sets `sound.mute = true` until the first `pointerdown` event occurs, which un-mutes the audio context and begins playback.

## 7. Multi-Version Flow Management

- `config.js` defines versions with custom scene flows and asset whitelists (`versions.full`, `versions.clicks10`, etc.).
- `src/StateManager.js` tracks level completion and progression through the flow at runtime.
- Allows building multiple variants (A/B testing, click-limit vs time-limit) from the same codebase without code branching.
