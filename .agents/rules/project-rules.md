---
trigger: always_on
---

# Project Rules

## 1. Source of Truth

Inspect existing code and documentation before making non-trivial modifications:
- [`docs/project-context.md`](file:///d:/playable_gen_2/Cash%20Inc%20Fame/Choices/docs/project-context.md) — High-level overview and stack.
- [`docs/architecture.md`](file:///d:/playable_gen_2/Cash%20Inc%20Fame/Choices/docs/architecture.md) — Architecture and reactive orientation system.
- [`docs/decisions.md`](file:///d:/playable_gen_2/Cash%20Inc%20Fame/Choices/docs/decisions.md) — Durable technical decisions.

Do not invent architecture or present assumptions as verified facts.

## 2. Playable Ad Constraints

- **Self-Contained Output**: Never introduce external CDN links, network `fetch` calls, or runtime asset path loading. All assets must live in `assets/` and be processed by the Webpack build pipeline.
- **Store Redirection & Analytics**: Always use `window.App.network.ctaClick()` or `Network.addClickToStore()`. Never use raw `window.open()`.
- **Responsive Layout**: Add game objects to `this.mainContainer` and configure reactive properties (`px`/`py`, `lx`/`ly`, `pScaleX`/`lScaleX`, `align`) rather than hardcoding screen pixel coordinates.
- **Audio Autoplay Compliance**: Do not unmute or trigger audio before the first user pointer interaction.

## 3. Scope & Code Discipline

- **Minimize Unrelated Changes**: Modify only what is strictly necessary for the requested feature or fix. Avoid opportunistic refactoring, reformatting, or dependency changes.
- **Preserve Existing Patterns**: Extend existing managers and utilities (`Utils`, `StateManager`, `Button`, `Scene`) rather than introducing parallel systems.

## 4. Verification & Integrity

- When changing resources, configurations, or the build pipeline, only run a production build check (`npm run prod`) in exceptional cases, unless the user has requested it.

## 5. Git & External Actions

Never execute `git commit`, `git push`, branch manipulation, or publishing actions without explicit user instruction.
