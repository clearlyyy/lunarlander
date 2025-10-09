import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ACESFilmicToneMappingShader, VignetteShader } from 'three/examples/jsm/Addons.js';
import { N8AOPass } from 'n8ao';

import Ammo from 'ammo.js';
import Player from './player';
import ShipCamera from './shipCamera'; 
import GUI from './GUI.js';
import NavBall from './navBall.js';
import Explosion from './Explosion.js';
import Obstacle from './obstacle.js';
import ObstacleBuilder from './obstacleBuilderHelper.js';
import EditorCamera from './editorCamera.js';
import CourseLoader from './CourseLoader.js';
import CourseManager from './CourseManager.js';
import MainMenu from './MainMenu.js';
import EscMenu from './EscMenu.js';
import TileManager from './TilesManager.js';
import PhysicsWorld from './PhysicsWorld.js';

const tips = [
    "Focus on the NavBall, it makes maneuvers a lot simpler.",
    "Try Timewarping to speed up time with Period and Comma",
    "This game uses newtonian physics, so you can park yourself into an orbit",
    "The NavBall has a Prograde and Retrograde marker, understanding these are essential to flying a spacecraft.",
    "Use the Descent Gauge on the bottom of the screen to determine if your vertical speed relative to surface is good.",
    "You can get finer control with the throttle using Shift and CTRL",
    "The Apollo 11 Lunar module weights 15 tons fully fueled.",
    "The most efficient way to slow yourself for landing is performing a suicide burn. To do this, you wait till the very last second to fire your engines, slowing to 0 m/s as you land.",
    "Try aligning your navball in one of the four cardinal directions, this can make rotating in the intended direction easier."
];

class App {
    constructor() {
        this.editorMode = false;
        this.photoMode = false;
        this.useRealValues = false;
        this.hasDied = false;
        this.isInvisible = true;
        this.easyControls = true;
        this._isInMainMenu = true;
        this.isInCourse = false;
        this.isEscMenuOpen = false;
        this.currentCourse = 'obstacles.json';
        this.G = 6.67430e-11;
        this.moonMass = this.useRealValues ? 4.6e21 : 7.32e22;
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

        this._setupScene();
        this._setupHUD();
        this._setupComposer();
        this._setupLights();
        this._setupPhysics();
        this._setupTiles();
        this._setupPlayerAndUI();
        this._setupEditor();

        this.mainMenuUI = document.getElementById("main-menu");
        this.gameUI = document.getElementById("game-ui");
        this._updateUIVisibility();
        this._init();
        this._bindEvents();
    }

    _setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 5, 1e6);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, depth: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        document.body.appendChild(this.renderer.domElement);
    }

    _setupHUD() {
        this.hudRenderer = new THREE.WebGLRenderer({ alpha: true });
        this.hudRenderer.setSize(window.innerWidth, window.innerHeight);
        this.hudRenderer.domElement.style.position = 'absolute';
        this.hudRenderer.domElement.style.top = '0';
        this.hudRenderer.domElement.style.left = '0';
        this.hudRenderer.domElement.style.pointerEvents = 'none';
        this.hudRenderer.domElement.style.zIndex = '1';
        document.body.appendChild(this.hudRenderer.domElement);

        this.hudScene = new THREE.Scene();
        this.hudCamera = new THREE.OrthographicCamera(
            -window.innerWidth/2, window.innerWidth/2,
            window.innerHeight/2, -window.innerHeight/2,
            -1000, 1000
        );
        this.hudCamera.position.z = 10;
    }

    _setupComposer() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const n8aopass = new N8AOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
        n8aopass.configuration.aoRadius = 5.0;
        n8aopass.configuration.distanceFalloff = 3;
        n8aopass.configuration.intensity = 2.0;
        n8aopass.configuration.color = new THREE.Color(0,0,0);
        this.composer.addPass(n8aopass);

        this.composer.addPass(new FilmPass(0.25, false));

        if (!this.editorMode) {
            this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.4, 0.85));
        }

        this.composer.addPass(new ShaderPass(ACESFilmicToneMappingShader));
        this.composer.addPass(new ShaderPass(VignetteShader));

        this.composer.addPass(new OutputPass());
    }

    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.05));

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

    _setupPhysics() {
        this.physics = new PhysicsWorld(Ammo);
    }

    _setupTiles() {
        this.tiles = new TileManager(this.scene, this.physics, this.camera, this.renderer, () => this.isInMainMenu);
    }

    _setupPlayerAndUI() {
        this.EscMenu = new EscMenu(this.GoToMainMenu.bind(this));
        if (this.editorMode) return;
        
        this.player = new Player(this.scene, this.physics, this.camera, this.renderer.domElement, Ammo, this.useRealValues, this.hasDied, this.easyControls, () => this.isInMainMenu);
        this.navBall = new NavBall(this.player, this.hudScene, 80, 'textures/navball.png');
        this.shipCamera = new ShipCamera(this.camera, this.renderer.domElement, this.player, () => this.isInMainMenu);
        this.courseLoader = new CourseLoader(this.scene, this.camera, this.renderer, this.physics, 'obstacles.json');
        this.MainMenu = new MainMenu(this.camera, this.player, this.StartGame.bind(this), this.loadCourse.bind(this));
        this.explosion = new Explosion({scene: this.scene});
        
        // create audio but DO NOT play yet
        this.ambientSound = new Audio('sounds/ambient.mp3');
        this.ambientSound.loop = true;
        this.ambientSound.volume = 0.05;
        
        // unlock audio on first user interaction
        const unlockAudio = () => {
            this.ambientSound.play().catch(() => {
                console.warn('Audio still blocked by browser');
            });
            this.player.unlockAudio();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    
        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);
    
        window.addEventListener('resize', () => this._onResize());
    }


    _setupEditor() {
        if (!this.editorMode) return;
        this.editorCamera = new EditorCamera(this.camera, document.body, 50);
        this.obstacleBuilder = new ObstacleBuilder(this.camera, this.editorCamera, this.scene, this.tiles.tilesRenderer, this.renderer);
    }

    async _init() {
        await this.tiles.init();
        if (!this.editorMode) await this.courseLoader.waitUntilReady();
        if (this.editorMode) this.obstacleBuilder.setTileRenderer(this.tiles.tilesRenderer);
        this.animate();
    }

    _bindEvents() {
        document.addEventListener('keydown', (event) => this._onKeyDown(event));
        document.addEventListener('keyup', (event) => this.keysDown[event.code] = false);
        document.getElementById("tryagain-button").addEventListener('click', () => this.Start());
    }

    _onKeyDown(event) {
        if (this.keysDown[event.code]) return;
        this.keysDown[event.code] = true;

        if (event.code === 'KeyR' && this.isInCourse) {
            this.loadCourse(this.currentCourse);
            this.courseManager?.reset();
            this.Start();
            this.player.throttle = 0;
        }

        if (event.code === 'Escape') {
            if (this.isInMainMenu) return;
            this.isEscMenuOpen ? this.EscMenu.hide() : this.EscMenu.show();
            this.isEscMenuOpen = !this.isEscMenuOpen;
        }

        if (event.code === 'KeyN') {
            this.photoMode = !this.photoMode;

            if (this.photoMode) {
                // Hide player and UI
                if (this.player?.mesh) this.player.mesh.visible = false;
                this.navBall.mesh.visible = false;
                this.navBall.shadow.visible = false;
                this.navBall.cursor.visible = false;
        
                document.getElementById("game-ui").style.display = "none";
            
                // Freeze player movement
                if (this.player?.body) {
                    this.player.body.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
                    this.player.body.setAngularVelocity(new Ammo.btVector3(0, 0, 0));
                }
                this.player.canMove = false; // optional flag if used in your movement code
            } else {
                // Restore player and UI
                if (this.player?.mesh) this.player.mesh.visible = true;
                document.getElementById("game-ui").style.display = "block";
                this.player.canMove = true;
            }
        }

        if (event.code === 'Period' && this.timeWarp < 7) this.timeWarp++;
        if (event.code === 'Comma' && this.timeWarp > 1) this.timeWarp--;
        this.updateUIElements();
    }

    _onResize() {
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

        if (this.navBall) {
            this.navBall.mesh.position.set(0, -window.innerHeight / 2 + 90, 0);
            this.navBall.shadow.position.set(0, this.navBall.mesh.position.y - 2, -5);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        let delta = this.isEscMenuOpen ? 0 : this.clock.getDelta();

        if (this.isInMainMenu && !this.editorMode) this.MainMenu.update();

        if (!this.editorMode) {
            if (!this.photoMode) {
                this.player.applyRotation();
                this.player.applyMovement(delta);
                this.computeGravityForce();
            }
            this.player.updatePreviousVelocity();
            this.physics.step(delta * this.timeWarp);
            this.player.updateFromPhysics();
            if (!this.isInvisible) this.checkCollisions();
            if (!this.player.body) return;

            this.explosion.update(delta);
            //this.gui.update();
            this.navBall.update();

            if (!this.isInMainMenu) this.shipCamera.update();
        } else {
            this.editorCamera?.update(delta);
            this.physics.step(delta * this.timeWarp);
        }

        if (this.courseLoader?.isReady && this.courseManager) {
            this.courseLoader.updateObstacleShaders(delta);
            this.courseManager.checkCollisions();
        }

        this._updateShadowLight();
        this.tiles.update();
        if (!this.editorMode) this.tiles.generateCollision(this.player.mesh, Ammo);

        this.renderer.autoClear = true;
        this.composer.render();

        this.hudRenderer.autoClear = false;
        this.hudRenderer.clearDepth();
        if (!this.isInMainMenu) this.hudRenderer.render(this.hudScene, this.hudCamera);
    }

    updateUIElements() {
        this.triangles.forEach((t, index) => {
            t.classList.toggle('active', index + 1 <= this.timeWarp);
        });
        document.getElementById("timewarp").innerText = this.timeWarp;
    }

    _updateShadowLight() {
        if (!this.player?.body || !this.directionalLight) return;

        const playerPos = this.player.getPosition();
        const lightDir = new THREE.Vector3(-1, -2, -1).normalize();
        const lightDistance = 500;
        const lightPos = playerPos.clone().addScaledVector(lightDir, -lightDistance);

        this.directionalLight.position.copy(lightPos);
        this.directionalLight.target.position.copy(playerPos);
        this.directionalLight.target.updateMatrixWorld();

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

        const playerMass = this.player.mass;
        const mu = this.G * this.moonMass;
        const forceMag = mu * playerMass / distSq;
        const force = r.clone().normalize().multiplyScalar(-forceMag);

        this.player.applyForce(force);
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
        this.mainMenuUI.style.display = this._isInMainMenu ? "block" : "none";
        this.gameUI.style.display = this._isInMainMenu ? "none" : "block";
    }

    Died(vel) {
        if (!this.hasDied) {
            this.hasDied = true;
            this.player.hasDied = true;
        }

        this.explosion.explode(this.player.mesh.position);
        this.player.hideAndStop();
        this.player.throttle = 0;
        new Audio('./sounds/explosion_somewhere_far.mp3').play();

        setTimeout(() => {
            document.getElementById("death-velocity").innerText = vel;
            document.getElementById("death-screen").classList.add('active');
            document.getElementById("tip").innerText = tips[Math.floor(Math.random() * tips.length)];
        }, 1000);

        this.timeWarp = 1;
        this.updateUIElements();
    }

    Start() {
        this.hasDied = false;
        this.player.hasDied = false;
        document.getElementById("death-screen").classList.remove('active');
        this.player.showAndStart();
    }

    StartGame() {
        this.Start();
        this.isInMainMenu = false;
        this.player.setPosition(new THREE.Vector3(415122, 127557, -11914));
    }

    loadCourse(coursePath = null) {
        if (!this.courseLoader) return;

        if (coursePath) this.currentCourse = coursePath;

        if (this.courseManager) {
            this.courseManager.destroy();
            this.courseManager = null;
        }
        this.courseLoader.clearObstacles();

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
            this.shipCamera.setRotation(this.courseLoader.playerRotation);
            this.isInCourse = true;
        });
    }

    GoToMainMenu() {
        this.isInMainMenu = true;
        this.EscMenu.hide();
        this.isEscMenuOpen = false;
        this.player.body.setLinearVelocity(new Ammo.btVector3(0,0,0));
        this.player.throttle = 0;
        this.player.engineSound.volume = 0.0;
    }
}

window.addEventListener('DOMContentLoaded', () => new App());
