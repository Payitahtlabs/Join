const firebaseConfig = window.joinFirebaseConfig;

if (!firebaseConfig) {
  throw new Error("Firebase config missing. Load scripts/firebaseConfig.js before scripts/db.js.");
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();



