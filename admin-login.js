const ADMIN_EMAIL = "admin@gopangit.com";
const ADMIN_PASSWORD = "Admin@123";

const loginForm = document.getElementById("admin-login-form");
const emailInput = document.getElementById("admin-email");
const passwordInput = document.getElementById("admin-password");
const loginButton = document.getElementById("admin-login-btn");
const loginMessage = document.getElementById("login-message");

if (localStorage.getItem("isAdminLoggedIn") === "true") {
	window.location.href = "admin-jobs.html";
}

function showLoginMessage(type, message) {
	loginMessage.className = "admin-login-alert " + type;
	loginMessage.textContent = message;
}

loginForm.addEventListener("submit", function (event) {
	event.preventDefault();

	const email = emailInput.value.trim();
	const password = passwordInput.value;

	loginButton.disabled = true;
	loginButton.textContent = "Checking...";

	if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
		localStorage.setItem("isAdminLoggedIn", "true");
		showLoginMessage("success", "Login successful. Redirecting...");
		window.location.href = "admin-jobs.html";
		return;
	}

	showLoginMessage("error", "Wrong email or password.");
	loginButton.disabled = false;
	loginButton.textContent = "Login";
});
