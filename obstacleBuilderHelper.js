import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import Obstacle from './obstacle';

export default class ObstacleBuilder {
    constructor(camera, editorCamera, scene, tileRenderer, renderer) {
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.camera = camera;
        this.scene = scene;
        this.tileRenderer = tileRenderer;
        this.renderer = renderer;
        this.editorCamera = editorCamera;

        this.obstacles = [];
        this.mode = 'spawn'; 
        this.obstacleType = 'ring'; 
        this.selectedObstacle = null;

        // Transform controls
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.scene.add(this.transformControls.getHelper());
        this.transformControls.addEventListener('dragging-changed', (event) => {
            if (this.orbitControls) this.orbitControls.enabled = !event.value;
            if (this.editorCamera) this.editorCamera.setBlocked(event.value);
        });

        // Mode label
        this.modeLabel = document.createElement('h3');
        this.modeLabel.style.position = 'absolute';
        this.modeLabel.style.top = '10px';
        this.modeLabel.style.left = '10px';
        this.modeLabel.style.color = 'red';
        this.modeLabel.style.margin = '0';
        this.modeLabel.style.zIndex = '999';
        document.body.appendChild(this.modeLabel);

        // Type label
        this.typeLabel = document.createElement('h3');
        this.typeLabel.style.position = 'absolute';
        this.typeLabel.style.top = '40px';
        this.typeLabel.style.left = '10px';
        this.typeLabel.style.color = 'orange';
        this.typeLabel.style.margin = '0';
        this.typeLabel.style.zIndex = '999';
        document.body.appendChild(this.typeLabel);

        this.updateLabels();

        // --- Events ---
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    updateLabels() {
        this.modeLabel.innerText = `Mode: ${this.mode}`;
        this.typeLabel.innerText = `Obstacle: ${this.obstacleType.toUpperCase()}`;
    }

    onMouseDown(event) {
        if (event.button === 1) {
            this.obstacleType = this.obstacleType === 'ring' ? 'box' : 'ring';
            this.updateLabels();
        }
    }

    setOrbitControls(orbitControls) {
        this.orbitControls = orbitControls;
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyG': this.setMode('spawn'); break;
            case 'KeyH': this.setMode('edit'); break;
            case 'KeyJ': this.setMode('delete'); break;
            case 'KeyR': this.setTransformMode('rotate'); break;
            case 'KeyT': this.setTransformMode('translate'); break;
            case 'KeyK': this.saveObstacles(); break;
        }
    }

    setMode(mode) {
        this.mode = mode;
        this.updateLabels();

        if (mode !== 'edit' && this.selectedObstacle) {
            this.transformControls.detach();
            this.selectedObstacle = null;
        }
    }

    onPointerDown(event) {
        if (event.button !== 0) return; 
        if (!this.tileRenderer?.group) return;
        if (this.transformControls.dragging) return;

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.mode === 'spawn') {
            const intersects = this.raycaster.intersectObject(this.tileRenderer.group, true);
            if (intersects.length > 0) this.addObstacle(intersects[0].point);
        } else if (this.mode === 'edit' || this.mode === 'delete') {
            const obstacleMeshes = this.obstacles
                .map(o => o.mesh)
                .filter(Boolean);

            const intersects = this.raycaster.intersectObjects(obstacleMeshes, true);

            if (intersects.length > 0) {
                const obstacle = this._findObstacleFromIntersectedObject(intersects[0].object);
                if (!obstacle) return;

                if (this.mode === 'edit') {
                    this.selectedObstacle = obstacle;
                    this.transformControls.attach(obstacle.mesh);
                    const newNumber = prompt(`Enter a number for obstacle (current: ${obstacle.number ?? 'none'})`);
                    if (newNumber !== null && !isNaN(newNumber)) {
                        obstacle.number = parseInt(newNumber, 10);
                        console.log(`Assigned number ${obstacle.number} to obstacle`);
                    }

                } else if (this.mode === 'delete') {
                    this.deleteObstacle(obstacle);
                }
            } else if (this.mode === 'edit') {
                this.transformControls.detach();
                this.selectedObstacle = null;
            }
        }
    }

    _findObstacleFromIntersectedObject(intersectedObject) {
        let cur = intersectedObject;
        while (cur) {
            const found = this.obstacles.find(o => o.mesh === cur);
            if (found) return found;
            cur = cur.parent;
        }
        return null;
    }

    addObstacle(position) {
        const modelPaths = {
            ring: 'assets/models/truss_ring.glb',
            box: 'assets/models/truss_box.glb'
        };
        const obstacle = new Obstacle(
            position,
            this.scene,
            this.camera,
            this.renderer,
            null,
            null,
            this.obstacleType,
            true
        ); 
        this.obstacles.push(obstacle);

        const checkLoaded = setInterval(() => {
            if (obstacle.mesh) {
                if (this.mode === 'edit') this.transformControls.attach(obstacle.mesh);
                clearInterval(checkLoaded);
            }
        }, 100);
    }

    deleteObstacle(obstacle) {
        if (!obstacle) return;
        if (obstacle.mesh) this.scene.remove(obstacle.mesh);
        this.obstacles = this.obstacles.filter(o => o !== obstacle);
        if (this.selectedObstacle === obstacle) this.transformControls.detach();
    }

    setTransformMode(mode = 'translate') {
        if (['translate', 'rotate', 'scale'].includes(mode)) {
            this.transformControls.setMode(mode);
        }
    }

    setTileRenderer(tileRenderer) {
        this.tileRenderer = tileRenderer;
    }

    update() {
        this.transformControls.update?.();
    }

    saveObstacles() {
        const data = this.obstacles
            .filter(o => o.mesh)
            .map(o => {
                o.mesh.updateMatrixWorld(true);
                const position = new THREE.Vector3();
                o.mesh.getWorldPosition(position);
                const quaternion = new THREE.Quaternion();
                o.mesh.getWorldQuaternion(quaternion);

                return {
                    type: o.type,
                    number: o.number ?? null,
                    position: { x: position.x, y: position.y, z: position.z },
                    rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
                };
            });
        
        const output = {
            playerpos: { x: 0, y: 0, z: 0},
            difficulty: "easy",
            courseName: "COURSE NAME",
            description: "This is a description",
            obstacles: data
        }

        const json = JSON.stringify(output, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'obstacles.json';
        a.click();
        URL.revokeObjectURL(url);

        console.log('Obstacles saved:', output);
    }
}

