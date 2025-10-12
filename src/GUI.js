import * as THREE from 'three';

// GUI.js
export default class GUI {
  constructor(player, opts = {}) {
    this.player = player;

    
    this.container = document.createElement('div');
    this.container.style.position = 'absolute';
    this.container.style.top = '10px';
    this.container.style.left = '10px';
    this.container.style.padding = '10px';
    this.container.style.backgroundColor = 'rgba(0,0,0,0.5)';
    this.container.style.color = 'white';
    this.container.style.fontFamily = 'monospace';
    this.container.style.fontSize = '14px';
    this.container.style.zIndex = '100';
    this.container.style.pointerEvents = 'none'; 
    document.body.appendChild(this.container);

    // Create fields
    this.velEl = this._createField('Velocity');
    this.combinedVelEl = this._createField('Speed');
    this.posEl = this._createField('Position');
    this.rotEl = this._createField('Rotation');
  }

  _createField(label) {
    const el = document.createElement('div');
    el.innerHTML = `${label}: <span>0</span>`;
    this.container.appendChild(el);
    return el.querySelector('span');
  }

  update() {
    if (!this.player) return;

    // Linear velocity
    const vel = this.player.body.getLinearVelocity();
    const vx = vel.x().toFixed(2);
    const vy = vel.y().toFixed(2);
    const vz = vel.z().toFixed(2);
    this.velEl.innerText = `(${vx}, ${vy}, ${vz})`;

    // Combined speed 
    const speed = Math.sqrt(vel.x()*vel.x() + vel.y()*vel.y() + vel.z()*vel.z());
    this.combinedVelEl.innerText = speed.toFixed(2);

    // Position
    const pos = this.player.body.getWorldTransform().getOrigin();
    this.posEl.innerText = `(${pos.x().toFixed(2)}, ${pos.y().toFixed(2)}, ${pos.z().toFixed(2)})`;

    // Rotation 
    const rot = this.player.body.getWorldTransform().getRotation();
    const quat = new THREE.Quaternion(rot.x(), rot.y(), rot.z(), rot.w());
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    this.rotEl.innerText = `(${THREE.MathUtils.radToDeg(euler.x).toFixed(1)}, ${THREE.MathUtils.radToDeg(euler.y).toFixed(1)}, ${THREE.MathUtils.radToDeg(euler.z).toFixed(1)})`;
  }
}
