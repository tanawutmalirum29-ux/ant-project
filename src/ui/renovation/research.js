// CP-03 / COLONY PROGRESSION V1 — presentation only; Research core and facade own all authority.
const RESOURCES = Object.freeze([['carbs','อาหาร'],['protein','โปรตีน'],['water','น้ำ']]);
const STATUS = Object.freeze({
  locked:'ยังล็อก',available:'พร้อมวิจัย',active:'กำลังวิจัย',completed:'เสร็จแล้ว'
});
const ERRORS = Object.freeze({
  INVALID_TECH:'ไม่พบเทคโนโลยีนี้', ALREADY_RESEARCHED:'วิจัยรายการนี้แล้ว',
  PREREQUISITE_LOCKED:'ยังไม่ผ่านเงื่อนไขการวิจัย',
  INSUFFICIENT_RESOURCES:'ทรัพยากรในคลังไม่เพียงพอ',
  RESEARCH_ACTIVE:'มีงานวิจัยอื่นกำลังดำเนินการ',
  NO_ACTIVE_RESEARCH:'ไม่มีงานวิจัยที่ยกเลิกได้',
  STALE_RUN_ID:'งานวิจัยเปลี่ยนไปแล้ว',
  REFUND_SOURCE_UNAVAILABLE:'คลังต้นทางไม่มีพื้นที่หรือไม่พร้อมคืนทรัพยากร',
  GAME_OVER:'อาณาจักรสิ้นสุดแล้ว',
  INTERNAL_INVARIANT_ERROR:'ไม่สามารถยืนยันข้อมูลทรัพยากรได้'
});
let nextInstance = 0;
function make(doc, tag, cls, value) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (value !== undefined) node.textContent = value;
  return node;
}
function update(node, value) {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}
function button(doc, cls, value) {
  const b = make(doc, 'button', cls, value);
  b.type = 'button';
  return b;
}
function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('th-TH') : '—';
}
function resources(value) {
  return RESOURCES.map(([key,label]) => label + ' ' + number(value?.[key])).join(' · ');
}
function actionError(result) {
  if (result?.ok) return '';
  return ERRORS[result?.error?.code] || 'ไม่สามารถทำรายการได้ กรุณาตรวจสอบข้อมูลอีกครั้ง';
}
function ticksLabel(ticks, rate) {
  const suffix = Number.isSafeInteger(rate) && rate > 0
    ? ' (ประมาณ ' + (ticks / rate).toLocaleString('th-TH',{maximumFractionDigits:1}) + ' วินาทีเกม)'
    : '';
  return number(ticks) + ' ติ๊ก' + (Number.isSafeInteger(ticks) && ticks >= 0 ? suffix : '');
}
function techById(snapshot, id) {
  return snapshot?.research?.technologies?.find(tech => tech.id === id);
}
function prerequisites(tech, snapshot) {
  if (!tech.prerequisiteIds?.length) return 'เงื่อนไข: ไม่มี';
  const names = tech.prerequisiteIds.map(id => {
    const target = techById(snapshot, id);
    return target?.title || id;
  });
  const missing = tech.missingPrerequisiteIds || [];
  return 'ต้องวิจัย: ' + names.join(', ') +
    (missing.length ? ' · ยังขาด ' + missing.map(id => techById(snapshot,id)?.title || id).join(', ') : ' · ครบแล้ว');
}

export function mount(container, {view, actions, overlay, subscribe} = {}) {
  if (!container || !actions || !overlay || typeof subscribe !== 'function')
    throw new TypeError('Research UI requires container, actions, overlay and subscribe');
  if (container.parentElement?.dataset?.uiRegion !== 'PRIMARY_SHEET')
    throw new Error('Research UI must mount inside PRIMARY_SHEET');

  const doc = container.ownerDocument;
  const uid = 'ui-research-' + (++nextInstance);
  container.classList.add('ui-research-host');
  const sheet = make(doc, 'section', 'ui-research-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role','region');
  sheet.setAttribute('aria-label','การวิจัยของอาณาจักร');

  const header = make(doc,'header','ui-research-header');
  const heading = make(doc,'h2','ui-research-heading','การวิจัย');
  heading.id = uid + '-title';
  sheet.setAttribute('aria-labelledby',heading.id);
  const close = button(doc,'ui-research-close','ปิด');
  close.setAttribute('aria-label','ปิดหน้าการวิจัย');
  header.append(heading,close);

  const active = make(doc,'section','ui-research-active');
  active.setAttribute('role','group');
  active.setAttribute('aria-label','งานวิจัยปัจจุบัน');
  const activeTitle = make(doc,'strong','ui-research-active-title','ยังไม่มีงานวิจัย');
  const remaining = make(doc,'span','ui-research-remaining');
  const progress = make(doc,'progress','ui-research-progress');
  progress.max = 1;
  progress.value = 0;
  progress.hidden = true;
  progress.setAttribute('aria-label','ความคืบหน้างานวิจัย');
  const cancel = button(doc,'ui-research-cancel','ยกเลิกงานวิจัย');
  cancel.hidden = true;
  const cancelHint = make(doc,'p','ui-research-cancel-hint');
  cancelHint.hidden = true;
  const cancelConfirm = make(doc,'div','ui-research-confirm');
  cancelConfirm.hidden = true;
  const cancelDisclosure = make(doc,'p','ui-research-disclosure');
  const confirmCancel = button(doc,'ui-research-danger','ยืนยันยกเลิก');
  const backCancel = button(doc,'ui-research-secondary','กลับ');
  cancelConfirm.append(cancelDisclosure,confirmCancel,backCancel);
  active.append(activeTitle,remaining,progress,cancel,cancelHint,cancelConfirm);

  const listTitle = make(doc,'h3','ui-research-list-heading','เทคโนโลยี');
  const list = make(doc,'ol','ui-research-list');
  list.setAttribute('aria-label','เทคโนโลยีที่วิจัยได้');
  const empty = make(doc,'p','ui-research-empty','กำลังรอข้อมูลการวิจัยจากเกม');
  const feedback = make(doc,'output','ui-research-feedback','');
  feedback.setAttribute('role','status');
  feedback.setAttribute('aria-live','polite');
  sheet.append(header,active,listTitle,list,empty,feedback);
  container.append(sheet);

  const records = new Map();
  let latest = view;
  let expanded = null, pendingStart = null, pendingCancel = false;
  let busy = false, disposed = false;
  let lastSeed = view?.home?.seed;
  let lastTick = view?.home?.timeTicks;
  let lastCompleted = null, lastActive = null;

  function message(text, failed = false) {
    update(feedback,text);
    feedback.dataset.state = failed ? 'error' : 'info';
  }
  function clearLocal() {
    expanded = null;
    pendingStart = null;
    pendingCancel = false;
    busy = false;
  }
  function createCard(id) {
    const item = make(doc,'li','ui-research-card');
    item.dataset.techId = id;
    const trigger = button(doc,'ui-research-trigger');
    trigger.id = uid + '-trigger-' + id;
    trigger.setAttribute('aria-expanded','false');
    const name = make(doc,'strong','ui-research-name');
    const state = make(doc,'span','ui-research-state');
    trigger.append(name,state);
    const detail = make(doc,'div','ui-research-detail');
    detail.id = uid + '-detail-' + id;
    detail.hidden = true;
    trigger.setAttribute('aria-controls',detail.id);
    const description = make(doc,'p','ui-research-description');
    const effect = make(doc,'p','ui-research-effect');
    const prereq = make(doc,'p','ui-research-prereq');
    const cost = make(doc,'p','ui-research-cost');
    const duration = make(doc,'p','ui-research-duration');
    const missing = make(doc,'p','ui-research-missing');
    const start = button(doc,'ui-research-start','เริ่มวิจัย');
    const confirm = make(doc,'div','ui-research-confirm');
    confirm.hidden = true;
    const spend = make(doc,'p','ui-research-disclosure');
    const confirmStart = button(doc,'ui-research-primary','ยืนยันใช้ทรัพยากร');
    const backStart = button(doc,'ui-research-secondary','กลับ');
    confirm.append(spend,confirmStart,backStart);
    detail.append(description,effect,prereq,cost,duration,missing,start,confirm);
    item.append(trigger,detail);
    const record = {item,trigger,name,state,detail,description,effect,prereq,cost,duration,missing,start,
      confirm,spend,confirmStart,backStart};
    trigger.addEventListener('click', () => {
      expanded = expanded === id ? null : id;
      pendingStart = null;
      pendingCancel = false;
      render();
    });
    start.addEventListener('click', () => {
      const tech = techById(latest,id);
      if (!tech?.canStart || busy) return;
      pendingStart = id;
      pendingCancel = false;
      render();
      record.confirmStart.focus?.({preventScroll:true});
    });
    backStart.addEventListener('click', () => {
      pendingStart = null;
      render();
      record.start.focus?.({preventScroll:true});
    });
    confirmStart.addEventListener('click', () => {
      const tech = techById(latest,id);
      if (busy || pendingStart !== id) return;
      if (!tech?.canStart) {
        pendingStart = null;
        message('เงื่อนไขหรือทรัพยากรเปลี่ยนไปแล้ว',true);
        render();
        return;
      }
      busy = true;
      record.confirmStart.disabled = true;
      let result;
      try { result = actions.startResearch(id); }
      catch (_) { result = {ok:false,error:{code:'INTERNAL_INVARIANT_ERROR'}}; }
      pendingStart = null;
      busy = false;
      message(result?.ok ? 'ส่งคำสั่งเริ่มวิจัยแล้ว' : actionError(result),!result?.ok);
      render();
      record.trigger.focus?.({preventScroll:true});
    });
    records.set(id,record);
    return record;
  }

  cancel.addEventListener('click', () => {
    const research = latest?.research;
    const tech = techById(latest,research?.activeResearchId);
    if (busy || !tech?.canCancel || !research.refundPreview) return;
    pendingStart = null;
    pendingCancel = true;
    render();
    confirmCancel.focus?.({preventScroll:true});
  });
  backCancel.addEventListener('click', () => {
    pendingCancel = false;
    render();
    cancel.focus?.({preventScroll:true});
  });
  confirmCancel.addEventListener('click', () => {
    if (!pendingCancel || busy) return;
    const research = latest?.research;
    const tech = techById(latest,research?.activeResearchId);
    if (!tech?.canCancel || !research?.refundPreview) {
      pendingCancel = false;
      message('ไม่สามารถคืนทรัพยากรได้ กรุณาตรวจสอบคลังต้นทาง',true);
      render();
      return;
    }
    busy = true;
    confirmCancel.disabled = true;
    let result;
    try { result = actions.cancelResearch(); }
    catch (_) { result = {ok:false,error:{code:'INTERNAL_INVARIANT_ERROR'}}; }
    pendingCancel = false;
    busy = false;
    message(result?.ok ? 'ส่งคำสั่งยกเลิกงานวิจัยแล้ว' : actionError(result),!result?.ok);
    render();
    close.focus?.({preventScroll:true});
  });
  close.addEventListener('click', () => overlay.closePanel('research'));

  function render() {
    if (disposed) return;
    const research = latest?.research;
    const techs = Array.isArray(research?.technologies) ? research.technologies : [];
    empty.hidden = techs.length > 0;
    list.hidden = techs.length === 0;
    active.hidden = techs.length === 0;

    const currentIds = new Set(techs.map(t => t.id));
    for (const [id,record] of records) {
      if (!currentIds.has(id)) {
        record.item.remove();
        records.delete(id);
      }
    }
    if (!currentIds.has(expanded)) {expanded = null;pendingStart = null;}
    if (!currentIds.has(pendingStart)) pendingStart = null;

    for (let index = 0; index < techs.length; index++) {
      const tech = techs[index];
      let record = records.get(tech.id);
      if (!record) record = createCard(tech.id);
      if (list.children[index] !== record.item)
        list.insertBefore(record.item,list.children[index] || null);
      update(record.name,tech.title || tech.id);
      update(record.state,STATUS[tech.status] || tech.status);
      record.item.dataset.status = tech.status;
      const open = expanded === tech.id;
      record.trigger.setAttribute('aria-expanded',String(open));
      record.trigger.setAttribute('aria-label',(tech.title || tech.id)+' — '+(STATUS[tech.status] || tech.status));
      record.detail.hidden = !open;
      update(record.description,tech.description || '');
      update(record.effect,'ผลลัพธ์: '+(tech.effectLabel || '—'));
      update(record.prereq,prerequisites(tech,latest));
      update(record.cost,'ค่าใช้จ่าย: '+resources(tech.cost));
      update(record.duration,'ระยะเวลา: '+ticksLabel(tech.totalTicks,research?.ticksPerGameSecond));
      const shortage = RESOURCES.some(([key]) => (tech.missingResources?.[key] || 0) > 0);
      update(record.missing,shortage ? 'ยังขาด: '+resources(tech.missingResources) :
        (tech.status === 'available' && !tech.canStart ? 'ยังเริ่มไม่ได้ขณะมีงานวิจัยอื่นหรืออาณาจักรสิ้นสุด' : ''));
      record.missing.hidden = !record.missing.textContent;
      record.start.hidden = tech.status === 'active' || tech.status === 'completed';
      record.start.disabled = !tech.canStart || busy;
      record.confirm.hidden = !(open && pendingStart === tech.id && tech.canStart);
      update(record.spend,'ยืนยันหักทรัพยากรที่เก็บอยู่จริง: '+resources(tech.cost));
      record.confirmStart.disabled = busy;
    }
    const activeTech = techById(latest,research?.activeResearchId);
    if (activeTech) {
      update(activeTitle,'กำลังวิจัย: '+(activeTech.title || activeTech.id));
      const total = Number(activeTech.totalTicks);
      const remain = Number(activeTech.remainingTicks);
      const valid = Number.isSafeInteger(total) && total > 0 &&
        Number.isSafeInteger(remain) && remain >= 0 && remain <= total;
      progress.hidden = !valid;
      progress.max = valid ? total : 1;
      progress.value = valid ? total - remain : 0;
      update(remaining,'เหลือ '+ticksLabel(activeTech.remainingTicks,research?.ticksPerGameSecond));
      cancel.hidden = false;
      cancel.disabled = !activeTech.canCancel || !research?.refundPreview || busy;
      cancel.setAttribute('aria-label','ยกเลิกวิจัย '+(activeTech.title || activeTech.id));
      const cancelBlocked = !activeTech.canCancel || !research?.refundPreview;
      update(cancelHint, research?.refundPreview ? 'ยังไม่สามารถยกเลิกในสถานะปัจจุบัน' :
        'ยังยกเลิกไม่ได้: ไม่สามารถยืนยันการคืนทรัพยากรไปยังคลังต้นทาง');
      cancelHint.hidden = !cancelBlocked;
      if (cancelBlocked) pendingCancel = false;
      cancelConfirm.hidden = !pendingCancel;
      update(cancelDisclosure,(research?.cancelPolicyLabel || 'คืนทรัพยากรตามเงื่อนไขของเกม') +
        ' · คืนเข้าคลังต้นทาง: '+resources(research?.refundPreview));
      confirmCancel.disabled = busy;
    } else {
      update(activeTitle,'ยังไม่มีงานวิจัย');
      update(remaining,'');
      progress.hidden = true;
      cancel.hidden = true;
      cancelHint.hidden = true;
      cancelConfirm.hidden = true;
      pendingCancel = false;
    }
  }
  function refresh(snapshot) {
    if (disposed) return;
    const seed = snapshot?.home?.seed;
    const tick = snapshot?.home?.timeTicks;
    const completed = new Set((snapshot?.research?.technologies || [])
      .filter(t => t.status === 'completed').map(t => t.id));
    const lostCompletion = lastCompleted && [...lastCompleted].some(id => !completed.has(id));
    const reset = (lastTick !== undefined && tick !== undefined && tick < lastTick) ||
      (lastSeed !== undefined && seed !== undefined && seed !== lastSeed) || lostCompletion;
    if (reset) {
      clearLocal();
      message('');
    } else if (lastCompleted && lastActive && !snapshot?.research?.activeResearchId &&
      completed.has(lastActive) && !lastCompleted.has(lastActive)) {
      const done = techById(snapshot,lastActive);
      message('วิจัยสำเร็จ: '+(done?.title || lastActive));
    }
    latest = snapshot;
    lastSeed = seed;
    lastTick = tick;
    lastCompleted = completed;
    lastActive = snapshot?.research?.activeResearchId || null;
    render();
  }
  const unregister = overlay.registerPanel('research',{
    element:sheet,kind:'sheet',
    show() {sheet.hidden = false;sheet.scrollTop = 0;},
    hide() {
      sheet.hidden = true;
      clearLocal();
      render();
    }
  });
  const off = subscribe(refresh);
  refresh(view);
  return () => {
    if (disposed) return;
    disposed = true;
    if (typeof off === 'function') off();
    unregister();
    container.replaceChildren();
  };
}
