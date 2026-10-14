import { TILE } from '../world/generate.js';
/** Non-invasive U6 gameplay controls. No edits to V1/V2 styles or DOM IDs. */
export class CombatControls {
  constructor(ui){
    this.ui=ui;ui.combatControls=this;this.targeting=false;this.rosterSignature='';
    this.selectedSquad='A';this.armedSquad=null;this.rosterFilter='all';this.lastGame=ui.game;
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
    const tipText=document.createElement('span');tipText.textContent='กอง A · แตะช่องบนแผนที่เพื่อรวมพล · ลากเลื่อนได้';
    const cancel=document.createElement('button');cancel.id='u6-cancel-target';cancel.type='button';cancel.textContent='ยกเลิก';cancel.setAttribute('aria-label','ยกเลิกการเลือกจุดรวมพล');
    tip.append(tipText,cancel);dock.append(tip);this.tip=tip;this.tipText=tipText;
    const dialog=document.createElement('dialog');dialog.id='u6-dialog';
    dialog.setAttribute('aria-labelledby','u6-title');
    dialog.innerHTML=`<section class="u6-sheet">
      <header><div class="u6-heading"><h2 id="u6-title">ศูนย์บัญชาการทหาร</h2><small>เลือกกอง · สั่งการ · จัดกำลัง</small></div><button type="button" id="u6-close" aria-label="ปิด">×</button></header>
      <div class="u6-stats"><span>มดทหาร <b id="u6-soldiers">1/1</b></span><span>ศัตรู <b id="u6-enemies">0</b></span><span>ปกป้องสำเร็จ <b id="u6-kills">0</b></span><span>นางพญา <b id="u6-queen">48/48</b></span></div>
      <div class="u6-main"><div class="u6-command-column">
      <section class="u6-squad-panel" aria-label="จัดการกองทหาร">
        <div class="u6-squad-tabs" role="group" aria-label="เลือกกองทหาร">
          <button type="button" data-u6-squad="A" aria-pressed="true">กอง A</button>
          <button type="button" data-u6-squad="B" aria-pressed="false">กอง B</button>
        </div>
        <div class="u6-squad-overview" aria-label="ภาพรวมทั้งสองกอง">
          <p id="u6-overview-a"></p><p id="u6-overview-b"></p>
        </div>
        <div class="u6-squad-detail" aria-label="รายละเอียดกองที่เลือก">
          <strong id="u6-selected-squad">กอง A</strong>
          <p id="u6-squad-count"></p>
          <p id="u6-squad-order"></p>
          <p id="u6-squad-formation"></p>
          <p id="u6-squad-emergency"></p>
        </div>
      </section>
      <div class="u6-command-actions">
        <div class="u6-modes" role="group" aria-label="ยุทธศาสตร์"><button type="button" data-u6-mode="defend">ป้องกันรัง</button><button type="button" data-u6-mode="rally">รวมพล</button><button type="button" data-u6-mode="retreat">ถอยและพักฟื้น</button></div>
        <button id="u6-rally" type="button">⌖ เลือกจุดรวมพลบนแผนที่</button>
        <p id="u6-rally-status" class="u6-subnote">ยังไม่ได้ตั้งจุดรวมพล</p>
      </div>
      <div class="u6-percent-control"><label for="u6-percent"><span>สัดส่วนมดทหารอัตโนมัติ</span><strong id="u6-target">20%</strong></label>
        <input id="u6-percent" type="range" min="0" max="40" step="5" value="20" aria-label="เปอร์เซ็นต์มดทหาร" />
        <small>เกณฑ์มดว่างตามสัดส่วนที่ตั้งไว้ โดยไม่ขัดจังหวะงานเดิม</small>
      </div>
      </div>
      <section class="u6-roster-panel" aria-label="รายชื่อและการย้ายกอง">
        <div class="u6-roster-head">
          <h3>จัดกำลังพล <small>แตะดูตำแหน่งหรือย้ายกอง</small></h3>
          <label for="u6-roster-filter">แสดง <select id="u6-roster-filter" aria-label="กรองรายชื่อมด">
            <option value="all">มดทั้งหมด</option><option value="soldiers">ทหารทั้งหมด</option>
            <option value="selected">ทหารกองที่เลือก</option><option value="workers">มดงาน</option>
          </select></label>
        </div>
        <p id="u6-workforce" class="u6-subnote"></p>
        <div id="u6-roster" class="u6-roster" aria-label="กำลังพลและมดงาน"></div>
      </section></div>
      <details class="u6-advanced"><summary>เครื่องมือทดสอบการบุกรุก</summary>
        <button id="u6-alarm" type="button">จำลองการบุกรุกทันที</button>
        <small>ศัตรูตามธรรมชาติเริ่มปรากฏหลังผ่านไป 3,600 Tick</small>
      </details>
      <p id="u6-notice" aria-live="polite">เลือกกองทหารเพื่อเริ่มสั่งการ</p>
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
    dialog.querySelector('#u6-percent').addEventListener('input',event=>{
      this.ui.game.workforce.setShare('soldier',Number(event.target.value));
      this.report('อัปเดตสัดส่วนทหารแล้ว ระบบจะเกณฑ์มดว่างตามเป้าหมายโดยอัตโนมัติ');
      this.ui.updateMetrics();this.update(true);
    });
    for(const button of dialog.querySelectorAll('[data-u6-squad]')){
      button.addEventListener('click',()=>this.selectSquad(button.dataset.u6Squad));
    }
    for(const button of dialog.querySelectorAll('[data-u6-mode]')){
      button.addEventListener('click',()=>{
        const mode=button.dataset.u6Mode;
        if(mode==='rally'){this.armRally();return;}
        this.order(mode);
      });
    }
    dialog.querySelector('#u6-rally').addEventListener('click',()=>this.armRally());
    dialog.querySelector('#u6-roster-filter').addEventListener('change',event=>{
      this.rosterFilter=event.target.value;this.rosterSignature='';
      this.renderRoster(true,this.combat.getSquads?.().data??[]);
    });
    dialog.querySelector('#u6-alarm').addEventListener('click',()=>{
      const result=this.combat.raiseAlarm();
      this.report(result?'ตรวจพบศัตรูบนพื้นผิวแล้ว':'ไม่สามารถสร้างศัตรูได้ (อาจเต็มจำนวนหรือไม่มีทางเดิน)');
      this.update(true);
    });
    dialog.querySelector('#u6-roster').addEventListener('click',e=>{
      const btn=e.target.closest('button[data-action]');if(!btn)return;
      if(btn.dataset.action==='transfer'){
        this.transfer(btn.dataset.id,btn.dataset.toSquad);return;
      }
      const ant=this.ui.game.colony.workers.find(a=>a.id===btn.dataset.id);if(!ant)return;
      if(btn.dataset.action==='focus'){dialog.close();this.follow(ant);return;}
      this.update(true);
    });
    this.update(true);
  }
  get combat(){return this.ui.game.combat;}
  report(message){this.dialog.querySelector('#u6-notice').textContent=message;}
  resultError(result,fallback='คำสั่งไม่สำเร็จ'){
    const code=result?.error?.code;
    const messages={
      INVALID_SQUAD:'ไม่พบกองทหารที่เลือก',INVALID_SOLDIER:'ไม่พบมดทหารนี้',
      NOT_ACTIVE_SOLDIER:'มดตัวนี้ไม่ได้ประจำการ',SAME_SQUAD:'มดประจำการอยู่ในกองนี้แล้ว',
      INVALID_ORDER:'คำสั่งไม่ถูกต้อง',INVALID_RALLY:'ตำแหน่งรวมพลไม่ถูกต้อง',
      UNREACHABLE_RALLY:'ตำแหน่งรวมพลเดินทางไปไม่ได้'
    };
    const message=messages[code]??result?.error?.message??fallback;
    this.report(message);this.ui.notice(message);
    return message;
  }
  readSquad(id=this.selectedSquad){
    return this.combat.getSquad?.(id)??{ok:false,error:{code:'INVALID_SQUAD',message:'ยังไม่พร้อมใช้งานระบบแยกกอง'}};
  }
  selectSquad(id){
    if(id!=='A'&&id!=='B')return false;
    const result=this.readSquad(id);
    if(result.ok!==true){this.resultError(result);return false;}
    this.selectedSquad=id;
    this.update(true);return true;
  }
  order(mode){
    const squad=this.selectedSquad;
    const result=this.combat.setSquadMode?.(squad,mode);
    if(result?.ok!==true){this.resultError(result,'ไม่สามารถเปลี่ยนคำสั่งได้');this.update(true);return false;}
    this.cancelRally();
    const message=mode==='defend'?'กอง '+squad+' กลับป้องกันรัง':'กอง '+squad+' ถอยและพักฟื้น';
    this.report(message);this.ui.notice(message);this.update(true);
    return true;
  }
  transfer(soldierId,toSquad){
    const result=this.combat.transferSoldier(soldierId,toSquad);
    if(result?.ok===true){
      this.report(`ย้าย ${result.data.soldierId} จากกอง ${result.data.fromSquad} ไปกอง ${result.data.toSquad} แล้ว`);
      this.rosterSignature='';
    }else this.resultError(result,'ไม่สามารถย้ายทหารได้');
    this.update(true);return result?.ok===true;
  }
  armRally(){
    const squad=this.selectedSquad;
    const result=this.readSquad(squad);
    if(result.ok!==true){this.resultError(result);return false;}
    // Empty squads may receive a standing rally order under Contract v1.0.
    this.armedSquad=squad;this.targeting=true;this.ui.setTool('inspect');this.dialog.close();
    this.tip.hidden=false;
    this.tipText.textContent=`กอง ${squad} · แตะช่องเพื่อรวมพล`;
    document.getElementById('u6-quick-rally').setAttribute('aria-pressed','true');
    this.ui.notice(`เลือกจุดรวมพลกอง ${squad} บนแผนที่ · ยกเลิกได้ด้วย Escape`);
    return true;
  }
  cancelRally(){
    this.targeting=false;this.armedSquad=null;this.tip.hidden=true;
    document.getElementById('u6-quick-rally').setAttribute('aria-pressed','false');
  }
  placeRally(tile){
    if(!this.targeting)return false;
    const squad=this.armedSquad;
    const result=this.combat.setSquadRally?.(squad,tile.layer,tile.x,tile.y);
    if(result?.ok===true){
      this.ui.renderer.showRallyPing(this.ui.game,tile.layer,tile.x,tile.y);
      this.cancelRally();
      const message=`กอง ${squad} รวมพลที่ ${tile.x}, ${tile.y} แล้ว`;
      this.ui.notice(message);this.report(message);
    }else this.resultError(result,'ไม่สามารถตั้งจุดรวมพลได้');
    this.update(true);return true;
  }
  defend(){return this.order('defend');}
  follow(ant){
    if(this.ui.game.layer!==ant.layer)this.ui.switchLayer(ant.layer);
    const cam=this.ui.cameras[ant.layer];cam.x=(ant.x+.5)*TILE;cam.y=(ant.y+.5)*TILE;
    cam.clamp(this.ui.game.currentLayer,...this.ui.dimensions());
    this.ui.select({layer:ant.layer,x:ant.x,y:ant.y},ant.id);this.ui.notice(`ติดตาม ${ant.id}`);
  }
  renderRoster(force=false,squads=[]){
    const c=this.combat,workers=this.ui.game.colony.workers;
    const members=new Map();
    for(const squad of squads)for(const member of squad.soldiers)members.set(String(member.id),{squadId:squad.id,member});
    const signature=workers.map(a=>[a.id,a.state,a.combatRole,a.combatHP,a.x,a.y,a.layer,c.canRecruit(a)].join(':')).join('|')+
      '|'+squads.map(s=>s.id+':'+s.soldiers.map(a=>[a.id,a.hp,a.maxHP,a.formationStatus,a.arrived].join(':')).join(';')).join('|')+
      '|'+(this.rosterFilter??'all')+':'+this.selectedSquad;
    if(!force&&signature===this.rosterSignature)return;
    this.rosterSignature=signature;
    const list=this.dialog.querySelector('#u6-roster'),scroll=list.scrollTop;
    const body=document.createDocumentFragment();
    const filter=this.rosterFilter??'all';
    const visible=workers.filter(ant=>{
      const soldier=ant.combatRole==='soldier';
      if(filter==='soldiers')return soldier;
      if(filter==='selected')return soldier&&members.get(String(ant.id))?.squadId===this.selectedSquad;
      if(filter==='workers')return !soldier;
      return true;
    });
    if(!visible.length){
      const empty=document.createElement('p');empty.className='u6-empty';
      empty.textContent=filter==='selected'
        ?`กอง ${this.selectedSquad} ยังไม่มีทหาร · เลือก “ทหารทั้งหมด” เพื่อย้ายทหารเข้ากอง`
        :'ไม่มีมดในรายการนี้';
      body.append(empty);
    }
    for(const ant of visible){
      const membership=members.get(String(ant.id));
      const soldier=ant.combatRole==='soldier',squadId=membership?.squadId;
      const row=document.createElement('div');row.className='u6-unit'+(soldier?' is-soldier':'');
      const info=document.createElement('div');info.className='u6-unit-info';
      const name=document.createElement('strong');name.textContent=ant.id.replace('worker-','มด #')+(soldier?` · ทหารกอง ${squadId??'?'}`:' · มดงาน');
      const status=document.createElement('small');
      const states={'combat-guard':'ประจำจุดป้องกัน','combat-rally':'กำลังรวมพล','combat-intercept':'สกัดศัตรู',
        'combat-retreat':'พักฟื้น','combat-attack':'ต่อสู้','combat-queen-defense':'ปกป้องราชินี','idle':'ว่าง','room-rest':'พัก','room-guard':'ลาดตระเวน'};
      status.textContent=(states[ant.state]||(ant.state?.startsWith('forage-')?'หาอาหาร':ant.state||'ว่าง'))+
        ` · ${ant.layer==='surface'?'พื้นผิว':'ใต้ดิน'} (${ant.x},${ant.y})`+
        (membership?` · ${membership.member.formationStatus??'ไม่มี Formation'}${membership.member.arrived?' · ถึงจุดรวมพลแล้ว':''}`:'');
      info.append(name,status);
      if(soldier){
        const hp=document.createElement('progress');
        hp.max=membership?.member.maxHP??16;hp.value=Math.max(0,membership?.member.hp??ant.combatHP??16);
        hp.setAttribute('aria-label',`HP ${ant.id} ${hp.value}/${hp.max}`);info.append(hp);
      }
      const actions=document.createElement('div');actions.className='u6-unit-buttons';
      const locate=document.createElement('button');locate.type='button';locate.dataset.action='focus';
      locate.dataset.id=ant.id;locate.textContent='ดู';locate.setAttribute('aria-label',`ติดตาม ${ant.id}`);
      actions.append(locate);
      if(soldier&&squadId){
        const toSquad=squadId==='A'?'B':'A';
        const transfer=document.createElement('button');transfer.type='button';
        transfer.dataset.action='transfer';transfer.dataset.id=String(ant.id);transfer.dataset.toSquad=toSquad;
        transfer.textContent=`ไปกอง ${toSquad}`;
        transfer.setAttribute('aria-label',`ย้าย ${ant.id} จากกอง ${squadId} ไปกอง ${toSquad}`);
        actions.append(transfer);
      }
      row.append(info,actions);body.append(row);
    }
    const focused=list.contains(document.activeElement)&&document.activeElement?.dataset?
      {id:document.activeElement.dataset.id,action:document.activeElement.dataset.action}:null;
    list.replaceChildren(body);list.scrollTop=scroll;
    if(focused){
      const replacement=[...list.querySelectorAll('button[data-action]')].find(
        button=>button.dataset.id===focused.id&&button.dataset.action===focused.action);
      replacement?.focus();
    }
  }
  update(force=false){
    if(this.lastGame!==this.ui.game){
      this.lastGame=this.ui.game;this.selectedSquad='A';this.rosterFilter='all';this.rosterSignature='';
      this.cancelRally();
    }
    const c=this.combat,read=c.getSquads?.();
    const squads=read?.ok===true?read.data:[];
    const selected=this.readSquad();
    const active=selected.ok===true?selected.data:null;
    const ready=c.soldiers.length;
    document.getElementById('u6-badge').textContent=`${ready}/${c.soldierSlots}${c.threatCount?' !'+c.threatCount:''}`;
    document.getElementById('u6-quick-defend').setAttribute('aria-pressed',String(active?.mode==='defend'));
    document.getElementById('u6-quick-rally').textContent=`⌖ รวมพล ${this.selectedSquad}`;
    document.getElementById('u6-quick-defend').textContent=`ป้องกัน ${this.selectedSquad}`;
    if(!this.dialog.open)return;
    const set=(id,value)=>{this.dialog.querySelector(id).textContent=String(value)};
    set('#u6-soldiers',`${ready}/${c.soldierSlots}`);set('#u6-enemies',c.threatCount);
    set('#u6-kills',c.defeated);set('#u6-queen',`${c.queenHP}/48`);
    const workforce=this.ui.game.workforce,share=workforce.shares.soldier;
    set('#u6-target',share+'%');
    const slider=this.dialog.querySelector('#u6-percent');
    slider.max=String(100-workforce.shares.forage-workforce.shares.nurse);
    slider.value=String(share);
    set('#u6-workforce',`มดงาน ${this.ui.game.colony.workers.length} ตัว · ทหารเป้าหมาย ${c.soldierSlots} · ประจำการ ${ready} · พร้อมเข้าเกณฑ์ ${c.availableRecruits.length}`);
    for(const squad of squads){
      const rally=squad.rally?`${squad.rally.layer} (${squad.rally.x},${squad.rally.y})`:'ไม่มีจุดรวมพล';
      set('#u6-overview-'+squad.id.toLowerCase(),
        `กอง ${squad.id} · ${squad.count} ตัว · HP ${squad.hpCurrent}/${squad.hpMax} · ${{defend:'ป้องกันรัง',rally:'รวมพล',retreat:'พักฟื้น'}[squad.mode]??squad.mode}`);
    }
    set('#u6-selected-squad',`กอง ${this.selectedSquad}`);
    set('#u6-squad-count',active?`กำลังพล ${active.count} ตัว · HP ${active.hpCurrent}/${active.hpMax}`:'ไม่มีข้อมูลกอง');
    set('#u6-squad-order',active?`คำสั่ง ${{defend:'ป้องกันรัง',rally:'รวมพล',retreat:'ถอยและพักฟื้น'}[active.mode]??active.mode} · จุดรวมพล ${active.rally?`${active.rally.layer==='surface'?'พื้นผิว':'ใต้ดิน'} (${active.rally.x},${active.rally.y})`:'ยังไม่กำหนด'}`:'');
    set('#u6-squad-formation',active?`ประจำจุด ${active.formation.assigned} · รอคำสั่ง ${active.formation.standby} · ไปไม่ถึง ${active.formation.unreachable} · ถึงจุดรวมพล ${active.ralliedCount}/${active.count}`:'');
    set('#u6-squad-emergency',active?.queenEmergency?'ฉุกเฉิน: ปกป้องนางพญา (ทุกกอง)':'');
    set('#u6-rally-status',active?.rally?`กอง ${active.id} · จุดรวมพล ${active.rally.layer} (${active.rally.x},${active.rally.y}) · ถึงแล้ว ${active.ralliedCount}/${active.count}`:'ยังไม่มีจุดรวมพล');
    for(const btn of this.dialog.querySelectorAll('[data-u6-mode]'))btn.setAttribute('aria-pressed',String(btn.dataset.u6Mode===active?.mode));
    for(const btn of this.dialog.querySelectorAll('[data-u6-squad]'))btn.setAttribute('aria-pressed',String(btn.dataset.u6Squad===this.selectedSquad));
    this.renderRoster(force,squads);
  }
}
