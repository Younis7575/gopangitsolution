const API_BASE_URL =
	window.JOB_API_BASE_URL ||
	localStorage.getItem("JOB_API_BASE_URL") ||
	"";

const loginForm = document.getElementById("admin-login-form");
const emailInput = document.getElementById("admin-email");
const passwordInput = document.getElementById("admin-password");
const loginButton = document.getElementById("admin-login-btn");
const loginMessage = document.getElementById("login-message");

if (localStorage.getItem("isAdminLoggedIn") === "true" && localStorage.getItem("adminToken")) {
	window.location.href = "/admin-dashboard";
}

function showLoginMessage(type, message) {
	loginMessage.className = "admin-login-alert " + type;
	loginMessage.textContent = message;
}

loginForm.addEventListener("submit", async function (event) {
	event.preventDefault();

	const email = emailInput.value.trim();
	const password = passwordInput.value;

	loginButton.disabled = true;
	loginButton.textContent = "Checking...";

	try {
		const response = await fetch(API_BASE_URL + "/api/admin/login", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: email, password: password }),
		});
		const contentType = response.headers.get("content-type") || "";
		const result = contentType.includes("application/json")
			? await response.json()
			: { success: false, message: await response.text() };

		if (!response.ok || result.success === false || !result.data || !result.data.token) {
			throw new Error(result.message || "Wrong email or password.");
		}

		localStorage.setItem("isAdminLoggedIn", "true");
		localStorage.setItem("adminToken", result.data.token);
		localStorage.setItem("adminEmail", result.data.email || email);
		showLoginMessage("success", "Login successful. Redirecting...");
		window.location.href = "/admin-dashboard";
	} catch (error) {
		showLoginMessage("error", error.message || "Login failed. Please try again.");
		loginButton.disabled = false;
		loginButton.textContent = "Login";
	}
});
