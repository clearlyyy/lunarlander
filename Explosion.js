
import * as THREE from "three";
import {
  ParticleSystem,
  SphereEmitter,
  ConstantValue,
  IntervalValue,
  ConstantColor,
  ColorOverLife,
  Gradient,
  ApplyForce,
  BatchedRenderer
} from "three.quarks";

export default class Explosion {
  constructor(opts = {}) {
    this.scene = opts.scene;
    this.position = opts.position || new THREE.Vector3();
    this.renderer = opts.renderer || new BatchedRenderer();
    if (opts.scene) opts.scene.add(this.renderer);

    // Particle sprite
    this.sprite = opts.texture || this._makeSpriteTexture();

    const material = new THREE.PointsMaterial({
      map: this.sprite,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      size: opts.startSize ?? 0.5
    });

    // Particle system
    this.system = new ParticleSystem({
      duration: opts.duration ?? 1.5,
      looping: false,
      shape: new SphereEmitter({ radius: opts.radius ?? 1.5 }),
      emissionOverTime: new ConstantValue(opts.emission ?? 1000),
      startLife: new IntervalValue(0.5, 1.2),
      startSpeed: new IntervalValue(5, 15),
      startSize: new ConstantValue(opts.startSize ?? 10),
      startColor: new ConstantColor(new THREE.Vector4(1, 0.5, 0, 1)),
      worldSpace: true,
      material,
      behaviors: [
        new ColorOverLife(
          new Gradient([
            [new THREE.Vector3(1, 0.5, 0), 0],
            [new THREE.Vector3(1, 0.2, 0), 0.5],
            [new THREE.Vector3(0.1, 0.1, 0.1), 1]
          ])
        ),
        new ApplyForce(new THREE.Vector3(0, 1, 0), new ConstantValue(1))
      ]
    });

    this.renderer.addSystem(this.system);

    // Container for positioning
    this.container = new THREE.Object3D();
    this.container.position.copy(this.position);

    if (this.system.mesh) {
      this.container.add(this.system.mesh);
    } else if (this.system.emitter) {
      this.container.add(this.system.emitter);
    }

    this.scene.add(this.container);

    this.alive = false;
  }

    explode(position) {
      this.position.copy(position);
      this.container.position.copy(position);

      // Fully restart the particle system manually
      this.system.age = 0;
      this.system.dead = false;
      this.system.alive = true;

      // Reactivate emitter so it spawns particles again
      if (this.system.emitter) {
        this.system.emitter.age = 0;
        this.system.emitter.dead = false;
        this.system.emitter.emit = true;
      }

      // Re-add if it was removed from the scene
      if (!this.container.parent && this.scene) {
        this.scene.add(this.container);
      }

      this.system.restart();

      this.alive = true;
   } 


  update(dt) {
    if (!this.alive) return;

    this.renderer.update(dt);

    // Stop updating once all particles are dead
    if (!this.system.alive) {
      this.alive = false;
      if (this.container.parent) {
        this.container.parent.remove(this.container);
      }
    }
  }

  _makeSpriteTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,200,150,1)");
    grad.addColorStop(0.5, "rgba(255,100,0,0.8)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
  }
}
