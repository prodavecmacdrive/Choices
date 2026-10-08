# Architecture Decisions

This document records durable technical decisions that future agents should preserve.

### 2026-09-25 — Base64 Inlined Asset Pipeline

**Decision**
Encode all textures, audio sprites, TTF fonts, and Spine rigs into base64 payload strings injected into HTML templates at build time via `core/builder/`.

**Reason**
Ad networks require completely self-contained single-file HTML or offline ZIP packages with no external HTTP requests.

**Consequences**
Runtime dynamic URL fetching (`this.load.image('key', 'url')`) is prohibited. All game assets must be placed in `assets/` subdirectories and unpacked from `window.App.resources` during `Preloader`.

---

### 2026-09-25 — Fixed 600x900 Logical Space with Reactive Properties

**Decision**
Use a fixed 600x900 logical coordinate base centered within a responsive `mainContainer`, using `Utils.addDefaultProperties` (`px`/`py`, `lx`/`ly`, `pScaleX`/`lScaleX`, `align`) for orientation changes.

**Reason**
Avoids recreating scenes or managing duplicate layout code when the device switches between portrait and landscape.

**Consequences**
Game objects added to `this.mainContainer` must use reactive property setters rather than hardcoded global screen coordinates.

---

### 2026-09-25 — Audio Mute Until First User Gesture

**Decision**
Keep audio muted on launch and unmute only on the first `pointerdown` interaction in `Scene.preload()`.

**Reason**
Complies with browser autoplay policies and ad network guidelines, preventing sound playback failures.

**Consequences**
Do not attempt to force audio playback before user interaction.

---

### 2026-09-25 — Centralized Network SDK Abstraction

**Decision**
Route all store redirections and ad lifecycle events through `core/networks/` (`window.App.network.ctaClick()`).

**Reason**
Each ad network (MRAID, DAPI, Google ExitApi) handles store redirection and analytics differently. Direct `window.open` calls fail or violate network specifications.

**Consequences**
Game scenes and UI buttons must call `window.App.network.ctaClick()` for all CTA / store actions.