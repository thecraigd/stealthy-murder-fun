// Follow camera: 3/4 top-down, rotatable, zoomable, with look-ahead, shake
// and a cinematic override for kill-cams.
import * as THREE from 'three';
import { damp, dampAngle, clamp, lerp } from '../core/util.js';

export class CameraRig {
  constructor(aspect) {
    // near plane at 1 m: the camera never gets closer, and it buys depth precision
    // (thin floor layers shimmer on phones with 16-bit depth buffers otherwise)
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1.0, 400);
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.yaw = 0; // 0 = looking north (camera south of target)
    this.yawTarget = 0;
    this.pitch = 0.98; // radians from horizontal
    this.zoom = 0.45; // 0..1
    this.zoomTarget = 0.45;
    this.lead = new THREE.Vector3();
    this.shakeT = 0;
    this.shakeMag = 0;
    this.override = null; // {pos, look, t, dur}
    this.portrait = false;
  }

  get distance() {
    const base = lerp(10, 24, Math.min(1, this.zoom + (this.extraZoom || 0)));
    return this.portrait ? base * 1.35 : base;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.portrait = a < 0.9;
    this.camera.fov = this.portrait ? 50 : 40;
    this.camera.updateProjectionMatrix();
  }

  rotate(d) {
    this.yawTarget += d;
  }

  snapRotate(dir) {
    const step = Math.PI / 4;
    this.yawTarget = Math.round(this.yawTarget / step) * step + dir * step;
  }

  zoomBy(d) {
    this.zoomTarget = clamp(this.zoomTarget + d, 0, 1);
  }

  shake(mag = 0.3, t = 0.3) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
  }

  cinematic(pos, look, dur = 2) {
    this.override = { pos: pos.clone(), look: look.clone(), t: 0, dur };
  }

  // Convert a screen-space stick vector to world XZ, relative to camera yaw.
  toWorld(x, y) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward on screen (y+) = world direction the camera faces (-z at yaw 0)
    return { x: x * c - y * s, z: -x * s - y * c };
  }

  update(dt, targetPos, velocity) {
    this.yaw = dampAngle(this.yaw, this.yawTarget, 10, dt);
    this.zoom = damp(this.zoom, this.zoomTarget, 8, dt);
    // look-ahead
    const la = 0.45;
    this.lead.x = damp(this.lead.x, velocity.x * la, 2.5, dt);
    this.lead.z = damp(this.lead.z, velocity.z * la, 2.5, dt);
    this.target.set(targetPos.x + this.lead.x, 0.8, targetPos.z + this.lead.z);
    this.focus.x = damp(this.focus.x, this.target.x, 9, dt);
    this.focus.y = damp(this.focus.y, this.target.y, 9, dt);
    this.focus.z = damp(this.focus.z, this.target.z, 9, dt);

    const d = this.distance;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp * d, sp * d, Math.cos(this.yaw) * cp * d);
    const cam = this.camera;
    const desired = this.focus.clone().add(off);
    let look = this.focus.clone();

    if (this.override) {
      const o = this.override;
      o.t += dt;
      const k = clamp(o.t / 0.5, 0, 1) * clamp((o.dur - o.t) / 0.5, 0, 1);
      const e = k * k * (3 - 2 * k);
      desired.lerp(o.pos, e);
      look.lerp(o.look, e);
      if (o.t >= o.dur) this.override = null;
    }
    cam.position.copy(desired);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * clamp(this.shakeT / 0.3, 0, 1);
      cam.position.x += (Math.random() - 0.5) * m;
      cam.position.y += (Math.random() - 0.5) * m;
      cam.position.z += (Math.random() - 0.5) * m;
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
    cam.lookAt(look);
  }
}
