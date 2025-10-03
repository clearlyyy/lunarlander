import * as THREE from 'three';

export default class ShipCamera {
    constructor(camera, domElement, ship) {
        this.camera = camera;
        this.domElement = domElement;
        this.ship = ship;

        this.distance = 150;          // default distance from ship
        this.minDistance = 20;
        this.maxDistance = 500;

        this.azimuth = 0;             // horizontal rotation
        this.elevation = Math.PI / 6; // vertical rotation

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
            this.elevation -= deltaY * 0.005;

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

    updateCamera() {
        if (!this.ship.mesh) return; // <-- prevent errors until mesh is loaded

        const offset = new THREE.Vector3(
            Math.cos(this.elevation) * Math.sin(this.azimuth),
            -Math.sin(this.elevation),
            Math.cos(this.elevation) * Math.cos(this.azimuth)
        ).multiplyScalar(this.distance);

        this.camera.position.copy(this.ship.mesh.position.clone().add(offset));
        this.camera.lookAt(this.ship.mesh.position);
    } 

    update() {
        this.updateCamera();
    }
}