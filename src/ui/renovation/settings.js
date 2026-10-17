// UI-06 / G2. The coordinator alone mounts this feature and migrates the legacy Seed dialog.
// The tokenized G1 action facade is the only way this feature can reset a game world.
const create=(doc,tag,cls,text)=>{
  const node=doc.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
function feedback(result){
  const code=result?.error?.code;
  return ({INVALID_SEED:'กรุณากรอก Seed 1–40 อักขระ (ไม่ใช่ช่องว่างล้วน)',
    RESET_NOT_CONFIRMED:'คำยืนยันหมดอายุ โปรดเริ่มใหม่',
    UNKNOWN_PANEL:'ไม่พบหน้าจอที่ร้องขอ'})[code]
    || result?.error?.message || 'ไม่สามารถสร้างโลกใหม่ได้';
}
export function mount(container,{view,actions,overlay,subscribe}={}){
  if(!container||!actions||!overlay||typeof subscribe!=='function')
    throw new TypeError('UI-06 requires G1 mount dependencies');
  if(container.parentElement?.dataset?.uiRegion!=='PRIMARY_SHEET')
    throw new Error('UI-06 settings must mount in PRIMARY_SHEET');
  const doc=container.ownerDocument;
  container.classList.add('ui-settings','ui-settings--host');
  let currentSeed=String(view?.settings?.seed??''),dirty=false,composing=false;
  let pendingToken=null,pendingSeed='',submitting=false;
  const sheet=create(doc,'section','ui-settings-sheet');
  sheet.hidden=true;sheet.setAttribute('role','region');sheet.setAttribute('aria-labelledby','ui-settings-title');
  const header=create(doc,'div','ui-settings-header');
  const title=create(doc,'h2','','ตั้งค่าอาณาจักร');
  title.id='ui-settings-title';
  const close=create(doc,'button','ui-settings-close','ปิด');
  close.type='button';close.setAttribute('aria-label','ปิดหน้าตั้งค่า');
  header.append(title,close);
  const worldTitle=create(doc,'h3','','โลกปัจจุบัน');
  const current=create(doc,'output','ui-settings-current',currentSeed);
  current.setAttribute('aria-label','Seed โลกปัจจุบัน');
  const note=create(doc,'p','ui-settings-note','การสร้างโลกใหม่จะเริ่มอาณาจักรและความคืบหน้าใหม่ ไม่ใช่ระบบบันทึกหรือโหลดเกม');
  const form=create(doc,'form','ui-settings-form');
  form.noValidate=true;
  const label=create(doc,'label','','Seed สำหรับโลกใหม่');
  const input=create(doc,'input','ui-settings-input');
  input.type='text';input.maxLength=40;
  input.autocomplete='off';input.spellcheck=false;
  input.id='ui-settings-seed-input';label.htmlFor=input.id;
  input.value=currentSeed;
  input.setAttribute('aria-describedby','ui-settings-seed-help');
  const hint=create(doc,'p','ui-settings-hint','รองรับอักษรไทย/อังกฤษ สูงสุด 40 อักขระ');
  hint.id='ui-settings-seed-help';
  const error=create(doc,'output','ui-settings-error','');
  error.setAttribute('role','status');error.setAttribute('aria-live','polite');
  const start=create(doc,'button','ui-settings-primary','สร้างโลกใหม่…');
  start.type='submit';
  const back=create(doc,'button','ui-settings-secondary','กลับไปยังเกม');
  back.type='button';
  const formActions=create(doc,'div','ui-settings-actions');
  formActions.append(back,start);
  form.append(label,input,hint,error,formActions);
  const developer=create(doc,'p','ui-settings-developer','Debug และตัวเลือกสำหรับนักพัฒนาแยกจากการตั้งค่าโลก ไม่มีตัวเลือกบันทึกเกมหรือสวิตช์ที่ไม่ทำงาน');
  sheet.append(header,worldTitle,current,note,form,developer);
  const dialog=create(doc,'dialog','ui-settings-confirm');
  dialog.hidden=true;dialog.setAttribute('aria-labelledby','ui-settings-confirm-title');
  const confirmTitle=create(doc,'h2','','ยืนยันสร้างโลกใหม่');
  confirmTitle.id='ui-settings-confirm-title';
  const confirmInfo=create(doc,'p','ui-settings-confirm-info','');
  const warn=create(doc,'p','ui-settings-danger','โลกปัจจุบันและความคืบหน้าจะถูกเริ่มใหม่ การกระทำนี้ย้อนกลับไม่ได้');
  const confirmError=create(doc,'output','ui-settings-error','');
  confirmError.setAttribute('role','status');
  const confirmActions=create(doc,'div','ui-settings-actions');
  const cancel=create(doc,'button','ui-settings-secondary','กลับไปแก้ไข');
  cancel.type='button';
  const accept=create(doc,'button','ui-settings-danger-button','ยืนยันสร้างโลกใหม่');
  accept.type='button';
  confirmActions.append(cancel,accept);
  dialog.append(confirmTitle,confirmInfo,warn,confirmError,confirmActions);
  container.append(sheet,dialog);
  const showSettings=()=>{
    sheet.hidden=false;
    if(!dirty)input.value=currentSeed;
    error.textContent='';
  };
  const hideSettings=()=>{sheet.hidden=true;};
  const unregisterSettings=overlay.registerPanel('settings',{
    element:sheet,kind:'sheet',show:showSettings,hide:hideSettings
  });
  const unregisterConfirm=overlay.registerPanel('settings-confirm',{
    element:dialog,kind:'modal',
    show(){dialog.hidden=false;confirmError.textContent='';},
    hide(reason){
      dialog.hidden=true;
      if(reason!=='world-reset'&&pendingToken!==null)actions.cancelWorldReset();
      pendingToken=null;pendingSeed='';
      submitting=false;accept.disabled=false;
      if(reason==='cancel'||reason==='escape'){
        overlay.openPanel('settings',{opener:start});
        input.focus({preventScroll:true});
      }
    }
  });
  const onInput=()=>{
    dirty=true;
    if(!composing)error.textContent='';
  };
  const compositionStart=()=>{composing=true;};
  const compositionEnd=()=>{composing=false;onInput();};
  const onSubmit=event=>{
    event.preventDefault();
    if(composing||submitting||pendingToken!==null)return;
    const raw=input.value;
    if(!raw.trim()||[...raw.trim()].length>40){
      error.textContent='กรุณากรอก Seed 1–40 อักขระ (ไม่ใช่ช่องว่างล้วน)';
      input.setAttribute('aria-invalid','true');
      return;
    }
    input.removeAttribute('aria-invalid');
    const result=actions.requestWorldReset(raw);
    if(!result?.ok||!result.requiresConfirmation||result.token===undefined){
      error.textContent=feedback(result);
      return;
    }
    pendingToken=result.token;pendingSeed=result.seed;
    confirmInfo.textContent='Seed ใหม่: '+pendingSeed;
    const opened=overlay.openPanel('settings-confirm',{opener:start});
    if(!opened?.ok){
      actions.cancelWorldReset();pendingToken=null;pendingSeed='';
      error.textContent=feedback(opened);
    }
  };
  const onCancelConfirmation=()=>overlay.closePanel('settings-confirm','cancel');
  const onConfirm=()=>{
    if(pendingToken===null||submitting)return;
    submitting=true;accept.disabled=true;
    let result;
    try{result=actions.confirmWorldReset(pendingToken);}
    catch(errorThrown){result={ok:false,error:{code:'WORLD_RESET_FAILED',message:String(errorThrown)}};}
    if(result?.ok){
      dirty=false;pendingToken=null;pendingSeed='';
      currentSeed=String(result.seed??currentSeed);
      input.value=currentSeed;current.textContent=currentSeed;
      // The facade itself closes registered overlays after the world swap.
      if(overlay.isOpen('settings-confirm'))overlay.closePanel('settings-confirm','world-reset');
    }else{
      submitting=false;accept.disabled=false;
      confirmError.textContent=feedback(result);
    }
  };
  const onDialogCancel=event=>{
    event.preventDefault();
    overlay.closePanel('settings-confirm','cancel');
  };
  const onDialogBackdrop=event=>{
    if(event.target===dialog)overlay.closePanel('settings-confirm','cancel');
  };
  close.addEventListener('click',()=>overlay.closePanel('settings'));
  back.addEventListener('click',()=>overlay.closePanel('settings'));
  input.addEventListener('input',onInput);
  input.addEventListener('compositionstart',compositionStart);
  input.addEventListener('compositionend',compositionEnd);
  form.addEventListener('submit',onSubmit);
  cancel.addEventListener('click',onCancelConfirmation);
  accept.addEventListener('click',onConfirm);
  dialog.addEventListener('cancel',onDialogCancel);
  dialog.addEventListener('click',onDialogBackdrop);
  const refresh=snapshot=>{
    const seed=String(snapshot?.settings?.seed??currentSeed);
    if(seed===currentSeed)return;
    currentSeed=seed;current.textContent=seed;
    // A confirmed world change takes precedence over a stale editable draft.
    if(!composing&&pendingToken===null){dirty=false;input.value=seed;}
  };
  const unsubscribe=subscribe(refresh);
  refresh(view);
  return ()=>{
    unsubscribe();
    if(pendingToken!==null)actions.cancelWorldReset();
    unregisterConfirm();unregisterSettings();
    container.replaceChildren();
  };
}
