// State management
let currentUser = null;
let flashcardSets = [];

// DOM Elements
const emptyState = document.getElementById('emptyState');
const setsContainer = document.getElementById('setsContainer');
const authContainer = document.getElementById('authContainer');

// Auth state observer
auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI();
    if (user) {
        loadFlashcardSets();
    } else {
        showEmptyState();
    }
});

function updateAuthUI() {
    if (currentUser) {
        authContainer.innerHTML = `
            <a href="dashboard.html" class="user-info">
                <img src="${currentUser.photoURL}" alt="${currentUser.displayName}" class="user-avatar">
                <span class="user-name">${currentUser.displayName}</span>
            </a>
            <button class="auth-button signout" onclick="signOut()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
            </button>
        `;
    } else {
        authContainer.innerHTML = `
            <button class="auth-button" onclick="signInWithGoogle()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Sign In
            </button>
        `;
    }
}

async function signInWithGoogle() {
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (error) {
        console.error('Error signing in:', error);
        alert('Failed to sign in. Please try again.');
    }
}

async function signOut() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to sign out. Please try again.');
    }
}

async function loadFlashcardSets() {
    try {
        const querySnapshot = await db.collection('users').doc(currentUser.uid)
            .collection('flashcardSets').orderBy('lastModified', 'desc').get();

        flashcardSets = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Load progress for each set
        for (let set of flashcardSets) {
            const progressDoc = await db.collection('users').doc(currentUser.uid)
                .collection('progress').doc(set.id).get();
            
            if (progressDoc.exists) {
                const progress = progressDoc.data();
                set.progress = {
                    confidenceLevels: progress.confidenceLevels || {},
                    studiedCards: progress.studiedCards || [],
                    lastUpdated: progress.lastUpdated
                };
            } else {
                set.progress = {
                    confidenceLevels: {},
                    studiedCards: [],
                    lastUpdated: null
                };
            }
        }

        if (flashcardSets.length === 0) {
            showEmptyState();
        } else {
            showFlashcardSets();
        }
    } catch (error) {
        console.error('Error loading flashcard sets:', error);
        alert('Failed to load flashcard sets. Please try again.');
    }
}

function showEmptyState() {
    emptyState.style.display = 'flex';
    setsContainer.style.display = 'none';
}

function showFlashcardSets() {
    emptyState.style.display = 'none';
    setsContainer.style.display = 'grid';
    setsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    setsContainer.style.gap = '16px';
    setsContainer.style.padding = '16px';

    setsContainer.innerHTML = flashcardSets.map(set => {
        // Calculate mastered cards based on confidence levels
        const masteredCards = set.progress ? 
            Object.values(set.progress.confidenceLevels || {}).filter(level => level === 'know').length : 0;
        const totalCards = set.cards ? set.cards.length : 0;
        const progressPercentage = totalCards > 0 ? (masteredCards / totalCards) * 100 : 0;
        
        return `
            <div class="set-card" data-id="${set.id}">
                <div class="set-header">
                    <h3>${set.name}</h3>
                    <div class="set-actions">
                        <button class="btn-icon" onclick="editSet('${set.id}')" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon delete" onclick="deleteSet('${set.id}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercentage}%"></div>
                    </div>
                    <div class="progress-text">
                        <span>${masteredCards}/${totalCards} cards mastered</span>
                        <span>${Math.round(progressPercentage)}%</span>
                    </div>
                </div>
                <div class="set-info">
                    <span>${totalCards} cards</span>
                    <span>•</span>
                    <span>Last modified: ${new Date(set.lastModified.toDate()).toLocaleDateString()}</span>
                </div>
                <div class="set-actions">
                    <button class="btn btn-secondary" onclick="studySet('${set.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                        </svg>
                        Study
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function editSet(setId) {
    // Store the set ID in localStorage before redirecting
    localStorage.setItem('editingSetId', setId);
    window.location.href = 'flashcard.html';
}

async function deleteSet(setId) {
    if (!confirm('Are you sure you want to delete this flashcard set? This action cannot be undone.')) {
        return;
    }

    try {
        // Delete the set and its progress
        await Promise.all([
            db.collection('users').doc(currentUser.uid)
                .collection('flashcardSets').doc(setId).delete(),
            db.collection('users').doc(currentUser.uid)
                .collection('progress').doc(setId).delete()
        ]);
        
        const setCard = document.querySelector(`.set-card[data-id="${setId}"]`);
        if (setCard) {
            setCard.remove();
        }

        flashcardSets = flashcardSets.filter(set => set.id !== setId);

        if (flashcardSets.length === 0) {
            showEmptyState();
        }
    } catch (error) {
        console.error('Error deleting flashcard set:', error);
        alert('Failed to delete flashcard set. Please try again.');
    }
}

function studySet(setId) {
    localStorage.setItem('studySetId', setId);
    window.location.href = 'study.html';
} 