/* V2 static preview controls: visuals only, no engine integration. */
const $ = id => document.getElementById(id);
const mock = { foragers: 18, nurses: 6, workers: 43 };
function count(id,value){ $(id).textContent=value+'/'+mock.workers; }
for (const button of document.querySelectorAll('[data-speed]')) {
 button.addEventListener('click',()=>{
  document.querySelectorAll('[data-speed]').forEach(b=>{
   const selected=b===button;
   b.classList.toggle('active',selected);
   b.setAttribute('aria-pressed',String(selected));
  });
 });
}
for (const button of document.querySelectorAll('[data-layer]')) {
 button.addEventListener('click',()=>{
  document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('selected',b===button));
  const surface=button.dataset.layer==='surface';
  $('region-name').textContent=surface?'เหนือผืนป่า':'ใต้ผืนดิน';
  $('region-subtitle').textContent=surface?'เส้นทางหาอาหาร':'โครงข่ายภายในรัง';
  $('tool-dig').disabled=surface;
  if(surface) {$('tool-inspect').click();}
 });
}
for(const btn of document.querySelectorAll('.tool-button')){
 btn.addEventListener('click',()=>{
  if(btn.disabled)return;
  document.querySelectorAll('.tool-button').forEach(b=>{
   b.classList.toggle('active',b===btn);
   b.setAttribute('aria-pressed',String(b===btn));
  });
 });
}
$('forage-minus').addEventListener('click',()=>count('forage-count',mock.foragers=Math.max(0,mock.foragers-1)));
$('forage-plus').addEventListener('click',()=>count('forage-count',mock.foragers=Math.min(mock.workers,mock.foragers+1)));
$('nurse-minus').addEventListener('click',()=>count('nurse-count',mock.nurses=Math.max(0,mock.nurses-1)));
$('nurse-plus').addEventListener('click',()=>count('nurse-count',mock.nurses=Math.min(mock.workers,mock.nurses+1)));
function show(id,open){$(id).classList.toggle('hidden',!open);}
$('colony-button').addEventListener('click',()=>{
 const open=$('colony-panel').classList.contains('hidden');
 show('colony-panel',open);
 $('colony-button').setAttribute('aria-expanded',String(open));
});
$('close-colony').addEventListener('click',()=>{$('colony-button').setAttribute('aria-expanded','false');show('colony-panel',false);});
$('debug-toggle').addEventListener('click',()=>show('debug-panel',$('debug-panel').classList.contains('hidden')));
$('seed-button').addEventListener('click',()=>{$('seed-input').value='COLONY-V2';$('seed-dialog').showModal();});
$('cancel-seed').addEventListener('click',()=>$('seed-dialog').close());
$('seed-form').addEventListener('submit',e=>{e.preventDefault();$('seed-dialog').close();});
$('selection-close').addEventListener('click',()=>show('selection-card',false));
$('tool-inspect').addEventListener('dblclick',()=>show('selection-card',true));
$('zoom-in').addEventListener('click',()=>{});
$('zoom-out').addEventListener('click',()=>{});
$('recenter').addEventListener('click',()=>{});
$('portal-button').addEventListener('click',()=>$('surface-button').click());
$('cancel-dig').addEventListener('click',()=>show('selection-card',false));
