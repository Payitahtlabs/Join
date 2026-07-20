
/**
 * Initializes user context helpers and UI hydration.
 * @category User Context
 * @subcategory UI & Init
 */
function initUserContext() {
    if (typeof window === 'undefined') return;
    window.userContext = { resolveUserId, getActiveUserProfile };
    hydrateUserContext(); // direkt aufrufen, DOM ist bei onload bereits bereit
}


/**
 * Returns whether a guest session is currently active.
 * @returns {boolean} True when guest login is active in session or local storage.
 * @category User Context
 * @subcategory Session
 */
function isGuestSessionActive() {
	return sessionStorage.getItem('guestLogin') === '1' || localStorage.getItem('guestLogin') === '1';
}


/**
 * Checks whether Firebase auth is available.
 * @returns {boolean} True when Firebase auth can be accessed.
 * @category User Context
 * @subcategory Validation
 */
function hasFirebaseAuth() {
	return typeof firebase !== 'undefined' && typeof firebase.auth === 'function';
}


/**
 * Checks whether a Firebase database reference is available.
 * @returns {boolean} True when the database reference supports `.ref()`.
 * @category User Context
 * @subcategory Validation
 */
function hasDatabaseRef() {
	return typeof db !== 'undefined' && db && typeof db.ref === 'function';
}


/**
 * Stores the active user id in session storage.
 * @param {string | null | undefined} userId - User id to persist.
 * @returns {void}
 * @category User Context
 * @subcategory Session
 */
function setStoredUserId(userId) {
	if (!userId) return;
	sessionStorage.setItem('userId', userId);
}


/**
 * Reads the active user id from session storage.
 * @returns {string | null} Stored user id or null.
 * @category User Context
 * @subcategory Session
 */
function getStoredUserId() {
	return sessionStorage.getItem('userId');
}


/**
 * Returns the current Firebase auth user if available.
 * @returns {firebase.User | null} Current auth user or null.
 * @category User Context
 * @subcategory Firebase Logic
 */
function getCurrentAuthUser() {
	if (!hasFirebaseAuth()) return null;
	return firebase.auth().currentUser;
}


/**
 * Returns the current Firebase auth user id.
 * @returns {string | null} Current auth user id or null.
 * @category User Context
 * @subcategory Firebase Logic
 */
function getCurrentAuthUserId() {
	return getCurrentAuthUser()?.uid || null;
}


/**
 * Returns the current Firebase auth user email.
 * @returns {string} Auth email or an empty string.
 * @category User Context
 * @subcategory Firebase Logic
 */
function getAuthUserEmail() {
	return getCurrentAuthUser()?.email || '';
}


/**
 * Derives a display name from Firebase auth data.
 * @returns {string} Display name fallback from auth profile or email prefix.
 * @category User Context
 * @subcategory Data Handling
 */
function deriveNameFromAuth() {
	const user = getCurrentAuthUser();
	return user?.displayName || user?.email?.split('@')[0] || '';
}


/**
 * Resolves the active user id from guest/session/auth context.
 * @async
 * @returns {Promise<string | null>} Active user id or null for guests/unauthenticated users.
 * @category User Context
 * @subcategory Data Handling
 */
async function resolveUserId() {
	if (isGuestSessionActive()) return null;
	const storedId = getStoredUserId();
	if (storedId) return storedId;
	const authUserId = getCurrentAuthUserId();
	if (authUserId) return cacheAndReturnUserId(authUserId);
	if (!hasFirebaseAuth()) return null;
	return waitForAuthUserId();
}


/**
 * Stores and returns the provided user id.
 * @param {string} userId - User id to cache.
 * @returns {string} The same user id.
 * @category User Context
 * @subcategory Session
 */
function cacheAndReturnUserId(userId) {
	setStoredUserId(userId);
	return userId;
}


/**
 * Waits for Firebase auth state and resolves the user id.
 * @returns {Promise<string | null>} Resolved auth user id or null.
 * @category User Context
 * @subcategory Firebase Logic
 */
function waitForAuthUserId() {
	return new Promise((resolve) => {
		firebase.auth().onAuthStateChanged((user) => {
			setStoredUserId(user?.uid);
			resolve(user?.uid || null);
		});
	});
}


/**
 * Resolves and returns the currently active user profile.
 * @async
 * @returns {Promise<UserProfile | null>} Active user profile or null.
 * @category User Context
 * @subcategory Data Handling
 */
async function getActiveUserProfile() {
	const userId = await resolveUserId();
	if (!userId) return null;
	return fetchUserProfile(userId);
}


/**
 * Fetches a user profile from Firebase database.
 * Creates a fallback profile when no profile exists yet.
 * @async
 * @param {string} userId - User id to fetch.
 * @returns {Promise<UserProfile | null>} User profile or null when unavailable.
 * @category User Context
 * @subcategory Firebase Logic
 */
async function fetchUserProfile(userId) {
	if (!userId || !hasDatabaseRef()) return null;
	const snapshot = await db.ref(`users/${userId}`).get();
	const data = snapshot.val();
	if (data) return { id: userId, ...data };
	return createFallbackUserProfile(userId);
}


/**
 * Creates and persists a fallback user profile.
 * @async
 * @param {string} userId - User id to create fallback data for.
 * @returns {Promise<UserProfile>} Newly created fallback profile.
 * @category User Context
 * @subcategory Firebase Logic
 */
async function createFallbackUserProfile(userId) {
	const fallbackProfile = buildFallbackProfile();
	await db.ref(`users/${userId}`).update(fallbackProfile);
	return { id: userId, ...fallbackProfile };
}


/**
 * Builds fallback profile values from auth context.
 * @returns {{name: string, email: string, createdAt: number}} Fallback profile payload.
 * @category User Context
 * @subcategory Data Handling
 */
function buildFallbackProfile() {
	return {
		name: deriveNameFromAuth() || 'User',
		email: getAuthUserEmail(),
		createdAt: Date.now(),
	};
}


/**
 * Computes initials from user name or email.
 * @param {string} [name] - Optional display name.
 * @param {string} [email] - Optional email address fallback.
 * @returns {string} One- or two-letter initials.
 * @category User Context
 * @subcategory UI Rendering
 */
function computeInitials(name, email) {
	const source = (name || '').trim() || (email || '').trim();
	if (!source) return 'G';
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


/**
 * Updates the header profile button initials and label.
 * @param {UserProfile | null} profile - Active user profile.
 * @returns {void}
 * @category User Context
 * @subcategory UI Rendering
 */
function updateHeaderProfile(profile) {
	const button = document.querySelector('.profile-btn');
	if (!button) return;
	button.textContent = computeInitials(profile?.name, profile?.email);
	button.setAttribute('aria-label', profile?.name || 'Guest');
}


/**
 * Updates the greeting name in views that expose a user label.
 * @param {UserProfile | null} profile - Active user profile.
 * @returns {void}
 * @category User Context
 * @subcategory UI Rendering
 */
function updateGreetingName(profile) {
	const nameElement = document.getElementById('user-name');
	if (!nameElement) return;
	nameElement.textContent = profile?.name || 'Guest';
}


/**
 * Escapes HTML special characters in text content.
 * @param {string} [text=''] - Raw text.
 * @returns {string} Escaped text safe for HTML contexts.
 * @category User Context
 * @subcategory Utility
 */
function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}


/**
 * Validates and normalizes color values for inline CSS usage.
 * @param {string} [color=''] - Raw color value.
 * @param {string} [fallback='#2A3647'] - Fallback color.
 * @returns {string} Safe hex color.
 * @category User Context
 * @subcategory Utility
 */
function sanitizeColor(color = '', fallback = '#2A3647') {
	const normalizedColor = String(color || '').trim();
	return /^#[0-9a-fA-F]{3,8}$/.test(normalizedColor) ? normalizedColor : fallback;
}


/**
 * Hydrates user-dependent UI fragments after DOM is ready.
 * @async
 * @returns {Promise<void>}
 * @category User Context
 * @subcategory UI & Init
 */
async function hydrateUserContext() {
	const profile = await getActiveUserProfile();
	updateHeaderProfile(profile);
	updateGreetingName(profile);
}


