/**
 * @category Board
 * @file taskboard-edit.js
 * Edit-Modus, Kontakte, Subtasks, Delete, Status-Updates, Drag & Drop
 */

/* ==========================================================================
   1. EDIT MODE
   ========================================================================== */

/**
 * Initializes the task edit mode by populating forms with current data.
 * @async
 * @param {string} taskId
 * @returns {Promise<void>}
 */
async function editTask(taskId) {
    const task = boardTaskCache[taskId];
    if (!task) return;
    currentEditSubtasks = task.subtasks ? [...task.subtasks] : [];
    currentEditContacts = task.assignedTo ? [...task.assignedTo] : [];
    const allContacts = await getContactsMap();
    const overlayCard = document.querySelector('#task-overlay .overlay-card');
    overlayCard.innerHTML = getEditTaskTemplate(task, taskId);
    fillContactDropdown(allContacts);
    refreshEditSubtaskUI();
    renderEditContactBadges();
    initEditSubtaskEnterKey();
}

/**
 * Collects all form data to build an updated task object.
 * @returns {Object}
 */
function buildUpdatedTaskData() {
    const activePrioBtn = document.querySelector('.prio-btn-edit[class*="active-"]');
    return {
        title: document.getElementById('edit-title').value,
        description: document.getElementById('edit-description').value,
        dueDate: document.getElementById('edit-date').value,
        priority: activePrioBtn ? activePrioBtn.id.replace('prio-', '') : 'low',
        subtasks: currentEditSubtasks,
        assignedTo: currentEditContacts
    };
}

/**
 * Saves edited task changes to Firebase and updates the UI.
 * @async
 * @param {string} taskId
 * @returns {Promise<void>}
 */
async function saveTaskEdit(taskId) {
    const updatedData = buildUpdatedTaskData();
    try {
        await firebase.database().ref('tasks/' + taskId).update(updatedData);
        boardTaskCache[taskId] = { ...boardTaskCache[taskId], ...updatedData };
        openTaskDetail(taskId);
        renderBoard();
    } catch (e) {
        console.error('Error saving task:', e);
    }
}

/**
 * Sets the priority selection in edit mode and updates button classes.
 * @param {string} prio - 'urgent' | 'medium' | 'low'
 * @returns {void}
 */
function setEditPriority(prio) {
    document.querySelectorAll('.prio-btn-edit')
        .forEach(btn => btn.classList.remove('active-urgent', 'active-medium', 'active-low'));
    document.getElementById('prio-' + prio)?.classList.add('active-' + prio);
}

/**
 * Overrides core task building to include correct board column status.
 * @returns {Object}
 */
function buildTaskObject() {
    const status = (typeof currentSelectedStatus !== 'undefined' && currentSelectedStatus)
        ? currentSelectedStatus : 'todo';
    return {
        title: document.getElementById('titleInput').value.trim(),
        description: document.querySelector('textarea').value.trim(),
        dueDate: document.getElementById('dateInput').value.trim(),
        priority: getActivePriority(),
        category: document.getElementById('categoryInput')?.dataset.value || '',
        assignedTo: getAssignedContacts(),
        subtasks: getSubtasks(),
        status,
        createdAt: Date.now()
    };
}

/**
 * Callback for successful task creation on the board page.
 * @returns {void}
 */
function handleTaskCreatedSuccess() {
    closeAddTaskModal();
    resetTaskForm();
    renderBoard();
}

/* ==========================================================================
   2. CONTACTS
   ========================================================================== */

/**
 * Generates HTML for a single contact item in the dropdown list.
 * @param {string} contactId
 * @param {Object} badge
 * @param {boolean} isAssigned
 * @returns {string}
 */
function buildContactItemHTML(contactId, badge, isAssigned) {
    const displayName = formatContactDisplayName(contactId, badge?.name || '');
    const safeColor = sanitizeColor(badge.color);
    return `<div class="contact-item ${isAssigned ? 'selected' : ''}" onclick="toggleContactSelection('${escapeHtml(contactId)}')">
        <div class="contact-item-left">
            <div class="user-badge" style="background-color: ${safeColor}">${escapeHtml(badge.initials)}</div>
            <span>${escapeHtml(displayName)}</span>
        </div>
        <img src="../assets/icons/checkbox_${isAssigned ? 'white' : 'empty'}.svg">
    </div>`;
}

/**
 * Populates the dropdown menu with all available contacts for assignment.
 * @param {Object} allContacts
 * @returns {void}
 */
function fillContactDropdown(allContacts) {
    const listContainer = document.getElementById('edit-contact-list');
    if (!listContainer) return;
    let html = '';
    getSortedEditContactEntries(allContacts).forEach(([contactId, contact]) => {
        const isAssigned = currentEditContacts.some(c => c.id === contactId);
        html += buildContactItemHTML(contactId, mapContactToBadge(contactId, contact), isAssigned);
    });
    listContainer.innerHTML = html;
}

/**
 * Toggles a contact's selection status in the edit buffer.
 * @param {string} contactId
 * @returns {void}
 */
function toggleContactSelection(contactId) {
    const contactIndex = currentEditContacts.findIndex(c => c.id === contactId);
    if (contactIndex > -1) currentEditContacts.splice(contactIndex, 1);
    else currentEditContacts.push(mapContactToBadge(contactId, boardContactsCache?.[contactId]));
    fillContactDropdown(boardContactsCache);
    renderEditContactBadges();
}

/**
 * Removes a contact from the edit list by its index.
 * @param {number} index
 * @returns {void}
 */
function removeContactFromEdit(index) {
    currentEditContacts.splice(index, 1);
    renderEditContactBadges();
}

/**
 * Updates the UI display of assigned contact badges in edit mode.
 * @returns {void}
 */
function renderEditContactBadges() {
    const container = document.getElementById('edit-assigned-badges');
    if (!container) return;
    container.innerHTML = currentEditContacts.map((u, index) => `
        <div class="user-badge" style="background-color: ${sanitizeColor(u.color)}"
             title="Click to remove ${escapeHtml(u.name)}" onclick="removeContactFromEdit(${index})">
            ${escapeHtml(u.initials)}
        </div>
    `).join('');
}

/**
 * Toggles the visibility of the contact list dropdown in edit mode.
 * @returns {void}
 */
function toggleEditContactList() {
    const list = document.getElementById('edit-contact-list');
    const arrow = document.getElementById('dropdown-arrow');
    list.classList.toggle('hidden');
    arrow.style.transform = list.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
}

/* ==========================================================================
   3. SUBTASKS
   ========================================================================== */

/**
 * Adds a new subtask to the edit buffer and refreshes UI.
 * @returns {void}
 */
function addSubtaskInEdit() {
    const input = document.getElementById('edit-subtask-input');
    const title = input.value.trim();
    if (!title) return;
    currentEditSubtasks.push({ title, completed: false });
    input.value = '';
    refreshEditSubtaskUI();
}

/**
 * Deletes a subtask from the edit buffer and refreshes UI.
 * @param {number} index
 * @returns {void}
 */
function deleteSubtaskFromEdit(index) {
    currentEditSubtasks.splice(index, 1);
    refreshEditSubtaskUI();
}

/**
 * Refreshes the subtask list displayed in the edit form.
 * @returns {void}
 */
function refreshEditSubtaskUI() {
    const list = document.getElementById('edit-subtask-list');
    if (!list) return;
    list.innerHTML = currentEditSubtasks.map((st, index) => `
        <li class="edit-subtask-item">
            <span class="subtask-title">${escapeHtml(st.title)}</span>
            <div class="subtask-actions">
                <img src="../assets/icons/edit.svg" onclick="startSubtaskEdit(${index})" alt="Edit">
                <img src="../assets/icons/delete.svg" onclick="deleteSubtaskFromEdit(${index})" alt="Delete">
            </div>
        </li>
    `).join('');
}

/**
 * Switches a subtask title to an inline edit input.
 * @param {number} index
 * @returns {void}
 */
function startSubtaskEdit(index) {
    const item = document.querySelectorAll('.edit-subtask-item')[index];
    if (!item) return;
    const currentTitle = currentEditSubtasks[index].title;
    item.querySelector('.subtask-title').outerHTML =
        `<input class="subtask-edit-input" value="${escapeHtml(currentTitle)}"
            onblur="finishSubtaskEdit(${index}, this.value)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}
                       if(event.key==='Escape'){event.preventDefault();refreshEditSubtaskUI();}">`;
    item.querySelector('.subtask-edit-input')?.focus();
}

/**
 * Saves the edited subtask title and refreshes the UI.
 * @param {number} index
 * @param {string} newTitle
 * @returns {void}
 */
function finishSubtaskEdit(index, newTitle) {
    const trimmed = newTitle.trim();
    if (trimmed) currentEditSubtasks[index].title = trimmed;
    refreshEditSubtaskUI();
}

/**
 * Binds the Enter key on the subtask input to addSubtaskInEdit.
 * @returns {void}
 */
function initEditSubtaskEnterKey() {
    const input = document.getElementById('edit-subtask-input');
    if (!input) return;
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); addSubtaskInEdit(); }
    });
}

/* ==========================================================================
   4. ACTIONS (DELETE, STATUS UPDATE, DRAG & DROP)
   ========================================================================== */

/**
 * Clears a specific task from local board caches.
 * @param {string} taskId
 * @returns {void}
 */
function clearTaskFromCache(taskId) {
    delete boardTaskCache[taskId];
    writeBoardCache(boardTaskCache);
}

/**
 * Shows a confirmation toast, then deletes the task on confirm.
 * @async
 * @param {string} taskId
 * @returns {Promise<void>}
 */
async function deleteTask(taskId) {
    showDeleteToast(async () => {
        try {
            await firebase.database().ref('tasks/' + taskId).remove();
            showSuccessToast('Task gelöscht');
        } catch (error) {
            console.error('Failed to delete task:', error);
            showSuccessToast('Task konnte nicht gelöscht werden');
        } finally {
            clearTaskFromCache(taskId);
            closeTaskDetail();
            renderBoard();
        }
    });
}

/**
 * Updates the completion status of a subtask in Firebase.
 * @async
 * @param {string} taskId
 * @param {number} index
 * @param {boolean} completed
 * @returns {Promise<void>}
 */
async function updateSubtaskStatus(taskId, index, completed) {
    const subtaskRef = firebase.database().ref(`tasks/${taskId}/subtasks/${index}`);
    const snapshot = await subtaskRef.once('value');
    const oldSubtask = snapshot.val();
    const updatedSubtask = typeof oldSubtask === 'string'
        ? { title: oldSubtask, completed }
        : { ...oldSubtask, completed };
    await subtaskRef.set(updatedSubtask);
    await renderBoard();
    openTaskDetail(taskId);
}

/**
 * Finalizes task movement via drag-and-drop.
 * @param {string} taskId
 * @param {string} newStatus
 * @returns {void}
 */
function onDrop(taskId, newStatus) {
    if (!taskId) return;
    firebase.database().ref('tasks/' + taskId).update({ status: newStatus }).then(() => renderBoard());
}

/**
 * Moves a task to a new status column (mobile detail view).
 * @param {string} taskId
 * @param {string} newStatus
 * @returns {void}
 */
function moveTaskToStatus(taskId, newStatus) {
    if (!taskId || !BOARD_STATUSES.includes(newStatus)) return;
    firebase.database().ref('tasks/' + taskId).update({ status: newStatus })
        .then(() => {
            if (boardTaskCache[taskId]) boardTaskCache[taskId].status = newStatus;
            closeTaskDetail();
            renderBoard();
        });
}