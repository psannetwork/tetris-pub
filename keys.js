
let keys = {};
document.addEventListener("keydown", event => {
if (isKeyOperation === true) {
  if (!keys[event.code]) {
    keys[event.code] = { startTime: performance.now(), lastRepeat: performance.now() };
    switch (event.code) {
      case CONFIG.keyBindings.moveLeft:
        movePiece({ x: -1, y: 0 });
        break;
      case CONFIG.keyBindings.moveRight:
        movePiece({ x: 1, y: 0 });
        break;
      case CONFIG.keyBindings.softDrop:
        movePiece({ x: 0, y: 1 });
        break;
      case CONFIG.keyBindings.rotateCCW:
        rotatePiece(currentPiece, -1);
        break;
      case CONFIG.keyBindings.rotateCW:
        rotatePiece(currentPiece, 1);
        break;
      case CONFIG.keyBindings.hardDrop:
        hardDrop();
        break;
      case CONFIG.keyBindings.hold:
        hold();
        break;
      case "KeyG":
        if (CONFIG.debug.enableGarbage) addGarbageLine();
        break;
    }
  }
  if (Object.values(CONFIG.keyBindings).includes(event.code) || event.code === "KeyG") event.preventDefault();
    }
});
document.addEventListener("keyup", event => { if (keys[event.code]) delete keys[event.code]; });
