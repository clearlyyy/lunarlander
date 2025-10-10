import * as THREE from 'three';

export default class CourseManager {
    constructor(obstacles = [], startPos, difficulty, courseName, description, player) {
        this.obstacles = obstacles; // Array of Obstacle instances
        this.player = player;       // Your Player instance
        this.startPos = startPos;
        this.difficulty = difficulty;
        this.courseName = courseName;
        this.description = description;

        this.sounds = [
            new Audio('positive 2.wav'),
        ];        
        this.sounds.forEach(s => s.volume = 0.1);
        this.currentSoundIndex = 0;
    }

    playNextSound() {
        const sound = this.sounds[this.currentSoundIndex];
        sound.currentTime = 0; // restart if still playing
        sound.play();

        this.currentSoundIndex = (this.currentSoundIndex + 1) % this.sounds.length;
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
                this.playNextSound();
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
        if (!this.obstacles || this.obstacles.length === 0) {
            this.obstacles = [];
            this.player = null;
            return;
        }

        for (const obstacle of this.obstacles) {
            // physics removal 
            try {
                const body = obstacle.body;
                const pw = obstacle.physicsWorld || this.physics || null; // try a few sources
                const world = (pw && (pw.world || pw)) || null;

                if (body) {
                    // Try common removal methods in order
                    if (pw) {
                        if (typeof pw.removeRigidBody === 'function') {
                            pw.removeRigidBody(body);
                        } else if (typeof pw.removeBody === 'function') {
                            pw.removeBody(body);
                        } else if (typeof pw.remove === 'function') {
                            pw.remove(body);
                        } else if (world && typeof world.removeRigidBody === 'function') {
                            world.removeRigidBody(body);
                        } else {
                            console.warn('CourseManager.destroy: could not find removeRigidBody/removeBody on physics world wrapper', pw);
                        }
                    }

                    // Free Ammo memory
                    const ammoLib = (typeof Ammo !== 'undefined') ? Ammo : (pw && pw.Ammo) ? pw.Ammo : null;
                    if (ammoLib) {
                        try {
                            const ms = body.getMotionState && body.getMotionState();
                            if (ms) {
                                ammoLib.destroy(ms);
                            }
                        } catch (e) {
                            console.warn('Failed to destroy motion state', e);
                        }

                        try {
                            const shape = body.getCollisionShape && body.getCollisionShape();
                            if (shape) {
                                ammoLib.destroy(shape);
                            }
                        } catch (e) {
                            console.warn('Failed to destroy collision shape', e);
                        }

                        try {
                            ammoLib.destroy(body);
                        } catch (e) {
                            console.warn('Failed to destroy body', e);
                        }
                    }
                }
            } catch (e) {
                console.warn('Error while removing obstacle body (ignored):', e);
            }

            // remove visualMesh 
            try {
                if (obstacle.visualMesh) {
                    // remove from scene
                    if (obstacle.visualMesh.parent) obstacle.visualMesh.parent.remove(obstacle.visualMesh);
                    if (obstacle.visualMesh.geometry) obstacle.visualMesh.geometry.dispose();
                    if (Array.isArray(obstacle.visualMesh.material)) {
                        obstacle.visualMesh.material.forEach(m => { if (m) m.dispose(); });
                    } else if (obstacle.visualMesh.material) {
                        obstacle.visualMesh.material.dispose();
                    }
                    obstacle.visualMesh = null;
                }
            } catch (e) {
                console.warn('Failed to remove visualMesh', e);
            }

            // remove model mesh 
            try {
                if (obstacle.mesh) {
                    if (obstacle.mesh.parent) obstacle.mesh.parent.remove(obstacle.mesh);

                    obstacle.mesh.traverse((child) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(mat => { if (mat) mat.dispose(); });
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });

                    obstacle.mesh = null;
                }
            } catch (e) {
                console.warn('Failed to dispose obstacle.mesh', e);
            }

            obstacle.body = null;
            obstacle.physicsWorld = null;
        }

        this.obstacles.length = 0;
        this.obstacles = [];
        this.player = null;

        console.log('CourseManager.destroy: cleaned up obstacles + physics + meshes.');
    }
}
