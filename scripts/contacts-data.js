/**
 * Returns whether the database API is available.
 * @returns {boolean} True if the database API is available.
 * @category Contacts
 * @subcategory Firebase Logic
 */
function hasDb() {
  return typeof db !== "undefined" && db && typeof db.ref === "function";
}

const LOCAL_CONTACTS_KEY = "join_contacts_local";
const CONTACTS_CACHE_KEY = "join_contacts_cache_v1";
/**
 * Reads local contacts map from localStorage.
 * @returns {Record<string, {name?: string, email?: string, phone?: string, createdAt?: number}>} Local contacts map.
 * @category Contacts
 * @subcategory Data Handling
 */
function readLocalContactsMap() {
  try {
    const raw = localStorage.getItem(LOCAL_CONTACTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

/**
 * Writes local contacts map into localStorage.
 * @param {Record<string, {name?: string, email?: string, phone?: string, createdAt?: number}>} contactsMap - Contacts map to persist.
 * @category Contacts
 * @subcategory Data Handling
 */
function writeLocalContactsMap(contactsMap) {
  try {
    localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(contactsMap || {}));
  } catch (error) {
    return;
  }
}

/**
 * Normalizes one cached contact item.
 * @param {{id: string, name?: string, email?: string, phone?: string, createdAt?: number}} item - Cached contact item.
 * @returns {{id: string, name: string, email: string, phone: string, createdAt: number}} Normalized cached contact.
 * @category Contacts
 * @subcategory Data Handling
 */
function normalizeCachedContact(item) {
  return {
    id: item.id,
    name: item.name || "",
    email: item.email || "",
    phone: item.phone || "",
    createdAt: item.createdAt || 0,
  };
}

/**
 * Validates whether an unknown item can be treated as cached contact data.
 * @param {unknown} item - Candidate cache item.
 * @returns {boolean} True when item contains a string id.
 * @category Contacts
 * @subcategory Validation
 */
function isValidCachedContact(item) {
  return item && typeof item === "object" && typeof item.id === "string";
}

/**
 * Parses serialized contact cache into normalized list data.
 * @param {string} rawValue - Serialized cache string.
 * @returns {Array<{id: string, name: string, email: string, phone: string, createdAt: number}>} Parsed contacts.
 * @category Contacts
 * @subcategory Data Handling
 */
function parseContactsCache(rawValue) {
  const parsed = JSON.parse(rawValue);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidCachedContact).map(normalizeCachedContact);
}

/**
 * Reads cached contact list from localStorage.
 * @returns {Array<{id: string, name: string, email: string, phone: string, createdAt?: number}>} Cached contacts.
 * @category Contacts
 * @subcategory Data Handling
 */
function readContactsCache() {
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    if (!raw) return [];
    return parseContactsCache(raw);
  } catch (error) {
    return [];
  }
}

/**
 * Writes contact list cache to localStorage.
 * @param {Array<{id: string, name: string, email: string, phone: string, createdAt?: number}>} contacts - Contact list to cache.
 * @category Contacts
 * @subcategory Data Handling
 */
function writeContactsCache(contacts) {
  try {
    localStorage.setItem(
      CONTACTS_CACHE_KEY,
      JSON.stringify(Array.isArray(contacts) ? contacts : []),
    );
  } catch (error) {
    return;
  }
}

/**
 * Generates a local contact id.
 * @returns {string} Local contact id.
 * @category Contacts
 * @subcategory Data Handling
 */
function createLocalContactId() {
  return `local_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Saves a new contact to the database.
 * @param {{name: string, email: string, phone: string}} contact - Contact data.
 * @returns {Promise<void>} Resolves after saving completes.
 * @category Contacts
 * @subcategory Firebase Logic
 */
async function saveContact(contact) {
  if (hasDb()) {
    try {
      await db.ref("contacts").push(contact);
      return;
    } catch (error) {}
  }
  const contactsMap = readLocalContactsMap();
  contactsMap[createLocalContactId()] = contact;
  writeLocalContactsMap(contactsMap);
}

/**
 * Updates an existing contact in the database.
 * @param {string} contactId - Contact id.
 * @param {{name: string, email: string, phone: string}} contact - Contact data.
 * @returns {Promise<void>} Resolves after update completes.
 * @category Contacts
 * @subcategory Firebase Logic
 */
async function updateContact(contactId, contact) {
  if (!contactId) return;
  if (isSelfContactId(contactId)) {
    await updateOwnAccountContact(contactId, contact);
    return;
  }
  if (hasDb()) {
    try {
      await db.ref(`contacts/${contactId}`).update(contact);
      return;
    } catch (error) {}
  }
  const contactsMap = readLocalContactsMap();
  if (!contactsMap[contactId]) return;
  contactsMap[contactId] = { ...contactsMap[contactId], ...contact };
  writeLocalContactsMap(contactsMap);
}

/**
 * Deletes a contact from the database.
 * @param {string} contactId - Contact id.
 * @returns {Promise<void>} Resolves after delete completes.
 * @category Contacts
 * @subcategory Firebase Logic
 */
async function deleteContact(contactId) {
  if (!contactId) return;
  if (isSelfContactId(contactId)) return;
  const contactData = await fetchContact(contactId);
  if (hasDb()) {
    try {
      await cleanupDeletedContactAssignments(contactId, contactData);
      await db.ref(`contacts/${contactId}`).remove();
      return;
    } catch (error) {}
  }
  const contactsMap = readLocalContactsMap();
  delete contactsMap[contactId];
  writeLocalContactsMap(contactsMap);
}

/**
 * Fetches a contact by id.
 * @param {string} contactId - Contact id.
 * @returns {Promise<{name?: string, email?: string, phone?: string} | null>} Contact data.
 * @category Contacts
 * @subcategory Firebase Logic
 */
async function fetchContact(contactId) {
  if (!contactId) return null;
  if (isSelfContactId(contactId)) {
    return fetchOwnAccountContactById(contactId);
  }
  if (hasDb()) {
    try {
      const snapshot = await db.ref(`contacts/${contactId}`).get();
      return snapshot.val();
    } catch (error) {}
  }
  const contactsMap = readLocalContactsMap();
  return contactsMap[contactId] || null;
}

/**
 * Sorts contacts by name for stable list rendering.
 * @param {Array<{id: string, name: string, email: string, phone: string, createdAt?: number}>} contacts - Contact list.
 * @returns {Array<{id: string, name: string, email: string, phone: string, createdAt?: number}>} Sorted contacts.
 * @category Contacts
 * @subcategory UI & Init
 */
function sortContactsByName(contacts) {
  return [...contacts].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "de", {
      sensitivity: "base",
    }),
  );
}

/**
 * Normalizes one contact map entry to render-safe fields.
 * @param {string} id - Contact id.
 * @param {{name?: string, email?: string, phone?: string, createdAt?: number}} value - Raw contact value.
 * @returns {{id: string, name: string, email: string, phone: string, createdAt: number}} Normalized contact.
 * @category Contacts
 * @subcategory Data Handling
 */
function toNormalizedContact(id, value) {
  return {
    id,
    name: value?.name || "",
    email: value?.email || "",
    phone: value?.phone || "",
    createdAt: value?.createdAt || 0,
  };
}

/**
 * Initializes validation for the name input field.
 * Prevents entry of numbers and special characters, allowing only letters and hyphens.
 * @category Contacts
 * @subcategory UI & Validation
 */
function initNameValidation() {
  const nameInput =
    document.getElementById("name-input") ||
    document.querySelector('input[name="name"]');
  if (!nameInput) return;

  nameInput.addEventListener("input", (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;

    const newValue = input.value.replace(/[^a-zA-ZäöüÄÖÜß \-]/g, "");

    if (input.value !== newValue) {
      input.value = newValue;
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
  });
}
document.addEventListener("DOMContentLoaded", initNameValidation);

/**
 * Initializes validation for the phone input field.
 * Prevents entry of non-numeric characters (except the plus sign) on all devices.
 * * @category Contacts
 * @subcategory UI & Validation
 */
function initPhoneValidation() {
  const phoneInput =
    document.getElementById("phone-input") ||
    document.querySelector('input[name="phone"]');
  if (!phoneInput) return;
  /**
   * Listens for input events to filter out disallowed characters in real-time.
   */
  phoneInput.addEventListener("input", (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;

    const newValue = input.value.replace(/[^0-9+]/g, "");
    if (input.value !== newValue) {
      input.value = newValue;

      input.setSelectionRange(cursorPosition, cursorPosition);
    }
  });
}

document.addEventListener("DOMContentLoaded", initPhoneValidation);
/**
 * Converts a contact map object into list form.
 * @param {Record<string, {name?: string, email?: string, phone?: string, createdAt?: number}>} contactsMap - Contacts map.
 * @returns {Array<{id: string, name: string, email: string, phone: string, createdAt: number}>} Contact list.
 * @category Contacts
 * @subcategory Data Handling
 */
function mapContactsObjectToList(contactsMap) {
  return Object.entries(contactsMap || {}).map(([id, value]) =>
    toNormalizedContact(id, value),
  );
}

/**
 * Reads contacts from Firebase or falls back to local storage.
 * @returns {Promise<Record<string, {name?: string, email?: string, phone?: string, createdAt?: number}>>} Contacts map.
 * @category Contacts
 * @subcategory Firebase Logic
 */
async function readContactsSource() {
  if (!hasDb()) return readLocalContactsMap();
  try {
    if (typeof window.waitForFirebaseAuthReady === "function") {
      await window.waitForFirebaseAuthReady();
    }
    const snapshot = await db.ref("contacts").get();
    return snapshot.val() || {};
  } catch (error) {
    return readLocalContactsMap();
  }
}

/**
 * Fetches all contacts from Firebase.
 * @returns {Promise<Array<{id: string, name: string, email: string, phone: string, createdAt?: number}>>} Contact list.
 * @category Contacts
 * @subcategory Firebase Logic
 */
async function fetchContacts() {
  const contacts = await readContactsSource();
  const normalizedContacts = mapContactsObjectToList(contacts);
  const ownAccountContact = await fetchOwnAccountContact();
  const mergedContacts = mergeOwnAccountContact(
    normalizedContacts,
    ownAccountContact,
  );
  const sortedContacts = sortContactsByName(mergedContacts);
  writeContactsCache(sortedContacts);
  return sortedContacts;
}
