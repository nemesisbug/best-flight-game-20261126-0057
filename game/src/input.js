// Keyboard and mouse input for SKYPOST. Arrow keys / WASD fly the plane,
// W and S work the throttle, G drops the gear, F the flaps, C the camera,
// P pauses and R restarts. The mouse steers the menus, never the plane.
export function createInput() {
  return {
    keys: new Set(),
    pitch: 0,
    bank: 0,
    throttleDelta: 0,
    throttleSet: undefined,
    pressed: new Set(),
    mouseX: 0,
    mouseY: 0,
  };
}

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'throttleUp',
  KeyS: 'throttleDown',
  KeyA: 'left',
  KeyD: 'right',
  KeyG: 'gear',
  KeyF: 'flaps',
  KeyC: 'camera',
  KeyP: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
  KeyX: 'brake',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'escape',
};

export function bindInput(input, element) {
  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) input.pressed.add(action);
    input.keys.add(action);
  }
  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) input.keys.delete(action);
  }
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('keyup', onKeyUp);
  element.addEventListener('blur', () => input.keys.clear());
  // A hidden tab keeps the last keys held down; clear them on return so a
  // stuck throttle or bank cannot surprise the pilot.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) input.keys.clear();
  });
  element.addEventListener('mousemove', (event) => {
    input.mouseX = event.clientX;
    input.mouseY = event.clientY;
  });
  return () => {
    element.removeEventListener('keydown', onKeyDown);
    element.removeEventListener('keyup', onKeyUp);
  };
}

// Read the held keys into a per-frame control frame, then clear one-shots.
export function pollInput(input) {
  const keys = input.keys;
  const pitch = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
  const bank = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  const throttleDelta = (keys.has('throttleUp') ? 0.55 : 0) - (keys.has('throttleDown') ? 0.55 : 0);
  const frame = {
    pitch,
    bank,
    throttleDelta,
    brake: keys.has('brake'),
    gearPressed: input.pressed.has('gear'),
    flapsPressed: input.pressed.has('flaps'),
    cameraPressed: input.pressed.has('camera'),
    pausePressed: input.pressed.has('pause'),
    restartPressed: input.pressed.has('restart'),
    mutePressed: input.pressed.has('mute'),
    confirmPressed: input.pressed.has('confirm'),
    escapePressed: input.pressed.has('escape'),
  };
  input.pressed.clear();
  return frame;
}
