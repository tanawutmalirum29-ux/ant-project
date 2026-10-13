import { SURFACE, UNDERGROUND, portalAt } from '../world/generate.js';
import { findPath, isWalkable } from '../world/navigation.js';
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

/** Fixed-tick deterministic combat. Enemies and defenders always move on the real walkable grid. */
export class Combat {
  constructor(world,colony,foraging,lifecycle,rooms) {
    this.world=world;this.colony=colony;this.foraging=foraging;
    this.lifecycle=lifecycle;this.rooms=rooms;
    this.enemies=[];this.nextEnemyId=1;this.tickCount=0;
    this.soldierSlots=0;this.mode='defend';this.rally=null;
    this.spawned=0;this.defeated=0;this.casualties=0;this.portalCrossings=0;
    this.queenHP=COMBAT.queenHP;
    this.rng=createRandom(world.seed^0x6c0b47);
    this.lastEvent='เขตป้องกันพร้อม';
  }
  get soldiers(){return this.colony.workers.filter(a=>a.combatRole==='soldier');}
  get threatCount(){return this.enemies.length;}
  raiseAlarm(){
    const result=this.spawn(this.rng.next()<.6?'beetle':'raider');
    if(result)this.lastEvent='ตรวจพบศัตรูที่ผิวดิน';
    return result;
  }
  setSoldierSlots(amount){
    if(!Number.isInteger(amount)||amount<0||amount>this.colony.workers.length)throw new RangeError('Invalid soldier count');
    this.soldierSlots=amount;
    this.allocate();
    return this.soldiers.length;
  }
  setMode(mode){
    if(!['defend','rally','retreat'].includes(mode))throw new RangeError('Unknown battle command');
    this.mode=mode;return mode;
  }
  setRally(layer,x,y){
    if(![SURFACE,UNDERGROUND].includes(layer)||!Number.isInteger(x)||!Number.isInteger(y)||
      !isWalkable(this.world.layers[layer],x,y))return false;
    this.rally={layer,x,y};this.mode='rally';return true;
  }
  releaseSoldier(ant){
    if(ant.combatRole!=='soldier')return;
    delete ant.combatRole;delete ant.combatCooldown;
    delete ant.combatGoal;delete ant.retreating;
    ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;
  }
  allocate(){
    const soldiers=this.soldiers;
    // Never steal existing workers in a dig, forage, nursery or construction job.
    for(const ant of soldiers.slice(this.soldierSlots))this.releaseSoldier(ant);
    let missing=this.soldierSlots-this.soldiers.length;
    if(missing<=0)return;
    for(const ant of this.colony.workers) {
      if(missing===0)break;
      if(ant.combatRole||ant.layer!==UNDERGROUND||this.colony.isForager(ant)||ant.orderId!=null)continue;
      if(!['idle','room-rest','room-guard'].includes(stateOf(ant)))continue;
      if(stateOf(ant)==='room-rest')this.rooms?.releaseRestWorker(ant);
      if(stateOf(ant)==='room-guard')this.rooms?.release(ant);
      ant.combatRole='soldier';ant.combatHP??=COMBAT.soldierHP;ant.combatCooldown=0;
      ant.retreating=false;ant.combatGoal=null;
      ant.state='combat-guard';ant.path=[];ant.next=null;ant.motion=0;
      missing--;
    }
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
    const wounded=(ant.combatHP||0)<=Math.ceil(COMBAT.soldierHP*.3);
    const withdrawing=this.mode==='retreat'||wounded;
    ant.retreating=withdrawing;
    let destination=null;
    const threat=withdrawing?null:this.chooseThreat(ant);
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
      ant.state='combat-intercept';
    } else if(withdrawing){destination=this.findRecovery();ant.state='combat-retreat';}
    else if(this.mode==='rally'&&this.rally){destination=this.rally;ant.state='combat-rally';}
    else {destination=this.findGuardStation();ant.state='combat-guard';}
    if(ant.layer!==destination.layer){
      const portal=this.world.entrances[0][ant.layer];
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
