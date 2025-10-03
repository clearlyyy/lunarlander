import * as THREE from "three";
import {
  ParticleSystem,
  ConeEmitter,
  ConstantValue,
  IntervalValue,
  ConstantColor,
  Gradient,
  ColorOverLife,
  ApplyForce,
  BatchedRenderer
} from "three.quarks";

export default class RocketPlume {
  constructor(opts = {}) {
    this.opts = opts;

    // Create renderer
    this.renderer = new BatchedRenderer();
    if (opts.scene) opts.scene.add(this.renderer);

    // Sprite material
    const sprite = (opts.texture instanceof THREE.Texture)
      ? opts.texture
      : this._makeSpriteTexture();

    const material = new THREE.PointsMaterial({
      map: sprite,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      size: opts.startSize ?? 0.15, // smaller, sharper particles
    });

    // Particle system
    this.system = new ParticleSystem({
      duration: opts.duration ?? 0.5, // shorter lifespan
      looping: true,
      shape: new ConeEmitter({
        radius: opts.radius ?? 0.4, // narrow cone
        angle: THREE.MathUtils.degToRad(opts.angleDeg ?? 30), // very tight
        thickness: 1,
        arc: Math.PI * 2,
      }),
      emissionOverTime: new ConstantValue(opts.emissionRate ?? 500),
      startLife: new IntervalValue(opts.minLife ?? 0.05, opts.maxLife ?? 0.1),
      startSpeed: new IntervalValue(opts.minSpeed ?? 15, opts.maxSpeed ?? 18), // fast
      startSize: new ConstantValue(opts.startSize ?? 0.7),
      startColor: new ConstantColor(new THREE.Vector4(0.8, 0.9, 1.0, 1.0)), // bluish-white
      worldSpace: false,
      material,
      behaviors: [
        new ColorOverLife(
          new Gradient([
            [new THREE.Vector3(0.8, 0.9, 1.0), 0.0], // start bluish-white
            [new THREE.Vector3(0.6, 0.8, 1.0), 0.5], // slightly fade
            [new THREE.Vector3(0.4, 0.6, 1.0), 1.0]  // fade out at end
          ])
        ),
        new ApplyForce(new THREE.Vector3(0, 1, 0), new ConstantValue(0.1)) // very gentle upward push
      ]
    });

    this.renderer.addSystem(this.system);

    // Anchor container
    this.container = new THREE.Object3D();
    if (this.system.mesh) {
      this.container.add(this.system.mesh);
    } else if (this.system.emitter) {
      this.container.add(this.system.emitter);
    } else {
      console.warn("RocketPlume: no mesh or emitter found", this.system);
    }
    if (opts.position) this.container.position.copy(opts.position);

    if (opts.scene) opts.scene.add(this.container);

    this.container.rotation.x = Math.PI / 2;
  }

  update(dt, throttle = 0) {
      if (this.renderer && typeof this.renderer.update === "function") {
        this.renderer.update(dt);
      }
  
      // throttle-controlled emission
      if (this.system.emissionOverTime && typeof this.system.emissionOverTime.setValue === "function") {
        this.system.emissionOverTime.setValue(throttle > 0 ? 400 : 0);
      } else if (this.system.emissionOverTime && 'value' in this.system.emissionOverTime) {
        this.system.emissionOverTime.value = throttle > 0 ? 400 : 0;
      }
    }

  _makeSpriteTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, "rgba(200,230,255,1)"); // bluish-white center
    grad.addColorStop(0.2, "rgba(180,210,255,0.8)");
    grad.addColorStop(0.5, "rgba(150,180,255,0.5)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,size,size);
    return new THREE.CanvasTexture(canvas);
  }
}
