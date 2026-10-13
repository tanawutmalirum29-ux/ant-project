import { TERRAINS, SURFACE, UNDERGROUND, TILE, cellAt } from '../world/generate.js';
import { tileHash } from '../core/random.js';
import { paintTerrainTile } from './terrain-art.js';
import { ROOM_CATALOG, ROOM_LIMITS } from '../core/rooms.js';
import { isWalkable } from '../world/navigation.js';
import { displayedPosition } from '../core/game.js';

const RALLY_PING_MS = 1500;
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
      for (let x = bounds.x0; x <= bounds.x1; x++) this.drawTile(ctx, game, layer, x, y, camera.zoom);
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
  /** Individually rendered, deterministic room furniture rather than a flat
   * color block. All paths live on the canvas; no image downloads or animation
   * randomness, so equal worlds and zoom levels produce identical artwork. */
  drawRoomMotif(ctx,type,x,y,variation,seed) {
    const cx=x+TILE/2,cy=y+TILE/2;
    ctx.save();
    if(type==='nursery') {
      // Woven cradle holding pale brood with a warmer shell.
      ctx.fillStyle='#5b4031';ctx.beginPath();ctx.ellipse(cx,cy+3,11,8,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#d2a16c';ctx.lineWidth=2;
      for(const dy of [-2,2,5]){ctx.beginPath();ctx.ellipse(cx,cy+dy,10,4,0,0,Math.PI);ctx.stroke();}
      ctx.fillStyle='#f6e7c8';ctx.strokeStyle='#e6b2b1';ctx.lineWidth=.8;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(cx-6+i*6,cy+variation*3-1,2.8,4.4,.3,0,Math.PI*2);ctx.fill();ctx.stroke();}
    }else if(type==='food_store') {
      // Granary crates of grain, seeds and protein sacks.
      ctx.fillStyle='#69462b';ctx.fillRect(x+4,y+8,20,15);
      ctx.strokeStyle='#d8a76c';ctx.lineWidth=1.8;ctx.strokeRect(x+4,y+8,20,15);
      ctx.beginPath();ctx.moveTo(x+4,y+15);ctx.lineTo(x+24,y+15);ctx.moveTo(x+14,y+8);ctx.lineTo(x+14,y+23);ctx.stroke();
      for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#eed09a':'#c89b4e';ctx.beginPath();ctx.ellipse(x+7+i*4.5,y+7+(i%2)*2,2.3,3,variation,0,Math.PI*2);ctx.fill();}
    }else if(type==='water_store') {
      // Deep blue stone-lined cistern, central water and reflected wave arcs.
      ctx.fillStyle='#496879';ctx.beginPath();ctx.ellipse(cx,cy+2,11.5,10.5,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#c5c4a2';ctx.lineWidth=2.5;ctx.stroke();
      ctx.fillStyle='#4b9aa9';ctx.beginPath();ctx.ellipse(cx,cy+3,9,8,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#b9eaf0';ctx.lineWidth=1.2;
      for(const t of [-1,5]){ctx.beginPath();ctx.moveTo(cx-6,cy+t);ctx.quadraticCurveTo(cx-2,cy+t-3,cx+1,cy+t);ctx.quadraticCurveTo(cx+4,cy+t+2,cx+7,cy+t-1);ctx.stroke();}
    }else if(type==='rest') {
      // Leaf mattress and tiny grass-woven headrest.
      ctx.fillStyle='#72543e';ctx.beginPath();ctx.ellipse(cx,cy+3,11,8,-.25,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#7eaa75';ctx.beginPath();ctx.ellipse(cx-1,cy+1,10,6,-.35,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#c2d69a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-10,cy+5);ctx.lineTo(cx+8,cy-2);ctx.stroke();
      ctx.fillStyle='#d5d5a6';ctx.beginPath();ctx.ellipse(cx-6,cy-1,4,3,-.3,0,Math.PI*2);ctx.fill();
    }else if(type==='guard') {
      // Defensive barricade, spear rack and buckler.
      ctx.fillStyle='#6c4a35';ctx.fillRect(x+4,y+17,20,6);
      ctx.strokeStyle='#d7ae7d';ctx.lineWidth=1.7;
      for(const sx of [8,13,18,23]){ctx.beginPath();ctx.moveTo(x+sx,y+22);ctx.lineTo(x+sx-2,y+6);ctx.stroke();}
      ctx.fillStyle='#d9a98a';ctx.beginPath();ctx.moveTo(cx-5,y+6);ctx.lineTo(cx-2,y+1);ctx.lineTo(cx+1,y+6);ctx.fill();
      ctx.fillStyle='#9f7058';ctx.beginPath();ctx.moveTo(cx+4,cy-2);ctx.lineTo(cx+11,cy);ctx.lineTo(cx+9,cy+7);ctx.lineTo(cx+4,cy+9);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#e3c8a0';ctx.lineWidth=1;ctx.stroke();
    }else if(type==='queen'){
      // Decorative central throne, patterned royal chamber floor.
      ctx.fillStyle='#7c503f';ctx.beginPath();ctx.arc(cx,cy,11,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#f4d79b';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(cx,cy,10,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#e5b66a';ctx.beginPath();ctx.moveTo(cx-7,cy+3);ctx.lineTo(cx-6,cy-5);ctx.lineTo(cx-2,cy-2);ctx.lineTo(cx,cy-8);ctx.lineTo(cx+3,cy-2);ctx.lineTo(cx+7,cy-5);ctx.lineTo(cx+6,cy+3);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }
  drawRooms(ctx,game,bounds,camera) {
    if(!game.rooms)return;
    const palette={
      queen:{floor:'#71563d',light:'#f4d49e',edge:'#e8c37b'},
      nursery:{floor:'#765b60',light:'#deb9c5',edge:'#efc5d1'},
      food_store:{floor:'#776141',light:'#efcf83',edge:'#dcb96d'},
      water_store:{floor:'#416775',light:'#a6e4e8',edge:'#85cbd6'},
      rest:{floor:'#4f6a4f',light:'#bdd39e',edge:'#a4c28b'},
      guard:{floor:'#6e4e46',light:'#d9a08d',edge:'#e3ac8c'}
    };
    for(const room of game.rooms.rooms) {
      if(room.x+room.width<=bounds.x0||room.x>bounds.x1||room.y+room.height<=bounds.y0||room.y>bounds.y1)continue;
      const style=palette[room.type],left=room.x*TILE,top=room.y*TILE;
      const w=room.width*TILE,h=room.height*TILE;
      const ready=room.status==='ready',active=room.status!=='disabled';
      ctx.save();
      ctx.globalAlpha=active?1:.34;
      for(let yy=room.y;yy<room.y+room.height;yy++)for(let xx=room.x;xx<room.x+room.width;xx++){
        if(xx<bounds.x0||xx>bounds.x1||yy<bounds.y0||yy>bounds.y1)continue;
        const px=xx*TILE,py=yy*TILE,v=tileHash(game.world.seed,xx,yy,17);
        ctx.fillStyle=style.floor;ctx.fillRect(px,py,TILE+.5,TILE+.5);
        ctx.fillStyle=v>.55?'#f6e1b010':'#070d0d12';ctx.fillRect(px+1,py+1,TILE-2,TILE-2);
        ctx.strokeStyle='#ffefd215';ctx.lineWidth=.65;ctx.strokeRect(px+1,py+1,TILE-2,TILE-2);
        if(ready){
          this.drawRoomMotif(ctx,room.type,px,py,v,game.world.seed);
        }else{
          ctx.strokeStyle=style.light;ctx.globalAlpha=active?.55:.2;ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(px+6,py+6);ctx.lineTo(px+22,py+22);ctx.moveTo(px+22,py+6);ctx.lineTo(px+6,py+22);ctx.stroke();
          ctx.globalAlpha=active?1:.34;
        }
      }
      // The thick, unified perimeter marks a *single* room, no 2×2 seams.
      ctx.strokeStyle='#221f19';ctx.lineWidth=5;
      ctx.strokeRect(left+2,top+2,w-4,h-4);
      ctx.strokeStyle=style.edge;ctx.lineWidth=2.2;
      ctx.setLineDash(ready?[]:[5,4]);
      ctx.strokeRect(left+2,top+2,w-4,h-4);ctx.setLineDash([]);
      // Corners, subtle structural reinforcement.
      ctx.strokeStyle=style.light;ctx.lineWidth=2.3;
      for(const [xx,yy,sx,sy] of [[left+3,top+3,1,1],[left+w-3,top+3,-1,1],[left+3,top+h-3,1,-1],[left+w-3,top+h-3,-1,-1]]){
        ctx.beginPath();ctx.moveTo(xx+sx*7,yy);ctx.lineTo(xx,yy);ctx.lineTo(xx,yy+sy*7);ctx.stroke();
      }
      if(!ready){
        ctx.fillStyle='#0e1717b9';ctx.fillRect(left+5,top+h-11,w-10,7);
        const percent=room.progress/Math.max(1,room.ticks??ROOM_CATALOG[room.type].ticks);
        ctx.fillStyle=style.light;ctx.fillRect(left+5,top+h-11,(w-10)*Math.min(1,percent),7);
      }else if(room.stock&&room.width*TILE>=50){
        const stored=Object.values(room.stock).reduce((a,b)=>a+b,0);
        if(stored>0){ctx.fillStyle='#121d1bbd';ctx.fillRect(left+w/2-17,top+h-16,34,13);
          ctx.fillStyle='#f6e8bd';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(String(stored),left+w/2,top+h-10);}
      }
      ctx.restore();
    }
  }
  drawRoomPreview(ctx,game,preview,type,camera) {
    const def=ROOM_CATALOG[type];if(!def||!preview?.from)return;
    const from=preview.from,to=preview.dragging?preview.to:preview.from;
    const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y);
    const width=preview.dragging?Math.abs(from.x-to.x)+1:def.width;
    const height=preview.dragging?Math.abs(from.y-to.y)+1:def.height;
    const status=game.rooms.validate(type,x,y,width,height);
    const bx=x*TILE,by=y*TILE,w=width*TILE,h=height*TILE;
    const border=status.ok?'#a7ffca':'#ff9c8f';
    ctx.save();ctx.lineWidth=1/Math.max(camera.zoom,.6);
    const layer=game.world.layers[UNDERGROUND];
    for(let yy=y;yy<y+Math.min(height,ROOM_LIMITS.maxHeight+1);yy++)
      for(let xx=x;xx<x+Math.min(width,ROOM_LIMITS.maxWidth+1);xx++){
        const local=isWalkable(layer,xx,yy)&&!game.rooms.getRoom(xx,yy)&&
          !game.world.entrances.some(e=>e.underground.x===xx&&e.underground.y===yy);
        ctx.fillStyle=local?(status.ok?'#64dca366':'#d6b76841'):'#ee605c88';
        ctx.fillRect(xx*TILE+1,yy*TILE+1,TILE-2,TILE-2);
        ctx.strokeStyle=local?'#bce4b788':'#ffaba2';
        ctx.strokeRect(xx*TILE+2,yy*TILE+2,TILE-4,TILE-4);
      }
    ctx.lineWidth=3/Math.max(camera.zoom,.65);
    ctx.strokeStyle=border;ctx.setLineDash([7,4]);ctx.strokeRect(bx+1,by+1,w-2,h-2);ctx.setLineDash([]);
    ctx.fillStyle='#152622eb';ctx.strokeStyle=border;ctx.lineWidth=1;
    const label=`${width}×${height} · ${width*height} ช่อง`,labelW=Math.max(77,label.length*7+15);
    const labelY=by-12;
    ctx.fillRect(bx+w/2-labelW/2,labelY-11,labelW,22);
    ctx.strokeRect(bx+w/2-labelW/2,labelY-11,labelW,22);
    ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fcf1d5';
    ctx.fillText(label,bx+w/2,labelY);
    ctx.restore();
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
      if(b.site==='temporary'&&!b.carrierId){
        ctx.fillStyle='#59493288';
        ctx.beginPath();ctx.ellipse(x,y+2,9,6,0,0,Math.PI*2);ctx.fill();
      }
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
    const wobble=(ant.next||(ant.state==='walking'||ant.state==='nursing'||ant.state?.startsWith('forage-')))?Math.sin(elapsedMs/85)*.5:0;
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
  drawTile(ctx, game, layer, x, y, zoom = 1) {
    paintTerrainTile(ctx, layer, game.world.seed, x, y, zoom);
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
