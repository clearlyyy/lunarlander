// Player.js

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import Ammo from 'ammo.js';
import { float, objectRadius } from 'three/tsl';
import { MTLLoader, OBJLoader } from 'three/examples/jsm/Addons.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RocketPlume from './RocketPlume';

const START_POS = new Ammo.btVector3(415122, 127557, -11914);

export default class Player {
    constructor(scene, physics, camera, domElement, AmmoLib, useRealValues, hasDied, easyControls = false, isInMainMenu) {
        this.hasDied = hasDied;
        this.useRealValues = useRealValues;
        this.isInMainMenu = isInMainMenu;

        this.AmmoLib = AmmoLib;

        this.velocityText = document.getElementById("velocity");
        this.throttleContainer = document.getElementById("throttle-container");
        this.throttleIndicator = document.getElementById("throttle-bar");
        const descentContainer = document.getElementById("descent-container");
        const descentIndicator = document.getElementById("descent-bar");

        this.camera = camera;
        this.easyControls = easyControls;

        this.hasCollided = false;
        this.maxThrottle = 70000; // In Kilo Newtons 

        const gltfPath = './assets/models/apollo_craft/apollo_lander.glb';

        const gltfLoader = new GLTFLoader();
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
            this.mesh.castShadow = true;
            this.plume = new RocketPlume({scene: scene});
            this.mesh.add(this.plume.container);
            this.plume.container.position.set(0,-2.3,0);
        });
        
        // Physics body
        this.gravity = -9.62;
        this.angularVelocity = new this.AmmoLib.btVector3(0,0,0);
        this.throttle = 0;
        this.mass = 10000; // IN KG
        
        // --- COMPOUND SHAPE ---
        const compoundShape = new AmmoLib.btCompoundShape();

        // Box 1
        const box1HalfExtents = new AmmoLib.btVector3(14, 4, 14);
        const box1Shape = new AmmoLib.btBoxShape(box1HalfExtents);
        const box1Transform = new AmmoLib.btTransform();
        box1Transform.setIdentity();
        box1Transform.setOrigin(new AmmoLib.btVector3(0, -8.2, 0));
        compoundShape.addChildShape(box1Transform, box1Shape);

        // Box 2 (offset above the first box)
        const box2HalfExtents = new AmmoLib.btVector3(7.5, 5, 7.5);
        const box2Shape = new AmmoLib.btBoxShape(box2HalfExtents);
        const box2Transform = new AmmoLib.btTransform();
        box2Transform.setIdentity();
        box2Transform.setOrigin(new AmmoLib.btVector3(0, 5, 0)); // adjust Y offset
        compoundShape.addChildShape(box2Transform, box2Shape);

        // Ammo rigid body
        const transform = new AmmoLib.btTransform();
        transform.setIdentity();
        transform.setOrigin(START_POS);
        const motionState = new AmmoLib.btDefaultMotionState(transform);

        const localInertia = new AmmoLib.btVector3(0, 0, 0);
        compoundShape.calculateLocalInertia(this.mass, localInertia);

        const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(this.mass, motionState, compoundShape, localInertia);
        this.body = new AmmoLib.btRigidBody(rbInfo);

        this.body.setCcdMotionThreshold(1e-7);
        this.body.setCcdSweptSphereRadius(2);
        this.body.setFriction(1.0);
        this.body.setRollingFriction(0.0);
        this.body.setRestitution(0.0);
        this.body.setSleepingThresholds(0, 0);
        
        physics.addBody(this.body);
        physics.world.setGravity(new AmmoLib.btVector3(0, 0, 0));
        this.prevPosition = new THREE.Vector3();

        // Input
        this.yaw = 0;
        this.pitch = 0;
        this.sensitivity = 0.002;

        this.movement = {
            forward: false, backward: false,
            left: false, right: false,
            up: false, down: false,
            speed: 10000
        };

        this.engineSound = new Audio('/sounds/thruster.wav');
        this.engineSound.loop = true;
        this.engineSound.volume = 0.0001;
        this.engineSound.play();

        if (this.useRealValues) {
            // Use real stats for the spacecraft (this feels pretty slow and kind of boring)
            this.maxThrottle = 45000;
        }
        else {
            // This feels a bit more fun paired with a stronger gravity on the moon
            this.maxThrottle = 1000000;
        }

        this._bindEvents();
    } 

    _bindEvents() {
        document.addEventListener('keydown', (e) => this._setKey(e.code, true));
        document.addEventListener('keyup', (e) => this._setKey(e.code, false));
        document.addEventListener('keypress', (e) => this.isNoClip = !this.isNoClip);
    }

    _setKey(code, value) {
        switch (code) {
            case 'KeyW': this.movement.forward = value; break;   // pitch down
            case 'KeyS': this.movement.backward = value; break;  // pitch up
            case 'KeyA': this.movement.rollLeft = value; break;      // yaw left
            case 'KeyD': this.movement.rollRight = value; break;     // yaw right
            case 'KeyQ': this.movement.left = value; break;  // roll left
            case 'KeyE': this.movement.right = value; break; // roll right
            case 'Space': this.movement.up = value; break;
            case 'KeyZ': this.movement.fullThrottle = value; break;
            case 'KeyX': this.movement.killThrottle = value; break;
            case 'ShiftLeft': this.movement.increaseThrottle = value; break;
            case 'ControlLeft': this.movement.decreaseThrottle = value; break;
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

        const vel = this.body.getLinearVelocity();
        const velocity = new THREE.Vector3(vel.x(), vel.y(), vel.z());
        const speed = velocity.length();
        this.velocityText.innerText = speed.toFixed(2) + " m/s";

    }

    updatePreviousVelocity() {
        const lv = this.body.getLinearVelocity();
        this.prevVelocity = new THREE.Vector3(lv.x(), lv.y(), lv.z());

        const av = this.body.getAngularVelocity();
        this.prevAngular = new THREE.Vector3(av.x(), av.y(), av.z());
    } 

    getImpactVelocity(normal) {
        // Project previous velocity onto collision normal
        return -this.prevVelocity.dot(normal);
    } 

    applyMovement(dt) {

        if (this.hasDied || this.isInMainMenu()) return;

        // Apply Gravity
        //this.body.applyCentralForce(new this.AmmoLib.btVector3(0, this.gravity, 0));
        //const mass = 15000; // Mass of Apollo Lander

        if (this.movement.fullThrottle) { this.throttle = this.maxThrottle }
        if (this.movement.killThrottle) {this.throttle = 0}
        if (this.movement.increaseThrottle && this.throttle < this.maxThrottle) { this.throttle += this.maxThrottle/70; }
        if (this.movement.decreaseThrottle && this.throttle > 0) {this.throttle -= this.maxThrottle/70; }
        
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

        const maxThrottle = this.maxThrottle; 
        if (this.throttle > 0) {
            this.engineSound.volume = Math.min(this.throttle / maxThrottle, 1);
        } else {
            this.engineSound.volume = 0.1; // keep engine "warm" to avoid click
        }
        if (this.plume) this.plume.update(dt, this.throttle, this.maxThrottle);

        this.updateUIElements();
    }

    updateUIElements() {
        if (!this.throttleContainer || !this.throttleIndicator) return;

        // --- Throttle Bar ---
        const throttle = this.throttle;
        const maxThrottle = this.maxThrottle;
        const tNorm = Math.min(throttle / maxThrottle, 1);
        const throttleTop = this.throttleContainer.clientHeight - this.throttleIndicator.clientHeight - tNorm * (this.throttleContainer.clientHeight - this.throttleIndicator.clientHeight) + 10 ;
        this.throttleIndicator.style.top = `${throttleTop}px`;

        // --- Descent Bar ---
        const descentContainer = document.getElementById("descent-container");
        const descentIndicator = document.getElementById("descent-bar");
        if (!descentContainer || !descentIndicator) return;

        const moonCenter = new THREE.Vector3(0,0,0);
        const pos = this.getPosition();
        const downVec = moonCenter.clone().sub(pos).normalize();

        const vel = this.getVelocity();
        const descentSpeed = vel.dot(downVec);

        const maxDescentSpeed = 50; // tweak to taste
        const t = Math.min(descentSpeed / maxDescentSpeed, 1);

        const top = descentContainer.clientHeight - descentIndicator.clientHeight - t * (descentContainer.clientHeight - descentIndicator.clientHeight);
        descentIndicator.style.top = `${top}px`;
    }
 

    getVelocity() {
        const vel = this.body.getLinearVelocity();
        return new THREE.Vector3(vel.x(), vel.y(), vel.z());
    }

    getQuaternion() {
        const transform = this.body.getWorldTransform();
        const rot = transform.getRotation();
        return new THREE.Quaternion(rot.x(), rot.y(), rot.z(), rot.w());
    }

    
    applyRotation() {
        let rotationSpeed = 0.03;   // radians/sec for user input
        let userDamping = 0.9;      // strong damping on user input
        let physicsDamping = 0.995; // light damping on physics rotation
        if (this.easyControls) {
            rotationSpeed = 0.1;
            userDamping = 0.85;      // strong damping on user input
            physicsDamping = 0.97; // light damping on physics rotation
        }

        // Get current rotation
        const transform = this.body.getWorldTransform();
        const rot = transform.getRotation();
        const quat = new THREE.Quaternion(rot.x(), rot.y(), rot.z(), rot.w());

        let baseQuat = quat;
        if (this.easyControls && this.camera) {
            baseQuat = this.camera.quaternion.clone();
        }

        // Local axes in world space
        const localForward = new THREE.Vector3(0, 0, 1).applyQuaternion(baseQuat);
        const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuat);
        const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(baseQuat);

        // Compute user input angular change
        const deltaAngular = new THREE.Vector3();
        if (this.movement.forward)  deltaAngular.add(localRight.clone().multiplyScalar(rotationSpeed));
        if (this.movement.backward) deltaAngular.add(localRight.clone().multiplyScalar(-rotationSpeed));
        if (this.movement.left)      deltaAngular.add(localUp.clone().multiplyScalar(rotationSpeed));   // yaw
        if (this.movement.right)     deltaAngular.add(localUp.clone().multiplyScalar(-rotationSpeed));
        if (this.movement.rollLeft)  deltaAngular.add(localForward.clone().multiplyScalar(rotationSpeed)); // roll
        if (this.movement.rollRight) deltaAngular.add(localForward.clone().multiplyScalar(-rotationSpeed)); 

        // Get current physics angular velocity
        const angularVel = this.body.getAngularVelocity();

        // Apply light damping to physics-driven rotation
        angularVel.setX(angularVel.x() * physicsDamping + deltaAngular.x * userDamping);
        angularVel.setY(angularVel.y() * physicsDamping + deltaAngular.y * userDamping);
        angularVel.setZ(angularVel.z() * physicsDamping + deltaAngular.z * userDamping);

        this.body.setAngularVelocity(angularVel);
    }

    setPosition(pos) {
        const transform = new this.AmmoLib.btTransform();
        transform.setIdentity();
        
        // Set new position
        transform.setOrigin(new this.AmmoLib.btVector3(pos.x, pos.y, pos.z));
        
        // Keep the current rotation
        const currentRot = this.body.getWorldTransform().getRotation();
        transform.setRotation(currentRot);
        
        // Apply to the body
        this.body.setWorldTransform(transform);
        
        // Update motion state if it exists (important for simulation)
        if (this.body.getMotionState()) {
            this.body.getMotionState().setWorldTransform(transform);
        }
    
        this.AmmoLib.destroy(transform); // clean up
    }


    //For when we die
    hideAndStop() {
        // Hide 3D mesh
        if (this.mesh) this.mesh.visible = false;

        // Stop physics updates by removing from physics world
        if (this.body && this.physics) {
            this.physics.world.removeRigidBody(this.body);
            this.bodyRemoved = true;
        }
        this.engineSound.volume = 0.1;
        // Stop plume emission and engine sound
        if (this.plume) {
            this.plume.container.visible = false;
        }

    }

    // If we want to continue
    showAndStart() {
        // Show mesh
        if (this.mesh) this.mesh.visible = true;

        // Re-add body to physics world if it was removed
        if (this.body && this.bodyRemoved && this.physics) {
            this.physics.addBody(this.body);
            this.bodyRemoved = false;
        }

        // Resume plume emission and engine sound
        if (this.plume) this.plume.container.visible = true;
        if (this.engineSound) this.engineSound.play();

        // Reset position to START_POS
        const transform = new this.AmmoLib.btTransform();
        transform.setIdentity();
        transform.setOrigin(START_POS);            // <-- sets Ammo body to START_POS
        transform.setRotation(this.body.getWorldTransform().getRotation()); // keep rotation
        this.body.setWorldTransform(transform);
        if (this.body.getMotionState()) {
            this.body.getMotionState().setWorldTransform(transform);
        }

        // Update mesh immediately
        if (this.mesh) {
            this.mesh.position.set(START_POS.x(), START_POS.y(), START_POS.z());
        }

        this.body.setLinearVelocity(0);
        this.body.setAngularVelocity(0);
    }
 

 
}