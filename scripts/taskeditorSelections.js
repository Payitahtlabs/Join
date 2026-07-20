// CONTACTS

/**
 * Loads contacts from the database and initializes the contact dropdown.
 * Fetches contact records and renders them inside the dropdown while also
 * setting up the required interaction listeners.
 *
 * @returns {void}
 */
function loadContacts() {
    let { dropdown, searchInput } = getContactElements();
    if (!dropdown || !searchInput) return;

    fetchContacts().then(contactsMap => {
        renderContacts(contactsMap, dropdown);
    });

    setupContactDropdownListeners(dropdown, searchInput);
}

/**
 * Retrieves the DOM elements used by the assigned contacts dropdown.
 *
 * @returns {{dropdown: HTMLElement|null, searchInput: HTMLInputElement|null}} Object containing the dropdown and search input elements.
 */
function getContactElements() {
    return {
        dropdown: document.getElementById("assignedDropdown"),
        searchInput: document.getElementById("assignedSearch")
    };
}

/**
 * Fetches contacts from Firebase and merges the signed-in account as selectable contact.
 *
 * @returns {Promise<Record<string, Object>>} Promise resolving with a contacts map.
 */
async function fetchContacts() {
    const snapshot = await firebase.database().ref("contacts").once("value");
    const contactsMap = snapshot.val() || {};
    const ownAccountContact = await fetchOwnAccountContactForAssigned();
    if (!ownAccountContact) return contactsMap;
    return {
        ...contactsMap,
        [ownAccountContact.id]: ownAccountContact
    };
}

/**
 * Builds the signed-in account as a selectable contact entry.
 *
 * @returns {Promise<{id: string, name: string, email: string, color: string}|null>} Own-account contact or null.
 */
async function fetchOwnAccountContactForAssigned() {
    if (!window?.userContext?.getActiveUserProfile) return null;
    const profile = await window.userContext.getActiveUserProfile();
    if (!profile?.id) return null;

    const displayName = String(profile.name || profile.email?.split("@")[0] || "User").trim();
    if (!displayName) return null;

    return {
        id: `self_${profile.id}`,
        name: displayName,
        email: String(profile.email || ""),
        color: profile.color || getAvatarColorFromName(displayName)
    };
}

/**
 * Renders the contact list inside the dropdown container.
 * Iterates over all contact entries from the map and
 * generates a dropdown item for each contact.
 *
 * @param {Record<string, Object>} contactsMap - Contact records keyed by id.
 * @param {HTMLElement} dropdown - Dropdown container element where contacts will be rendered.
 * @returns {void}
 */
function renderContacts(contactsMap, dropdown) {
    dropdown.innerHTML = "";
    const sortedEntries = getSortedAssignedContactEntries(contactsMap);
    sortedEntries.forEach(([contactId, contact]) => {
        let label = createContactLabel(contactId, contact);
        if (!label) return;
        dropdown.appendChild(label);
    });
}

/**
 * Sorts assigned contact entries with own account first and remaining contacts alphabetically.
 *
 * @param {Record<string, Object>} contactsMap - Contact records keyed by id.
 * @returns {Array<[string, Object]>} Sorted contact entries.
 */
function getSortedAssignedContactEntries(contactsMap) {
    const entries = Object.entries(contactsMap || {});
    return entries.sort(([leftId, leftContact], [rightId, rightContact]) => {
        const leftIsOwn = String(leftId || "").startsWith("self_");
        const rightIsOwn = String(rightId || "").startsWith("self_");
        if (leftIsOwn !== rightIsOwn) return leftIsOwn ? -1 : 1;

        const leftName = String(leftContact?.name || leftContact?.email || "").trim();
        const rightName = String(rightContact?.name || rightContact?.email || "").trim();
        return leftName.localeCompare(rightName, "de", { sensitivity: "base" });
    });
}

/**
 * Creates a dropdown label element representing a single contact.
 *
 * @param {string} contactId - Contact id.
 * @param {Object} contact - Contact record.
 * @returns {HTMLLabelElement|null} Generated label element for the dropdown entry.
 */
function createContactLabel(contactId, contact) {
    let contactName = String(contact?.name || contact?.email || "").trim();
    if (!contactName) return null;
    let displayName = formatAssignedContactDisplayName(contactId, contactName);
    let initials = getInitials(contactName);
    let color = contact.color || getAvatarColorFromName(contactName);

    let label = document.createElement("label");
    label.className = "dropdown_item";
    label.dataset.contactname = contactName.toLowerCase();
    label.innerHTML = buildContactTemplate(contactId, contactName, displayName, color, initials);

    return label;
}

/**
 * Returns the display label for an assigned contact entry.
 *
 * @param {string} contactId - Contact id.
 * @param {string} contactName - Contact name.
 * @returns {string} Display name with own-account badge text when applicable.
 */
function formatAssignedContactDisplayName(contactId, contactName) {
    return String(contactId || "").startsWith("self_") ? `${contactName} (You)` : contactName;
}

/**
 * Generates initials from a full name string.
 *
 * @param {string} name - Full name of the contact.
 * @returns {string} Uppercase initials with a maximum length of two characters.
 */
function getInitials(name) {
    return name.split(" ")
        .map(n => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
}

/**
 * Builds the HTML template string for a contact dropdown entry.
 *
 * @param {string} id - Unique contact ID.
 * @param {string} name - Name of the contact.
 * @param {string} displayName - Display name used in the dropdown UI.
 * @param {string} color - Avatar background color.
 * @param {string} initials - Generated initials displayed in the avatar.
 * @returns {string} HTML template string representing the dropdown item.
 */
function buildContactTemplate(id, name, displayName, color, initials) {
    const safeColor = sanitizeColor(color);
    return `
        <div class="dropdown_avatar" style="background-color:${safeColor};">${escapeHtml(initials)}</div>
        <span>${escapeHtml(displayName)}</span>
        <input type="checkbox"
            data-contactid="${escapeHtml(id)}"
            data-contactname="${escapeHtml(name)}"
            data-color="${safeColor}">
    `;
}

/**
 * Sets up interaction listeners for the contact dropdown.
 * Handles focus behavior for opening the dropdown and updates
 * the selected state when a checkbox changes.
 *
 * @param {HTMLElement} dropdown - Dropdown container element.
 * @param {HTMLInputElement} searchInput - Search input element used for displaying selected contacts.
 * @returns {void}
 */
function setupContactDropdownListeners(dropdown, searchInput) {
    dropdown.addEventListener("change", e => {
        let item = e.target.closest(".dropdown_item");
        if (!item) return;
        item.classList.toggle("selected", e.target.checked);
        updateAssignedDisplay();
    });
}

/**
 * Updates the assigned contacts display inside the search input.
 * Collects all selected checkbox entries and displays their names
 * as a comma-separated list.
 *
 * @returns {void}
 */
function updateAssignedDisplay() {
    let searchInput = document.getElementById("assignedSearch");
    let checked = document.querySelectorAll(
        "#assignedDropdown input[type='checkbox']:checked"
    );

    if (checked.length === 0) {
        searchInput.value = "";
        searchInput.placeholder = "Select contacts to assign";
        return;
    }

    let names = Array.from(checked).map(cb => cb.dataset.contactname);
    searchInput.value = names.join(", ");
}

// ASSIGNED AVATARS

/**
 * Updates the assigned avatars display.
 * Creates and renders avatar elements for all currently selected contacts.
 *
 * @returns {void}
 */
function updateAssignedAvatars() {
    let container = document.getElementById("assignedAvatars");
    let checked = Array.from(getCheckedAssignedContacts());

    container.innerHTML = "";

    const MAX_VISIBLE = 5;

    checked.slice(0, MAX_VISIBLE).forEach(cb => {
        container.appendChild(createAvatar(cb));
    });

    let remaining = checked.length - MAX_VISIBLE;

    if (remaining > 0) {
        let more = document.createElement("div");
        more.className = "dropdown_avatar avatar_more";
        more.textContent = `+${remaining}`;
        more.style.backgroundColor = "#2A3647";

        container.appendChild(more);
    }
}

/**
 * Retrieves all selected assigned contact checkboxes from the dropdown.
 *
 * @returns {NodeListOf<HTMLInputElement>} List of checked checkbox elements.
 */
function getCheckedAssignedContacts() {
    return document.querySelectorAll(
        "#assignedDropdown input[type='checkbox']:checked"
    );
}

/**
 * Creates an avatar element representing an assigned contact.
 *
 * @param {HTMLInputElement} cb - Checkbox element containing user dataset information.
 * @returns {HTMLDivElement} Generated avatar element.
 */
function createAvatar(cb) {
    let name = cb.dataset.contactname;
    let initials = getInitials(name);
    let color = cb.dataset.color || getAvatarColorFromName(name);

    let avatar = document.createElement("div");
    avatar.className = "dropdown_avatar";
    avatar.textContent = initials;
    avatar.style.backgroundColor = color;

    return avatar;
}

/**
 * Filters the contacts inside the assigned dropdown based on the search input value.
 *
 * @param {HTMLInputElement} searchInput - Input element used to filter contacts.
 * @param {HTMLElement} dropdown - Dropdown container containing the contact entries.
 * @returns {void}
 */
function filterAssignedContacts(searchInput, dropdown) {
    let value = searchInput.value.trim().toLowerCase();

    dropdown.querySelectorAll(".dropdown_item").forEach(item => {
        let name = item.dataset.contactname;
        item.style.display = value === "" || name.includes(value) ? "flex" : "none";
    });
}

/**
 * Handles checkbox changes inside the assigned dropdown.
 * Updates both the assigned contact display and the avatar list.
 *
 * @returns {void}
 */
function handleAssignedSelectionChange() {
    updateAssignedDisplay();
    updateAssignedAvatars();
}

/**
 * Initializes the assigned-user search dropdown behavior.
 * Handles dropdown toggling, outside-click closing, contact filtering,
 * and updates when user selections change.
 *
 * @returns {void}
 */
function setupAssignedSearch() {
    let wrapper = document.getElementById("assignedSelect");
    let searchInput = document.getElementById("assignedSearch");
    let dropdown = document.getElementById("assignedDropdown");

    if (!searchInput || !dropdown) return;

    wrapper.addEventListener("click", (e) => { e.stopPropagation(); toggleAssignedDropdown(wrapper, dropdown); searchInput.focus(); });
    document.addEventListener("click", e => handleAssignedOutsideClick(e, wrapper, dropdown));
    searchInput.addEventListener("input", () => filterAssignedContacts(searchInput, dropdown));
    dropdown.addEventListener("change", handleAssignedSelectionChange);
}

/**
 * Opens the assigned-user dropdown.
 *
 * @param {HTMLElement} dropdown - Dropdown element that should be opened.
 * @returns {void}
 */
function openAssignedDropdown(dropdown) {
    dropdown.classList.add("open");
    dropdown.closest(".select_native")?.classList.add("open");
}

/**
 * Closes the assigned-user dropdown when a click occurs outside the wrapper.
 *
 * @param {MouseEvent} e - Click event triggered on the document.
 * @param {HTMLElement} wrapper - Wrapper element containing the dropdown.
 * @param {HTMLElement} dropdown - Dropdown element to close.
 * @returns {void}
 */
function handleAssignedOutsideClick(e, wrapper, dropdown) {
    if (!wrapper.contains(e.target)) {
        dropdown.classList.remove("open");
        wrapper.classList.remove("open");

        let searchInput = document.getElementById("assignedSearch");
        searchInput.value = "";
        searchInput.placeholder = "Select contacts to assign";
    }
}

/**
 * Toggles the visibility state of the assigned-user dropdown.
 *
 * @param {HTMLElement} wrapper - Wrapper element controlling the dropdown state.
 * @param {HTMLElement} dropdown - Dropdown element whose visibility is toggled.
 * @returns {void}
 */
function toggleAssignedDropdown(wrapper, dropdown) {
    dropdown.classList.toggle("open");
    wrapper.classList.toggle("open");
}

// Category

/**
 * Loads predefined task categories into the category select element.
 * If the select element is not present, the function exits silently.
 *
 * @returns {void}
 */
function loadCategories() {
    let select = document.getElementById("categorySelect");
    if (!select) return;

    let categories = [
        { id: "user-story", label: "User Story" },
        { id: "technical-task", label: "Technical Task" },
    ];

    categories.forEach(cat => {
        let option = document.createElement("option");
        option.value = cat.id;
        option.textContent = cat.label;
        select.appendChild(option);
    });
}

/**
 * Initializes the category dropdown behavior.
 * Sets up toggling, category selection, and closing the dropdown on outside clicks.
 *
 * @returns {void}
 */
function setupCategoryDropdown() {
    let wrapper = document.getElementById("categorySelectWrapper");
    let input = document.getElementById("categoryInput");
    let dropdown = document.getElementById("categoryDropdown");

    if (!wrapper || !input || !dropdown) return;

    wrapper.addEventListener("click", (e) => { e.stopPropagation(); toggleCategoryDropdown(wrapper, dropdown); });

    dropdown.querySelectorAll(".dropdown_item")
        .forEach(item => {

            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
            });

            item.addEventListener("click", (e) => {
                e.stopPropagation();
                selectCategory(item, input, dropdown);
            });

        });

    document.addEventListener("click", e =>
        handleCategoryOutsideClick(e, wrapper, dropdown)
    );
}

/**
 * Opens the category dropdown.
 *
 * @param {HTMLElement} dropdown - Dropdown element that should be opened.
 * @returns {void}
 */
function openCategoryDropdown(dropdown) {
    dropdown.classList.add("open");
    dropdown.closest(".select_native")?.classList.add("open");
}

/**
 * Selects a category from the dropdown and updates the input field.
 * After selection, the dropdown is closed.
 *
 * @param {HTMLElement} item - Dropdown item representing the selected category.
 * @param {HTMLInputElement} input - Input element displaying the selected category.
 * @param {HTMLElement} dropdown - Dropdown element that will be closed.
 * @returns {void}
 */
function selectCategory(item, input, dropdown) {
    input.value = item.textContent;
    input.dataset.value = item.dataset.value;

    let wrapper = document.getElementById("categorySelectWrapper");
    wrapper.classList.remove("error");

    dropdown.classList.remove("open");
    wrapper.classList.remove("open");
}

/**
 * Handles closing the category dropdown when a click occurs outside the wrapper.
 *
 * @param {MouseEvent} e - Click event triggered on the document.
 * @param {HTMLElement} wrapper - Wrapper element containing the dropdown.
 * @param {HTMLElement} dropdown - Dropdown element that should be closed.
 * @returns {void}
 */
function handleCategoryOutsideClick(e, wrapper, dropdown) {
    if (!wrapper.contains(e.target)) {
        let wasOpen = wrapper.classList.contains("open");

        dropdown.classList.remove("open");
        wrapper.classList.remove("open");

        let input = document.getElementById("categoryInput");

        if (wasOpen && !input.dataset.value) {
            wrapper.classList.add("error");
        }
    }
}

/**
 * Toggles the visibility state of the category dropdown.
 *
 * @param {HTMLElement} wrapper - Wrapper element controlling the dropdown state.
 * @param {HTMLElement} dropdown - Dropdown element whose visibility is toggled.
 * @returns {void}
 */
function toggleCategoryDropdown(wrapper, dropdown) {
    dropdown.classList.toggle("open");
    wrapper.classList.toggle("open");
}