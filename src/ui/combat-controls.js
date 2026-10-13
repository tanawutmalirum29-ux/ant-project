import { TILE } from '../world/generate.js';
/** Non-invasive U6 gameplay controls. No edits to V1/V2 styles or DOM IDs. */
export class CombatControls {
  constructor(ui){
    this.ui=ui;this.targeting=false;this.rosterSignature='';
    const sheet=document.createElement('link');
    sheet.rel='stylesheet';sheet.href=new URL('./combat.css',import.meta.url).href;
    document.head.append(sheet);
    const trigger=document.createElement('button');trigger.id='u6-open';
    trigger.type='button';trigger.textContent='⚔ ทหาร ';const count=document.createElement('b');count.id='u6-badge';count.textContent='1/1';trigger.append(count);
    trigger.setAttribute('aria-label','เปิดหน้าควบคุมมดทหารและการป้องกัน');
    // Persistent tactical actions remain visible without opening a blocking dialog.
    const dock=document.createElement('nav');dock.id='u6-dock';
    dock.setAttribute('aria-label','คำสั่งกองทัพมด');dock.append(trigger);
    const rally=document.createElement('button');rally.id='u6-quick-rally';rally.type='button';
    rally.textContent='⌖ รวมพล';rally.setAttribute('aria-pressed','false');
    const defend=document.createElement('button');defend.id='u6-quick-defend';defend.type='button';
    defend.textContent='ป้องกัน';dock.append(rally,defend);document.body.append(dock);
    const tip=document.createElement('div');tip.id='u6-target-tip';tip.hidden=true;
    const tipText=document.createElement('span');tipText.textContent='แตะช่องบนแผนที่เพื่อรวมพล · ลากเลื่อนได้';
    const cancel=document.createElement('button');cancel.id='u6-cancel-target';cancel.textContent='ยกเลิก';
    tip.append(tipText,cancel);document.body.append(tip);this.tip=tip;
    const dialog=document.createElement('dialog');dialog.id='u6-dialog';
    dialog.setAttribute('aria-labelledby','u6-title');
    dialog.innerHTML=`<section class="u6-sheet">
      <header><h2 id="u6-title">กองทัพมด · ศูนย์บัญชาการ</h2><button type="button" id="u6-close" aria-label="ปิด">×</button></header>
      <div class="u6-stats"><span>มดทหาร <b id="u6-soldiers">1/1</b></span><span>ศัตรู <b id="u6-enemies">0</b></span><span>ปกป้องสำเร็จ <b id="u6-kills">0</b></span><span>นางพญา <b id="u6-queen">48/48</b></span></div>
      <div class="u6-actions"><span>กำลังมดทหาร</span><button id="u6-minus" type="button" aria-label="ลดทหาร">−</button><strong id="u6-target">1</strong><button id="u6-plus" type="button" aria-label="เพิ่มทหาร">+</button></div>
      <div class="u6-modes" role="group" aria-label="ยุทธศาสตร์"><button type="button" data-u6-mode="defend">ป้องกันรัง</button><button type="button" data-u6-mode="rally">รวมพล</button><button type="button" data-u6-mode="retreat">ถอยและพักฟื้น</button></div>
      <button id="u6-rally" type="button">⌖ เลือกช่องบนแผนที่เพื่อรวมพล</button>
      <p id="u6-rally-status" class="u6-subnote">ยังไม่ได้ตั้งจุดรวมพล</p>
      <p id="u6-workforce" class="u6-subnote"></p>
      <h3>รายชื่อมด <small>เกณฑ์ / ปลด / ติดตามตำแหน่ง</small></h3>
      <div id="u6-roster" class="u6-roster" aria-label="กำลังพลและมดงาน"></div>
      <button id="u6-alarm" type="button">จำลองการบุกรุกทันที</button>
      <p id="u6-notice" aria-live="polite">เลือกทหารเพื่อเริ่มป้องกันรัง</p>
      <small>ศัตรูตามธรรมชาติเริ่มปรากฏหลังผ่านไป 3,600 Tick; สามารถทดสอบการบุกได้ทันที ปุ่มรวมพลใช้ช่องแผนที่ที่สำรวจเลือกไว้</small>
    </section>`;
    document.body.append(dialog);
    this.dialog=dialog;
    trigger.addEventListener('click',()=>{dialog.showModal();this.update(true);});
    rally.addEventListener('click',()=>this.armRally());
    defend.addEventListener('click',()=>this.defend());
    cancel.addEventListener('click',()=>this.cancelRally());
    this.ui.mapTapHandler=tile=>this.placeRally(tile);
    document.addEventListener('keydown',e=>{if(e.code==='Escape'&&this.targeting)this.cancelRally();});
    dialog.querySelector('#u6-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.querySelector('#u6-minus').addEventListener('click',()=>this.changeSoldiers(-1));
    dialog.querySelector('#u6-plus').addEventListener('click',()=>this.changeSoldiers(1));
    for(const button of dialog.querySelectorAll('[data-u6-mode]')){
      button.addEventListener('click',()=>{
        const mode=button.dataset.u6Mode;
        if(mode==='rally'){this.armRally();return;}
        this.cancelRally();this.combat.setMode(mode);
        this.report(mode==='defend'?'ทหารเข้าประจำที่ป้องกันรัง':'ทหารเดินไปพักฟื้น');
        this.update(true);
      });
    }
    dialog.querySelector('#u6-rally').addEventListener('click',()=>this.armRally());
    dialog.querySelector('#u6-alarm').addEventListener('click',()=>{
      const result=this.combat.raiseAlarm();
      this.report(result?'ตรวจพบศัตรูบนพื้นผิวแล้ว':'ไม่สามารถสร้างศัตรูได้ (อาจเต็มจำนวนหรือไม่มีทางเดิน)');
      this.update(true);
    });
    dialog.querySelector('#u6-roster').addEventListener('click',e=>{
      const btn=e.target.closest('button[data-action]');if(!btn)return;
      const ant=this.ui.game.colony.workers.find(a=>a.id===btn.dataset.id);if(!ant)return;
      if(btn.dataset.action==='focus'){dialog.close();this.follow(ant);return;}
      const ok=btn.dataset.action==='recruit'?this.combat.recruit(ant):this.combat.demobilize(ant);
      this.report(ok?`${ant.id}: เปลี่ยนหน้าที่สำเร็จ`:'มดตัวนี้ยังไม่พร้อมเปลี่ยนหน้าที่');
      this.update(true);
    });
    this.update(true);
  }
  get combat(){return this.ui.game.combat;}
  report(message){this.dialog.querySelector('#u6-notice').textContent=message;}
  changeSoldiers(delta){
    const c=this.combat,n=this.ui.game.colony.workers.length;
    c.setSoldierSlots(Math.min(n,Math.max(0,c.soldierSlots+delta)));
    this.report(c.soldiers.length<c.soldierSlots?'กำลังรอมดงานว่างเพื่อเข้าเกณฑ์':'จัดกำลังพลเรียบร้อย');
    this.update(true);
  }
  armRally(){
    if(!this.combat.soldiers.length){this.report('กรุณาเกณฑ์ทหารก่อน');return false;}
    this.targeting=true;this.ui.setTool('inspect');this.dialog.close();
    this.tip.hidden=false;
    document.getElementById('u6-quick-rally').setAttribute('aria-pressed','true');
    this.ui.notice('แตะช่องเดินได้บนแผนที่เพื่อรวมพล · ลากเลื่อนแผนที่ได้');
    return true;
  }
  cancelRally(){
    this.targeting=false;this.tip.hidden=true;
    document.getElementById('u6-quick-rally').setAttribute('aria-pressed','false');
  }
  placeRally(tile){
    if(!this.targeting)return false;
    if(this.combat.setRally(tile.layer,tile.x,tile.y)){
      this.ui.renderer.showRallyPing(this.ui.game,tile.layer,tile.x,tile.y);
      this.cancelRally();this.ui.notice(`กำลังรวมพลที่ ${tile.x}, ${tile.y}`);
      this.report('รวมพลสำเร็จ: มดทหารกำลังเดินทาง');
    }else this.ui.notice('ช่องนี้เป็นสิ่งกีดขวางหรือเดินทางไปไม่ได้');
    this.update(true);return true;
  }
  defend(){
    this.cancelRally();this.combat.setMode('defend');
    this.ui.notice('ทหารกลับสู่แนวป้องกัน');this.update(true);
  }
  follow(ant){
    if(this.ui.game.layer!==ant.layer)this.ui.switchLayer(ant.layer);
    const cam=this.ui.cameras[ant.layer];cam.x=(ant.x+.5)*TILE;cam.y=(ant.y+.5)*TILE;
    cam.clamp(this.ui.game.currentLayer,...this.ui.dimensions());
    this.ui.select({layer:ant.layer,x:ant.x,y:ant.y});this.ui.notice(`ติดตาม ${ant.id}`);
  }
  renderRoster(force=false){
    const c=this.combat,workers=this.ui.game.colony.workers;
    const signature=workers.map(a=>[a.id,a.state,a.combatRole,a.combatHP,a.x,a.y,a.layer,c.canRecruit(a)].join(':')).join('|');
    if(!force&&signature===this.rosterSignature)return;
    this.rosterSignature=signature;
    const list=this.dialog.querySelector('#u6-roster'),scroll=list.scrollTop;
    const body=document.createDocumentFragment();
    for(const ant of workers){
      const soldier=ant.combatRole==='soldier';
      const row=document.createElement('div');row.className='u6-unit'+(soldier?' is-soldier':'');
      const info=document.createElement('div');info.className='u6-unit-info';
      const name=document.createElement('strong');name.textContent=ant.id.replace('worker-','มด #')+(soldier?' · ทหาร':' · มดงาน');
      const status=document.createElement('small');
      const states={'combat-guard':'ประจำจุดป้องกัน','combat-rally':'กำลังรวมพล','combat-intercept':'สกัดศัตรู',
        'combat-retreat':'พักฟื้น','combat-attack':'ต่อสู้','idle':'ว่าง','room-rest':'พัก','room-guard':'ลาดตระเวน'};
      status.textContent=(states[ant.state]||(ant.state?.startsWith('forage-')?'หาอาหาร':ant.state||'ว่าง'))+
        ` · ${ant.layer==='surface'?'พื้นผิว':'ใต้ดิน'} (${ant.x},${ant.y})`;
      info.append(name,status);
      if(soldier){
        const hp=document.createElement('progress');hp.max=16;hp.value=Math.max(0,ant.combatHP??16);
        hp.setAttribute('aria-label',`HP ${ant.id} ${hp.value}/16`);info.append(hp);
      }
      const actions=document.createElement('div');actions.className='u6-unit-buttons';
      const locate=document.createElement('button');locate.type='button';locate.dataset.action='focus';
      locate.dataset.id=ant.id;locate.textContent='ดู';locate.setAttribute('aria-label',`ติดตาม ${ant.id}`);
      const assign=document.createElement('button');assign.type='button';assign.dataset.id=ant.id;
      assign.dataset.action=soldier?'demobilize':'recruit';assign.textContent=soldier?'ปลด':'เกณฑ์';
      assign.disabled=!soldier&&!c.canRecruit(ant);
      actions.append(locate,assign);row.append(info,actions);body.append(row);
    }
    list.replaceChildren(body);list.scrollTop=scroll;
  }
  update(force=false){
    const c=this.combat,ready=c.soldiers.length;
    document.getElementById('u6-badge').textContent=`${ready}/${c.soldierSlots}${c.threatCount?' !'+c.threatCount:''}`;
    document.getElementById('u6-quick-defend').setAttribute('aria-pressed',String(c.mode==='defend'));
    if(!this.dialog.open)return;
    const set=(id,value)=>{this.dialog.querySelector(id).textContent=String(value)};
    set('#u6-soldiers',`${ready}/${c.soldierSlots}`);set('#u6-enemies',c.threatCount);
    set('#u6-kills',c.defeated);set('#u6-queen',`${c.queenHP}/48`);set('#u6-target',c.soldierSlots);
    set('#u6-workforce',`แรงงาน ${this.ui.game.colony.workers.length} · ว่างสำหรับเกณฑ์ ${c.availableRecruits.length}`);
    set('#u6-rally-status',c.rally?`จุดรวมพล ${c.rally.layer==='surface'?'พื้นผิว':'ใต้ดิน'} (${c.rally.x},${c.rally.y}) · ถึงแล้ว ${c.ralliedCount}/${ready}`:'ยังไม่มีจุดรวมพล');
    this.dialog.querySelector('#u6-minus').disabled=c.soldierSlots===0;
    this.dialog.querySelector('#u6-plus').disabled=c.soldierSlots>=this.ui.game.colony.workers.length;
    for(const btn of this.dialog.querySelectorAll('[data-u6-mode]'))btn.setAttribute('aria-pressed',String(btn.dataset.u6Mode===c.mode));
    this.renderRoster(force);
  }
}
