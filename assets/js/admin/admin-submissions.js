const API_BASE_URL = "";
const STATUSES = ["New", "Under Review", "Contacted", "Approved", "Rejected", "Closed"];

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
	window.location.replace("/admin-login");
}

const elements = {
	logout: document.getElementById("admin-logout"),
	message: document.getElementById("global-message"),
	refreshPartners: document.getElementById("refresh-partners"),
	refreshProposals: document.getElementById("refresh-proposals"),
	partnersLoading: document.getElementById("partners-loading"),
	proposalsLoading: document.getElementById("proposals-loading"),
	partnersTable: document.getElementById("partners-table"),
	proposalsTable: document.getElementById("proposals-table"),
};

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

function showMessage(type, message) {
	elements.message.className = "admin-alert " + type;
	elements.message.textContent = message;
}

function clearMessage() {
	elements.message.className = "admin-alert d-none";
	elements.message.textContent = "";
}

async function fetchJson(path, options) {
	options = options || {};
	options.headers = Object.assign(
		{ Authorization: "Bearer " + (localStorage.getItem("adminToken") || "") },
		options.headers || {},
	);
	const response = await fetch(API_BASE_URL + path, options);

	if (response.status === 401) {
		localStorage.removeItem("isAdminLoggedIn");
		localStorage.removeItem("adminToken");
		window.location.replace("/admin-login");
		throw new Error("Session expired. Please log in again.");
	}

	const contentType = response.headers.get("content-type") || "";
	const result = contentType.includes("application/json")
		? await response.json()
		: { success: false, message: await response.text() };

	if (!response.ok || result.success === false) {
		throw new Error(result.message || "Request failed. Please try again.");
	}

	return result;
}

function statusClass(status) {
	return String(status || "Pending").toLowerCase();
}

function statusSelect(type, id, value) {
	const options = STATUSES.map(function (status) {
		const selected = status === value ? "selected" : "";
		return `<option value="${status}" ${selected}>${status}</option>`;
	}).join("");

	return `<select class="admin-status-select" data-type="${type}" data-id="${escapeHtml(id)}">${options}</select>`;
}

function renderPartners(items) {
	if (!Array.isArray(items) || items.length === 0) {
		elements.partnersTable.innerHTML = '<tr><td colspan="8" class="admin-empty">No partner applications found.</td></tr>';
		return;
	}

	elements.partnersTable.innerHTML = items
		.map(function (item) {
			return `
				<tr>
					<td>${escapeHtml(item.company)}</td>
					<td>${escapeHtml(item.contact_person)}</td>
					<td>${escapeHtml(item.email)}</td>
					<td>${escapeHtml(item.phone || "")}</td>
					<td>${item.website ? `<a href="${escapeHtml(item.website)}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}</td>
					<td>${escapeHtml(item.message || "")}</td>
					<td>
						<span class="admin-status-pill ${statusClass(item.status)}">${escapeHtml(item.status || "Pending")}</span>
						${statusSelect("partner", item.id, item.status || "Pending")}
					</td>
					<td>${escapeHtml(item.created_at || "")}</td>
				</tr>
			`;
		})
		.join("");
}

function renderProposals(items) {
	if (!Array.isArray(items) || items.length === 0) {
		elements.proposalsTable.innerHTML = '<tr><td colspan="8" class="admin-empty">No project proposals found.</td></tr>';
		return;
	}

	elements.proposalsTable.innerHTML = items
		.map(function (item) {
			const contact = [item.contact_name, item.email, item.phone].filter(Boolean).join(" / ");
			return `
				<tr>
					<td>${escapeHtml(item.title)}</td>
					<td>${escapeHtml(item.description)}</td>
					<td>${escapeHtml(item.budget || "")}</td>
					<td>${escapeHtml(item.timeline || "")}</td>
					<td>${escapeHtml(contact)}</td>
					<td>${item.attachment_url ? `<button type="button" class="admin-action-btn" data-download-proposal="${escapeHtml(item.id)}" data-file-name="${escapeHtml(item.attachment_file_name || "proposal-attachment")}">Download</button>` : escapeHtml(item.attachment_names || "")}</td>
					<td>
						<span class="admin-status-pill ${statusClass(item.status)}">${escapeHtml(item.status || "Pending")}</span>
						${statusSelect("proposal", item.id, item.status || "Pending")}
					</td>
					<td>${escapeHtml(item.created_at || "")}</td>
				</tr>
			`;
		})
		.join("");
}

async function loadPartners() {
	elements.partnersLoading.classList.remove("d-none");
	try {
		const result = await fetchJson("/api/partner-applications", {
			headers: { Accept: "application/json" },
		});
		renderPartners(result.data || []);
	} catch (error) {
		elements.partnersTable.innerHTML = '<tr><td colspan="8" class="admin-empty">' + escapeHtml(error.message) + "</td></tr>";
	} finally {
		elements.partnersLoading.classList.add("d-none");
	}
}

async function loadProposals() {
	elements.proposalsLoading.classList.remove("d-none");
	try {
		const result = await fetchJson("/api/proposals", {
			headers: { Accept: "application/json" },
		});
		renderProposals(result.data || []);
	} catch (error) {
		elements.proposalsTable.innerHTML = '<tr><td colspan="8" class="admin-empty">' + escapeHtml(error.message) + "</td></tr>";
	} finally {
		elements.proposalsLoading.classList.add("d-none");
	}
}

async function updateStatus(type, id, status) {
	const path = type === "partner"
		? "/api/partner-applications/" + id + "/status"
		: "/api/proposals/" + id + "/status";

	clearMessage();

	try {
		const result = await fetchJson(path, {
			method: "PUT",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ status }),
		});
		showMessage("success", result.message || "Status updated successfully.");
		await Promise.all([loadPartners(), loadProposals()]);
	} catch (error) {
		showMessage("error", error.message || "Unable to update status.");
	}
}

document.addEventListener("change", function (event) {
	const select = event.target.closest(".admin-status-select");
	if (!select) {
		return;
	}

	void updateStatus(select.getAttribute("data-type"), select.getAttribute("data-id"), select.value);
});

document.addEventListener("click", async function (event) {
	const button = event.target.closest("[data-download-proposal]");
	if (!button) return;
	try {
		const response = await fetch(API_BASE_URL + "/api/proposals/" + button.dataset.downloadProposal + "/attachment", { headers: { Authorization: "Bearer " + (localStorage.getItem("adminToken") || "") } });
		if (!response.ok) throw new Error("Unable to download attachment.");
		const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = button.dataset.fileName; link.click(); URL.revokeObjectURL(url);
	} catch (error) { showMessage("error", error.message); }
});

elements.refreshPartners.addEventListener("click", loadPartners);
elements.refreshProposals.addEventListener("click", loadProposals);
elements.logout.addEventListener("click", function () {
	localStorage.clear();
	window.location.href = "/admin-login";
});

loadPartners();
loadProposals();
