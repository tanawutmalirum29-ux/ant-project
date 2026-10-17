// G1 read-only view models + verified existing Game/UI action bridge.
// No additional game loop. Future feature modules mount with {view,actions,overlay,subscribe}.
import { SURFACE, UNDERGROUND, TILE } from '../../world/generate.js';
import { ROOM_CATALOG, roomPlan, ROOM_LIMITS } from '../../core/rooms.js';
import { LIFE } from '../../core/lifecycle.js';
import { formatGameTime } from '../../core/time.js';
import { antById } from '../ant-inspector.js';

const fail=(code,message=code)=>({ok:false,error:{code,message}});
const copyTile=tile=>tile?{layer:tile.layer,x:tile.x,y:tile.y}:null;
// G3 canvas bridge: snapshots never expose mutable UI preview objects.
const copyRect=rect=>rect?.from&&rect?.to?{from:{...rect.from},to:{...rect.to}}:null;
const copyAnt=(ant,game)=>Object.freeze({
  id:String(ant.id),profession:ant.profession??(ant.caste==='queen'?'queen':'starter'),
  caste:ant.caste??null,level:ant.level??1,state:ant.state??'idle',
  layer:ant.layer,x:ant.x,y:ant.y,alive:ant.alive!==false,
  squadId:ant.combatRole==='soldier'?(ant.squadId==='B'?'B':'A'):null,
  hp:ant.combatRole==='soldier'?(ant.combatHP??game.combat.maxHP(ant)):null,
  maxHP:ant.combatRole==='soldier'?game.combat.maxHP(ant):null,
  cargo:ant.cargo?.amount?{type:ant.cargo.type,amount:ant.cargo.amount}:null,
  broodCargo:ant.broodCargo?true:false
});
function copiedOrder(order) {
  return {id:order.id,roomId:order.roomId,profession:order.profession,level:order.level,
    status:order.status,slot:order.slot?{...order.slot}:null,cost:{...order.cost},
    remainingTicks:order.remainingTicks,hatchTicks:order.hatchTicks,
    canCancel:order.status==='QUEUED'};
}
/** Only detached immutable authoritative Research data ever reaches a CSS sheet. */
function deepFreezeResearch(value) {
  if(value && typeof value==='object' && !Object.isFrozen(value)) {
    for(const child of Object.values(value))deepFreezeResearch(child);
    Object.freeze(value);
  }
  return value;
}
function makeResearchView(game) {
  const raw=game.research?.snapshot?.();
  if(!raw)return deepFreezeResearch({technologies:[],activeResearchId:null,
    inventory:{carbs:0,protein:0,water:0},refundPreview:null,
    cancelPolicyLabel:'ยกเลิกงานวิจัยระหว่างดำเนินการจะคืนทรัพยากรเต็มจำนวนไปคลังต้นทาง ถ้าคลังต้นทางไม่พร้อมจะยกเลิกไม่ได้',
    ticksPerGameSecond:10,active:null});
  const statuses={LOCKED:'locked',AVAILABLE:'available',QUEUED:'active',
    RESEARCHING:'active',COMPLETED:'completed'};
  const active=raw.active;
  const alive=game.colony?.queen?.alive!==false && !game.defeat;
  const technologies=raw.technologies.map(t=>({
    id:t.id,title:t.title,description:t.description,effectLabel:t.effectLabel,
    status:statuses[t.status]??'locked',
    prerequisiteIds:[...t.prerequisiteIds],missingPrerequisiteIds:[...t.missingPrerequisiteIds],
    cost:{...t.cost},missingResources:{...t.missingResources},
    totalTicks:t.totalTicks,
    remainingTicks:active?.techId===t.id ? Math.max(0,active.totalTicks-active.progressTicks) : t.totalTicks,
    canStart:!!t.canStart,canCancel:!!(alive && raw.refundPreview && active?.techId===t.id)
  }));
  return deepFreezeResearch({
    technologies,activeResearchId:active?.techId??null,
    inventory:{...raw.inventory},
    refundPreview:raw.refundPreview?{...raw.refundPreview}:null,
    cancelPolicyLabel:'ยกเลิกขณะวิจัยได้คืน 100% ไปยังคลังต้นทางเดิม หากคลังต้นทางถูกลบหรือเต็มจะไม่สามารถคืนได้ หลังสำเร็จหรือนางพญาตายจะยกเลิกไม่ได้',
    ticksPerGameSecond:10,active:active?{
      ...active,cost:{...active.cost},pickups:active.pickups.map(p=>({...p}))
    }:null
  });
}
export function makeGameView(game,ui,combatControls) {
  const inventory=game.foraging?.inventory??{};
  const workers=(game.colony?.workers??[]).map(a=>copyAnt(a,game));
  const queen=game.colony?.queen;
  const squads=game.combat?.getSquads?.();
  const report=squads?.ok?squads.data.map(s=>({
    id:s.id,mode:s.mode,rally:copyTile(s.rally),
    soldiers:s.soldiers.map(m=>({...m})),count:s.count,
    hpCurrent:s.hpCurrent,hpMax:s.hpMax,ralliedCount:s.ralliedCount,
    formation:{...s.formation},queenEmergency:s.queenEmergency
  })):[];
  const rooms=(game.rooms?.rooms??[]).map(room=>({
    id:room.id,type:room.type,status:room.status,connected:!!room.connected,
    x:room.x,y:room.y,width:room.width,height:room.height,
    progress:room.progress??0,ticks:room.ticks??0,
    cost:{...room.cost},stock:{...room.stock}
  }));
  const nursery=rooms.filter(r=>r.type==='nursery').map(room=>{
    const stats=game.lifecycle?.nurseryStatus?.(room.id);
    return {...room,slots:stats?.slots??Math.min(room.width*room.height,16),
      used:stats?.used??0,free:stats?.free??0,
      orders:(stats?.orders??[]).map(copiedOrder),
      repeat:game.lifecycle?.getRepeatOrder(room.id)?.plan??null};
  });
  return Object.freeze({
    home:Object.freeze({layer:game.layer,tool:ui.tool,
      speed:game.clock?.speed??1,seed:game.world?.seedLabel??'',
      population:game.population,maxPopulation:LIFE.maxPopulation,
      resources:Object.freeze({carbs:inventory.carbs??0,protein:inventory.protein??0,
        water:inventory.water??0}),
      selected:copyTile(ui.selection),selectedAntId:ui.selectedAntId??null,
      targeting:!!combatControls?.targeting,
      timeTicks:game.clock?.ticks??0,
      timeLabel:formatGameTime(game.clock),
      weather:{kind:game.weather?.kind??'clear',
        remainingTicks:game.weather?.remainingTicks??null},
      milestones:game.milestones?.getSnapshot?.()??null}),
    ants:Object.freeze({population:game.population,capacity:LIFE.maxPopulation,
      queen:queen?copyAnt(queen,game):null,workers}),
    military:Object.freeze({squads:report,selectedSquad:combatControls?.selectedSquad??'A',
      targeting:!!combatControls?.targeting,enemyCount:game.combat?.enemies?.length??0,
      queenHP:game.combat?.queenHP??null,
      queenHPMax:48}),
    nursery:Object.freeze({selectedRoomId:ui.nurseryRoomId??null,
      rooms:nursery,eggCount:game.lifecycle?.eggOrders?.length??0,
      broodCount:game.lifecycle?.brood?.length??0,
      totalPopulation:game.lifecycle?.totalPopulation??game.population,
      maxPopulation:LIFE.maxPopulation}),
    rooms:Object.freeze({items:rooms,
      catalog:Object.entries(ROOM_CATALOG).filter(([type])=>type!=='queen')
        .map(([type,r])=>({type,name:r.name,width:r.width,height:r.height})),
      limits:{...ROOM_LIMITS},
      // Legacy UI still owns pointer gestures and exactly-once map commits.
      canvas:{digPreview:copyRect(ui.digPreview),
        digSelection:copyRect(ui.digSelection),
        roomPreview:ui.roomPreview?{...copyRect(ui.roomPreview),dragging:!!ui.roomPreview.dragging}:null,
        roomType:ui.renderer?.canvas?.ownerDocument?.getElementById?.('room-type')?.value??null}}),
    research:makeResearchView(game),
    settings:Object.freeze({seed:game.world?.seedLabel??''})
  });
}
export class UIRenovationAdapter {
  constructor({ui,combatControls,overlay}) {
    if(!ui||!overlay)throw new TypeError('Game UI and overlay required');
    this.ui=ui;this.combatControls=combatControls;this.overlay=overlay;
    this.listeners=new Set();this.pendingReset=null;this.resetSequence=0;
    this.actions=Object.freeze({
      switchLayer:layer=>this.switchLayer(layer),
      toggleLayer:()=>this.switchLayer(this.ui.game.layer===SURFACE?UNDERGROUND:SURFACE),
      setTool:tool=>this.setTool(tool),
      setSpeed:speed=>this.setSpeed(speed),
      zoom:factor=>this.zoom(factor),recenter:()=>this.recenter(),
      focusAnt:id=>this.focusAnt(id),
      selectSquad:id=>this.selectSquad(id),
      setSquadMode:(id,mode)=>this.squadMode(id,mode),
      setSquadRally:(id,tile)=>this.squadRally(id,tile),
      transferSoldier:(id,to)=>this.transferSoldier(id,to),
      startRally:()=>this.startRally(),cancelTargeting:()=>this.cancelTargeting(),
      nurseryCost:(profession,level)=>this.ui.game.lifecycle.eggCost(profession,level),
      queueEgg:(roomId,profession,level)=>this.queueEgg(roomId,profession,level),
      cancelEgg:id=>this.cancelEgg(id),
      setRepeatOrder:(roomId,profession,level,enabled)=>this.setRepeatOrder(roomId,profession,level,enabled),
      startResearch:id=>this.startResearch(id),
      cancelResearch:()=>this.cancelResearch(),
      roomPlan:(type,width,height)=>roomPlan(type,width,height),
      validateRoom:(type,x,y,w,h)=>this.ui.game.rooms.validate(type,x,y,w,h),
      queueRoom:(type,x,y,w,h)=>this.queueRoom(type,x,y,w,h),
      cancelRoom:id=>this.cancelRoom(id),
      // G3 shared map-gesture bridge, never reimplement pointer handlers in features.
      selectRoomType:type=>this.selectRoomType(type),
      clearDigSelection:()=>this.clearDigSelection(),
      applySelectedDig:cancel=>this.applySelectedDig(cancel),
      inspectDig:(from,to)=>this.ui.game.colony.inspectRectangle(from,to),
      queueDig:(from,to)=>this.dig(from,to,false),
      cancelDig:(from,to)=>this.dig(from,to,true),
      requestWorldReset:seed=>this.requestWorldReset(seed),
      confirmWorldReset:token=>this.confirmWorldReset(token),
      cancelWorldReset:()=>this.cancelWorldReset()
    });
  }
  get view(){return makeGameView(this.ui.game,this.ui,this.combatControls);}
  subscribe(callback,{immediate=true}={}){
    if(typeof callback!=='function')throw new TypeError('Callback required');
    this.listeners.add(callback);
    if(immediate)callback(this.view);
    return()=>this.listeners.delete(callback);
  }
  notify(){if(this.listeners.size){const snap=this.view;for(const fn of [...this.listeners])fn(snap);}}
  dispose(){this.listeners.clear();this.cancelWorldReset();}
  _after(value){this.notify();return value;}
  switchLayer(layer){
    if(![SURFACE,UNDERGROUND].includes(layer))return fail('INVALID_LAYER');
    this.ui.switchLayer(layer);
    this.overlay.setWorldMode(this.combatControls?.targeting?'rally':this.ui.tool);
    return this._after({ok:true,layer:this.ui.game.layer});
  }
  setTool(tool){
    if(!['inspect','dig','room'].includes(tool))return fail('INVALID_TOOL');
    if(tool!=='inspect'&&this.ui.game.layer!==UNDERGROUND)return fail('UNDERGROUND_ONLY');
    this.ui.setTool(tool);
    this.overlay.setWorldMode(this.combatControls?.targeting?'rally':this.ui.tool);
    return this._after({ok:true,tool:this.ui.tool});
  }
  setSpeed(speed){
    if(![0,1,2,4].includes(speed))return fail('INVALID_SPEED');
    this.ui.changeSpeed(speed);return this._after({ok:true,speed:this.ui.game.clock.speed});
  }
  zoom(factor){
    if(!Number.isFinite(factor)||factor<=0)return fail('INVALID_ZOOM');
    this.ui.zoom(factor);return this._after({ok:true});
  }
  recenter(){this.ui.recenter();return this._after({ok:true});}
  focusAnt(id){
    const ant=antById(this.ui.game,id);if(!ant)return fail('ANT_NOT_FOUND');
    if(this.ui.game.layer!==ant.layer){
      this.ui.switchLayer(ant.layer);
      this.overlay.setWorldMode(this.combatControls?.targeting?'rally':this.ui.tool);
    }
    const camera=this.ui.cameras[ant.layer];
    camera.x=(ant.x+.5)*TILE;camera.y=(ant.y+.5)*TILE;
    camera.clamp(this.ui.game.currentLayer,...this.ui.dimensions());
    this.ui.select({layer:ant.layer,x:ant.x,y:ant.y},ant.id);
    return this._after({ok:true,id:ant.id});
  }
  selectSquad(id){
    if(!['A','B'].includes(id))return fail('INVALID_SQUAD');
    if(!this.combatControls)return fail('NO_TACTICAL_CONTROLLER');
    if(!this.combatControls.selectSquad(id))return fail('SQUAD_SELECTION_REJECTED');
    return this._after({ok:true,id});
  }
  squadMode(id,mode){
    const r=this.ui.game.combat.setSquadMode(id,mode);
    if(r.ok){this.combatControls?.cancelRally();this.combatControls?.update(true);
      this.overlay.setWorldMode(this.ui.tool);}
    return this._after(r);
  }
  squadRally(id,tile){
    if(!tile)return fail('INVALID_RALLY');
    const r=this.ui.game.combat.setSquadRally(id,tile.layer,tile.x,tile.y);
    if(r.ok){this.combatControls?.cancelRally();this.combatControls?.update(true);
      this.overlay.setWorldMode(this.ui.tool);}
    return this._after(r);
  }
  transferSoldier(id,to){return this._after(this.ui.game.combat.transferSoldier(id,to));}
  startRally(){
    if(!this.combatControls)return fail('NO_TACTICAL_CONTROLLER');
    if(!this.combatControls.armRally())return fail('RALLY_START_REJECTED');
    this.overlay.setWorldMode('rally');
    return this._after({ok:true});
  }
  cancelTargeting(){
    this.combatControls?.cancelRally();
    this.overlay.setWorldMode(this.ui.tool);
    return this._after({ok:true});
  }
  queueEgg(roomId,profession,level){
    const x=this.ui.game.lifecycle.queueEgg(roomId,profession,level);
    this.ui.refreshNursery();return this._after(x);
  }
  cancelEgg(id){
    const ok=this.ui.game.lifecycle.cancelEgg(id);
    this.ui.refreshNursery();return this._after(ok?{ok:true}:fail('EGG_NOT_CANCELLABLE'));
  }
  setRepeatOrder(roomId,profession,level,enabled){
    const result=this.ui.game.lifecycle.setRepeatOrder(roomId,profession,level,enabled);
    this.ui.refreshNursery();return this._after(result);
  }
  startResearch(id){
    const research=this.ui.game.research;
    return this._after(research ? research.start(id) : fail('INTERNAL_INVARIANT_ERROR'));
  }
  cancelResearch(){
    const research=this.ui.game.research;
    if(!research)return this._after(fail('INTERNAL_INVARIANT_ERROR'));
    const runId=research.snapshot().active?.runId;
    if(runId==null)return this._after(fail('NO_ACTIVE_RESEARCH'));
    return this._after(research.cancel(runId));
  }
  queueRoom(type,x,y,width,height){
    const r=this.ui.game.rooms.queue(type,x,y,width,height);
    return this._after(r);
  }
  cancelRoom(id){
    const ok=this.ui.game.rooms.cancel(id);
    return this._after(ok?{ok:true}:fail('ROOM_NOT_CANCELLABLE'));
  }
  selectRoomType(type){
    if(!Object.hasOwn(ROOM_CATALOG,type)||type==='queen')return fail('INVALID_ROOM_TYPE');
    const doc=this.ui.renderer?.canvas?.ownerDocument;
    const picker=doc?.getElementById?.('room-type');
    if(!picker || !Array.from(picker.options??[]).some(x=>x.value===type))return fail('ROOM_PICKER_UNAVAILABLE');
    if(picker.value!==type){
      picker.value=type;
      const EventType=doc?.defaultView?.Event;
      if(EventType)picker.dispatchEvent(new EventType('change',{bubbles:true}));
      else this.ui.updateRoomCost?.();
    }
    return this._after({ok:true,type});
  }
  clearDigSelection(){
    this.ui.clearDigSelection();
    return this._after({ok:true});
  }
  applySelectedDig(cancel=false){
    if(!this.ui.digSelection)return fail('NO_DIG_SELECTION');
    // UI is sole command owner; do not call colony.queue/cancel a second time.
    const data=this.ui.applyDigSelection(!!cancel);
    return this._after({ok:true,data});
  }
  dig(from,to,cancel){
    if(!from||!to)return fail('INVALID_DIG_RECT');
    const r=cancel?this.ui.game.colony.cancelRectangle(from,to):
      this.ui.game.colony.queueRectangle(from,to);
    return this._after({ok:true,data:r});
  }
  requestWorldReset(seed){
    // Match input.maxLength and URL seed .slice(0,40): JavaScript UTF-16 code units.
    if(typeof seed!=='string'||!seed.trim()||seed.trim().length>40)
      return fail('INVALID_SEED');
    const token=++this.resetSequence;
    this.pendingReset={token,seed:seed.trim()};
    return {ok:true,requiresConfirmation:true,token,seed:this.pendingReset.seed};
  }
  cancelWorldReset(){this.pendingReset=null;return {ok:true};}
  confirmWorldReset(token){
    if(!this.pendingReset||token!==this.pendingReset.token)return fail('RESET_NOT_CONFIRMED');
    const {seed}=this.pendingReset;this.pendingReset=null;
    // Prevent stale handlers from using an old Game after the callback swaps it.
    this.cancelTargeting();
    this.overlay.closeAll('world-reset');
    this.ui.setTool('inspect');this.ui.select(null);
    this.ui.onNewWorld(seed);
    // The world swap is synchronous, so military selection and the U6
    // authoritative controller must reset in the SAME transaction. Without
    // this, _after() publishes a mixed snapshot: new Game + old Squad B tab
    // until the next periodic HUD frame happens to call update().
    this.combatControls?.update(true);
    this.overlay.setWorldMode('inspect');
    this.ui.updateWorld();
    return this._after({ok:true,seed});
  }
}
