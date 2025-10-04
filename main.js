import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';


import Ammo from 'ammo.js';
import Player from './player';
import ShipCamera from './shipCamera'; 
import GUI from './GUI.js'
import { compute } from 'three/tsl';



// =====================================================
// Physics World
// =====================================================
class PhysicsWorld {
    constructor(AmmoLib) {
        AmmoLib.ALLOW_MEMORY_GROWTH = true;
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

        // Ammo objects for cleanup
        this.currentCollisionBody = null;
        this.currentCollisionMesh = null;
        this.currentCollisionShape = null;
        this.currentCollisionTriangleMesh = null;
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
        if (!this.tilesRenderer || !apolloMesh) return;

        const tile = this._findClosestTile(apolloMesh);
        if (!tile || tile === this.currentTile) return;

        // --- Cleanup old collision objects ---
        if (this.currentCollisionBody) {
            this.physics.removeBody(this.currentCollisionBody);
            AmmoLib.destroy(this.currentCollisionBody.getMotionState());
            AmmoLib.destroy(this.currentCollisionBody);
            this.currentCollisionBody = null;
        }
        if (this.currentCollisionShape) {
            AmmoLib.destroy(this.currentCollisionShape);
            this.currentCollisionShape = null;
        }
        if (this.currentCollisionTriangleMesh) {
            AmmoLib.destroy(this.currentCollisionTriangleMesh);
            this.currentCollisionTriangleMesh = null;
        }
        if (this.currentCollisionMesh) {
            this.scene.remove(this.currentCollisionMesh);
            this.currentCollisionMesh.geometry.dispose();
            this.currentCollisionMesh.material.dispose();
            this.currentCollisionMesh = null;
        }

        this.currentTile = tile;

        // --- Get tile transform ---
        const tilePos = new THREE.Vector3();
        const tileQuat = new THREE.Quaternion();
        const tileScale = new THREE.Vector3();
        tile.matrixWorld.decompose(tilePos, tileQuat, tileScale);

        // --- Clone and transform geometry ---
        const geometry = tile.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().compose(
            new THREE.Vector3(0, 0, 0), tileQuat, tileScale
        ));

        // --- Create Ammo collision shape ---
        const { shape, triangleMesh } = this._convertMeshToShape(geometry, AmmoLib);
        this.currentCollisionShape = shape;
        this.currentCollisionTriangleMesh = triangleMesh;

        // --- Create rigid body ---
        const transform = new AmmoLib.btTransform();
        transform.setIdentity();
        transform.setOrigin(new AmmoLib.btVector3(tilePos.x, tilePos.y, tilePos.z));

        const motionState = new AmmoLib.btDefaultMotionState(transform);
        this.currentCollisionBody = new AmmoLib.btRigidBody(
            new AmmoLib.btRigidBodyConstructionInfo(0, motionState, shape, new AmmoLib.btVector3(0, 0, 0))
        );

        this.physics.addBody(this.currentCollisionBody);

        // --- Optional wireframe for debug ---
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

        const shape = new AmmoLib.btBvhTriangleMeshShape(triangleMesh, true, true);
        return { shape, triangleMesh };
    }
}


// =====================================================
// Main Application
// =====================================================
class App {
    constructor() {


        this.moonMass = 7.3476309e22;
        this.G = 6.67430e-11;
        this.moonPos = new THREE.Vector3(0,0,0); 

        this.clock = new THREE.Clock();

        // Scene & Renderer
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e7);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true});
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        document.body.appendChild(this.renderer.domElement);

        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom (glow)
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.2, // strength
            0.4, // radius
            0.85 // threshold
        );
        this.composer.addPass(bloomPass);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        // Film (grain / flicker)
        

        // Create composer with that render target
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

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
        });
        
        this._init();
    }

    async _init() {
        await this.tiles.init();
        this.animate();
    }

    _addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
        directionalLight.position.set(1737000, 1737000, 1737000);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();

        // --- Player ---
        this.player.applyRotation();
        this.player.applyMovement(delta);
        this.computeGravityForce();
        this.physics.step(delta);
        this.player.updateFromPhysics();
        this.gui.update();

        // --- Camera ---
        this.shipCamera.update();

        // --- Tiles ---
        this.tiles.update();
        this.tiles.generateCollision(this.player.mesh, Ammo);

        // --- Render ---
        //this.renderer.render(this.scene, this.camera);
        this.composer.render();
    }

    computeGravityForce() {
        const pos = this.player.getPosition();
        const r = pos.clone().sub(this.moonPos);
        const distSq = r.lengthSq();

        if (distSq < 1e-6) return;

        //Newtons Law
        const playerMass = this.player.mass;
        const mu = this.G * this.moonMass;
        const forceMag = mu * playerMass / distSq;

        const dir = r.clone().normalize();
        const force = dir.multiplyScalar(-forceMag);

        this.player.applyForce(force);
    }
}

new App();
