# UI Cross-Platform Implementation Standard — Ant Kingdom

**Purpose:** Same in-game controls and interaction model across Android Chrome, iOS Safari/WebKit and desktop browsers. This is an engineering specification; organization authority is only [appointment-CEO/RULES.md](https://github.com/tanawutmalirum29-ux/appointment-CEO/blob/main/RULES.md).

## Core requirement

- Every visible selection or action UI (profession, level, rooms, ant selection, soldier assignment, cancellation and new menus) **must be implemented as DOM elements styled by the game's CSS**, not a native system select popup, JavaScript `alert()` / `confirm()` / `prompt()`, or `window.showPicker()`. Native HTML elements may remain hidden as the authoritative underlying value and event source for compatibility; users must interact only with the custom in-game UI.
- Prefer shared controls: `src/ui/visual/game-choice.js` + `game-choice.css` enhances every `#app select` except `#room-type`, which already uses `room-picker.js`. Do not add a new visible native `<select>`; any new select **must** be enhanced automatically or explicitly documented and tested as an input-only accessibility exception.
- Preserve mouse, touch, drag map, two-finger pinch, keyboard and screen reader functionality: real buttons, proper accessible labels, 44px or larger hit targets, `aria-expanded` / `aria-selected` / roles, focus restoration, Escape/outside tap closing, and scrollable option lists. Do not disable typing, paste or native keyboard for text-entry fields.
- Do not alter simulation state from presentation code except through the existing UI/game command APIs and their real `input`/`change` events. CSS must not hide an entire interaction behind non-interactive overlays. Prefer solid fallbacks for advanced CSS features.
- Respect viewport width (320px, 390px, tablet, desktop), landscape, `safe-area-inset-*`, reduced motion, virtual keyboards, `dvh`, and scrollable small drawers. Avoid OS-dependent default style and relying on CSS to style native option sheets.

## Required QA

1. `npm test` and `npm run build`.
2. Real browser event/touch interactions using Playwright **Chromium and WebKit** on mobile-sized viewports, not only checking markup or mocked elements. WebKit on Linux is a useful engine approximation, **not proof of real iOS Safari hardware**.
3. Test open/choose/cancel, keyboard navigation, programmatic value and events, scrolling, tap targets, collisions with military A/B, map, dig and Nursery overlays, and any legacy flows affected.
4. CI `game-choice-qa.yml` enforces the current selectors. Expand the static tests and real-browser scenarios when new selector classes are added. Never claim full iOS/Android device compatibility from Chromium alone.

## Existing choice controls

| Control | User-visible implementation | Underlying game value |
|---|---|---|
| Room type | CSS `.room-picker` | `#room-type` |
| Nursery profession | CSS `.game-choice` | `#nursery-profession` |
| Nursery level | CSS `.game-choice` | `#nursery-level` |

**Rule of review:** Any PR adding a browser-native visible selection popup without a game-styled replacement must be reworked before merge.
