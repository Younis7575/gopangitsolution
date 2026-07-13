/* Admin Dashboard — powered by the dynamic Apply/Recruitment module. */
const API_BASE_URL =
	window.JOB_API_BASE_URL ||
	localStorage.getItem("JOB_API_BASE_URL") ||
	"";

if (localStorage.getItem("isAdminLoggedIn") !== "true" || !localStorage.getItem("adminToken")) {
	window.location.replace("/admin-login");
}

/* Category slug -> display label (matches the five Apply categories). */
const CATEGORY_LABELS = {
	job: "Jobs",
	internship: "Internships",
	partnership: "Partners",
	project: "Projects",
	project_based_hiring: "Project-Based Hiring",
};

/* Application status -> pipeline bucket + pill class. */
const STATUS_BUCKETS = [
	{ key: "New", pill: "new", match: ["new", "proposal_received"] },
	{ key: "Under Review", pill: "reviewed", match: ["under_review", "under_evaluation", "on_hold", "negotiation"] },
	{ key: "Shortlisted", pill: "shortlisted", match: ["shortlisted", "interview_scheduled"] },
	{ key: "Selected", pill: "hired", match: ["approved", "hired", "selected", "awarded"] },
	{ key: "Rejected", pill: "rejected", match: ["rejected", "closed"] },
];

const elements = {
	logout: document.getElementById("admin-logout"),
	refresh: document.getElementById("refresh-dashboard"),
	message: document.getElementById("global-message"),
	totalListings: document.getElementById("stat-total-listings"),
	activeListings: document.getElementById("stat-active-listings"),
	totalApps: document.getElementById("stat-total-apps"),
	pendingApps: document.getElementById("stat-pending-apps"),
	todayTrend: document.getElementById("stat-today-trend"),
	selected: document.getElementById("stat-selected"),
	today: document.getElementById("stat-today"),
	news: document.getElementById("stat-news"),
	solutions: document.getElementById("stat-solutions"),
	bids: document.getElementById("stat-bids"),
	recentApps: document.getElementById("recent-apps"),
	recentAppsLoading: document.getElementById("recent-apps-loading"),
	recentJobs: document.getElementById("recent-jobs"),
	recentJobsLoading: document.getElementById("recent-jobs-loading"),
	statusBreakdown: document.getElementById("status-breakdown"),
	statCards: document.querySelectorAll(".dash-stat-card"),
};

function escapeHtml(value) {
	return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
		return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
	});
}

function showMessage(type, text) {
	if (!elements.message) return;
	elements.message.className = "admin-alert " + type;
	elements.message.textContent = text;
}

function clearMessage() {
	if (!elements.message) return;
	elements.message.className = "admin-alert d-none";
	elements.message.textContent = "";
}

function authHeaders() {
	return { Accept: "application/json", Authorization: "Bearer " + (localStorage.getItem("adminToken") || "") };
}

/* Returns the full parsed body ({success,data,meta,...}) or null on failure. */
async function apiGet(path) {
	try {
		const response = await fetch(API_BASE_URL + path, { headers: authHeaders() });
		if (response.status === 401) {
			localStorage.removeItem("isAdminLoggedIn");
			localStorage.removeItem("adminToken");
			window.location.replace("/admin-login");
			return null;
		}
		const result = await response.json();
		if (!response.ok || result.success === false) return null;
		return result;
	} catch (error) {
		return null;
	}
}

function set(el, value) {
	if (el) el.textContent = value;
}

function bucketFor(status) {
	const value = String(status || "").trim().toLowerCase();
	for (const b of STATUS_BUCKETS) {
		if (b.match.indexOf(value) !== -1) return b;
	}
	return STATUS_BUCKETS[0];
}

function initials(name) {
	const parts = String(name || "?").trim().split(/\s+/);
	return (((parts[0] || "")[0] || "?") + ((parts[1] || "")[0] || "")).toUpperCase();
}

function prettyCategory(slug) {
	return CATEGORY_LABELS[slug] || String(slug || "").replace(/_/g, " ");
}

function timeAgo(value) {
	if (!value) return "";
	const clean = String(value).replace(" ", "T");
	const then = Date.parse(clean.endsWith("Z") ? clean : clean + "Z");
	if (Number.isNaN(then)) return String(value).slice(0, 10);
	const diff = Date.now() - then;
	const day = 86400000;
	if (diff < 3600000) return Math.max(1, Math.round(diff / 60000)) + "m ago";
	if (diff < day) return Math.round(diff / 3600000) + "h ago";
	if (diff < 7 * day) return Math.round(diff / day) + "d ago";
	return String(value).slice(0, 10);
}

function stopLoading() {
	elements.statCards.forEach(function (card) {
		card.classList.remove("is-loading");
	});
}

/* --- Aggregate stats from /api/admin/apply/dashboard ------------------- */
function applyAggregate(body) {
	const data = (body && body.data) || {};
	const opportunities = Array.isArray(data.opportunities) ? data.opportunities : [];
	const applications = Array.isArray(data.applications) ? data.applications : [];

	let totalListings = 0;
	let publishedListings = 0;
	opportunities.forEach(function (row) {
		const n = Number(row.total) || 0;
		totalListings += n;
		if (String(row.status) === "published") publishedListings += n;
	});

	let totalApps = 0;
	let pending = 0;
	let selected = 0;
	const perCategory = {};
	const bucketCounts = {};
	STATUS_BUCKETS.forEach(function (b) { bucketCounts[b.key] = 0; });

	applications.forEach(function (row) {
		const n = Number(row.total) || 0;
		totalApps += n;
		perCategory[row.category] = (perCategory[row.category] || 0) + n;
		const bucket = bucketFor(row.status);
		bucketCounts[bucket.key] += n;
		if (bucket.key === "New") pending += n;
		if (bucket.key === "Selected") selected += n;
	});

	set(elements.totalListings, totalListings);
	set(elements.activeListings, publishedListings);
	set(elements.totalApps, totalApps);
	set(elements.pendingApps, pending);
	set(elements.selected, selected);
	set(elements.today, Number(data.today) || 0);
	if (elements.todayTrend) elements.todayTrend.textContent = (Number(data.today) || 0) + " today";

	Object.keys(CATEGORY_LABELS).forEach(function (slug) {
		set(document.getElementById("stat-cat-" + slug), perCategory[slug] || 0);
	});

	renderStatusBreakdown(bucketCounts, totalApps);
}

function renderStatusBreakdown(bucketCounts, total) {
	if (!elements.statusBreakdown) return;
	const denom = total || 1;
	elements.statusBreakdown.innerHTML = STATUS_BUCKETS.map(function (b) {
		const count = bucketCounts[b.key] || 0;
		const percent = Math.round((count / denom) * 100);
		return (
			'<div class="dash-bar-row">' +
			'<div class="dash-bar-top"><span>' + b.key + "</span><span>" + count + "</span></div>" +
			'<div class="dash-bar-track"><div class="dash-bar-fill ' + b.pill + '" style="width:' + percent + '%"></div></div>' +
			"</div>"
		);
	}).join("");
}

/* --- Recent applications ----------------------------------------------- */
function renderRecentApplications(apps) {
	if (elements.recentAppsLoading) elements.recentAppsLoading.classList.add("d-none");
	if (!elements.recentApps) return;
	if (!apps.length) {
		elements.recentApps.innerHTML = '<div class="admin-empty">No applications yet.</div>';
		return;
	}
	elements.recentApps.innerHTML = apps.slice(0, 6).map(function (app) {
		const bucket = bucketFor(app.status);
		return (
			'<a class="dash-recent-item" href="/admin-apply">' +
			'<span class="dash-avatar">' + escapeHtml(initials(app.applicant_name)) + "</span>" +
			'<span class="dash-recent-main"><strong>' + escapeHtml(app.applicant_name) + "</strong>" +
			"<span>" + escapeHtml(app.opportunity_title || prettyCategory(app.opportunity_category)) + "</span></span>" +
			'<span class="admin-status-pill ' + bucket.pill + '">' + escapeHtml(bucket.key) + "</span>" +
			'<span class="dash-recent-time">' + escapeHtml(timeAgo(app.created_at)) + "</span>" +
			"</a>"
		);
	}).join("");
}

/* --- Recent listings --------------------------------------------------- */
function renderRecentListings(listings) {
	if (elements.recentJobsLoading) elements.recentJobsLoading.classList.add("d-none");
	if (!elements.recentJobs) return;
	if (!listings.length) {
		elements.recentJobs.innerHTML = '<div class="admin-empty">No listings yet. Add one from Apply Management.</div>';
		return;
	}
	elements.recentJobs.innerHTML = listings.slice(0, 5).map(function (o) {
		const published = String(o.status) === "published";
		const meta = [prettyCategory(o.category), o.location].filter(Boolean).join(" • ");
		return (
			'<a class="dash-recent-item" href="/admin-apply">' +
			'<span class="dash-avatar"><i class="fal fa-briefcase" aria-hidden="true"></i></span>' +
			'<span class="dash-recent-main"><strong>' + escapeHtml(o.title) + "</strong>" +
			"<span>" + escapeHtml(meta) + "</span></span>" +
			'<span class="admin-status-pill ' + (published ? "approved" : "reviewed") + '">' + escapeHtml(o.status) + "</span>" +
			"</a>"
		);
	}).join("");
}

/* --- Secondary module counts (non-blocking) ---------------------------- */
async function loadSecondaryCounts() {
	const news = await apiGet("/api/news");
	if (news && Array.isArray(news.data)) set(elements.news, news.data.length);

	const solutions = await apiGet("/api/solutions?admin=1&limit=1");
	if (solutions) set(elements.solutions, (solutions.meta && solutions.meta.total_records) || 0);

	const bids = await apiGet("/api/bid-projects?admin=1");
	if (bids && Array.isArray(bids.data)) set(elements.bids, bids.data.length);
}

async function loadDashboard() {
	clearMessage();
	const [aggregate, recentApps, recentListings] = await Promise.all([
		apiGet("/api/admin/apply/dashboard"),
		apiGet("/api/admin/apply/applications?limit=6"),
		apiGet("/api/admin/opportunities?limit=6"),
	]);

	if (!aggregate) {
		showMessage("error", "Could not load dashboard data. Please refresh or log in again.");
	} else {
		applyAggregate(aggregate);
	}

	renderRecentApplications((recentApps && Array.isArray(recentApps.data)) ? recentApps.data : []);
	renderRecentListings((recentListings && Array.isArray(recentListings.data)) ? recentListings.data : []);
	stopLoading();
	loadSecondaryCounts();
}

if (elements.refresh) {
	elements.refresh.addEventListener("click", function () {
		elements.statCards.forEach(function (card) { card.classList.add("is-loading"); });
		if (elements.recentAppsLoading) elements.recentAppsLoading.classList.remove("d-none");
		if (elements.recentJobsLoading) elements.recentJobsLoading.classList.remove("d-none");
		void loadDashboard();
	});
}

if (elements.logout) {
	elements.logout.addEventListener("click", function () {
		localStorage.removeItem("isAdminLoggedIn");
		localStorage.removeItem("adminToken");
		window.location.href = "/admin-login";
	});
}

loadDashboard();
