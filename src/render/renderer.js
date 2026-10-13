import { TERRAINS, SURFACE, UNDERGROUND, TILE, cellAt } from '../world/generate.js';
import { tileHash } from '../core/random.js';
import { ROOM_CATALOG } from '../core/rooms.js';
import { displayedPosition } from '../core/game.js';

const RALLY_PING_MS = 1500;
const ROOM_TICKS = type=>({queen:1,nursery:65,food_store:90,water_store:80,rest:60,guard:85})[type]||1;
const colors = {
  [TERRAINS.GRASS]: '#344d38', [TERRAINS.DIRT]: '#685039', [TERRAINS.THICKET]: '#1c382c',
  [TERRAINS.WATER]: '#284e58', [TERRAINS.STONE]: '#53574b',
  [TERRAINS.SOIL]: '#493729', [TERRAINS.HARD_SOIL]: '#34291f', [TERRAINS.ROCK]: '#242725',
  [TERRAINS.TUNNEL]: '#a27d52', [TERRAINS.CHAMBER]: '#b48c5d', [TERRAINS.ENTRANCE]: '#9b7350'
};
const labelFor = {
  [TERRAINS.GRASS]: 'ทุ่งหญ้า', [TERRAINS.DIRT]: 'พื้นดิน', [TERRAINS.THICKET]: 'พุ่มไม้',
  [TERRAINS.WATER]: 'แหล่งน้ำ', [TERRAINS.STONE]: 'ก้อนหิน',
  [TERRAINS.SOIL]: 'ดิน', [TERRAINS.HARD_SOIL]: 'ดินแข็ง', [TERRAINS.ROCK]: 'ชั้นหิน',
  [TERRAINS.TUNNEL]: 'อุโมงค์', [TERRAINS.CHAMBER]: 'ห้องในรัง', [TERRAINS.ENTRANCE]: 'ปากรัง'
};
export function terrainName(value) { return labelFor[value] ?? 'นอกแผนที่'; }
function clamp(a, min, max) { return Math.max(min, Math.min(max, a)); }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D unavailable');
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.lastSize = '';
    this.rallyPing = null;
  }
  showRallyPing(game, layer, x, y, startedAt = performance.now()) {
    this.rallyPing = { game, layer, x, y, startedAt };
  }
  resize() {
    const box = this.canvas.getBoundingClientRect();
    const width = Math.max(1, box.width), height = Math.max(1, box.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelW = Math.round(width * dpr), pixelH = Math.round(height * dpr);
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }
  render(game, camera, selection, elapsedMs, digPreview = null, roomPreview = null, roomType = null) {
    const { ctx, width, height, dpr } = this;
    const layer = game.currentLayer;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = game.layer === UNDERGROUND ? '#241d19' : '#24382d';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 - camera.x * camera.zoom, height / 2 - camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    const bounds = {
      x0: clamp(Math.floor((camera.x - width / (2 * camera.zoom)) / TILE) - 1, 0, layer.width - 1),
      x1: clamp(Math.ceil((camera.x + width / (2 * camera.zoom)) / TILE) + 1, 0, layer.width - 1),
      y0: clamp(Math.floor((camera.y - height / (2 * camera.zoom)) / TILE) - 1, 0, layer.height - 1),
      y1: clamp(Math.ceil((camera.y + height / (2 * camera.zoom)) / TILE) + 1, 0, layer.height - 1)
    };
    for (let y = bounds.y0; y <= bounds.y1; y++) {
      for (let x = bounds.x0; x <= bounds.x1; x++) this.drawTile(ctx, game, layer, x, y);
    }
    if (camera.zoom > .85) {
      ctx.strokeStyle = game.layer === UNDERGROUND ? '#0d0c0b16' : '#050d0b12';
      ctx.lineWidth = .5;
      ctx.beginPath();
      for (let x = bounds.x0; x <= bounds.x1 + 1; x++) { ctx.moveTo(x * TILE, bounds.y0 * TILE); ctx.lineTo(x * TILE, (bounds.y1 + 1) * TILE); }
      for (let y = bounds.y0; y <= bounds.y1 + 1; y++) { ctx.moveTo(bounds.x0 * TILE, y * TILE); ctx.lineTo((bounds.x1 + 1) * TILE, y * TILE); }
      ctx.stroke();
    }
    for (const entrance of game.world.entrances) {
      const p = entrance[game.layer];
      if (p.x >= bounds.x0 && p.x <= bounds.x1 && p.y >= bounds.y0 && p.y <= bounds.y1) this.drawEntrance(ctx, p, game.layer, elapsedMs);
    }
    if (game.layer === UNDERGROUND) {
      this.drawRooms(ctx,game,bounds,camera);
      this.drawOrders(ctx, game, bounds, camera);
      if (digPreview) this.drawDigPreview(ctx, game, digPreview, bounds, camera);
      if(roomPreview&&roomType)this.drawRoomPreview(ctx,game,roomPreview,roomType,camera);
    } else this.drawResources(ctx, game, bounds, elapsedMs);
    if(game.layer===UNDERGROUND && game.lifecycle) this.drawBrood(ctx, game);
    this.drawAnts(ctx, game, elapsedMs, camera);
    this.drawCombat(ctx, game, elapsedMs);
    if (selection?.layer === game.layer && cellAt(layer, selection.x, selection.y) != null) {
      ctx.fillStyle = '#f3c67f24';
      ctx.strokeStyle = '#efc685';
      ctx.lineWidth = 1.7 / camera.zoom;
      ctx.fillRect(selection.x * TILE, selection.y * TILE, TILE, TILE);
      ctx.strokeRect(selection.x * TILE + 1, selection.y * TILE + 1, TILE - 2, TILE - 2);
    }
    ctx.restore();
    // Gentle vignette; renderer is independent of the fixed simulation clock.
    const g = ctx.createRadialGradient(width / 2, height * .43, Math.min(width, height) * .12, width / 2, height / 2, Math.max(width, height) * .77);
    g.addColorStop(0, '#060c0800');
    g.addColorStop(1, '#050c0b70');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  drawRooms(ctx,game,bounds,camera) {
    if(!game.rooms)return;
    const shades={queen:'#e6cc96',nursery:'#f0a9c2',food_store:'#d8b35f',water_store:'#85d2db',rest:'#b4cba0',guard:'#dc9782'};
    for(const room of game.rooms.rooms) {
      if(room.x+room.width<bounds.x0||room.x>bounds.x1||room.y+room.height<bounds.y0||room.y>bounds.y1)continue;
      const x=room.x*TILE,y=room.y*TILE,w=room.width*TILE,h=room.height*TILE;
      const color=shades[room.type];
      ctx.save();ctx.globalAlpha=room.status==='disabled'?.22:room.status==='ready'?.64:.42;
      ctx.fillStyle=color;ctx.fillRect(x+2,y+2,w-4,h-4);
      ctx.strokeStyle=color;ctx.lineWidth=room.status==='ready'?2.5:1.5;
      ctx.setLineDash(room.status==='ready'?[]:[4,3]);ctx.strokeRect(x+2,y+2,w-4,h-4);ctx.setLineDash([]);
      ctx.globalAlpha=1;
      ctx.fillStyle='#181e19';ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(({queen:'Q',nursery:'N',food_store:'F',water_store:'W',rest:'R',guard:'G'})[room.type],x+w/2,y+h/2);
      const stored=room.stock?Object.values(room.stock).reduce((a,b)=>a+b,0):0;
      if(stored>0 && room.status==='ready'){
        ctx.fillStyle='#f4edda';ctx.font='bold 10px system-ui';
        ctx.fillText(`${stored}`,x+w/2,y+h-10);
      }
      if(room.status==='building') {
        ctx.fillStyle='#1a241e';ctx.fillRect(x+4,y+h-8,w-8,5);
        ctx.fillStyle=color;ctx.fillRect(x+4,y+h-8,(w-8)*room.progress/ROOM_TICKS(room.type),5);
      }
      ctx.restore();
    }
  }
  drawRoomPreview(ctx,game,cell,type,camera) {
    const def=ROOM_CATALOG[type];if(!def)return;
    const status=game.rooms.validate(type,cell.x,cell.y);
    const x=cell.x*TILE,y=cell.y*TILE,w=def.width*TILE,h=def.height*TILE;
    ctx.save();ctx.fillStyle=status.ok?'#7be7a94f':'#ef766651';ctx.strokeStyle=status.ok?'#98ffd0':'#ff998b';
    ctx.lineWidth=2/Math.max(camera.zoom,.65);ctx.setLineDash([5,3]);
    ctx.fillRect(x+1,y+1,w-2,h-2);ctx.strokeRect(x+1,y+1,w-2,h-2);ctx.setLineDash([]);
    ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f5efdd';
    ctx.fillText(status.ok?'✓':'×',x+w/2,y+h/2);ctx.restore();
  }
  drawOrders(ctx,game,bounds,camera) {
    for(const job of game.colony.orders.values()) {
      if(job.x<bounds.x0||job.x>bounds.x1||job.y<bounds.y0||job.y>bounds.y1) continue;
      const x=job.x*TILE,y=job.y*TILE;
      ctx.fillStyle=job.status==='digging'?'#e7a75a88':job.status==='assigned'?'#e0b17a5a':'#d2bd7740';
      ctx.fillRect(x+2,y+2,TILE-4,TILE-4);
      ctx.lineWidth=1/Math.max(camera.zoom,.5);
      ctx.strokeStyle='#e4b973aa';ctx.strokeRect(x+2,y+2,TILE-4,TILE-4);
      if(job.progress){
        const total=job.terrain===TERRAINS.HARD_SOIL?30:12;
        ctx.fillStyle='#30291e';ctx.fillRect(x+3,y+TILE-7,TILE-6,4);
        ctx.fillStyle='#ffdf92';ctx.fillRect(x+3,y+TILE-7,(TILE-6)*Math.min(1,job.progress/total),4);
      }
    }
  }
  drawDigPreview(ctx,game,preview,bounds,camera) {
    const l=game.currentLayer;
    const x0=Math.max(bounds.x0,Math.min(preview.from.x,preview.to.x));
    const x1=Math.min(bounds.x1,Math.max(preview.from.x,preview.to.x));
    const y0=Math.max(bounds.y0,Math.min(preview.from.y,preview.to.y));
    const y1=Math.min(bounds.y1,Math.max(preview.from.y,preview.to.y));
    ctx.lineWidth=1/Math.max(camera.zoom,.5);
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
      const t=cellAt(l,x,y),valid=t===TERRAINS.SOIL||t===TERRAINS.HARD_SOIL;
      ctx.fillStyle=valid?'#a9df8277':'#ee777433';
      ctx.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
      ctx.strokeStyle=valid?'#bfe998':'#eb989866';
      ctx.strokeRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
    }
  }
  drawResources(ctx,game,bounds,elapsedMs) {
    for(const node of game.foraging.nodes) {
      if(node.amount<=0 || node.x<bounds.x0 || node.x>bounds.x1 || node.y<bounds.y0 || node.y>bounds.y1)continue;
      const x=(node.x+.5)*TILE,y=(node.y+.5)*TILE;
      const colors={carbs:'#e8c06b',protein:'#d98367',water:'#82c9d8'};
      ctx.save();ctx.translate(x,y);
      ctx.fillStyle='#111c17c9';ctx.beginPath();ctx.arc(0,1,10,0,Math.PI*2);ctx.fill();
      ctx.lineWidth=1.8;ctx.strokeStyle=colors[node.type];ctx.stroke();
      ctx.fillStyle=colors[node.type];
      if(node.type==='water') {ctx.beginPath();ctx.moveTo(0,-8);ctx.quadraticCurveTo(12,4,0,8);ctx.quadraticCurveTo(-12,4,0,-8);ctx.fill();}
      else if(node.type==='protein') {ctx.beginPath();ctx.ellipse(0,0,6,3,-.45,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d7bca2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-7,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-7,6);ctx.stroke();}
      else {ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0be';ctx.fillRect(-2,-3,2,2);}
      ctx.restore();
    }
  }
  drawBrood(ctx,game) {
    const babies=game.lifecycle.brood;
    const q=game.colony.queen;
    for(let i=0;i<babies.length;i++) {
      const b=babies[i],angle=i*2.39996,r=2+(i%5)*2;
      const x=((b.x??q.x)+.5)*TILE+Math.cos(angle)*r;
      const y=((b.y??q.y)+.5)*TILE+Math.sin(angle)*r;
      ctx.fillStyle=b.stage==='egg'?'#fff1c9':b.stage==='larva'?'#e5c58e':'#aa724b';
      ctx.strokeStyle='#5c3825';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(x,y,b.stage==='pupa'?5:3.5,b.stage==='larva'?6:4.5,angle,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
  }
  drawAnts(ctx,game,elapsedMs,camera) {
    const c=game.colony;
    if (c.queen.alive && c.queen.layer===game.layer) this.drawAnt(ctx,game,c.queen,true,elapsedMs);
    for(const ant of c.workers) if(ant.layer===game.layer) this.drawAnt(ctx,game,ant,false,elapsedMs);
  }
  drawAnt(ctx,game,ant,queen,elapsedMs) {
    const pose=displayedPosition(game,ant);
    const x=(pose.x+.5)*TILE;
    const y=(pose.y+.5)*TILE;
    const dir=ant.facing||0;
    const angle=[-Math.PI/2,0,Math.PI/2,Math.PI][dir];
    const scale=queen?1.42:.82;
    const wobble=(ant.state==='walking'||ant.state==='nursing'||ant.state?.startsWith('forage-'))?Math.sin(elapsedMs/85)*.5:0;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);ctx.scale(scale,scale);
    ctx.fillStyle='#0c0b09aa';ctx.beginPath();ctx.ellipse(1,3,7,11,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=queen?'#402311':'#2b1b12';ctx.lineWidth=2;ctx.lineCap='round';
    for(const side of [-1,1]) for(let i=0;i<3;i++) {
      const py=-5+i*5;
      ctx.beginPath();ctx.moveTo(side*2,py);
      ctx.lineTo(side*(7+(i===1?3:0)),py+wobble*(i%2?1:-1));
      ctx.lineTo(side*10,py+4+wobble);ctx.stroke();
    }
    ctx.fillStyle=queen?'#854d2f':'#8b512b';ctx.beginPath();ctx.ellipse(0,6,5.2,7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=queen?'#bf8450':'#b0753f';ctx.beginPath();ctx.ellipse(0,-2,3.7,4.5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=queen?'#d5a16b':'#cf9657';ctx.beginPath();ctx.ellipse(0,-9,4.5,4,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#dfb57d';ctx.lineWidth=.8;
    for(const side of [-1,1]) {ctx.beginPath();ctx.moveTo(side*2,-11);ctx.quadraticCurveTo(side*5,-17,side*8,-15);ctx.stroke();}
    if(ant.cargo?.amount){
      ctx.fillStyle={carbs:'#f0d486',protein:'#e98e70',water:'#86daeb'}[ant.cargo.type];
      ctx.strokeStyle='#302920';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.arc(0,-16,3.5+ant.cargo.amount*.4,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    if(queen){ctx.fillStyle='#f1d69c';ctx.beginPath();ctx.moveTo(-7,-16);ctx.lineTo(-4,-22);ctx.lineTo(0,-18);ctx.lineTo(4,-22);ctx.lineTo(7,-16);ctx.closePath();ctx.fill();}
    ctx.restore();
  }
  drawCombat(ctx,game,elapsedMs) {
    const combat=game.combat;
    if(!combat)return;
    ctx.save();
    for(const ant of combat.soldiers) {
      if(ant.layer!==game.layer)continue;
      const pose=displayedPosition(game,ant);
      const x=(pose.x+.5)*TILE;
      const y=(pose.y+.5)*TILE;
      ctx.strokeStyle=ant.retreating?'#eaa58b':'#a9dce0';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#202322';ctx.fillRect(x-10,y-18,20,3);
      ctx.fillStyle='#b1dbac';ctx.fillRect(x-10,y-18,20*Math.max(0,(ant.combatHP||0)/16),3);
    }
    for(const enemy of combat.enemies) {
      if(enemy.layer!==game.layer)continue;
      const pose=displayedPosition(game,enemy);
      const x=(pose.x+.5)*TILE;
      const y=(pose.y+.5)*TILE;
      ctx.fillStyle=enemy.type==='beetle'?'#7c3450':'#7b2f2d';
      ctx.strokeStyle='#f0b8a1';ctx.lineWidth=1.8;
      ctx.beginPath();ctx.ellipse(x,y,enemy.type==='beetle'?12:9,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-7,y-5);ctx.lineTo(x-13,y-10);ctx.moveTo(x+7,y-5);ctx.lineTo(x+13,y-10);ctx.stroke();
      ctx.fillStyle='#fbdfbd';ctx.beginPath();ctx.arc(x-4,y-2,1.8,0,Math.PI*2);ctx.arc(x+4,y-2,1.8,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#2a1716';ctx.fillRect(x-10,y-18,20,3);
      ctx.fillStyle='#e68d79';ctx.fillRect(x-10,y-18,20*enemy.hp/enemy.maxHP,3);
    }
    const ping=this.rallyPing;
    if(ping && (ping.game!==game || elapsedMs-ping.startedAt>=RALLY_PING_MS)) this.rallyPing=null;
    else if(ping && ping.layer===game.layer && elapsedMs>=ping.startedAt){
      const age=elapsedMs-ping.startedAt, progress=age/RALLY_PING_MS;
      const x=(ping.x+.5)*TILE,y=(ping.y+.5)*TILE;
      ctx.save();
      ctx.globalAlpha=Math.min(1,(RALLY_PING_MS-age)/450);
      ctx.strokeStyle='#ffe29a';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,y,11+progress*12,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  drawTile(ctx, game, layer, x, y) {
    const t = cellAt(layer, x, y);
    const px = x * TILE, py = y * TILE, seed = game.world.seed;
    const variation = tileHash(seed, x, y);
    ctx.fillStyle = colors[t];
    ctx.fillRect(px, py, TILE + .5, TILE + .5);
    if (t === TERRAINS.GRASS || t === TERRAINS.DIRT || t === TERRAINS.THICKET) {
      ctx.fillStyle = variation > .45 ? '#d0d6a014' : '#0c1f131e';
      ctx.fillRect(px, py, TILE, TILE);
      const count = t === TERRAINS.THICKET ? 5 : (t === TERRAINS.GRASS ? 3 : 1);
      for (let i = 0; i < count; i++) {
        const h = tileHash(seed, x, y, 37 + i * 97);
        const q = tileHash(seed, x, y, 86 + i * 53);
        const bx = px + 4 + h * 20, by = py + 5 + q * 20;
        ctx.strokeStyle = t === TERRAINS.DIRT ? '#c7a27843' : (i % 2 ? '#91a96b6b' : '#142e2266');
        ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.moveTo(bx - 2, by + 3); ctx.lineTo(bx, by - 4 - h * 3); ctx.lineTo(bx + 2, by + 2); ctx.stroke();
      }
      if (t === TERRAINS.THICKET) {
        ctx.fillStyle = '#416a4588'; ctx.beginPath(); ctx.arc(px + 13, py + 14, 9 + variation * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#274e34'; ctx.beginPath(); ctx.arc(px + 18, py + 9, 6, 0, Math.PI * 2); ctx.fill();
      }
    } else if (t === TERRAINS.WATER) {
      ctx.fillStyle = '#77b3ab26';
      ctx.beginPath(); ctx.ellipse(px + 12, py + 11, 9, 3, -.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9dbfba55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px + 17, py + 19, 5, .3, 2.5); ctx.stroke();
    } else if (t === TERRAINS.STONE) {
      ctx.fillStyle = '#949486'; ctx.beginPath(); ctx.ellipse(px + 15, py + 15, 10, 8, -.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#686d60'; ctx.beginPath(); ctx.ellipse(px + 16, py + 18, 8, 6, -.5, 0, Math.PI * 2); ctx.fill();
    } else {
      if (t === TERRAINS.ROCK) {
        ctx.fillStyle = '#74726924'; ctx.beginPath(); ctx.moveTo(px, py + 14); ctx.lineTo(px + 11, py); ctx.lineTo(px + TILE, py + 12); ctx.lineTo(px + 13, py + TILE); ctx.fill();
      } else if (t === TERRAINS.SOIL || t === TERRAINS.HARD_SOIL) {
        ctx.fillStyle = variation > .5 ? '#e1b98512' : '#08060019';
        ctx.beginPath(); ctx.arc(px + 5 + variation * 18, py + 5 + tileHash(seed, x, y, 7) * 18, 1.3 + variation * 1.7, 0, Math.PI * 2); ctx.fill();
        if (t === TERRAINS.HARD_SOIL) {
          ctx.strokeStyle = '#9b795022'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px + 4, py + 20); ctx.lineTo(px + 14, py + 8); ctx.lineTo(px + 25, py + 14); ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#fbd9a00c'; ctx.fillRect(px, py, TILE, TILE);
        if (t === TERRAINS.CHAMBER) {
          ctx.fillStyle = '#dfbc7a18'; ctx.beginPath(); ctx.ellipse(px + 14, py + 14, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
        }
        // Make cut edges readable, irrespective of zoom level.
        const carved = v => v === TERRAINS.TUNNEL || v === TERRAINS.CHAMBER || v === TERRAINS.ENTRANCE;
        ctx.strokeStyle = '#d2a06c88'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (!carved(cellAt(layer, x, y - 1))) { ctx.moveTo(px, py + 1); ctx.lineTo(px + TILE, py + 1); }
        if (!carved(cellAt(layer, x + 1, y))) { ctx.moveTo(px + TILE - 1, py); ctx.lineTo(px + TILE - 1, py + TILE); }
        if (!carved(cellAt(layer, x, y + 1))) { ctx.moveTo(px, py + TILE - 1); ctx.lineTo(px + TILE, py + TILE - 1); }
        if (!carved(cellAt(layer, x - 1, y))) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + TILE); }
        ctx.stroke();
      }
    }
  }
  drawEntrance(ctx, p, layer, elapsedMs) {
    const x = (p.x + .5) * TILE, y = (p.y + .5) * TILE;
    const pulse = 1 + Math.sin(elapsedMs / 600) * .05;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#d6a76e1f'; ctx.beginPath(); ctx.arc(0, 0, 31 * pulse, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = '#f3cd8a99'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#171a15'; ctx.beginPath(); ctx.ellipse(0, 1, layer === SURFACE ? 11 : 9, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b77c'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 8px system-ui'; ctx.fillText('NEST 01', 0, -27);
    ctx.restore();
  }
}
