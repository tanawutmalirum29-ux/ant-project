import { SURFACE, UNDERGROUND, cellAt, portalAt, TERRAINS } from '../world/generate.js';
import { isDiggable } from '../world/navigation.js';
import { formatGameTime } from '../core/time.js';
import { LIFE } from '../core/lifecycle.js';
import { ROOM_CATALOG } from '../core/rooms.js';
import { terrainName } from '../render/renderer.js';
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, cameras, renderer, onNewWorld) {
    this.game = game;
    this.cameras = cameras;
    this.renderer = renderer;
    this.onNewWorld = onNewWorld;
    this.selection = null;
    this.debug = false;
    this.toastTimer = null;
    this.lastSpeed = 1;
    this.tool = 'inspect';
    this.digPreview = null;
    this.roomPreview = null;
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
    $('forage-minus').addEventListener('click', () => this.changeForagers(-1));
    $('forage-plus').addEventListener('click', () => this.changeForagers(1));
    $('nurse-minus').addEventListener('click', () => this.changeNurses(-1));
    $('nurse-plus').addEventListener('click', () => this.changeNurses(1));
    $('zoom-in').addEventListener('click', () => this.zoom(1.25));
    $('zoom-out').addEventListener('click', () => this.zoom(1 / 1.25));
    $('recenter').addEventListener('click', () => this.recenter());
    $('debug-toggle').addEventListener('click', () => { this.debug = !this.debug; $('debug-panel').classList.toggle('hidden', !this.debug); });
    $('selection-close').addEventListener('click', () => this.select(null));
    $('tool-inspect').addEventListener('click', () => this.setTool('inspect'));
    $('tool-dig').addEventListener('click', () => this.setTool('dig'));
    $('tool-room').addEventListener('click', () => this.setTool('room'));
    $('room-type').addEventListener('change', () => { this.updateRoomCost();this.roomPreview=null; });
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
      this.select(null);this.roomPreview=null;
      this.updateWorld();
      this.notice('สร้างโลกใหม่สำเร็จ');
    });
    document.addEventListener('keydown', (e) => {
      if (document.activeElement?.matches('input,textarea') || $('seed-dialog').open) return;
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
        if(this.tool==='dig' && this.game.layer===UNDERGROUND){const cell=cellAtPointer(p);this.digPreview={from:cell,to:cell};}
        if(this.tool==='room' && this.game.layer===UNDERGROUND)this.roomPreview=cellAtPointer(p);
      }
      if(pointers.size>=2){usedMultiTouch=true;this.digPreview=null;start=null;pinch=pinchInfo();}
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
        }else {camera.pan(dx,dy,layer,...this.dimensions());if(this.tool==='room'&&this.game.layer===UNDERGROUND)this.roomPreview=cellAtPointer(p);}
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
        } else if(this.tool==='room' && this.game.layer===UNDERGROUND && dragDistance<7){
          this.roomPreview={...cell};
          const result=this.game.rooms.queue($('room-type').value,cell.x,cell.y);
          this.notice(result.ok?'สั่งสร้างห้องแล้ว มดจะเดินมาทำงาน':this.roomError(result.reason));
          this.select({layer:this.game.layer,...cell});
        } else if(this.tool==='dig' && this.game.layer===UNDERGROUND && this.digPreview){
          const result=this.game.colony.queueRectangle(this.digPreview.from,this.digPreview.to);
          if(result.added) this.notice(`สั่งขุด ${result.added} ช่อง${result.limit?' (คิวเต็ม)':''}`);
          else this.notice(result.existing?'พื้นที่นี้อยู่ในคิวแล้ว':'พื้นที่นี้ขุดไม่ได้');
          this.select({layer:this.game.layer,...cell});
        }else if(dragDistance<7) {
          this.select(cellAt(this.game.currentLayer,cell.x,cell.y)!=null ? {layer:this.game.layer,...cell} : null);
        }
      }
      if(pointers.size===1){start=null;pinch=null;this.digPreview=null;}
      if(pointers.size===0){pinch=null;start=null;usedMultiTouch=false;this.digPreview=null;}
    };
    el.addEventListener('pointerup',e=>finish(e));
    el.addEventListener('pointercancel',e=>finish(e,true));
    el.addEventListener('lostpointercapture',e=>finish(e,true));
    el.addEventListener('wheel',e=>{
      e.preventDefault();const p=loc(e);
      this.camera.zoomAt(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.0017),p.x,p.y,this.game.currentLayer,...this.dimensions());
    },{passive:false});
  }
  setTool(tool) {
    if((tool==='dig'||tool==='room') && this.game.layer!==UNDERGROUND){this.notice('สั่งขุดได้เฉพาะโลกใต้ดิน');return;}
    this.tool=tool;this.digPreview=null;this.roomPreview=null;
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
  roomError(reason) {return ({'unknown-room':'ไม่รู้จักห้อง','invalid-position':'ตำแหน่งไม่ถูกต้อง','out-of-bounds':'พื้นที่เกินขอบแผนที่','needs-excavation':'ต้องขุดพื้นที่ให้โล่งทั้ง 2×2 ก่อน','overlap':'พื้นที่มีห้องอยู่แล้ว','disconnected':'ห้องต้องเชื่อมกับรัง','entrance':'ห้ามปิดปากรัง','queue-full':'คิวสร้างห้องเต็ม','insufficient-resources':'ทรัพยากรในคลังยังไม่พอ'})[reason]||'ไม่สามารถสร้างห้องได้';}
  updateRoomCost(){const def=ROOM_CATALOG[$('room-type').value];if(def)$('room-cost').textContent=`ใช้ ${Object.entries(def.cost).map(([k,n])=>({carbs:'พลังงาน',protein:'โปรตีน',water:'น้ำ'})[k]+n).join(' · ')} · ขนาด ${def.width}×${def.height}`;}
  changeForagers(delta) {
    const count=Math.max(0,Math.min(this.game.colony.workers.length,this.game.colony.forageSlots+delta));
    this.game.colony.setForageSlots(count);
    this.updateMetrics();
  }
  showColonyPanel(show) {
    $('colony-panel').classList.toggle('hidden',!show);
    $('colony-button').setAttribute('aria-expanded',String(show));
    if(show) this.updateMetrics();
  }
  changeNurses(delta) {
    const life=this.game.lifecycle;
    life.setNurseSlots(Math.max(0,Math.min(this.game.colony.workers.length,life.nurseSlots+delta)));
    this.updateMetrics();
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
  select(selection) {
    this.selection=selection;
    this.refreshSelection();
  }
  refreshSelection() {
    const s=this.selection;
    const valid=s && s.layer===this.game.layer && cellAt(this.game.currentLayer,s.x,s.y)!=null;
    $('selection-card').classList.toggle('hidden',!valid);
    if(!valid) return;
    const terrain=cellAt(this.game.currentLayer,s.x,s.y), job=this.game.colony.getOrder(s.x,s.y);
    const source=s.layer===SURFACE?this.game.foraging.getNode(s.x,s.y):null;
    const room=s.layer===UNDERGROUND?this.game.rooms.getRoom(s.x,s.y):null;
    $('selection-terrain').textContent=source?'แหล่งทรัพยากร':room?ROOM_CATALOG[room.type].name:terrainName(terrain);
    $('selection-coords').textContent=`ตำแหน่ง X:${s.x}  Y:${s.y}`;
    $('portal-button').classList.toggle('hidden',!portalAt(this.game.world,s.layer,s.x,s.y));
    $('cancel-dig').classList.toggle('hidden',!job);
    $('selection-work').classList.toggle('hidden',!job);
    if(job) $('selection-work').textContent=`คำสั่งขุด: ${job.status==='digging'?'กำลังขุด':job.status==='assigned'?'กำลังเดินไปขุด':'รอมดงาน'} · ${Math.floor(job.progress/(job.terrain===TERRAINS.HARD_SOIL?30:12)*100)}%`;
    $('selection-room').classList.toggle('hidden',!room);
    $('cancel-room').classList.toggle('hidden',!room || !['planned','building'].includes(room.status));
    if(room) {
      const stored=room.stock?Object.entries(room.stock).filter(([,n])=>n>0).map(([type,n])=>({carbs:'อาหาร',protein:'โปรตีน',water:'น้ำ'})[type]+` ${n}`).join(' · '):'';
      const cargo=room.status==='building'||room.status==='planned'?(room.pickups||[]).filter(p=>!p.collected).length:0;
      const brood=room.type==='nursery'?this.game.lifecycle.brood.filter(b=>b.roomId===room.id).length:0;
      const guards=room.type==='guard'?this.game.colony.workers.filter(w=>w.state==='room-guard'&&w.guardRoomId===room.id).length:0;
      $('selection-room').textContent=`${ROOM_CATALOG[room.type].name} · ${{planned:'รอมดงาน',building:'กำลังก่อสร้าง',ready:'เปิดใช้งาน',disabled:'ขาดการเชื่อมต่อ'}[room.status]} · ${Math.floor(room.progress/Math.max(1,ROOM_CATALOG[room.type].ticks)*100)}%${cargo?` · รอรับวัสดุ ${cargo} ชุด`:''}${stored?' · คลัง: '+stored:''}${room.type==='nursery'?` · ตัวอ่อนในห้อง ${brood}`:''}${room.type==='guard'?` · ลาดตระเวน ${guards} ตัว`:''}`;
    }
    $('selection-resource').classList.toggle('hidden',!source);
    if(source) $('selection-resource').textContent=`${{carbs:'น้ำหวาน / เมล็ด',protein:'โปรตีนจากแมลง',water:'น้ำ'}[source.type]} · เหลือ ${source.amount} หน่วย · จอง ${source.reserved}`;
    const broodHere=s.layer===UNDERGROUND?this.game.lifecycle.brood.filter(b=>
      room?.type==='nursery'?b.roomId===room.id:
      !b.carrierId&&b.x===s.x&&b.y===s.y):[];
    const isBroodSpot=broodHere.length>0||room?.type==='queen'||room?.type==='nursery';
    $('selection-brood').classList.toggle('hidden',!isBroodSpot);
    if(isBroodSpot) {
      const temporary=broodHere.filter(b=>b.site==='temporary').length;
      const counts=[['egg','ไข่'],['larva','ตัวอ่อน'],['pupa','ดักแด้']]
        .map(([stage,label])=>`${label} ${broodHere.filter(b=>b.stage===stage).length}`).join(' · ');
      $('selection-brood').textContent=`${temporary?'พื้นที่พักตัวอ่อนชั่วคราว':'ตัวอ่อนบริเวณนี้'} ${broodHere.length} · ${counts}`;
    }
    $('selection-note').textContent=source?'มดหาอาหารจะมารับทรัพยากรโดยอัตโนมัติ':job?'มดงานจะขุดจากช่องอุโมงค์ที่เดินถึง':this.game.layer===SURFACE?'แตะจุดอาหารเพื่อดูประเภทและปริมาณ':'เครื่องมือขุด: แตะหรือลากเพื่อกำหนดพื้นที่ (ปุ่ม G)';
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
  updateMetrics() {
    $('game-time').textContent = formatGameTime(this.game.clock);
    for(const type of ['carbs','protein','water']) $(`stock-${type}`).textContent=String(this.game.foraging.inventory[type]);
    $('forage-count').textContent=`${this.game.colony.forageSlots}/${this.game.colony.workers.length}`;
    $('nurse-count').textContent=`${this.game.lifecycle.nurseSlots}/${this.game.colony.workers.length}`;
    $('nurse-minus').disabled=this.game.lifecycle.nurseSlots===0;
    $('nurse-plus').disabled=this.game.lifecycle.nurseSlots===this.game.colony.workers.length;
    const life=this.game.lifecycle;
    $('brood-summary').textContent=`ไข่ ${life.eggs} · ตัวอ่อน ${life.larvae} · ดักแด้ ${life.pupae} · พักชั่วคราว ${life.brood.filter(b=>b.site==='temporary').length}`;
    $('queen-status').textContent=this.game.colony.queen.alive?life.lastEvent:'นางพญาสิ้นชีวิต';
    $('forage-minus').disabled=this.game.colony.forageSlots===0;
    $('forage-plus').disabled=this.game.colony.forageSlots===this.game.colony.workers.length;
    $('population').textContent=String(this.game.population);
    $('report-workers').textContent=String(this.game.colony.workers.length);
    $('report-nurses').textContent=String(life.nurseCount);
    $('report-brood').textContent=`${life.eggs} / ${life.larvae} / ${life.pupae}`;
    $('report-births').textContent=`${life.births} / ${life.workerDeaths+life.broodDeaths}`;
    $('report-needs').textContent=`${[...life.adultHealth.values()].filter(a=>a.hunger>=LIFE.feedInterval).length} / ${[...life.adultHealth.values()].filter(a=>a.thirst>=LIFE.drinkInterval).length}`;
    $('report-queen-age').textContent=(life.queenHealth.age/4800).toFixed(1);
    $('report-consumed').textContent=String(Object.values(life.consumed).reduce((a,b)=>a+b,0));
    $('report-message').textContent=life.lastEvent;
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
