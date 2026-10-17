// UI-02 Military A/B. Owned by Engineer-B; shell and map targeting remain Coordinator-owned.
export const MILITARY_PANEL_ID='ui02-military';
const ORDERS={defend:'ป้องกันรัง',rally:'รวมพล',retreat:'ถอยและพักฟื้น'};
const STATES={'combat-guard':'เฝ้ารัง','combat-rally':'เดินไปรวมพล','combat-intercept':'สกัดศัตรู','combat-attack':'ต่อสู้','combat-queen-defense':'ปกป้องนางพญา','combat-retreat':'ถอยรักษา'};
const str=x=>x==null?'—':String(x);
const pos=x=>x==='surface'?'พื้นผิว':x==='underground'?'ใต้ดิน':str(x);
const hp=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,a)+'/'+b:'—';
function node(tag,cls='',label=''){
 const n=document.createElement(tag);if(cls)n.className=cls;if(label)n.textContent=label;return n;
}
function button(label,act,extra={}){
 const n=node('button','uiv1-b-btn',label);n.type='button';n.dataset.bAction=act;
 Object.entries(extra).forEach(([k,v])=>n.dataset[k]=String(v));return n;
}
function set(n,t){t=str(t);if(n.textContent!==t)n.textContent=t;}
export function selectedSquad(view,id='A'){
 return (view?.military?.squads??[]).find(s=>s.id===id)??null;
}
export function militaryRoster(view,squad='A',filter='selected'){
 const members=new Map();
 for(const s of view?.military?.squads??[])for(const a of s.soldiers??[])members.set(String(a.id),{...a,squadId:s.id});
 return (view?.ants?.workers??[]).filter(a=>a.profession==='soldier'||members.has(String(a.id)))
 .map(a=>{const m=members.get(String(a.id));return {
  id:String(a.id),level:a.level,state:m?.state??a.state,squadId:m?.squadId??a.squadId??null,
  hp:m?.hp??a.hp??null,maxHP:m?.maxHP??a.maxHP??null,
  formationStatus:m?.formationStatus??null,arrived:m?.arrived===true,
  layer:m?.layer??a.layer,x:m?.x??a.x,y:m?.y??a.y
 };})
 .filter(a=>filter==='all'||a.squadId===squad)
 .sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
}
export function militaryError(result){
 if(result?.ok)return '';
 const messages={INVALID_RALLY:'ตำแหน่งรวมพลไม่ถูกต้อง',UNREACHABLE_RALLY:'ไม่สามารถเดินทางไปถึงจุดรวมพล',INVALID_SQUAD:'ไม่พบกองทหาร',NO_TACTICAL_CONTROLLER:'ระบบสั่งการไม่พร้อม',RALLY_START_REJECTED:'กำหนดจุดรวมพลไม่ได้',ANT_NOT_FOUND:'ไม่พบมด',INVALID_MODE:'คำสั่งไม่ถูกต้อง'};
 return messages[result?.error?.code]??result?.error?.message??'ดำเนินการไม่สำเร็จ';
}
export function mount(container,{view,actions,overlay,subscribe}){
 if(!container||!actions||!overlay||typeof subscribe!=='function')throw new TypeError('G1 dependencies required');
 const root=node('section','uiv1-b');root.hidden=true;root.setAttribute('aria-label','จัดการทหาร');
 const head=node('header','uiv1-b-head'),title=node('h2','','จัดการทหาร');
 head.append(title,button('ปิด','close'));
 const alert=node('p','uiv1-b-alert');alert.hidden=true;
 const summary=node('p','uiv1-b-summary'),formation=node('p','uiv1-b-summary');
 const tabs=node('div','uiv1-b-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','เลือกกอง');
 const tabButtons=['A','B'].map(id=>button('กอง '+id,'squad',{squad:id}));tabs.append(...tabButtons);
 const controls=node('div','uiv1-b-controls');
 const modes=[button('ป้องกันรัง','mode',{mode:'defend'}),button('กำหนดจุดรวมพล','rally'),button('ถอยพักฟื้น','mode',{mode:'retreat'}),button('ยกเลิกเลือกจุด','cancel')];
 controls.append(...modes);modes[3].hidden=true;
 const rowhead=node('div','uiv1-b-rowhead'),count=node('h3','','กำลังพล');
 const filters=node('div','uiv1-b-filters'),selectedButton=button('กองนี้','filter',{filter:'selected'}),allButton=button('ทุกกอง','filter',{filter:'all'});
 filters.append(selectedButton,allButton);rowhead.append(count,filters);
 const list=node('div','uiv1-b-list');list.setAttribute('role','list');list.setAttribute('aria-label','รายชื่อทหาร');
 const message=node('p','uiv1-b-message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 root.append(head,tabs,summary,formation,alert,controls,rowhead,list,message);container.append(root);
 let current=view,chosen='A',filter='selected',dead=false;const rows=new Map();
 function report(result,success){set(message,result?.ok?success:militaryError(result));message.dataset.error=String(!result?.ok);}
 function newRow(id){
  const item=node('article','uiv1-b-unit');item.setAttribute('role','listitem');item.dataset.id=id;
  const info=node('div','uiv1-b-info'),name=node('strong'),where=node('small'),form=node('small'),bar=node('progress');
  bar.className='uiv1-b-hp';info.append(name,where,form,bar);
  const acts=node('div','uiv1-b-actions'),focus=button('ดูตำแหน่ง','focus',{id}),transfer=button('ย้ายกอง','transfer',{id});
  acts.append(focus,transfer);item.append(info,acts);
  return {item,name,where,form,bar,focus,transfer};
 }
 function draw(snapshot){
  if(dead)return;
  current=snapshot??current;
  chosen=current?.military?.selectedSquad==='B'?'B':'A';
  const army=current?.military??{},s=selectedSquad(current,chosen);
  tabButtons.forEach((b,i)=>{const id=i?'B':'A';set(b,'กอง '+id+' · '+str(selectedSquad(current,id)?.count));b.setAttribute('aria-pressed',String(id===chosen));});
  set(summary,'กอง '+chosen+' · '+str(s?.count)+' ตัว · HP '+hp(s?.hpCurrent,s?.hpMax)+
    ' · '+str(ORDERS[s?.mode]??s?.mode)+' · จุดรวมพล '+(s?.rally?pos(s.rally.layer)+' ('+s.rally.x+','+s.rally.y+')':'ยังไม่มี')+
    ' · ข้าศึก '+str(army.enemyCount)+' · HP นางพญา '+hp(army.queenHP,army.queenHPMax));
  set(formation,'ประจำจุด '+str(s?.formation?.assigned)+' · รอ '+str(s?.formation?.standby)+' · ไปไม่ถึง '+str(s?.formation?.unreachable)+' · ถึงจุด '+str(s?.ralliedCount)+'/'+str(s?.count));
  alert.hidden=!s?.queenEmergency;set(alert,s?.queenEmergency?'ฉุกเฉิน: ทุกกองปกป้องนางพญา':'');
  modes[0].setAttribute('aria-pressed',String(s?.mode==='defend'));
  modes[1].setAttribute('aria-pressed',String(s?.mode==='rally'));
  modes[2].setAttribute('aria-pressed',String(s?.mode==='retreat'));
  modes[3].hidden=!army.targeting;
  selectedButton.setAttribute('aria-pressed',String(filter==='selected'));
  allButton.setAttribute('aria-pressed',String(filter==='all'));
  const soldiers=militaryRoster(current,chosen,filter);set(count,'กำลังพล · '+soldiers.length+' ตัว');
  const alive=new Set(soldiers.map(a=>a.id));
  for(const [id,row] of rows)if(!alive.has(id)){row.item.remove();rows.delete(id);}
  soldiers.forEach((a,i)=>{
   let r=rows.get(a.id);if(!r){r=newRow(a.id);rows.set(a.id,r);}
   set(r.name,a.id+' · Lv.'+str(a.level));
   set(r.where,(a.squadId?'กอง '+a.squadId:'ไม่สังกัดกอง')+' · '+str(STATES[a.state]??a.state)+' · '+pos(a.layer)+' ('+str(a.x)+','+str(a.y)+')');
   set(r.form,(a.formationStatus??'')+(a.arrived?' · ถึงจุดรวมพล':''));
   const has=Number.isFinite(a.hp)&&Number.isFinite(a.maxHP)&&a.maxHP>0;
   r.bar.hidden=!has;
   if(has){r.bar.max=a.maxHP;r.bar.value=Math.max(0,Math.min(a.hp,a.maxHP));r.bar.setAttribute('aria-label','HP '+a.id+' '+hp(a.hp,a.maxHP));}
   const to=a.squadId==='A'?'B':'A';r.transfer.disabled=!a.squadId;r.transfer.dataset.to=to;
   set(r.transfer,'ไปกอง '+to);
   if(list.children[i]!==r.item)list.insertBefore(r.item,list.children[i]??null);
  });
  let empty=list.querySelector('.uiv1-b-empty');
  if(!soldiers.length){if(!empty){empty=node('p','uiv1-b-empty');list.append(empty);}set(empty,filter==='selected'?'กอง '+chosen+' ยังไม่มีทหาร':'ยังไม่มีทหาร');}
  else empty?.remove();
 }
 const onClick=e=>{
  const b=e.target.closest('button[data-b-action]');if(!b||!root.contains(b))return;
  e.stopPropagation();const a=b.dataset.bAction;
  if(a==='close'){overlay.closePanel(MILITARY_PANEL_ID);return;}
  if(a==='filter'){filter=b.dataset.filter==='all'?'all':'selected';draw(current);return;}
  if(a==='squad'){const r=actions.selectSquad(b.dataset.squad);report(r,'เลือกกอง '+b.dataset.squad);return;}
  if(a==='mode'){const r=actions.setSquadMode(chosen,b.dataset.mode);report(r,'กอง '+chosen+' รับคำสั่ง '+ORDERS[b.dataset.mode]);return;}
  if(a==='rally'){const r=actions.startRally();report(r,'เลือกช่องบนแผนที่เพื่อรวมพลกอง '+chosen);if(r?.ok)overlay.closePanel(MILITARY_PANEL_ID,'targeting');return;}
  if(a==='cancel'){report(actions.cancelTargeting(),'ยกเลิกการเลือกจุดแล้ว');return;}
  if(a==='transfer'){report(actions.transferSoldier(b.dataset.id,b.dataset.to),'ย้าย '+b.dataset.id+' ไปกอง '+b.dataset.to+' แล้ว');return;}
  if(a==='focus'){const r=actions.focusAnt(b.dataset.id);report(r,'เลื่อนกล้องไปยัง '+b.dataset.id);if(r?.ok)overlay.closePanel(MILITARY_PANEL_ID,'navigate');}
 };
 root.addEventListener('click',onClick);
 const unregister=overlay.registerPanel(MILITARY_PANEL_ID,{element:root,kind:'sheet',show:()=>{root.hidden=false;},hide:()=>{root.hidden=true;}});
 const unsubscribe=subscribe(draw);draw(view);
 return ()=>{dead=true;unsubscribe();unregister();root.removeEventListener('click',onClick);rows.clear();root.remove();};
}
