import * as THREE from 'three';

export default class EditorCamera {
    constructor(camera, domElement, moonPos = new THREE.Vector3(0,0,0), speed = 200, lookSpeed = 0.002) {
        this.camera = camera;
        this.domElement = domElement;
        this.moonPos = new THREE.Vector3(0,0,0); 
        this.speed = speed;
        this.lookSpeed = lookSpeed;

        // Movement states
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;

        // Rotation
        this.pitch = 0;
        this.yaw = 0;
        this.isDragging = false; 

        this.camera.position.set(415341, 127682, -11589);

        this._bindEvents();
    }

    _bindEvents() {
        // Keyboard
        this.domElement.addEventListener('keydown', (e) => this._onKeyDown(e));
        this.domElement.addEventListener('keyup', (e) => this._onKeyUp(e));

        // Mouse
        this.domElement.addEventListener('mousedown', (e) =>  {if (e.button === 2) this.isDragging = true});
        this.domElement.addEventListener('mouseup', (e) => {if (e.button === 2) this.isDragging = false});
        this.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        // Ensure canvas can capture keyboard
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
        if (!this.isDragging || this.isBlock) return; 
        this.yaw -= event.movementX * this.lookSpeed;
        this.pitch -= event.movementY * this.lookSpeed;
        this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
    }

    update(delta) {

        if (this.isBlocked) return;
        const up = this.camera.position.clone().sub(this.moonPos).normalize();

        let forwardRef = new THREE.Vector3(0,0,-1);
        if (Math.abs(up.dot(forwardRef)) > 0.99) forwardRef.set(1,0,0);

        const right = new THREE.Vector3().crossVectors(up, forwardRef).normalize();
        const forward = new THREE.Vector3().crossVectors(right, up).normalize();

        const quatYaw = new THREE.Quaternion().setFromAxisAngle(up, this.yaw);
        const forwardYawed = forward.clone().applyQuaternion(quatYaw);
        const quatPitch = new THREE.Quaternion().setFromAxisAngle(right, -this.pitch);
        const lookDir = forwardYawed.clone().applyQuaternion(quatPitch);

        const moveVector = new THREE.Vector3();
        const rightDir = right.clone().applyQuaternion(quatYaw);

        if (this.moveForward) moveVector.add(lookDir);
        if (this.moveBackward) moveVector.add(lookDir.clone().negate());
        if (this.moveLeft) moveVector.add(rightDir);
        if (this.moveRight) moveVector.add(rightDir.clone().negate());
        if (this.moveUp) moveVector.add(up);
        if (this.moveDown) moveVector.add(up.clone().negate());

        if (moveVector.lengthSq() > 0) {
            moveVector.normalize().multiplyScalar(this.speed * delta);
            this.camera.position.add(moveVector);
        }

        this.camera.up.copy(up);
        this.camera.lookAt(this.camera.position.clone().add(lookDir));
    }

    setBlocked(blocked) {
        this.isBlocked = blocked; 
    }

}

