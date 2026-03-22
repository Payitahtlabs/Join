/**
 * @category Board
 * @file taskboard-core.js
 * Globale Variablen, Cache-Verwaltung, Normalisierung, Hilfsfunktionen
 */

/* ==========================================================================
   1. GLOBAL VARIABLES & CACHE
   ========================================================================== */

/** All valid board status columns in display order. @type {string[]} */
const BOARD_STATUSES = ['todo', 'in-progress', 'await-feedback', 'done'];
const BOARD_CACHE_KEY = 'join_board_cache_v1';

/** Cache for all loaded contact objects from Firebase. @type {Object|null} */
let boardContactsCache = null;

/** Cache for all normalized task objects of the current board. @type {Object} */
let boardTaskCache = {};

/** Temporary buffer for subtasks in edit mode. @type {Array} */
let currentEditSubtasks = [];

/** Temporary buffer for assigned contacts in edit mode. @type {Array} */
let currentEditContacts = [];

/** Status of the column from which the Add Task modal was opened. @type {string} */
let currentSelectedStatus = 'todo';

/* ==========================================================================
   2. GENERAL UTILITIES
   ========================================================================== */

/**
 * Ensures that a value is returned as an array.
 * Automatically converts Firebase objects (key-value) into an array.
 * @param {*} data
 * @returns {Array}
 */
function ensureArray(data) {
    return Array.isArray(data) ? data : Object.values(data || {});
}

/**
 * Calculates the completion progress of a task's subtasks.
 * @param {Array|Object} subtasksRaw
 * @returns {{ done: number, total: number, percent: number }}
 */
function getProgressData(subtasksRaw) {
    const st = ensureArray(subtasksRaw);
    const done = st.filter((s) => s?.completed || s?.done).length;
    const percent = st.length > 0 ? (done / st.length) * 100 : 0;
    return { done, total: st.length, percent };
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into European format (DD.MM.YYYY).
 * @param {string} [dueDate='']
 * @returns {string}
 */
function formatDate(dueDate = '') {
    if (!dueDate) return '--.--.----';
    return dueDate.includes('-') ? dueDate.split('-').reverse().join('.') : dueDate;
}

/**
 * Generates a CSS-compatible class name from a category text string.
 * @param {string} [category='']
 * @returns {string}
 */
function buildCategoryClass(category = '') {
    return (category || 'User Story').toLowerCase().replace(/\s+/g, '-');
}

/**
 * Resolves display initials from a user badge object.
 * @param {Object} u
 * @returns {string}
 */
function resolveUserInitials(u) {
    const name = u.name || '';
    return u.initials || getInitials(name);
}

/**
 * Resolves the title of a subtask entry.
 * @param {string|Object} s
 * @param {number} i
 * @returns {string}
 */
function resolveSubtaskTitle(s, i) {
    return typeof s === 'object' ? s.title || `Subtask ${i + 1}` : s;
}

/**
 * Formats contact names for UI display and marks own account.
 * @param {string} contactId
 * @param {string} contactName
 * @returns {string}
 */
function formatContactDisplayName(contactId, contactName) {
    if (String(contactId || '').startsWith('self_')) return `${contactName} (You)`;
    return contactName;
}

/**
 * Sorts contact entries: own account first, then alphabetically.
 * @param {Object} allContacts
 * @returns {Array<[string, Object]>}
 */
function getSortedEditContactEntries(allContacts) {
    return Object.entries(allContacts || {}).sort(([leftId, leftContact], [rightId, rightContact]) => {
        const leftIsOwn = String(leftId || '').startsWith('self_');
        const rightIsOwn = String(rightId || '').startsWith('self_');
        if (leftIsOwn !== rightIsOwn) return leftIsOwn ? -1 : 1;
        const leftName = String(leftContact?.name || leftContact?.email || '').trim();
        const rightName = String(rightContact?.name || rightContact?.email || '').trim();
        return leftName.localeCompare(rightName, 'de', { sensitivity: 'base' });
    });
}

/* ==========================================================================
   3. CACHE READ / WRITE
   ========================================================================== */

/**
 * Normalizes a cached board task badge object.
 * @param {Object} badge - Cached badge object.
 * @returns {{id: string, name: string, color: string, initials: string}|null}
 */
function normalizeCachedBadge(badge) {
    if (!badge || typeof badge !== 'object') return null;
    const name = String(badge.name || '').trim();
    if (!name) return null;
    return {
        id: typeof badge.id === 'string' ? badge.id : '',
        name,
        color: typeof badge.color === 'string' && badge.color ? badge.color : getAvatarColorFromName(name),
        initials: typeof badge.initials === 'string' && badge.initials ? badge.initials : getInitials(name)
    };
}

/**
 * Normalizes a cached board task object.
 * @param {Object} task - Raw cached task object.
 * @returns {Object|null}
 */
function normalizeCachedBoardTask(task) {
    if (!task || typeof task !== 'object') return null;
    const status = BOARD_STATUSES.includes(task.status) ? task.status : 'todo';
    const assignedTo = Array.isArray(task.assignedTo)
        ? task.assignedTo.map(normalizeCachedBadge).filter(Boolean)
        : [];
    return {
        title: task.title || '',
        description: task.description || '',
        dueDate: task.dueDate || '',
        priority: task.priority || 'low',
        category: task.category || '',
        status,
        assignedTo,
        subtasks: normalizeSubtasks(task.subtasks),
        createdAt: task.createdAt || 0
    };
}

/**
 * Reads the cached normalized board task map from localStorage.
 * @returns {Object}
 */
function readBoardCache() {
    try {
        const raw = localStorage.getItem(BOARD_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const normalized = {};
        Object.entries(parsed).forEach(([taskId, task]) => {
            if (typeof taskId !== 'string') return;
            const normalizedTask = normalizeCachedBoardTask(task);
            if (normalizedTask) normalized[taskId] = normalizedTask;
        });
        return normalized;
    } catch { return {}; }
}

/**
 * Writes the normalized board task map to localStorage.
 * @param {Object} taskMap
 */
function writeBoardCache(taskMap) {
    try {
        localStorage.setItem(BOARD_CACHE_KEY, JSON.stringify(taskMap || {}));
    } catch { return; }
}

/**
 * Builds board columns HTML from a normalized cached task map.
 * @param {Object} cachedTasks
 * @returns {Object}
 */
function buildColumnsFromCachedTasks(cachedTasks) {
    const columns = { 'todo': '', 'in-progress': '', 'await-feedback': '', 'done': '' };
    Object.entries(cachedTasks).forEach(([taskId, task]) => {
        if (columns[task.status] !== undefined) columns[task.status] += getCardTemplate(task, taskId);
    });
    return columns;
}

/**
 * Converts a Firebase contact object into a badge object for UI rendering.
 * @param {string} contactId
 * @param {Object} contact
 * @returns {Object}
 */
function mapContactToBadge(contactId, contact) {
    const name = contact?.name || '';
    return {
        id: contactId,
        name,
        color: contact?.color || (name ? getAvatarColorFromName(name) : '#2A3647'),
        initials: name ? getInitials(name) : '?'
    };
}

/**
 * Normalizes a string-based assigned contact entry.
 * @param {string} entry
 * @param {Object} allContacts
 * @returns {Object|null}
 */
function normalizeAssignedContactString(entry, allContacts) {
    const contact = allContacts[entry];
    return contact ? mapContactToBadge(entry, contact) : null;
}

/**
 * Normalizes an object-based assigned contact entry.
 * @param {Object} entry
 * @param {Object} allContacts
 * @returns {Object|null}
 */
function normalizeAssignedContactObject(entry, allContacts) {
    const id = entry.id || '';
    const fullContact = id ? allContacts[id] : null;
    const name = entry.name || fullContact?.name || '';
    if (!name) return null;
    return {
        id,
        name,
        color: entry.color || fullContact?.color || getAvatarColorFromName(name),
        initials: entry.initials || getInitials(name)
    };
}

/**
 * Normalizes a single entry from a task's assignedTo list.
 * @param {string|Object|null} entry
 * @param {Object} allContacts
 * @returns {Object|null}
 */
function normalizeAssignedContact(entry, allContacts) {
    if (!entry) return null;
    if (typeof entry === 'string') return normalizeAssignedContactString(entry, allContacts);
    if (typeof entry === 'object') return normalizeAssignedContactObject(entry, allContacts);
    return null;
}

/**
 * Normalizes a single subtask entry.
 * @param {string|Object} st
 * @returns {Object}
 */
function normalizeSubtask(st) {
    if (typeof st === 'string') return { title: st, completed: false };
    return { title: st.title || '', completed: st.completed || false };
}

/**
 * Normalizes the full subtasks list of a task.
 * @param {Array|Object|null} subtasks
 * @returns {Array}
 */
function normalizeSubtasks(subtasks) {
    const raw = subtasks || [];
    const arr = Array.isArray(raw) ? raw : Object.values(raw);
    return arr.map(normalizeSubtask);
}

/**
 * Resolves all assigned contacts of a task as a badge array.
 * @param {Object} task
 * @param {Object} allContacts
 * @returns {Array}
 */
function buildAssignedContacts(task, allContacts) {
    const assignedRaw = Array.isArray(task.assignedTo) ? task.assignedTo : [];
    const assignedFromTask = assignedRaw
        .map(entry => normalizeAssignedContact(entry, allContacts))
        .filter(contact => contact !== null);
    return assignedFromTask;
}

/**
 * Returns the contacts map from Firebase. Uses in-memory cache.
 * @async
 * @returns {Promise<Object>}
 */
async function getContactsMap() {
    if (boardContactsCache) return boardContactsCache;
    try {
        const snapshot = await firebase.database().ref('contacts').get();
        boardContactsCache = snapshot.val() || {};
    } catch (error) {
        boardContactsCache = {};
    }
    const ownAccountContact = await fetchOwnAccountContactForBoard();
    if (ownAccountContact && !boardContactsCache[ownAccountContact.id]) {
        boardContactsCache[ownAccountContact.id] = ownAccountContact;
    }
    return boardContactsCache;
}

/**
 * Returns the signed-in account as a board-selectable contact.
 * @async
 * @returns {Promise<Object|null>}
 */
async function fetchOwnAccountContactForBoard() {
    if (!window?.userContext?.getActiveUserProfile) return null;
    const profile = await window.userContext.getActiveUserProfile();
    if (!profile?.id) return null;
    const contactName = String(profile.name || profile.email?.split('@')[0] || 'User').trim();
    if (!contactName) return null;
    return {
        id: `self_${profile.id}`,
        name: contactName,
        email: String(profile.email || ''),
        color: profile.color || getAvatarColorFromName(contactName)
    };
}
