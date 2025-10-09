import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ACESFilmicToneMappingShader } from 'three/examples/jsm/Addons.js';
import { VignetteShader } from 'three/examples/jsm/Addons.js';
import { N8AOPass } from 'n8ao';

import Ammo from 'ammo.js';
import Player from './player';
import ShipCamera from './shipCamera'; 
import GUI from './GUI.js'
import NavBall from './navBall.js';
import Explosion from './Explosion.js';
import Obstacle from './obstacle.js';
import ObstacleBuilder from './obstacleBuilderHelper.js';
import EditorCamera from './editorCamera.js';
import CourseLoader from './CourseLoader.js';
import CourseManager from './CourseManager.js';
import MainMenu from './MainMenu.js';
import { thickness } from 'three/tsl';
import EscMenu from './EscMenu.js';

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
        this.world.stepSimulation(delta, 10, 1/60);
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
const HEIGHTMAP_SCALE = 2;

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

        const loader = new THREE.TextureLoader();
        this.detailNormal = loader.load('textures/moon_01_nor_gl_4k.jpg');
        this.detailNormal.wrapS = this.detailNormal.wrapT = THREE.RepeatWrapping;
        this.detailNormal.repeat.set(10, 10);

        this.tilesRenderer.addEventListener('load-model', ({ scene: tileScene }) => {
            tileScene.traverse((c) => {
                if (c.isMesh && c.material) {
                    const oldMat = c.material;
                
                    // Compute distance from camera to tile
                    const tilePos = new THREE.Vector3();
                    c.getWorldPosition(tilePos);
                    const distance = this.camera.position.distanceTo(tilePos);
                
                    // Only use detail map if within 50,000 units
                    const useDetailMap = distance <= 50000;
                
                    c.material = new THREE.MeshStandardMaterial({
                        map: oldMat.map || null,
                        normalMap: useDetailMap ? this.detailNormal : null,
                        roughnessMap: oldMat.roughnessMap || null,
                        metalnessMap: oldMat.metalnessMap || null,
                    });
                
                    c.material.needsUpdate = true;
                    c.castShadow = true;
                    c.receiveShadow = true;
                    c.geometry.computeVertexNormals();
                    oldMat.dispose();
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

        // Cleanup old collision objects 
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

        // Get tile transform ---
        const tilePos = new THREE.Vector3();
        const tileQuat = new THREE.Quaternion();
        const tileScale = new THREE.Vector3();
        tile.matrixWorld.decompose(tilePos, tileQuat, tileScale);

        // Clone and transform geometry 
        const geometry = tile.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().compose(
            new THREE.Vector3(0, 0, 0), tileQuat, tileScale
        ));

        // Create Ammo collision shape 
        const { shape, triangleMesh } = this._convertMeshToShape(geometry, AmmoLib);
        this.currentCollisionShape = shape;
        this.currentCollisionTriangleMesh = triangleMesh;

        // Create rigid body 
        const transform = new AmmoLib.btTransform();
        transform.setIdentity();
        transform.setOrigin(new AmmoLib.btVector3(tilePos.x, tilePos.y, tilePos.z));

        const motionState = new AmmoLib.btDefaultMotionState(transform);
        this.currentCollisionBody = new AmmoLib.btRigidBody(
            new AmmoLib.btRigidBodyConstructionInfo(0, motionState, shape, new AmmoLib.btVector3(0, 0, 0))
        );

        this.physics.addBody(this.currentCollisionBody);

        // Debug wireframe mesh 
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
                AmmoLib.destroy(v0);
                AmmoLib.destroy(v1);
                AmmoLib.destroy(v2);
            }
        } else {
            for (let i = 0; i < vertices.length; i += 9) {
                const v0 = new AmmoLib.btVector3(vertices[i], vertices[i + 1], vertices[i + 2]);
                const v1 = new AmmoLib.btVector3(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
                const v2 = new AmmoLib.btVector3(vertices[i + 6], vertices[i + 7], vertices[i + 8]);
                triangleMesh.addTriangle(v0, v1, v2, true);
                AmmoLib.destroy(v0);
                AmmoLib.destroy(v1);
                AmmoLib.destroy(v2);
            }
        }

        const shape = new AmmoLib.btBvhTriangleMeshShape(triangleMesh, true, true);
        return { shape, triangleMesh };
    }
    
}


const tips = ["Focus on the NavBall, it makes maneuvers a lot simpler.", 
              "Try Timewarping to speed up time with Period and Comma",
              "This game uses newtonian physics, so you can park yourself into an orbit",
              "The NavBall has a Prograde and Retrograde marker, understanding these are essential to flying a spacecraft.",
              "Use the Descent Gauge on the bottom of the screen to determine if your vertical speed relative to surface is good.",
              "You can get finer control with the throttle using Shift and CTRL",
              "The Apollo 11 Lunar module weights 15 tons fully fueled.",
              "The most efficient way to slow yourself for landing is performing a suicide burn. To do this, you wait till the very last second to fire your engines, slowing to 0 m/s as you land.",
              "Try aligning your navball in one of the four cardinal directions, this can make rotating in the intended direction easier.",
              ]

// =====================================================
// Main Application
// =====================================================
class App {
    constructor() {

        this.editorMode = false;

        this.useRealValues = false;
        this.hasDied = false;
        this.isInvisible = true;
        this.easyControls = true;
        this._isInMainMenu = true;
        this.isInCourse = false;

        this.isEscMenuOpen = false;

        this.currentCourse = 'obstacles.json';

        if (this.useRealValues) {
            this.moonMass = 4.6e21;
        }
        else {
            this.moonMass = 7.32e22;
        }
        this.G = 6.67430e-11;
        this.moonPos = new THREE.Vector3(0,0,0); 
        this.timeWarp = 1;
        this.keysDown = {};
        this.triangles = [];
        for (let i = 1; i <= 7; i++) {
            const t = document.getElementById(`t${i}`);
            this.triangles.push(t);
            t.addEventListener('click', () => {
                this.timeWarp = i;
                this.updateUIElements();
            });
        }
        this.updateUIElements();

        this.clock = new THREE.Clock();

        // Scene & Renderer
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 5, 1e6);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, depth: true});
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        document.body.appendChild(this.renderer.domElement);
        
        // --- HUD Renderer ---
        this.hudRenderer = new THREE.WebGLRenderer({ alpha: true });
        this.hudRenderer.setSize(window.innerWidth, window.innerHeight);
        this.hudRenderer.domElement.style.position = 'absolute';
        this.hudRenderer.domElement.style.top = '0';
        this.hudRenderer.domElement.style.left = '0';
        this.hudRenderer.domElement.style.pointerEvents = 'none'; // allow UI clicks through
        this.hudRenderer.domElement.style.zIndex = '1'; // render above 3D world
        document.body.appendChild(this.hudRenderer.domElement);
        
        // --- HUD Scene & Camera ---
        this.hudScene = new THREE.Scene();
        this.hudCamera = new THREE.OrthographicCamera(
            -window.innerWidth/2, window.innerWidth/2,
            window.innerHeight/2, -window.innerHeight/2,
            -1000, 1000
        );
        this.hudCamera.position.z = 10;
        
        
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        const n8aopass = new N8AOPass(this.scene, this.camera, this.width, this.height);
        n8aopass.configuration.aoRadius = 5.0;
        n8aopass.configuration.distanceFalloff = 3;
        n8aopass.configuration.intensity = 2.0;
        n8aopass.configuration.color = new THREE.Color(0, 0, 0);
        this.composer.addPass(n8aopass); 
        const filmPass = new FilmPass( 
            0.25, false 
        );
        this.composer.addPass(filmPass);
        
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.0, // strength
            0.4, // radius
            0.85 // threshold
        );
        if (!this.editorMode) {
            this.composer.addPass(bloomPass);
        }
        
        const toneMapping = new ShaderPass(ACESFilmicToneMappingShader);
        this.composer.addPass(toneMapping);
        const vignette = new ShaderPass(VignetteShader);
        this.composer.addPass(vignette);
        
        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
        
        // Create composer with that render target
        this._addLights();
        
        // Physics
        this.physics = new PhysicsWorld(Ammo);
        
        // Tiles
        this.tiles = new TileManager(this.scene, this.physics, this.camera, this.renderer);
        
        if (!this.editorMode) {
            this.player = new Player(this.scene, this.physics, this.camera, this.renderer.domElement, Ammo, this.useRealValues, this.hasDied, this.easyControls, () => this.isInMainMenu);
            this.navBall = new NavBall(this.player, this.hudScene, 80, 'textures/navball.png');
            this.shipCamera = new ShipCamera(this.camera, this.renderer.domElement, this.player, () => this.isInMainMenu);
            this.gui = new GUI(this.player);
            this.courseLoader = new CourseLoader(this.scene, this.camera, this.renderer, this.physics, 'obstacles.json');
            this.MainMenu = new MainMenu(this.camera, this.player, this.StartGame.bind(this), this.loadCourse.bind(this));
        }
        this.EscMenu = new EscMenu(this.GoToMainMenu.bind(this));
        
        this.explosion = new Explosion({scene: this.scene});
        
        this.ambientSound = new Audio('sounds/ambient.mp3');
        this.ambientSound.loop = true;
        this.ambientSound.volume = 0.05;
        this.ambientSound.play();
        
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.hudRenderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
            this.hudCamera.left = -window.innerWidth / 2;
            this.hudCamera.right = window.innerWidth / 2;
            this.hudCamera.top = window.innerHeight / 2;
            this.hudCamera.bottom = -window.innerHeight / 2;
            this.hudCamera.updateProjectionMatrix();
            this.navBall.mesh.position.set(0, -window.innerHeight/2 + 90, 0); // HUD position
            this.navBall.shadow.position.set(0, this.navBall.mesh.position.y - 2, -5); // slightly behind the navball
        });
        
        
        if (this.editorMode) {
            this.editorCamera = new EditorCamera(this.camera, document.body, 300);
            this.obstacleBuilder = new ObstacleBuilder(this.camera, this.editorCamera, this.scene, this.tiles.tilesRenderer, this.renderer);
        }


        this.mainMenuUI = document.getElementById("main-menu");
        this.gameUI = document.getElementById("game-ui");

        this._updateUIVisibility();

        this._init();
        this._bindEvents();
    }

    async _init() {
        await this.tiles.init();
        if (!this.editorMode) {
            await this.courseLoader.waitUntilReady();

            //this.courseManager = new CourseManager(this.courseLoader.obstacles, this.player);
        }
        if (this.editorMode)
            this.obstacleBuilder.setTileRenderer(this.tiles.tilesRenderer);
        this.animate();
    }

    _addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
        this.scene.add(ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        this.directionalLight.castShadow = true;

        this.directionalLight.shadow.mapSize.set(2048, 2048);
        const cam = this.directionalLight.shadow.camera;
        cam.near = 0.1;
        cam.far = 10000;
        cam.left = -200;
        cam.right = 200;
        cam.top = 200;
        cam.bottom = -200;

        this.directionalLight.shadow.bias = -0.0002;

        this.scene.add(this.directionalLight);
    } 

    animate() {
        requestAnimationFrame(() => this.animate());
        let delta = this.clock.getDelta();
        if (this.isEscMenuOpen) {
            delta = 0;
        }

        if (this.isInMainMenu && !this.editorMode) {
            this.MainMenu.update();
        }

        
        if (!this.editorMode) {
            // --- Player ---
            this.player.applyRotation();
            this.player.applyMovement(delta);
            this.computeGravityForce();

            this.player.updatePreviousVelocity();
            this.physics.step(delta*this.timeWarp);
            this.player.updateFromPhysics();
            if (!this.isInvisible) {
                this.checkCollisions();
            }
            if (!this.player.body) return;

            this.explosion.update(delta);
            this.gui.update();

            this.navBall.update();
            // --- Camera ---
            if (!this.isInMainMenu) {
                this.shipCamera.update();
            }
        } else {
            if (this.editorCamera) {
                this.editorCamera.update(delta);
            }
            this.physics.step(delta*this.timeWarp);
        }

        if (this.courseLoader?.isReady && this.courseManager) {
            this.courseLoader.updateObstacleShaders(delta);
            this.courseManager.checkCollisions();
        }

        this._updateShadowLight();

        // --- Tiles ---
        this.tiles.update();
        if (!this.editorMode) {
            this.tiles.generateCollision(this.player.mesh, Ammo);
        }
        // --- Render ---
        //this.renderer.render(this.scene, this.camera);
        this.renderer.autoClear = true;
        this.composer.render();
        this.hudRenderer.autoClear = false;
        this.hudRenderer.clearDepth();
        if (this.isInMainMenu) return;
        this.hudRenderer.render(this.hudScene, this.hudCamera);

    }

    updateUIElements() {
        this.triangles.forEach((t, index) => {
            if (index + 1 <= this.timeWarp) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        })
        document.getElementById("timewarp").innerText = this.timeWarp;
    }

    _bindEvents() {
        document.addEventListener('keydown', (event) => {
            if (!this.keysDown[event.code]) {
                this.keysDown[event.code] = true;
            
                if (event.code === 'KeyR') {
                    if (this.isInCourse) {
                        console.log("Resetting course...");
                        this.loadCourse(this.currentCourse);
                        this.courseManager?.reset();
                        this.Start();
                        this.player.throttle = 0;
                    }
                }

                if (event.code === 'Escape') {
                    if (this.isInMainMenu) return;
                    if (!this.isEscMenuOpen) {
                        this.EscMenu.show();
                        this.isEscMenuOpen = true;
                    }
                    else {
                        this.EscMenu.hide();
                        this.isEscMenuOpen = false;
                    }
                }
            
                if (event.code === 'Period' && this.timeWarp < 7) {
                    this.timeWarp++;
                    this.updateUIElements();
                }
            
                if (event.code === 'Comma' && this.timeWarp > 1) {
                    this.timeWarp--;
                    this.updateUIElements();
                }
            }
        });


        // Reset the key when released so it can trigger again
        document.addEventListener('keyup', (event) => {
            this.keysDown[event.code] = false;
        });

        document.getElementById("tryagain-button").addEventListener('click', function(event) {
            this.Start()
        }.bind(this));

        
    }
 

    _updateShadowLight() {
        if (!this.player || !this.directionalLight) return;

        // Player world position
        const playerPos = this.player.getPosition();

        // Direction of sunlight 
        const lightDir = new THREE.Vector3(-1, -2, -1).normalize();

        const lightDistance = 500; // controls how far light sits
        const lightPos = playerPos.clone().addScaledVector(lightDir, -lightDistance);

        this.directionalLight.position.copy(lightPos);
        this.directionalLight.target.position.copy(playerPos);
        this.directionalLight.target.updateMatrixWorld();

        // Move shadow camera with the player
        const shadowCam = this.directionalLight.shadow.camera;
        shadowCam.position.copy(lightPos);
        shadowCam.lookAt(playerPos);
        shadowCam.updateProjectionMatrix();
    }

    computeGravityForce() {
        if (!this.player.body || this.isInMainMenu) return;
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

    checkCollisions() {
        if (this.hasDied) return;
        const world = this.physics.world;
        const playerBody = this.player.body;
        const dispatcher = world.getDispatcher();
        const numManifolds = dispatcher.getNumManifolds();

        for (let i = 0; i < numManifolds; i++) {
            const manifold = dispatcher.getManifoldByIndexInternal(i);
            const body0 = Ammo.castObject(manifold.getBody0(), Ammo.btRigidBody);
            const body1 = Ammo.castObject(manifold.getBody1(), Ammo.btRigidBody);

            // only handle manifolds involving the player
            if (body0.ptr !== playerBody.ptr && body1.ptr !== playerBody.ptr) continue;

            const isPlayerBody0 = (body0.ptr === playerBody.ptr);
            const numContacts = manifold.getNumContacts();

            for (let j = 0; j < numContacts; j++) {
                const pt = manifold.getContactPoint(j);

                // contact distance (overlap)
                if (pt.getDistance() >= 0) continue;

                // normal (Ammo sometimes uses get_m_normalWorldOnB or getNormalWorldOnB)
                const normalAmmo = (pt.get_m_normalWorldOnB) ? pt.get_m_normalWorldOnB() : pt.getNormalWorldOnB();
                const normal = new THREE.Vector3(normalAmmo.x(), normalAmmo.y(), normalAmmo.z()).normalize();

                // contact point in world space (try both getters)
                const posAmmo = (pt.get_m_positionWorldOnB) ? pt.get_m_positionWorldOnB() : pt.getPositionWorldOnB();
                const contact = new THREE.Vector3(posAmmo.x(), posAmmo.y(), posAmmo.z());

                // centers of mass (world)
                const t0 = body0.getWorldTransform();
                const o0 = t0.getOrigin();
                const com0 = new THREE.Vector3(o0.x(), o0.y(), o0.z());

                const t1 = body1.getWorldTransform();
                const o1 = t1.getOrigin();
                const com1 = new THREE.Vector3(o1.x(), o1.y(), o1.z());

                // r vectors from each body's COM to contact point
                const r0 = contact.clone().sub(com0);
                const r1 = contact.clone().sub(com1);

                const v0 = (body0.ptr === playerBody.ptr && this.player.prevVelocity)
                            ? this.player.prevVelocity.clone()
                            : new THREE.Vector3(body0.getLinearVelocity().x(), body0.getLinearVelocity().y(), body0.getLinearVelocity().z());

                const w0 = (body0.ptr === playerBody.ptr && this.player.prevAngular)
                            ? this.player.prevAngular.clone()
                            : new THREE.Vector3(body0.getAngularVelocity().x(), body0.getAngularVelocity().y(), body0.getAngularVelocity().z());

                const v1 = (body1.ptr === playerBody.ptr && this.player.prevVelocity)
                            ? this.player.prevVelocity.clone()
                            : new THREE.Vector3(body1.getLinearVelocity().x(), body1.getLinearVelocity().y(), body1.getLinearVelocity().z());

                const w1 = (body1.ptr === playerBody.ptr && this.player.prevAngular)
                            ? this.player.prevAngular.clone()
                            : new THREE.Vector3(body1.getAngularVelocity().x(), body1.getAngularVelocity().y(), body1.getAngularVelocity().z());

                // velocity at contact points
                const velPoint0 = v0.clone().add(new THREE.Vector3().copy(w0).cross(r0));
                const velPoint1 = v1.clone().add(new THREE.Vector3().copy(w1).cross(r1));

                const relVel = velPoint0.clone().sub(velPoint1);

                // closing speed along normal (positive if bodies are approaching)
                const closing = -relVel.dot(normal); 
                const impactSpeed = Math.max(closing, 0);

                const appliedImpulse = (pt.getAppliedImpulse) ? pt.getAppliedImpulse() :
                                       (pt.get_m_appliedImpulse ? pt.get_m_appliedImpulse() : 0);

                const IMPACT_SPEED_DEATH = 25.0;
                const IMPULSE_DEATH = 50000; 

                if (!this.player.hasCollided) {
                    const causeDeath = (appliedImpulse && appliedImpulse > IMPULSE_DEATH)
                                       || (!appliedImpulse && impactSpeed > IMPACT_SPEED_DEATH);

                    if (causeDeath) {
                        console.log("YOU DIED! impactSpeed:", impactSpeed.toFixed(2), "appliedImpulse:", appliedImpulse);
                        this.Died(impactSpeed.toFixed(2));                   
                    } else {
                        console.log("Safe contact. impactSpeed:", impactSpeed.toFixed(2), "impulse:", appliedImpulse);
                    }
                    this.player.hasCollided = true;
                    setTimeout(() => {
                        this.player.hasCollided = false;
                    }, 200);
                }
            }
        }
    }

    get isInMainMenu() {
        return this._isInMainMenu;
    }

    set isInMainMenu(value) {
        if (this._isInMainMenu === value) return;
        this._isInMainMenu = value;
        this._updateUIVisibility();
    }

    _updateUIVisibility() {
        if (!this.mainMenuUI || !this.gameUI) return; 
        if (this._isInMainMenu) {
            this.mainMenuUI.style.display = "block";
            this.gameUI.style.display = "none";
        } else {
            this.mainMenuUI.style.display = "none";
            this.gameUI.style.display = "block";
        }
    }
 


    Died(vel) {
        if (!this.hasDied) {
            this.hasDied = true;
            this.player.hasDied = true;
        }
        if (this.hasDied) {
            this.explosion.explode(this.player.mesh.position);
            console.log("ding");
            this.player.hideAndStop();
            this.player.throttle = 0;
            const explosionSound = new Audio('./sounds/explosion_somewhere_far.mp3');
            explosionSound.play();
            setTimeout(() => {
                document.getElementById("death-velocity").innerText = vel;
                document.getElementById("death-screen").classList.add('active');
                document.getElementById("tip").innerText = tips[Math.floor(Math.random() * tips.length)];
            }, 1000);
            this.timeWarp = 1;
            this.updateUIElements();
        }
    }

    Start() {
        this.hasDied = false;
        this.player.hasDied = false;
        document.getElementById("death-screen").classList.remove('active');
        this.player.showAndStart();

    }

    StartGame() {
        console.log("Starting Free Flight");
        this.Start();
        this.isInMainMenu = false;
        this.player.setPosition(new THREE.Vector3(415122, 127557, -11914));
        
    }

    loadCourse(coursePath = null) {
        if (!this.courseLoader) return;

        // Use given path or current one
        if (coursePath) {
            this.currentCourse = coursePath;
        }

        console.log("Loading obstacle course...", this.currentCourse);

        // Remove old courseManager & obstacles
        if (this.courseManager) {
            this.courseManager.destroy();  // we need a destroy method
            this.courseManager = null;
        }
        this.courseLoader.clearObstacles(); // make sure loader removes old obstacles

        this.isInMainMenu = false;

        this.courseLoader.loadFromPath(this.currentCourse).then(() => {
            this.courseManager = new CourseManager(
                this.courseLoader.obstacles,
                this.courseLoader.playerStart,
                this.courseLoader.difficulty,
                this.courseLoader.courseName,
                this.courseLoader.description,
                this.player
            );
            this.player.setPosition(this.courseLoader.playerStart);
            console.log("Course loaded!");
            this.isInCourse = true;
        });
    }



    GoToMainMenu() {
        console.log("Going to Main Menu");
        this.isInMainMenu = true;
        this.EscMenu.hide();
        this.isEscMenuOpen = false;
        this.player.body.setLinearVelocity(new Ammo.btVector3(0,0,0));
        this.player.throttle = 0;
        this.player.engineSound.volume = 0.0;
    }



}

window.addEventListener('DOMContentLoaded', () => {
    new App();
});
