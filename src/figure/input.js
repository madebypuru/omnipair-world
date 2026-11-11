// Keyboard, mouse and gamepad, read once a frame into one plain state.
//   move: {x, y} (x right, y forward, length 0..1), walk, sprint, strafe (held),
//   jump (pressed this frame), look: {x, y} (radians this frame), zoom (wheel steps this frame)
// and for the board: hold (Space held), mount (F pressed), push and brake (0..1), boost (held)
export class Input {
  constructor(el, { pads = true } = {}) {
    this.el = el;
    this.pads = pads; // off in headless checks: this PC's real gamepad shows up in headless browsers too
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, wheel: 0, right: false, drag: false };
    this.walkToggle = false;
    this.pad = { a: false, l3: false, y: false, sprint: false };
    this.sensitivity = 0.0022;
    this.override = null; // scripted input for captures
    this.lockable = true;
    this.invertY = false;
    this.paused = false; // a menu has the keys: none are read, and Tab, the arrows and Space keep their usual jobs
    const typing = () => document.activeElement?.tagName === 'INPUT';
    const down = (e) => {
      if (typing() || this.paused) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'AltLeft', 'AltRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'CapsLock') this.walkToggle = !this.walkToggle;
    };
    const up = (e) => this.keys.delete(e.code);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.mouse.right = true;
      // a click locks the mouse for looking, except while a panel or the replay wants the mouse
      if (e.button === 0 && this.lockable && document.pointerLockElement !== el) el.requestPointerLock?.()?.catch?.(() => {});
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.mouse.right = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el || this.mouse.right) { this.mouse.x += e.movementX; this.mouse.y += e.movementY; }
    });
    el.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  read(dt) {
    if (this.override) return this.override(dt);
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const s = {
      move: { x, y },
      walk: this.walkToggle !== (k.has('AltLeft') || k.has('AltRight')),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      strafe: this.mouse.right && document.pointerLockElement === this.el,
      jump: this.pressed.has('Space'),
      hold: k.has('Space'),
      mount: this.pressed.has('KeyF'),
      push: k.has('KeyW') || k.has('ArrowUp') ? 1 : 0,
      brake: k.has('KeyS') || k.has('ArrowDown') ? 1 : 0,
      boost: k.has('ShiftLeft') || k.has('ShiftRight'),
      look: { x: this.mouse.x * this.sensitivity, y: this.mouse.y * this.sensitivity },
      zoom: this.mouse.wheel,
      device: 'keyboard',
    };
    this.mouse.x = this.mouse.y = this.mouse.wheel = 0;
    this.pressed.clear();

    // gamepad: left stick moves (its tilt sets the speed), right stick looks, L3 sprints,
    // A jumps (held: glides), LT strafes, d-pad up/down zooms; on the board RT pushes, LT brakes, X boosts, Y steps off
    const pad = this.pads ? [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected) : null;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : Math.sign(v) * (Math.abs(v) - 0.15) / 0.85);
      let px = dz(pad.axes[0] ?? 0), py = -dz(pad.axes[1] ?? 0);
      const pl = Math.hypot(px, py);
      if (pl > 1) { px /= pl; py /= pl; }
      const btn = (i) => !!pad.buttons[i]?.pressed;
      if (pl > 0.01) { s.move = { x: px, y: py }; s.device = 'pad'; s.walk = false; }
      const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0);
      s.look.x += rx * Math.abs(rx) * 3.2 * dt;
      s.look.y += ry * Math.abs(ry) * 2.2 * dt;
      if (btn(10) && !this.pad.l3) this.pad.sprint = !this.pad.sprint;
      if (pl < 0.2) this.pad.sprint = false;
      if (this.pad.sprint || btn(5)) s.sprint = true;
      if (btn(0) && !this.pad.a) s.jump = true;
      if ((pad.buttons[6]?.value ?? 0) > 0.4) s.strafe = true;
      s.push = Math.max(s.push, pad.buttons[7]?.value ?? 0);
      s.brake = Math.max(s.brake, pad.buttons[6]?.value ?? 0);
      if (btn(2)) s.boost = true;
      if (btn(0)) s.hold = true;
      if (btn(3) && !this.pad.y) s.mount = true;
      this.pad.y = btn(3);
      if (btn(12)) s.zoom -= 4 * dt;
      if (btn(13)) s.zoom += 4 * dt;
      this.pad.a = btn(0); this.pad.l3 = btn(10);
      if (rx || ry || pl > 0.01 || btn(0)) s.device = 'pad';
    }
    if (this.invertY) s.look.y = -s.look.y;
    return s;
  }

  /** Lets go of every key and drops the mouse's movement so far, as a menu opens. */
  release() {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.x = this.mouse.y = this.mouse.wheel = 0;
  }
}
