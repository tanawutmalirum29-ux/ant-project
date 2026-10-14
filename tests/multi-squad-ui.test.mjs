import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CombatControls } from '../src/ui/combat-controls.js';

const ok = data => ({ok:true,data});
const error = (code,message=code) => ({ok:false,error:{code,message}});
const snapshot = (id,mode='defend') => ({
  id,mode,rally:null,soldiers:[],count:0,hpCurrent:0,hpMax:0,
  ralliedCount:0,formation:{assigned:0,standby:0,unreachable:0},queenEmergency:false
});
function fixture(){
  const squads={A:snapshot('A'),B:snapshot('B')};
  const logs={notice:[],pings:[],tools:[],updates:[],commands:[]};
  const current={textContent:'',setAttribute(){}};
  const byId=new Map([['u6-quick-rally',{setAttribute:(key,value)=>logs.commands.push([key,value])}],
    ['u6-badge',current],['u6-quick-defend',{setAttribute:(k,v)=>logs.commands.push([k,v])}]]);
  const previousDocument=globalThis.document;
  globalThis.document={getElementById:id=>byId.get(id)??null};
  const combat={
    soldiers:[],soldierSlots:0,threatCount:0,defeated:0,queenHP:48,
    availableRecruits:[],canRecruit(){return false;},
    getSquads(){return ok([structuredClone(squads.A),structuredClone(squads.B)]);},
    getSquad(id){return squads[id]?ok(structuredClone(squads[id])):error('INVALID_SQUAD');},
    transferSoldier(id,to){
      if(!squads[to])return error('INVALID_SQUAD');
      const from=['A','B'].find(s=>squads[s].soldiers.some(m=>m.id===id));
      if(!from)return error('NOT_ACTIVE_SOLDIER');
      if(from===to)return error('SAME_SQUAD');
      const i=squads[from].soldiers.findIndex(m=>m.id===id);
      const [member]=squads[from].soldiers.splice(i,1);
      squads[to].soldiers.push(member);
      for(const s of Object.values(squads)){
        s.count=s.soldiers.length;
        s.hpCurrent=s.soldiers.reduce((a,m)=>a+m.hp,0);
        s.hpMax=s.soldiers.reduce((a,m)=>a+m.maxHP,0);
      }
      return ok({soldierId:id,fromSquad:from,toSquad:to});
    },
    setSquadMode(id,mode){
      if(!squads[id])return error('INVALID_SQUAD');
      if(!['defend','retreat','rally'].includes(mode))return error('INVALID_ORDER');
      squads[id].mode=mode;return ok({squadId:id,mode});
    },
    setSquadRally(id,layer,x,y){
      if(!squads[id])return error('INVALID_SQUAD');
      if(!['surface','underground'].includes(layer)||!Number.isInteger(x)||!Number.isInteger(y))
        return error('INVALID_RALLY');
      if(x<0||y<0)return error('UNREACHABLE_RALLY');
      squads[id].rally={layer,x,y};squads[id].mode='rally';
      return ok({squadId:id,mode:'rally',rally:structuredClone(squads[id].rally)});
    }
  };
  const notice={textContent:''};
  const nodes=new Map([['#u6-notice',notice]]);
  const dialog={open:false,close(){this.open=false;},querySelector:id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',max:'',value:''});
    return nodes.get(id);
  },querySelectorAll(){return [];}};
  const ui={
    game:{combat,colony:{workers:[]},workforce:{shares:{forage:40,nurse:20,soldier:20}}},
    notice:s=>logs.notice.push(s),setTool:s=>logs.tools.push(s),
    renderer:{showRallyPing:(...args)=>logs.pings.push(args)}
  };
  const control=Object.create(CombatControls.prototype);
  Object.assign(control,{ui,dialog,tip:{hidden:true},tipText:{textContent:''},
    selectedSquad:'A',armedSquad:null,targeting:false,rosterSignature:'',lastGame:ui.game});
  control.update=force=>logs.updates.push(force);
  const cleanup=()=>{globalThis.document=previousDocument;};
  return {control,combat,squads,logs,nodes,dialog,ui,cleanup};
}
const soldier=(id,hp=13)=>({
  id,hp,maxHP:16,layer:'underground',x:3,y:4,state:'combat-guard',
  formationStatus:null,arrived:false
});

test('A/B selection uses public getSquad and rejects invalid squad without changing UI selection',()=>{
  const f=fixture();
  try{
    assert.equal(f.control.selectSquad('B'),true);
    assert.equal(f.control.selectedSquad,'B');
    assert.equal(f.control.selectSquad('C'),false);
    assert.equal(f.control.selectedSquad,'B');
    assert.equal(f.control.readSquad('A').data.id,'A');
  }finally{f.cleanup();}
});

test('squad commands preserve other squad and never write Combat legacy mode',()=>{
  const f=fixture();
  try{
    f.control.selectSquad('B');
    assert.equal(f.control.order('retreat'),true);
    assert.equal(f.squads.B.mode,'retreat');
    assert.equal(f.squads.A.mode,'defend');
    assert.equal(f.control.order('not-a-command'),false);
    assert.equal(f.squads.B.mode,'retreat');
    assert.match(f.nodes.get('#u6-notice').textContent,/คำสั่ง/);
  }finally{f.cleanup();}
});

test('transfer A to B and B to A preserves member ID/HP; rejected transfers show errors',()=>{
  const f=fixture();
  try{
    f.squads.A.soldiers=[soldier('worker-1',5)];
    f.squads.A.count=1;f.squads.A.hpCurrent=5;f.squads.A.hpMax=16;
    assert.equal(f.control.transfer('worker-1','B'),true);
    assert.equal(f.squads.B.soldiers[0].id,'worker-1');
    assert.equal(f.squads.B.hpCurrent,5);
    assert.equal(f.control.transfer('worker-1','B'),false);
    assert.equal(f.squads.B.soldiers.length,1);
    assert.match(f.nodes.get('#u6-notice').textContent,/กองนี้/);
    assert.equal(f.control.transfer('worker-1','A'),true);
    assert.equal(f.squads.A.soldiers[0].hp,5);
    assert.equal(f.squads.B.count,0);
    assert.equal(f.control.transfer('foreign','B'),false);
    assert.equal(f.squads.A.soldiers.length,1);
  }finally{f.cleanup();}
});

test('arm time Squad B remains bound even after UI selection changes; exactly one successful ping',()=>{
  const f=fixture();
  try{
    assert.equal(f.control.selectSquad('B'),true);
    assert.equal(f.control.armRally(),true);
    assert.equal(f.control.armedSquad,'B');
    assert.equal(f.control.tip.hidden,false);
    assert.equal(f.logs.pings.length,0);
    f.control.selectedSquad='A';
    assert.equal(f.control.placeRally({layer:'surface',x:10,y:11}),true);
    assert.deepEqual(f.squads.B.rally,{layer:'surface',x:10,y:11});
    assert.equal(f.squads.A.rally,null);
    assert.equal(f.logs.pings.length,1);
    assert.equal(f.control.armedSquad,null);
    assert.equal(f.control.targeting,false);
  }finally{f.cleanup();}
});

test('empty B may rally; invalid rally preserves target, order and no success ping',()=>{
  const f=fixture();
  try{
    f.control.selectSquad('B');
    assert.equal(f.control.armRally(),true,'do not prohibit empty squad');
    assert.equal(f.control.placeRally({layer:'surface',x:-4,y:2}),true);
    assert.equal(f.logs.pings.length,0);
    assert.equal(f.control.targeting,true,'invalid tile can be corrected or cancelled');
    assert.equal(f.control.armedSquad,'B');
    assert.equal(f.squads.B.rally,null);
    assert.equal(f.squads.B.mode,'defend');
    f.control.cancelRally();
    assert.equal(f.control.placeRally({layer:'surface',x:4,y:2}),false);
    assert.equal(f.logs.pings.length,0);
  }finally{f.cleanup();}
});

test('selected-squad readout renders A/B snapshots, formation, emergency and empty B',()=>{
  const f=fixture();
  try{
    f.squads.A.count=1;f.squads.A.hpCurrent=8;f.squads.A.hpMax=16;
    f.squads.A.formation={assigned:1,standby:0,unreachable:0};
    f.squads.B.queenEmergency=true;
    f.dialog.open=true;
    f.control.renderRoster=()=>{};
    f.control.update=CombatControls.prototype.update;
    f.control.update(true);
    assert.match(f.nodes.get('#u6-overview-a').textContent,/HP 8\/16/);
    assert.match(f.nodes.get('#u6-overview-b').textContent,/0 ตัว/);
    f.control.selectSquad('B');
    assert.match(f.nodes.get('#u6-squad-emergency').textContent,/ฉุกเฉิน/);
    assert.match(f.nodes.get('#u6-squad-formation').textContent,/ประจำจุด 0/);
  }finally{f.cleanup();}
});

test('new UI source uses squad public methods, native button accessibility and shared canvas tap path',()=>{
  const js=readFileSync(new URL('../src/ui/combat-controls.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/ui/combat.css',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/ui/app.js',import.meta.url),'utf8');
  for(const method of ['getSquads','getSquad','transferSoldier','setSquadMode','setSquadRally'])
    assert.match(js,new RegExp('\\.'+method+'\\b'));
  assert.doesNotMatch(js,/this\.combat\.setRally\(/);
  assert.doesNotMatch(js,/this\.combat\.setMode\(/);
  assert.match(js,/this\.ui\.mapTapHandler=tile=>this\.placeRally\(tile\)/);
  assert.match(app,/this\.mapTapHandler\?\.\(\{layer:this\.game\.layer,\.\.\.cell\}\)===true/);
  assert.match(js,/data-u6-squad="A"/);
  assert.match(js,/data-u6-squad="B"/);
  assert.match(js,/aria-pressed/);
  assert.match(js,/addEventListener\('keydown'/);
  assert.match(js,/e\.code==='Escape'&&this\.targeting/);
  assert.match(css,/#u6-dialog \.u6-squad-tabs button:focus-visible/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/@media\(max-width:320px\)/);
  assert.match(css,/min-height:44px/);
});


test('military HUD keeps rally hint at the dock and exposes squad roster filter',()=>{
  const js=readFileSync(new URL('../src/ui/combat-controls.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/ui/combat.css',import.meta.url),'utf8');
  assert.match(js,/dock\.append\(tip\)/);
  assert.match(js,/id="u6-roster-filter"/);
  assert.match(js,/this\.rosterFilter='all'/);
  assert.match(js,/filter==='selected'/);
  assert.match(js,/class="u6-main"/);
  assert.match(js,/class="u6-advanced"/);
  assert.match(css,/#u6-target-tip\{\s*position:absolute;inset:auto/);
  assert.match(css,/#u6-dialog \.u6-main\{display:grid/);
  assert.match(css,/@media\(min-width:740px\) and \(min-height:520px\)/);
});

test('squad roster filters soldiers, workers and currently selected squad without losing transfer buttons',()=>{
  const oldDocument=globalThis.document;
  const makeNode=tag=>({
    tag,children:[],dataset:{},className:'',scrollTop:0,
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(fragment){this.children=[...fragment.children];},
    setAttribute(){},contains(){return false;},querySelectorAll(){return []}
  });
  const list=makeNode('roster');
  globalThis.document={
    activeElement:null,createElement:makeNode,
    createDocumentFragment:()=>makeNode('fragment')
  };
  const workers=[
    {id:'worker-1',state:'combat-guard',combatRole:'soldier',combatHP:10,x:1,y:2,layer:'underground'},
    {id:'worker-2',state:'combat-guard',combatRole:'soldier',combatHP:12,x:3,y:4,layer:'underground'},
    {id:'worker-3',state:'idle',x:5,y:6,layer:'underground'}
  ];
  const combat={canRecruit:()=>false};
  const control=Object.create(CombatControls.prototype);
  Object.assign(control,{
    ui:{game:{colony:{workers},combat}},
    dialog:{querySelector:()=>list},selectedSquad:'B',rosterFilter:'all',rosterSignature:''
  });
  const squadA={id:'A',soldiers:[soldier('worker-1',10)]};
  const squadB={id:'B',soldiers:[soldier('worker-2',12)]};
  try{
    control.renderRoster(true,[squadA,squadB]);
    assert.equal(list.children.length,3);
    control.rosterFilter='selected';
    control.renderRoster(true,[squadA,squadB]);
    assert.equal(list.children.length,1);
    assert.match(list.children[0].children[0].children[0].textContent,/worker-2|มด #2/);
    assert.equal(list.children[0].children[1].children[1].dataset.toSquad,'A');
    control.rosterFilter='workers';
    control.renderRoster(true,[squadA,squadB]);
    assert.equal(list.children.length,1);
    assert.match(list.children[0].children[0].children[0].textContent,/มดงาน/);
    control.rosterFilter='soldiers';
    control.renderRoster(true,[squadA,squadB]);
    assert.equal(list.children.length,2);
  }finally{globalThis.document=oldDocument;}
});
