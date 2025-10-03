import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';

import Ammo from 'ammo.js';
import Player from './player';
import ShipCamera from './shipCamera'; 
import GUI from './GUI.js'

// =====================================================
// Renderer / Scene Setup
// =====================================================
class Renderer3D {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e7);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        this.addLights();
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(1737000 * 2, 1737000, 1737000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

// =====================================================
// Physics World
// =====================================================
class PhysicsWorld {
    constructor(AmmoLib) {
        const config = new AmmoLib.btDefaultCollisionConfiguration();
        const dispatcher = new AmmoLib.btCollisionDispatcher(config);
        const broadphase = new AmmoLib.btDbvtBroadphase();
        const solver = new AmmoLib.btSequentialImpulseConstraintSolver();
        this.world = new AmmoLib.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
    }

    step(delta) {
        this.world.stepSimulation(delta, 10, 1/240);
    }

    addBody(body) {
        this.world.addRigidBody(body);
    }

    removeBody(body) {
        this.world.removeRigidBody(body);
    }
}



// =====================================================
// Tile Manager 
// =====================================================
const SCALE = 1 / 4;
class TileManager {
    constructor(scene, physics, camera, renderer) {
        this.scene = scene;
        this.physics = physics;
        this.camera = camera;
        this.renderer = renderer;
        this.tilesRenderer = null;

        this.currentCollisionBody = null;
        this.currentCollisionMesh = null;
        this.currentTile = null;
    }

    async init() {
        const assetId = 2684829;
        const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3OTRiMmZhOS0xNzkxLTQyZDUtOTlhYy0zMGQ0YWVjMmZlYTUiLCJpZCI6MzQ2NDI5LCJpYXQiOjE3NTkzNTQzNTF9.3h2-SgUFlkPWdSz9PrgA7w7qZJVnDdB3IuIbyf6iDK4';
        const url = new URL(`https://api.cesium.com/v1/assets/${assetId}/endpoint`);
        url.searchParams.append('access_token', accessToken);

        const res = await fetch(url, { mode: 'cors' });
        const json = await res.json();
        const endpointUrl = new URL(json.url);
        const version = endpointUrl.searchParams.get('v');

        this.tilesRenderer = new TilesRenderer(endpointUrl);
        this.tilesRenderer.fetchOptions = { headers: { Authorization: `Bearer ${json.accessToken}` } };
        this.tilesRenderer.preprocessURL = (uri) => {
            uri = new URL(uri);
            uri.searchParams.set('v', version);
            return uri.toString();
        };
        this.tilesRenderer.setCamera(this.camera);
        this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
        this.tilesRenderer.group.scale.set(SCALE, SCALE, SCALE);


        this.tilesRenderer.addEventListener('load-model', ({ scene: tileScene }) => {
            tileScene.traverse((c) => {
                if (c.isMesh && c.material) {
                    c.material.needsUpdate = true;
                    c.castShadow = true;
                    c.receiveShadow = true;
                }
            });
        });

        this.tilesRenderer.addEventListener('load-tileset', () => {
            const sphere = new THREE.Sphere();
            this.tilesRenderer.getBoundingSphere(sphere);
            this.tilesRenderer.group.position.copy(sphere.center).negate();
        });


        this.scene.add(this.tilesRenderer.group);
    }

    update() {
        if (this.tilesRenderer) this.tilesRenderer.update();
    }

    generateCollision(apolloMesh, AmmoLib) {
    if (!this.tilesRenderer) return;
    const tile = this._findClosestTile(apolloMesh);
    if (!tile || tile === this.currentTile) return;

    // Cleanup old collision
    if (this.currentCollisionBody) {
        this.physics.removeBody(this.currentCollisionBody);
        AmmoLib.destroy(this.currentCollisionBody);
        this.currentCollisionBody = null;
    }
    if (this.currentCollisionMesh) {
        this.scene.remove(this.currentCollisionMesh);
        this.currentCollisionMesh.geometry.dispose();
        this.currentCollisionMesh.material.dispose();
        this.currentCollisionMesh = null;
    }

    this.currentTile = tile;

    // Get world transform (already includes group scale)
    const tilePos = new THREE.Vector3();
    const tileQuat = new THREE.Quaternion();
    const tileScale = new THREE.Vector3();
    tile.matrixWorld.decompose(tilePos, tileQuat, tileScale);

    // Clone geometry and apply tile’s transform (position, rotation, scale)
    const geometry = tile.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0), tileQuat, tileScale
    ));

    // Convert to Ammo collision shape
    const shape = this._convertMeshToShape(geometry, AmmoLib);

    // Create rigid body transform
    const transform = new AmmoLib.btTransform();
    transform.setIdentity();
    transform.setOrigin(new AmmoLib.btVector3(tilePos.x, tilePos.y, tilePos.z));

    const motionState = new AmmoLib.btDefaultMotionState(transform);
    this.currentCollisionBody = new AmmoLib.btRigidBody(
        new AmmoLib.btRigidBodyConstructionInfo(0, motionState, shape, new AmmoLib.btVector3(0, 0, 0))
    );
    this.physics.addBody(this.currentCollisionBody);

    // Optional wireframe for debug
    this.currentCollisionMesh = new THREE.Mesh(
        geometry.clone(),
        new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 })
    );
    this.currentCollisionMesh.position.copy(tilePos);
    this.currentCollisionMesh.quaternion.copy(tileQuat);
    this.scene.add(this.currentCollisionMesh);
}
 

    _findClosestTile(apolloMesh) {
        const playerPos = apolloMesh.position;
        let closestTile = null;
        let closestDistance = Infinity;

        this.tilesRenderer.group.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const tileCenter = new THREE.Vector3();
                child.getWorldPosition(tileCenter);
                const distance = playerPos.distanceTo(tileCenter);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestTile = child;
                }
            }
        });
        return closestTile;
    }

    _convertMeshToShape(geometry, AmmoLib) {
        const vertices = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;
        const triangleMesh = new AmmoLib.btTriangleMesh();

        if (indices) {
            for (let i = 0; i < indices.length; i += 3) {
                const v0 = new AmmoLib.btVector3(vertices[indices[i] * 3], vertices[indices[i] * 3 + 1], vertices[indices[i] * 3 + 2]);
                const v1 = new AmmoLib.btVector3(vertices[indices[i + 1] * 3], vertices[indices[i + 1] * 3 + 1], vertices[indices[i + 1] * 3 + 2]);
                const v2 = new AmmoLib.btVector3(vertices[indices[i + 2] * 3], vertices[indices[i + 2] * 3 + 1], vertices[indices[i + 2] * 3 + 2]);
                triangleMesh.addTriangle(v0, v1, v2, true);
            }
        } else {
            for (let i = 0; i < vertices.length; i += 9) {
                const v0 = new AmmoLib.btVector3(vertices[i], vertices[i + 1], vertices[i + 2]);
                const v1 = new AmmoLib.btVector3(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
                const v2 = new AmmoLib.btVector3(vertices[i + 6], vertices[i + 7], vertices[i + 8]);
                triangleMesh.addTriangle(v0, v1, v2, true);
            }
        }

        return new AmmoLib.btBvhTriangleMeshShape(triangleMesh, true, true);
    }
}

// =====================================================
// Main Application
// =====================================================
class App {
    constructor() {
        this.clock = new THREE.Clock();

        // Scene & Renderer
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e7);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
        
        this._addLights();
        
        // Physics
        this.physics = new PhysicsWorld(Ammo);
        
        // Tiles
        this.tiles = new TileManager(this.scene, this.physics, this.camera, this.renderer);
        
        // Player
        this.player = new Player(this.scene, this.physics, this.camera, this.renderer.domElement, Ammo);
        
        // Custom Ship Camera
        this.shipCamera = new ShipCamera(this.camera, this.renderer.domElement, this.player);
        this.gui = new GUI(this.player);
        
        this._init();
    }

    async _init() {
        await this.tiles.init();
        this.animate();
    }

    _addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(1737000 * 2, 1737000, 1737000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();

        // --- Player ---
        this.player.applyRotation();
        this.player.applyMovement(delta);
        this.physics.step(delta);
        this.player.updateFromPhysics();
        this.gui.update();

        // --- Camera ---
        this.shipCamera.update();

        // --- Tiles ---
        this.tiles.update();
        this.tiles.generateCollision(this.player.mesh, Ammo);

        // --- Render ---
        this.renderer.render(this.scene, this.camera);
    }
}

// =====================================================
// Start
// =====================================================
new App();
