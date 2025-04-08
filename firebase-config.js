// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBRrR5Ba_DiMrkSnZybVReNdSHRQrRV_s",
  authDomain: "study-star-95d4e.firebaseapp.com",
  projectId: "study-star-95d4e",
  storageBucket: "study-star-95d4e.firebasestorage.app",
  messagingSenderId: "950562738960",
  appId: "1:950562738960:web:a5acb01847f26679d78b95",
  measurementId: "G-K0870PMRBE"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase services
const auth = firebase.auth();

// Configure Firestore with cache settings
const db = firebase.firestore();
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    experimentalForceLongPolling: true
});

// Configure Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Set persistence to LOCAL
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => {
        console.error('Error setting auth persistence:', error);
    });

// Function to clear cached data
async function clearFirestoreCache() {
    try {
        // Clear IndexedDB for Firestore
        const dbName = 'firestore/[DEFAULT]/study-star-95d4e/main';
        const request = indexedDB.deleteDatabase(dbName);
        
        request.onsuccess = () => {
            console.log('Firestore cache cleared successfully');
            // Reload the page to reinitialize Firestore
            window.location.reload();
        };
        
        request.onerror = (error) => {
            console.error('Error clearing Firestore cache:', error);
        };
    } catch (error) {
        console.error('Error clearing cache:', error);
    }
}

// Make clearFirestoreCache available globally
window.clearFirestoreCache = clearFirestoreCache; 