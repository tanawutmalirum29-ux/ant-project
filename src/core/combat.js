import { SURFACE, UNDERGROUND, portalAt } from '../world/generate.js';
import { findPath, isWalkable, reachablePaths } from '../world/navigation.js';
import { WORKER_SPEED } from './colony.js';
import { createRandom } from './random.js';

export const COMBAT = Object.freeze({
  soldierHP: 16, workerHP: 7, queenHP: 48, soldierDamage: 4,
  soldierCooldown: 8, enemyCooldown: 12, spawnInterval: 480, firstNaturalThreat: 3600,
  maxEnemies: 5, healInterval: 70, alertRadius: 8
});
export const ENEMIES = Object.freeze({
  beetle: Object.freeze({hp: 18, attack: 2, speed: 0.23, name: 'ด้วงนักล่า'}),
  raider: Object.freeze({hp: 12, attack: 2, speed: 0.33, name: 'มดรุกราน'})
});
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const stateOf=ant=>ant.state||'idle';
const FORMATION_RADIUS=8;
const FORMATION_PATH_LIMIT=12;
const FORMATION_LEGACY=Object.freeze([[0,0],[1,0],[-1,0],[0,1],[0,-1],
  [1,1],[-1,-1],[1,-1],[-1,1],[2,0],[-2,0],[0,2],[0,-2]]);
const FORMATION_DIRECTIONS=[[0,-1],[1,0],[0,1],[-1,0]];
const formationKey=g=>g.layer+':'+g.x+','+g.y;
const sameGoal=(a,b)=>a===b||!!(a&&b&&a.layer===b.layer&&same(a,b));

/** Fixed-tick deterministic combat. Enemies and defenders always move on the real walkable grid. */
export class Combat {
  constructor(world,colony,foraging,lifecycle,rooms) {
    this.world=world;this.colony=colony;this.foraging=foraging;
    this.lifecycle=lifecycle;this.rooms=rooms;
    this.enemies=[];this.nextEnemyId=1;this.tickCount=0;
    this.soldierSlots=1;this.mode='defend';this.rally=null;
    this._formation=null;this._formationDirty=true;this._allocating=false;
    this.spawned=0;this.defeated=0;this.casualties=0;this.portalCrossings=0;
    this.queenHP=COMBAT.queenHP;
    this.rng=createRandom(world.seed^0x6c0b47);
    this.lastEvent='มดทหารประจำการพร้อม';
    this.allocate();
  }
  get soldiers(){return this.colony.workers.filter(a=>a.combatRole==='soldier');}
  get threatCount(){return this.enemies.length;}
  get availableRecruits(){return this.colony.workers.filter(a=>this.canRecruit(a));}
  canRecruit(a){return this.colony.workers.includes(a)&&!a.combatRole&&a.layer===UNDERGROUND&&!this.colony.isForager(a)&&a.orderId==null&&['idle','room-rest','room-guard'].includes(stateOf(a));}
  recruit(a){
    if(!this.canRecruit(a))return false;
    if(a.state==='room-rest')this.rooms?.releaseRestWorker(a);
    if(a.state==='room-guard')this.rooms?.release(a);
    a.combatRole='soldier';a.combatHP??=COMBAT.soldierHP;a.combatCooldown=0;
    a.retreating=false;a.combatGoal=null;a.state='combat-guard';a.path=[];a.next=null;a.motion=0;
    this.soldierSlots=Math.max(this.soldierSlots,this.soldiers.length);
    this._formationDirty=true;
    if(!this._allocating){this.workforce?.disableAuto('soldier');this.ensureFormation();}
    return true;
  }
  demobilize(a){
    if(!this.soldiers.includes(a))return false;
    this.workforce?.disableAuto('soldier');
    this.soldierSlots=Math.max(0,this.soldiers.length-1);
    this.releaseSoldier(a);this.ensureFormation();return true;
  }

  raiseAlarm(){
    const result=this.spawn(this.rng.next()<.6?'beetle':'raider');
    if(result)this.lastEvent='ตรวจพบศัตรูที่ผิวดิน';
    return result;
  }
  setSoldierSlots(amount,fromPolicy=false){
    if(!Number.isInteger(amount)||amount<0||amount>this.colony.workers.length)throw new RangeError('Invalid soldier count');
    if(!fromPolicy)this.workforce?.disableAuto('soldier');
    this.soldierSlots=amount;
    this.allocate();
    return this.soldiers.length;
  }
  setMode(mode){
    if(!['defend','rally','retreat'].includes(mode))throw new RangeError('Unknown battle command');
    this.mode=mode;
    if(mode==='rally')this.ensureFormation();
    return mode;
  }
  setRally(layer,x,y){
    if(![SURFACE,UNDERGROUND].includes(layer)||!Number.isInteger(x)||!Number.isInteger(y)||
      !this.world.layers[layer]||!isWalkable(this.world.layers[layer],x,y))return false;
    const origin=layer===UNDERGROUND?this.colony.queen:this.world.entrances[0].surface;
    // Reject before mutating rally, mode or any in-flight soldier motion.
    if(!findPath(this.world.layers[layer],origin,{x,y}))return false;
    const changed=!this.rally||this.rally.layer!==layer||this.rally.x!==x||this.rally.y!==y;
    this.rally={layer,x,y};this.mode='rally';
    this.lastEvent=`กำลังพลเคลื่อนสู่จุดรวมพล ${x},${y}`;
    // Keep an emergency interception in motion: a rally order may be stored,
    // but must not pull defenders away from an actively threatened queen.
    if(!this.queenThreat())for(const a of this.soldiers)this.clearMotion(a);
    if(changed)this._formationDirty=true;
    this.ensureFormation();
    return true;
  }
  /** Bounded 4-neighbor BFS. No slot may be outside R8 or beyond twelve steps. */
  buildFormationSlots(){
    const center=this.rally, map=this.world.layers[center.layer];
    const positions=new Map(), queue=[{x:center.x,y:center.y,d:0}];
    const coordinate=(x,y)=>x+','+y;
    positions.set(coordinate(center.x,center.y),queue[0]);
    for(let head=0;head<queue.length;head++){
      const p=queue[head];
      if(p.d===FORMATION_PATH_LIMIT)continue;
      for(const [dx,dy] of FORMATION_DIRECTIONS){
        const x=p.x+dx,y=p.y+dy,k=coordinate(x,y);
        if(positions.has(k)||Math.max(Math.abs(x-center.x),Math.abs(y-center.y))>FORMATION_RADIUS||
           !isWalkable(map,x,y))continue;
        const next={x,y,d:p.d+1};
        positions.set(k,next);queue.push(next);
      }
    }
    const preferred=[],used=new Set();
    for(const [dx,dy] of FORMATION_LEGACY){
      const key=coordinate(center.x+dx,center.y+dy);
      if(positions.has(key)){preferred.push(positions.get(key));used.add(key);}
    }
    const extras=queue.filter(p=>!used.has(coordinate(p.x,p.y)))
      .sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
    return [...preferred,...extras].map(p=>({layer:center.layer,x:p.x,y:p.y}));
  }
  /** Cache geometry and connectivity; only roster/world/rally/finished digs may rebuild it. */
  ensureFormation(){
    if(!this.rally)return null;
    const soldiers=this.soldiers;
    const roster=soldiers.map(a=>String(a.id)).sort().join('|');
    const centerKey=formationKey(this.rally);
    const prev=this._formation;
    const geometryChanged=!prev||prev.world!==this.world||
      prev.layerMap!==this.world.layers[this.rally.layer]||prev.centerKey!==centerKey||
      prev.completed!==this.colony.completed;
    if(!this._formationDirty&&!geometryChanged&&prev.roster===roster&&
       prev.soldiers.length===soldiers.length&&
       soldiers.every(a=>prev.goals.has(a)))return prev;
    const slots=geometryChanged?this.buildFormationSlots():prev.slots;
    // Full-map connectivity BFS is for physical reachability only; slot enumeration
    // above remains strictly bounded to the R8 / D12 formation footprint.
    const centerReach=geometryChanged?reachablePaths(this.world.layers[this.rally.layer],this.rally):prev.centerReach;
    const portal=this.world.entrances[0];
    const otherLayer=this.rally.layer===UNDERGROUND?SURFACE:UNDERGROUND;
    const sourceMap=this.world.layers[otherLayer];
    const portalValid=!!(portal&&sourceMap&&portal[otherLayer]&&portal[this.rally.layer]&&
      isWalkable(sourceMap,portal[otherLayer].x,portal[otherLayer].y)&&
      isWalkable(this.world.layers[this.rally.layer],portal[this.rally.layer].x,portal[this.rally.layer].y)&&
      centerReach?.distance(portal[this.rally.layer].x,portal[this.rally.layer].y)>=0);
    const portalReach=portalValid?
      (geometryChanged||!prev||prev.portalSourceMap!==sourceMap?
        reachablePaths(sourceMap,portal[otherLayer]):prev.portalReach):null;
    const eligible=ant=>{
      const map=this.world.layers[ant.layer];
      if(!map||!isWalkable(map,ant.x,ant.y))return false;
      if(ant.layer===this.rally.layer)return (centerReach?.distance(ant.x,ant.y)??-1)>=0;
      return ant.layer===otherLayer&&!!portalReach&&portalReach.distance(ant.x,ant.y)>=0;
    };
    const goals=new Map(),statuses=new Map(),reserved=new Set();
    const reachable=new Map(soldiers.map(a=>[a,eligible(a)]));
    const validSlot=new Set(slots.map(formationKey));
    // Reserve unchanged goals first, independent of incidental worker-array order.
    if(prev&&prev.world===this.world&&prev.centerKey===centerKey){
      for(const ant of soldiers){
        const existing=prev.goals.get(ant),key=existing&&formationKey(existing);
        if(reachable.get(ant)&&key&&validSlot.has(key)&&!reserved.has(key)){
          goals.set(ant,existing);statuses.set(ant,'Assigned');reserved.add(key);
        }
      }
    }
    const sorted=[...soldiers].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
    let nextIndex=0;
    for(const ant of sorted){
      if(goals.has(ant))continue;
      if(!reachable.get(ant)){
        goals.set(ant,null);statuses.set(ant,'Unreachable');continue;
      }
      while(nextIndex<slots.length&&reserved.has(formationKey(slots[nextIndex])))nextIndex++;
      const goal=nextIndex<slots.length?slots[nextIndex++]:null;
      goals.set(ant,goal);statuses.set(ant,goal?'Assigned':'Standby');
      if(goal)reserved.add(formationKey(goal));
    }
    // A new null/different rally reservation cannot complete an old rally step.
    if(prev){
      for(const ant of soldiers){
        if(!sameGoal(prev.goals.get(ant),goals.get(ant))&&ant.state==='combat-rally'&&
           !ant.retreating)this.clearMotion(ant);
      }
    }
    this._formation={world:this.world,layerMap:this.world.layers[this.rally.layer],
      portalSourceMap:sourceMap,centerKey,completed:this.colony.completed,roster,
      soldiers,slots,centerReach,portalReach,goals,statuses};
    this._formationDirty=false;
    return this._formation;
  }
  getRallyGoal(ant){
    if(!ant||ant.combatRole!=='soldier'||!this.colony.workers.includes(ant)||!this.rally)return null;
    return this.ensureFormation().goals.get(ant)??null;
  }
  /** Observable status of a reserved goal (or lack of one), without changing world state. */
  getFormationStatus(ant){
    if(!ant||ant.combatRole!=='soldier'||!this.colony.workers.includes(ant)||!this.rally)return null;
    return this.ensureFormation().statuses.get(ant)??null;
  }
  get ralliedCount(){
    if(this.mode!=='rally'||!this.rally)return 0;
    const formation=this.ensureFormation();
    return this.soldiers.filter(a=>{
      const g=formation.goals.get(a);
      return g&&a.layer===g.layer&&same(a,g)&&!a.next&&!a.retreating&&
        (a.combatHP||0)>Math.ceil(COMBAT.soldierHP*.3)&&
        !['combat-intercept','combat-attack','combat-retreat'].includes(a.state);
    }).length;
  }
  releaseSoldier(ant){
    if(ant.combatRole!=='soldier')return;
    delete ant.combatRole;delete ant.combatCooldown;
    delete ant.combatGoal;delete ant.retreating;
    ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;
    this._formationDirty=true;
    if(!this._allocating)this.ensureFormation();
  }
  allocate(){
    this._allocating=true;
    try{
      const soldiers=this.soldiers;
      // Never steal existing workers in a dig, forage, nursery or construction job.
      // Queen rescue remains above normal workforce downsizing.
      if(!this.queenThreat())for(const ant of soldiers.slice(this.soldierSlots))this.releaseSoldier(ant);
      let missing=this.soldierSlots-this.soldiers.length;
      if(missing>0)for(const ant of this.colony.workers){
        if(missing===0)break;
        if(this.recruit(ant))missing--;
      }
    }finally{this._allocating=false;}
    this.ensureFormation();
  }
  /** Testable manual spawn and deterministic scheduled spawn. Never create an enemy on solid terrain. */
  spawn(type='beetle',layer=SURFACE,x=null,y=null) {
    const def=ENEMIES[type];if(!def||!this.world.layers[layer]||this.enemies.length>=COMBAT.maxEnemies)return null;
    const entry=this.world.entrances[0][layer];const map=this.world.layers[layer];
    if(x==null||y==null){
      const candidates=[];
      for(let radius=11;radius<=20;radius++)for(let dy=-radius;dy<=radius;dy++)for(const dx of [-radius,radius]){
        for(const [tx,ty] of [[entry.x+dx,entry.y+dy],[entry.x+dy,entry.y+dx]]){
          if(isWalkable(map,tx,ty))candidates.push({x:tx,y:ty});
        }
      }
      for(let i=0;i<40&&candidates.length;i++){
        const candidate=candidates[this.rng.int(0,candidates.length-1)];
        if(findPath(map,candidate,entry)){x=candidate.x;y=candidate.y;break;}
      }
    }
    if(!isWalkable(map,x,y)||!findPath(map,{x,y},entry))return null;
    const enemy={id:`enemy-${this.nextEnemyId++}`,type,layer,x,y,hp:def.hp,maxHP:def.hp,
      state:'approach',next:null,path:[],motion:0,goal:null,cooldown:0};
    this.enemies.push(enemy);this.spawned++;
    this.lastEvent=`${def.name} ปรากฏใกล้รัง`;
    return enemy;
  }
  clearMotion(unit){unit.next=null;unit.path=[];unit.motion=0;unit.goal=null;}
  walk(unit,layer,goal,speed){
    const map=this.world.layers[layer];
    if(!isWalkable(map,unit.x,unit.y)||!isWalkable(map,goal.x,goal.y))return false;
    if(same(unit,goal)){this.clearMotion(unit);return true;}
    const key=`${layer}:${goal.x},${goal.y}`;
    if(unit.goal!==key){this.clearMotion(unit);unit.goal=key;}
    if(!unit.next&&!unit.path.length){
      const route=findPath(map,unit,goal);
      if(!route)return false;
      unit.path=route;
    }
    if(!unit.next){
      const next=unit.path[0];
      if(!next||distance(unit,next)!==1||!isWalkable(map,next.x,next.y)){this.clearMotion(unit);return false;}
      unit.next=next;unit.motion=0;
      unit.facing=next.x>unit.x?1:next.x<unit.x?3:next.y>unit.y?2:0;
    }
    if(!isWalkable(map,unit.next.x,unit.next.y)){this.clearMotion(unit);return false;}
    unit.motion+=speed;
    if(unit.motion>=1){unit.x=unit.next.x;unit.y=unit.next.y;unit.path.shift();unit.next=null;unit.motion=0;}
    return same(unit,goal)&&!unit.next;
  }
  crossPortal(unit,destinationLayer){
    if(unit.layer===destinationLayer)return true;
    const entrance=portalAt(this.world,unit.layer,unit.x,unit.y);
    if(!entrance)return false;
    const other=entrance[destinationLayer];
    if(!other||!isWalkable(this.world.layers[destinationLayer],other.x,other.y))return false;
    unit.layer=destinationLayer;unit.x=other.x;unit.y=other.y;
    this.clearMotion(unit);this.portalCrossings++;
    return true;
  }
  findGuardStation(){
    const station=this.rooms?.rooms.find(r=>r.type==='guard'&&r.status==='ready'&&r.connected);
    return station?{x:station.x,y:station.y,layer:UNDERGROUND}:{...this.world.entrances[0].underground,layer:UNDERGROUND};
  }
  findRecovery(){
    const station=this.rooms?.rooms.find(r=>r.type==='rest'&&r.status==='ready'&&r.connected);
    return station?{x:station.x,y:station.y,layer:UNDERGROUND}:{x:this.colony.queen.x,y:this.colony.queen.y,layer:UNDERGROUND};
  }
  /** A nest intruder already within striking distance of the queen overrides all orders. */
  queenThreat() {
    const queen=this.colony.queen;
    if(!queen?.alive)return null;
    let closest=null;
    for(const enemy of this.enemies){
      if(enemy.layer!==UNDERGROUND||distance(enemy,queen)>1)continue;
      if(!closest||distance(enemy,queen)<distance(closest,queen)||
         (distance(enemy,queen)===distance(closest,queen)&&String(enemy.id)<String(closest.id)))
        closest=enemy;
    }
    return closest;
  }
  chooseThreat(soldier){
    if(!this.enemies.length)return null;
    // Defend the queen and tunnel entrance, but intercept threats already adjacent to soldiers first.
    const immediate=this.enemies.filter(e=>e.layer===soldier.layer&&distance(e,soldier)<=COMBAT.alertRadius);
    if(immediate.length)return immediate.sort((a,b)=>distance(a,soldier)-distance(b,soldier))[0];
    const queen=this.colony.queen;
    const threats=[...this.enemies].sort((a,b)=>
      (a.layer===UNDERGROUND?0:30)+distance(a,queen)-(b.layer===UNDERGROUND?0:30)-distance(b,queen));
    return threats[0];
  }
  soldierTick(ant){
    if(!this.colony.workers.includes(ant))return;
    ant.combatCooldown=Math.max(0,(ant.combatCooldown||0)-1);
    // Queen survival is above rally, standing orders, and even ordinary retreat.
    // Both nest guards and troops on the surface return immediately when a
    // hostile unit reaches the queen's own tile or an adjacent tile.
    const queenEmergency=this.queenThreat();
    const wounded=(ant.combatHP||0)<=Math.ceil(COMBAT.soldierHP*.3);
    const withdrawing=!queenEmergency&&(this.mode==='retreat'||wounded);
    ant.retreating=withdrawing;
    let destination=null;
    const threat=queenEmergency||(withdrawing?null:this.mode==='rally'?
      this.enemies.filter(e=>e.layer===ant.layer&&distance(e,ant)<=COMBAT.alertRadius).sort((a,b)=>distance(a,ant)-distance(b,ant))[0]||null:this.chooseThreat(ant));
    if(threat){
      if(threat.layer===ant.layer&&distance(threat,ant)<=1){
        ant.state='combat-attack';this.clearMotion(ant);
        if(ant.combatCooldown===0){
          threat.hp-=COMBAT.soldierDamage;ant.combatCooldown=COMBAT.soldierCooldown;
          if(threat.hp<=0){this.enemies.splice(this.enemies.indexOf(threat),1);this.defeated++;this.lastEvent='มดทหารกำจัดผู้บุกรุกแล้ว';}
        }
        return;
      }
      destination={layer:threat.layer,x:threat.x,y:threat.y};
      ant.state=queenEmergency?'combat-queen-defense':'combat-intercept';
    } else if(withdrawing){destination=this.findRecovery();ant.state='combat-retreat';}
    else if(this.mode==='rally'&&this.rally){
      destination=this.getRallyGoal(ant);
      if(!destination){
        // No current threat/retreat remains in this branch; cancel stale rally/guard steps.
        if(ant.next||ant.path?.length||ant.goal)this.clearMotion(ant);
        ant.state=this.getFormationStatus(ant)==='Unreachable'?'combat-unreachable':'combat-standby';
        return;
      }
      ant.state='combat-rally';
    }
    else {destination=this.findGuardStation();ant.state='combat-guard';}
    if(ant.layer!==destination.layer){
      const portal=this.world.entrances[0]?.[ant.layer];
      if(!portal)return;
      if(same(ant,portal)&&!ant.next){this.crossPortal(ant,destination.layer);return;}
      this.walk(ant,ant.layer,portal,WORKER_SPEED*1.15);return;
    }
    this.walk(ant,ant.layer,destination,WORKER_SPEED*1.15);
    if(withdrawing&&ant.layer===UNDERGROUND&&same(ant,destination)&&this.tickCount%COMBAT.healInterval===0){
      ant.combatHP=Math.min(COMBAT.soldierHP,ant.combatHP+2);
    }
  }
  enemyTick(enemy){
    enemy.cooldown=Math.max(0,enemy.cooldown-1);
    const nearby=this.colony.workers.filter(a=>a.layer===enemy.layer&&distance(a,enemy)<=1);
    nearby.sort((a,b)=>(a.combatRole==='soldier'?0:1)-(b.combatRole==='soldier'?0:1)||distance(a,enemy)-distance(b,enemy));
    const q=this.colony.queen;
    const target=nearby[0]||(q.alive&&q.layer===enemy.layer&&distance(q,enemy)<=1?q:null);
    if(target){
      enemy.state='attack';this.clearMotion(enemy);
      if(enemy.cooldown===0){
        enemy.cooldown=COMBAT.enemyCooldown;
        if(target.caste==='queen'){
          this.queenHP=Math.max(0,this.queenHP-ENEMIES[enemy.type].attack);
          if(this.queenHP===0){q.alive=false;this.lifecycle.lastEvent='นางพญาถูกศัตรูโจมตีจนตาย';this.lastEvent='รังสูญเสียนางพญา';}
        } else {
          if(target.combatRole==='soldier')target.combatHP-=ENEMIES[enemy.type].attack;
          else target.combatHP=(target.combatHP??COMBAT.workerHP)-ENEMIES[enemy.type].attack;
          if(target.combatHP<=0){
            this.lifecycle.killWorker(target);this.casualties++;
            this.lastEvent='มดถูกผู้บุกรุกโจมตีตาย';
          }
        }
      }
      return;
    }
    enemy.state='approach';
    const destination=this.world.entrances[0][enemy.layer];
    if(enemy.layer===SURFACE){
      if(same(enemy,destination)&&!enemy.next){this.crossPortal(enemy,UNDERGROUND);return;}
      this.walk(enemy,SURFACE,destination,ENEMIES[enemy.type].speed);
    }else if(q.alive){this.walk(enemy,UNDERGROUND,q,ENEMIES[enemy.type].speed);}
    else {const nearest=this.colony.workers.filter(w=>w.layer===UNDERGROUND).sort((a,b)=>distance(a,enemy)-distance(b,enemy))[0];
      if(nearest)this.walk(enemy,UNDERGROUND,nearest,ENEMIES[enemy.type].speed);
    }
  }
  tick(){
    this.tickCount++;
    this.allocate();
    if(this.tickCount>=COMBAT.firstNaturalThreat && (this.tickCount-COMBAT.firstNaturalThreat)%COMBAT.spawnInterval===0) this.spawn(this.rng.next()<.65?'beetle':'raider');
    for(const ant of [...this.soldiers])this.soldierTick(ant);
    for(const enemy of [...this.enemies])if(this.enemies.includes(enemy))this.enemyTick(enemy);
  }
}
