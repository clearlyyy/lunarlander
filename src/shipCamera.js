import * as THREE from 'three';

export default class ShipCamera {
    constructor(camera, domElement, ship, isInMainMenu) {
        this.camera = camera;
        this.domElement = domElement;
        this.ship = ship;
        this.isInMainMenu = isInMainMenu;

        this.distance = 150;          
        this.minDistance = 20;
        this.maxDistance = 9000;

        this.azimuth = 0;             
        this.elevation = Math.PI / 6; 

        this.isDragging = false;
        this.prevMouse = new THREE.Vector2();

        this._bindEvents();
        this.updateCamera();
    }

    _bindEvents() {
        this.domElement.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.prevMouse.set(e.clientX, e.clientY);
        });

        this.domElement.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.domElement.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const deltaX = e.clientX - this.prevMouse.x;
            const deltaY = e.clientY - this.prevMouse.y;

            this.prevMouse.set(e.clientX, e.clientY);

            this.azimuth -= deltaX * 0.005;
            this.elevation += deltaY * 0.005;

            const maxElev = Math.PI / 2 - 0.01;
            const minElev = -Math.PI / 2 + 0.01;
            this.elevation = Math.max(minElev, Math.min(maxElev, this.elevation));

            this.updateCamera();
        });

        this.domElement.addEventListener('wheel', (e) => {
            this.distance += e.deltaY * 0.2;
            this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
            this.updateCamera();
        });
    }

    updateCamera(moonPos = new THREE.Vector3(0, 0, 0)) {
        if (!this.ship.mesh || this.isInMainMenu()) return;

        const shipPos = this.ship.mesh.position;
        const up = shipPos.clone().sub(moonPos).normalize(); // radial up

        // Build a local frame: right & forward
        const forward = new THREE.Vector3(0, 0, 1); // arbitrary initial forward
        if (up.dot(forward) > 0.999) forward.set(1, 0, 0); // avoid parallel
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();
        const localForward = new THREE.Vector3().crossVectors(right, up).normalize();

        // Compute offset in local frame
        const offset = new THREE.Vector3();
        offset.add(right.clone().multiplyScalar(Math.sin(this.azimuth) * Math.cos(this.elevation) * this.distance));
        offset.add(localForward.clone().multiplyScalar(Math.cos(this.azimuth) * Math.cos(this.elevation) * this.distance));
        offset.add(up.clone().multiplyScalar(Math.sin(this.elevation) * this.distance));

        // Set camera
        this.camera.position.copy(shipPos.clone().add(offset));
        this.camera.up.copy(up);
        this.camera.lookAt(shipPos);
    }

    setRotation(euler) {
        // Yaw (rotation around Y axis) controls azimuth (horizontal)
        this.azimuth = euler.y;
        
        // Pitch (rotation around X axis) controls elevation (vertical)
        this.elevation = euler.x;
        
        // Update camera to reflect new orientation
        this.updateCamera();
    }

 

    update() {
        this.updateCamera();
    }
}