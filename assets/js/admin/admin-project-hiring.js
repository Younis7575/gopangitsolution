const API_BASE_URL =
	window.JOB_API_BASE_URL ||
	localStorage.getItem("JOB_API_BASE_URL") ||
	"https://job-api.gopangit.workers.dev";
const STATUSES = ["pending", "reviewed", "contacted", "proposal_sent", "approved", "rejected"];
const STATUS_LABELS = {
	pending: "Pending",
	reviewed: "Reviewed",
	contacted: "Contacted",
	proposal_sent: "Proposal Sent",
	approved: "Approved",
	rejected: "Rejected",
};

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
	window.location.replace("/admin-login");
}

const state = {
	items: [],
	page: 1,
	limit: 10,
	total: 0,
	selected: null,
	pendingDeleteId: null,
};

const elements = {
	logout: document.getElementById("admin-logout"),
	tokenBtn: document.getElementById("admin-token-btn"),
	message: document.getElementById("global-message"),
	refresh: document.getElementById("refresh-requests"),
	search: document.getElementById("request-search"),
	status: document.getElementById("request-status"),
	category: document.getElementById("request-category"),
	loading: document.getElementById("requests-loading"),
	table: document.getElementById("requests-table"),
	prevPage: document.getElementById("prev-page"),
	nextPage: document.getElementById("next-page"),
	pageSummary: document.getElementById("page-summary"),
	requestModal: document.getElementById("request-modal"),
	requestDetail: document.getElementById("request-detail"),
	detailStatus: document.getElementById("detail-status"),
	detailNotes: document.getElementById("detail-notes"),
	saveDetail: document.getElementById("save-detail"),
	downloadAttachment: document.getElementById("download-attachment"),
	deleteRequest: document.getElementById("delete-request"),
	confirmModal: document.getElementById("confirm-modal"),
	cancelDelete: document.getElementById("cancel-delete"),
	confirmDelete: document.getElementById("confirm-delete"),
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

function getAdminToken() {
	return localStorage.getItem("adminApiToken") || "";
}

function ensureAdminToken() {
	if (getAdminToken()) {
		return true;
	}

	const token = window.prompt("Enter Cloudflare Worker ADMIN_API_TOKEN");

	if (!token) {
		showMessage("error", "Admin API token is required to load protected project hiring APIs.");
		return false;
	}

	localStorage.setItem("adminApiToken", token.trim());
	return true;
}

function authHeaders(extraHeaders) {
	return {
		Accept: "application/json",
		Authorization: "Bearer " + getAdminToken(),
		...(extraHeaders || {}),
	};
}

async function fetchJson(path, options) {
	if (!ensureAdminToken()) {
		throw new Error("Admin API token is required.");
	}

	const response = await fetch(API_BASE_URL + path, {
		...(options || {}),
		headers: authHeaders(options && options.headers),
	});
	const contentType = response.headers.get("content-type") || "";
	const result = contentType.includes("application/json")
		? await response.json()
		: { success: false, message: await response.text() };

	if (!response.ok || result.success === false) {
		throw new Error(result.message || "Request failed. Please try again.");
	}

	return result;
}

function statusLabel(status) {
	return STATUS_LABELS[status] || status || "Pending";
}

function statusClass(status) {
	return String(status || "pending").replace(/_/g, "-");
}

function formatDate(value) {
	if (!value) {
		return "";
	}

	return String(value).replace("T", " ").slice(0, 19);
}

function getQueryString() {
	const params = new URLSearchParams();
	params.set("page", String(state.page));
	params.set("limit", String(state.limit));

	if (elements.search.value.trim()) {
		params.set("search", elements.search.value.trim());
	}

	if (elements.status.value) {
		params.set("status", elements.status.value);
	}

	if (elements.category.value) {
		params.set("category", elements.category.value);
	}

	return params.toString();
}

function renderRequests(items) {
	if (!Array.isArray(items) || items.length === 0) {
		elements.table.innerHTML = '<tr><td colspan="10" class="admin-empty">No project hiring requests found.</td></tr>';
		return;
	}

	elements.table.innerHTML = items
		.map(function (item) {
			return `
				<tr>
					<td>${escapeHtml(item.full_name)}</td>
					<td>${escapeHtml(item.email)}</td>
					<td>${escapeHtml(item.phone)}</td>
					<td>${escapeHtml(item.project_title)}</td>
					<td>${escapeHtml(item.project_category)}</td>
					<td>${escapeHtml(item.budget_range)}</td>
					<td>${escapeHtml(item.expected_timeline)}</td>
					<td><span class="admin-status-pill ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
					<td>${escapeHtml(formatDate(item.created_at))}</td>
					<td>
						<div class="admin-job-actions">
							<button type="button" class="admin-action-btn" data-action="view" data-id="${escapeHtml(item.id)}">View Detail</button>
							<button type="button" class="admin-action-btn danger" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>
						</div>
					</td>
				</tr>
			`;
		})
		.join("");
}

function renderPagination() {
	const totalPages = Math.max(Math.ceil(state.total / state.limit), 1);
	elements.pageSummary.textContent = "Page " + state.page + " of " + totalPages + " • " + state.total + " total";
	elements.prevPage.disabled = state.page <= 1;
	elements.nextPage.disabled = state.page >= totalPages;
}

async function loadRequests() {
	clearMessage();
	elements.loading.classList.remove("d-none");

	try {
		const result = await fetchJson("/api/admin/project-hiring?" + getQueryString(), {
			method: "GET",
		});
		state.items = result.data || [];
		state.total = result.meta ? Number(result.meta.total || 0) : state.items.length;
		renderRequests(state.items);
		renderPagination();
	} catch (error) {
		elements.table.innerHTML = '<tr><td colspan="10" class="admin-empty">' + escapeHtml(error.message) + "</td></tr>";
		renderPagination();
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

function renderDetail(item) {
	elements.requestDetail.innerHTML = `
		${detailRow("Full Name", item.full_name)}
		${detailRow("Email", item.email)}
		${detailRow("Phone / WhatsApp", item.phone)}
		${detailRow("Company", item.company_name)}
		${detailRow("Country / City", item.country_city)}
		${detailRow("Project Title", item.project_title)}
		${detailRow("Category", item.project_category)}
		${detailRow("Budget", item.budget_range)}
		${detailRow("Timeline", item.expected_timeline)}
		${detailRow("Attachment", item.attachment_file_name || "No attachment")}
		${detailRow("Submitted", formatDate(item.created_at))}
		<div class="admin-detail-item admin-detail-wide">
			<span>Project Description</span>
			<p>${escapeHtml(item.project_description)}</p>
		</div>
	`;
	elements.detailStatus.value = item.status || "pending";
	elements.detailNotes.value = item.admin_notes || "";
	elements.downloadAttachment.disabled = !item.attachment_url;
}

function openModal() {
	elements.requestModal.classList.remove("d-none");
	document.body.classList.add("admin-modal-open");
}

function closeModal() {
	elements.requestModal.classList.add("d-none");
	document.body.classList.remove("admin-modal-open");
}

function openConfirmModal(id) {
	state.pendingDeleteId = id;
	elements.confirmModal.classList.remove("d-none");
	document.body.classList.add("admin-modal-open");
}

function closeConfirmModal() {
	state.pendingDeleteId = null;
	elements.confirmModal.classList.add("d-none");
	document.body.classList.remove("admin-modal-open");
}

async function openDetail(id) {
	clearMessage();

	try {
		const result = await fetchJson("/api/admin/project-hiring/" + id, {
			method: "GET",
		});
		state.selected = result.data;
		renderDetail(state.selected);
		openModal();
	} catch (error) {
		showMessage("error", error.message || "Unable to load request detail.");
	}
}

async function updateDetail() {
	if (!state.selected) {
		return;
	}

	elements.saveDetail.disabled = true;
	elements.saveDetail.textContent = "Updating...";

	try {
		const result = await fetchJson("/api/admin/project-hiring/" + state.selected.id + "/status", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				status: elements.detailStatus.value,
				admin_notes: elements.detailNotes.value.trim(),
			}),
		});
		state.selected = result.data;
		renderDetail(state.selected);
		showMessage("success", result.message || "Project hiring request updated successfully.");
		await loadRequests();
	} catch (error) {
		showMessage("error", error.message || "Unable to update request.");
	} finally {
		elements.saveDetail.disabled = false;
		elements.saveDetail.textContent = "Update Status & Notes";
	}
}

async function deleteRequest(id) {
	try {
		const result = await fetchJson("/api/admin/project-hiring/" + id, {
			method: "DELETE",
		});
		closeConfirmModal();
		closeModal();
		showMessage("success", result.message || "Project hiring request deleted successfully.");
		await loadRequests();
	} catch (error) {
		showMessage("error", error.message || "Unable to delete request.");
	}
}

async function downloadAttachment() {
	if (!state.selected || !state.selected.attachment_url) {
		return;
	}

	try {
		const response = await fetch(API_BASE_URL + state.selected.attachment_url, {
			headers: authHeaders(),
		});

		if (!response.ok) {
			const result = await response.json().catch(function () {
				return { message: "Unable to download attachment." };
			});
			throw new Error(result.message || "Unable to download attachment.");
		}

		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = state.selected.attachment_file_name || "project-attachment";
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	} catch (error) {
		showMessage("error", error.message || "Unable to download attachment.");
	}
}

function resetToFirstPageAndLoad() {
	state.page = 1;
	void loadRequests();
}

let searchTimer = 0;
elements.search.addEventListener("input", function () {
	window.clearTimeout(searchTimer);
	searchTimer = window.setTimeout(resetToFirstPageAndLoad, 300);
});
elements.status.addEventListener("change", resetToFirstPageAndLoad);
elements.category.addEventListener("change", resetToFirstPageAndLoad);
elements.refresh.addEventListener("click", loadRequests);
elements.prevPage.addEventListener("click", function () {
	if (state.page > 1) {
		state.page -= 1;
		void loadRequests();
	}
});
elements.nextPage.addEventListener("click", function () {
	const totalPages = Math.max(Math.ceil(state.total / state.limit), 1);
	if (state.page < totalPages) {
		state.page += 1;
		void loadRequests();
	}
});
elements.table.addEventListener("click", function (event) {
	const button = event.target.closest("button[data-action]");
	if (!button) {
		return;
	}

	const id = Number(button.getAttribute("data-id"));
	const action = button.getAttribute("data-action");

	if (action === "view") {
		void openDetail(id);
	}

	if (action === "delete") {
		openConfirmModal(id);
	}
});
elements.saveDetail.addEventListener("click", updateDetail);
elements.downloadAttachment.addEventListener("click", downloadAttachment);
elements.deleteRequest.addEventListener("click", function () {
	if (state.selected) {
		openConfirmModal(state.selected.id);
	}
});
elements.confirmDelete.addEventListener("click", function () {
	if (state.pendingDeleteId) {
		void deleteRequest(state.pendingDeleteId);
	}
});
elements.cancelDelete.addEventListener("click", closeConfirmModal);
document.addEventListener("click", function (event) {
	if (event.target.closest("[data-close-modal]")) {
		closeModal();
	}

	if (event.target.closest("[data-cancel-delete]")) {
		closeConfirmModal();
	}
});
elements.tokenBtn.addEventListener("click", function () {
	const token = window.prompt("Enter Cloudflare Worker ADMIN_API_TOKEN", getAdminToken());
	if (token !== null) {
		localStorage.setItem("adminApiToken", token.trim());
		void loadRequests();
	}
});
elements.logout.addEventListener("click", function () {
	localStorage.clear();
	window.location.href = "/admin-login";
});

loadRequests();
