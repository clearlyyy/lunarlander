// Player.js

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import Ammo from 'ammo.js';
import { float } from 'three/tsl';
import { MTLLoader, OBJLoader } from 'three/examples/jsm/Addons.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RocketPlume from './RocketPlume';

const START_POS = new Ammo.btVector3(415000, 140000, 0);

export default class Player {
    constructor(scene, physics, camera, domElement, AmmoLib) {

        this.AmmoLib = AmmoLib;
        
        const gltfPath = './assets/models/apollo_craft/apollo_lander.glb';

        const gltfLoader= new GLTFLoader();
        gltfLoader.load(gltfPath, (gltf) => {
            const object = gltf.scene;
            object.scale.set(5,5,5);
            object.position.set(START_POS); 
            object.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            scene.add(object);
                this.mesh = object;
                
                this.plume = new RocketPlume({scene: scene});
                this.mesh.add(this.plume.container);
                this.plume.container.position.set(0,-2.3,0);
            });
            
        // Physics body
        this.gravity = -9.62;
        this.angularVelocity = new this.AmmoLib.btVector3(0,0,0);
        this.throttle = 0;
        this.mass = 15000; // IN KG
            
        const shape = new AmmoLib.btBoxShape(new AmmoLib.btVector3(8, 13, 8));
        
        const debugGeo = new THREE.BoxGeometry(16,26,16);
        const debugMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true
        });
        this.debugMesh = new THREE.Mesh(debugGeo, debugMaterial);
        scene.add(this.debugMesh);

        const transform = new AmmoLib.btTransform();
        transform.setIdentity();
        transform.setOrigin(START_POS);
        const motionState = new AmmoLib.btDefaultMotionState(transform);
        const localInertia = new AmmoLib.btVector3(0, 0, 0);
        shape.calculateLocalInertia(this.mass, localInertia);
        const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(this.mass, motionState, shape, localInertia);
        this.body = new AmmoLib.btRigidBody(rbInfo);

        this.body.setCcdMotionThreshold(1e-7);
        this.body.setCcdSweptSphereRadius(2);
        this.body.setFriction(1.0);
        this.body.setRollingFriction(0.5);
        this.body.setRestitution(0.0);
        this.body.setSleepingThresholds(0.01, 0.01);
        physics.addBody(this.body);
        physics.world.setGravity(new Ammo.btVector3(0, 0, 0));

        // Input
        this.yaw = 0;
        this.pitch = 0;
        this.sensitivity = 0.002;

        this.movement = {
            forward: false, backward: false,
            left: false, right: false,
            up: false, down: false,
            speed: 10000
        }

        this.engineSound = new Audio('/sounds/thruster.wav');
        this.engineSound.loop = true;
        this.engineSound.volume = 0.0001;
        this.engineSound.play();

        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => this._setKey(e.code, true));
        document.addEventListener('keyup', (e) => this._setKey(e.code, false));
    }

    _setKey(code, value) {
        switch (code) {
            case 'KeyW': this.movement.forward = value; break;   // pitch down
            case 'KeyS': this.movement.backward = value; break;  // pitch up
            case 'KeyA': this.movement.left = value; break;      // yaw left
            case 'KeyD': this.movement.right = value; break;     // yaw right
            case 'KeyQ': this.movement.rollLeft = value; break;  // roll left
            case 'KeyE': this.movement.rollRight = value; break; // roll right
            case 'Space': this.movement.up = value; break;       
            case 'ShiftLeft':
            case 'ShiftRight': this.movement.down = value; break;
        }
    }
    getPosition() {
        const trans = this.body.getWorldTransform();
        const origin = trans.getOrigin();
        return new THREE.Vector3(origin.x(), origin.y(), origin.z());
    }

    applyForce(forceVec) {
        const f = new this.AmmoLib.btVector3(forceVec.x, forceVec.y, forceVec.z);
        this.body.applyCentralForce(f);
        this.AmmoLib.destroy(f);
    }

    updateFromPhysics() {
        const transform = this.body.getWorldTransform();
        const origin = transform.getOrigin();
        const rotation = transform.getRotation();
        if (this.mesh) {
            this.mesh.position.set(origin.x(), origin.y(), origin.z());
            this.mesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
        }
        if (this.debugMesh) {
            this.debugMesh.position.set(origin.x(), origin.y(), origin.z());
            this.debugMesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
        }
    }
    
    applyMovement(dt) {

        // Apply Gravity
        //this.body.applyCentralForce(new this.AmmoLib.btVector3(0, this.gravity, 0));
        //const mass = 15000; // Mass of Apollo Lander

        if (this.movement.up) { this.throttle = 10000000 } else { this.throttle = 0; }
        const vel = this.body.getLinearVelocity();
        //console.log(vel.x(), vel.y(), vel.z());

        // Calculate current UP Vector for throttle.
        const transform = this.body.getWorldTransform();
        const rotation = transform.getRotation();
        const q = new THREE.Quaternion(rotation.x(), rotation.y(), rotation.z(), rotation.w());
        const localUp = new THREE.Vector3(0, 1, 0);
        const worldUp = localUp.applyQuaternion(q);

        const force = new this.AmmoLib.btVector3(
            worldUp.x * this.throttle,
            worldUp.y * this.throttle,
            worldUp.z * this.throttle
        )

        this.body.applyCentralForce(force);
        this.AmmoLib.destroy(force);

        const maxThrottle = 1000000; // same as your throttle
        if (this.throttle > 0) {
            this.engineSound.volume = Math.min(this.throttle / maxThrottle, 1);
        } else {
            this.engineSound.volume = 0.1; // keep engine "warm" to avoid click
        }
        if (this.plume) this.plume.update(dt, this.throttle);
    }

    
    applyRotation() {
        const AmmoLib = this.AmmoLib;

        const rotationSpeed = 0.03; // radians/sec
        const damping = 0.99;

        const angularVel = this.angularVelocity || new AmmoLib.btVector3(0, 0, 0);

        // Current rotation
        const transform = this.body.getWorldTransform();
        const rot = transform.getRotation();
        const quat = new THREE.Quaternion(rot.x(), rot.y(), rot.z(), rot.w());

        // Local axes in world space
        const localForward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat); // For roll
        const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);      // For yaw
        const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);   // For pitch

        const deltaAngular = new THREE.Vector3();

        // Pitch (W/S)
        if (this.movement.forward) deltaAngular.add(localRight.clone().multiplyScalar(rotationSpeed));   // pitch down
        if (this.movement.backward) deltaAngular.add(localRight.clone().multiplyScalar(-rotationSpeed)); // pitch up

        // Roll (Q/E)
        if (this.movement.rollLeft) deltaAngular.add(localUp.clone().multiplyScalar(rotationSpeed));  // yaw left
        if (this.movement.rollRight) deltaAngular.add(localUp.clone().multiplyScalar(-rotationSpeed)); // yaw right
        
        // Yaw (A/D)
        if (this.movement.left) deltaAngular.add(localForward.clone().multiplyScalar(rotationSpeed));   // roll left
        if (this.movement.right) deltaAngular.add(localForward.clone().multiplyScalar(-rotationSpeed)); // roll right

        // Damping + additive
        angularVel.setX(angularVel.x() * damping + deltaAngular.x);
        angularVel.setY(angularVel.y() * damping + deltaAngular.y);
        angularVel.setZ(angularVel.z() * damping + deltaAngular.z);

        this.body.setAngularVelocity(angularVel);
        this.angularVelocity = angularVel;
    }
}