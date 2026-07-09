const API_BASE_URL =
	window.JOB_API_BASE_URL ||
	localStorage.getItem("JOB_API_BASE_URL") ||
	"";

const BID_STATUSES = ["New", "Shortlisted", "Interviewing", "Awarded", "Rejected"];
const PAGE_SIZE = 10;

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
	window.location.replace("/admin-login");
}

const state = {
	projects: [],
	editingProjectId: null,
	bids: [],
	filtered: [],
	page: 1,
	selectedBid: null,
};

const el = {
	form: document.getElementById("project-form"),
	projectId: document.getElementById("project-id"),
	title: document.getElementById("project-title"),
	category: document.getElementById("project-category"),
	status: document.getElementById("project-status"),
	budgetType: document.getElementById("project-budget-type"),
	experience: document.getElementById("project-experience"),
	budgetMin: document.getElementById("project-budget-min"),
	budgetMax: document.getElementById("project-budget-max"),
	duration: document.getElementById("project-duration"),
	deadline: document.getElementById("project-deadline"),
	description: document.getElementById("project-description"),
	skills: document.getElementById("project-skills"),
	saveProjectBtn: document.getElementById("save-project-btn"),
	resetProjectForm: document.getElementById("reset-project-form"),
	refreshProjects: document.getElementById("refresh-projects"),
	projectsLoading: document.getElementById("projects-loading"),
	projectsList: document.getElementById("projects-list"),
	message: document.getElementById("global-message"),
	logout: document.getElementById("admin-logout"),
	// bids
	refreshBids: document.getElementById("refresh-bids"),
	bidSearch: document.getElementById("bid-search"),
	bidStatusFilter: document.getElementById("bid-status-filter"),
	bidProjectFilter: document.getElementById("bid-project-filter"),
	bidSort: document.getElementById("bid-sort"),
	bidsLoading: document.getElementById("bids-loading"),
	bidsTable: document.getElementById("bids-table"),
	prevPage: document.getElementById("prev-page"),
	nextPage: document.getElementById("next-page"),
	pageSummary: document.getElementById("page-summary"),
	modal: document.getElementById("bid-modal"),
	detail: document.getElementById("bid-detail"),
	detailStatus: document.getElementById("detail-status"),
	saveStatus: document.getElementById("save-status"),
	downloadAttachment: document.getElementById("download-attachment"),
};

function escapeHtml(value) {
	return String(value || "").replace(/[&<>"']/g, function (char) {
		return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
	});
}

function showMessage(type, message) {
	el.message.className = "admin-alert " + type;
	el.message.textContent = message;
}
function clearMessage() {
	el.message.className = "admin-alert d-none";
	el.message.textContent = "";
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
	if (value === "Pending" || value === "") return "New";
	return BID_STATUSES.indexOf(value) >= 0 ? value : "New";
}
function money(value) {
	if (value === null || value === undefined || value === "") return "";
	const num = Number(value);
	return Number.isFinite(num) ? "$" + num.toLocaleString() : String(value);
}
function budgetText(p) {
	const suffix = String(p.budget_type) === "Hourly" ? "/hr" : "";
	if (p.budget_min && p.budget_max) return money(p.budget_min) + " - " + money(p.budget_max) + suffix;
	if (p.budget_max) return "Up to " + money(p.budget_max) + suffix;
	if (p.budget_min) return "From " + money(p.budget_min) + suffix;
	return "On discussion";
}
function formatDate(value) {
	if (!value) return "";
	return String(value).replace("T", " ").slice(0, 16);
}

/* ---------------- Projects ---------------- */
function projectPayload() {
	return {
		title: el.title.value.trim(),
		category: el.category.value,
		status: el.status.value,
		budget_type: el.budgetType.value,
		experience_level: el.experience.value,
		budget_min: el.budgetMin.value,
		budget_max: el.budgetMax.value,
		duration: el.duration.value.trim(),
		deadline: el.deadline.value,
		description: el.description.value.trim(),
		skills: el.skills.value.trim(),
	};
}

function resetProjectForm() {
	state.editingProjectId = null;
	el.form.reset();
	el.projectId.value = "";
	el.saveProjectBtn.textContent = "Add Project";
	clearMessage();
}

function fillProjectForm(p) {
	state.editingProjectId = p.id;
	el.projectId.value = p.id;
	el.title.value = p.title || "";
	el.category.value = p.category || "";
	el.status.value = p.status || "Open";
	el.budgetType.value = p.budget_type || "Fixed";
	el.experience.value = p.experience_level || "";
	el.budgetMin.value = p.budget_min || "";
	el.budgetMax.value = p.budget_max || "";
	el.duration.value = p.duration || "";
	el.deadline.value = p.deadline || "";
	el.description.value = p.description || "";
	el.skills.value = p.skills || "";
	el.saveProjectBtn.textContent = "Update Project";
	window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProjects(projects) {
	if (!Array.isArray(projects) || projects.length === 0) {
		el.projectsList.innerHTML = '<div class="admin-empty">No projects yet.</div>';
		return;
	}
	el.projectsList.innerHTML = projects.map(function (p) {
		const open = String(p.status || "Open") === "Open";
		return `
			<article class="admin-job-card">
				<h3>${escapeHtml(p.title)}</h3>
				<div class="admin-job-meta">
					<span>${escapeHtml(p.category)}</span>
					<span>${escapeHtml(budgetText(p))}</span>
					<span>${escapeHtml(p.duration || "Flexible")}</span>
					<span class="admin-status-pill ${open ? "approved" : "reject"}">${escapeHtml(p.status || "Open")}</span>
					<span>${escapeHtml(String(p.bid_count || 0))} bids</span>
				</div>
				<p class="admin-job-description">${escapeHtml(p.description)}</p>
				<div class="admin-job-actions">
					<button type="button" class="admin-action-btn" data-action="edit" data-id="${escapeHtml(p.id)}">Edit</button>
					<button type="button" class="admin-action-btn" data-action="bids" data-id="${escapeHtml(p.id)}">View Bids</button>
					<button type="button" class="admin-action-btn danger" data-action="delete" data-id="${escapeHtml(p.id)}">Delete</button>
				</div>
			</article>
		`;
	}).join("");
}

function populateProjectFilter() {
	const options = ['<option value="">All projects</option>'];
	state.projects.forEach(function (p) {
		options.push('<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.title) + "</option>");
	});
	el.bidProjectFilter.innerHTML = options.join("");
}

async function loadProjects() {
	el.projectsLoading.classList.remove("d-none");
	try {
		const result = await fetchJson("/api/bid-projects?admin=1", { method: "GET" });
		state.projects = result.data || [];
		renderProjects(state.projects);
		populateProjectFilter();
	} catch (error) {
		el.projectsList.innerHTML = '<div class="admin-empty">' + escapeHtml(error.message) + "</div>";
	} finally {
		el.projectsLoading.classList.add("d-none");
	}
}

async function saveProject(event) {
	event.preventDefault();
	clearMessage();
	const payload = projectPayload();
	const isEditing = Boolean(state.editingProjectId);
	const path = isEditing ? "/api/bid-projects/" + state.editingProjectId : "/api/bid-projects";
	el.saveProjectBtn.disabled = true;
	el.saveProjectBtn.textContent = isEditing ? "Updating..." : "Adding...";
	try {
		const result = await fetchJson(path, {
			method: isEditing ? "PUT" : "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		resetProjectForm();
		showMessage("success", result.message || "Project saved.");
		await loadProjects();
	} catch (error) {
		showMessage("error", error.message || "Unable to save project.");
	} finally {
		el.saveProjectBtn.disabled = false;
		el.saveProjectBtn.textContent = state.editingProjectId ? "Update Project" : "Add Project";
	}
}

async function deleteProject(id) {
	if (!window.confirm("Delete this project and all its bids? This cannot be undone.")) return;
	clearMessage();
	try {
		const result = await fetchJson("/api/bid-projects/" + id, { method: "DELETE" });
		showMessage("success", result.message || "Project deleted.");
		await loadProjects();
		await loadBids();
	} catch (error) {
		showMessage("error", error.message || "Unable to delete project.");
	}
}

/* ---------------- Bids ---------------- */
function applyBidFilters() {
	const search = el.bidSearch.value.trim().toLowerCase();
	const status = el.bidStatusFilter.value;
	const project = el.bidProjectFilter.value;
	const sort = el.bidSort.value;

	let list = state.bids.filter(function (b) {
		if (status && normalizeStatus(b.status) !== status) return false;
		if (project && String(b.project_id) !== String(project)) return false;
		if (search) {
			const haystack = ((b.full_name || "") + " " + (b.email || "")).toLowerCase();
			if (haystack.indexOf(search) === -1) return false;
		}
		return true;
	});

	if (sort === "low") list = list.slice().sort(function (a, b) { return Number(a.bid_amount) - Number(b.bid_amount); });
	else if (sort === "high") list = list.slice().sort(function (a, b) { return Number(b.bid_amount) - Number(a.bid_amount); });

	state.filtered = list;
	state.page = 1;
	renderBids();
}

function renderBids() {
	const totalPages = Math.max(Math.ceil(state.filtered.length / PAGE_SIZE), 1);
	if (state.page > totalPages) state.page = totalPages;
	const start = (state.page - 1) * PAGE_SIZE;
	const items = state.filtered.slice(start, start + PAGE_SIZE);

	if (!items.length) {
		el.bidsTable.innerHTML = '<tr><td colspan="9" class="admin-empty">No bids match your filters.</td></tr>';
	} else {
		el.bidsTable.innerHTML = items.map(function (b) {
			const status = normalizeStatus(b.status);
			const fileUrl = b.attachment_url ? API_BASE_URL + b.attachment_url : "";
			return `
				<tr>
					<td>${escapeHtml(b.full_name)}</td>
					<td>${escapeHtml(b.project_title || "")}</td>
					<td>${escapeHtml(b.email)}</td>
					<td>${escapeHtml(money(b.bid_amount))}</td>
					<td>${escapeHtml(b.delivery_days != null ? b.delivery_days + " days" : "")}</td>
					<td>${fileUrl ? `<a class="admin-cv-link" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">File</a>` : "None"}</td>
					<td><span class="admin-status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span></td>
					<td>${escapeHtml(formatDate(b.created_at))}</td>
					<td><button type="button" class="admin-action-btn" data-action="view" data-id="${escapeHtml(b.id)}">View</button></td>
				</tr>
			`;
		}).join("");
	}

	el.pageSummary.textContent = "Page " + state.page + " of " + totalPages + " • " + state.filtered.length + " total";
	el.prevPage.disabled = state.page <= 1;
	el.nextPage.disabled = state.page >= totalPages;
}

async function loadBids() {
	el.bidsLoading.classList.remove("d-none");
	try {
		const result = await fetchJson("/api/bids", { method: "GET" });
		state.bids = result.data || [];
		applyBidFilters();
	} catch (error) {
		el.bidsTable.innerHTML = '<tr><td colspan="9" class="admin-empty">' + escapeHtml(error.message) + "</td></tr>";
	} finally {
		el.bidsLoading.classList.add("d-none");
	}
}

function detailRow(label, value) {
	return `<div class="admin-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not provided")}</strong></div>`;
}
function detailLink(label, url) {
	if (!url) return detailRow(label, "Not provided");
	return `<div class="admin-detail-item"><span>${escapeHtml(label)}</span><strong><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:#0f62fe;">${escapeHtml(url)}</a></strong></div>`;
}

function renderBidDetail(b) {
	el.detail.innerHTML = `
		${detailRow("Freelancer", b.full_name)}
		${detailRow("Project", b.project_title)}
		${detailRow("Email", b.email)}
		${detailRow("Phone", b.phone)}
		${detailRow("Bid Amount", money(b.bid_amount))}
		${detailRow("Delivery", b.delivery_days != null ? b.delivery_days + " days" : "")}
		${detailLink("Portfolio", b.portfolio_url)}
		${detailLink("LinkedIn", b.linkedin_url)}
		${detailLink("GitHub", b.github_url)}
		${detailRow("Submitted", formatDate(b.created_at))}
		<div class="admin-detail-item admin-detail-wide"><span>Cover Letter</span><p>${escapeHtml(b.cover_letter || "")}</p></div>
		${b.experience ? '<div class="admin-detail-item admin-detail-wide"><span>Experience</span><p>' + escapeHtml(b.experience) + "</p></div>" : ""}
		${b.skills ? '<div class="admin-detail-item admin-detail-wide"><span>Skills</span><p>' + escapeHtml(b.skills) + "</p></div>" : ""}
		${b.milestones ? '<div class="admin-detail-item admin-detail-wide"><span>Milestones</span><p>' + escapeHtml(b.milestones) + "</p></div>" : ""}
	`;
	el.detailStatus.value = normalizeStatus(b.status);
	el.downloadAttachment.disabled = !b.attachment_url;
}

function openModal() {
	el.modal.classList.remove("d-none");
	document.body.classList.add("admin-modal-open");
}
function closeModal() {
	el.modal.classList.add("d-none");
	document.body.classList.remove("admin-modal-open");
	state.selectedBid = null;
}

function openBidDetail(id) {
	const bid = state.bids.find(function (b) { return Number(b.id) === Number(id); });
	if (!bid) return;
	state.selectedBid = bid;
	renderBidDetail(bid);
	openModal();
}

async function saveBidStatus() {
	if (!state.selectedBid) return;
	const newStatus = el.detailStatus.value;
	el.saveStatus.disabled = true;
	el.saveStatus.textContent = "Saving...";
	try {
		const result = await fetchJson("/api/bids/" + state.selectedBid.id + "/status", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: newStatus }),
		});
		const updated = result.data || {};
		state.selectedBid.status = updated.status || newStatus;
		const idx = state.bids.findIndex(function (b) { return Number(b.id) === Number(state.selectedBid.id); });
		if (idx >= 0) state.bids[idx].status = state.selectedBid.status;
		applyBidFilters();
		showMessage("success", "Bid status updated to " + state.selectedBid.status + ".");
	} catch (error) {
		showMessage("error", error.message || "Unable to update status.");
	} finally {
		el.saveStatus.disabled = false;
		el.saveStatus.textContent = "Save Status";
	}
}

function downloadAttachment() {
	if (state.selectedBid && state.selectedBid.attachment_url) {
		window.open(API_BASE_URL + state.selectedBid.attachment_url, "_blank", "noopener");
	}
}

/* ---------------- Events ---------------- */
el.form.addEventListener("submit", saveProject);
el.resetProjectForm.addEventListener("click", resetProjectForm);
el.refreshProjects.addEventListener("click", loadProjects);
el.projectsList.addEventListener("click", function (event) {
	const button = event.target.closest("button[data-action]");
	if (!button) return;
	const id = Number(button.getAttribute("data-id"));
	const action = button.getAttribute("data-action");
	if (action === "edit") {
		const p = state.projects.find(function (x) { return Number(x.id) === id; });
		if (p) fillProjectForm(p);
	} else if (action === "delete") {
		void deleteProject(id);
	} else if (action === "bids") {
		el.bidProjectFilter.value = String(id);
		applyBidFilters();
		document.getElementById("bids-title").scrollIntoView({ behavior: "smooth", block: "start" });
	}
});

el.refreshBids.addEventListener("click", loadBids);
let searchTimer = 0;
el.bidSearch.addEventListener("input", function () {
	window.clearTimeout(searchTimer);
	searchTimer = window.setTimeout(applyBidFilters, 250);
});
el.bidStatusFilter.addEventListener("change", applyBidFilters);
el.bidProjectFilter.addEventListener("change", applyBidFilters);
el.bidSort.addEventListener("change", applyBidFilters);
el.prevPage.addEventListener("click", function () { if (state.page > 1) { state.page -= 1; renderBids(); } });
el.nextPage.addEventListener("click", function () {
	const totalPages = Math.max(Math.ceil(state.filtered.length / PAGE_SIZE), 1);
	if (state.page < totalPages) { state.page += 1; renderBids(); }
});
el.bidsTable.addEventListener("click", function (event) {
	const button = event.target.closest("button[data-action='view']");
	if (button) openBidDetail(button.getAttribute("data-id"));
});
el.saveStatus.addEventListener("click", saveBidStatus);
el.downloadAttachment.addEventListener("click", downloadAttachment);
document.addEventListener("click", function (event) {
	if (event.target.closest("[data-close-modal]")) closeModal();
});
el.logout.addEventListener("click", function () {
	localStorage.removeItem("isAdminLoggedIn");
	localStorage.removeItem("adminToken");
	window.location.href = "/admin-login";
});

loadProjects();
loadBids();
