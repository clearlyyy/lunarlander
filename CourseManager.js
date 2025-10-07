import * as THREE from 'three';

export default class CourseManager {
    constructor(obstacles = [], player) {
        this.obstacles = obstacles; // Array of Obstacle instances
        this.player = player;       // Your Player instance
    }

    /**
     * Call this every frame
     */
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
 

    /**
     * Optionally, update the obstacles list
     */
    setObstacles(obstacles) {
        this.obstacles = obstacles;
    }
}
