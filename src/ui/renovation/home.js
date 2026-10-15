// UI-01 / G2 — map-first HUD. No engine imports, global listeners or shell activation.
// Coordinator mounts this module separately in HUD_TOP, PRIMARY_COMMAND and PRIMARY_SHEET.
const LABELS = Object.freeze({inspect:'สำรวจ',dig:'ขุด',room:'สร้าง',surface:'พื้นผิว',underground:'ใต้ดิน'});
const ICONS = Object.freeze({inspect:'⌕',dig:'⚒',room:'▣',surface:'♧',underground:'▤',menu:'≡'});
const pretty = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('th-TH') : '—';
const el = (doc,tag,cls,text) => {
  const node=doc.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
const updateText = (node,value) => {
  const next=String(value);
  if(node.textContent!==next)node.textContent=next;
};
const errorText = result => {
  if(result?.ok)return '';
  const code=result?.error?.code;
  return ({UNDERGROUND_ONLY:'คำสั่งนี้ใช้ได้เฉพาะใต้ดิน',
    UNKNOWN_PANEL:'หน้าจอนี้ยังไม่เปิดใช้งาน',INVALID_TOOL:'เครื่องมือไม่ถูกต้อง',
    INVALID_SPEED:'ความเร็วไม่ถูกต้อง'})[code] || result?.error?.message || 'ไม่สามารถทำรายการได้';
};
function button(doc,icon,title){
  const b=el(doc,'button','ui-home-action');
  b.type='button';
  const symbol=el(doc,'span','ui-home-action-icon',icon);
  symbol.setAttribute('aria-hidden','true');
  const label=el(doc,'span','ui-home-action-label',title);
  b.append(symbol,label);
  b.title=title;
  return {b,symbol,label};
}
function mountHud(container,{view,actions,subscribe}){
  const doc=container.ownerDocument;
  container.classList.add('ui-home','ui-home--hud');
  const wrap=el(doc,'div','ui-home-hud');
  const stats=el(doc,'div','ui-home-stats');
  const resourceNodes={};
  for(const [name,title,icon] of [['carbs','อาหาร','◉'],['protein','โปรตีน','◆'],['water','น้ำ','◈']]){
    const chip=el(doc,'div','ui-home-stat');
    chip.title=title;chip.setAttribute('aria-label',title);
    const symbol=el(doc,'span','ui-home-resource-icon',icon);
    symbol.setAttribute('aria-hidden','true');
    const value=el(doc,'strong','ui-home-resource-value','0');
    chip.append(symbol,value);
    stats.append(chip);
    resourceNodes[name]=value;
  }
  const population=el(doc,'div','ui-home-population');
  population.title='จำนวนมด';population.setAttribute('aria-label','จำนวนมด');
  const populationValue=el(doc,'strong','','0');
  population.append(el(doc,'span','','♙'),populationValue);
  stats.append(population);
  const speed=el(doc,'button','ui-home-speed','×1');
  speed.type='button';speed.title='หยุดหรือเดินเวลาเกม';
  stats.append(speed);
  const metadata=el(doc,'div','ui-home-metadata');
  const tick=el(doc,'span','ui-home-tick','เวลาเกม 0 ติ๊ก');
  const seed=el(doc,'span','ui-home-seed','Seed —');
  metadata.append(tick,seed);wrap.append(stats,metadata);container.append(wrap);
  let currentSpeed=1,lastRunningSpeed=1;
  const refresh=snapshot=>{
    const home=snapshot?.home;if(!home)return;
    for(const name of Object.keys(resourceNodes))updateText(resourceNodes[name],pretty(home.resources?.[name]));
    updateText(populationValue,pretty(home.population)+'/'+pretty(home.maxPopulation));
    currentSpeed=home.speed;
    if(home.speed>0)lastRunningSpeed=home.speed;
    updateText(speed,home.speed===0?'Ⅱ':'×'+home.speed);
    speed.setAttribute('aria-label',home.speed===0?'เกมหยุดอยู่ กดเพื่อเดินเวลา x1':'ความเร็ว x'+home.speed+' กดเพื่อหยุดเกม');
    speed.setAttribute('aria-pressed',String(home.speed===0));
    updateText(tick,'เวลาเกม '+pretty(home.timeTicks)+' ติ๊ก');
    updateText(seed,'Seed: '+(home.seed||'—'));
    seed.title=home.seed||'';
  };
  speed.addEventListener('click',()=>actions.setSpeed(currentSpeed===0?lastRunningSpeed:0));
  refresh(view);
  const off=subscribe(refresh);
  return ()=>{off();container.replaceChildren();};
}
function mountCommands(container,{view,actions,overlay,subscribe}){
  const doc=container.ownerDocument;
  container.classList.add('ui-home','ui-home--commands');
  const nav=el(doc,'nav','ui-home-toolbar');
  nav.setAttribute('aria-label','เครื่องมือแผนที่');
  const controls={};
  for(const mode of ['inspect','dig','room']){
    const {b}=button(doc,ICONS[mode],LABELS[mode]);
    b.dataset.homeAction=mode;
    b.addEventListener('click',()=>{
      const result=actions.setTool(mode);
      if(!result?.ok)updateText(feedback,errorText(result));
    });
    controls[mode]=b;nav.append(b);
  }
  const layer=button(doc,ICONS.underground,LABELS.underground);
  layer.b.dataset.homeAction='layer';
  layer.b.addEventListener('click',()=>{
    const result=actions.toggleLayer();
    if(!result?.ok)updateText(feedback,errorText(result));
  });
  nav.append(layer.b);
  const menu=button(doc,ICONS.menu,'เมนู');
  menu.b.dataset.homeAction='menu';
  menu.b.setAttribute('aria-haspopup','true');
  menu.b.setAttribute('aria-expanded','false');
  menu.b.addEventListener('click',()=>{
    const result=overlay.isOpen('home-menu')
      ? {ok:overlay.closePanel('home-menu')}
      : overlay.openPanel('home-menu',{opener:menu.b});
    if(!result?.ok)updateText(feedback,errorText(result));
  });
  nav.append(menu.b);
  const feedback=el(doc,'output','ui-home-sr-only');
  feedback.setAttribute('aria-live','polite');
  container.append(nav,feedback);
  const refresh=snapshot=>{
    const home=snapshot?.home;if(!home)return;
    for(const mode of ['inspect','dig','room']){
      const active=home.tool===mode;
      controls[mode].classList.toggle('is-active',active);
      controls[mode].setAttribute('aria-pressed',String(active));
      controls[mode].disabled=mode!=='inspect'&&home.layer==='surface';
      controls[mode].title=controls[mode].disabled?'ใช้เครื่องมือนี้ได้เฉพาะใต้ดิน':LABELS[mode];
    }
    const surface=home.layer==='surface';
    const current=surface?'พื้นผิว':'ใต้ดิน',destination=surface?'ใต้ดิน':'พื้นผิว';
    updateText(layer.symbol,ICONS[home.layer]||ICONS.underground);
    updateText(layer.label,current);
    layer.b.classList.toggle('is-layer-surface',surface);
    layer.b.setAttribute('aria-pressed',String(surface));
    layer.b.setAttribute('aria-label','ชั้นปัจจุบัน '+current+' กดเพื่อเปลี่ยนไป'+destination);
    layer.b.title='เปลี่ยนจาก'+current+'ไป'+destination;
    menu.b.setAttribute('aria-expanded',String(overlay.isOpen('home-menu')));
  };
  const offOverlay=overlay.subscribe(state=>{
    menu.b.setAttribute('aria-expanded',String(state.open.includes('home-menu')));
  });
  refresh(view);
  const off=subscribe(refresh);
  return ()=>{off();offOverlay();container.replaceChildren();};
}
function mountMenu(container,{view,actions,overlay,subscribe}){
  const doc=container.ownerDocument;
  container.classList.add('ui-home','ui-home--menu-host');
  const panel=el(doc,'section','ui-home-menu');
  panel.hidden=true;panel.setAttribute('aria-label','เมนูอาณาจักร');
  const heading=el(doc,'div','ui-home-menu-heading');
  const title=el(doc,'h2','','เมนูอาณาจักร');
  const close=el(doc,'button','ui-home-menu-close','ปิด');
  close.type='button';close.setAttribute('aria-label','ปิดเมนู');
  close.addEventListener('click',()=>overlay.closePanel('home-menu'));
  heading.append(title,close);
  const detail=el(doc,'p','ui-home-menu-status','');
  const actionsArea=el(doc,'div','ui-home-menu-actions');
  const feedback=el(doc,'output','ui-home-menu-feedback','');
  feedback.setAttribute('role','status');
  const addAction=(title,run)=>{
    const b=el(doc,'button','ui-home-menu-button',title);
    b.type='button';
    b.addEventListener('click',()=>{
      const result=run();
      updateText(feedback,errorText(result));
    });
    actionsArea.append(b);
  };
  addAction('มดในอาณาจักร',()=>overlay.openPanel('ants'));
  addAction('กองทหาร A/B',()=>overlay.openPanel('military'));
  addAction('ตั้งค่าและ Seed',()=>overlay.openPanel('settings'));
  addAction('ความเร็ว ×1',()=>actions.setSpeed(1));
  addAction('ความเร็ว ×2',()=>actions.setSpeed(2));
  addAction('ความเร็ว ×4',()=>actions.setSpeed(4));
  addAction('ซูมเข้า',()=>actions.zoom(1.25));
  addAction('ซูมออก',()=>actions.zoom(0.8));
  addAction('กลับไปปากรัง',()=>actions.recenter());
  panel.append(heading,detail,actionsArea,feedback);
  container.append(panel);
  const unregister=overlay.registerPanel('home-menu',{
    element:panel,kind:'sheet',
    show(){panel.hidden=false;updateText(feedback,'');},
    hide(){panel.hidden=true;}
  });
  const refresh=snapshot=>{
    if(!snapshot?.home)return;
    const home=snapshot.home;
    updateText(detail,'มด '+pretty(home.population)+'/'+pretty(home.maxPopulation)+' · เวลา '+pretty(home.timeTicks)+' ติ๊ก · ความเร็ว '+(home.speed===0?'หยุด':'×'+home.speed));
  };
  refresh(view);
  const off=subscribe(refresh);
  return ()=>{off();unregister();container.replaceChildren();};
}
export function mount(container,params){
  if(!container||!params?.actions||!params?.overlay||typeof params.subscribe!=='function')
    throw new TypeError('G1 home mount requires container, actions, overlay and subscribe');
  const region=container.parentElement?.dataset?.uiRegion;
  if(region==='HUD_TOP')return mountHud(container,params);
  if(region==='PRIMARY_COMMAND')return mountCommands(container,params);
  if(region==='PRIMARY_SHEET')return mountMenu(container,params);
  throw new Error('UI-01 must be mounted into HUD_TOP, PRIMARY_COMMAND or PRIMARY_SHEET');
}
