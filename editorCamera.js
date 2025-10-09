import * as THREE from 'three';

export default class EditorCamera {
    constructor(camera, domElement, speed = 100, lookSpeed = 0.002) {
        this.camera = camera;
        this.domElement = domElement;
        this.speed = speed;
        this.lookSpeed = lookSpeed;

        // Movement
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;

        // Rotation
        this.pitch = 0; // around X axis
        this.yaw = 0;   // around Y axis
        this.isDragging = false;

        this.camera.position.set(410357, 143723, 46731);

        this._bindEvents();

        // Camera position HUD
        this.posDisplay = document.createElement('div');
        this.posDisplay.style.position = 'absolute';
        this.posDisplay.style.left = '10px';
        this.posDisplay.style.bottom = '10px';
        this.posDisplay.style.color = '#0f0';
        this.posDisplay.style.fontFamily = 'monospace';
        this.posDisplay.style.fontSize = '14px';
        this.posDisplay.style.background = 'rgba(0,0,0,0.5)';
        this.posDisplay.style.padding = '4px 6px';
        this.posDisplay.style.borderRadius = '4px';
        this.posDisplay.style.zIndex = '1000';
        document.body.appendChild(this.posDisplay);
    }

    _bindEvents() {
        // Keyboard
        this.domElement.addEventListener('keydown', (e) => this._onKeyDown(e));
        this.domElement.addEventListener('keyup', (e) => this._onKeyUp(e));

        // Mouse
        this.domElement.addEventListener('mousedown', (e) => { if (e.button === 2) this.isDragging = true; });
        this.domElement.addEventListener('mouseup', (e) => { if (e.button === 2) this.isDragging = false; });
        this.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.domElement.tabIndex = 0;
        this.domElement.style.outline = 'none';
        this.domElement.focus();
    }

    _onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'KeyQ': this.moveDown = true; break;
            case 'KeyE': this.moveUp = true; break;
        }
    }

    _onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyD': this.moveRight = false; break;
            case 'KeyQ': this.moveDown = false; break;
            case 'KeyE': this.moveUp = false; break;
        }
    }

    _onMouseMove(event) {
        if (!this.isDragging) return;
        this.yaw -= event.movementX * this.lookSpeed;
        this.pitch -= event.movementY * this.lookSpeed;
        //this.pitch = Math.max(-Math.PI/2 + 0.001, Math.min(Math.PI/2 - 0.001, this.pitch)); // avoid gimbal lock
    }

    update(delta) {
        // Calculate rotation quaternion
        const quat = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')); // Y = yaw, X = pitch

        // Forward/right/up
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

        // Movement
        const moveVector = new THREE.Vector3();
        if (this.moveForward) moveVector.add(forward);
        if (this.moveBackward) moveVector.sub(forward);
        if (this.moveRight) moveVector.add(right);
        if (this.moveLeft) moveVector.sub(right);
        if (this.moveUp) moveVector.add(up);
        if (this.moveDown) moveVector.sub(up);

        // Only normalize if multiple keys are pressed to prevent diagonal boost
        if (moveVector.lengthSq() > 0) {
            if (moveVector.lengthSq() > 1) moveVector.normalize();
            moveVector.multiplyScalar(this.speed);
            this.camera.position.add(moveVector);
        }

        this.camera.quaternion.copy(quat);

        // HUD update
        const p = this.camera.position;
        this.posDisplay.innerText = `Cam: X:${p.x.toFixed(0)} Y:${p.y.toFixed(0)} Z:${p.z.toFixed(0)}`;
    }


    setBlocked(blocked) {
        this.isBlocked = blocked;
    }
}
