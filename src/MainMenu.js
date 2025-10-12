import * as THREE from 'three';

export default class MainMenu {
    constructor(camera, player, startGame, loadCourse) {
        this.camera = camera;
        this.player = player;
        this.fixedPosition = new THREE.Vector3(539237, -163942, 15124);
        this.fixedRotation = new THREE.Euler(0, 90, 0, 'XYZ'); 
        this.offset = new THREE.Vector3(40, 0, 0);

        this.freeFlightButton = document.getElementById("free-flight");
        this.freeFlightButton.addEventListener("click", () => {
            startGame();
        });

        this.courseButtonsContainer = document.getElementById("course-buttons");
        this.loadCourseCallback = loadCourse;

        this.mainPage = document.getElementById("menu-page");
        this.courseSelectPage = document.getElementById("course-select");

        this.coursesButton = document.getElementById("courses");
        this.coursesButton.addEventListener("click", () => {
            this.mainPage.style.display = "none";
            this.courseSelectPage.style.display = "flex";
        })

        this.courseBackButton = document.getElementById("back-button");
        this.courseBackButton.addEventListener("click", () => {
            this.mainPage.style.display = "block";
            this.courseSelectPage.style.display = "none";
        })

        this.settingsButton = document.getElementById("settings");
        this.settingsButton.addEventListener('click', () => {
            document.getElementById("settings-page").style.display = "flex";
        })

        document.getElementById("exit-settings").addEventListener('click', () => {
            document.getElementById("settings-page").style.display = "none";
        })
        this.escMenuSettingsButton = document.getElementById("go-to-settings");
        this.escMenuSettingsButton.addEventListener('click', () => {
            document.getElementById("settings-page").style.display = "flex";
        })

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

                const img = document.createElement('img');
                img.className = "course-image";
                img.src = courseData.image || '';

                const infoDiv = document.createElement('div');
                infoDiv.className = 'course-info';

                // Course Name
                const nameDiv = document.createElement('div');
                nameDiv.className = 'course-name';
                nameDiv.innerText = courseData.courseName || file;

                // Course Description
                const descDiv = document.createElement('div');
                descDiv.className = 'course-desc';
                descDiv.innerText = courseData.description || '';

                const diffDiv = document.createElement('div');
                diffDiv.className = 'difficulty';
                diffDiv.innerText = "Difficulty: " + courseData.difficulty || '';

                infoDiv.appendChild(nameDiv);
                infoDiv.appendChild(descDiv);
                infoDiv.appendChild(diffDiv);

                btn.appendChild(img);
                btn.appendChild(infoDiv);

                btn.addEventListener('click', () => {
                    this.loadCourseCallback(file);
                });

                this.courseButtonsContainer.appendChild(btn);
                
            } catch (err) {
                console.error(`Failed to load course ${file}:`, err);
            }
        }
        const MoreComing = document.createElement('h2');
        MoreComing.innerText = "More Coming soon...";
        this.courseButtonsContainer.appendChild(MoreComing);
    }


    update() {
        this.player.setPosition(this.fixedPosition);
        const camPos = this.fixedPosition.clone().add(this.offset);
        this.camera.position.copy(camPos);
        this.camera.rotation.copy(this.fixedRotation);
    }
}