let API_KEY = "sk-hc-v1-30f1d55ebb0c44158bb67f50134fee65bb52a60169c248c4a004dfac70ac64d3";
const URL = "https://service.plsdontblockthisdomain.workers.dev/";
const MODEL = "openai/gpt-5.1"
let openrouterConnected = true;
let rubric;
fetch("leq_rubric.json")
  .then(response => response.json())
  .then(data => {
    rubric = data;
  });

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

/*
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
*/

document.getElementById("popup").style.display = "none";

function buildPrompt() {
	let lines = [];
	lines.push(`Total points possible: ${rubric.total_points}.`);
	lines.push(`
	General Scoring Notes
		• Except where otherwise noted, each point of these rubrics is earned independently; for example, a student could earn a point for evidence
		without earning a point for thesis/claim.
		• Accuracy: The components of these rubrics require that students demonstrate historically defensible content knowledge. Given the timed nature
		of the exam, essays may contain errors that do not detract from their overall quality, as long as the historical content used to advance the
		argument is accurate.
		• Clarity: Exam essays should be considered first drafts and thus may contain grammatical errors. Those errors will not be counted against a
		student unless they obscure the successful demonstration of the content knowledge, skills, and practices described below. 
`)
  
	rubric.categories.forEach(category => {
	  lines.push(`Category: ${category.reporting_category} (${category.points} points)`);
	  category.scoring_criteria.forEach(criteria => {
		lines.push(`- Scoring criteria (${criteria.points} pt): ${criteria.text}`);
	  });
	  if (category.decision_rules) {
		lines.push(`- Guidelines: ${category.decision_rules}`);
	  }
	  lines.push(""); // Blank line between categories
	});
  
  
	return lines.join("\n");
}

function queryGemini() {
	return new Promise((resolve, reject) => {
		const systemPrompt =
			`You are an expert AP exam grader grading an LEQ response to following prompt:
			 '"${document.getElementById('prompt').textContent}"'. 
			Grade the response based on the following rubric:
			${buildPrompt()}
			`;

		const userPrompt = document.getElementById("essay-input").textContent;

		const payload = {
			model: MODEL, 
			messages: [
				{
					role: "system",
					content: systemPrompt,
				},
				{
					role: "user",
					content: userPrompt,
				},
			],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "score",
					strict: true,
					schema: {
						type: "object",
						properties: {
							score: {
								type: "integer",
								description:
									"Total score the response recieved based on the rubric",
							},
						},
						required: ["score"],
						additionalProperties: false,
					},

				},
			},
			temperature: 0,
			logprobs: true,
		};

		const xhr = new XMLHttpRequest();
		xhr.open("POST", URL, true);
		xhr.setRequestHeader("Authorization", `Bearer ${API_KEY}`);
		xhr.setRequestHeader("Content-Type", "application/json");

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					const data = JSON.parse(xhr.responseText);
					const scoreResult = JSON.parse(data.choices[0].message.content);
					resolve(scoreResult);
				} catch (error) {
					reject("Parsing error:", error);
				}
			} else {
				reject("Request failed:", xhr.status, xhr.statusText);
			}
		};

		xhr.onerror = () => {
			reject("Network error occurred");
		};

		xhr.send(JSON.stringify(payload));
	});
}

function createScoringPanel(score, feedback) {
	const leftPanel = document.querySelector(".left-panel");

	// Clear existing content
	leftPanel.innerHTML = "";

	// Create scoring panel HTML
	leftPanel.innerHTML = `
      <div class="scoring-container">
          <h3>Essay Evaluation</h3>
          
          <div class="overall-score">
              <h4>Overall Score</h4>
              <div class="score-display">
                  <div class="score-bar">
                      <div class="score-fill" style="width: ${(score / 6) * 100}%"></div>
                  </div>
                  <span class="score-number">${score}/6</span>
              </div>
              <p class="score-assessment">${getScoreAssessment(score)}</p>
          </div>

          <div class="coming-soon-section">
              <div class="rubric-evaluation">
                  <h4>Rubric Breakdown</h4>
                  <ul class="rubric-points">
                      ${feedback.rubricPoints
												.map(
													(point) => `
                          <li class="${point.achieved ? "met" : "not-met"}">
                              <span class="point-icon">${point.achieved ? "✓" : "✗"}</span>
                              ${point.description}
                          </li>
                      `,
												)
												.join("")}
                  </ul>
              </div>

              <div class="detailed-feedback">
                  <h4>Detailed Comments</h4>
                  <p>${feedback.comments}</p>
              </div>

              <div class="improvement-suggestions">
                  <h4>Suggestions for Improvement</h4>
                  <ul>
                      ${feedback.suggestions
												.map(
													(suggestion) => `
                          <li>${suggestion}</li>
                      `,
												)
												.join("")}
                  </ul>
              </div>
              
              <div class="coming-soon-overlay">
                <div class="coming-soon-content">
                  <span>Coming Soon</span>
                </div>
              </div>
          </div>
      </div>
  `;

	// Add additional CSS
	const styleSheet = document.createElement("style");
	styleSheet.textContent = `
      .scoring-container {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 20px;
      }
      .scoring-container h3 {
          font-size: 18px;
          margin-bottom: 15px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 10px;
      }
      .scoring-container h4 {
          font-size: 14px;
          margin-top: 15px;
          margin-bottom: 10px;
      }
      .score-display {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
      }
      .score-bar {
          flex-grow: 1;
          height: 20px;
          background-color: #e0e0e0;
          border-radius: 10px;
          margin-right: 10px;
          overflow: hidden;
      }
      .score-fill {
          height: 100%;
          background-color: ${getScoreColor(score)};
          transition: width 0.5s ease-in-out;
      }
      .score-number {
          font-weight: bold;
      }
      .score-assessment {
          color: ${getScoreColor(score)};
          font-weight: bold;
      }
      .rubric-points {
          list-style-type: none;
          padding: 0;
      }
      .rubric-points li {
          margin-bottom: 10px;
          display: flex;
          align-items: center;
      }
      .point-icon {
          margin-right: 10px;
          font-weight: bold;
      }
      .met .point-icon {
          color: green;
      }
      .not-met .point-icon {
          color: red;
      }
      .improvement-suggestions ul {
          padding-left: 20px;
      }
      .coming-soon-section {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          padding: 15px;
      }
      .coming-soon-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          z-index: 10;
      }
      .coming-soon-content {
          text-align: center;
      }
      .coming-soon-content span {
          background-color: #4f46e5;
          color: white;
          padding: 8px 25px;
          border-radius: 25px;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 14px;
          letter-spacing: 1px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      }
  `;
	document.head.appendChild(styleSheet);
}

function getScoreAssessment(score) {
	if (score / 6 >= 0.9) return "Excellent Performance";
	if (score / 6 >= 0.8) return "Strong Performance";
	if (score / 6 >= 0.7) return "Good Performance";
	if (score / 6 >= 0.6) return "Needs Improvement";
	return "Requires Significant Revision";
}

function getScoreColor(score) {
	if (score >= 6) return "#2ecc71"; // Green
	if (score >= 5) return "#3498db"; // Blue
	if (score >= 4) return "#f39c12"; // Orange
	if (score >= 3) return "#e74c3c"; // Red
	return "#95a5a6"; // Gray
}

async function selectPrompt() {
	let period = document.getElementById("prompt-select").value;
	const promptList = await fetch("prompts.json")
        .then((response) => response.json());
    if (period === 'random') {
        pdList = Object.keys(promptList);
        period = pdList[Math.floor(Math.random() * pdList.length)];
    }
    selection = promptList[period];
    generation = selection[Math.floor(Math.random() * selection.length)].prompt
    return selection[Math.floor(Math.random() * selection.length)].prompt;
}

// Example usage
document.getElementById("submit").addEventListener("click", async () => {
	const mockFeedback = {
		rubricPoints: [
			{
				description: "Historically defensible thesis",
				achieved: true,
			},
			{
				description: "Broader historical context",
				achieved: false,
			},
			{
				description: "Specific and relevant evidence",
				achieved: true,
			},
			{
				description: "Historical reasoning",
				achieved: true,
			},
			{
				description: "Complex understanding",
				achieved: false,
			},
		],
		comments:
			"Your essay demonstrates a strong understanding of the constitutional period, but lacks depth in exploring the broader historical context of the era.",
		suggestions: [
			"Provide more detailed context about the political climate of 1776-1800",
			"Elaborate on how the Constitution changed governmental functions",
			"Include more specific examples from primary sources",
		],
	};
	const evaluation = await queryGemini();
	createScoringPanel(evaluation.score, mockFeedback);
});

document.getElementById("genPrompt").addEventListener("click", async () => {
    const randomPrompt = await selectPrompt();
    document.getElementById("prompt").innerText = randomPrompt;
});
