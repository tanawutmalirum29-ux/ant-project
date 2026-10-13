# V2.1 UI corrections — selection overlay, map zoom, custom room chooser

Requested UI ownership changes only; U5 gameplay code in `src/ui/app.js`, `src/core/**`, `src/render/**` stays untouched.

1. **Selection card**: move below desktop right controls; separate from debug panel. On narrow/mobile screens selection remains on the left; when debugging on very small screens, temporarily conceal it visually while retaining the actual selected cell, restoring it on debug close.
2. **Map-only zoom**: mobile viewport fixed to 1x, double-tap page zoom disabled, iOS document gestures prevented; `#game-canvas` retains touch-action none and U1 camera pinch/wheel/zoom buttons.
3. **Room choice**: generate an original CSS-styled, keyboard-accessible room type list from the existing `#room-type` select options. The original select remains the authoritative value, receives `change` events and updates original U5 cost/room creation handlers. Without JS, the native select remains usable. No room types, costs, capacities, or game logic are altered.

## Verification
- `npm test`
- `npm run build`
- `python tools/browser-v2-ui-fix.py` U5 live game + new UI scripts at 320×568, 390×844, 768×1024, 844×390, 1440×900.
- `python tools/browser-v2-live.py` existing U5 room construction/return/reset at same viewports, without changing original gameplay harness.
- AWS Amplify and physical iOS devices are separate manual verification (not implied by browser CI).
- Out-of-scope defects: report reproduction, location and expected/actual; do not modify gameplay files.

### Accessibility note
Per request the **webpage** uses `user-scalable=no`; operating-system accessibility zoom may still be available, but browsers' page-zoom accessibility is reduced. Map zoom is deliberately left enabled.
