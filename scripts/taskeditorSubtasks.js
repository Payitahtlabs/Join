/**
 * Initializes all subtask-related UI interactions.
 * Handles adding, editing, clearing, and keyboard input
 * for the subtask input field and list.
 *
 * @returns {void}
 */
function setupSubtasks() {
    let input = document.getElementById("subtaskInput");
    let list = document.getElementById("subtaskList");
    let wrapper = input?.closest(".subtask_input");
    let addBtn = document.getElementById("subtaskAdd");
    let clearBtn = document.getElementById("subtaskClear");

    if (!input || !list) return;

    addBtn.addEventListener("click", () => handleAddSubtask(input, list, wrapper));
    clearBtn.addEventListener("click", () => clearSubtaskInput(input, wrapper));

    input.addEventListener("input", () => toggleSubtaskActions(input, wrapper));
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddSubtask(input, list, wrapper);
        }
    });
}

/**
 * Adds a new subtask item to the subtask list.
 * The subtask is created only if the input field contains text.
 *
 * @param {HTMLInputElement} input - Input element containing the subtask text.
 * @param {HTMLElement} list - Container element for the subtask list.
 * @param {HTMLElement|null} wrapper - Wrapper element controlling the UI state.
 * @returns {void}
 */
function handleAddSubtask(input, list, wrapper) {
    let value = input.value.trim();
    if (!value) return;

    let li = createSubtaskElement(value);
    list.appendChild(li);

    input.value = "";
    wrapper.classList.remove("has-text");
}

/**
 * Creates a list item element representing a subtask.
 * The element includes controls for editing and deleting the subtask.
 *
 * @param {string} value - Text content of the subtask.
 * @returns {HTMLLIElement} Generated subtask list item element.
 */
function createSubtaskElement(value) {
    let li = document.createElement("li");
    const safeValue = escapeHtml(value);

    li.innerHTML = `
        <span class="subtask_text">• ${safeValue}</span>
        <div class="subtask_item_actions">
            <img src="../assets/icons/edit.svg" class="edit_btn">
            <div class="separator"></div>
            <img src="../assets/icons/delete.svg" class="delete_btn">
        </div>
    `;

    li.querySelector(".delete_btn").addEventListener("click", () => li.remove());
    li.querySelector(".edit_btn").addEventListener("click", () => activateEditMode(li));
    li.addEventListener("dblclick", () => activateEditMode(li));

    return li;
}

/**
 * Activates inline editing mode for a subtask list item.
 * Replaces the text content with an editable input field.
 *
 * @param {HTMLLIElement} li - Subtask list item element to edit.
 * @returns {void}
 */
function activateEditMode(li) {
    li.classList.add("editing");

    let span = li.querySelector(".subtask_text");
    let old = span.textContent.replace("• ", "");

    span.innerHTML = `<input class="subtask_edit_input" value="${escapeHtml(old)}">`;

    let input = span.querySelector("input");
    input.focus();

    input.addEventListener("blur", () => finishSubtaskEdit(li, input));
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
        }
    });
}

/**
 * Finalizes editing of a subtask and updates its displayed text.
 *
 * @param {HTMLLIElement} li - Subtask list item element.
 * @param {HTMLInputElement} input - Input element used for editing.
 * @returns {void}
 */
function finishSubtaskEdit(li, input) {
    let span = li.querySelector(".subtask_text");
    span.textContent = "• " + input.value.trim();
    li.classList.remove("editing");
}

/**
 * Clears the subtask input field and resets the wrapper state.
 *
 * @param {HTMLInputElement} input - Subtask input element.
 * @param {HTMLElement|null} wrapper - Wrapper element controlling the UI state.
 * @returns {void}
 */
function clearSubtaskInput(input, wrapper) {
    input.value = "";
    wrapper.classList.remove("has-text");
}

/**
 * Toggles the visibility of subtask action controls.
 * The wrapper state changes depending on whether the input field contains text.
 *
 * @param {HTMLInputElement} input - Subtask input element.
 * @param {HTMLElement|null} wrapper - Wrapper element controlling the UI state.
 * @returns {void}
 */
function toggleSubtaskActions(input, wrapper) {
    wrapper.classList.toggle("has-text", input.value.trim().length > 0);
}

/**
 * Collects all subtasks currently listed in the editor.
 *
 * @returns {{id: string, title: string, completed: boolean}[]} Array of subtask objects containing ID, title, and completion state.
 */
function getSubtasks() {
    let items = document.querySelectorAll("#subtaskList li span");

    return Array.from(items).map(span => ({
        id: crypto.randomUUID(),
        title: span.textContent.trim(),
        completed: false
    }));
}