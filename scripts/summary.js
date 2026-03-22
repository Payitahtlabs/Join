/**
 * @category Summary
 */

/**
 * Initialisiert die Summary-Ansicht und lädt die Daten.
 */

const SUMMARY_CACHE_KEY = "join_summary_cache_v1";
const SUMMARY_CACHE_TTL_MS = 15000;
let summaryRefreshListenersBound = false;

/**
 * Main initialization function for the summary page.
 * Fetches user information and tasks to render the initial dashboard state.
 *
 * @async
 * @category Summary
 * @subcategory Lifecycle
 * @returns {Promise<void>}
 */
async function loadSummary() {
    bindSummaryRefreshListeners();
    setGreeting();
    const cachedSummary = readSummaryCache();
    if (cachedSummary) {
        renderUserName(cachedSummary.userName);
        renderSummary(cachedSummary.tasks);
    } else {
        renderUserName("Guest");
    }
    showMobileGreetingIfNeeded();
    try {
        const userIdPromise = resolveActiveUserId();
        const tasksPromise = getTasks();
        const userId = await userIdPromise;
        const [userName, tasks] = await Promise.all([getUserName(userId), tasksPromise]);
        renderUserName(userName);
        renderSummary(tasks);
        writeSummaryCache({ userName, tasks, updatedAt: Date.now() });
        updateMobileGreetingName(userName);
    } catch (error) {console.error("Error in loadSummary:", error);}
}

/**
 * Reads cached summary payload from localStorage.
 *
 * @returns {{ userName: string, tasks: Object }|null} Cached summary payload or null.
 */
function readSummaryCache() {
    try {
        const raw = localStorage.getItem(SUMMARY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const updatedAt = Number(parsed.updatedAt || 0);
        if (!updatedAt || Date.now() - updatedAt > SUMMARY_CACHE_TTL_MS) {
            return null;
        }

        return {
            userName: typeof parsed.userName === "string" ? parsed.userName : "Guest",
            tasks: parsed.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {},
        };
    } catch (error) {
        return null;
    }
}

/**
 * Writes summary payload into localStorage.
 *
 * @param {{ userName: string, tasks: Object, updatedAt?: number }} payload - Summary payload.
 * @returns {void}
 */
function writeSummaryCache(payload) {
    try {
        localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(payload || {}));
    } catch (error) {
        return;
    }
}

/**
 * Resolves the currently active user ID from a global context or session storage.
 *
 * @async
 * @category Summary
 * @subcategory Data Handling
 * @returns {Promise<string|null>} The active user ID or null if not found.
 */
async function resolveActiveUserId() {
    if (window.userContext?.resolveUserId) {
        return window.userContext.resolveUserId();
    }
    return sessionStorage.getItem('userId');
}

/**
 * Fetches all task data from the Firebase "tasks" reference.
 *
 * @async
 * @category Summary
 * @subcategory Data Handling
 * @returns {Promise<Object>} An object containing all tasks from the database.
 */
async function getTasks() {
    if (typeof window.waitForFirebaseAuthReady === "function") {
        await window.waitForFirebaseAuthReady();
    }
    const tasksRef = db.ref("tasks");
    try {
        const snapshot = await tasksRef.get();
        return snapshot.val() || {};
    } catch (error) {
        if (typeof window.waitForFirebaseAuthReady === "function") {
            await window.waitForFirebaseAuthReady();
        }
        const retrySnapshot = await tasksRef.get();
        return retrySnapshot.val() || {};
    }
}

/**
 * Registers listeners to refresh summary after returning to the page.
 * Handles bfcache restores and tab refocus without requiring manual reload.
 * @returns {void}
 */
function bindSummaryRefreshListeners() {
    if (summaryRefreshListenersBound) return;
    summaryRefreshListenersBound = true;

    window.addEventListener("pageshow", (event) => {
        if (event.persisted) loadSummary();
    });

    window.addEventListener("focus", () => {
        loadSummary();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") loadSummary();
    });
}

/**
 * Retrieves the name of a specific user from Firebase by their ID.
 *
 * @async
 * @category Summary
 * @subcategory Data Handling
 * @param {string} userId - The unique ID of the user to fetch.
 * @returns {Promise<string>} The user's name or "Guest" as a fallback.
 */
async function getUserName(userId) {
    if (!userId) return "Guest";
    const userRef = db.ref("users/" + userId);
    const snapshot = await userRef.get();
    return snapshot.val()?.name || "Guest";
}

/**
 * Displays the user's name in the designated HTML element.
 *
 * @category Summary
 * @subcategory UI Rendering
 * @param {string} name - The name to be rendered.
 * @returns {void}
 */
function renderUserName(name) {
    document.getElementById("user-name").innerText = name;
}

/**
 * Calculates task statistics by status and priority.
 *
 * @param {Object} tasks - The task object containing all tasks.
 * @returns {Object} An object with task counts by category.
 */
function calculateTaskStats(tasks) {
    const taskList = Object.values(tasks || {});
    const normalizeStatus = (status) => String(status || "").trim().toLowerCase();

    return {
        totalTasks: taskList.length,
        todoCount: taskList.filter((t) => normalizeStatus(t.status) === "todo").length,
        inProgressCount: taskList.filter((t) => normalizeStatus(t.status) === "in-progress").length,
        doneCount: taskList.filter((t) => normalizeStatus(t.status) === "done").length,
        urgentCount: taskList.filter((t) => t.priority === "urgent").length,
        feedbackCount: taskList.filter((t) => {
            const status = normalizeStatus(t.status);
            return status === "await-feedback" || status === "awaiting-feedback";
        }).length,
    };
}

/**
 * Calculates and renders task statistics to the UI.
 * Filters tasks by status and priority to update the dashboard counters.
 *
 * @category Summary
 * @subcategory UI Rendering
 * @param {Object} tasks - The task object containing all tasks.
 * @returns {void}
 */
function renderSummary(tasks) {
    const stats = calculateTaskStats(tasks);
    document.getElementById("total-tasks").innerText = stats.totalTasks;
    document.getElementById("todo-tasks").innerText = stats.todoCount;
    document.getElementById("inprogress-tasks").innerText = stats.inProgressCount;
    document.getElementById("done-tasks").innerText = stats.doneCount;
    document.getElementById("urgent-tasks").innerText = stats.urgentCount;
    document.getElementById("awaitFeedback-tasks").innerText = stats.feedbackCount;
    renderNextDeadline(tasks);
}

/**
 * Determines the current time of day and displays an appropriate greeting.
 *
 * @category Summary
 * @subcategory UI Rendering
 * @returns {void}
 */
function setGreeting() {
    const curHr = new Date().getHours();
    const msg = curHr < 12 ? 'Good Morning,' : curHr < 17 ? 'Good Afternoon,' : 'Good Evening,';
    document.getElementById("greet").innerHTML = msg;
}

/**
 * Finds the closest upcoming task deadline from all available tasks.
 *
 * @param {Object} tasks - The task object from Firebase.
 * @returns {Date|null} The closest upcoming deadline date or null if none found.
 */
function findClosestDeadline(tasks) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let closestDeadline = null;
    Object.values(tasks).forEach(task => {
        if (!task.dueDate) return;
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        if (taskDate >= today && (!closestDeadline || taskDate < closestDeadline)) {
            closestDeadline = taskDate;
        }
    });
    return closestDeadline;
}

/**
 * Finds the task object that matches a specific deadline date.
 *
 * @param {Object} tasks - The task object from Firebase.
 * @param {Date} deadline - The deadline date to match against.
 * @returns {Object|null} The matching task object or null if not found.
 */
function findTaskByDeadline(tasks, deadline) {
    return Object.values(tasks).find(task => {
        if (!task.dueDate) return false;
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === deadline.getTime();
    }) || null;
}

/**
 * Renders the next upcoming deadline date into the designated HTML element.
 *
 * @param {Object} tasks - The task object from Firebase.
 * @returns {void}
 */
function renderNextDeadline(tasks) {
    const deadline = findClosestDeadline(tasks);
    const task = deadline ? findTaskByDeadline(tasks, deadline) : null;
    document.getElementById("next-deadline").innerText = task
        ? task.dueDate
        : "No upcoming deadlines";
}

/** Referenz auf das Overlay-Element, damit updateMobileGreetingName drauf zugreifen kann */
let _mobileGreetingOverlay = null;

/**
 * Zeigt auf Mobile (≤ 992px) ein Vollbild-Begrüßungs-Overlay,
 * das nach 2s ausblendet und das Board darunter freigibt.
 * Liest Greeting-Text und Namen direkt aus dem DOM (bereits befüllt).
 *
 * @returns {void}
 */
function showMobileGreetingIfNeeded() {
    if (window.innerWidth > 992) return;

    const greetText = document.getElementById('greet')?.innerHTML || '';
    const nameText  = document.getElementById('user-name')?.innerText || '';

    
    const overlay = document.createElement('div');
    overlay.className = 'mobile-greeting-overlay';
    overlay.innerHTML = `
        <h2 class="overlay-greet">${greetText}</h2>
        <span class="user-name overlay-name">${nameText}</span>
    `;
    document.body.appendChild(overlay);
    _mobileGreetingOverlay = overlay;

   
    const board   = document.querySelector('.dashboard-wrapper');
    const header  = document.querySelector('.summary-header');
    if (board)  board.classList.add('board-hidden');
    if (header) header.classList.add('board-hidden');

   
    requestAnimationFrame(() => overlay.classList.add('visible'));

   
    setTimeout(() => {
        if (board)  { board.classList.remove('board-hidden');  board.classList.add('board-visible'); }
        if (header) { header.classList.remove('board-hidden'); header.classList.add('board-visible'); }

        overlay.addEventListener('animationend', () => {
            overlay.remove();
            _mobileGreetingOverlay = null;
        }, { once: true });
    }, 2700);
}

/**
 * Aktualisiert den Namen im Overlay, falls es noch sichtbar ist
 * (z.B. wenn Firebase den echten Namen nach "Guest" liefert).
 *
 * @param {string} name - Der endgültige Benutzername.
 * @returns {void}
 */
function updateMobileGreetingName(name) {
    if (!_mobileGreetingOverlay) return;
    const nameEl = _mobileGreetingOverlay.querySelector('.overlay-name');
    if (nameEl) nameEl.innerText = name;
}


