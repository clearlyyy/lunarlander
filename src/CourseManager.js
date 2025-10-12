import * as THREE from 'three';

import { getCookie, setCookie } from './cookies';

export default class CourseManager {
    constructor(obstacles = [], startPos, difficulty, courseName, description, player) {
        this.obstacles = obstacles; 
        this.player = player;       
        this.startPos = startPos;
        this.difficulty = difficulty;
        this.courseName = courseName;
        this.description = description;

        this.sounds = [
            new Audio('positive 2.wav'),
        ];        
        this.sounds.forEach(s => s.volume = 0.2);
        this.currentSoundIndex = 0;

        this.completedObstacles = 0;
        this.timerElement = document.getElementById("timer");
        this.timerInterval = null;
        this.startTime = null;
        this.completeSound = new Audio('complete.mp3');
        this.highScoreSound = new Audio('high-score.mp3');
        this.completeSound.volume = 0.4;
        this.highScoreSound.volume = 0.5;
    }

    StartCourse() {
        console.log("Starting Course");

        this.completedObstacles = 0;

        this.startTime = Date.now();
        if (this.timerElement) this.timerElement.textContent = "00:00:00";

        this.timerElement.style.display = "block";

        if (this.timerInterval) clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime; // in ms
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const milliseconds = Math.floor((elapsed % 1000) / 10); 

            const format = 
                `${String(minutes).padStart(2, '0')}:` +
                `${String(seconds).padStart(2, '0')}:` +
                `${String(milliseconds).padStart(2, '0')}`;

            if (this.timerElement) this.timerElement.textContent = format;
        }, 30); 

    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    playNextSound() {
        const sound = this.sounds[this.currentSoundIndex];
        sound.currentTime = 0; 
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
                this.completedObstacles++;

                if (this.completedObstacles >= this.obstacles.length) {
                    this.finishCourse();
                }
            }
        }
    } 

    finishCourse() {
        // Hide timer display
        const timerEl = document.getElementById("timer");
        if (timerEl) timerEl.style.display = "none";
        this.stopTimer();

        // Calculate total elapsed time
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const milliseconds = Math.floor((elapsed % 1000) / 10);

        const finalTimeFormatted =
            `${String(minutes).padStart(2, '0')}:` +
            `${String(seconds).padStart(2, '0')}:` +
            `${String(milliseconds).padStart(2, '0')}`;

        console.log(`Course Finished! Total Time: ${finalTimeFormatted}`);

        // Identify course
        const courseKey = `bestTime_${this.courseName}`;

        // Load old best time
        const oldTimeStr = getCookie(courseKey);
        let oldTimeMs = oldTimeStr ? parseInt(oldTimeStr) : null;

        const finishScreen = document.getElementById("finish-screen");
        const newHighScoreScreen = document.getElementById("new-high-score-screen");
        const finalTimeScreen = document.getElementById("final-time-screen");

        newHighScoreScreen.style.display = "none";
        finalTimeScreen.style.display = "none";
        finishScreen.style.display = "flex"; 

        const formatTime = (ms) => {
            const m = Math.floor(ms / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            const ms2 = Math.floor((ms % 1000) / 10);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(ms2).padStart(2, '0')}`;
        };

        // Compare times
        if (oldTimeMs === null || elapsed < oldTimeMs) {
            console.log("New High Score!");

            this.highScoreSound.currentTime = 0;
            this.highScoreSound.play();

            setCookie(courseKey, elapsed.toString(), 365);

            document.getElementById("final-time-new").textContent = finalTimeFormatted;
            document.getElementById("old-time-new").textContent = oldTimeMs ? formatTime(oldTimeMs) : "None";

            newHighScoreScreen.style.display = "flex";
        } else {
            // Did not beat best
            console.log("Finished, but not a new record.");
            this.completeSound.currentTime = 0;
            this.completeSound.play();
            document.getElementById("final-time").textContent = finalTimeFormatted;
            document.getElementById("old-time").textContent = formatTime(oldTimeMs);

            finalTimeScreen.style.display = "flex";
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
        this.stopTimer();

        if (!this.obstacles || this.obstacles.length === 0) {
            this.obstacles = [];
            this.player = null;
            return;
        }

        for (const obstacle of this.obstacles) {
            try {
                const body = obstacle.body;
                const pw = obstacle.physicsWorld || this.physics || null;
                const world = (pw && (pw.world || pw)) || null;

                if (body) {
                    if (pw) {
                        if (typeof pw.removeRigidBody === 'function') pw.removeRigidBody(body);
                        else if (typeof pw.removeBody === 'function') pw.removeBody(body);
                        else if (typeof pw.remove === 'function') pw.remove(body);
                        else if (world && typeof world.removeRigidBody === 'function') world.removeRigidBody(body);
                    }

                    const ammoLib = (typeof Ammo !== 'undefined') ? Ammo : (pw && pw.Ammo) ? pw.Ammo : null;
                    if (ammoLib) {
                        const ms = body.getMotionState && body.getMotionState();
                        if (ms) ammoLib.destroy(ms);
                        const shape = body.getCollisionShape && body.getCollisionShape();
                        if (shape) ammoLib.destroy(shape);
                        ammoLib.destroy(body);
                    }
                }
            } catch (e) {
                console.warn('Error while removing obstacle body:', e);
            }

            // Mesh cleanup 
            try {
                const removeAndDisposeMesh = (mesh) => {
                    if (!mesh) return;
                    if (mesh.parent) mesh.parent.remove(mesh);

                    mesh.traverse?.((child) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m && m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                };

                // Remove both possible mesh references
                removeAndDisposeMesh(obstacle.visualMesh);
                removeAndDisposeMesh(obstacle.mesh);

                obstacle.visualMesh = null;
                obstacle.mesh = null;
            } catch (e) {
                console.warn('Failed to dispose obstacle meshes:', e);
            }

            obstacle.body = null;
            obstacle.physicsWorld = null;
        }

        this.obstacles.length = 0;
        this.obstacles = [];
        this.player = null;

        console.log('CourseManager.destroy: fully cleaned up obstacles + physics + meshes.');
    }

}
