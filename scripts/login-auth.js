/**
 * @typedef {Object} LoginFields
 * @property {HTMLFormElement} form - The login form element.
 * @property {HTMLInputElement} emailInput - The email input field.
 * @property {HTMLInputElement} passwordInput - The password input field.
 * @property {HTMLButtonElement} submitButton - The submit button.
 * @property {HTMLElement} emailMessage - The login email error message element.
 * @property {HTMLElement} passwordMessage - The login password error message element.
 * @property {HTMLElement} authMessage - The login auth error message element.
 */

/**
 * Initializes Firebase login handling for the login form.
 * @category Login
 * @subcategory UI & Init
 */
function initLoginForm() {
	const form = document.querySelector('.login-form');
	if (!form) return;

	const fields = getLoginFields(form);
	if (!fields) return;

	bindLoginFieldEvents(fields);
	form.addEventListener('submit', (event) => handleLoginSubmit(event, fields));
}


/**
 * Collects login form fields.
 * @param {HTMLFormElement} form - The login form element.
 * @returns {LoginFields | null} Collected form fields or null if missing.
 * @category Login
 * @subcategory UI & Init
 */
function getLoginFields(form) {
	const emailInput = form.querySelector('input[name="email"]');
	const passwordInput = form.querySelector('input[name="password"]');
	const submitButton = form.querySelector('button[type="submit"]');
	const emailMessage = form.querySelector('#msg-login-email');
	const passwordMessage = form.querySelector('#msg-login-password');
	const authMessage = document.getElementById('login-error-message');
	if (!emailInput || !passwordInput || !submitButton || !emailMessage || !passwordMessage || !authMessage) return null;

	return { form, emailInput, passwordInput, submitButton, emailMessage, passwordMessage, authMessage };
}


/**
 * Binds events to update login form button state.
 * @param {LoginFields} fields - Collected login form fields.
 * @category Login
 * @subcategory UI & Init
 */
function bindLoginFieldEvents(fields) {
	const updateState = () => updateLoginButtonState(fields);
	initLoginMessageVisibility(fields);
	bindLoginInputField(fields.emailInput, fields.emailMessage, fields, updateState);
	bindLoginInputField(fields.passwordInput, fields.passwordMessage, fields, updateState);
	bindLoginBlurField(fields.emailInput, validateLoginEmailField, fields, updateState);
	bindLoginBlurField(fields.passwordInput, validateLoginPasswordField, fields, updateState);
	updateLoginButtonState(fields);
}


/**
 * Hides all inline login validation messages on initial load.
 * @param {LoginFields} fields - Collected login form fields.
 * @category Login
 * @subcategory UI & Init
 */
function initLoginMessageVisibility(fields) {
	[fields.emailMessage, fields.passwordMessage].forEach((message) => {
		message.style.visibility = 'hidden';
	});
}


/**
 * Binds a login input to reset feedback and re-evaluate submit state.
 * @param {HTMLInputElement} input - Input to observe.
 * @param {HTMLElement} message - Field-level message element.
 * @param {LoginFields} fields - Collected login form fields.
 * @param {() => void} updateState - Callback to refresh submit state.
 * @category Login
 * @subcategory UI & Init
 */
function bindLoginInputField(input, message, fields, updateState) {
	input.addEventListener('input', () => {
		clearFieldError(input, message);
		setFormMessage(fields.authMessage, '');
		updateState();
	});
}


/**
 * Binds on-blur validation for a login input field.
 * @param {HTMLInputElement} input - Input to validate.
 * @param {(fields: LoginFields) => boolean} validateField - Field validator.
 * @param {LoginFields} fields - Collected login form fields.
 * @param {() => void} updateState - Callback to refresh submit state.
 * @category Login
 * @subcategory UI & Init
 */
function bindLoginBlurField(input, validateField, fields, updateState) {
	input.addEventListener('blur', () => {
		validateField(fields);
		updateState();
	});
}


/**
 * Clears current login error states and messages.
 * @param {LoginFields} fields - Collected login form fields.
 * @category Login
 * @subcategory UI & Init
 */
function clearLoginFeedback(fields) {
	clearFieldError(fields.emailInput, fields.emailMessage);
	clearFieldError(fields.passwordInput, fields.passwordMessage);
	setFormMessage(fields.authMessage, '');
}


/**
 * Enables/disables the login button based on form validity.
 * @param {LoginFields} fields - Collected login form fields.
 * @category Login
 * @subcategory UI & Init
 */
function updateLoginButtonState(fields) {
	const isValid = isLoginInputValid(fields);
	const isLoading = fields.submitButton.dataset.loading === '1';
	fields.submitButton.disabled = isLoading || !isValid;
}


/**
 * Validates login inputs.
 * @param {LoginFields} fields - Collected login form fields.
 * @returns {boolean} True if the login inputs are valid.
 * @category Login
 * @subcategory Validation
 */
function isLoginInputValid(fields) {
	return isEmailValid(fields.emailInput.value) && fields.passwordInput.value.trim().length >= 6;
}


/**
 * Handles Firebase login submission.
 * @param {SubmitEvent} event - The form submit event.
 * @param {LoginFields} fields - Collected login form fields.
 * @category Login
 * @subcategory Firebase Logic
 */
async function handleLoginSubmit(event, fields) {
	event.preventDefault();
	clearLoginFeedback(fields);
	if (!validateLoginBeforeSubmit(fields)) return;
	setLoadingState(fields, true);
	try {
		const credential = await signInWithCredentials(fields);
		handleSuccessfulLogin(credential);
	} catch (error) {
		handleFailedLogin(fields, error);
	} finally {
		setLoadingState(fields, false);
	}
}


/**
 * Performs pre-submit validation and sets UI feedback on failure.
 * @param {LoginFields} fields - Collected login form fields.
 * @returns {boolean} True when login can be submitted.
 * @category Login
 * @subcategory Validation
 */
function validateLoginBeforeSubmit(fields) {
	let isValid = true;
	if (!validateLoginEmailField(fields)) isValid = false;
	if (!validateLoginPasswordField(fields)) isValid = false;
	if (isValid) return true;
	setFormMessage(fields.authMessage, 'Please fix the highlighted fields.');
	return false;
}


/**
 * Validates login email field and shows a specific message on failure.
 * @param {LoginFields} fields - Collected login form fields.
 * @returns {boolean} True when the email field is valid.
 * @category Login
 * @subcategory Validation
 */
function validateLoginEmailField(fields) {
	const email = fields.emailInput.value.trim();
	if (!email) {
		setFieldError(fields.emailInput, fields.emailMessage, 'Please enter your email address.');
		return false;
	}
	if (!isEmailValid(email)) {
		setFieldError(fields.emailInput, fields.emailMessage, 'Please enter a valid email address.');
		return false;
	}
	clearFieldError(fields.emailInput, fields.emailMessage);
	return true;
}


/**
 * Validates login password field and shows a specific message on failure.
 * @param {LoginFields} fields - Collected login form fields.
 * @returns {boolean} True when the password field is valid.
 * @category Login
 * @subcategory Validation
 */
function validateLoginPasswordField(fields) {
	const password = fields.passwordInput.value.trim();
	if (!password) {
		setFieldError(fields.passwordInput, fields.passwordMessage, 'Please enter your password.');
		return false;
	}
	if (password.length < 6) {
		setFieldError(fields.passwordInput, fields.passwordMessage, 'Password must be at least 6 characters long.');
		return false;
	}
	clearFieldError(fields.passwordInput, fields.passwordMessage);
	return true;
}


/**
 * Sends email/password credentials to Firebase auth.
 * @param {LoginFields} fields - Collected login form fields.
 * @returns {Promise<{user: {uid: string}}>} Firebase credential result.
 * @category Login
 * @subcategory Firebase Logic
 */
async function signInWithCredentials(fields) {
	const email = fields.emailInput.value.trim();
	const password = fields.passwordInput.value;
	return firebase.auth().signInWithEmailAndPassword(email, password);
}


/**
 * Applies session flags and redirects after successful login.
 * @param {{user: {uid: string}}} credential - Firebase credential result.
 * @category Login
 * @subcategory Firebase Logic
 */
function handleSuccessfulLogin(credential) {
	sessionStorage.setItem('userId', credential.user.uid);
	sessionStorage.removeItem('guestLogin');
	localStorage.removeItem('guestLogin');
	sessionStorage.setItem('skipSplash', '1');
	window.location.href = './sites/summary.html';
}


/**
 * Shows authentication errors in the login form.
 * @param {LoginFields} fields - Collected login form fields.
 * @param {unknown} error - Firebase auth error.
 * @category Login
 * @subcategory Firebase Logic
 */
function handleFailedLogin(fields, error) {
	setFormMessage(fields.authMessage, getAuthErrorMessage(error));
	setLoginFieldErrorState(fields, true);
}


/**
 * Sets error state on login inputs.
 * @param {LoginFields} fields - Collected login form fields.
 * @param {boolean} hasError - Whether inputs should be marked as invalid.
 * @category Login
 * @subcategory UI & Init
 */
function setLoginFieldErrorState(fields, hasError) {
	fields.emailInput.classList.toggle('input-error', hasError);
	fields.passwordInput.classList.toggle('input-error', hasError);
}


/**
 * Sets the loading state for the login form.
 * @param {LoginFields} fields - Collected login form fields.
 * @param {boolean} isLoading - Whether the submit action is in progress.
 * @category Login
 * @subcategory UI & Init
 */
function setLoadingState(fields, isLoading) {
	fields.submitButton.dataset.loading = isLoading ? '1' : '0';
	updateLoginButtonState(fields);
}


/**
 * Updates the form message.
 * @param {HTMLElement} message - Message element to update.
 * @param {string} text - Message content to display.
 * @category Login
 * @subcategory UI & Init
 */
function setFormMessage(message, text) {
	if (!message) return;
	message.textContent = text;
	message.classList.toggle('is-hidden', !text);
}


/**
 * Maps Firebase auth errors to readable messages.
 * @param {unknown} error - Firebase auth error.
 * @returns {string} User-facing error message.
 * @category Login
 * @subcategory Firebase Logic
 */
function getAuthErrorMessage(error) {
	const fallback = 'Login failed. Please try again.';
	if (!error || typeof error !== 'object' || !('code' in error)) return fallback;
	return getLoginAuthErrorMessages()[error.code] || fallback;
}


/**
 * Returns the auth error code to message map for login.
 * @returns {Record<string, string>} Login auth error messages.
 * @category Login
 * @subcategory Firebase Logic
 */
function getLoginAuthErrorMessages() {
	return {
		'auth/invalid-credential': 'Check your email and password. Please try again.',
		'auth/invalid-login-credentials': 'Check your email and password. Please try again.',
		'auth/invalid-email': 'Please enter a valid email address.',
		'auth/user-not-found': 'Check your email and password. Please try again.',
		'auth/wrong-password': 'Check your email and password. Please try again.',
		'auth/user-disabled': 'This user is disabled.',
		'auth/too-many-requests': 'Too many attempts. Please try again later.',
	};
}


/**
 * Wires the guest login button to open the summary page.
 * @category Login
 * @subcategory UI & Init
 */
function initGuestLogin() {
	const guestButton = document.querySelector('.guest-login');
	if (!guestButton) return;

	guestButton.addEventListener('click', handleGuestLogin);
}


/**
 * Signs in anonymously and navigates to the summary page for guest access.
 * @category Login
 * @subcategory Firebase Logic
 */
async function handleGuestLogin() {
	const authMessage = document.getElementById('login-error-message');
	setFormMessage(authMessage, '');

	try {
		if (firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous) {
			await firebase.auth().signOut();
		}
		await firebase.auth().signInAnonymously();
		sessionStorage.setItem('guestLogin', '1');
		localStorage.setItem('guestLogin', '1');
		sessionStorage.removeItem('userId');
		window.location.href = './sites/summary.html';
	} catch (error) {
		setFormMessage(authMessage, getGuestLoginErrorMessage(error));
	}
}


/**
 * Maps guest login errors to readable messages.
 * @param {unknown} error - Firebase auth error.
 * @returns {string} User-facing message for guest login failures.
 * @category Login
 * @subcategory Firebase Logic
 */
function getGuestLoginErrorMessage(error) {
	const fallback = 'Guest login is currently unavailable. Please try again.';
	if (!error || typeof error !== 'object' || !('code' in error)) return fallback;
	if (error.code === 'auth/operation-not-allowed') {
		return 'Guest login is disabled in Firebase. Please enable Anonymous sign-in in Firebase Authentication.';
	}
	if (error.code === 'auth/network-request-failed') {
		return 'Network error. Please check your connection and try again.';
	}
	return fallback;
}

document.addEventListener('DOMContentLoaded', () => {
	initGuestLogin();
	initLoginForm();
	initPasswordToggles();
});