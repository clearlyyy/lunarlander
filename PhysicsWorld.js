import Ammo from 'ammo.js';

export default class PhysicsWorld {
    constructor(AmmoLib) {
        AmmoLib.ALLOW_MEMORY_GROWTH = true;
        const config = new AmmoLib.btDefaultCollisionConfiguration();
        const dispatcher = new AmmoLib.btCollisionDispatcher(config);
        const broadphase = new AmmoLib.btDbvtBroadphase();
        const solver = new AmmoLib.btSequentialImpulseConstraintSolver();
        this.world = new AmmoLib.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
    }

    step(delta) {
        this.world.stepSimulation(delta, 10, 1/60);
    }

    addBody(body) {
        this.world.addRigidBody(body);
    }

    removeBody(body) {
        this.world.removeRigidBody(body);
    }
}