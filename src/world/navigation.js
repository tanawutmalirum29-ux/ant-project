import { TERRAINS, cellAt } from './generate.js';

export const DIRECTIONS = Object.freeze([[0,-1],[1,0],[0,1],[-1,0]]);
export function isWalkable(layer, x, y) {
  const t = cellAt(layer, x, y);
  return layer.kind === 'underground'
    ? t === TERRAINS.TUNNEL || t === TERRAINS.CHAMBER || t === TERRAINS.ENTRANCE
    : t != null && t !== TERRAINS.WATER && t !== TERRAINS.STONE && t !== TERRAINS.THICKET;
}
export function isDiggable(layer, x, y) {
  const t = cellAt(layer, x, y);
  return layer.kind === 'underground' && (t === TERRAINS.SOIL || t === TERRAINS.HARD_SOIL);
}
const id = (layer, x, y) => y * layer.width + x;
function route(layer, prev, startIndex, endIndex) {
  const path = [];
  for (let i = endIndex; i !== startIndex; i = prev[i]) {
    if (i < 0) return null;
    path.push({ x: i % layer.width, y: Math.floor(i / layer.width) });
  }
  return path.reverse();
}
/** A* using cardinal neighbors only; unreachable destinations return null. */
export function findPath(layer, from, to) {
  if (!isWalkable(layer, from.x, from.y) || !isWalkable(layer, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const count = layer.width * layer.height, start = id(layer, from.x, from.y), goal = id(layer, to.x, to.y);
  const g = new Float64Array(count); g.fill(Infinity);
  const prev = new Int32Array(count); prev.fill(-1);
  const closed = new Uint8Array(count);
  const heap = [];
  let seq = 0;
  const push = (node, cost, score) => {
    const item = { node, cost, score, seq: seq++ };
    let k = heap.length; heap.push(item);
    while (k > 0) { const p = (k - 1) >> 1; if (compare(heap[p], item) <= 0) break; heap[k] = heap[p]; k = p; }
    heap[k] = item;
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { let k = 0; while (2*k+1 < heap.length) {
      let child = 2*k+1;
      if (child+1 < heap.length && compare(heap[child+1], heap[child]) < 0) child++;
      if (compare(last, heap[child]) <= 0) break;
      heap[k] = heap[child]; k = child;
    } heap[k] = last; }
    return top;
  };
  const heuristic = (x,y) => Math.abs(x-to.x) + Math.abs(y-to.y);
  g[start] = 0; push(start, 0, heuristic(from.x, from.y));
  while (heap.length) {
    const item = pop(), cur = item.node;
    if (closed[cur] || item.cost !== g[cur]) continue;
    if (cur === goal) return route(layer, prev, start, goal);
    closed[cur] = 1;
    const x = cur % layer.width, y = Math.floor(cur / layer.width);
    for (const [dx,dy] of DIRECTIONS) {
      const nx = x+dx, ny=y+dy;
      if (!isWalkable(layer,nx,ny)) continue;
      const next = id(layer,nx,ny), ng = g[cur]+1;
      if (ng < g[next]) { g[next]=ng; prev[next]=cur; push(next,ng,ng+heuristic(nx,ny)); }
    }
  }
  return null;
}
function compare(a,b) { return a.score-b.score || a.cost-b.cost || a.seq-b.seq; }

/** Single BFS for every reachable path; used to select work without N A* searches. */
export function reachablePaths(layer, start) {
  if (!isWalkable(layer,start.x,start.y)) return null;
  const count=layer.width*layer.height, source=id(layer,start.x,start.y);
  const dist=new Int32Array(count); dist.fill(-1);
  const prev=new Int32Array(count); prev.fill(-1);
  const queue=new Int32Array(count); let head=0,tail=0;
  queue[tail++]=source; dist[source]=0;
  while(head<tail) {
    const cur=queue[head++], x=cur%layer.width, y=Math.floor(cur/layer.width);
    for(const [dx,dy] of DIRECTIONS) {
      const nx=x+dx,ny=y+dy;
      if(!isWalkable(layer,nx,ny)) continue;
      const next=id(layer,nx,ny);
      if(dist[next] !== -1) continue;
      dist[next]=dist[cur]+1;prev[next]=cur;queue[tail++]=next;
    }
  }
  return {
    distance(x,y) { if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=layer.width||y>=layer.height) return -1;return dist[id(layer,x,y)]; },
    path(x,y) { const dest=id(layer,x,y);return dist[dest]<0 ? null : route(layer,prev,source,dest); }
  };
}

/** Plan through diggable earth; workers still only WALK through cleared tiles. */
export function findExcavationRoute(layer,starts,targets){
  if(layer.kind!=='underground'||!starts.length||!targets.length)return null;
  const n=layer.width*layer.height,goal=new Set(targets.filter(p=>isDiggable(layer,p.x,p.y)).map(p=>id(layer,p.x,p.y)));
  if(!goal.size)return null;
  const dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),heap=[];
  const push=(idx,cost)=>{heap.push([cost,idx]);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=cost)break;heap[i]=heap[p];i=p;}heap[i]=[cost,idx];};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let child=2*i+1;if(child+1<heap.length&&heap[child+1][0]<heap[child][0])child++;if(last[0]<=heap[child][0])break;heap[i]=heap[child];i=child;}heap[i]=last;}return top;};
  for(const s of starts)if(isWalkable(layer,s.x,s.y)){const v=id(layer,s.x,s.y);if(dist[v]>0){dist[v]=0;push(v,0);}}
  while(heap.length){
    const [cost,cur]=pop();if(cost!==dist[cur])continue;
    if(goal.has(cur)){
      const path=[];for(let v=cur;prev[v]!==-1;v=prev[v])path.push({x:v%layer.width,y:Math.floor(v/layer.width)});
      return {path:path.reverse(),cost,target:{x:cur%layer.width,y:Math.floor(cur/layer.width)}};
    }
    const x=cur%layer.width,y=Math.floor(cur/layer.width);
    for(const [dx,dy] of DIRECTIONS){
      const xx=x+dx,yy=y+dy,t=cellAt(layer,xx,yy);
      if(!isWalkable(layer,xx,yy)&&!isDiggable(layer,xx,yy))continue;
      const next=id(layer,xx,yy),costNext=cost+(t===TERRAINS.HARD_SOIL?30:t===TERRAINS.SOIL?12:1);
      if(costNext<dist[next]){dist[next]=costNext;prev[next]=cur;push(next,costNext);}
    }
  }
  return null;
}
