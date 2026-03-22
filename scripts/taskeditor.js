// ERROR-MESSAGES

/**
 * Initializes validation behavior for a required input field.
 * Tracks whether the field has been focused and toggles an error state
 * when the field loses focus and remains empty.
 *
 * @param {string} inputId - The ID of the input element to validate.
 * @param {string} wrapperClass - The CSS selector of the wrapper element used to display the error state.
 * @returns {void}
 */
function setupRequiredField(inputId, wrapperClass) {
    let { input, wrapper } = getRequiredFieldElements(inputId, wrapperClass);
    if (!input || !wrapper) return;

    let wasFocused = false;

    input.addEventListener("focus", () => {
        wasFocused = true;
    });

    input.addEventListener("blur", () => {
        toggleRequiredError(input, wrapper, wasFocused);
    });
}

/**
 * Retrieves the DOM elements associated with a required input field.
 * Returns both the input element and its wrapper element as an object
 * so they can be validated and manipulated safely.
 *
 * @param {string} inputId - The ID of the input element.
 * @param {string} wrapperClass - The CSS selector of the wrapper element.
 * @returns {{input: HTMLElement|null, wrapper: HTMLElement|null}} Object containing the input and wrapper elements.
 */
function getRequiredFieldElements(inputId, wrapperClass) {
    let input = document.getElementById(inputId);
    let wrapper = document.querySelector(wrapperClass);

    if (!input || !wrapper) {
        console.warn("setupRequiredField: not found", { inputId, wrapperClass });
    }

    return { input, wrapper };
}

/**
 * Toggles the visual and accessibility error state of a required input field.
 * Applies an error class and ARIA attributes if the field was focused and
 * remains empty, otherwise removes the error state.
 *
 * @param {HTMLInputElement} input - The input element to validate.
 * @param {HTMLElement} wrapper - The wrapper element that receives the error class.
 * @param {boolean} wasFocused - Indicates whether the input field has been focused previously.
 * @returns {void}
 */
function toggleRequiredError(input, wrapper, wasFocused) {
    if (wasFocused && input.value.trim() === "") {
        wrapper.classList.add("error");
        input.setAttribute("aria-invalid", "true");
        wrapper.setAttribute("aria-expanded", "true");
    } else {
        wrapper.classList.remove("error");
        input.removeAttribute("aria-invalid");
        wrapper.setAttribute("aria-expanded", "false");
    }
}

// PRIORITY-BUTTONS

/**
 * Initializes the priority button group behavior.
 * Ensures that only one priority button can be active at a time
 * by removing the active class from all buttons and applying it
 * to the button that was clicked.
 *
 * @returns {void}
 */
function prioBtnActiveToggle() {
    let prioButtons = document.querySelectorAll(".prio");
    prioButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            prioButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });
}

// DATABASE

/**
 * Retrieves the currently selected priority value.
 * If no priority button is active, the default value "medium" is returned.
 *
 * @returns {string} Active priority value ("urgent" | "medium" | "low").
 */
function getActivePriority() {
    let activeBtn = document.querySelector(".prio.active");
    return activeBtn ? activeBtn.dataset.prio : "medium";
}

/**
 * Retrieves all currently selected assigned contacts from the dropdown.
 *
 * @returns {{id: string, name: string}[]} Array of assigned contact objects containing ID and name.
 */
function getAssignedContacts() {
    let checked = document.querySelectorAll(
        "#assignedDropdown input[type='checkbox']:checked"
    );

    return Array.from(checked).map(cb => ({
        id: cb.dataset.contactid,
        name: cb.dataset.contactname
    }));
}

/**
 * Saves a task object to Firebase Realtime Database.
 *
 * @param {Object} task - Task object that should be stored in the database.
 * @returns {Promise<void>} Promise resolving once the task has been stored successfully.
 */
async function saveTaskToFirebase(task) {
    if (typeof window.waitForFirebaseAuthReady === "function") {
        await window.waitForFirebaseAuthReady();
    }
    let taskRef = firebase.database().ref("tasks").push();
    await taskRef.set(task);
}

/**
 * Initializes the "Create Task" button behavior.
 * Attaches a click handler that validates the form and triggers task creation.
 *
 * @returns {void}
 */
function setupCreateTaskButton() {
    let btn = document.querySelector(".create_btn");
    let form = document.getElementById("taskForm");

    btn.addEventListener("click", e => handleCreateTaskClick(e, form));
}

/**
 * Handles the create-task button click event.
 * Validates the form and triggers saving the task to the database.
 *
 * @param {Event} e - Click event triggered by the create button.
 * @param {HTMLFormElement} form - Task form element that will be validated.
 * @returns {void}
 */
function handleCreateTaskClick(e, form) {
    e.preventDefault();

    let valid = validateTaskForm();
    if (!valid) return;

    let task = buildTaskObject();

    saveTaskToFirebase(task)
        .then(handleTaskCreatedSuccess)
        .catch(handleFirebaseError);
}

/**
 * Sets minDate to today for the date input field to prevent selecting past dates.
 *
 * @returns {void}
 */
function setMinDateToToday() {
    let dateInput = document.getElementById("dateInput");
    if (!dateInput) return;

    let today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
}

/**
 * Builds the task object from the current form values.
 * Collects all relevant input fields and generates a structured
 * task object ready for database storage.
 *
 * @returns {Object} Task data object containing title, description, date, priority, category, assigned contacts, and subtasks.
 */
function buildTaskObject() {
    return {
        title: document.getElementById("titleInput").value.trim(),
        description: document.querySelector("textarea").value.trim(),
        dueDate: document.getElementById("dateInput").value.trim(),
        priority: getActivePriority(),
        category: document.getElementById("categoryInput")?.dataset.value || "",
        assignedTo: getAssignedContacts(),
        subtasks: getSubtasks(),
        status: "todo",
        createdAt: Date.now()
    };
}

/**
 * Handles the successful task creation workflow.
 * Closes the modal, displays a success notification,
 * and redirects the user to the task board.
 *
 * @returns {void}
 */
function handleTaskCreatedSuccess() {
    closeAddTaskModal();
    showTaskSuccessToast();
    redirectToBoardAfterDelay();
}

/**
 * Displays the task creation success toast notification.
 *
 * @returns {void}
 */
function showTaskSuccessToast() {
    let toast = document.getElementById("taskSuccessToast");
    toast.classList.add("show");
    document.body.style.pointerEvents = "none";
}

/**
 * Redirects the user to the task board after a short delay.
 *
 * @returns {void}
 */
function redirectToBoardAfterDelay() {
    setTimeout(() => {
        window.location.href = "./taskboard.html";
    }, 2200);
}

/**
 * Handles Firebase save errors by logging them to the console.
 *
 * @param {Error} err - Error object returned by Firebase.
 * @returns {void}
 */
function handleFirebaseError(err) {
    console.error("Firebase error:", err);
}

// MODAL

/**
 * Opens the "Add Task" modal and triggers the opening animation.
 * Clears any pending close timeout and updates the accessibility state.
 *
 * @returns {void}
 */
function openAddTaskModal() {
    let modal = document.getElementById("addTaskModal");
    if (!modal) return;

    if (modal._closeTimeout) {
        clearTimeout(modal._closeTimeout);
        modal._closeTimeout = null;
    }

    modal.classList.remove("hidden");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.setAttribute("aria-hidden", "false");
}

/**
 * Closes the "Add Task" modal with an animation.
 * The modal is hidden after the transition completes
 * and the accessibility state is updated.
 *
 * @returns {void}
 */
function closeAddTaskModal() {
    let modal = document.getElementById("addTaskModal");
    if (!modal) return;

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    if (modal._closeTimeout) {
        clearTimeout(modal._closeTimeout);
    }

    modal._closeTimeout = setTimeout(() => {
        modal.classList.add("hidden");
        modal._closeTimeout = null;
    }, 600);
}

/**
 * Initializes modal control listeners.
 * Adds click handlers for the close button and modal backdrop.
 *
 * @returns {void}
 */
function setupModalControls() {
    document.querySelector(".modal_close")?.addEventListener("click", closeAddTaskModal);
    document.querySelector(".modal_backdrop")?.addEventListener("click", closeAddTaskModal);
}

// INIT

/**
 * Initializes the entire Task Editor page.
 * Sets up all UI components, dropdowns, event listeners,
 * and loads required data sources.
 *
 * @returns {void}
 */
function loadTaskEditorPage() {
    setupRequiredField("titleInput", ".title_field");
    setupRequiredField("dateInput", ".date_field");
    prioBtnActiveToggle();
    setupAssignedSearch();
    setupCategoryDropdown();
    setupSubtasks();
    setupCreateTaskButton();
    setupClearButton();
    setupModalControls();

    loadContacts();
    loadCategories();
}

/**
 * Initializes the Task Editor once.
 * Prevents multiple initializations of the editor logic.
 *
 * @returns {void}
 */
let taskEditorInitialized = false;
function initTaskEditor() {
    if (taskEditorInitialized) return;
    loadTaskEditorPage();
    taskEditorInitialized = true;
}

/**
 * Determines whether the Task Editor should initialize automatically
 * based on the current page URL.
 *
 * @returns {boolean} True if the editor should be initialized on this page.
 */
function shouldInitTaskEditorOnLoad() {
    return window.location.pathname.toLowerCase().includes("task-editor.html");
}
/**
 * Validates the task form inputs.
 * @returns {void}
 */
function validateTaskForm() {
    let title = document.getElementById("titleInput");
    let date = document.getElementById("dateInput");
    let category = document.getElementById("categoryInput");
    let titleWrapper = document.querySelector(".title_field");
    let dateWrapper = document.querySelector(".date_field");
    let categoryWrapper = document.getElementById("categorySelectWrapper");
    let valid = true;
    if (title.value.trim() === "") {
        titleWrapper.classList.add("error");
        valid = false;
    }
    if (date.value.trim() === "") {
        dateWrapper.classList.add("error");
        valid = false;
    }
    if (!category.dataset.value) {
        categoryWrapper.classList.add("error");
        valid = false;
    }
    return valid;
}

/**
 * Runs the Task Editor initialization after the DOM has fully loaded.
 */
document.addEventListener("DOMContentLoaded", () => {
    if (shouldInitTaskEditorOnLoad()) {
        initTaskEditor();
    }
});
