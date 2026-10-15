// ANT KINGDOM / UI-05 — G1.0 feature component. Map drag/pinch remains Coordinator-owned.
const ERRORS={
 'unknown-room':'ไม่รู้จักประเภทห้อง','invalid-position':'ตำแหน่งไม่ถูกต้อง',
 'size-too-small':'ห้องต้องมีพื้นที่อย่างน้อย 4 ช่อง',
 'size-too-large':'ความกว้างและความสูงต้องไม่เกิน 8 ช่อง',
 'out-of-bounds':'พื้นที่อยู่นอกขอบแผนที่',
 'needs-excavation':'ต้องขุดพื้นที่ให้โล่งก่อน',
 'overlap':'พื้นที่มีห้องอื่นอยู่แล้ว','disconnected':'ห้องต้องมีทางเชื่อมถึงรัง',
 'entrance':'ไม่สามารถสร้างทับปากทางเข้า',
 'queue-full':'คิวก่อสร้างเต็ม','insufficient-resources':'ทรัพยากรไม่เพียงพอ',
 'ROOM_NOT_CANCELLABLE':'ห้องนี้ยกเลิกการก่อสร้างไม่ได้',
 'UNDERGROUND_ONLY':'สร้างห้องหรือขุดได้เฉพาะใต้ดิน',
 'INVALID_DIG_RECT':'พื้นที่ขุดไม่ถูกต้อง'
};
const STATUS={planned:'รอก่อสร้าง',building:'กำลังก่อสร้าง',ready:'พร้อมใช้',disabled:'ขาดทางเชื่อม'};
const errorFor=v=>ERRORS[v?.reason??v?.error?.code]||v?.error?.message||'คำสั่งไม่สำเร็จ';
const make=(d,t,c,x)=>{const e=d.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e;};
const txt=(el,x)=>{const s=String(x);if(el.textContent!==s)el.textContent=s;};
const safeInt=(n,min,max)=>Math.max(min,Math.min(max,Math.round(Number(n)||min)));

export function mount(container,{view,actions,overlay,subscribe}){
 if(!container||!actions||!overlay||typeof subscribe!=='function')
   throw new TypeError('UI-05 requires the G1 feature interface');
 const d=container.ownerDocument;
 const root=make(d,'section','ui05-root');root.hidden=true;
 root.setAttribute('aria-label','เครื่องมือขุดและสร้างห้อง');
 const header=make(d,'header','ui05-header');
 const title=make(d,'strong','ui05-title','เครื่องมือก่อสร้าง');
 const toggle=make(d,'button','ui05-collapse','ย่อ');toggle.type='button';toggle.setAttribute('aria-expanded','true');
 header.append(title,toggle);
 const body=make(d,'div','ui05-body');
 const build=make(d,'div','ui05-build');
 const roomTypeLine=make(d,'div','ui05-type-line');
 const typeTrigger=make(d,'button','ui05-type-trigger');typeTrigger.type='button';
 typeTrigger.setAttribute('aria-haspopup','listbox');typeTrigger.setAttribute('aria-expanded','false');
 const picker=make(d,'div','ui05-type-list');picker.hidden=true;picker.setAttribute('role','listbox');
 picker.setAttribute('aria-label','เลือกประเภทห้อง');
 roomTypeLine.append(typeTrigger,picker);
 const shape=make(d,'div','ui05-shape');
 const widths=make(d,'div','ui05-dimension');
 const heights=make(d,'div','ui05-dimension');
 const wMinus=make(d,'button','ui05-step','−');wMinus.type='button';wMinus.setAttribute('aria-label','ลดความกว้าง');
 const wValue=make(d,'strong','ui05-dimension-value');
 const wPlus=make(d,'button','ui05-step','+');wPlus.type='button';wPlus.setAttribute('aria-label','เพิ่มความกว้าง');
 const hMinus=make(d,'button','ui05-step','−');hMinus.type='button';hMinus.setAttribute('aria-label','ลดความสูง');
 const hValue=make(d,'strong','ui05-dimension-value');
 const hPlus=make(d,'button','ui05-step','+');hPlus.type='button';hPlus.setAttribute('aria-label','เพิ่มความสูง');
 widths.append(make(d,'span','ui05-dimension-label','กว้าง'),wMinus,wValue,wPlus);
 heights.append(make(d,'span','ui05-dimension-label','สูง'),hMinus,hValue,hPlus);
 shape.append(widths,heights);
 const plan=make(d,'p','ui05-plan');
 const verdict=make(d,'p','ui05-verdict');verdict.setAttribute('role','status');
 const buildAction=make(d,'button','ui05-primary','สั่งสร้างที่ช่องเลือก');buildAction.type='button';
 const buildHint=make(d,'small','ui05-hint','แตะห้อง 2×2 บนแผนที่ได้ตามระบบเดิม หรือใช้ปุ่มนี้กับช่องที่เลือกไว้');
 build.append(roomTypeLine,shape,plan,verdict,buildAction,buildHint);
 const dig=make(d,'div','ui05-dig');
 const digHelp=make(d,'p','ui05-hint','เลือกช่องเริ่มต้นในโหมดสำรวจ แล้วเปลี่ยนเป็นโหมดขุดเพื่อจัดการพื้นที่');
 const digSummary=make(d,'p','ui05-dig-summary');
 const digControls=make(d,'div','ui05-actions');
 const digAdd=make(d,'button','ui05-primary','สั่งขุดเพิ่ม');digAdd.type='button';
 const digRemove=make(d,'button','ui05-danger','ยกเลิกขุดในพื้นที่');digRemove.type='button';
 const digClear=make(d,'button','ui05-secondary','ล้างการเลือก');digClear.type='button';
 digControls.append(digAdd,digRemove,digClear);
 dig.append(digHelp,digSummary,digControls);
 const inspect=make(d,'div','ui05-inspect');
 const inspectLabel=make(d,'strong','ui05-inspect-title');
 const inspectDetail=make(d,'span','ui05-room-status');
 const roomCancel=make(d,'button','ui05-danger','ยกเลิกการก่อสร้าง');roomCancel.type='button';
 inspect.append(inspectLabel,inspectDetail,roomCancel);
 const feedback=make(d,'p','ui05-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 body.append(build,dig,inspect,feedback);root.append(header,body);container.append(root);
 const popoverId='ui05-room-options';
 const unregister=overlay.registerPanel(popoverId,{element:picker,kind:'popover',
   show:()=>{picker.hidden=false;typeTrigger.setAttribute('aria-expanded','true');},
   hide:()=>{picker.hidden=true;typeTrigger.setAttribute('aria-expanded','false');}
 });
 let latest=view,roomType='nursery',width=2,height=2,collapsed=false,disposed=false;
 let anchor=null;let selectedRoomId=null;
 const report=(response,success)=>{
   const ok=!!response?.ok;
   txt(feedback,ok?success:errorFor(response));
   feedback.dataset.state=ok?'success':'error';
   return ok;
 };
 function currentAnchor(){
   const selected=latest?.home?.selected;
   return selected?.layer==='underground' && Number.isInteger(selected.x) && Number.isInteger(selected.y)
     ? {x:selected.x,y:selected.y}:null;
 }
 function currentRoom(){
   const tile=currentAnchor();
   if(!tile)return null;
   return (latest?.rooms?.items||[]).find(room=>tile.x>=room.x&&tile.x<room.x+room.width&&tile.y>=room.y&&tile.y<room.y+room.height)||null;
 }
 function getLimits(){return latest?.rooms?.limits||{minArea:4,maxWidth:8,maxHeight:8};}
 function shapeChanged(){
   const limits=getLimits();
   width=safeInt(width,1,limits.maxWidth);height=safeInt(height,1,limits.maxHeight);
   render();
 }
 wMinus.addEventListener('click',()=>{width--;shapeChanged();});
 wPlus.addEventListener('click',()=>{width++;shapeChanged();});
 hMinus.addEventListener('click',()=>{height--;shapeChanged();});
 hPlus.addEventListener('click',()=>{height++;shapeChanged();});
 toggle.addEventListener('click',()=>{
   collapsed=!collapsed;body.hidden=collapsed;
   txt(toggle,collapsed?'ขยาย':'ย่อ');toggle.setAttribute('aria-expanded',String(!collapsed));
   if(collapsed)overlay.closePanel(popoverId);
 });
 typeTrigger.addEventListener('click',()=>{
   if(overlay.isOpen(popoverId))overlay.closePanel(popoverId);
   else overlay.openPanel(popoverId,{opener:typeTrigger});
 });
 picker.addEventListener('keydown',event=>{
   const buttons=[...picker.querySelectorAll('button')];let index=buttons.indexOf(d.activeElement);
   if(event.key==='ArrowDown')index=(index+1)%buttons.length;
   else if(event.key==='ArrowUp')index=(index+buttons.length-1)%buttons.length;
   else if(event.key==='Home')index=0;
   else if(event.key==='End')index=buttons.length-1;
   else return;
   event.preventDefault();buttons[index]?.focus();
 });
 typeTrigger.addEventListener('keydown',event=>{
   if(!['ArrowDown','ArrowUp'].includes(event.key))return;
   event.preventDefault();overlay.openPanel(popoverId,{opener:typeTrigger});
   picker.querySelector('button[aria-selected="true"]')?.focus();
 });
 buildAction.addEventListener('click',()=>{
   const p=currentAnchor();if(!p)return;
   const check=actions.validateRoom(roomType,p.x,p.y,width,height);
   if(!check?.ok){report(check,'');render();return;}
   const result=actions.queueRoom(roomType,p.x,p.y,width,height);
   report(result,`สั่งสร้างห้อง ${width}×${height} แล้ว · รอมดงานก่อสร้าง`);
   render();
 });
 roomCancel.addEventListener('click',()=>{
   const item=currentRoom();
   if(!item||!['planned','building'].includes(item.status))return;
   const response=actions.cancelRoom(item.id);
   report(response,'ยกเลิกโครงการก่อสร้างและคืนทรัพยากรแล้ว');render();
 });
 function rectangle(){
   const p=anchor || currentAnchor();
   if(!p)return null;
   return {from:p,to:{x:p.x+width-1,y:p.y+height-1}};
 }
 function doDig(cancel){
   const area=rectangle();if(!area)return;
   const response=cancel?actions.cancelDig(area.from,area.to):actions.queueDig(area.from,area.to);
   const info=response?.data;
   const message=cancel?`ยกเลิกคำสั่งขุด ${info?.cancelled??0} ช่อง`:
     `เพิ่มคำสั่งขุด ${info?.added??0} ช่อง · มีอยู่แล้ว ${info?.existing??0} · ขุดไม่ได้ ${info?.blocked??0}${info?.limit?' · คิวเต็ม':''}`;
   report(response,message);render();
 }
 digAdd.addEventListener('click',()=>doDig(false));
 digRemove.addEventListener('click',()=>doDig(true));
 digClear.addEventListener('click',()=>{anchor=null;txt(feedback,'ล้างเฉพาะการเลือก ไม่ยกเลิกคำสั่งขุดจริง');render();});
 function renderPicker(catalog){
   const sig=catalog.map(x=>x.type).join('|');
   if(picker.dataset.catalog!==sig){
     picker.dataset.catalog=sig;picker.replaceChildren();
     for(const r of catalog){
       const btn=make(d,'button','ui05-type-option',r.name);btn.type='button';btn.dataset.roomType=r.type;btn.setAttribute('role','option');
       btn.addEventListener('click',()=>{
         roomType=r.type;width=r.width;height=r.height;
         overlay.closePanel(popoverId);render();
       });picker.append(btn);
     }
   }
   for(const btn of picker.children){
     const active=btn.dataset.roomType===roomType;
     btn.setAttribute('aria-selected',String(active));btn.classList.toggle('is-selected',active);
   }
   const name=catalog.find(c=>c.type===roomType)?.name||'เลือกประเภทห้อง';
   txt(typeTrigger,name+' ▾');
   typeTrigger.setAttribute('aria-label',`ประเภทห้อง ${name}`);
 }
 function render(){
   if(disposed)return;
   const mode=latest?.home?.tool;
   const onUnderground=latest?.home?.layer==='underground';
   const item=currentRoom();
   const isBuild=mode==='room'&&onUnderground;
   const isDig=mode==='dig'&&onUnderground;
   const hasWork=item&&['planned','building'].includes(item.status);
   root.hidden=!(isBuild||isDig||hasWork);
   build.hidden=!isBuild;dig.hidden=!isDig;inspect.hidden=!hasWork;
   if(root.hidden)overlay.closePanel(popoverId,'replaced');
   txt(title,isBuild?'สร้างห้อง':isDig?'จัดการพื้นที่ขุด':'สถานะการก่อสร้าง');
   const catalog=latest?.rooms?.catalog||[];
   if(!catalog.some(c=>c.type===roomType)){
     const first=catalog[0];if(first){roomType=first.type;width=first.width;height=first.height;}
   }
   renderPicker(catalog);
   txt(wValue,String(width));txt(hValue,String(height));
   wMinus.disabled=width<=1;hMinus.disabled=height<=1;
   wPlus.disabled=width>=getLimits().maxWidth;hPlus.disabled=height>=getLimits().maxHeight;
   const selection=currentAnchor();
   const area=width*height;
   const shapeValid=area>=getLimits().minArea && width<=getLimits().maxWidth && height<=getLimits().maxHeight;
   const preview=shapeValid?actions.roomPlan(roomType,width,height):null;
   txt(plan,preview?`พื้นที่ ${area} ช่อง · อาหาร ${preview.cost?.carbs??0} · โปรตีน ${preview.cost?.protein??0} · ใช้เวลา ${preview.ticks} ติ๊ก`:
     `พื้นที่ ${area} ช่อง · ต้องมีพื้นที่อย่างน้อย ${getLimits().minArea} ช่อง`);
   const check=isBuild && preview && selection
     ?actions.validateRoom(roomType,selection.x,selection.y,width,height):null;
   verdict.dataset.state=check?.ok?'valid':'invalid';
   txt(verdict,!selection?'ต้องเลือกช่องบนแผนที่ก่อน':
     !shapeValid?'พื้นที่น้อยเกินไป':check?.ok?`พร้อมสั่งสร้าง ณ ${selection.x},${selection.y}`:
     isBuild?errorFor(check):'');
   buildAction.disabled=!isBuild||!preview||!selection||!check?.ok;
   const rect=rectangle();
   let info=null;
   if(isDig&&rect){info=actions.inspectDig(rect.from,rect.to);}
   txt(digSummary,!rect?'ไม่มีช่องที่เลือก':`พื้นที่ ${width}×${height} · มีคิว ${info?.existing??0} · เพิ่มได้ ${info?.available??0} · ขุดไม่ได้ ${info?.blocked??0}`);
   digAdd.disabled=!isDig||!info?.available;
   digRemove.disabled=!isDig||!info?.existing;
   digClear.disabled=!rect;
   if(hasWork){
     txt(inspectLabel,`ห้อง ${catalog.find(c=>c.type===item.type)?.name||item.type} ${item.width}×${item.height}`);
     const complete=item.ticks>0?Math.max(0,Math.min(100,Math.floor(item.progress/item.ticks*100))):0;
     txt(inspectDetail,`${STATUS[item.status]||item.status} · ${complete}%`);
     roomCancel.disabled=!hasWork;
   }
 }
 const unsubscribe=subscribe(next=>{
   latest=next;
   // The live legacy canvas owns tap/drag. Do not read its private preview or add pointer listeners.
   // The selected tile is a reliable G1 anchor for explicit actions; canvas drag wiring is G3-owned.
   if(latest?.home?.tool==='dig' && currentAnchor())anchor=currentAnchor();
   if(latest?.home?.tool!=='dig')anchor=null;
   render();
 });
 render();
 return ()=>{disposed=true;unsubscribe();unregister();container.replaceChildren();};
}