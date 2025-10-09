
export default class EscMenu {
    constructor(GoToMainMenu) {
        this.EscMenu = document.getElementById("esc-menu");
        this.GoToMenu = document.getElementById("go-to-main-menu");

        this.GoToMenu.addEventListener("click", () => {
            GoToMainMenu();
        });

        this.hide();
    }

    show() {
        this.EscMenu.style.display = "flex";
    }
    hide() {
        this.EscMenu.style.display = "none";
    }
}