/**
 * Normalizes assignment entries from task assignment structures.
 * @param {unknown} entry - Raw assignment entry.
 * @returns {{id: string, name: string, email: string}} Normalized identity.
 * @category Contacts
 * @subcategory Data Handling
 */
function normalizeAssignmentIdentity(entry) {
	if (typeof entry === 'string') return { id: entry, name: '', email: '' };
	if (!entry || typeof entry !== 'object') return { id: '', name: '', email: '' };
	return {
		id: String(entry.id || entry.userId || entry.contactId || ''),
		name: String(entry.name || ''),
		email: String(entry.email || ''),
	};
}


/**
 * Checks whether an assignment entry references a deleted contact.
 * @param {unknown} entry - Assignment entry.
 * @param {string} contactId - Deleted contact id.
 * @param {{name?: string, email?: string, phone?: string} | null} contactData - Deleted contact data.
 * @returns {boolean} True when entry matches deleted contact id.
 * @category Contacts
 * @subcategory Validation
 */
function assignmentMatchesDeletedContact(entry, contactId, contactData) {
	void contactData;
	const normalized = normalizeAssignmentIdentity(entry);
	return normalized.id && normalized.id === contactId;
}


/**
 * Normalizes assigned entries from array/object task structures.
 * @param {unknown} assignedRaw - Raw task assignment data.
 * @returns {unknown[]} Normalized assignment list.
 * @category Contacts
 * @subcategory Data Handling
 */
function normalizeAssignedEntries(assignedRaw) {
	if (Array.isArray(assignedRaw)) return assignedRaw;
	if (assignedRaw && typeof assignedRaw === 'object') return Object.values(assignedRaw);
	return [];
}


/**
 * Builds Firebase update paths to remove a deleted contact from task assignments.
 * @param {Record<string, {assignedTo?: unknown}>} tasks - Tasks map.
 * @param {string} contactId - Deleted contact id.
 * @param {{name?: string, email?: string, phone?: string} | null} contactData - Deleted contact data.
 * @returns {Record<string, unknown>} Firebase update map.
 * @category Contacts
 * @subcategory Data Handling
 */
function buildTaskAssignmentCleanupUpdates(tasks, contactId, contactData) {
	const updates = {};
	Object.entries(tasks || {}).forEach(([taskId, task]) => {
		const assignedEntries = normalizeAssignedEntries(task?.assignedTo);
		if (!assignedEntries.length) return;
		const filteredEntries = assignedEntries.filter(
			(entry) => !assignmentMatchesDeletedContact(entry, contactId, contactData)
		);
		if (filteredEntries.length === assignedEntries.length) return;
		updates[`tasks/${taskId}/assignedTo`] = filteredEntries;
	});
	return updates;
}


/**
 * Removes deleted contact references from tasks.
 * @param {string} contactId - Deleted contact id.
 * @param {{name?: string, email?: string, phone?: string} | null} contactData - Deleted contact data.
 * @returns {Promise<void>} Resolves after cleanup updates are written.
 * @category Contacts
 * @subcategory Firebase Logic
 */
async function cleanupDeletedContactAssignments(contactId, contactData) {
	if (!hasDb() || !contactId) return;
	let tasks = {};
	try {
		const tasksSnapshot = await db.ref('tasks').get();
		tasks = tasksSnapshot.val() || {};
	} catch (error) {
		return;
	}

	const updates = buildTaskAssignmentCleanupUpdates(tasks, contactId, contactData);
	if (!Object.keys(updates).length) return;
	await db.ref().update(updates);
}
