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

    // Wait for auth state to be determined
    await new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            currentUser = user;
            unsubscribe();
            resolve();
        });
    });

    if (!currentUser) {
        console.log("User not authenticated");
        return;
    }

    if (code) {
        try {
            const key = await getOpenRouterKey();
            await db.collection("users")
                .doc(currentUser.uid)
                .set({openrouter_key: key});
            openrouterConnected = true;
            document.getElementById("popup").style.display = "none";
            API_KEY = key;
        } catch (error) {
            console.error("Error fetching OpenRouter key:", error);
        }
    } else {
        try {
            const userDoc = await db.collection("users").doc(currentUser.uid).get();
            const storedKey = userDoc.data()?.openrouter_key;
            console.log("Stored Key:", storedKey);
            if (storedKey && storedKey !== "undefined") {
                API_KEY = storedKey;
                openrouterConnected = true;
                document.getElementById("popup").style.display = "none";
            }
        } catch (error) {
            console.error("Error retrieving stored key:", error);
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

// Study tips array
const studyTips = [
    "Pro tip: Take a quick break every 20-30 minutes - your brain will thank you!",
    "Try explaining the concept to your pet or a rubber duck - it works better than you'd think!",
    "Mix up your study topics - it's like cross-training for your brain",
    "Teaching someone else is the best way to learn - even if it's just your little sibling",
    "Make up silly stories or acronyms to remember tricky stuff - the weirder, the better!",
    "Connect new stuff to things you already know - like comparing mitochondria to a power plant",
    "Review your notes right before bed - your brain does some cool stuff while you sleep",
    "Don't cram! Little bits of studying over time beats one big session",
    "Draw it out! Even if you're not an artist, drawing diagrams helps you remember",
    "Quiz yourself often - it's like a game show for your brain",
    "Use different colors in your notes - your brain loves a bit of color",
    "Find a study buddy - two brains are better than one!",
    "Take notes by hand - typing is fast, but writing helps you remember better",
    "Make up your own examples - the weirder, the more memorable!",
    "Explain it like you're talking to a 5-year-old - if you can do that, you really get it!",
    "Turn your notes into a song - even if it's terrible, you'll remember it!",
    "Use the Pomodoro technique - 25 minutes study, 5 minutes break",
    "Create a mind map - it's like a treasure map for your brain",
    "Teach your pet - they might not understand, but you'll learn better!",
    "Use flashcards in different orders - mix it up to keep your brain on its toes",
    "Take a walk while reviewing - movement helps memory",
    "Use mnemonic devices - like 'Please Excuse My Dear Aunt Sally' for math",
    "Record yourself explaining concepts - listen back while doing chores",
    "Create a study playlist - but keep it instrumental to avoid distraction",
    "Use the Feynman technique - explain it simply, identify gaps, review, simplify",
    "Make a study schedule - but be realistic about what you can do",
    "Use spaced repetition - review material at increasing intervals",
    "Create a study environment - same place, same time, same focus",
    "Use the Cornell note-taking method - it's like a built-in study guide",
    "Take practice tests - they're like dress rehearsals for the real thing",
    "Use the 80/20 rule - focus on the 20% that gives you 80% of the results",
    "Create a study ritual - like a pre-game warmup for your brain",
    "Use the SQ3R method - Survey, Question, Read, Recite, Review",
    "Make a study guide - even if you don't use it, making it helps you learn",
    "Use the Leitner system - it's like a game for your flashcards",
    "Create a study group - but keep it small and focused",
    "Use the memory palace technique - it's like a mental filing cabinet",
    "Make a study playlist - but keep it instrumental to avoid distraction",
    "Use the chunking method - break big topics into bite-sized pieces",
    "Create a study schedule - but be realistic about what you can do",
    "Fun Fact: Your brain can process images 60,000 times faster than text!",
    "Fun Fact: The average person's attention span is about 8 seconds - shorter than a goldfish!",
    "Fun Fact: Your brain uses about 20% of your body's energy, even though it's only 2% of your weight!",
    "Fun Fact: Learning new things actually creates new connections in your brain!",
    "Fun Fact: Your brain is more active when you're sleeping than when you're watching TV!",
    "Fun Fact: The human brain can store about 2.5 petabytes of information - that's like 3 million hours of TV!",
    "Fun Fact: Your brain processes information at about 120 meters per second!",
    "Fun Fact: The average person has about 70,000 thoughts per day!",
    "Fun Fact: Your brain is about 75% water - stay hydrated while studying!",
    "Fun Fact: The brain can't actually multitask - it just switches between tasks really fast!",
    "Fun Fact: Your brain is more creative when you're tired - but less focused!",
    "Fun Fact: The smell of peppermint can help improve memory and alertness!",
    "Fun Fact: Your brain is more active during exercise - perfect time to review!",
    "Fun Fact: The average person blinks about 15-20 times per minute, but only 3-4 times when focused!",
    "Fun Fact: Your brain can recognize a face in just 100 milliseconds!",
    "Fun Fact: The brain's storage capacity is virtually unlimited!",
    "Fun Fact: Your brain generates enough electricity to power a small light bulb!",
    "Fun Fact: The brain is the only organ that can't feel pain - it has no pain receptors!",
    "Fun Fact: Your brain is more active at night than during the day!",
    "Fun Fact: The average person's brain weighs about 3 pounds - about the same as a cantaloupe!",
    "Fun Fact: Your brain uses about 20 watts of power - enough to power a dim light bulb!",
    "Fun Fact: The brain can process information faster than the fastest computer!",
    "Fun Fact: Your brain is constantly changing and adapting - that's called neuroplasticity!"
];

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

// Add PDF.js library
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
script.onload = () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
};
document.head.appendChild(script);

// PDF processing function
async function processPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `${pageText}\n\n`;
        }

        return fullText;
    } catch (error) {
        console.error('Error processing PDF:', error);
        throw new Error('Failed to process PDF file');
    }
}

// Add event listener for PDF input
document.getElementById('pdfInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Show file name
    document.getElementById('pdfFileName').textContent = file.name;

    try {
        // Process PDF and update textarea
        const content = await processPDF(file);
        document.getElementById('content').value = content;
    } catch (error) {
        alert(`Error processing PDF: ${error.message}`);
    }
});

// Create loading overlay
const loadingOverlay = document.createElement('div');
loadingOverlay.className = 'loading-overlay';
loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
    animation: fadeIn 0.3s ease;
`;

const loadingSpinner = document.createElement('div');
loadingSpinner.className = 'loading-spinner';
loadingSpinner.style.cssText = `
    width: 48px;
    height: 48px;
    border: 4px solid var(--border);
    border-top: 4px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
`;

const loadingText = document.createElement('div');
loadingText.className = 'loading-text';
loadingText.style.cssText = `
    color: white;
    font-size: 18px;
    text-align: center;
    margin-top: 16px;
`;

const loadingSubtext = document.createElement('div');
loadingSubtext.className = 'loading-subtext';
loadingSubtext.style.cssText = `
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    text-align: center;
    margin-top: 8px;
`;

// Create study tips container
const studyTipContainer = document.createElement('div');
studyTipContainer.className = 'study-tip-container';
studyTipContainer.style.cssText = `
    margin-top: 32px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    max-width: 80%;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(8px);
`;

const studyTipTitle = document.createElement('div');
studyTipTitle.className = 'study-tip-title';
studyTipTitle.style.cssText = `
    color: var(--primary);
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
`;

// Add lightbulb icon to title
const lightbulbIcon = document.createElement('svg');
lightbulbIcon.setAttribute('width', '16');
lightbulbIcon.setAttribute('height', '16');
lightbulbIcon.setAttribute('viewBox', '0 0 24 24');
lightbulbIcon.setAttribute('fill', 'none');
lightbulbIcon.setAttribute('stroke', 'currentColor');
lightbulbIcon.setAttribute('stroke-width', '2');
lightbulbIcon.setAttribute('stroke-linecap', 'round');
lightbulbIcon.setAttribute('stroke-linejoin', 'round');
lightbulbIcon.innerHTML = '<path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M12 2v7"></path><path d="M18.42 12a6 6 0 1 1-6.47-9.3"></path>';

studyTipTitle.appendChild(lightbulbIcon);
studyTipTitle.appendChild(document.createTextNode('Study Tip'));

const studyTipText = document.createElement('div');
studyTipText.className = 'study-tip-text';
studyTipText.style.cssText = `
    color: white;
    font-size: 16px;
    line-height: 1.6;
    padding: 0 16px;
    position: relative;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

// Create a wrapper for the tip text
const tipTextWrapper = document.createElement('div');
tipTextWrapper.style.cssText = `
    position: relative;
    padding: 0 24px;
`;

studyTipText.appendChild(tipTextWrapper);

// Properly append all elements
studyTipContainer.appendChild(studyTipTitle);
studyTipContainer.appendChild(studyTipText);

// Append all elements to the loading overlay
loadingOverlay.appendChild(loadingSpinner);
loadingOverlay.appendChild(loadingText);
loadingOverlay.appendChild(loadingSubtext);
loadingOverlay.appendChild(studyTipContainer);

// Add styles for animations
const loadingStyles = document.createElement('style');
loadingStyles.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(10px); }
        20% { opacity: 1; transform: translateY(0); }
        80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
    }
    .study-tip-container {
        animation: fadeIn 0.5s ease-out;
    }
    .study-tip-text {
        animation: fadeInOut 5s ease-in-out infinite;
    }
    .lightbulb-icon {
        animation: pulse 2s infinite;
    }
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(loadingStyles);

// Update the study tip function to use the wrapper
function updateStudyTip() {
    const randomIndex = Math.floor(Math.random() * studyTips.length);
    tipTextWrapper.textContent = studyTips[randomIndex];
}

async function generateFlashcards() {
    const content = document.getElementById('content').value.trim();
    const cardCount = Number.parseInt(document.getElementById('card-count').value);
    
    if (!content) {
        alert('Please enter some study material or upload a PDF.');
        return;
    }

    if (!API_KEY) {
        alert('Please connect your OpenRouter account first.');
        return;
    }

    // Show loading overlay
    loadingText.textContent = 'Generating Flashcards';
    loadingSubtext.textContent = 'This may take about a minute...';
    document.body.appendChild(loadingOverlay);
    
    // Start updating study tips
    updateStudyTip();
    const tipInterval = setInterval(updateStudyTip, 5000);

    generateButton.disabled = true;
    generateButton.innerHTML = '<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';

    const prompt = `Generate exactly ${cardCount} unique flashcards in ${selectedFormat} format from the following content. The cards should be concise and educational.

IMPORTANT: Your response must be a valid JSON array of exactly ${cardCount} unique flashcard objects. Do not include any text before or after the JSON array. The response should start with [ and end with ].

Each flashcard object must have exactly two properties:
1. "front": A string containing the prompt or concept
2. "back": A string containing the explanation or details (keep this short and to the point)

Format Guidelines:
- For "Key Concepts": Use important terms or concepts as front, very brief explanations as back (1-2 sentences max)
- For "Definitions": Use terms as front, concise definitions as back (1 sentence max)
- For "Q&A": Use questions as front, short answers as back (1-2 sentences max)

Rules:
- Generate exactly ${cardCount} unique flashcards
- Each flashcard must be unique (no duplicates)
- Keep the back of each card SHORT and CONCISE
- Focus on the most important information
- Use clear, simple language
- Format the front and back appropriately for the selected format
- Maximum length for back: 2 short sentences

Example formats:
For Key Concepts:
[
  {
    "front": "Photosynthesis",
    "back": "Process where plants convert sunlight into energy"
  }
]

For Definitions:
[
  {
    "front": "Photosynthesis",
    "back": "Process by which plants convert sunlight into energy using CO2 and water"
  }
]

For Q&A:
[
  {
    "front": "What is photosynthesis?",
    "back": "Process where plants convert sunlight into energy"
  }
]

Content to generate flashcards from:
${content}`;

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
                model: 'qwen/qwq-32b:free',
                messages: [{
                    role: 'system',
                    content: 'You are a flashcard generator that outputs valid JSON arrays of flashcard objects.'
                }, {
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to generate flashcards');
        }

        const data = await response.json();
        
        // Check if we have a valid response with choices
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw new Error('Invalid response format from API');
        }

        // Get the content from the first choice
        const content = data.choices[0].message?.content;
        if (!content) {
            throw new Error('No content in API response');
        }

        // Remove JSON markers if they exist
        const cleanContent = content.replace(/^```json\n/, '').replace(/\n```$/, '');
        
        // Parse the JSON content
        let generatedCards;
        try {
            generatedCards = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('Failed to parse generated content:', cleanContent);
            throw new Error('Failed to parse generated flashcards');
        }

        // Validate the generated cards
        if (!Array.isArray(generatedCards) || generatedCards.length === 0) {
            throw new Error('Generated flashcards must be a non-empty array');
        }

        // Validate each card has required properties
        for (const card of generatedCards) {
            if (!card.front || !card.back) {
                throw new Error('Each flashcard must have both front and back properties');
            }
        }

        // Update the current cards
        currentCards = generatedCards;
        currentCardIndex = 0;
        currentSetId = null;
        currentSetName = `Generated Set - ${new Date().toLocaleString()}`;
        setNameInput.value = currentSetName;
        updateCardDisplay();
        
        if (currentUser) {
            await autoSaveFlashcards();
        }
    } catch (error) {
        console.error('Error generating flashcards:', error);
        alert(`Error generating flashcards: ${error.message}`);
    } finally {
        // Remove loading overlay and clear interval
        clearInterval(tipInterval);
        loadingOverlay.remove();
        loadingStyles.remove();
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