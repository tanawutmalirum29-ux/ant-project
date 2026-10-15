# ANT KINGDOM UI RENOVATION V1 — RESPONSIVE WIREFRAMES & PLAYER FLOWS

**DESIGN REFERENCE, NOT IMPLEMENTED SCREENS.** Shell coordinator must translate these wireframes to CSS layouts, measure real render boxes and provide browser screenshots. Geometry must adapt to safe areas, 200% browser text, display cutouts, and virtual keyboard. No invented game features.

## 1. Mobile portrait — 320 × 568 through 430 × 932

```text
┌───────────────────────────────────┐
│ 🍂 ANT KINGDOM  [วัน/เวลา] [⚙]   │ ← compact header, safe-area aware
│ [อาหาร·โปรตีน·น้ำ] [▶/Ⅱ · ×1]    │ ← concise status; expand on tap
├───────────────────────────────────┤
│                                   │
│         CANVAS: GAME WORLD        │ ← pan/pinch/tap preserved
│                                   │
│  [tile/ant short info badge]*      │ ← not a floating giant inspector
│                                   │
│ [context hint / confirm / cancel] │ ← only during active map targeting
├───────────────────────────────────┤
│ [สำรวจ] [สั่งขุด] [สร้าง] [เมนู]   │ ← 44+ px touch navigation
│ [พื้นผิว]           [ใต้ดิน]       │ ← scene mode, safe area
└───────────────────────────────────┘
* selecting a tile/ant opens the single coordinated inspector sheet.
```
- `เมนู` reveals ant roster, military A/B, milestones, world/settings access; never a native OS select. Military can have a small contextual badge in HUD when threatened, not a permanent right-hand 3-button lane on a 320px phone.
- In **inspect mode**, tile/ant context banner may appear; tap to expand details. In **dig/build/rally target mode**, the same context region becomes `command info + Cancel`; it never appears beneath the toolbar.
- A heavy sheet uses a dedicated overlay: header + close fixed within sheet, content scroll, footer action accessible above safe area. It may use a 55% height compact state and expand to fit screen; it must not cover actions that remain visually enabled behind it.
- Only one heavy sheet open, no competing Nursery + military + population windows. Underlying map gestures intentionally blocked while heavy modal, intentionally permitted with narrow nonblocking inspector.
- Hide low priority decorative title/region blurb before hiding player actions. Resources/speed remain discoverable by <=2 interactions.

## 2. Landscape — especially 568×320 / 667×375 / 844×390

```text
┌────────────────────────────────────────────────────────────┐
│ [ANT] [stock/time compact]           [speed] [⚙]          │
├──────┬──────────────────────────────────────────────┬──────┤
│[⌕]   │                                              │[🐜]  │
│[⚒]   │             MAP CANVAS                       │[⚔]  │
│[▣]   │                                              │[◫]  │
├──────┴────────[surface] [underground]───────────────┴──────┤
└────────────────────────────────────────────────────────────┘
```
- Use icon rail with accessible labels/title where space is restricted. The military/status shortcut moves into one small command rail entry; no buttons spanning the center of the visible map.
- Settings, combat, eggs, ant list and room palette use a **single confined side panel** occupying at most available area with internal scroll, or a near-full-screen modal with explicit close. No viewport-exceeding menu; no offscreen submit/cancel. Height is a primary responsive input.
- On short landscape, map target command banner is anchored to a safe reserved edge without covering the map target or scroll controls.

## 3. Tablet portrait/landscape — roughly 681–1199px

```text
┌─────────────────────────────────────────────────────────────┐
│ Brand   resources / status / speed / settings / milestone    │
├──────┬──────────────────────────────────────────────┬───────┤
│ Tool │                                              │Context│
│ rail │                MAP CANVAS                    │details│
│      │                                              │       │
│      │                                              │       │
├──────┴──────────────────────────────────────────────┴───────┤
│               layer / action status                        │
└─────────────────────────────────────────────────────────────┘
```
- Inspector uses one fixed-width slot up to the allocated available width; it is not an overlay over the right game speed/tool column. If insufficient room, migrate to sheet automatically.
- A management sheet may temporarily replace right inspector but must not create duplicate live selection controls or floating combat dock.

## 4. Desktop 1200–1920+px

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ANT KINGDOM     resources / time / population           speed / settings   │
├────────┬─────────────────────────────────────┬─────────────────────────────┤
│World   │                                     │ Context detail (tile/ant)   │
│Tools   │            MAP CANVAS               │ Real data; fixed slot      │
│inspect │                                     │                             │
│dig     │                                     │                             │
│build   │                                     │                             │
│army    │                                     │                             │
├────────┴────────────[ surface / underground ]┴─────────────────────────────┤
└────────────────────────────────────────────────────────────────────────────┘
```
- Heavy military and settings panels use coherent CSS-styled dialogs, max-width/max-height, focus trap and scroll; not a native-looking OS sheet. Distinguish nonblocking inspector from blocking management dialog.
- No unbounded overlay growth on 1920px displays. All status chips should cap visual width and use readable numbers.

## 5. Feature page sketches / player journeys

### A. Main HUD
Persistent = world/map + real essential status + clear mode indicators. Expandable = full inventory, mission details, debug, global settings. One unambiguous selected tool at a time, with selected/disabled feedback. Keyboard shortcuts never activate while an editor/dropdown/dialog owns focus.

### B. Army Command
```text
[<] ศูนย์บัญชาการทหาร [×]
[ทหาร N] [ศัตรู N] [นางพญา HP]
[ กอง A ] [ กอง B ]   ← selected state obvious
[Current order / arrive / formation / HP]
[ป้องกัน] [รวมพล] [ถอยและพักฟื้น]
[Filter by squad/role]  ← custom CSS picker
[Soldier card] [HP] [inspect] [transfer]
...
[Status and blocked reason]
```
Tap Rally → sheet dismisses → banner "กอง A · เลือกช่องรวมพล | ยกเลิก" → real map tap → authoritative game reply → toast & restore context. Squad B is never silently replaced by A. No visible old workforce percentage/recruitment UI.

### C. Ant Roster and Inspector
```text
[<] มดในอาณาจักร [×]
[ประชากร N /150]  [เริ่มต้น] [มดขุด] [มดหาอาหาร] [...]
[filter profession] [filter Lv] [search]
[ มด #ID    Lv   สถานะ   [ดู] ]
...
  → detail within same sheet:
[ชื่อ/บทบาท/เลเวล]
[HP where relevant] [งาน] [ชั้น/ตำแหน่ง] [ของที่ขน]
[ติดตามบนแผนที่] [ย้อนกลับ]
```
For 320px avoid a 6-column unscrollable table; use cards and filters. Never let scrolling the roster cause map scrolling.

### D. Nursery
```text
[<] ห้องฟักไข่ 2×2 [×]
[ช่องฟัก ◉ ◉ ◯ ◯] [2/4] [สถานะห้อง/นางพญา]
[อาชีพ ▼ CSS picker] [Lv ▼ CSS picker]
[อาหาร x] [โปรตีน y] [เวลา(เมื่อฟักจริง)]
[ข้อจำกัด / ต้นทุนจริง]
[ + สั่งฟักไข่ ]  ← disabled reason explicit
[คิวไข่ ...]
  [อาชีพ Lv] [สถานะ] [progress only if incubating] [ยกเลิก if QUEUED]
```
Selecting another room either closes/rebinds the current sheet with clear context, never sends command to stale room. Wait for queen/pickup/route ≠ countdown to hatch. Queued cancellation/refund never offered for later stages.

### E. Room Construction and Dig
```text
[สำรวจ | ขุด | สร้าง] tool modes
Build: [ประเภทห้อง ▼ CSS] [ต้นทุน] [2×2 preview]
       [แตะตำแหน่งบนแผนที่] [Cancel]
       → valid preview ↦ queue result / error reason
Dig:   [ลากกำหนดพื้นที่] [เลือกอยู่ N ช่อง]
       [สั่งขุด] [ยกเลิกขุด] [ยกเลิกเลือก]
```
Do not make build menu appear while rally targeting or while surface disables room building. No accidental dig application from dismiss taps.

### F. Settings and Seed
```text
[<] ตั้งค่า [×]
[โลกปัจจุบัน: ANT-001]
[Seed ใหม่: __________]  ← native text field; selection/paste allowed
[สร้างโลกใหม่ ...]
  → CSS-styled confirmation:
  "สร้างโลกใหม่จาก Seed นี้จะเริ่มโลก/ความคืบหน้าใหม่"
  [กลับไปแก้]  [ยืนยันสร้างโลกใหม่]
[การแสดงผล/เข้าถึง]  ← only real wired settings
[เครื่องมือ Debug]    ← visually labeled development
```
Cancel must not modify world and cannot click through. Keep confirmation content reachable above iOS/Android virtual keyboard; reset must clean stale UI/targeting/selection via existing game flow.

## 6. Navigation / overlap arbitration

| Initiating from → opening | Expected result on narrow phone |
|---|---|
| map select → ant detail | inspector sheet; tap outside dismisses if not editing |
| room selected → Nursery | same sheet slot occupied by Nursery; selected room remains tracked |
| Nursery → army | Nursery closes/suspends, army takes sheet slot; no visible overlap |
| building → army | abort/pause building *UI preview*, never silently cancel booked room; army opens |
| army → rally targeting | close army sheet, show map banner with Cancel; real squad preserved |
| targeting → settings | targeting cancelled or explicitly paused via single coordinator transition; no armed invisible map target |
| ant roster → Settings | close roster; Settings modal uses keyboard-safe height |
| any panel → Seed confirmation | only modal; no clickable game underneath |
| dropdown open → ESC | close dropdown FIRST; second ESC closes sheet |
| keyboard open → close/cancel | always tappable in visual viewport |
| toast → any other control | toast is noninteractive and in reserved region |

**Design QA gate:** Compare each rendering with reference screenshots and physical DOM hit testing; navigation paths must be independently verified on Chromium and WebKit. This file is design guidance only and does not claim implementation completion.
