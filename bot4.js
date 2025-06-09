'use strict';
const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const AUTO_REMATCH = true;
const BOT_COUNT = 99;
const BOT_MOVE_DELAY = 400;
const MOVE_ANIMATION_DELAY = 100;
const SOFT_DROP_DELAY = 100;
const SERVER_URL = 'https://tetris.psannetwork.net/';
const dataDir = './data';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const BASE_AI_PARAMETERS = {
  weightAggregateHeight: -0.8,
  weightBumpiness: -0.2,
  weightHoles: -3.0,
  weightUpperRisk: -1.0,
  weightMiddleOpen: 1.9,
  weightLowerPlacement: 0.7,
  weightUpperPlacement: -0.5,
  weightEdgePenalty: -0.2,
  holeDepthFactor: 0.3,
  lowerHoleFactor: 0.5,
  contiguousHoleFactor: 0.5,
  maxHeightPenaltyFactor: 0.1,
  bumpinessFactor: 1.0,
  wellFactor: -0.7
};

const tetrominoes = {
  I: { base: [[0,0],[1,0],[2,0],[3,0]], spawn: { x:3,y:0 } },
  J: { base: [[0,0],[0,1],[1,1],[2,1]], spawn: { x:3,y:0 } },
  L: { base: [[2,0],[0,1],[1,1],[2,1]], spawn: { x:3,y:0 } },
  O: { base: [[0,0],[1,0],[0,1],[1,1]], spawn: { x:4,y:0 } },
  S: { base: [[1,0],[2,0],[0,1],[1,1]], spawn: { x:3,y:0 } },
  T: { base: [[1,0],[0,1],[1,1],[2,1]], spawn: { x:3,y:0 } },
  Z: { base: [[0,0],[1,0],[1,1],[2,1]], spawn: { x:3,y:0 } }
};

const srsKick = {
  normal: {
    '0_L': { newOrientation: 3, offsets: [{x:1,y:0},{x:1,y:-1},{x:0,y:2},{x:1,y:2}] },
    '0_R': { newOrientation: 1, offsets: [{x:-1,y:0},{x:-1,y:-1},{x:0,y:2},{x:-1,y:2}] },
    '90_L':{ newOrientation:0, offsets: [{x:1,y:0},{x:1,y:1},{x:0,y:-2},{x:1,y:-2}] },
    '90_R':{ newOrientation:2, offsets: [{x:1,y:0},{x:1,y:1},{x:0,y:-2},{x:1,y:-2}] },
    '180_L':{newOrientation:1, offsets:[{x:-1,y:0},{x:-1,y:-1},{x:0,y:2},{x:-1,y:2}]},
    '180_R':{newOrientation:3, offsets:[{x:1,y:0},{x:1,y:-1},{x:0,y:2},{x:1,y:2}]},
    '270_L':{newOrientation:2, offsets:[{x:-1,y:0},{x:-1,y:1},{x:0,y:-2},{x:-1,y:-2}]},
    '270_R':{newOrientation:0, offsets:[{x:-1,y:0},{x:-1,y:1},{x:0,y:-2},{x:-1,y:-2}]}
  },
  I: {
    '0_L': { newOrientation:3, offsets:[{x:-1,y:0},{x:2,y:0},{x:-1,y:-2},{x:2,y:1}] },
    '0_R': { newOrientation:1, offsets:[{x:-2,y:0},{x:1,y:0},{x:-2,y:1},{x:1,y:-2}] },
    '90_L':{ newOrientation:0, offsets:[{x:2,y:0},{x:-1,y:0},{x:2,y:-1},{x:-1,y:2}] },
    '90_R':{ newOrientation:2, offsets:[{x:-1,y:0},{x:2,y:0},{x:-1,y:-2},{x:2,y:1}] },
    '180_L':{newOrientation:1, offsets:[{x:1,y:0},{x:-2,y:0},{x:1,y:2},{x:-2,y:-1}]},
    '180_R':{newOrientation:3, offsets:[{x:2,y:0},{x:-1,y:0},{x:2,y:-1},{x:-1,y:2}]},
    '270_L':{newOrientation:2, offsets:[{x:1,y:0},{x:-2,y:0},{x:-2,y:1},{x:1,y:-2}]},
    '270_R':{newOrientation:0, offsets:[{x:2,y:0},{x:1,y:0},{x:1,y:2},{x:-2,y:-1}]}
  }
};

function createEmptyBoard() {
  return Array.from({ length: 22 }, () => Array(10).fill(0));
}

function spawnPiece() {
  const types = Object.keys(tetrominoes);
  const t = types[Math.floor(Math.random() * types.length)];
  return { type: t, base: tetrominoes[t].base, ...tetrominoes[t].spawn, orientation: 0, rotated: false };
}

function getPieceBlocks(p) {
  return p.base.map(([x,y]) => {
    switch(p.orientation) {
      case 1: return [y,-x];
      case 2: return [-x,-y];
      case 3: return [-y,x];
      default: return [x,y];
    }
  });
}

function isValidPosition(p,board,dx,dy,blocks=null) {
  const bl = blocks || getPieceBlocks(p);
  for(const [bx,by] of bl) {
    const x = p.x + dx + bx;
    const y = p.y + dy + by;
    if(x<0||x>=10||y>=22||(y>=0&&board[y][x]!==0)) return false;
  }
  return true;
}

function mergePiece(p,board) {
  for(const [bx,by] of getPieceBlocks(p)) {
    const x = p.x + bx;
    const y = p.y + by;
    if(y>=0&&y<22&&x>=0&&x<10) board[y][x] = p.type;
  }
}

function clearLines(board) {
  const remain = board.filter(r=>r.some(c=>c===0));
  const num = board.length - remain.length;
  const newRows = Array.from({ length: num }, () => Array(10).fill(0));
  const newB = newRows.concat(remain);
  for(let i=0;i<board.length;i++) board[i] = newB[i];
  return num;
}

function hardDrop(p,board) {
  while(isValidPosition(p,board,0,1)) p.y++;
  return p;
}

function drawBoard(board,p=null) {
  const d = board.map(r=>r.slice());
  if(p) for(const [bx,by] of getPieceBlocks(p)) {
    const x = p.x + bx;
    const y = p.y + by;
    if(y>=0&&y<22&&x>=0&&x<10) d[y][x] = p.type;
  }
  return d;
}

function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }

function evaluateHoles(board,p) {
  let pen=0,rows=board.length,cols=board[0].length;
  for(let j=0;j<cols;j++){
    let cont=0,seen=false;
    for(let i=0;i<rows;i++){
      if(board[i][j]!==0){seen=true;cont=0;} else if(seen){
        pen+=p.holeDepthFactor*i;
        if(i>=16) pen+=p.lowerHoleFactor*(i-15);
        cont++;
        if(cont>1) pen+=p.contiguousHoleFactor*(cont-1);
      }
    }
  }
  return pen;
}

function evaluateHeight(h,p) {
  const avg = h.reduce((a,b)=>a+b,0)/h.length;
  const m = Math.max(...h);
  return avg + Math.exp(m*p.maxHeightPenaltyFactor);
}

function evaluateBumpiness(h,p) {
  let s=0;
  for(let i=0;i<h.length-1;i++) s+=Math.abs(h[i]-h[i+1]);
  return s*p.bumpinessFactor;
}

function evaluateWells(board,p) {
  let tot=0,rows=board.length,cols=board[0].length;
  for(let j=0;j<cols;j++) for(let i=0;i<rows;i++){
    if(board[i][j]!==0) continue;
    const lb=(j===0)||board[i][j-1]!==0;
    const rb=(j===cols-1)||board[i][j+1]!==0;
    if(lb&&rb){
      let d=1;
      for(let k=i+1;k<rows&&board[k][j]===0;k++) d++;
      tot += p.wellFactor * d;
    }
  }
  return tot;
}

function getColumnHeights(board) {
  return board[0].map((_,j)=>{
    for(let i=0;i<board.length;i++) if(board[i][j]!==0) return board.length-i;
    return 0;
  });
}

function computeUpperRisk(board) {
  let r=0;
  for(let i=0;i<4;i++) for(let j=0;j<board[0].length;j++) if(board[i][j]!==0) r+=4-i;
  return r;
}

function computeHoleAccessibilityPenalty(board) {
  let pen=0,rows=board.length,cols=board[0].length;
  for(let j=0;j<cols;j++){
    let block=false;
    for(let i=0;i<rows;i++){
      if(board[i][j]!==0) block=true;
      else if(block){
        const acc=(j>0&&board[i][j-1]===0)||(j<cols-1&&board[i][j+1]===0);
        pen += acc ? -0.5 : 1;
      }
    }
  }
  return pen;
}

function computePlacementBonus(p,pv) {
  const blocks=getPieceBlocks(p);
  const avgRow=blocks.reduce((s,[,dy])=>s+(p.y+dy),0)/blocks.length;
  let b=0;
  for(const [dx,dy] of blocks){
    if(p.y+dy<4) b+=pv.weightUpperPlacement;
    if([0,9].includes(p.x+dx)) b+=pv.weightEdgePenalty;
  }
  return b + pv.weightLowerPlacement * avgRow;
}

function detectTSpin(p,board) {
  if(p.type!=='T'||!p.rotated) return false;
  const cx=p.x+1,cy=p.y+1;
  let cnt=0;
  for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    if(cx+dx<0||cx+dx>=10||cy+dy<0||cy+dy>=22||board[cy+dy][cx+dx]!==0) cnt++;
  }
  return cnt>=3;
}

function evaluateBoard(board,p) {
  const h=getColumnHeights(board);
  const agg=h.reduce((a,v)=>a+v,0);
  const bump=evaluateBumpiness(h,p);
  const holes=evaluateHoles(board,p);
  const hs=evaluateHeight(h,p);
  const well=evaluateWells(board,p);
  const mid=board.slice(0,Math.floor(board.length/2)).reduce((s,r)=>s+((r[4]===0&&r[5]===0)?1:0),0) * p.weightMiddleOpen;
  let sc = p.weightAggregateHeight*agg + p.weightBumpiness*bump + p.weightHoles*holes + p.weightUpperRisk*computeUpperRisk(board) + mid + well + hs;
  sc += computeHoleAccessibilityPenalty(board);
  return sc;
}

function clonePiece(p){return{type:p.type,base:p.base,x:p.x,y:p.y,orientation:p.orientation,rotated:p.rotated||false};}
function rotatedPiece(p,dir,board){
  if(p.type==='O') return clonePiece(p);
  const table=p.type==='I'?srsKick.I:srsKick.normal;
  const key=`${p.orientation}_${dir}`;
  if(!table[key]) return null;
  const { newOrientation, offsets } = table[key];
  const blocks=p.base.map(([x,y])=>{switch(newOrientation){case 1:return[y,-x];case 2:return[-x,-y];case 3:return[-y,x];default:return[x,y];}});
  for(const off of offsets){
    const c={...p,x:p.x+off.x,y:p.y+off.y,orientation:newOrientation};
    if(isValidPosition(c,board,0,0,blocks)) return c;
  }
  return null;
}

function moveLeft(p,board){const n=clonePiece(p);n.x--;return isValidPosition(n,board,0,0)?n:null;}
function moveRight(p,board){const n=clonePiece(p);n.x++;return isValidPosition(n,board,0,0)?n:null;}
function moveDown(p,board){const n=clonePiece(p);n.y++;return isValidPosition(n,board,0,0)?n:null;}
function moveRotateCW(p,board){return rotatedPiece(p,'R',board);}  
function moveRotateCCW(p,board){return rotatedPiece(p,'L',board);}  

function simulateHardDrop(p,board){const t=clonePiece(p);while(isValidPosition(t,board,0,1))t.y++;return t;}

function findMoveSequence(init,target,board){
  const queue=[{piece:clonePiece(init),path:[]}];
  const visited=new Set([`${init.x},${init.y},${init.orientation}`]);
  const moves=[{m:'L',fn:moveLeft},{m:'R',fn:moveRight},{m:'D',fn:moveDown},{m:'CW',fn:moveRotateCW},{m:'CCW',fn:moveRotateCCW}];
  while(queue.length){
    const {piece,path} = queue.shift();
    const d = simulateHardDrop(piece,board);
    if(d.x===target.x&&d.y===target.y&&d.orientation===target.orientation) return path;
    for(const {m,fn} of moves){
      const nx = fn(piece,board);
      if(!nx) continue;
      const key=`${nx.x},${nx.y},${nx.orientation}`;
      if(visited.has(key)) continue;
      visited.add(key);
      queue.push({piece:nx,path:[...path,m]});
    }
  }
  return null;
}

function getAllPlacements(board,p){
  const res=[];
  for(let o=0;o<4;o++){
    const tp={...p,orientation:o,rotated:o!==p.orientation};
    for(let x=-3;x<10;x++){
      const c={...tp,x,y:tp.y};
      if(!isValidPosition(c,board,0,0)) continue;
      const f=hardDrop({...c},board);
      const seq=findMoveSequence(p,f,board);
      if(!seq) continue;
      f.moveSequence=seq;
      f.isTSpin=(f.type==='T'&&detectTSpin(f,board));
      res.push(f);
    }
  }
  return res;
}

function computeSendGarbage(piece,linesCleared,renChain,boardAfterClear) {
  let g=0;
  const perfectClear = boardAfterClear.every(r=>r.every(c=>c===0));
  if(perfectClear) return 10;
  if(piece.type==='T'&&piece.isTSpin) {
    if(linesCleared===1) g+=1;
    else if(linesCleared===2) g+=4;
    else if(linesCleared===3) g+=6;
  } else {
    if(linesCleared===2) g+=1;
    else if(linesCleared===3) g+=2;
    else if(linesCleared===4) g+=4;
  }
  if(renChain>1) {
    const combo = renChain;
    if(combo===2) g+=1;
    else if(combo===3) g+=2;
    else if(combo===4) g+=3;
    else if(combo===5) g+=4;
    else if(combo===6) g+=5;
    else if(combo===7) g+=6;
    else if(combo===8) g+=7;
    else if(combo>=9) g+=10;
  }
  return g;
}

class TetrisBot {
  constructor(index,strength,aiParams) {
    this.index=index;
    this.strength=strength;
    this.aiParams={...aiParams};
    this.socket=null;
    this.matched=false;
    this.connect();
  }

  connect() {
    this.matched=false;
    this.socket=io(SERVER_URL,{reconnection:true});
    this.socket.on('connect',()=>{
      if(!this.matched) {
        this.socket.emit('matching');
        this.matched=true;
      }
    });
    this.socket.on('ReceiveGarbage',({lines})=>{
      this.pendingGarbage = (this.pendingGarbage||0) + (parseInt(lines,10)||0);
    });
    this.socket.on('StartGame',()=>this.startGame());
  }

  startGame() {
    this.board=createEmptyBoard();
    this.currentPiece=spawnPiece();
    this.pendingGarbage=0;
    this.gameStats={totalCleared:0,moves:0,totalAttack:0,renChain:0};
    this.playLoop();
  }

  async playLoop() {
    while(isValidPosition(this.currentPiece,this.board,0,0)) {
      const best=this.findBestMove();
      if(best) await this.animateMove(best);
      else hardDrop(this.currentPiece,this.board);
      mergePiece(this.currentPiece,this.board);
      const cleared=clearLines(this.board);
      this.gameStats.renChain=cleared?this.gameStats.renChain+1:0;
      const boardCopy=this.board.map(r=>r.slice());
      const sendG=computeSendGarbage(this.currentPiece,cleared,this.gameStats.renChain,boardCopy);
      if(sendG>0) this.socket.emit('SendGarbage',{targetId:null,lines:sendG});
      this.socket.emit('BoardStatus',{UserID:this.socket.id,board:drawBoard(this.board)});
      if(this.pendingGarbage>0) this.applyGarbage();
      this.currentPiece=spawnPiece();
      if(!isValidPosition(this.currentPiece,this.board,0,0)) break;
      await delay(BOT_MOVE_DELAY);
    }
    this.socket.emit('PlayerGameStatus','gameover');
    this.socket.disconnect();
    if(AUTO_REMATCH) setTimeout(()=>this.connect(),10000);
  }

  applyGarbage() {
    for(let i=0;i<this.pendingGarbage;i++) {
      this.board.shift();
      const row=Array(10).fill('G');
      row[Math.floor(Math.random()*10)] = 0;
      this.board.push(row);
    }
    this.pendingGarbage=0;
    this.socket.emit('BoardStatus',{UserID:this.socket.id,board:drawBoard(this.board)});
  }

  async animateMove(best) {
    for(const mv of best.moveSequence) {
      let next;
      if(mv==='L') next=moveLeft(this.currentPiece,this.board);
      else if(mv==='R') next=moveRight(this.currentPiece,this.board);
      else if(mv==='D') next=moveDown(this.currentPiece,this.board);
      else if(mv==='CW') next=moveRotateCW(this.currentPiece,this.board);
      else if(mv==='CCW') next=moveRotateCCW(this.currentPiece,this.board);
      if(next) Object.assign(this.currentPiece,next);
      this.socket.emit('BoardStatus',{UserID:this.socket.id,board:drawBoard(this.board,this.currentPiece)});
      await delay(MOVE_ANIMATION_DELAY);
    }
    hardDrop(this.currentPiece,this.board);
  }

  findBestMove() {
    const placements=getAllPlacements(this.board,this.currentPiece);
    if(!placements.length) return null;
    let best=null,bestScore=-Infinity;
    for(const p of placements) {
      const b=this.board.map(r=>r.slice());
      mergePiece(p,b);
      const cleared=clearLines(b);
      p.isTSpin=(p.type==='T'&&detectTSpin(p,b));
      const score=evaluateBoard(b,this.aiParams);
      if(score>bestScore) { bestScore=score; best=p; }
    }
    return best;
  }
}

for(let i=1;i<=BOT_COUNT;i++) new TetrisBot(i,Math.floor(Math.random()*101),BASE_AI_PARAMETERS);
