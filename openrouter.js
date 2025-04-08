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