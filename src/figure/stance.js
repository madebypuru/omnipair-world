// His stance on the board, set on the bones after the clips have had them (the idle under it): side-on, left foot
// forward, knees bent, back bent over them, arms out a little. `pose` blends four arm poses and a crouch:
//   ride   arms out low along the board          crouch  arms forward and down, hips low (before a leap)
//   air    arms up                                glide   arms out wide and level
// Directions are in his own frame: +x his left (the board's nose), +y up, +z where his chest faces.
import * as THREE from 'three';

const ARMS = {
  ride: { l: [[0.8, -0.55, 0.22], [0.9, -0.2, 0.36]], r: [[-0.8, -0.56, 0.2], [-0.88, -0.26, 0.34]] },
  crouch: { l: [[0.32, -0.82, 0.48], [0.22, -0.55, 0.8]], r: [[-0.3, -0.84, 0.46], [-0.18, -0.6, 0.78]] },
  air: { l: [[0.5, 0.82, 0.2], [0.32, 0.94, 0.1]], r: [[-0.5, 0.82, 0.2], [-0.3, 0.95, 0.08]] },
  glide: { l: [[0.97, 0.12, 0.12], [0.98, 0.18, 0.06]], r: [[-0.97, 0.12, 0.12], [-0.98, 0.18, 0.06]] },
};
const NAMES = Object.keys(ARMS);
const CHAIN = { l: [['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l']], r: [['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r']] };

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), want = new THREE.Vector3(), from = new THREE.Vector3();
const swing = new THREE.Quaternion(), pq = new THREE.Quaternion(), wq = new THREE.Quaternion();

export class Stance {
  constructor(animator) {
    this.A = animator;
    this.bones = animator.bones;
    this.object = animator.object;
  }

  /**
   * weights: { ride, crouch, air, glide } (any subset, normalised); crouch: metres the hips go down; feet: the two
   * points on the deck, world, { l, r }; up: the deck's normal.
   */
  pose(weights, crouch, feet, up) {
    const b = this.bones, o = this.object;
    o.updateMatrixWorld(true);
    // hips down along the deck's normal, then each ankle back onto its mark
    const pelvis = b.pelvis;
    const p = pelvis.getWorldPosition(v1);
    const mid = v2.copy(feet.l).add(feet.r).multiplyScalar(0.5);
    const rest = this.restHip ??= p.y - o.position.y;
    want.copy(mid).addScaledVector(up, rest - crouch);
    pelvis.position.copy(pelvis.parent.worldToLocal(want.clone()));
    pelvis.updateMatrixWorld(true);
    for (const s of ['l', 'r']) {
      const ankle = b[`foot_${s}`].getWorldPosition(new THREE.Vector3());
      const target = feet[s].clone().addScaledVector(up, 0.085);
      this.A.legIK(s, target.sub(ankle));
    }
    // the back bends forward over the knees, more the lower he crouches: a rider, not a walker
    const bend = 0.18 + 0.9 * crouch;
    swing.setFromAxisAngle(v1.set(1, 0, 0).applyQuaternion(o.getWorldQuaternion(wq)), bend / 2);
    for (const name of ['spine_01', 'spine_02']) {
      const bn = b[name];
      if (!bn) continue;
      bn.parent.getWorldQuaternion(pq); bn.getWorldQuaternion(wq);
      bn.quaternion.copy(pq.invert().multiply(wq.premultiply(swing)));
      bn.updateMatrixWorld(true);
    }
    // the arms, each bone swung so it points where the blend says
    let total = 0;
    for (const n of NAMES) total += weights[n] ?? 0;
    total ||= 1;
    for (const side of ['l', 'r']) {
      CHAIN[side].forEach(([bone, child], k) => {
        want.set(0, 0, 0);
        for (const n of NAMES) {
          const w = (weights[n] ?? 0) / total;
          if (w > 0) want.add(v1.fromArray(ARMS[n][side][k]).normalize().multiplyScalar(w));
        }
        want.normalize().applyQuaternion(o.getWorldQuaternion(wq));
        const bn = b[bone];
        from.setFromMatrixPosition(b[child].matrixWorld).sub(v1.setFromMatrixPosition(bn.matrixWorld)).normalize();
        swing.setFromUnitVectors(from, want);
        bn.parent.getWorldQuaternion(pq); bn.getWorldQuaternion(wq);
        bn.quaternion.copy(pq.invert().multiply(swing.multiply(wq)));
        bn.updateMatrixWorld(true);
      });
    }
  }
}
