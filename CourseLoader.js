import * as THREE from 'three';
import Obstacle from './obstacle';

export default class CourseLoader {
    constructor(scene, camera, renderer, physicsWorld, jsonPath = null) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.obstacles = [];
        this.physicsWorld = physicsWorld;

        // Map obstacle types to model paths
        this.modelMap = {
            ring: 'assets/models/truss_ring.glb', 
            box: 'assets/models/truss_box.glb'
        };

        if (jsonPath) {
            this.loadFromPath(jsonPath);
        }
    }

    async loadFromPath(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();

            this.clearObstacles();

            for (const item of data) {
                const position = new THREE.Vector3(
                    item.position.x,
                    item.position.y,
                    item.position.z
                );

                let quaternion;
                if (item.rotation?.w !== undefined) {
                    quaternion = new THREE.Quaternion(
                        item.rotation.x,
                        item.rotation.y,
                        item.rotation.z,
                        item.rotation.w
                    );
                } else {
                    const euler = new THREE.Euler(
                        item.rotation.x || 0,
                        item.rotation.y || 0,
                        item.rotation.z || 0
                    );
                    quaternion = new THREE.Quaternion().setFromEuler(euler);
                }

                const modelPath = this.modelMap[item.type] || this.modelMap.ring;

                const obstacle = new Obstacle(
                    position,
                    this.scene,
                    this.camera,
                    this.renderer,
                    this.physicsWorld,
                    quaternion,
                    item.type,
                    modelPath
                );

                this.obstacles.push(obstacle);
            }

            console.log(`Loaded ${this.obstacles.length} obstacles from ${path}.`);
        } catch (e) {
            console.error(`Failed to load obstacles from ${path}:`, e);
        }
    }

    clearObstacles() {
        this.obstacles.forEach(o => {
            if (o.mesh) this.scene.remove(o.mesh);
        });
        this.obstacles = [];
    }
}
