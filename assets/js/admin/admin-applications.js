const API_BASE_URL =
	window.JOB_API_BASE_URL ||
	localStorage.getItem("JOB_API_BASE_URL") ||
	"";

const STATUSES = ["New", "Under Review", "Shortlisted", "Interview Scheduled", "Selected", "Rejected", "Hired"];
const PAGE_SIZE = 10;

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
	window.location.replace("/admin-login");
}

const state = {
	all: [],
	filtered: [],
	page: 1,
	selected: null,
};

const elements = {
	logout: document.getElementById("admin-logout"),
	message: document.getElementById("global-message"),
	refresh: document.getElementById("refresh-applications"),
	search: document.getElementById("app-search"),
	status: document.getElementById("app-status"),
	job: document.getElementById("app-job"),
	date: document.getElementById("app-date"),
	loading: document.getElementById("applications-loading"),
	table: document.getElementById("applications-table"),
	prevPage: document.getElementById("prev-page"),
	nextPage: document.getElementById("next-page"),
	pageSummary: document.getElementById("page-summary"),
	modal: document.getElementById("app-modal"),
	detail: document.getElementById("app-detail"),
	detailStatus: document.getElementById("detail-status"),
	saveStatus: document.getElementById("save-status"),
	viewCv: document.getElementById("view-cv"),
	downloadCv: document.getElementById("download-cv"),
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

function showMessage(type, text) {
	elements.message.className = "admin-alert " + type;
	elements.message.textContent = text;
}

function clearMessage() {
	elements.message.className = "admin-alert d-none";
	elements.message.textContent = "";
}

function adminHeaders(extra) {
	return Object.assign(
		{ Authorization: "Bearer " + (localStorage.getItem("adminToken") || "") },
		extra || {},
	);
}

async function fetchJson(path, options) {
	options = options || {};
	options.headers = adminHeaders(options.headers);
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

function normalizeStatus(status) {
	const value = String(status || "").trim();
	if (value === "Pending" || value === "" ) return "New";
	if (value === "Reviewed") return "Under Review";
	return STATUSES.indexOf(value) >= 0 ? value : "New";
}

function statusClass(status) {
	return normalizeStatus(status).toLowerCase();
}

function formatDate(value) {
	if (!value) return "";
	return String(value).replace("T", " ").slice(0, 16);
}

function withinDays(value, days) {
	if (!value) return false;
	const clean = String(value).replace(" ", "T");
	const then = Date.parse(clean.endsWith("Z") ? clean : clean + "Z");
	if (Number.isNaN(then)) return false;
	return Date.now() - then <= days * 86400000;
}

function money(value) {
	if (value === null || value === undefined || value === "") return "";
	const num = Number(value);
	return Number.isFinite(num) ? num.toLocaleString() : String(value);
}

function populateJobFilter(applications) {
	const seen = new Map();
	applications.forEach(function (app) {
		const title = app.job_title || app.position;
		if (title && !seen.has(title)) {
			seen.set(title, true);
		}
	});
	const options = ['<option value="">All jobs</option>'];
	Array.from(seen.keys())
		.sort()
		.forEach(function (title) {
			options.push('<option value="' + escapeHtml(title) + '">' + escapeHtml(title) + "</option>");
		});
	elements.job.innerHTML = options.join("");
}

function applyFilters() {
	const search = elements.search.value.trim().toLowerCase();
	const status = elements.status.value;
	const job = elements.job.value;
	const days = Number(elements.date.value);

	state.filtered = state.all.filter(function (app) {
		if (status && normalizeStatus(app.status) !== status) return false;
		if (job && (app.job_title || app.position) !== job) return false;
		if (days && !withinDays(app.created_at, days)) return false;
		if (search) {
			const haystack = (
				(app.full_name || "") +
				" " +
				(app.email || "")
			).toLowerCase();
			if (haystack.indexOf(search) === -1) return false;
		}
		return true;
	});

	state.page = 1;
	renderTable();
}

function renderTable() {
	const totalPages = Math.max(Math.ceil(state.filtered.length / PAGE_SIZE), 1);
	if (state.page > totalPages) state.page = totalPages;
	const start = (state.page - 1) * PAGE_SIZE;
	const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

	if (!pageItems.length) {
		elements.table.innerHTML =
			'<tr><td colspan="10" class="admin-empty">No applications match your filters.</td></tr>';
	} else {
		elements.table.innerHTML = pageItems
			.map(function (app) {
				const status = normalizeStatus(app.status);
				const resumeUrl = app.resume_url ? API_BASE_URL + app.resume_url : "";
				return `
					<tr>
						<td>${escapeHtml(app.full_name)}<span class="admin-applicant-note">${escapeHtml(app.current_city || "")}</span></td>
						<td>${escapeHtml(app.job_title || app.position || "")}</td>
						<td>${escapeHtml(app.email)}</td>
						<td>${escapeHtml(app.phone || "")}</td>
						<td>${escapeHtml(app.experience_years != null ? app.experience_years + " yrs" : "")}</td>
						<td>${escapeHtml(money(app.expected_salary))}</td>
						<td>${resumeUrl ? `<a class="admin-cv-link" href="${escapeHtml(resumeUrl)}" target="_blank" rel="noopener noreferrer">CV</a>` : "No CV"}</td>
						<td><span class="admin-status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span></td>
						<td>${escapeHtml(formatDate(app.created_at))}</td>
						<td><button type="button" class="admin-action-btn" data-action="view" data-id="${escapeHtml(app.id)}">View</button></td>
					</tr>
				`;
			})
			.join("");
	}

	elements.pageSummary.textContent =
		"Page " + state.page + " of " + totalPages + " • " + state.filtered.length + " total";
	elements.prevPage.disabled = state.page <= 1;
	elements.nextPage.disabled = state.page >= totalPages;
}

async function loadApplications() {
	clearMessage();
	elements.loading.classList.remove("d-none");

	try {
		const result = await fetchJson("/api/applications?limit=100", {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		state.all = result.data || [];
		populateJobFilter(state.all);
		applyFilters();
	} catch (error) {
		elements.table.innerHTML =
			'<tr><td colspan="10" class="admin-empty">' + escapeHtml(error.message) + "</td></tr>";
	} finally {
		elements.loading.classList.add("d-none");
	}
}

function detailRow(label, value) {
	return `
		<div class="admin-detail-item">
			<span>${escapeHtml(label)}</span>
			<strong>${escapeHtml(value || "Not provided")}</strong>
		</div>
	`;
}

function detailLink(label, url) {
	if (!url) return detailRow(label, "Not provided");
	return `
		<div class="admin-detail-item">
			<span>${escapeHtml(label)}</span>
			<strong><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:#0f62fe;">${escapeHtml(url)}</a></strong>
		</div>
	`;
}

function renderDetail(app) {
	elements.detail.innerHTML = `
		${detailRow("Full Name", app.full_name)}
		${detailRow("Applied Job", app.job_title || app.position)}
		${detailRow("Email", app.email)}
		${detailRow("Phone / WhatsApp", app.phone)}
		${detailRow("Current City", app.current_city)}
		${detailRow("Experience", app.experience_years != null ? app.experience_years + " years" : "")}
		${detailRow("Expected Salary", money(app.expected_salary))}
		${detailRow("Current Salary", money(app.current_salary))}
		${detailRow("Notice Period", app.notice_period)}
		${detailLink("LinkedIn", app.linkedin_profile)}
		${detailLink("Portfolio / GitHub", app.portfolio_url)}
		${detailRow("Submitted", formatDate(app.created_at))}
		<div class="admin-detail-item admin-detail-wide">
			<span>Cover Letter</span>
			<p>${escapeHtml(app.message || "Not provided")}</p>
		</div>
	`;
	elements.detailStatus.value = normalizeStatus(app.status);
	elements.viewCv.disabled = !app.resume_url;
	elements.downloadCv.disabled = !app.resume_url;
}

function openModal() {
	elements.modal.classList.remove("d-none");
	document.body.classList.add("admin-modal-open");
}

function closeModal() {
	elements.modal.classList.add("d-none");
	document.body.classList.remove("admin-modal-open");
	state.selected = null;
}

function openDetail(id) {
	const app = state.all.find(function (item) {
		return Number(item.id) === Number(id);
	});
	if (!app) return;
	state.selected = app;
	renderDetail(app);
	openModal();
}

async function saveStatus() {
	if (!state.selected) return;

	const newStatus = elements.detailStatus.value;
	elements.saveStatus.disabled = true;
	elements.saveStatus.textContent = "Saving...";

	try {
		const result = await fetchJson("/api/applications/" + state.selected.id + "/status", {
			method: "PATCH",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ status: newStatus }),
		});

		const updated = result.data || {};
		state.selected.status = updated.status || newStatus;
		const idx = state.all.findIndex(function (item) {
			return Number(item.id) === Number(state.selected.id);
		});
		if (idx >= 0) state.all[idx].status = state.selected.status;

		applyFilters();
		showMessage("success", "Status updated to " + state.selected.status + ".");
	} catch (error) {
		showMessage("error", error.message || "Unable to update status.");
	} finally {
		elements.saveStatus.disabled = false;
		elements.saveStatus.textContent = "Save Status";
	}
}

function cvUrl() {
	return state.selected && state.selected.resume_url
		? API_BASE_URL + state.selected.resume_url
		: "";
}

async function viewCv() {
	const url = cvUrl();
	if (!url) return;
	try {
		const response = await fetch(url, { headers: adminHeaders() });
		if (!response.ok) throw new Error("Unable to view CV.");
		const objectUrl = URL.createObjectURL(await response.blob());
		window.open(objectUrl, "_blank", "noopener");
		window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000);
	} catch (error) { showMessage("error", error.message); }
}

async function downloadCv() {
	const url = cvUrl();
	if (!url) return;

	try {
		const response = await fetch(url, { headers: adminHeaders() });
		if (!response.ok) throw new Error("Unable to download CV.");
		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = objectUrl;
		link.download = state.selected.resume_file_name || "resume";
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(objectUrl);
	} catch (error) {
		showMessage("error", error.message || "Unable to download CV.");
	}
}

let searchTimer = 0;
elements.search.addEventListener("input", function () {
	window.clearTimeout(searchTimer);
	searchTimer = window.setTimeout(applyFilters, 250);
});
elements.status.addEventListener("change", applyFilters);
elements.job.addEventListener("change", applyFilters);
elements.date.addEventListener("change", applyFilters);
elements.refresh.addEventListener("click", loadApplications);

elements.prevPage.addEventListener("click", function () {
	if (state.page > 1) {
		state.page -= 1;
		renderTable();
	}
});
elements.nextPage.addEventListener("click", function () {
	const totalPages = Math.max(Math.ceil(state.filtered.length / PAGE_SIZE), 1);
	if (state.page < totalPages) {
		state.page += 1;
		renderTable();
	}
});

elements.table.addEventListener("click", function (event) {
	const button = event.target.closest("button[data-action]");
	if (!button) return;
	if (button.getAttribute("data-action") === "view") {
		openDetail(button.getAttribute("data-id"));
	}
});

elements.saveStatus.addEventListener("click", saveStatus);
elements.viewCv.addEventListener("click", viewCv);
elements.downloadCv.addEventListener("click", downloadCv);

document.addEventListener("click", function (event) {
	if (event.target.closest("[data-close-modal]")) {
		closeModal();
	}
});

elements.logout.addEventListener("click", function () {
	localStorage.removeItem("isAdminLoggedIn");
	window.location.href = "/admin-login";
});

loadApplications();
