// State management
let flashcards = [];
let currentIndex = 0;
let studiedCards = new Set();
let confidenceLevels = {};
let currentUser = null;
let currentSetId = null;

// DOM Elements
const studyContent = document.getElementById('studyContent');
const emptyState = document.getElementById('emptyState');
const flashcardView = document.getElementById('flashcardView');
const loadButton = document.getElementById('loadButton');
const progressFill = document.querySelector('.progress-fill');
const cardCountElement = document.getElementById('cardCount');
const studyProgressElement = document.getElementById('studyProgress');
const summaryView = document.getElementById('summaryView');
const knowCount = document.getElementById('knowCount');
const almostCount = document.getElementById('almostCount');
const learningCount = document.getElementById('learningCount');
const summaryMessage = document.getElementById('summaryMessage');
const authContainer = document.getElementById('authContainer');
const signInButton = document.getElementById('signInButton');

// Style the load button
if (loadButton) {
    loadButton.className = 'btn btn-secondary';
    loadButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        Load Flashcards
    `;
}

// Event Listeners
loadButton.addEventListener('click', () => {
    if (currentUser) {
        showLoadDialog();
    } else {
        alert('Please sign in to load your flashcard sets');
    }
});
signInButton.addEventListener('click', signInWithGoogle);

// Auth state observer
auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI();
    if (user) {
        loadUserProgress();
        // Check for flashcards from flashcard page
        const storedFlashcards = localStorage.getItem('studyFlashcards');
        if (storedFlashcards) {
            const data = JSON.parse(storedFlashcards);
            flashcards = data.cards;
            currentSetId = data.setId;
            localStorage.removeItem('studyFlashcards'); // Clear the stored data
            showFlashcardView();
            updateCardDisplay();
        } else {
            // Load the flashcard set if an ID is stored
            const storedSetId = localStorage.getItem('studySetId');
            if (storedSetId) {
                loadFlashcardSet(storedSetId);
                localStorage.removeItem('studySetId'); // Clear the stored ID
            }
        }
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

async function saveProgressToFirebase() {
    if (!currentUser) {
        alert('Please sign in to save your progress');
        return;
    }

    try {
        // Determine which confidence levels to save
        let confidenceLevelsToSave;
        if (window.originalFlashcards) {
            // We're in a filtered session, use the original confidence levels
            confidenceLevelsToSave = window.originalConfidenceLevels;
        } else {
            // Regular session, use current confidence levels
            confidenceLevelsToSave = confidenceLevels;
        }
        
        // Convert studiedCards Set to array for Firebase
        const studiedCardsArray = Array.from(studiedCards);
        
        // Save progress
        const progressRef = db.collection('users').doc(currentUser.uid)
            .collection('progress').doc(currentSetId || 'default');
        
        await progressRef.set({
            confidenceLevels: confidenceLevelsToSave,
            studiedCards: studiedCardsArray,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });

        // If this is a new set of flashcards, save them too
        if (!currentSetId) {
            const setRef = await db.collection('users').doc(currentUser.uid)
                .collection('flashcardSets').add({
                    name: prompt('Enter a name for this flashcard set:') || 'Untitled Set',
                    cards: window.originalFlashcards || flashcards,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            currentSetId = setRef.id;
        }

        console.log('Progress saved successfully:', {
            setId: currentSetId,
            confidenceLevels: confidenceLevelsToSave,
            studiedCards: studiedCardsArray
        });
    } catch (error) {
        console.error('Error saving progress:', error);
        alert('Failed to save progress. Please try again.');
    }
}

async function loadUserProgress() {
    if (!currentUser || !currentSetId) return;

    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('progress').doc(currentSetId).get();
        
        if (doc.exists) {
            const data = doc.data();
            confidenceLevels = data.confidenceLevels;
            studiedCards = new Set(data.studiedCards);
            updateCardDisplay();
        }
    } catch (error) {
        console.error('Error loading progress:', error);
        alert('Failed to load progress. Please try again.');
    }
}

async function showLoadDialog() {
    if (!currentUser) {
        alert('Please sign in to load your flashcard sets');
        return;
    }

    try {
        const querySnapshot = await db.collection('users').doc(currentUser.uid)
            .collection('flashcardSets').orderBy('createdAt', 'desc').get();

        const sets = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (sets.length === 0) {
            alert('No saved flashcard sets found. Please create some flashcards first.');
            window.location.href = 'flashcard.html';
            return;
        }

        // Create and show dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            max-width: 400px;
            width: 90%;
        `;

        // Add overlay with blur effect
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            z-index: 999;
            animation: fadeIn 0.2s ease;
        `;

        // Add animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { 
                    opacity: 0;
                    transform: translate(-50%, -48%);
                }
                to { 
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }
        `;
        document.head.appendChild(style);

        // Function to close dialog and cleanup
        const closeDialog = () => {
            dialog.remove();
            overlay.remove();
            style.remove();
        };

        dialog.innerHTML = `
            <h3 style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: var(--text-primary);">Select Flashcard Set</h3>
            <div style="max-height: 300px; overflow-y: auto; margin: 0 -24px; padding: 0 24px;">
                ${sets.map(set => `
                    <div onclick="loadFlashcardSet('${set.id}'); closeDialog();" style="
                        padding: 16px;
                        background: var(--bg-secondary);
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        margin-bottom: 8px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        hover: {
                            transform: translateY(-1px);
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                        }
                    ">
                        <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">
                            ${set.name}
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary);">
                            ${set.cards.length} cards • ${new Date(set.createdAt.toDate()).toLocaleDateString()}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 20px; display: flex; justify-content: space-between; gap: 8px;">
                <a href="flashcard.html" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Create New Set
                </a>
                <button class="btn" onclick="closeDialog()">
                    Cancel
                </button>
            </div>
        `;

        dialog.style.animation = 'slideIn 0.2s ease';

        // Close dialog when clicking overlay
        overlay.onclick = closeDialog;

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        // Make closeDialog available globally for the onclick handlers
        window.closeDialog = closeDialog;
    } catch (error) {
        console.error('Error loading flashcard sets:', error);
        alert('Failed to load flashcard sets. Please try again.');
    }
}

async function loadFlashcardSet(setId) {
    if (!currentUser) {
        alert('Please sign in to load flashcard sets');
        return;
    }

    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('flashcardSets').doc(setId).get();
        
        if (doc.exists) {
            const data = doc.data();
            flashcards = data.cards;
            currentSetId = setId;
            currentIndex = 0;
            studiedCards.clear();
            confidenceLevels = {};
            
            // Load progress for this set
            const progressDoc = await db.collection('users').doc(currentUser.uid)
                .collection('progress').doc(setId).get();
            
            if (progressDoc.exists) {
                const progress = progressDoc.data();
                confidenceLevels = progress.confidenceLevels || {};
                studiedCards = new Set(progress.studiedCards || []);
            }

            // Store original flashcards and confidence levels
            window.originalFlashcards = [...flashcards];
            window.originalConfidenceLevels = {...confidenceLevels};

            // Check if mastery is 100%
            const totalCards = window.originalFlashcards.length;
            const masteredCards = Object.values(window.originalConfidenceLevels).filter(level => level === 'know').length;
            const masteryPercentage = (masteredCards / totalCards) * 100;

            // Only filter cards if mastery is not 100%
            if (masteryPercentage < 100) {
                // Filter out mastered cards
                const unmasteredCards = filterUnmasteredCards();
                flashcards = unmasteredCards;

                // Create new confidence levels object for filtered cards
                const newConfidenceLevels = {};
                const unmasteredIndices = [];
                window.originalFlashcards.forEach((card, index) => {
                    if (window.originalConfidenceLevels[index] !== 'know') {
                        unmasteredIndices.push(index);
                    }
                });

                unmasteredCards.forEach((card, newIndex) => {
                    const oldIndex = unmasteredIndices[newIndex];
                    if (window.originalConfidenceLevels[oldIndex]) {
                        newConfidenceLevels[newIndex] = window.originalConfidenceLevels[oldIndex];
                    }
                });

                confidenceLevels = newConfidenceLevels;
                studiedCards = new Set();
            }

            showFlashcardView();
            updateCardDisplay();
        } else {
            alert('Flashcard set not found');
            showEmptyState();
        }
    } catch (error) {
        console.error('Error loading flashcard set:', error);
        alert('Failed to load flashcard set. Please try again.');
        showEmptyState();
    }
}

function createFlashcardElement() {
    const flashcardHTML = `
        <div class="flashcard">
            <div class="flashcard-inner">
                <div class="flashcard-front">
                    <div class="confidence-indicator"></div>
                </div>
                <div class="flashcard-back"></div>
            </div>
        </div>
        <div class="controls">
            <button class="btn btn-secondary" id="prevButton">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Previous
            </button>
            <button class="btn" id="nextButton">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Next
            </button>
        </div>
        <div class="confidence-controls">
            <button class="confidence-btn learning" data-confidence="learning">
                Still Learning
            </button>
            <button class="confidence-btn almost" data-confidence="almost">
                Almost Got It
            </button>
            <button class="confidence-btn know" data-confidence="know">
                Know It!
            </button>
        </div>
    `;

    flashcardView.innerHTML = flashcardHTML;

    // Add event listeners for the new elements
    const flashcard = flashcardView.querySelector('.flashcard');
    const prevButton = flashcardView.querySelector('#prevButton');
    const nextButton = flashcardView.querySelector('#nextButton');
    const confidenceButtons = flashcardView.querySelectorAll('.confidence-btn');

    flashcard.addEventListener('click', () => {
        flashcard.classList.toggle('flipped');
    });


    confidenceButtons.forEach(button => {
        button.addEventListener('click', () => {
            const confidence = button.dataset.confidence;
            setConfidence(confidence);
            studiedCards.add(currentIndex); // Add card to studied cards when rated
            saveProgressToFirebase();
            
            // Automatically move to next card after rating
            if (currentIndex < flashcards.length - 1) {
                setTimeout(showNextCard, 300);
            } else {
                // On the last card, update progress
                updateProgress();
            }
        });
    });

    prevButton.addEventListener('click', showPreviousCard);
    nextButton.addEventListener('click', showNextCard);

    return { flashcard, prevButton, nextButton };
}

function updateCardDisplay() {
    if (flashcards.length === 0) {
        showEmptyState();
        return;
    }

    const { flashcard, prevButton, nextButton } = flashcardView.querySelector('.flashcard') ? 
        { 
            flashcard: flashcardView.querySelector('.flashcard'),
            prevButton: flashcardView.querySelector('#prevButton'),
            nextButton: flashcardView.querySelector('#nextButton')
        } : createFlashcardElement();

    const card = flashcards[currentIndex];
    
    // Update card content
    const frontContent = flashcard.querySelector('.flashcard-front');
    frontContent.textContent = card.front;
    // Reinsert the confidence indicator since textContent removes it
    const indicator = document.createElement('div');
    indicator.className = 'confidence-indicator' + (confidenceLevels[currentIndex] ? ` ${confidenceLevels[currentIndex]}` : '');
    frontContent.appendChild(indicator);
    
    flashcard.querySelector('.flashcard-back').textContent = card.back;
    
    // Reset flip state
    flashcard.classList.remove('flipped');
    
    // Update navigation state
    prevButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex === flashcards.length - 1;
    
    // Update progress indicators
    cardCountElement.textContent = `Card ${currentIndex + 1} of ${flashcards.length}`;
    updateProgress();

    // Show flashcard view
    showFlashcardView();
}

function showEmptyState() {
    if (emptyState && flashcardView && summaryView) {
        emptyState.style.display = 'flex';
        emptyState.style.flexDirection = 'column';
        emptyState.style.alignItems = 'center';
        emptyState.style.justifyContent = 'center';
        emptyState.style.gap = '16px';
        emptyState.style.padding = '32px';
        emptyState.style.textAlign = 'center';
        emptyState.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-secondary); margin-bottom: 8px;">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin: 0;">No Flashcards Loaded</h3>
            <p style="color: var(--text-secondary); margin: 0 0 16px;">Sign in to access your flashcard sets</p>
            <div style="display: flex; gap: 8px;">
                ${!currentUser ? `
                    <button onclick="signInWithGoogle()" class="btn btn-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                            <polyline points="10 17 15 12 10 7"/>
                            <line x1="15" y1="12" x2="3" y2="12"/>
                        </svg>
                        Sign In
                    </button>
                ` : `
                    <button onclick="showLoadDialog()" class="btn btn-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                        </svg>
                        Load Flashcards
                    </button>
                `}
                <a href="flashcard.html" class="btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Create New Set
                </a>
            </div>
        `;

        flashcardView.style.display = 'none';
        summaryView.style.display = 'none';
    }
}

function showFlashcardView() {
    if (emptyState && flashcardView && summaryView) {
        emptyState.style.display = 'none';
        flashcardView.style.display = 'block';
        summaryView.style.display = 'none';
    }
}

function filterUnmasteredCards() {
    return flashcards.filter((_, index) => confidenceLevels[index] !== 'know');
}

function showSummary() {
    saveProgressToFirebase();
    const stats = calculateConfidenceStats();
    const totalCards = flashcards.length;
    const unmasteredCards = filterUnmasteredCards();

    // Update summary statistics
    knowCount.textContent = stats.know;
    almostCount.textContent = stats.almost;
    learningCount.textContent = stats.learning;

    // Generate encouraging message based on performance
    let message = "Great job completing your study session! ";
    const knowPercentage = (stats.know / totalCards) * 100;
    
    if (knowPercentage >= 80) {
        message += "You're mastering this material! Keep up the excellent work! 🌟";
    } else if (knowPercentage >= 50) {
        message += "You're making good progress. Focus on the cards you're still learning! 💪";
    } else {
        message += "Keep practicing! You'll get better with each study session. 📚";
    }

    summaryMessage.textContent = message;

    // Update summary actions
    const summaryActions = document.querySelector('.summary-actions');
    summaryActions.innerHTML = `
        <button class="btn" onclick="restartSession()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
            </svg>
            Study Again
        </button>
        ${unmasteredCards.length > 0 ? `
            <button class="btn btn-secondary" onclick="continueStudying()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                Continue Studying (${unmasteredCards.length} cards)
            </button>
        ` : ''}
        <button class="btn btn-secondary" onclick="saveProgressToFirebase()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save Progress
        </button>
    `;

    // Show summary view
    emptyState.style.display = 'none';
    flashcardView.style.display = 'none';
    summaryView.style.display = 'block';
}

function continueStudying() {
    const unmasteredCards = filterUnmasteredCards();
    if (unmasteredCards.length === 0) {
        alert('All cards have been mastered!');
        return;
    }

    // Find indices of unmastered cards in the original deck
    const unmasteredIndices = [];
    flashcards.forEach((card, index) => {
        if (confidenceLevels[index] !== 'know') {
            unmasteredIndices.push(index);
        }
    });

    // Store original flashcards for later restoration
    window.originalFlashcards = [...flashcards];
    window.originalConfidenceLevels = {...confidenceLevels};

    // Update flashcards and reset state
    flashcards = unmasteredCards;
    currentIndex = 0;
    
    // Create new confidence levels object for filtered cards
    const newConfidenceLevels = {};
    unmasteredCards.forEach((card, newIndex) => {
        const oldIndex = unmasteredIndices[newIndex];
        if (window.originalConfidenceLevels[oldIndex]) {
            newConfidenceLevels[newIndex] = window.originalConfidenceLevels[oldIndex];
        }
    });
    
    // Reset study progress for this filtered set
    studiedCards = new Set();
    confidenceLevels = newConfidenceLevels;

    // Save the updated state to Firebase
    saveProgressToFirebase();

    // Show flashcard view and update display
    showFlashcardView();
    updateCardDisplay();
}

function restartSession() {
    // If we have original flashcards stored, restore them
    if (window.originalFlashcards) {
        flashcards = window.originalFlashcards;
        confidenceLevels = window.originalConfidenceLevels || {};
        delete window.originalFlashcards;
        delete window.originalConfidenceLevels;
    }
    
    // Reset current card index and study progress
    currentIndex = 0;
    studiedCards.clear();
    updateCardDisplay();
}

function allCardsRated() {
    // If we're in a filtered session, check the original deck
    if (window.originalFlashcards) {
        return Object.keys(window.originalConfidenceLevels).length === window.originalFlashcards.length;
    }
    // Otherwise check the current deck
    return Object.keys(confidenceLevels).length === flashcards.length;
}

function updateProgress() {
    const progress = (studiedCards.size / flashcards.length) * 100;
    progressFill.style.width = `${progress}%`;
    saveProgressToFirebase();
    
    // Calculate confidence statistics
    const stats = calculateConfidenceStats();
    studyProgressElement.textContent = `${Math.round(progress)}% Complete (${stats.know} Known, ${stats.almost} Almost, ${stats.learning} Learning)`;

    // Only show summary if we've studied all cards in the current deck
    // AND the current card has been rated
    if (progress === 100) {
        // If we're in a filtered session, make sure to record the last card's confidence
        if (window.originalFlashcards) {
            // Map the current index back to the original deck
            const originalIndex = window.originalFlashcards.findIndex((card, index) => {
                return !window.originalConfidenceLevels[index] || window.originalConfidenceLevels[index] !== 'know';
            });
            if (originalIndex !== -1) {
                window.originalConfidenceLevels[originalIndex] = confidenceLevels[currentIndex];
            }
        }
        
        if (progress === 100) {
            showSummary();
        }
    }
}

function calculateConfidenceStats() {
    const stats = { know: 0, almost: 0, learning: 0 };
    Object.values(confidenceLevels).forEach(level => {
        if (level) stats[level]++;
    });
    return stats;
}

function setConfidence(confidence) {
    if (!currentUser) {
        alert('Please sign in to track your progress');
        return;
    }

    // Update local confidence levels
    confidenceLevels[currentIndex] = confidence;
    
    // If we're in a filtered session, update the original confidence levels
    if (window.originalFlashcards) {
        // Find the corresponding index in the original deck
        const originalIndex = window.originalFlashcards.findIndex((card, index) => {
            return !window.originalConfidenceLevels[index] || window.originalConfidenceLevels[index] !== 'know';
        });
        if (originalIndex !== -1) {
            window.originalConfidenceLevels[originalIndex] = confidence;
        }
    }

    // Add to studied cards
    studiedCards.add(currentIndex);

    // Save to Firebase
    saveProgressToFirebase();

    // Update UI
    updateCardDisplay();
}

function showPreviousCard() {
    if (currentIndex > 0) {
        currentIndex--;
        updateCardDisplay();
    }
}

function showNextCard() {
    if (currentIndex < flashcards.length - 1) {
        currentIndex++;
        updateCardDisplay();
    }
}

function editCurrentSet() {
    if (currentSetId) {
        localStorage.setItem('editingSetId', currentSetId);
        window.location.href = 'flashcard.html';
    } else {
        alert('No flashcard set is currently loaded.');
    }
} 