# Project Context

## Overview

High-performance HTML5 playable ad framework built on Phaser 3 and bundled via Webpack 5. It produces single-file self-contained HTML ads or network-specific ZIP bundles for major ad networks (AppLovin, Meta/Facebook, Google Ads, Mintegral, Moloco, UnityAds, IronSource, Liftoff, TikTok, Vungle).

## Tech Stack

- **Game Engine**: Phaser 3 (custom lightweight build `core/libs/phaser-custom.min.js`)
- **Language**: Vanilla JavaScript (ES6 modules)
- **Bundler & Pipeline**: Webpack 5 + custom Node.js `BuilderPlugin` (`core/builder/`)
- **Asset Processing**: `imagemin` (pngquant, mozjpeg), `audiosprite` (ffmpeg), `base64-img`
- **Optional Extensions**: SpinePlugin (`core/libs/SpinePlugin.min.js`), Matter.js physics

## Main Architectural Systems

1. **Asset Pipeline (`core/builder/`)**: Offline processing that compresses, converts, and inlines all textures, audio, fonts, and Spine rigs into `window.App.resources` as base64 strings.
2. **Responsive Canvas & Container (`core/framework/App.js`, `Scene.js`)**: Dynamic viewport resize centering a 600x900 logical coordinate container (`mainContainer`) scaled uniformly to fit screen dimensions.
3. **Reactive Layout System (`core/framework/Utils.js`)**: Responsive property setters (`px`/`py`/`lx`/`ly`, `pScaleX`/`lScaleX`, `align`) attached to Phaser game objects that react to orientation changes without recreating objects.
4. **Ad Network Abstraction (`core/networks/`)**: Unified interface (`Network.js` and subclasses) for store redirection (`ctaClick`) and ad analytics (e.g. AppLovin Axon tracking).
5. **Flow & State Progression (`src/StateManager.js`)**: Config-driven multi-variant / multi-level progression configured in `config.js` (`config.versions`).

## Key Project Conventions

- **Assets**: Never load assets from URL paths at runtime. Place raw files into `assets/` and access them via Phaser keys populated by `Preloader.js`.
- **Game Objects**: Add objects to `this.mainContainer` and configure reactive orientation properties (`px`/`py`, `lx`/`ly`).
- **Store Redirection**: Always invoke `window.App.network.ctaClick()` (or `this.finalWindow`) for CTA actions.
- **Audio**: Keep the auto-mute policy intact. Audio un-mutes only on the first user interaction.

## Further Documentation

- Architecture details: [`docs/architecture.md`](/Choices/docs/architecture.md)
- Durable technical decisions: [`docs/decisions.md`](/Choices/docs/decisions.md)
- Global agent rules: [`.agents/rules/project-rules.md`](/Choices/.agents/rules/project-rules.md)