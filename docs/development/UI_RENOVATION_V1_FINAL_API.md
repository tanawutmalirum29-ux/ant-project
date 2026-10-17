# ANT KINGDOM — UI RENOVATION V1 / G1 FINAL API CONTRACT

**Interface version: G1.0** · **Code:** `src/ui/renovation/shell.js`, `ui-adapter.js`, `shell.css`, `src/main.js`. This describes concrete implemented signatures. The exact freeze SHA and CI evidence are issued **separately in Issue #138 only after tests finish**. Until then this file is a validated API specification, not a start signal.

## 1. Lifecycle and file ownership

- **Coordinator owns:** `src/ui/renovation/shell.js`, `shell.css`, `ui-adapter.js`, `src/main.js`, `src/ui/app.js`, `src/ui/combat-controls.js`, `index.html`, legacy CSS and QA wiring.
- **Engineers own only their feature .js/.css and focused tests:** A: `home.js`, `home.css`, `settings.js`, `settings.css`; B: `military.js`, `military.css`, `ants.js`, `ants.css`; C: `nursery.js`, `nursery.css`, `rooms.js`, `rooms.css`.
- Existing UI remains **visibly unchanged at G1**. `createRenovationShell()` creates nine real DOM regions in `#ui-renovation-root` with `root.hidden===true`. Only Coordinator activates feature layout when complete and validated in G3. Do not unhide or insert a new global HUD from a feature module.
- Engineer features are **pure DOM/CSS components**. No new `setInterval`, animation frame, game simulation, global style placement, body-appended dialog, direct `Game` writes or OS-native popup.
- PRs go to branch `feat/ui-renovation-v1-integration`. Each Issue #139–#144 receives exact PR, full SHA, screenshots/QA and result.

### Concrete module interface

```js
// Each feature module exports the following function.
export function mount(container, {view, actions, overlay, subscribe}) {
  // container = DOM SECTION created by shell inside that feature's region.
  // view = immutable-by-contract PLAIN snapshot, no engine/game references.
  // actions = verified existing-Game command façade (see below).
  // overlay = UIOverlayController instance (never instantiate your own).
  // subscribe(handler) -> unsubscribe function; handler receives fresh view.
  const unsubscribe = subscribe(snapshot => {
    // Update DOM text, classes, rows in-place, preserving focus and scroll.
  });
  return () => { unsubscribe(); /* remove owned listeners/observers */ };
}
```

Coordinator invokes `shell.mountFeature(name, {mount}, {adapter,region})` after G3. It returns `unmount()`. Invalid mounts reject without leaking the created container. Optional `update(view)` belongs within a feature module; not required as export. `adapter.subscribe(callback,{immediate=true})` sends a snapshot immediately and then at most from current existing HUD update cadence (~150ms) plus accepted actions, without creating an additional game loop. Unsubscribe **must** be called by the feature cleanup. The facade uses current `ui.game` every call, so a confirmed Seed reset cannot keep a stale Game pointer.

### Named shell regions and stacking

`shell.getRegion(name)` and `shell.regions[name]`, with exactly:

```text
HUD_TOP                10
PRIMARY_COMMAND        10  (includes ONE layer-toggle; no LAYER_NAV)
MAP_VIEWPORT            0
MAP_ACTION             15  (targeting/cancel)
CONTEXT_INSPECTOR      20
PRIMARY_SHEET          40
MODAL                  60  (backdrop 59)
TOAST                  50
DEV_ONLY               70
```

`shell.root`, `shell.overlay`, `shell.dispose()`, `shell.preview(bool)`. `preview` exists for Coordinator/browser harness **only**, never in production gameplay. Shell layout tokens handle safe-area, narrow portrait five-command grid (minimum 44px), height-first landscape rail, tablet and desktop. Feature CSS cannot move structural regions with viewport-fixed coordinates.

### Overlay Controller

```js
overlay.registerPanel(id,{element,kind,show?,hide?}) // returns unregister()
overlay.openPanel(id,{opener?,context?}={})            // {ok:true} or {ok:false,error:{code}}
overlay.closePanel(id,reason='dismiss')                // boolean
overlay.closeTop(reason='dismiss')                     // boolean
overlay.closeAll(reason='world-reset')
overlay.isOpen(id)                                     // boolean
overlay.setWorldMode('inspect'|'dig'|'room'|'rally')    // {ok,mode} or error
overlay.subscribe(listener)                           // returns unsubscribe()
overlay.onVisibilityChange(listener)                  // alias of subscribe
overlay.dispose()                                     // removes key listener, panels
```

Kinds: `inspector`, `popover`, `sheet`, `modal`. A new sheet or modal closes previous overlays; a popover cannot open over modal. Escape closes the topmost registered panel first and restores focus when valid; the controller handles `<dialog>.showModal()/close()` for registered modals. Modules must explicitly register/unregister their own panel DOM; old DOM dialogs remain under legacy control until Coordinator's G3 migration. Panel container visibility does not grant permission to issue map commands.

## 2. View model fields (snapshots, not mutable Game references)

Call `adapter.view` or receive `subscribe(view)` callback. Returned objects/lists are copies of live game state.

```text
view.home:
  layer ('surface'|'underground'), tool ('inspect'|'dig'|'room'),
  speed, seed, population, maxPopulation, resources {carbs,protein,water},
  selected {layer,x,y}|null, selectedAntId|null, targeting, timeTicks

view.ants:
  population, capacity, queen: AntSnapshot|null, workers: AntSnapshot[]
  AntSnapshot:
    id,profession,caste,level,state,layer,x,y,alive,squadId|null,
    hp|null,maxHP|null,cargo {type,amount}|null, broodCargo:boolean

view.military:
  squads: [
    {id:'A'|'B',mode,rally:{layer,x,y}|null,
     soldiers:[{id,hp,maxHP,layer,x,y,state,formationStatus,arrived}],
     count,hpCurrent,hpMax,ralliedCount,formation,queenEmergency}
  ],
  selectedSquad:'A'|'B',targeting,enemyCount,queenHP,queenHPMax

view.nursery:
  selectedRoomId|null,
  rooms:[{id,type,status,connected,x,y,width,height,progress,ticks,cost,
    stock,slots,used,free,orders:[{id,roomId,profession,level,status,slot,
       cost,remainingTicks,hatchTicks,canCancel}]}],
  eggCount,broodCount,totalPopulation,maxPopulation

view.rooms:
  items:[{id,type,status,connected,x,y,width,height,progress,ticks,cost,stock}],
  catalog:[{type,name,width,height}], limits:{minArea,maxWidth,maxHeight}

view.settings:
  seed
```

Soldier max HP = source `game.combat.maxHP(ant)` (Lv1=16, Lv3=22, Lv5=28), **never hard-code /16**. Nursery default is 2×2 and 4 slots, resizable capacity is `min(width*height,16)`; room rectangle constraints `area>=4`, `width<=8`, `height<=8`. Nursery statuses are real simulation statuses, **not a fabricated permanent LAID/HATCHED queue**.

## 3. Exact actions (all on `adapter.actions`)

Methods return `{ok:true,...}` or `{ok:false,error:{code,message?}}` unless explicitly documented. For engine APIs that return their own result, the bridge forwards it. Never claim success based on a button click alone.

```js
switchLayer(layer)                         // 'surface'|'underground'
toggleLayer()                              // current state → other in ONE tap
setTool(tool)                              // 'inspect'|'dig'|'room'; room/dig underground
setSpeed(speed)                            // 0|1|2|4
zoom(factor)                               // positive finite number
recenter()
focusAnt(id)                               // scrolls camera once; not continuous Follow
selectSquad(id)                            // 'A'|'B'; requires real CombatControls
setSquadMode(id,mode)                      // 'defend'|'rally'|'retreat'
setSquadRally(id,{layer,x,y})              // authoritative path/rally validation
transferSoldier(antId,toSquadId)
startRally()                               // enters old real map-target handler
cancelTargeting()
nurseryCost(profession,level)              // cost object or null (read-only)
queueEgg(roomId,profession,level)          // lifecycle.queueEgg result
cancelEgg(eggOrderId)                      // {ok:true} or EGG_NOT_CANCELLABLE
roomPlan(type,width,height)               // scaled plan object or null
validateRoom(type,x,y,width,height)       // real rooms.validate result
queueRoom(type,x,y,width,height)          // real rooms.queue result
cancelRoom(roomId)                         // {ok:true} or ROOM_NOT_CANCELLABLE
inspectDig(from,to)                        // real colony.inspectRectangle result
queueDig(from,to)                          // {ok:true,data:rectangleResult}
cancelDig(from,to)                         // {ok:true,data:rectangleResult}
requestWorldReset(seed)                    // {ok:true,requiresConfirmation:true,token,seed} or error
cancelWorldReset()                         // {ok:true}; no Game mutation
confirmWorldReset(token)                   // requires matching live token, calls existing onNewWorld ONCE
```

- For UI-06: confirmation is REQUIRED. Form must call `requestWorldReset` first, then a separate visible confirmation action calls `confirmWorldReset(token)`. On cancelling, call `cancelWorldReset()`. The old Seed dialog has **not yet been migrated**; Coordinator performs that G3 wiring, not Engineer A.
- `startRally` uses existing CombatControls, not an invented placement loop; `setSquadRally` uses Game Combat API (returns real unreachable/invalid reason). On accepted command, clear old targeting.
- `focusAnt` moves camera once; **continuous Follow is NOT part of G1 API**. Engineer B may propose it later; must not silently implement tracking with duplicate loops.
- `setTool('dig'|'room')` on surface returns `UNDERGROUND_ONLY` without changing the active tool.
- Popover and panel state belongs to `overlay`, not to another module's private global variable. For any additional API field or command, post `API_REQUEST` in the Engineer Issue and link Issue #138 rather than reading game internals directly.
- Do not call `confirmWorldReset` except in a real user confirmation handler. No automatic reset through `subscribe` or `update`.

## 4. Example usage (illustrative, does not implement any feature)

```js
export function mount(container,{view,actions,overlay,subscribe}){
  const btn=document.createElement('button');
  btn.type='button'; btn.className='ui-feature-action';
  const redraw=next=>{
    btn.textContent=next.home.layer==='underground'?'ใต้ดิน':'พื้นผิว';
    btn.setAttribute('aria-label','ชั้นปัจจุบัน '+btn.textContent+' แตะเพื่อสลับชั้น');
  };
  btn.addEventListener('click',()=>actions.toggleLayer());
  container.append(btn);
  const off=subscribe(redraw);redraw(view);
  return ()=>{off();btn.remove();};
}
```

**The example is not an authorization to create a second toolbar**. Coordinator alone decides which final module owns the unique layer control and migrates the existing two-button legacy UI in G3.

## 5. G1 acceptance and G3 release boundary

G1 candidate gate: full `npm test`, `npm run build`, browser shell geometry and actual pointer/keyboard events in Chromium and WebKit at 320×568,390×844,568×320,844×390,768×1024,1440×900; original Nursery and other baseline gameplay tests as available. Browser screenshot artifacts attached to the CI run. **G1 shell is dormant while legacy UI runs.** The job proves shell geometry, adapters and baseline coexistence — **not** the six finished UI modules or absence of every existing HUD overlap.

Once CI on exact candidate SHA passes, Coordinator posts `G1_FROZEN` with SHA and links to Issues #138, #139, #140, #142; those three may begin their EXCLUSIVE feature implementation only through an explicit START comment. The independent QA reviewer performs broad combined 14-size/panel-pair QA at G4; PR #146 remains Draft and cannot merge to main until G4 acceptance.
