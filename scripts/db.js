const firebaseConfig = window.joinFirebaseConfig;

if (!firebaseConfig) {
  throw new Error("Firebase config missing. Load scripts/firebaseConfig.js before scripts/db.js.");
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();


/**
 * Waits until Firebase auth state has been restored or timeout is reached.
 * This avoids DB permission race conditions right after page navigation.
 * @param {number} [timeoutMs=2500] - Max wait time in milliseconds.
 * @returns {Promise<firebase.User|null>} Resolved auth user or null on timeout.
 */
window.waitForFirebaseAuthReady = function waitForFirebaseAuthReady(timeoutMs = 2500) {
  if (typeof firebase === "undefined" || typeof firebase.auth !== "function") {
    return Promise.resolve(null);
  }

  const currentUser = firebase.auth().currentUser;
  if (currentUser) {
    return Promise.resolve(currentUser);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let unsubscribe = () => {};

    const finish = (user) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
      resolve(user || null);
    };

    unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      finish(user);
    });

    timer = setTimeout(() => {
      finish(firebase.auth().currentUser);
    }, timeoutMs);
  });
};



