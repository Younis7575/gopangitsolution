const API_BASE_URL = "https://job-api.gopangit.workers.dev";

const statusForm = document.getElementById("status-form");
const statusEmail = document.getElementById("status-email");
const statusSubmit = document.getElementById("status-submit");
const statusMessage = document.getElementById("status-message");
const partnerStatusList = document.getElementById("partner-status-list");
const proposalStatusList = document.getElementById("proposal-status-list");

function escapeHtml(value) {
	return String(value || "").replace(/[&<>"']/g, function (char) {
		return {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#039;",
		}[char];
	});
}

function statusClass(status) {
	return String(status || "Pending").toLowerCase();
}

function showStatusMessage(type, message) {
	statusMessage.className = "alert alert-" + type;
	statusMessage.textContent = message;
}

function clearStatusMessage() {
	statusMessage.className = "alert d-none";
	statusMessage.textContent = "";
}

async function fetchJson(path) {
	const response = await fetch(API_BASE_URL + path, {
		headers: {
			Accept: "application/json",
		},
	});
	const result = await response.json();

	if (!response.ok || result.success === false) {
		throw new Error(result.message || "Unable to load submission status.");
	}

	return result;
}

function renderPartners(items) {
	if (!Array.isArray(items) || items.length === 0) {
		partnerStatusList.innerHTML = '<div class="submission-empty">No partner application found for this email.</div>';
		return;
	}

	partnerStatusList.innerHTML = items
		.map(function (item) {
			return `
				<article class="submission-card">
					<h3>${escapeHtml(item.company)}</h3>
					<div class="submission-meta">
						<span><strong>Contact:</strong> ${escapeHtml(item.contact_person)}</span>
						<span><strong>Submitted:</strong> ${escapeHtml(item.created_at || "")}</span>
					</div>
					<span class="submission-status ${statusClass(item.status)}">${escapeHtml(item.status || "Pending")}</span>
				</article>
			`;
		})
		.join("");
}

function renderProposals(items) {
	if (!Array.isArray(items) || items.length === 0) {
		proposalStatusList.innerHTML = '<div class="submission-empty">No project proposal found for this email.</div>';
		return;
	}

	proposalStatusList.innerHTML = items
		.map(function (item) {
			return `
				<article class="submission-card">
					<h3>${escapeHtml(item.title)}</h3>
					<div class="submission-meta">
						<span><strong>Budget:</strong> ${escapeHtml(item.budget || "Not specified")}</span>
						<span><strong>Timeline:</strong> ${escapeHtml(item.timeline || "Not specified")}</span>
						<span><strong>Submitted:</strong> ${escapeHtml(item.created_at || "")}</span>
					</div>
					<span class="submission-status ${statusClass(item.status)}">${escapeHtml(item.status || "Pending")}</span>
				</article>
			`;
		})
		.join("");
}

async function loadSubmissionStatus(event) {
	event.preventDefault();
	clearStatusMessage();

	const email = statusEmail.value.trim();
	if (!email) {
		showStatusMessage("danger", "Please enter your email address.");
		return;
	}

	statusSubmit.disabled = true;
	statusSubmit.textContent = "Checking...";
	partnerStatusList.innerHTML = '<div class="submission-empty">Loading partner applications...</div>';
	proposalStatusList.innerHTML = '<div class="submission-empty">Loading project proposals...</div>';

	try {
		const encodedEmail = encodeURIComponent(email);
		const results = await Promise.all([
			fetchJson("/api/partner-applications?email=" + encodedEmail),
			fetchJson("/api/project-proposals?email=" + encodedEmail),
		]);
		renderPartners(results[0].data || []);
		renderProposals(results[1].data || []);
		showStatusMessage("success", "Status loaded successfully.");
	} catch (error) {
		showStatusMessage("danger", error.message || "Unable to load submission status.");
	} finally {
		statusSubmit.disabled = false;
		statusSubmit.textContent = "Check Status";
	}
}

statusForm.addEventListener("submit", loadSubmissionStatus);
