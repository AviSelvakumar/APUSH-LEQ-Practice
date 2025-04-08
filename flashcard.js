let API_KEY = "";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
let openrouterConnected = false;
let currentUser = null;
let currentSetId = null;
let currentSetName = 'Untitled Set';

// Auth state observer
auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI();
    if (user) {
        // Check if we're editing an existing set
        const editingSetId = localStorage.getItem('editingSetId');
        if (editingSetId) {
            loadFlashcardSet(editingSetId);
            localStorage.removeItem('editingSetId'); // Clear the stored ID
        } else {
            loadUserFlashcards();
        }
    }
});

function updateAuthUI() {
    const authContainer = document.getElementById('authContainer');
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
        currentCards = [];
        currentCardIndex = 0;
        currentSetId = null;
        updateCardDisplay();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to sign out. Please try again.');
    }
}

document.getElementById("signin").addEventListener("click", () => {
    window.location.href = `https://openrouter.ai/auth?callback_url=${window.location.href}`;
});

async function getOpenRouterKey() {
	const urlParams = new URLSearchParams(window.location.search);
	const code = urlParams.get("code");
	if (
		localStorage.getItem("openrouter_key") &&
		localStorage.getItem("openrouter_key") !== "undefined"
	) {
		return localStorage.getItem("openrouter_key");
	}
	const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			code: code,
		}),
	});

	const { key } = await response.json();
	if (!key) {
		throw new Error("Failed to fetch OpenRouter key");
	}
	return key;
}

document.addEventListener("DOMContentLoaded", async () => {
	const urlParams = new URLSearchParams(window.location.search);
	const code = urlParams.get("code");

	if (code) {
		try {
			const key = await getOpenRouterKey();
			localStorage.setItem("openrouter_key", key);
			openrouterConnected = true;
			document.getElementById("popup").style.display = "none";
			API_KEY = key;
		} catch (error) {
			console.error("Error fetching OpenRouter key:", error);
		}
	} else {
		const storedKey = localStorage.getItem("openrouter_key");
		if (storedKey && storedKey !== "undefined") {
			API_KEY = storedKey;
			openrouterConnected = true;
			document.getElementById("popup").style.display = "none";
		}
	}
});

// State management
let currentCards = [];
let currentCardIndex = 0;

// DOM Elements
const contentInput = document.getElementById('content');
const cardCountSelect = document.getElementById('card-count');
const generateButton = document.getElementById('generate-flashcards');
const prevButton = document.querySelector('.card-controls .btn-secondary');
const nextButton = document.querySelector('.card-controls .btn:not(.btn-secondary)');
const cardIndicator = document.querySelector('.card-indicator');
const flashcardFront = document.querySelector('.flashcard-front');
const flashcardBack = document.querySelector('.flashcard-back');
const editFront = document.getElementById('edit-front');
const editContent = document.getElementById('edit-content');
const resetButton = document.querySelector('.edit-actions .btn-secondary');
const saveButton = document.querySelector('.edit-actions .btn:not(.btn-secondary)');
const optionPills = document.querySelectorAll('.option-pill');
const saveFlashcardsButton = document.createElement('button');
const loadFlashcardsButton = document.createElement('button');
const studyModeButton = document.querySelector('.btn.btn-secondary[onclick*="study.html"]');

// Create set name input
const setNameContainer = document.createElement('div');
setNameContainer.style.cssText = `
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const setNameInput = document.createElement('input');
setNameInput.type = 'text';
setNameInput.placeholder = 'Enter set name';
setNameInput.value = currentSetName;
setNameInput.style.cssText = `
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-secondary);
`;

setNameContainer.appendChild(setNameInput);

// Add the set name input before the content input
contentInput.parentNode.insertBefore(setNameContainer, contentInput);

// Add event listener for name changes
let nameChangeTimeout;
setNameInput.addEventListener('input', () => {
    clearTimeout(nameChangeTimeout);
    nameChangeTimeout = setTimeout(() => {
        currentSetName = setNameInput.value.trim() || 'Untitled Set';
        if (currentUser) {
            autoSaveFlashcards();
        }
    }, 500); // Wait 500ms after typing stops before saving
});

// Add Save Flashcards button
saveFlashcardsButton.textContent = 'Save Flashcards';
saveFlashcardsButton.className = 'btn btn-secondary';
saveFlashcardsButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
    </svg>
    Save Flashcards
`;

// Add Load Flashcards button
loadFlashcardsButton.textContent = 'Load Flashcards';
loadFlashcardsButton.className = 'btn btn-secondary';
loadFlashcardsButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 8l-5-5-5 5M12 3v12"/>
    </svg>
    Load Flashcards
`;

// Create a button container div
const buttonContainer = document.createElement('div');
buttonContainer.className = 'button-container';
buttonContainer.style.cssText = `
    display: flex;
    gap: 8px;
    margin-top: 16px;
`;

// Add buttons to the container
buttonContainer.appendChild(saveFlashcardsButton);
buttonContainer.appendChild(loadFlashcardsButton);

// Add the container after the action buttons
const actionButtons = document.querySelector('.action-buttons');
actionButtons.parentNode.insertBefore(buttonContainer, actionButtons.nextSibling);

// Format selection
let selectedFormat = 'Key Concepts';

// Event Listeners
optionPills.forEach(pill => {
    pill.addEventListener('click', () => {
        optionPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedFormat = pill.textContent.trim();
    });
});

generateButton.addEventListener('click', generateFlashcards);
prevButton.addEventListener('click', showPreviousCard);
nextButton.addEventListener('click', showNextCard);
resetButton.addEventListener('click', resetCardEdit);
saveButton.addEventListener('click', saveCardEdit);
saveFlashcardsButton.addEventListener('click', saveFlashcards);
loadFlashcardsButton.addEventListener('click', () => {
    if (currentUser) {
        showLoadDialog();
    } else {
        alert('Please sign in to load your flashcard sets');
    }
});

// Update the study mode button click handler
studyModeButton.onclick = null;
studyModeButton.addEventListener('click', () => {
    if (currentCards.length === 0) {
        alert('Please generate or load some flashcards first.');
        return;
    }
    
    // Store the current flashcards and set ID in localStorage
    localStorage.setItem('studyFlashcards', JSON.stringify({
        cards: currentCards,
        setId: currentSetId,
        timestamp: Date.now()
    }));
    
    // Navigate to study mode
    window.location.href = 'study.html';
});

async function autoSaveFlashcards() {
    if (!currentUser || !currentCards.length) return;

    try {
        if (currentSetId) {
            // Update existing set
            await db.collection('users').doc(currentUser.uid)
                .collection('flashcardSets').doc(currentSetId)
                .update({
                    name: currentSetName,
                    cards: currentCards,
                    lastModified: firebase.firestore.FieldValue.serverTimestamp()
                });
        } else {
            // Create new set
            const doc = await db.collection('users').doc(currentUser.uid)
                .collection('flashcardSets').add({
                    name: currentSetName,
                    cards: currentCards,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastModified: firebase.firestore.FieldValue.serverTimestamp()
                });
            currentSetId = doc.id;
        }
    } catch (error) {
        console.error('Error auto-saving flashcards:', error);
    }
}

async function generateFlashcards() {
    const content = contentInput.value.trim();
    const cardCount = parseInt(cardCountSelect.value);
    
    if (!content) {
        alert('Please enter some study material.');
        return;
    }

    if (!API_KEY) {
        alert('Please connect your OpenRouter account first.');
        return;
    }

    generateButton.disabled = true;
    generateButton.innerHTML = '<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';

    const prompt = `Generate ${cardCount} flashcards in ${selectedFormat} format from the following content. The cards should be concise and educational:\n\n${content}`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'AI Flashcard Generator'
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [{
                    role: 'system',
                    content: 'You are a flashcard generator that outputs valid JSON arrays of flashcard objects.'
                }, {
                    role: 'user',
                    content: prompt
                }],
			response_format: {
				type: "json_schema",
					schema: {
                        type: "array",
                        items: {
						type: "object",
						properties: {
							front: {
								type: "string",
                                    description: "The front side of the flashcard (question/prompt)"
							},
                            back: {
                                type: "string",
                                    description: "The back side of the flashcard (answer/explanation)"
                                }
                            },
                            required: ["front", "back"]
                        },
                        minItems: 1,
                        maxItems: 50
                    }
                },
                temperature: 0.7
            })
        });

        const data = await response.json();        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to generate flashcards');
        }

        let content = data.choices[0].message.content;
        // Remove JSON markers if they exist
        content = content.replace(/^```json\n/, '').replace(/\n```$/, '');
        const generatedCards = JSON.parse(content);
        currentCards = generatedCards;
        currentCardIndex = 0;
        currentSetId = null;
        currentSetName = 'Generated Set - ' + new Date().toLocaleString();
        setNameInput.value = currentSetName;
        updateCardDisplay();
        if (currentUser) {
            await autoSaveFlashcards();
        }
				} catch (error) {
        console.error('Error generating flashcards:', error);
        alert('Error generating flashcards. Please try again.');
    } finally {
        generateButton.disabled = false;
        generateButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg> Generate Flashcards';
    }
}

function updateCardDisplay() {
    if (currentCards.length === 0) return;

    const card = currentCards[currentCardIndex];
    flashcardFront.textContent = card.front;
    flashcardBack.textContent = card.back;
    editFront.value = card.front;
    editContent.value = card.back;
    cardIndicator.textContent = `Card ${currentCardIndex + 1} of ${currentCards.length}`;

    prevButton.disabled = currentCardIndex === 0;
    nextButton.disabled = currentCardIndex === currentCards.length - 1;
}

function showPreviousCard() {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        updateCardDisplay();
    }
}

function showNextCard() {
    if (currentCardIndex < currentCards.length - 1) {
        currentCardIndex++;
        updateCardDisplay();
    }
}

function resetCardEdit() {
    const card = currentCards[currentCardIndex];
    editFront.value = card.front;
    editContent.value = card.back;
}

function saveCardEdit() {
    const editedFront = editFront.value.trim();
    const editedBack = editContent.value.trim();
    if (editedFront && editedBack) {
        currentCards[currentCardIndex].front = editedFront;
        currentCards[currentCardIndex].back = editedBack;
        flashcardFront.textContent = editedFront;
        flashcardBack.textContent = editedBack;
        if (currentUser) {
            autoSaveFlashcards();
        }
        alert('Flashcard updated successfully!');
			} else {
        alert('Flashcard content cannot be empty.');
    }
}

async function saveFlashcards() {
    if (!currentCards.length) {
        alert('No flashcards to save.');
        return;
    }

    if (!currentUser) {
        alert('Please sign in to save your flashcards');
        return;
    }

    try {
        if (currentSetId) {
            // Update existing set
            await db.collection('users').doc(currentUser.uid)
                .collection('flashcardSets').doc(currentSetId)
                .update({
                    name: currentSetName,
                    cards: currentCards,
                    lastModified: firebase.firestore.FieldValue.serverTimestamp()
                });
            alert('Flashcards updated successfully!');
        } else {
            // Create new set
            const doc = await db.collection('users').doc(currentUser.uid)
                .collection('flashcardSets').add({
                    name: currentSetName,
                    cards: currentCards,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastModified: firebase.firestore.FieldValue.serverTimestamp()
                });
            currentSetId = doc.id;
            alert('Flashcards saved successfully!');
        }
    } catch (error) {
        console.error('Error saving flashcards:', error);
        alert('Failed to save flashcards. Please try again.');
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
            <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;">
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
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('flashcardSets').doc(setId).get();
        
        if (doc.exists) {
            const data = doc.data();
            currentCards = data.cards;
            currentCardIndex = 0;
            currentSetId = setId;
            currentSetName = data.name || 'Untitled Set';
            setNameInput.value = currentSetName;
            updateCardDisplay();
        }
    } catch (error) {
        console.error('Error loading flashcard set:', error);
        alert('Failed to load flashcard set. Please try again.');
    }
}