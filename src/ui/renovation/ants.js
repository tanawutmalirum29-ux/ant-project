// UI-03 Ant roster / inspector. Engineer-B exclusive module, read-only G1 snapshots.
export const ANTS_PANEL_ID='ui03-ants';
export const ANT_PROFESSIONS=Object.freeze({
 starter:'มดเริ่มต้น',miner:'มดขุด',forager:'มดหาอาหาร',
 builder:'มดช่าง',nurse:'มดพี่เลี้ยง',soldier:'มดทหาร',queen:'นางพญา'
});
const STATES=Object.freeze({
 idle:'ว่าง',walking:'กำลังเดิน',nursing:'เลี้ยงตัวอ่อน',digging:'กำลังขุด',
 'room-rest':'พักในห้อง','room-guard':'ลาดตระเวน',
 'combat-guard':'เฝ้ารัง','combat-rally':'เดินไปรวมพล',
 'combat-intercept':'สกัดศัตรู','combat-attack':'ต่อสู้',
 'combat-queen-defense':'ปกป้องนางพญา','combat-retreat':'ถอยรักษา',
 'forage-outbound':'ออกหาอาหาร','forage-return':'ขนอาหารกลับรัง'
});
const CARGO={carbs:'อาหาร',protein:'โปรตีน',water:'น้ำ'};
const str=value=>value==null?'—':String(value);
const position=layer=>layer==='surface'?'พื้นผิว':layer==='underground'?'ใต้ดิน':str(layer);
const safeNumber=value=>Number.isFinite(value)?String(value):'—';
const antName=ant=>ant?.caste==='queen'?'นางพญา':ant?.id?.replace(/^worker-/,'มด #')??'ไม่พบมด';
const profession=ant=>ANT_PROFESSIONS[ant?.profession]??str(ant?.profession);
const state=ant=>ant?.alive===false?'สิ้นชีวิต':STATES[ant?.state]??str(ant?.state);
const tileMatch=(ant,tile)=>!!tile&&ant.layer===tile.layer&&ant.x===tile.x&&ant.y===tile.y;
function make(tag,className='',label=''){
 const n=document.createElement(tag);if(className)n.className=className;
 if(label)n.textContent=label;return n;
}
function button(label,action,extras={}){
 const n=make('button','uiv1-a-btn',label);n.type='button';n.dataset.aAction=action;
 for(const [k,v] of Object.entries(extras))n.dataset[k]=String(v);
 return n;
}
function text(n,value){const next=str(value);if(n.textContent!==next)n.textContent=next;}
export function filterAnts(view,{role='all',query='',tileOnly=false,sort='id'}={}){
 const tile=view?.home?.selected??null;
 const q=String(query).trim().toLocaleLowerCase();
 return (view?.ants?.workers??[])
  .filter(a=>role==='all'||a.profession===role)
  .filter(a=>!tileOnly||tileMatch(a,tile))
  .filter(a=>!q||[a.id,a.profession,ANT_PROFESSIONS[a.profession],a.state,a.squadId,a.level]
    .some(value=>String(value??'').toLocaleLowerCase().includes(q)))
  .sort((a,b)=>sort==='level'
    ?(Number(b.level)||0)-(Number(a.level)||0)||String(a.id).localeCompare(String(b.id),'en',{numeric:true})
    :String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
}
export function antDetails(ant){
 if(!ant)return [];
 const data=[
  ['รหัส',str(ant.id)],['อาชีพ',profession(ant)],
  ['เลเวล',str(ant.level)],['สถานะ',state(ant)],
  ['ตำแหน่ง',position(ant.layer)+' ('+safeNumber(ant.x)+', '+safeNumber(ant.y)+')']
 ];
 if(ant.squadId)data.push(['สังกัด','กอง '+ant.squadId]);
 if(Number.isFinite(ant.hp)&&Number.isFinite(ant.maxHP))
  data.push(['พลังชีวิต',Math.max(0,ant.hp)+'/'+ant.maxHP]);
 if(ant.cargo?.amount)data.push(['สิ่งที่ขน',(CARGO[ant.cargo.type]??str(ant.cargo.type))+' '+safeNumber(ant.cargo.amount)]);
 if(ant.broodCargo)data.push(['ตัวอ่อน','กำลังขนตัวอ่อน']);
 return data;
}
export function mount(container,{view,actions,overlay,subscribe}){
 if(!container||!actions||!overlay||typeof subscribe!=='function')throw new TypeError('G1 dependencies required');
 const root=make('section','uiv1-a');root.hidden=true;root.setAttribute('aria-label','ทะเบียนมด');
 const header=make('header','uiv1-a-head'),title=make('h2','','ทะเบียนมด'),
  close=button('ปิด','close');
 header.append(title,close);
 const status=make('p','uiv1-a-status'),queen=make('section','uiv1-a-queen');
 queen.setAttribute('aria-label','ข้อมูลนางพญา');
 const queenInfo=make('span','uiv1-a-queen-text'),queenButton=button('ดูนางพญา','inspect',{id:'queen'});
 const queenFocus=button('ไปยังนางพญา','focus',{id:'queen'});
 queen.append(queenInfo,queenButton,queenFocus);
 const searchLabel=make('label','uiv1-a-search');
 const searchText=make('span','','ค้นหามด'),search=make('input','uiv1-a-input');
 search.type='search';search.placeholder='รหัส อาชีพ สถานะ...';search.setAttribute('aria-label','ค้นหามด');
 searchLabel.append(searchText,search);
 const choices=make('div','uiv1-a-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','กรองอาชีพ');
 const roles=[['all','ทั้งหมด'],...Object.entries(ANT_PROFESSIONS).filter(([id])=>id!=='queen')];
 const roleButtons=roles.map(([id,label])=>button(label,'role',{role:id}));choices.append(...roleButtons);
 const opts=make('div','uiv1-a-options');opts.setAttribute('role','group');opts.setAttribute('aria-label','การเรียงและตำแหน่ง');
 const tile=button('มดในช่องที่เลือก','tile'),sortId=button('เรียงรหัส','sort',{sort:'id'}),sortLevel=button('เรียงเลเวล','sort',{sort:'level'});
 opts.append(tile,sortId,sortLevel);
 const count=make('p','uiv1-a-count'),list=make('div','uiv1-a-list');
 list.setAttribute('role','list');list.setAttribute('aria-label','รายชื่อมดทั้งหมด');list.tabIndex=0;
 const detail=make('section','uiv1-a-detail'),detailHead=make('div','uiv1-a-detail-head'),
  detailTitle=make('h3','','เลือกมดเพื่อดูข้อมูล'),detailFocus=button('ไปยังมด','focus',{id:''});
 detailHead.append(detailTitle,detailFocus);
 const detailList=make('dl','uiv1-a-details');detail.append(detailHead,detailList);
 detail.hidden=true;
 const note=make('p','uiv1-a-note');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 root.append(header,status,queen,searchLabel,choices,opts,count,list,detail,note);
 container.append(root);
 let snapshot=view,role='all',query='',tileOnly=false,sort='id',selected=null,dead=false;
 const rows=new Map();
 function newRow(id){
  const row=make('article','uiv1-a-unit');row.dataset.id=id;row.setAttribute('role','listitem');
  const info=make('div','uiv1-a-unit-info'),name=make('strong'),desc=make('small');
  info.append(name,desc);
  const actions=make('div','uiv1-a-unit-actions'),inspect=button('ดูข้อมูล','inspect',{id}),focus=button('ไปยังมด','focus',{id});
  actions.append(inspect,focus);row.append(info,actions);
  return {row,name,desc,inspect,focus};
 }
 function details(ant){
  if(!ant){detail.hidden=true;detailFocus.dataset.id='';return;}
  detail.hidden=false;
  text(detailTitle,antName(ant));detailFocus.dataset.id=String(ant.id);
  const data=antDetails(ant);
  // Update pairs in place to retain stable DOM and accessibility across frequent HUD ticks.
  for(let i=0;i<data.length;i++){
   let dt=detailList.children[2*i],dd=detailList.children[2*i+1];
   if(!dt){dt=make('dt');dd=make('dd');detailList.append(dt,dd);}
   text(dt,data[i][0]);text(dd,data[i][1]);
  }
  while(detailList.children.length>data.length*2)detailList.lastElementChild.remove();
 }
 function draw(next){
  if(dead)return;
  snapshot=next??snapshot;
  const ants=snapshot?.ants??{},all=ants.workers??[];
  text(status,'ประชากร '+str(ants.population)+'/'+str(ants.capacity)+' · มดงาน '+all.length+' ตัว');
  const q=ants.queen??null;
  queen.hidden=!q;
  if(q){queenButton.dataset.id=q.id;queenFocus.dataset.id=q.id;
   text(queenInfo,antName(q)+' · '+state(q)+' · '+position(q.layer)+' ('+safeNumber(q.x)+','+safeNumber(q.y)+')');}
  const external=snapshot?.home?.selectedAntId??null;
  if(!selected&&external)selected=String(external);
  const chosen=[...(q?[q]:[]),...all].find(a=>a.id===selected)??null;
  if(selected&&!chosen)selected=null;
  roleButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(roles[i][0]===role)));
  tile.setAttribute('aria-pressed',String(tileOnly));
  sortId.setAttribute('aria-pressed',String(sort==='id'));
  sortLevel.setAttribute('aria-pressed',String(sort==='level'));
  const members=filterAnts(snapshot,{role,query,tileOnly,sort});
  text(count,'พบ '+members.length+' ตัว'+(tileOnly?(snapshot?.home?.selected?' · ช่อง '+position(snapshot.home.selected.layer)+' ('+snapshot.home.selected.x+','+snapshot.home.selected.y+')':' · ยังไม่ได้เลือกช่องบนแผนที่'):''));
  const ids=new Set(members.map(a=>String(a.id)));
  for(const [id,r] of rows)if(!ids.has(id)){r.row.remove();rows.delete(id);}
  members.forEach((a,i)=>{
   const id=String(a.id);let r=rows.get(id);if(!r){r=newRow(id);rows.set(id,r);}
   text(r.name,antName(a)+' · '+profession(a)+' · Lv.'+str(a.level));
   text(r.desc,state(a)+' · '+position(a.layer)+' ('+safeNumber(a.x)+','+safeNumber(a.y)+')'+(a.squadId?' · กอง '+a.squadId:''));
   r.inspect.setAttribute('aria-pressed',String(id===selected));
   if(list.children[i]!==r.row)list.insertBefore(r.row,list.children[i]??null);
  });
  let empty=list.querySelector('.uiv1-a-empty');
  if(!members.length){if(!empty){empty=make('p','uiv1-a-empty');list.append(empty);}
   text(empty,tileOnly&&!snapshot?.home?.selected?'เลือกช่องบนแผนที่ก่อน':'ไม่มีมดตรงตามตัวกรอง');}
  else empty?.remove();
  details(chosen);
 }
 const inform=(res,ok)=>{
  text(note,res?.ok?ok:res?.error?.message??res?.error?.code??'ไม่สามารถไปยังมดได้');
  note.dataset.error=String(!res?.ok);
 };
 const onClick=e=>{
  const b=e.target.closest('button[data-a-action]');if(!b||!root.contains(b))return;
  e.stopPropagation();
  const action=b.dataset.aAction;
  if(action==='close'){overlay.closePanel(ANTS_PANEL_ID);return;}
  if(action==='role'){role=b.dataset.role;draw(snapshot);return;}
  if(action==='tile'){tileOnly=!tileOnly;draw(snapshot);return;}
  if(action==='sort'){sort=b.dataset.sort==='level'?'level':'id';draw(snapshot);return;}
  if(action==='inspect'){selected=b.dataset.id;draw(snapshot);return;}
  if(action==='focus'){
   const id=b.dataset.id;if(!id)return;
   const result=actions.focusAnt(id);inform(result,'เลื่อนกล้องไปยัง '+id+' แล้ว');
   if(result?.ok)overlay.closePanel(ANTS_PANEL_ID,'navigate');
  }
 };
 const onSearch=()=>{query=search.value;draw(snapshot);};
 root.addEventListener('click',onClick);search.addEventListener('input',onSearch);
 const unregister=overlay.registerPanel(ANTS_PANEL_ID,{
  element:root,kind:'sheet',show:()=>{root.hidden=false;},hide:()=>{root.hidden=true;}
 });
 const unsubscribe=subscribe(draw);draw(view);
 return ()=>{dead=true;unsubscribe();unregister();root.removeEventListener('click',onClick);search.removeEventListener('input',onSearch);rows.clear();root.remove();};
}
