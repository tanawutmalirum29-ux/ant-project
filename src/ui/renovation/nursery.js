// ANT KINGDOM / UI-04 — G1.0 feature component. No direct Game access or global HUD.
const CASTES = Object.freeze([
  ['miner','มดขุด'],['forager','มดหาอาหาร'],['builder','มดช่าง'],
  ['nurse','มดพี่เลี้ยง'],['soldier','มดทหาร']
]);
const STAGES = Object.freeze({
  QUEUED:'รอนางพญาวางไข่', LAID:'วางไข่แล้ว',
  AWAITING_PICKUP:'รอมดพี่เลี้ยงรับไข่', CARRYING:'กำลังขนไข่',
  WAITING_ROUTE:'รอเส้นทางขนส่ง', INCUBATING:'กำลังฟัก', HATCHED:'ฟักสำเร็จ'
});
const ROOM_STATES = Object.freeze({
  planned:'รอก่อสร้าง',building:'กำลังก่อสร้าง',ready:'พร้อมใช้งาน',disabled:'ขาดทางเชื่อม'
});
const ERRORS = Object.freeze({
  'invalid-choice':'อาชีพหรือเลเวลไม่ถูกต้อง', 'invalid-room':'ไม่พบห้องฟักไข่',
  'nursery-unavailable':'ห้องยังไม่พร้อมหรือเชื่อมต่อไม่ได้',
  'queen-dead':'นางพญาไม่สามารถวางไข่', 'population-cap':'ประชากรเต็มแล้ว',
  'nursery-full':'ไม่มีช่องฟักว่าง','insufficient-resources':'ทรัพยากรในคลังไม่เพียงพอ',
  'EGG_NOT_CANCELLABLE':'รายการนี้ยกเลิกไม่ได้แล้ว',
  'api-unavailable':'ระบบฟักไข่ไม่พร้อม'
});
const displayError = result => ERRORS[result?.reason ?? result?.error?.code] || result?.error?.message || 'ไม่สามารถทำรายการได้';
const labelFor = caste => CASTES.find(v => v[0]===caste)?.[1] || caste;
const setText = (node, value) => {const text=String(value); if(node.textContent!==text)node.textContent=text;};
const make = (doc,tag,className,text) => {
  const el=doc.createElement(tag); if(className)el.className=className;
  if(text!==undefined)el.textContent=text;return el;
};

export function mount(container,{view,actions,overlay,subscribe}) {
  if(!container || !actions || !overlay || typeof subscribe!=='function')
    throw new TypeError('UI-04 requires the frozen G1 feature interface');
  const doc=container.ownerDocument;
  const priorPointerEvents=container.style.pointerEvents;
  container.style.pointerEvents='none';
  const instance='ui04-nursery';
  const selected={profession:'miner',level:1,roomId:null,seedRoomId:null};
  const shell=make(doc,'div','ui04-root');
  const reopen=make(doc,'button','ui04-reopen','เปิดห้องฟักไข่');
  reopen.type='button';reopen.hidden=true;
  const sheet=make(doc,'section','ui04-sheet');sheet.hidden=true;
  sheet.setAttribute('aria-label','จัดการห้องฟักไข่');
  const head=make(doc,'header','ui04-head');
  const heading=make(doc,'h2','ui04-title','ห้องฟักไข่');heading.tabIndex=-1;
  const close=make(doc,'button','ui04-close','×');close.type='button';close.setAttribute('aria-label','ปิดห้องฟักไข่');
  head.append(heading,close);
  const scroll=make(doc,'div','ui04-scroll');
  const capacity=make(doc,'p','ui04-capacity');
  const roomPickerLabel=make(doc,'label','ui04-field-label','เลือกห้องฟักไข่');
  const roomPicker=make(doc,'div','ui04-room-picker');roomPicker.setAttribute('role','group');roomPicker.setAttribute('aria-label','เลือกห้องฟักไข่');
  const form=make(doc,'div','ui04-form');
  const professionLabel=make(doc,'span','ui04-field-label','อาชีพมด');
  const professionPicker=make(doc,'div','ui04-picker');
  const professionTrigger=make(doc,'button','ui04-picker-trigger');professionTrigger.type='button';
  professionTrigger.setAttribute('aria-haspopup','listbox');professionTrigger.setAttribute('aria-expanded','false');
  const professionMenu=make(doc,'div','ui04-picker-menu');professionMenu.hidden=true;
  professionMenu.setAttribute('role','listbox');professionMenu.setAttribute('aria-label','เลือกอาชีพมด');
  const levelLabel=make(doc,'span','ui04-field-label','เลเวล');
  const levelPicker=make(doc,'div','ui04-picker');
  const levelTrigger=make(doc,'button','ui04-picker-trigger');levelTrigger.type='button';
  levelTrigger.setAttribute('aria-haspopup','listbox');levelTrigger.setAttribute('aria-expanded','false');
  const levelMenu=make(doc,'div','ui04-picker-menu');levelMenu.hidden=true;
  levelMenu.setAttribute('role','listbox');levelMenu.setAttribute('aria-label','เลือกระดับเลเวล');
  const cost=make(doc,'p','ui04-cost');
  const blocked=make(doc,'p','ui04-blocked');blocked.setAttribute('role','status');
  const queue=make(doc,'button','ui04-primary','สั่งฟักไข่');queue.type='button';
  const feedback=make(doc,'p','ui04-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const orderHeader=make(doc,'h3','ui04-subheading','คิวฟักไข่');
  const orders=make(doc,'ol','ui04-orders');orders.setAttribute('aria-label','รายการไข่ในห้อง');
  const orderEntries=new Map();
  professionPicker.append(professionTrigger,professionMenu);
  levelPicker.append(levelTrigger,levelMenu);
  form.append(professionLabel,professionPicker,levelLabel,levelPicker,cost,blocked,queue,feedback);
  scroll.append(capacity,roomPickerLabel,roomPicker,form,orderHeader,orders);
  sheet.append(head,scroll);shell.append(reopen,sheet);container.append(shell);
  const unregisterSheet=overlay.registerPanel(instance,{element:sheet,kind:'sheet',
    show:()=>{sheet.hidden=false;reopen.hidden=true;},
    hide:()=>{sheet.hidden=true;reopen.hidden=!(selected.roomId && dismissedRoom===selected.roomId);}
  });
  const pickerDefinitions=[
    {id:'ui04-professions',menu:professionMenu,trigger:professionTrigger,
      options:CASTES,select:value=>{selected.profession=value;}},
    {id:'ui04-levels',menu:levelMenu,trigger:levelTrigger,
      options:[1,2,3,4,5].map(n=>[String(n),'Lv.'+n]),
      select:value=>{selected.level=Number(value);}}
  ];
  const unregisterPickers=pickerDefinitions.map(picker=>overlay.registerPanel(picker.id,{
    element:picker.menu,kind:'popover',
    show:()=>{picker.menu.hidden=false;picker.trigger.setAttribute('aria-expanded','true');},
    hide:()=>{picker.menu.hidden=true;picker.trigger.setAttribute('aria-expanded','false');}
  }));
  let latest=view,disposed=false,dismissedRoom=null,observedRoomId=null;
  const closePickers=()=>{for(const p of pickerDefinitions)overlay.closePanel(p.id,'replaced');};
  const activeRoom=()=>latest?.nursery?.rooms?.find(r=>r.id===selected.roomId)??null;
  const openSheet=()=>{
    if(!activeRoom())return;
    dismissedRoom=null;
    const result=overlay.openPanel(instance,{opener:doc.activeElement});
    if(result.ok)heading.focus({preventScroll:true});
  };
  function renderPickers(){
    for(const p of pickerDefinitions){
      const key=p.id==='ui04-professions'?selected.profession:String(selected.level);
      const entry=p.options.find(v=>v[0]===key);
      setText(p.trigger,(entry?.[1] || 'เลือก')+' ▾');
      p.trigger.setAttribute('aria-label',p.menu.getAttribute('aria-label')+': '+(entry?.[1]||''));
      for(const button of p.menu.children){
        const on=button.dataset.value===key;
        button.setAttribute('aria-selected',String(on));
        button.classList.toggle('is-selected',on);
      }
    }
  }
  for(const picker of pickerDefinitions){
    for(const [value,label] of picker.options){
      const button=make(doc,'button','ui04-option',label);
      button.type='button';button.dataset.value=value;button.setAttribute('role','option');
      button.addEventListener('click',()=>{
        picker.select(value);overlay.closePanel(picker.id);renderPickers();render();
      });
      picker.menu.append(button);
    }
    picker.trigger.addEventListener('click',()=>{
      if(overlay.isOpen(picker.id))overlay.closePanel(picker.id);
      else {closePickers();overlay.openPanel(picker.id,{opener:picker.trigger});}
    });
    picker.menu.addEventListener('keydown',event=>{
      const list=[...picker.menu.querySelectorAll('button:not(:disabled)')];
      const position=list.indexOf(doc.activeElement);
      let index;
      if(event.key==='ArrowDown')index=(position+1)%list.length;
      if(event.key==='ArrowUp')index=(position+list.length-1)%list.length;
      if(event.key==='Home')index=0;
      if(event.key==='End')index=list.length-1;
      if(index!==undefined){event.preventDefault();list[index]?.focus();}
    });
    picker.trigger.addEventListener('keydown',event=>{
      if(['ArrowDown','ArrowUp'].includes(event.key)){
        event.preventDefault();closePickers();overlay.openPanel(picker.id,{opener:picker.trigger});
        picker.menu.querySelector('button[aria-selected="true"]')?.focus();
      }
    });
  }
  close.addEventListener('click',()=>{
    dismissedRoom=selected.roomId;closePickers();overlay.closePanel(instance);
  });
  reopen.addEventListener('click',openSheet);
  queue.addEventListener('click',()=>{
    if(!selected.roomId)return;
    const id=selected.roomId;
    const response=actions.queueEgg(id,selected.profession,selected.level);
    setText(feedback,response?.ok?'สั่งฟักไข่แล้ว':displayError(response));
    if(response?.ok)feedback.dataset.state='success'; else feedback.dataset.state='error';
    render();
  });
  orders.addEventListener('click',event=>{
    const button=event.target.closest('button[data-egg-id]');
    if(!button || !orders.contains(button))return;
    const response=actions.cancelEgg(button.dataset.eggId);
    setText(feedback,response?.ok?'ยกเลิกคิวและคืนทรัพยากรแล้ว':displayError(response));
    feedback.dataset.state=response?.ok?'success':'error';
    render();
  });
  function createOrderEntry(id){
    const row=make(doc,'li','ui04-order');row.dataset.eggId=id;
    const main=make(doc,'div','ui04-order-details');
    const label=make(doc,'strong','ui04-order-name');
    const stage=make(doc,'span','ui04-order-stage');
    const bar=make(doc,'progress','ui04-progress');bar.max=100;bar.hidden=true;
    bar.setAttribute('aria-label','ความคืบหน้าการฟักไข่');
    main.append(label,stage,bar);
    const cancel=make(doc,'button','ui04-cancel','ยกเลิก');cancel.type='button';
    cancel.dataset.eggId=id;
    row.append(main,cancel);
    return {row,label,stage,bar,cancel};
  }
  function renderOrders(room){
    const current=new Set();
    for(const order of room?.orders??[]){
      current.add(order.id);
      let record=orderEntries.get(order.id);
      if(!record){record=createOrderEntry(order.id);orderEntries.set(order.id,record);orders.append(record.row);}
      setText(record.label,`${labelFor(order.profession)} · Lv.${order.level}`);
      const incubating=order.status==='INCUBATING';
      const total=Number(order.hatchTicks),remaining=Number(order.remainingTicks);
      const progress=incubating&&total>0&&Number.isFinite(remaining)
        ?Math.max(0,Math.min(100,Math.round((total-remaining)/total*100))):0;
      const status=STAGES[order.status]||order.status;
      setText(record.stage,incubating?`${status} · ${progress}% · เหลือ ${Math.max(0,remaining)} ติ๊ก`:status);
      record.bar.hidden=!incubating;record.bar.value=progress;
      record.cancel.hidden=!order.canCancel;
      record.cancel.disabled=!order.canCancel;
      record.cancel.setAttribute('aria-label',`ยกเลิกคิว ${labelFor(order.profession)} เลเวล ${order.level}`);
    }
    for(const [id,record] of orderEntries){
      if(!current.has(id)){
        if(record.row.contains(doc.activeElement))heading.focus({preventScroll:true});
        record.row.remove();orderEntries.delete(id);
      }
    }
    const empty=orders.querySelector('[data-empty]');
    if(current.size){empty?.remove();}
    else if(!empty){const li=make(doc,'li','ui04-empty','ยังไม่มีคำสั่งฟักไข่');li.dataset.empty='true';orders.append(li);}
  }
  function render(){
    if(disposed)return;
    const rooms=latest?.nursery?.rooms||[];
    let newId=latest?.nursery?.selectedRoomId;
    if(newId && !rooms.some(r=>r.id===newId))newId=null;
    if(newId && newId!==observedRoomId){
      selected.roomId=newId;dismissedRoom=null;
    }
    observedRoomId=newId;
    if(!rooms.some(r=>r.id===selected.roomId)){
      selected.roomId=newId || rooms[0]?.id || null;
      if(!rooms.length){dismissedRoom=null;closePickers();overlay.closePanel(instance,'unmount');}
    }
    const room=activeRoom();
    reopen.hidden=!room || overlay.isOpen(instance) || dismissedRoom!==selected.roomId;
    if(newId && dismissedRoom!==newId && !overlay.isOpen(instance))openSheet();
    if(room){
      setText(heading,`ห้องฟักไข่ ${room.width}×${room.height}`);
      const roomState=ROOM_STATES[room.status]||room.status;
      setText(capacity,`ช่องฟัก ${room.used}/${room.slots} · ว่าง ${room.free} · ${room.connected?roomState:'ขาดทางเชื่อม'}`);
    } else {setText(heading,'ห้องฟักไข่');setText(capacity,'ยังไม่มีห้องฟักไข่');}
    const roomIds=rooms.map(r=>r.id).join('|');
    if(roomPicker.dataset.ids!==roomIds){
      roomPicker.replaceChildren();roomPicker.dataset.ids=roomIds;
      for(let i=0;i<rooms.length;i++){
        const item=rooms[i];const btn=make(doc,'button','ui04-room-choice');
        btn.type='button';btn.dataset.roomId=item.id;
        btn.addEventListener('click',()=>{
          if(selected.roomId!==item.id){selected.roomId=item.id;dismissedRoom=null;closePickers();setText(feedback,'');render();}
          openSheet();
        });roomPicker.append(btn);
      }
    }
    roomPickerLabel.hidden=rooms.length<2;roomPicker.hidden=rooms.length<2;
    for(let i=0;i<roomPicker.children.length;i++){
      const btn=roomPicker.children[i],item=rooms[i];
      const active=item?.id===selected.roomId;
      setText(btn,`ห้อง ${i+1} · ${item?.width}×${item?.height}`);
      btn.classList.toggle('is-selected',active);btn.setAttribute('aria-pressed',String(active));
    }
    renderPickers();
    const price=actions.nurseryCost(selected.profession,selected.level);
    const ticks=[440,560,720,900,1140][selected.level-1];
    setText(cost,price?`ต้นทุน อาหาร ${price.carbs} · โปรตีน ${price.protein} · ฟัก ${ticks} ติ๊ก (ไม่รวมเวลารอ/ขนส่ง)`:'ไม่สามารถอ่านต้นทุนไข่');
    let reason='';
    if(!room)reason='เลือกห้องฟักไข่ก่อน';
    else if(room.status!=='ready'||!room.connected)reason='ห้องฟักไข่ยังไม่พร้อมหรือขาดทางเชื่อม';
    else if(latest?.ants?.queen?.alive===false)reason='นางพญาไม่สามารถวางไข่';
    else if(latest.nursery.totalPopulation>=latest.nursery.maxPopulation)reason='ประชากรเต็มแล้ว';
    else if(room.free<=0)reason='ช่องฟักไข่เต็ม';
    else if(!price)reason='ไม่สามารถอ่านต้นทุนไข่';
    // G1 snapshot lacks spendable per-depot stock. The engine checks that at queue time.
    queue.disabled=!!reason;
    setText(blocked,reason||'การจองทรัพยากรตรวจสอบโดย Engine เมื่อสั่งฟัก');
    setText(queue,room?`สั่งฟัก ${labelFor(selected.profession)} Lv.${selected.level}`:'สั่งฟักไข่');
    renderOrders(room);
  }
  // The shell owns global outside-tap and Escape. No document/canvas pointer listeners here.
  const unsubscribe=subscribe(snapshot=>{latest=snapshot;render();});
  render();
  return ()=>{
    disposed=true;unsubscribe();closePickers();
    for(const release of unregisterPickers)release();
    unregisterSheet();container.style.pointerEvents=priorPointerEvents;container.replaceChildren();
  };
}