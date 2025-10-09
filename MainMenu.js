import * as THREE from 'three';

export default class MainMenu {
    constructor(camera, player, startGame, loadCourse) {
        this.camera = camera;
        this.player = player;
        this.fixedPosition = new THREE.Vector3(539237, -163942, 15124);
        this.fixedRotation = new THREE.Euler(0, 90, 0, 'XYZ'); 
        this.offset = new THREE.Vector3(80, 0, 0);

        this.freeFlightButton = document.getElementById("free-flight");
        this.freeFlightButton.addEventListener("click", () => {
            startGame();
        });

        this.courseButtonsContainer = document.getElementById("course-buttons");
        this.loadCourseCallback = loadCourse;

        // Load list of course JSON paths
        fetch('courses.json')
            .then(res => res.json())
            .then(courseFiles => this._createCourseButtons(courseFiles));
    }

    async _createCourseButtons(courseFiles) {
        for (const file of courseFiles) {
            try {
                const res = await fetch(file);
                const courseData = await res.json();

                const btn = document.createElement('div');
                btn.className = 'course-button';

                // Course Name
                const nameDiv = document.createElement('div');
                nameDiv.className = 'course-name';
                nameDiv.innerText = courseData.courseName || file;

                // Course Description
                const descDiv = document.createElement('div');
                descDiv.className = 'course-desc';
                descDiv.innerText = courseData.description || '';

                // Append name and description inside button
                btn.appendChild(nameDiv);
                btn.appendChild(descDiv);

                // Click to load course
                btn.addEventListener('click', () => {
                    this.loadCourseCallback(file);
                });

                this.courseButtonsContainer.appendChild(btn);

            } catch (err) {
                console.error(`Failed to load course ${file}:`, err);
            }
        }
    }


    update() {
        this.player.setPosition(this.fixedPosition);
        const camPos = this.fixedPosition.clone().add(this.offset);
        this.camera.position.copy(camPos);
        this.camera.rotation.copy(this.fixedRotation);
    }
}