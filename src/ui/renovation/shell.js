// UI RENOVATION V1 / G1 — shell architecture, no gameplay mutation.
// The future layout is hidden until the coordinator migrates the six screens.
export const UI_REGIONS = Object.freeze([
  'HUD_TOP','PRIMARY_COMMAND','MAP_VIEWPORT','MAP_ACTION',
  'CONTEXT_INSPECTOR','PRIMARY_SHEET','MODAL','TOAST','DEV_ONLY'
]);
export const UI_STACK = Object.freeze({
  MAP_VIEWPORT:0,HUD_TOP:10,PRIMARY_COMMAND:10,MAP_ACTION:15,
  CONTEXT_INSPECTOR:20,POPOVER:30,PRIMARY_SHEET:40,TOAST:50,
  MODAL_BACKDROP:59,MODAL:60,DEV_ONLY:70
});
const PANEL_KINDS = new Set(['inspector','popover','sheet','modal']);

export class UIOverlayController {
  constructor({document: doc = globalThis.document} = {}) {
    this.document = doc;
    this.registry = new Map();
    this.stack = [];
    this.mode = 'inspect';
    this.subscribers = new Set();
    this._key = event => {
      if(event.key !== 'Escape' || event.defaultPrevented) return;
      if(this.closeTop('escape')) { event.preventDefault(); event.stopPropagation(); }
    };
    doc?.addEventListener?.('keydown',this._key,true);
  }
  registerPanel(id,{element,kind='sheet',show,hide}={}) {
    if(!id || this.registry.has(id) || !PANEL_KINDS.has(kind) || !element)
      throw new TypeError('Invalid or duplicate overlay registration');
    this.registry.set(id,{element,kind,show,hide});
    return () => { this.closePanel(id,'unmount'); this.registry.delete(id); };
  }
  subscribe(callback) {
    if(typeof callback!=='function') throw new TypeError('Listener required');
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  _notify() {
    const state=Object.freeze({active:this.stack.at(-1)?.id??null,
      open:this.stack.map(entry=>entry.id),mode:this.mode});
    for(const fn of [...this.subscribers]) fn(state);
  }
  isOpen(id) { return this.stack.some(x=>x.id===id); }
  openPanel(id,{opener=this.document?.activeElement,context=null}={}) {
    const panel=this.registry.get(id);
    if(!panel) return {ok:false,error:{code:'UNKNOWN_PANEL'}};
    if(this.isOpen(id)) return {ok:true,unchanged:true};
    // A heavy sheet and modal cannot coexist. Popovers stay with their owner.
    if(panel.kind==='sheet'||panel.kind==='modal')
      for(const entry of [...this.stack].reverse()) this.closePanel(entry.id,'replaced');
    if(panel.kind==='popover' && this.stack.some(x=>this.registry.get(x.id)?.kind==='modal'))
      return {ok:false,error:{code:'MODAL_ACTIVE'}};
    panel.show?.(context);
    if(panel.kind==='modal' && panel.element.tagName==='DIALOG' && !panel.element.open)
      panel.element.showModal();
    if(panel.element.hidden) panel.element.hidden=false;
    this.stack.push({id,opener,context});
    panel.element.setAttribute?.('data-ui-overlay-open','true');
    // The old trigger may be in a dismissed menu; enter the new panel's focus context.
    const first=panel.element.querySelector?.('button:not([disabled]), input:not([disabled]), [tabindex="0"]');
    first?.focus?.({preventScroll:true});
    this._notify();
    return {ok:true};
  }
  closePanel(id,reason='dismiss') {
    const at=this.stack.findIndex(x=>x.id===id);
    if(at<0)return false;
    const entry=this.stack[at],panel=this.registry.get(id);
    // Popovers are always children of the owning panel in stack order.
    for(const child of [...this.stack.slice(at+1)].reverse())this.closePanel(child.id,reason);
    this.stack.splice(at,1);
    // Exit the native top layer BEFORE the feature hide callback restores its
    // parent sheet and focuses its input; otherwise focus is blocked as inert.
    if(panel?.kind==='modal' && panel?.element?.tagName==='DIALOG' && panel.element.open)
      panel.element.close();
    panel?.hide?.(reason);
    if(panel?.element) {
      panel.element.removeAttribute?.('data-ui-overlay-open');
      if(!panel.hide) panel.element.hidden=true;
    }
    if(!this.stack.length && reason!=='replaced' && reason!=='unmount' &&
       reason!=='world-reset' && entry.opener?.isConnected
       && typeof entry.opener.focus==='function')
      entry.opener.focus({preventScroll:true});
    this._notify();
    return true;
  }
  closeTop(reason='dismiss') {
    const entry=this.stack.at(-1);
    return entry ? this.closePanel(entry.id,reason) : false;
  }
  closeAll(reason='world-reset') {
    while(this.stack.length)this.closePanel(this.stack.at(-1).id,reason);
  }
  setWorldMode(mode) {
    if(!['inspect','dig','room','rally'].includes(mode))
      return {ok:false,error:{code:'INVALID_WORLD_MODE'}};
    this.mode=mode;this._notify();return {ok:true,mode};
  }
  onVisibilityChange(callback){return this.subscribe(callback);}
  dispose(){
    this.closeAll('unmount');
    this.document?.removeEventListener?.('keydown',this._key,true);
    this.registry.clear();this.subscribers.clear();
  }
}
export function createRenovationShell({document:doc=globalThis.document}={}) {
  const app=doc?.getElementById?.('app');
  if(!app)throw new Error('Ant Kingdom #app root unavailable');
  if(doc.getElementById('ui-renovation-root'))throw new Error('G1 shell already mounted');
  const root=doc.createElement('div');
  root.id='ui-renovation-root';
  root.className='ui-renovation-shell';
  root.hidden=true;
  root.setAttribute('aria-label','UI Renovation V1 — reserved layout');
  for(const id of UI_REGIONS) {
    const slot=doc.createElement('div');
    slot.className='ui-renovation-slot';
    slot.dataset.uiRegion=id;
    root.append(slot);
  }
  app.append(root);
  const overlay=new UIOverlayController({document:doc});
  const regions=Object.freeze(Object.fromEntries(UI_REGIONS.map(id=>[id,
    root.querySelector('[data-ui-region="'+id+'"]')])));
  // A single shared clickable outside-dismiss surface, not per-feature ad hoc masks.
  const backdrop=doc.createElement('button');
  backdrop.type='button';backdrop.className='ui-renovation-backdrop';
  backdrop.hidden=true;
  backdrop.setAttribute('aria-label','ปิดหน้าต่างและกลับไปยังแผนที่');
  regions.PRIMARY_SHEET.prepend(backdrop);
  backdrop.addEventListener('click',()=>overlay.closeTop('outside'));
  const offBackdrop=overlay.subscribe(({active})=>{
    backdrop.hidden=!(active && overlay.registry.get(active)?.kind==='sheet');
  });
  return Object.freeze({
    root,regions,overlay,
    getRegion(name){return regions[name]??null;},
    mountFeature(name,feature,{adapter,region}={}) {
      const host=regions[region];
      if(!host || !feature || typeof feature.mount!=='function' || !adapter)
        throw new TypeError('Feature module / known region / adapter required');
      const container=doc.createElement('section');
      container.className='ui-feature-panel';
      container.dataset.uiFeature=name;
      host.append(container);
      let dispose;
      try {
        dispose=feature.mount(container,{
          view:adapter.view,actions:adapter.actions,overlay,
          subscribe:callback=>adapter.subscribe(callback)
        });
        if(typeof dispose!=='function')throw new TypeError('Feature.mount must return cleanup()');
      } catch(error) { container.remove();throw error; }
      return () => { dispose();container.remove(); };
    },
    preview(enabled=false) {
      // Only test harness / coordinator; never enable partial HUD for users.
      root.hidden=!enabled;
      root.dataset.preview=String(enabled);
    },
    dispose(){offBackdrop();overlay.dispose();root.remove();}
  });
}
