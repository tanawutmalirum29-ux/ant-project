import { SURFACE, UNDERGROUND, cellAt, portalAt, TERRAINS } from '../world/generate.js';
import { isDiggable } from '../world/navigation.js';
import { formatGameTime } from '../core/time.js';
import { LIFE } from '../core/lifecycle.js';
import { ROOM_CATALOG, roomPlan, ROOM_LIMITS } from '../core/rooms.js';
import { terrainName, resourceVisualState } from '../render/renderer.js';
import { antAtPointer, antById, antsAtTile, renderAntInspector } from './ant-inspector.js';
const $ = (id) => document.getElementById(id);
const RESOURCE_NAMES = Object.freeze({
  carbs: 'อาหาร · เมล็ดและน้ำหวาน',
  protein: 'โปรตีน · แมลง',
  water: 'น้ำ'
});

/** One concise existing selection card; progress means fraction of the next unit. */
export function resourceSelectionText(node) {
  const state=resourceVisualState(node);
  const capacity=state.capacity===null?'—':state.capacity;
  const details=`คงเหลือ ${state.amount}/${capacity} · พร้อมเก็บ ${state.available} · จอง ${state.reserved}`;
  const recovering=state.progress!==null && state.ratio<1
    ? `ฟื้นหน่วยถัดไป ${Math.floor(state.progress*100)}%` : '';
  const note=state.status==='recovering' ? (recovering || 'รอฟื้นตัว')
    : state.status==='depleted' ? 'หมดแล้ว'
    : state.status==='low' ? `เหลือน้อย${recovering?' · '+recovering:''}`
    : state.ratio>=1 ? 'เต็มความจุ'
    : `มีทรัพยากร${recovering?' · '+recovering:''}`;
  return { title: RESOURCE_NAMES[node.type] ?? 'แหล่งทรัพยากร', details, note };
}

/** Short labels fit the existing time pill even on narrow mobile HUDs. */
const WEATHER_HUD_LABELS = Object.freeze({
  clear: Object.freeze({ short: 'ปกติ', full: 'อากาศปกติ' }),
  rain: Object.freeze({ short: 'ฝนตก', full: 'ฝนตก' }),
  dry: Object.freeze({ short: 'แล้ง', full: 'ภัยแล้ง' })
});

/** Pure presentation adapter: ticks are simulation ticks, not wall-clock minutes. */
export function weatherHudText(weather) {
  const entry = WEATHER_HUD_LABELS[weather?.kind] ?? WEATHER_HUD_LABELS.clear;
  const ticks = weather?.remainingTicks;
  // Legacy Game objects have no Weather; do not invent a countdown.
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    return { short: entry.short, full: `สภาพอากาศ: ${entry.full}` };
  }
  return {
    short: `${entry.short} · ${ticks}t`,
    full: `สภาพอากาศ: ${entry.full} · เหลือ ${ticks} ติ๊กของเวลาเกม`
  };
}

export class UI {
  constructor(game, cameras, renderer, onNewWorld) {
    this.game = game;
    this.cameras = cameras;
    this.renderer = renderer;
    this.onNewWorld = onNewWorld;
    this.selection = null;
    this.selectedAntId = null;
    this.debug = false;
    this.toastTimer = null;
    this.lastSpeed = 1;
    this.tool = 'inspect';
    this.digPreview = null;
    this.digSelection = null;
    this.roomPreview = null;
    this.nurseryRoomId=null;
    this.nurseryDismissedForId=null;
    this.bind();
    this.updateWorld();
    this.updateMetrics();
  }
  get camera() { return this.cameras[this.game.layer]; }
  dimensions() { return [this.renderer.width, this.renderer.height]; }
  bind() {
    for (const btn of document.querySelectorAll('[data-layer]')) {
      btn.addEventListener('click', () => this.switchLayer(btn.dataset.layer));
    }
    for (const btn of document.querySelectorAll('[data-speed]')) {
      btn.addEventListener('click', () => this.changeSpeed(Number(btn.dataset.speed)));
    }
    $('colony-button').addEventListener('click', () => this.showColonyPanel($('colony-panel').classList.contains('hidden')));
    $('close-colony').addEventListener('click', () => this.showColonyPanel(false));
    $('workforce-open').addEventListener('click', () => {
      const opening=$('colony-panel').classList.contains('hidden');
      // This is a toggle, not a permanent navigation mode. Leave dig/room
      // placement when entering or leaving the population report.
      this.setTool('inspect');
      this.showColonyPanel(opening);
    });
    // Legacy percentage inputs remain in HTML for existing regressions but are
    // not exposed or bound: fixed ant professions are never reassigned by UI.
    $('zoom-in').addEventListener('click', () => this.zoom(1.25));
    $('zoom-out').addEventListener('click', () => this.zoom(1 / 1.25));
    $('recenter').addEventListener('click', () => this.recenter());
    $('debug-toggle').addEventListener('click', () => { this.debug = !this.debug; $('debug-panel').classList.toggle('hidden', !this.debug); });
    $('selection-close').addEventListener('click', () => this.select(null));
    $('nursery-close').addEventListener('click',()=>this.closeNursery());
    $('nursery-reopen').addEventListener('click',()=>{
      this.nurseryDismissedForId=null;
      this.refreshNursery();
      $('nursery-heading').focus({preventScroll:true});
    });
    for(const id of ['nursery-profession','nursery-level'])$(id).addEventListener('change',()=>this.refreshNursery());
    $('nursery-queue').addEventListener('click',()=>{
      const roomId=this.nurseryRoomId;if(!roomId)return;
      const result=this.game.lifecycle?.queueEgg?.(roomId,$('nursery-profession').value,Number($('nursery-level').value))??{ok:false,reason:'api-unavailable'};
      $('nursery-feedback').textContent=result.ok?'บันทึกคิวฟักแล้ว':this.nurseryReason(result.reason);
      this.refreshNursery();
    });
    $('nursery-orders').addEventListener('click',event=>{
      const btn=event.target.closest('button[data-egg-id]');
      if(!btn)return;
      const success=this.game.lifecycle?.cancelEgg?.(btn.dataset.eggId)??false;
      $('nursery-feedback').textContent=success?'ยกเลิกคิวและคืนทรัพยากรแล้ว':'รายการนี้ยกเลิกไม่ได้แล้ว';
      this.refreshNursery();
      if(success)$('nursery-queue').focus({preventScroll:true});
    });
    $('selection-ants-list').addEventListener('click', event => {
      const button=event.target.closest('button[data-ant-id]');
      if(!button || !antById(this.game,button.dataset.antId))return;
      const ant=antById(this.game,button.dataset.antId);
      this.select({layer:ant.layer,x:ant.x,y:ant.y},ant.id);
    });
    $('tool-inspect').addEventListener('click', () => this.setTool('inspect'));
    // Re-clicking an active action tool exits to inspection (same as G/R keys).
    $('tool-dig').addEventListener('click', () => this.setTool(this.tool === 'dig' ? 'inspect' : 'dig'));
    $('tool-room').addEventListener('click', () => this.setTool(this.tool === 'room' ? 'inspect' : 'room'));
    $('dig-apply').addEventListener('click', () => this.applyDigSelection(false));
    $('dig-remove').addEventListener('click', () => this.applyDigSelection(true));
    $('dig-dismiss').addEventListener('click', () => this.clearDigSelection());
    $('room-type').addEventListener('change', () => { this.roomPreview=null;this.updateRoomCost(); });
    $('cancel-room').addEventListener('click', () => {
      const s=this.selection, room=s?.layer===UNDERGROUND?this.game.rooms.getRoom(s.x,s.y):null;
      if(room && this.game.rooms.cancel(room.id))this.notice('ยกเลิกและคืนค่าก่อสร้างแล้ว');
      this.refreshSelection();this.updateMetrics();
    });
    $('cancel-dig').addEventListener('click', () => {
      if (this.selection && this.game.colony.cancel(this.selection.x,this.selection.y)) this.notice('ยกเลิกคำสั่งขุดแล้ว');
      this.refreshSelection(); this.updateMetrics();
    });
    $('portal-button').addEventListener('click', () => {
      if (this.selection && portalAt(this.game.world, this.game.layer, this.selection.x, this.selection.y)) this.switchLayer(this.game.layer === SURFACE ? UNDERGROUND : SURFACE);
    });
    $('seed-button').addEventListener('click', () => { $('seed-input').value = this.game.world.seedLabel; $('seed-dialog').showModal(); });
    $('cancel-seed').addEventListener('click', () => $('seed-dialog').close());
    $('seed-form').addEventListener('submit', e => {
      e.preventDefault();
      const seed = $('seed-input').value.trim();
      if (!seed) return;
      $('seed-dialog').close();
      this.onNewWorld(seed);
      this.select(null);this.roomPreview=null;this.clearDigSelection();
      this.updateWorld();
      this.notice('สร้างโลกใหม่สำเร็จ');
    });
    document.addEventListener('keydown', (e) => {
      // Keep native Space/Enter behavior on focused controls (notably Squad A/B).
      // Gameplay shortcuts apply only when the page/canvas owns keyboard focus.
      const focused = document.activeElement;
      const interactive = focused?.isContentEditable || focused?.closest(
        'button,input,textarea,select,a[href],summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="textbox"],[role="combobox"],[role="slider"],[role="spinbutton"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],[role="switch"]'
      );
      if(e.code==='Escape' && !$('seed-dialog').open && !document.getElementById('u6-dialog')?.open &&
         !$('nursery-panel').classList.contains('hidden')){
        e.preventDefault();this.closeNursery();return;
      }
      if (interactive || $('seed-dialog').open) return;
      if (e.code === 'Space') { e.preventDefault(); this.changeSpeed(this.game.clock.speed === 0 ? this.lastSpeed : 0); }
      if (e.code === 'Digit1') this.switchLayer(SURFACE);
      if (e.code === 'Digit2') this.switchLayer(UNDERGROUND);
      if (e.code === 'KeyD') { this.debug = !this.debug; $('debug-panel').classList.toggle('hidden', !this.debug); }
      if (e.code === 'KeyG') this.setTool(this.tool === 'dig' ? 'inspect' : 'dig');
      if (e.code === 'KeyR') this.setTool(this.tool === 'room' ? 'inspect' : 'room');
      if (e.code === 'Escape') this.setTool('inspect');
    });
    this.bindCanvas();
  }
  bindCanvas() {
    const el = this.renderer.canvas;
    const pointers = new Map();
    let pinch = null, dragDistance = 0, start = null, usedMultiTouch = false;
    const loc = e => { const rect=el.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top}; };
    const pinchInfo = () => {
      const [a,b]=[...pointers.values()];
      return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};
    };
    const cellAtPointer = p => this.camera.screenToCell(p.x,p.y,...this.dimensions());
    el.addEventListener('pointerdown', e => {
      if(e.pointerType==='mouse' && e.button!==0) return;
      const p=loc(e);pointers.set(e.pointerId,p);
      el.setPointerCapture(e.pointerId);
      if(pointers.size===1) {
        start=p;dragDistance=0;usedMultiTouch=false;pinch=null;
        if(this.tool==='dig' && this.game.layer===UNDERGROUND){
          this.clearDigSelection();
          const cell=cellAtPointer(p);this.digPreview={from:cell,to:cell};
        }
        if(this.tool==='room' && this.game.layer===UNDERGROUND){const cell=cellAtPointer(p);this.roomPreview={from:cell,to:cell,dragging:false};this.updateRoomCost();}
      }
      if(pointers.size>=2){usedMultiTouch=true;this.digPreview=null;this.roomPreview=null;this.updateRoomCost();start=null;pinch=pinchInfo();}
    });
    el.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId)) return;
      const old=pointers.get(e.pointerId),p=loc(e);pointers.set(e.pointerId,p);
      const camera=this.camera,layer=this.game.currentLayer;
      if(pointers.size>=2){
        const next=pinchInfo();
        if(pinch && pinch.distance>0){
          camera.pan(next.x-pinch.x,next.y-pinch.y,layer,...this.dimensions());
          camera.zoomAt(next.distance/pinch.distance,next.x,next.y,layer,...this.dimensions());
        }
        pinch=next;
      }else if(pointers.size===1){
        const dx=p.x-old.x,dy=p.y-old.y;
        dragDistance+=Math.hypot(dx,dy);
        if(this.tool==='dig' && this.game.layer===UNDERGROUND && this.digPreview && !usedMultiTouch){
          this.digPreview.to=cellAtPointer(p);
        }else if(this.tool==='room' && this.game.layer===UNDERGROUND && this.roomPreview && !usedMultiTouch){
          // Drag defines a rectangle rather than panning the camera.
          this.roomPreview.to=cellAtPointer(p);
          this.roomPreview.dragging=dragDistance>=7;
          this.updateRoomCost();
        }else camera.pan(dx,dy,layer,...this.dimensions());
      }
    });
    const finish = (e,cancelled=false) => {
      if(!pointers.has(e.pointerId)) return;
      const p=loc(e);
      pointers.delete(e.pointerId);
      if(!cancelled && pointers.size===0 && start && !usedMultiTouch){
        const cell=cellAtPointer(p);
        if(dragDistance<7 && this.mapTapHandler?.({layer:this.game.layer,...cell})===true){
          // A confirmed military map tap is handled by the tactical dock.
        } else if(this.tool==='room' && this.game.layer===UNDERGROUND && this.roomPreview) {
          // A tap keeps the familiar 2×2 quick placement. A real drag chooses
          // the inclusive rectangle between pointer-down and pointer-up.
          const from=this.roomPreview.from,to=dragDistance<7?from:cell;
          const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y);
          const width=dragDistance<7?2:Math.abs(from.x-to.x)+1;
          const height=dragDistance<7?2:Math.abs(from.y-to.y)+1;
          const result=this.game.rooms.queue($('room-type').value,x,y,width,height);
          this.notice(result.ok?`สั่งสร้างห้อง ${width}×${height} แล้ว มดจะเดินมาทำงาน`:this.roomError(result.reason));
          if(result.ok)this.select({layer:this.game.layer,x,y});
          this.roomPreview=null;this.updateRoomCost();
        } else if(this.tool==='dig' && this.game.layer===UNDERGROUND && this.digPreview){
          const {from,to}=this.digPreview;
          const info=this.game.colony.inspectRectangle(from,to);
          if(info.existing){
            this.digSelection={from:{...from},to:{...to}};
            $('dig-action-summary').textContent=`ในคิว ${info.existing} · เพิ่มได้ ${info.available} ช่อง`;
            $('dig-apply').disabled=info.available===0;
            $('dig-actions').classList.remove('hidden');
            this.notice('เลือกสั่งขุดเพิ่มหรือยกเลิกขุดในพื้นที่');
          }else{
            const result=this.game.colony.queueRectangle(from,to);
            this.notice(result.added?`สั่งขุด ${result.added} ช่อง${result.limit?' (คิวเต็ม)':''}`:'พื้นที่นี้ขุดไม่ได้');
            this.select({layer:this.game.layer,...cell});
          }
        }else if(dragDistance<7) {
          // Inspection only: tapping an already selected tile dismisses its info.
          // Digging, room placement and tactical targeting remain command actions.
          const ant=this.tool==='inspect'?antAtPointer(this.game,this.camera,p,...this.dimensions()):null;
          this.toggleMapSelection(ant?{layer:ant.layer,x:ant.x,y:ant.y}:{layer:this.game.layer,...cell},ant?.id??null);
        }
      }
      if(pointers.size===1){start=null;pinch=null;this.digPreview=null;}
      if(pointers.size===0){
        pinch=null;start=null;usedMultiTouch=false;
        this.digPreview=this.digSelection?{...this.digSelection,mode:'choose'}:null;
        this.roomPreview=null;this.updateRoomCost();
      }
    };
    el.addEventListener('pointerup',e=>finish(e));
    el.addEventListener('pointercancel',e=>finish(e,true));
    el.addEventListener('lostpointercapture',e=>finish(e,true));
    el.addEventListener('wheel',e=>{
      e.preventDefault();const p=loc(e);
      this.camera.zoomAt(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.0017),p.x,p.y,this.game.currentLayer,...this.dimensions());
    },{passive:false});
  }
  clearDigSelection(){
    this.digSelection=null;
    this.digPreview=null;
    $('dig-actions').classList.add('hidden');
  }
  applyDigSelection(cancel){
    const area=this.digSelection;
    if(!area)return;
    const result=cancel
      ?this.game.colony.cancelRectangle(area.from,area.to)
      :this.game.colony.queueRectangle(area.from,area.to);
    this.clearDigSelection();
    this.notice(cancel?`ยกเลิกคำสั่งขุด ${result.cancelled} ช่อง`
      :result.added?`สั่งขุดเพิ่ม ${result.added} ช่อง${result.limit?' (คิวเต็ม)':''}`
      :'ไม่มีพื้นที่ใหม่ให้สั่งขุด');
    this.refreshSelection();this.updateMetrics();
  }
  setTool(tool) {
    if((tool==='dig'||tool==='room') && this.game.layer!==UNDERGROUND){this.notice('สั่งขุดได้เฉพาะโลกใต้ดิน');return;}
    this.clearDigSelection();
    this.tool=tool;this.roomPreview=null;
    for(const btn of document.querySelectorAll('.tool-button')){
      const active=btn.id===`tool-${tool}`;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',String(active));
    }
    this.renderer.canvas.classList.toggle('dig-cursor',tool==='dig'||tool==='room');
    $('room-palette').classList.toggle('hidden',tool!=='room');
    this.updateRoomCost();
    this.refreshSelection();
  }
  switchLayer(layer) {
    this.game.setLayer(layer);
    if(layer===SURFACE && this.tool!=='inspect') this.setTool('inspect');
    this.select(null);
    this.updateWorld();
  }
  roomError(reason) {return ({'unknown-room':'ไม่รู้จักห้อง','invalid-position':'ตำแหน่งไม่ถูกต้อง','size-too-small':'พื้นที่อย่างน้อย 4 ช่อง (เช่น 2×2 หรือ 1×4)','size-too-large':'ห้องกว้างหรือยาวได้สูงสุด 8 ช่อง','out-of-bounds':'พื้นที่เกินขอบแผนที่','needs-excavation':'ต้องขุดพื้นที่ทั้งหมดให้โล่งก่อน','overlap':'พื้นที่มีห้องอยู่แล้ว','disconnected':'ห้องต้องเชื่อมกับรัง','entrance':'ห้ามปิดปากรัง','queue-full':'คิวสร้างห้องเต็ม','insufficient-resources':'ทรัพยากรในคลังยังไม่พอ'})[reason]||'ไม่สามารถสร้างห้องได้';}
  updateRoomCost(){
    const def=ROOM_CATALOG[$('room-type').value];if(!def)return;
    const preview=this.roomPreview;
    const x=preview?Math.min(preview.from.x,preview.to.x):null;
    const y=preview?Math.min(preview.from.y,preview.to.y):null;
    const width=preview?.dragging?Math.abs(preview.to.x-preview.from.x)+1:def.width;
    const height=preview?.dragging?Math.abs(preview.to.y-preview.from.y)+1:def.height;
    const plan=roomPlan($('room-type').value,width,height);
    const cost=plan?.cost||def.cost;
    const amount=Object.entries(cost).map(([k,n])=>({carbs:'พลังงาน',protein:'โปรตีน',water:'น้ำ'})[k]+n).join(' · ');
    const verdict=preview?this.game.rooms.validate($('room-type').value,x,y,width,height):null;
    $('room-cost').textContent=`แตะ: 2×2 · ลาก: ${width}×${height} (${width*height} ช่อง) · ใช้ ${amount}${verdict&&!verdict.ok?' · '+this.roomError(verdict.reason):''}`;
  }
  showColonyPanel(show) {
    $('colony-panel').classList.toggle('hidden',!show);
    $('colony-button').setAttribute('aria-expanded',String(show));
    $('workforce-open').setAttribute('aria-expanded',String(show));
    if(show) this.updateMetrics();
  }
  changeSpeed(speed) {
    if (speed > 0) this.lastSpeed = speed;
    this.game.setSpeed(speed);
    this.updateWorld();
  }
  recenter() {
    const target = this.game.world.entrances[0][this.game.layer];
    this.camera.x = (target.x + .5) * 28;
    this.camera.y = (target.y + .5) * 28;
    this.camera.clamp(this.game.currentLayer, ...this.dimensions());
  }
  zoom(factor) {
    const [w, h] = this.dimensions();
    this.camera.zoomAt(factor, w / 2, h / 2, this.game.currentLayer, w, h);
  }
  select(selection,antId=null) {
    this.selection=selection;
    this.selectedAntId=selection?antId:null;
    this.refreshSelection();
  }
  toggleMapSelection(tile,antId=null) {
    const current=this.selection;
    const isSame=current && current.layer===tile.layer &&
      current.x===tile.x && current.y===tile.y &&
      (this.selectedAntId??null)===antId;
    const valid=cellAt(this.game.currentLayer,tile.x,tile.y)!=null;
    this.select(!valid || isSame ? null : tile,isSame?null:antId);
  }
  refreshSelection() {
    // Keep the inspect card attached to the selected ant as it moves.
    const tracked=antById(this.game,this.selectedAntId);
    if(this.selectedAntId && !tracked)this.selectedAntId=null;
    if(tracked && tracked.layer===this.game.layer)
      this.selection={layer:tracked.layer,x:tracked.x,y:tracked.y};
    const s=this.selection;
    const valid=s && s.layer===this.game.layer && cellAt(this.game.currentLayer,s.x,s.y)!=null;
    $('selection-card').classList.toggle('hidden',!valid);
    if(!valid){renderAntInspector(this.game,null,null);this.refreshNursery(null);return;}
    const terrain=cellAt(this.game.currentLayer,s.x,s.y), job=this.game.colony.getOrder(s.x,s.y);
    const source=s.layer===SURFACE?this.game.foraging.getNode(s.x,s.y):null;
    const room=s.layer===UNDERGROUND?this.game.rooms.getRoom(s.x,s.y):null;
    const sourceText=source?resourceSelectionText(source):null;
    $('selection-terrain').textContent=sourceText?.title??(room?ROOM_CATALOG[room.type].name:terrainName(terrain));
    $('selection-coords').textContent=`X:${s.x} · Y:${s.y}`;
    const occupants=antsAtTile(this.game,s.layer,s.x,s.y);
    if($('selection-card').dataset) $('selection-card').dataset.inspecting=occupants.length?'ant':'tile';
    $('portal-button').classList.toggle('hidden',!portalAt(this.game.world,s.layer,s.x,s.y));
    $('cancel-dig').classList.toggle('hidden',!job);
    $('selection-work').classList.toggle('hidden',!job);
    if(job) $('selection-work').textContent=`${job.auto?'ขุดทางเชื่อม':'ขุด'} · ${job.status==='digging'?'กำลังทำ':job.status==='assigned'?'กำลังมา':this.game.colony.accessBlocked?'รอทางเชื่อม (หินกั้น)':'รอ'} ${Math.floor(job.progress/(job.terrain===TERRAINS.HARD_SOIL?30:12)*100)}%`;
    $('selection-room').classList.toggle('hidden',!room);
    $('cancel-room').classList.toggle('hidden',!room || !['planned','building'].includes(room.status));
    if(room) {
      const stored=room.stock?Object.entries(room.stock).filter(([,n])=>n>0).map(([type,n])=>({carbs:'อาหาร',protein:'โปรตีน',water:'น้ำ'})[type]+` ${n}`).join(' · '):'';
      const cargo=room.status==='building'||room.status==='planned'?(room.pickups||[]).filter(p=>!p.collected).length:0;
      const brood=room.type==='nursery'?this.game.lifecycle.brood.filter(b=>b.roomId===room.id).length:0;
      const guards=room.type==='guard'?this.game.colony.workers.filter(w=>w.state==='room-guard'&&w.guardRoomId===room.id).length:0;
      $('selection-room').textContent=`${room.width}×${room.height} · ${{planned:'รอสร้าง',building:'กำลังสร้าง',ready:'พร้อมใช้',disabled:'ขาดทางเข้า'}[room.status]} ${room.status==='ready'?'':Math.floor(room.progress/Math.max(1,room.ticks??ROOM_CATALOG[room.type].ticks)*100)+'%'}${cargo?` · วัสดุ ${cargo}`:''}${stored?' · '+stored:''}${room.type==='nursery'?` · ตัวอ่อน ${brood}`:''}${room.type==='guard'?` · ลาดตระเวน ${guards}`:''}`;
    }
    $('selection-resource').classList.toggle('hidden',!source);
    if(sourceText) $('selection-resource').textContent=sourceText.details;
    const broodHere=s.layer===UNDERGROUND?this.game.lifecycle.brood.filter(b=>
      room?.type==='nursery'?b.roomId===room.id:
      !b.carrierId&&b.x===s.x&&b.y===s.y):[];
    const isBroodSpot=broodHere.length>0||room?.type==='queen'||room?.type==='nursery';
    $('selection-brood').classList.toggle('hidden',!isBroodSpot);
    if(isBroodSpot) {
      const temporary=broodHere.filter(b=>b.site==='temporary').length;
      const counts=[['egg','ไข่'],['larva','ตัวอ่อน'],['pupa','ดักแด้']]
        .map(([stage,label])=>`${label} ${broodHere.filter(b=>b.stage===stage).length}`).join(' · ');
      $('selection-brood').textContent=`${temporary?'พักชั่วคราว · ':''}${counts}`;
    }
    $('selection-note').textContent=sourceText?.note??(job?'มดงานจะขุดจากช่องอุโมงค์ที่เดินถึง':this.game.layer===SURFACE?'แตะจุดอาหารเพื่อดูประเภทและปริมาณ':'เครื่องมือขุด: แตะหรือลากเพื่อกำหนดพื้นที่ (ปุ่ม G)');
    renderAntInspector(this.game,s,this.selectedAntId);
    this.refreshNursery(room?.type==='nursery'?room:null);
  }
  closeNursery(){
    this.nurseryDismissedForId=this.nurseryRoomId;
    $('nursery-panel').classList.add('hidden');
    if(this.nurseryRoomId)$('nursery-reopen').focus({preventScroll:true});
  }
  nurseryReason(reason){
    return ({
      'invalid-choice':'เลือกอาชีพหรือเลเวลไม่ถูกต้อง',
      'invalid-room':'ไม่พบห้องฟักไข่',
      'nursery-unavailable':'ห้องยังไม่พร้อมหรือขาดทางเชื่อม',
      'queen-dead':'นางพญาไม่สามารถวางไข่ได้',
      'population-cap':'ประชากรเต็ม 150 ตัว',
      'nursery-full':'ไม่มีช่องฟักว่าง',
      'insufficient-resources':'ทรัพยากรสำหรับจองไข่ไม่เพียงพอ',
      'api-unavailable':'ระบบฟักไข่ยังไม่พร้อมใช้งาน'
    })[reason]||'ไม่สามารถสั่งฟักไข่ได้';
  }
  refreshNursery(room=undefined){
    const panel=$('nursery-panel'),reopen=$('nursery-reopen');
    if(room===undefined)room=this.game.rooms?.rooms?.find(r=>r.id===this.nurseryRoomId);
    if(!room||room.type!=='nursery'){
      this.nurseryRoomId=null;panel.classList.add('hidden');
      reopen.classList.add('hidden');return;
    }
    reopen.classList.remove('hidden');
    const isNew=room.id!==this.nurseryRoomId;
    if(isNew){
      this.nurseryRoomId=room.id;this.nurseryDismissedForId=null;
      $('nursery-feedback').textContent='';
    }
    if(this.nurseryDismissedForId===room.id){panel.classList.add('hidden');return;}
    panel.classList.remove('hidden');
    if(isNew && document.activeElement===this.renderer.canvas)
      $('nursery-heading').focus({preventScroll:true});

    const life=this.game.lifecycle;
    const status=life?.nurseryStatus?.(room.id)??null;
    const ready=room.status==='ready'&&room.connected===true;
    const roomName={ready:'พร้อมใช้งาน',planned:'รอก่อสร้าง',building:'กำลังก่อสร้าง',disabled:'ขาดทางเข้า'}[room.status]||'ยังไม่พร้อม';
    $('nursery-heading').textContent='ห้องฟักไข่ · '+room.width+'×'+room.height;
    $('nursery-capacity').textContent=status
      ? 'ช่องฟัก '+status.used+'/'+status.slots+' · ว่าง '+status.free+' · '+(ready?'พร้อมใช้งาน':roomName)
      : 'กำลังเชื่อมต่อข้อมูลช่องฟัก · '+roomName;
    const profession=$('nursery-profession').value,level=Number($('nursery-level').value);
    const cost=life?.eggCost?.(profession,level)??null;
    const totalTicks=[440,560,720,900,1140][level-1];
    $('nursery-cost').textContent=cost
      ? 'ต้นทุน: อาหาร '+cost.carbs+' · โปรตีน '+cost.protein+' · ฟัก '+totalTicks+' ติ๊ก (ไม่นับเวลารอ/ขนส่ง)'
      : 'ไม่สามารถอ่านต้นทุนไข่ได้';
    let reason='';
    if(!status||!cost||typeof life?.queueEgg!=='function')reason='api-unavailable';
    else if(!ready)reason='nursery-unavailable';
    else if(!this.game.colony?.queen?.alive)reason='queen-dead';
    else if(life.totalPopulation>=LIFE.maxPopulation)reason='population-cap';
    else if(status.free<=0)reason='nursery-full';
    else {
      // Use only physical connected storage, never invent spendable inventory.
      const rooms=this.game.rooms;
      rooms?.syncInventory?.();
      if(typeof rooms?.storageSlots==='function'){
        const enough=Object.entries(cost).every(([type,amount])=>rooms.storageSlots(type)
          .filter(slot=>slot.room?.connected).reduce((sum,slot)=>sum+(slot.room.stock?.[type]||0),0)>=amount);
        if(!enough)reason='insufficient-resources';
      }
    }
    $('nursery-queue').disabled=!!reason;
    $('nursery-queue').title=reason?this.nurseryReason(reason):'';
    $('nursery-blocked').textContent=reason?this.nurseryReason(reason):'พร้อมรับคำสั่งฟักไข่';
    const list=$('nursery-orders');
    const labels={QUEUED:'รอนางพญาวางไข่',LAID:'วางไข่แล้ว',AWAITING_PICKUP:'รอมดพี่เลี้ยงมารับ',
      CARRYING:'กำลังขนไปห้องฟัก',WAITING_ROUTE:'รอเส้นทางที่เดินถึง',INCUBATING:'กำลังฟัก',HATCHED:'ฟักสำเร็จ'};
    const names={miner:'มดขุด',forager:'มดหาอาหาร',builder:'มดช่าง',nurse:'มดพี่เลี้ยง',soldier:'มดทหาร'};
    const existing=new Map([...list.querySelectorAll('li[data-id]')].map(li=>[li.dataset.id,li]));
    for(const order of status?.orders??[]){
      let li=existing.get(order.id);
      if(!li){li=document.createElement('li');li.dataset.id=order.id;li.className='nursery-order';list.appendChild(li);}
      existing.delete(order.id);
      const max=Number.isFinite(order.hatchTicks)&&order.hatchTicks>0?order.hatchTicks:totalTicks;
      const left=Number.isFinite(order.remainingTicks)?Math.max(0,Math.min(max,order.remainingTicks)):max;
      const incubating=order.status==='INCUBATING';
      const progress=Math.round((max-left)/max*100);
      const text=(names[order.profession]||order.profession)+' · Lv.'+order.level+' · '+(labels[order.status]||order.status);
      let content=li.querySelector('.nursery-order-content');
      if(!content){content=document.createElement('div');content.className='nursery-order-content';li.append(content);}
      let caption=content.querySelector('.nursery-order-label');
      if(!caption){caption=document.createElement('strong');caption.className='nursery-order-label';content.append(caption);}
      if(caption.textContent!==text)caption.textContent=text;
      let eta=content.querySelector('.nursery-order-eta');
      if(!eta){eta=document.createElement('small');eta.className='nursery-order-eta';content.append(eta);}
      eta.textContent=incubating?'ฟักแล้ว '+progress+'% · เหลือ '+left+' ติ๊ก':'รอวาง/ขนส่ง · ยังไม่เริ่มนับเวลาฟัก';
      let bar=content.querySelector('progress');
      if(!bar){bar=document.createElement('progress');bar.max=100;bar.setAttribute('aria-label','ความคืบหน้าการฟักไข่');content.append(bar);}
      bar.value=incubating?progress:0;
      bar.hidden=!incubating;
      let cancel=li.querySelector('button[data-egg-id]');
      if(order.status==='QUEUED'){
        if(!cancel){cancel=document.createElement('button');cancel.type='button';cancel.textContent='ยกเลิก';li.append(cancel);}
        cancel.dataset.eggId=order.id;cancel.setAttribute('aria-label','ยกเลิกคิว '+text);
      }else cancel?.remove();
    }
    for(const stale of existing.values())stale.remove();
    const empty=list.querySelector('li[data-empty]');
    if(status?.orders?.length)empty?.remove();
    else if(!empty){const li=document.createElement('li');li.dataset.empty='true';li.textContent='ยังไม่มีคำสั่งฟักไข่';list.append(li);}
  }
  notice(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add('hidden'), 2300);
  }
  updateWorld() {
    const surface = this.game.layer === SURFACE;
    $('region-name').textContent = surface ? 'เหนือผืนป่า' : 'ใต้ผืนดิน';
    $('region-subtitle').textContent = surface ? 'ทุ่งหาอาหารและโลกภายนอก' : 'อุโมงค์แห่งอาณาจักรเริ่มต้น';
    $('layer-hint').textContent = surface ? 'ค้นพบเส้นทางใหม่บนผืนดิน' : 'สำรวจโครงสร้างภายในรัง';
    $('seed-label').textContent = this.game.world.seedLabel;
    $('seed-label').title = this.game.world.seedLabel;
    $('population').textContent = this.game.population;
    $('tool-dig').disabled=surface;
    $('tool-room').disabled=surface;
    this.updateRoomCost();
    if(surface && this.tool==='dig') this.setTool('inspect');
    for (const btn of document.querySelectorAll('[data-layer]')) {
      const active = btn.dataset.layer === this.game.layer;
      btn.classList.toggle('selected', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    for (const btn of document.querySelectorAll('[data-speed]')) {
      const active = Number(btn.dataset.speed) === this.game.clock.speed;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }
  updateWeather() {
    // Reuse the existing <small> inside the time pill; no markup or CSS edits.
    const time = $('game-time');
    const label = time?.previousElementSibling;
    if (!label || label.tagName?.toLowerCase() !== 'small') return;
    const status = weatherHudText(this.game.weather);
    if (label.textContent !== status.short) label.textContent = status.short;
    if (label.title !== status.full) label.title = status.full;
    // The compact HUD stylesheet hides small labels globally; reveal only this
    // existing slot without allocating a new card or covering other controls.
    label.style.display = 'block';
    label.style.fontSize = '8px';
    label.style.lineHeight = '1';
    label.style.letterSpacing = '0';
    label.style.marginBottom = '1px';
    label.style.whiteSpace = 'nowrap';
  }
  updateMetrics() {
    $('game-time').textContent = formatGameTime(this.game.clock);
    this.updateWeather();
    for(const type of ['carbs','protein','water']) $(`stock-${type}`).textContent=String(this.game.foraging.inventory[type]);
    // Actual permanent caste headcounts; no percentage quota UI or role rewrites.
    const living=this.game.colony.workers.filter(a=>a.alive!==false);
    $('forage-count').textContent='มดหาอาหาร '+living.filter(a=>a.profession==='forager').length;
    $('nurse-count').textContent='มดพี่เลี้ยง '+living.filter(a=>a.profession==='nurse').length;
    const life=this.game.lifecycle;
    const temporaryBrood=life.brood.filter(b=>b.site==='temporary').length;
    $('brood-summary').textContent=`ไข่ ${life.eggs} · ตัวอ่อน ${life.larvae} · ดักแด้ ${life.pupae}${temporaryBrood?` · พักชั่วคราว ${temporaryBrood}`:''}`;
    const queenAlert=!this.game.colony.queen.alive;
    $('queen-status').textContent=queenAlert?'นางพญาสิ้นชีวิต':life.lastEvent;
    $('queen-status').classList.toggle('is-alert',queenAlert);
    $('population').textContent=String(this.game.population);
    $('report-workers').textContent=String(this.game.colony.workers.length);
    $('report-nurses').textContent=String(life.nurseCount);
    $('report-brood').textContent=`${life.eggs} / ${life.larvae} / ${life.pupae}`;
    $('report-births').textContent=`${life.births} / ${life.workerDeaths+life.broodDeaths}`;
    $('report-needs').textContent=`${[...life.adultHealth.values()].filter(a=>a.hunger>=LIFE.feedInterval).length} / ${[...life.adultHealth.values()].filter(a=>a.thirst>=LIFE.drinkInterval).length}`;
    $('report-queen-age').textContent=(life.queenHealth.age/4800).toFixed(1);
    $('report-consumed').textContent=String(Object.values(life.consumed).reduce((a,b)=>a+b,0));
    $('report-message').textContent=life.lastEvent;
    const names={starter:'มดเริ่มต้น',miner:'มดขุด',forager:'มดหาอาหาร',builder:'มดช่าง',nurse:'มดพี่เลี้ยง',soldier:'มดทหาร'};
    const ants=this.game.colony.workers.filter(a=>a.alive!==false);
    const signature=ants.map(a=>a.id+':'+(a.profession||'starter')+':'+(a.level||1)).join('|');
    if(this.casteSignature!==signature){
      const table=document.createElement('table');table.className='caste-table';
      const header=document.createElement('thead'),hrow=document.createElement('tr');
      for(const name of ['อาชีพ','รวม','Lv.1','Lv.2','Lv.3','Lv.4','Lv.5']){
        const cell=document.createElement('th');cell.scope='col';cell.textContent=name;hrow.append(cell);
      }
      header.append(hrow);table.append(header);
      const body=document.createElement('tbody');
      for(const [kind,name] of Object.entries(names)){
        const cohort=ants.filter(a=>(a.profession||'starter')===kind);
        const tr=document.createElement('tr');if(kind==='starter')tr.className='starter-row';
        for(const value of [name,cohort.length,...[1,2,3,4,5].map(level=>cohort.filter(a=>(a.level||1)===level).length)]){
          const cell=document.createElement(value===name?'th':'td');
          if(value===name)cell.scope='row';
          cell.textContent=String(value);tr.append(cell);
        }
        body.append(tr);
      }
      table.append(body);$('caste-report').replaceChildren(table);
      this.casteSignature=signature;
    }
    $('worker-status').textContent=`ขุด ${this.game.colony.busyCount} · หาอาหาร ${this.game.foraging.activeCount} · เลี้ยง ${this.game.lifecycle.nurseCount}`;
    $('queue-status').textContent=`คิวขุด ${this.game.colony.pendingCount}`;
    const cap=this.game.rooms.capacities();
    $('room-summary').textContent=`ห้องพร้อมใช้ ${this.game.rooms.readyCount} · กำลังสร้าง ${this.game.rooms.queuedCount} · คลัง ${['carbs','protein','water'].map(t=>`${this.game.foraging.inventory[t]}/${cap[t]}`).join(' · ')}${this.game.foraging.waitingCount?' · รอคลัง '+this.game.foraging.waitingCount:''}`;
    this.refreshSelection();
    if (!this.debug) return;
    const m = this.game.metrics;
    m.pendingTasks = this.game.colony.pendingCount;
    $('metric-fps').textContent = String(m.fps);
    $('metric-tps').textContent = String(m.tps);
    $('metric-sim').textContent = `${m.simMs.toFixed(2)} ms`;
    $('metric-render').textContent = `${m.renderMs.toFixed(2)} ms`;
    $('metric-ticks').textContent = this.game.clock.ticks.toLocaleString('en-US');
    $('metric-pending').textContent = String(m.pendingTasks);
    $('metric-camera').textContent = `${Math.round(this.camera.x / 28)}, ${Math.round(this.camera.y / 28)} · ${this.camera.zoom.toFixed(2)}×`;
    $('metric-layer').textContent = this.game.layer;
    $('metric-life').textContent=`${life.births} / ${life.workerDeaths+life.broodDeaths}`;
  }
}
