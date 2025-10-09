import * as THREE from 'three';

export default class CourseManager {
    constructor(obstacles = [], startPos, difficulty, courseName, description, player) {
        this.obstacles = obstacles; // Array of Obstacle instances
        this.player = player;       // Your Player instance
        this.startPos = startPos;
        this.difficulty = difficulty;
        this.courseName = courseName;
        this.description = description;


    }

    
    checkCollisions() {
        if (!this.player || !this.player.mesh) return;
        
        const playerBox = new THREE.Box3().setFromObject(this.player.mesh);
        
        for (const obstacle of this.obstacles) {
            if (!obstacle.visualMesh) continue;
            const obstacleBox = new THREE.Box3().setFromObject(obstacle.visualMesh);
        
            if (playerBox.intersectsBox(obstacleBox)) {
                console.log(`Passed through obstacle of type=${obstacle.type}`);
                obstacle.removeVisualMesh();
            }
        }
    } 

    reset() {
        this.player.setPosition(this.startPos);
        
        // Reset all obstacles
        for (const obstacle of this.obstacles) {
            obstacle.reset();
        }
    }
 
    setObstacles(obstacles) {
        this.obstacles = obstacles;
    }

    destroy() {
        for (const obstacle of this.obstacles) {
            if (obstacle.visualMesh) {
                if (obstacle.visualMesh.geometry) obstacle.visualMesh.geometry.dispose();
                if (obstacle.visualMesh.material) {
                    if (Array.isArray(obstacle.visualMesh.material)) {
                        obstacle.visualMesh.material.forEach(mat => mat.dispose());
                    } else {
                        obstacle.visualMesh.material.dispose();
                    }
                }
                obstacle.visualMesh.parent?.remove(obstacle.visualMesh);
                obstacle.visualMesh = null;
            }
        }
        this.obstacles = [];
        this.player = null; // optional if you want to completely detach player reference
    }
}
