'use strict';

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

module.exports = { tetrominoes, srsKick };
