import { TILE } from '../world/generate.js';
import { displayedPosition } from '../core/game.js';

const STATES = Object.freeze({
  idle: 'ว่าง', walking: 'กำลังเดิน', nursing: 'ดูแลตัวอ่อน',
  digging: 'กำลังขุด', 'room-rest': 'พักในห้อง', 'room-guard': 'ลาดตระเวน',
  'combat-guard': 'เฝ้ารัง', 'combat-rally': 'เดินไปรวมพล',
  'combat-intercept': 'สกัดศัตรู', 'combat-attack': 'ต่อสู้',
  'combat-queen-defense': 'ปกป้องนางพญา', 'combat-retreat': 'ถอยเพื่อรักษา',
  'forage-outbound': 'ออกหาอาหาร', 'forage-return': 'ขนอาหารกลับรัง'
});
const CARGO = Object.freeze({ carbs:'อาหาร', protein:'โปรตีน', water:'น้ำ' });

export function antById(game,id) {
  if(!id) return null;
  const queen=game.colony?.queen;
  if(queen?.alive && queen.id===id) return queen;
  return game.colony?.workers?.find(ant=>ant.id===id) ?? null;
}
export function antsAtTile(game,layer,x,y) {
  const queen=game.colony?.queen;
  const ants=(game.colony?.workers??[]).filter(ant=>ant.layer===layer && ant.x===x && ant.y===y);
  if(queen?.alive && queen.layer===layer && queen.x===x && queen.y===y) ants.unshift(queen);
  return ants;
}

/** Hit-test the actual interpolated sprite, not just the logical tile under it. */
export function antAtPointer(game,camera,p,width,height) {
  let nearest=null,nearestScore=Infinity;
  const queen=game.colony?.queen;
  const ants=[...(queen?.alive?[queen]:[]),...(game.colony?.workers??[])];
  if(!ants.length||typeof camera.worldToScreen!=='function')return null;
  for(const ant of ants) {
    if(ant.layer!==game.layer)continue;
    const pos=displayedPosition(game,ant);
    const pixel=camera.worldToScreen((pos.x+.5)*TILE,(pos.y+.5)*TILE,width,height);
    const distance=Math.hypot(pixel.x-p.x,pixel.y-p.y);
    const radius=Math.max(11,Math.min(29,camera.zoom*(ant.caste==='queen'?23:17)));
    const score=distance/radius;
    if(score<=1 && score<nearestScore){nearest=ant;nearestScore=score;}
  }
  return nearest;
}
export function antRole(ant) {
  if(ant.caste==='queen')return 'นางพญา';
  const names={starter:'มดเริ่มต้น',miner:'มดขุด',forager:'มดหาอาหาร',
    builder:'มดช่าง',nurse:'มดพี่เลี้ยง',soldier:'มดทหาร'};
  const name=names[ant.profession]||
    (ant.combatRole==='soldier'?'มดทหาร':ant.state==='nursing'?'มดพี่เลี้ยง':'มดงาน');
  return name+' · Lv.'+(ant.level||1)+(ant.combatRole==='soldier'?' · กอง '+(ant.squadId==='B'?'B':'A'):'');
}
export function antState(ant) {
  if(ant.caste==='queen')return ant.alive?'ประจำรัง':'สิ้นชีวิต';
  if(ant.ambientActive)return 'เดินสำรวจในรัง';
  return STATES[ant.state] ??
    (ant.state?.startsWith('forage-')?'กำลังหาอาหาร':
    ant.orderId!=null?'ปฏิบัติงาน':'รอคำสั่ง');
}
function title(ant) {
  return ant.caste==='queen'?'นางพญา':ant.id.replace(/^worker-/,'มด #');
}
function details(game,ant) {
  const parts=[antRole(ant),antState(ant),`ตำแหน่ง ${ant.x}, ${ant.y}`];
  if(ant.combatRole==='soldier') {
    const max=game.combat?.maxHP?.(ant)??16;
    parts.push(`HP ${Math.max(0,Math.min(max,ant.combatHP??max))}/${max}`);
  }
  if(ant.caste==='queen' && game.combat) parts.push(`HP ${game.combat.queenHP}/48`);
  if(ant.cargo?.amount)parts.push(`ขน${CARGO[ant.cargo.type]??'ทรัพยากร'} ${ant.cargo.amount}`);
  if(ant.broodCargo)parts.push('กำลังขนตัวอ่อน');
  return parts;
}

/** Only content comes from JS; every visible element is styled by inspector.css. */
export function renderAntInspector(game,selection,selectedAntId) {
  const root=document.getElementById('selection-ants');
  const list=document.getElementById('selection-ants-list');
  const detail=document.getElementById('selection-ant-detail');
  if(!root || !list || !detail || typeof list.replaceChildren!=='function')return;
  const ants=selection?antsAtTile(game,selection.layer,selection.x,selection.y):[];
  root.classList.toggle('hidden',ants.length===0);
  if(!ants.length){
    list.replaceChildren();list.dataset.members='';detail.replaceChildren();detail.dataset.signature='';
    detail.classList.add('hidden');return;
  }
  const membership=ants.map(a=>a.id).join('|');
  if(list.dataset.members!==membership){
    const frag=document.createDocumentFragment();
    for(const ant of ants){
      const button=document.createElement('button');
      button.type='button';button.className='selection-ant-button';
      button.dataset.antId=ant.id;
      const name=document.createElement('strong');name.textContent=title(ant);
      const state=document.createElement('span');state.className='selection-ant-role';state.textContent=antRole(ant);
      button.append(name,state);frag.append(button);
    }
    list.replaceChildren(frag);list.dataset.members=membership;
  }
  document.getElementById('selection-ants-count').textContent=`มดในช่องนี้ ${ants.length} ตัว`;
  const chosen=ants.find(a=>a.id===selectedAntId)??ants[0];
  for(const button of list.querySelectorAll('button[data-ant-id]')){
    button.setAttribute('aria-pressed',String(button.dataset.antId===chosen.id));
    const ant=ants.find(a=>a.id===button.dataset.antId);
    const role=button.querySelector('.selection-ant-role');
    if(ant && role && role.textContent!==antRole(ant))role.textContent=antRole(ant);
  }
  detail.classList.remove('hidden');
  const lines=details(game,chosen);
  const signature=chosen.id+'|'+lines.join('|');
  if(detail.dataset.signature!==signature){
    const heading=document.createElement('strong');heading.textContent=title(chosen);
    const text=document.createElement('p');text.textContent=lines.join(' · ');
    detail.replaceChildren(heading,text);detail.dataset.signature=signature;
  }
}
