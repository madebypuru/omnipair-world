// The eye: well back from the wanderer and a little to one side, so the figure sits small in the lower third of the
// canvas and the wood is the picture. It trails softly, stays off the ground and comes in when a trunk is in the way.
import * as THREE from 'three';

const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

export class Follow {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // looks along (sin yaw, 0, cos yaw)
    this.pitch = 0.05; // + looks down on him
    this.want = 6.4;
    this.distance = 6.4;
    this.side = 0.95;
    this.lift = 0.85;
    this.pivot = new THREE.Vector3();
    this.free = null; // { position, target }: a fixed view, for stills
    this.pitchRange = [-0.75, 1.2]; // how far the eye may go under him and over him, radians
    this.reach = [2.8, 13]; // nearest and farthest the wheel takes it, metres
    this.sink = 0; // when the ground lifts the eye, how far the look comes down with it to keep him in the picture (0..1)
  }

  update(dt, target, look, zoom, castRay, groundAt) {
    const cam = this.camera;
    if (this.free) { cam.position.copy(this.free.position); cam.lookAt(this.free.target); return; }
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, this.pitchRange[0], this.pitchRange[1]);
    // each step of the wheel is a share of the distance, so far out it still moves
    this.want = THREE.MathUtils.clamp(this.want * (1 + zoom * 0.09) + zoom * 0.12, this.reach[0], this.reach[1]);
    const goal = new THREE.Vector3(target.x, target.y + 1.35, target.z);
    if (this.pivot.lengthSq() === 0) this.pivot.copy(goal);
    this.pivot.x = damp(this.pivot.x, goal.x, 10, dt);
    this.pivot.z = damp(this.pivot.z, goal.z, 10, dt);
    this.pivot.y = damp(this.pivot.y, goal.y, 5, dt);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const back = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const k = Math.min(1, this.want / 6.4);
    const from = this.pivot.clone().addScaledVector(right, this.side * k);
    const hit = castRay(from, back, this.want + 0.4);
    const free = hit == null ? this.want : Math.max(0.8, hit - 0.3);
    this.distance = free < this.distance ? damp(this.distance, free, 18, dt) : damp(this.distance, free, 2.5, dt);
    cam.position.copy(from).addScaledVector(back, this.distance);
    const floor = groundAt(cam.position.x, cam.position.z) + 0.45;
    let raised = 0;
    if (cam.position.y < floor) { raised = floor - cam.position.y; cam.position.y = floor; }
    cam.lookAt(from.x - back.x * 6, from.y - back.y * 6 + this.lift * k - raised * this.sink, from.z - back.z * 6);
  }
}
