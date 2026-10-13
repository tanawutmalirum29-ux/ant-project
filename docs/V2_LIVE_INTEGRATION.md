# V2 Live UI integration — U5-compatible

This is a **UI integration only** on top of U5 gameplay and V2 visual assets.
- Production stylesheet order: `styles.css`, `v1.css`, `v2.css` (enabled).
- Visual CSS bridge adds accessible three-tool mobile dock for inspect, dig and build room.
- Room palette, nurse/forage allocation and room summary remain driven by existing U5 controllers.
- No changes to Game Logic, U5 room state, event listeners, canvas map, or resource accounting.
- Original vector ant/room sprites remain **preview-only**; renderer artwork is not implemented by this merge.

## Release checks
1. `npm test` for U1–U5 including V2 integration contract.
2. `npm run build` and confirm stylesheet in `dist/src/ui/visual/v2.css`.
3. `python tools/browser-v2.py`: separate V2 static interactive preview, five viewport checks.
4. `python tools/browser-v2-live.py`: replays real U5 room placement/cancellation/construction/reset in Chrome with V2 CSS injected, five viewports.
5. AWS live URL / physical phone: separately verify; not asserted by CI.

The U5 original test is dynamically reused for visual verification, not edited; bugs outside CSS scope should be reported to gameplay owner without modifying source.
