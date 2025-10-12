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

        this.readyPromise = null;
    }

    loadCourse(jsonPath) {
        if (!jsonPath) return;
        this.readyPromise = this.loadFromPath(jsonPath);
        return this.readyPromise;
    }

    async loadFromPath(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
        
            // Clear previous obstacles
            this.clearObstacles();
        
            // Player Position 
            const playerPosData = data.playerpos || { x: 0, y: 0, z: 0 };
            this.playerStart = new THREE.Vector3(
                playerPosData.x,
                playerPosData.y,
                playerPosData.z
            );
        
            // Player Rotation 
            const playerRotData = data.playerrot || { x: 0, y: 0, z: 0 };
            this.playerRotation = new THREE.Euler(
                playerRotData.x,
                playerRotData.y,
                playerRotData.z
            );
        
            // Course Metadata 
            this.difficulty = data.difficulty || 'normal';
            this.courseName = data.courseName || 'Unnamed Course';
            this.description = data.description || 'Unknown Description';
        
            // Obstacles
            const obstaclesArray = Array.isArray(data) ? data : data.obstacles || [];
            this.obstacles = [];
        
            for (const item of obstaclesArray) {
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
                    false
                );
            
                if (typeof item.number === 'number') obstacle.number = item.number;
            
                this.obstacles.push(obstacle);
            }
        
            this.isReady = true;
            console.log(`Loaded ${this.obstacles.length} obstacles from ${path}.`);
        } catch (e) {
            console.error(`Failed to load obstacles from ${path}:`, e);
        }
    }



    updateObstacleShaders(delta) {
        for (const obstacle of this.obstacles) {
            if (obstacle.visualMesh && obstacle.visualMesh.material?.uniforms?.time) {
                obstacle.visualMesh.material.uniforms.time.value += delta;
            }
        }
    }

    async waitUntilReady() {
        if (this.isReady) return;
        await this.readyPromise;
    }

    clearObstacles() {
        this.obstacles.forEach(o => {
            if (o.mesh) this.scene.remove(o.mesh);
        });
        this.obstacles = [];
    }
}
