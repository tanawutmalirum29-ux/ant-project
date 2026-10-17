// One shared CSS-only defeat screen for renovation AND explicit legacy UI.
// It reads Game.defeat; it does not infer or mutate death from render frames.
export function createGameOverUI({document:doc=globalThis.document,onRestart}={}) {
  if (!doc || typeof onRestart!=='function') throw new TypeError('Defeat UI requires document and restart');
  const el=(tag,cls,text)=>{
    const node=doc.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const root=el('div','colony-defeat');
  root.id='colony-defeat';
  root.hidden=true;
  const backdrop=el('div','colony-defeat-backdrop');
  const panel=el('section','colony-defeat-panel');
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-labelledby','colony-defeat-title');
  panel.setAttribute('aria-describedby','colony-defeat-reason');
  const kicker=el('p','colony-defeat-kicker','ANT KINGDOM · ผลการเล่น');
  const heading=el('h2','colony-defeat-title','อาณาจักรล่มสลาย');
  heading.id='colony-defeat-title';
  heading.tabIndex=-1;
  const reason=el('p','colony-defeat-reason','');
  reason.id='colony-defeat-reason';
  const message=el('p','colony-defeat-message',
    'เมื่อนางพญาสิ้นชีวิต อาณาจักรไม่สามารถฟื้นตัวได้ เกมจบลงแล้ว');
  const stats=el('dl','colony-defeat-stats');
  const line=(label)=>{
    const dt=el('dt','',label),dd=el('dd','');
    stats.append(dt,dd);
    return dd;
  };
  const clock=line('อยู่รอด');
  const population=line('มดที่เหลือ');
  const births=line('มดที่เกิด');
  const enemies=line('กำจัดศัตรู');
  const actions=el('div','colony-defeat-actions');
  const restart=el('button','colony-defeat-restart','เริ่มอาณาจักรใหม่');
  const inspect=el('button','colony-defeat-inspect','ดูรังที่ล่มสลาย');
  restart.type=inspect.type='button';
  const error=el('p','colony-defeat-error','');
  error.setAttribute('role','status');
  actions.append(restart,inspect);
  panel.append(kicker,heading,reason,message,stats,actions,error);
  const reopen=el('button','colony-defeat-reopen','อาณาจักรล่มสลาย · ดูผลการเล่น');
  reopen.type='button';reopen.hidden=true;
  root.append(backdrop,panel,reopen);
  doc.body.append(root);
  let shownGame=null,viewing=false;
  const setViewing=value=>{
    viewing=value;
    root.classList.toggle('is-viewing',value);
    reopen.hidden=!value;
    if(!value)heading.focus({preventScroll:true});
  };
  inspect.addEventListener('click',()=>setViewing(true));
  reopen.addEventListener('click',()=>setViewing(false));
  restart.addEventListener('click',()=>{
    if(!shownGame?.defeat)return;
    restart.disabled=true;
    error.textContent='';
    try {
      const result=onRestart(shownGame.defeat.seed);
      if(!result?.ok)error.textContent='ไม่สามารถเริ่มอาณาจักรใหม่ได้ โปรดลองอีกครั้ง';
    } catch {
      error.textContent='ไม่สามารถเริ่มอาณาจักรใหม่ได้ โปรดลองอีกครั้ง';
    } finally {restart.disabled=false;}
  });
  return Object.freeze({
    root,
    sync(game){
      if(!game?.defeat){
        if(!root.hidden){root.hidden=true;shownGame=null;viewing=false;
          root.classList.remove('is-viewing');reopen.hidden=true;}
        return;
      }
      if(game===shownGame)return;
      shownGame=game;
      root.hidden=false;error.textContent='';
      const defeat=game.defeat;
      reason.textContent=defeat.reason;
      const days=Math.floor(defeat.tick/4800)+1;
      clock.textContent='วันที่ '+days+' · '+defeat.tick.toLocaleString('th-TH')+' ติ๊ก';
      population.textContent=String(defeat.population)+' ตัว';
      births.textContent=String(defeat.births)+' ตัว';
      enemies.textContent=String(defeat.defeatedEnemies)+' ตัว';
      setViewing(false);
    },
    dispose(){root.remove();}
  });
}
