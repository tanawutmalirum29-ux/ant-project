# UI RENOVATION V1 | G3 COORDINATOR CANVAS BRIDGE

**Owner:** COORDINATOR-2 | **Issue:** #143 | **Status:** API_PUBLISHED / END_TO_END_G3_PENDING

The original `UI.bindCanvas()` owns **all** pointerdown/move/up/cancel,
pinch, and map commit interactions. Neither UI-05 nor other feature modules
may register another map pointer listener or issue a second commit on pointerup.

## Read-only view

`view.rooms.canvas` exposes fresh copies (not mutable `ui` references):

- `digPreview: {from:{x,y},to:{x,y}}|null` — drag in progress or selected preview.
- `digSelection: {from:{x,y},to:{x,y}}|null` — persisted selected excavation rectangle from the actual canvas.
- `roomPreview: {from:{x,y},to:{x,y},dragging:boolean}|null` — actual canvas preview.
- `roomType: string|null` — existing authoritative room picker value.

Update via existing `subscribe(view)`; no added game loop.

## Actions

- `actions.selectRoomType(type)` — validates ROOM_CATALOG, updates the existing
  `#room-type` picker and triggers its real `change` listener (when available).
  The UI-05 CSS chooser must call this to keep real tap/drag placement consistent.
- `actions.clearDigSelection()` — clears the authoritative
  `UI.digSelection` and `digPreview`, not just a feature's local anchor.
- `actions.applySelectedDig(cancel:boolean)` — if selected rectangle exists,
  invokes the existing `UI.applyDigSelection` **once** and forwards
  `{ok:true,data:{added/existing/cancelled/...}}`; otherwise
  `{ok:false,error:{code:'NO_DIG_SELECTION'}}`.
- Original `roomPlan/validateRoom/queueRoom/cancelRoom/inspectDig/queueDig/cancelDig`
  remain unchanged for explicit button actions. Do not autoqueue based only on a subscription update.

## Required UI-05 adaptation (Engineer-C #143)

1. Prefer `view.rooms.canvas.digSelection` when showing the selected real drag
   rectangle; do not synthesize a different selection using only
   `home.selected` or revert after 'clear'.
2. Use `selectRoomType()` to keep real Canvas and picker in sync.
3. Use `applySelectedDig()` and `clearDigSelection()` to act on the real
   selected canvas rectangle. If no selected rectangle is present, disable
   misleading cancellation, not a fabricated 'cleared' state.
4. Keep the real legacy canvas semantics: room quick tap=2x2,
   drag inclusive rectangle area >=4 up to 8x8, no commitment on
   pointercancel or multitouch; dig existing area gets a selection for add/remove.
5. Render real validation and action failures; no invented positive response.
6. Do not open a second pointer/click handler on the game Canvas.

This G3 API publication is **not** G3 acceptance; cross-browser 14-viewport
functional QA, true map hit testing, and final legacy retirement remain required.
