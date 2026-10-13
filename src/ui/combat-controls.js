/** Non-invasive U6 gameplay controls. No edits to V1/V2 styles or DOM IDs. */
export class CombatControls {
  constructor(ui){
    this.ui=ui;
    const sheet=document.createElement('link');
    sheet.rel='stylesheet';sheet.href=new URL('./combat.css',import.meta.url).href;
    document.head.append(sheet);
    const trigger=document.createElement('button');trigger.id='u6-open';
    trigger.type='button';trigger.textContent='⚔ ป้องกันรัง';
    trigger.setAttribute('aria-label','เปิดหน้าควบคุมมดทหารและการป้องกัน');
    const host=document.querySelector('.dig-tools');
    if(!host)throw new Error('U6 requires existing construction tool dock');
    host.append(trigger);
    const dialog=document.createElement('dialog');dialog.id='u6-dialog';
    dialog.setAttribute('aria-labelledby','u6-title');
    dialog.innerHTML=`<section class="u6-sheet">
      <header><h2 id="u6-title">ศูนย์บัญชาการป้องกันรัง</h2><button type="button" id="u6-close" aria-label="ปิด">×</button></header>
      <div class="u6-stats"><span>มดทหาร <b id="u6-soldiers">0/0</b></span><span>ศัตรู <b id="u6-enemies">0</b></span><span>ปกป้องสำเร็จ <b id="u6-kills">0</b></span><span>นางพญา <b id="u6-queen">48/48</b></span></div>
      <div class="u6-actions"><span>กำลังมดทหาร</span><button id="u6-minus" type="button" aria-label="ลดทหาร">−</button><strong id="u6-target">0</strong><button id="u6-plus" type="button" aria-label="เพิ่มทหาร">+</button></div>
      <div class="u6-modes" role="group" aria-label="ยุทธศาสตร์"><button type="button" data-u6-mode="defend">ป้องกันรัง</button><button type="button" data-u6-mode="rally">รวมพล</button><button type="button" data-u6-mode="retreat">ถอยและพักฟื้น</button></div>
      <button id="u6-rally" type="button">กำหนดจุดรวมพลจากช่องแผนที่ที่เลือก</button>
      <button id="u6-alarm" type="button">จำลองการบุกรุกทันที</button>
      <p id="u6-notice" aria-live="polite">เลือกทหารเพื่อเริ่มป้องกันรัง</p>
      <small>ศัตรูตามธรรมชาติเริ่มปรากฏหลังผ่านไป 3,600 Tick; สามารถทดสอบการบุกได้ทันที ปุ่มรวมพลใช้ช่องแผนที่ที่สำรวจเลือกไว้</small>
    </section>`;
    document.body.append(dialog);
    this.dialog=dialog;
    trigger.addEventListener('click',()=>{this.update();dialog.showModal();});
    dialog.querySelector('#u6-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.querySelector('#u6-minus').addEventListener('click',()=>this.changeSoldiers(-1));
    dialog.querySelector('#u6-plus').addEventListener('click',()=>this.changeSoldiers(1));
    for(const button of dialog.querySelectorAll('[data-u6-mode]')){
      button.addEventListener('click',()=>{
        const mode=button.dataset.u6Mode;
        if(mode==='rally'&&!this.combat.rally){this.report('เลือกช่องแผนที่แล้วกดกำหนดจุดรวมพลก่อน');return;}
        this.combat.setMode(mode);this.report(`เปลี่ยนคำสั่งเป็น ${button.textContent}`);this.update();
      });
    }
    dialog.querySelector('#u6-rally').addEventListener('click',()=>{
      const tile=this.ui.selection;
      if(!tile||!this.combat.setRally(tile.layer,tile.x,tile.y)){this.report('เลือกช่องที่เดินได้บนแผนที่ก่อน');return;}
      this.report(`ตั้งจุดรวมพล ${tile.layer} (${tile.x}, ${tile.y})`);this.update();
    });
    dialog.querySelector('#u6-alarm').addEventListener('click',()=>{
      const result=this.combat.raiseAlarm();
      this.report(result?'ตรวจพบศัตรูบนพื้นผิวแล้ว':'ไม่สามารถสร้างศัตรูได้ (อาจเต็มจำนวนหรือไม่มีทางเดิน)');
      this.update();
    });
    this.update();
  }
  get combat(){return this.ui.game.combat;}
  report(message){this.dialog.querySelector('#u6-notice').textContent=message;}
  changeSoldiers(delta){
    const combat=this.combat;
    const size=this.ui.game.colony.workers.length;
    combat.setSoldierSlots(Math.min(size,Math.max(0,combat.soldierSlots+delta)));
    this.update();
  }
  update(){
    if(!this.dialog.open)return;
    const c=this.combat;
    const val=(id,text)=>{this.dialog.querySelector(id).textContent=String(text);};
    val('#u6-soldiers',`${c.soldiers.length}/${c.soldierSlots}`);
    val('#u6-enemies',c.threatCount);
    val('#u6-kills',c.defeated);
    val('#u6-queen',`${c.queenHP}/48`);
    val('#u6-target',c.soldierSlots);
    this.dialog.querySelector('#u6-minus').disabled=c.soldierSlots===0;
    this.dialog.querySelector('#u6-plus').disabled=c.soldierSlots>=this.ui.game.colony.workers.length;
    for(const btn of this.dialog.querySelectorAll('[data-u6-mode]'))btn.setAttribute('aria-pressed',String(btn.dataset.u6Mode===c.mode));
  }
}
