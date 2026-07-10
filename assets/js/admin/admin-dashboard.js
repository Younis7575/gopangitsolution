const API_BASE_URL =
	window.JOB_API_BASE_URL ||
	localStorage.getItem("JOB_API_BASE_URL") ||
	"";

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
	window.location.replace("/admin-login");
}

const STATUS_ORDER = ["New", "Reviewed", "Shortlisted", "Hired", "Rejected"];

const elements = {
	logout: document.getElementById("admin-logout"),
	refresh: document.getElementById("refresh-dashboard"),
	message: document.getElementById("global-message"),
	totalJobs: document.getElementById("stat-total-jobs"),
	activeJobs: document.getElementById("stat-active-jobs"),
	totalApps: document.getElementById("stat-total-apps"),
	newApps: document.getElementById("stat-new-apps"),
	newTrend: document.getElementById("stat-new-trend"),
	news: document.getElementById("stat-news"),
	partners: document.getElementById("stat-partners"),
	proposals: document.getElementById("stat-proposals"),
	hired: document.getElementById("stat-hired"),
	projects: document.getElementById("stat-projects"),
	bids: document.getElementById("stat-bids"),
	recentApps: document.getElementById("recent-apps"),
	recentAppsLoading: document.getElementById("recent-apps-loading"),
	recentJobs: document.getElementById("recent-jobs"),
	recentJobsLoading: document.getElementById("recent-jobs-loading"),
	statusBreakdown: document.getElementById("status-breakdown"),
	statCards: document.querySelectorAll(".dash-stat-card"),
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

async function fetchData(path) {
	try {
		const response = await fetch(API_BASE_URL + path, {
			headers: {
				Accept: "application/json",
				Authorization: "Bearer " + (localStorage.getItem("adminToken") || ""),
			},
		});
		if (response.status === 401) {
			localStorage.removeItem("isAdminLoggedIn");
			localStorage.removeItem("adminToken");
			window.location.replace("/admin-login");
			return [];
		}
		const result = await response.json();
		if (!response.ok || result.success === false) {
			return [];
		}
		return Array.isArray(result.data) ? result.data : [];
	} catch (error) {
		return [];
	}
}

function normalizeStatus(status) {
	const value = String(status || "").trim().toLowerCase();
	if (!value || value === "pending" || value === "new") {
		return "New";
	}
	if (value === "reviewed") return "Reviewed";
	if (value === "shortlisted") return "Shortlisted";
	if (value === "hired") return "Hired";
	if (value === "rejected") return "Rejected";
	return "New";
}

function initials(name) {
	const parts = String(name || "?").trim().split(/\s+/);
	return ((parts[0] || "")[0] || "?") + ((parts[1] || "")[0] || "");
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

function isWithinLastWeek(value) {
	if (!value) return false;
	const clean = String(value).replace(" ", "T");
	const then = Date.parse(clean.endsWith("Z") ? clean : clean + "Z");
	if (Number.isNaN(then)) return false;
	return Date.now() - then <= 7 * 86400000;
}

function stopLoading() {
	elements.statCards.forEach(function (card) {
		card.classList.remove("is-loading");
	});
}

function renderRecentApplications(apps) {
	elements.recentAppsLoading.classList.add("d-none");
	if (!apps.length) {
		elements.recentApps.innerHTML = '<div class="admin-empty">No applications yet.</div>';
		return;
	}

	elements.recentApps.innerHTML = apps
		.slice(0, 6)
		.map(function (app) {
			const status = normalizeStatus(app.status);
			return `
				<a class="dash-recent-item" href="/admin-applications">
					<span class="dash-avatar">${escapeHtml(initials(app.full_name))}</span>
					<span class="dash-recent-main">
						<strong>${escapeHtml(app.full_name)}</strong>
						<span>${escapeHtml(app.position || app.job_title || "Applicant")}</span>
					</span>
					<span class="admin-status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span>
					<span class="dash-recent-time">${escapeHtml(timeAgo(app.created_at))}</span>
				</a>
			`;
		})
		.join("");
}

function renderRecentJobs(jobs) {
	elements.recentJobsLoading.classList.add("d-none");
	if (!jobs.length) {
		elements.recentJobs.innerHTML = '<div class="admin-empty">No jobs posted yet.</div>';
		return;
	}

	elements.recentJobs.innerHTML = jobs
		.slice(0, 5)
		.map(function (job) {
			const open = String(job.status || "Open") === "Open";
			return `
				<a class="dash-recent-item" href="/admin-jobs">
					<span class="dash-avatar"><i class="fal fa-briefcase" aria-hidden="true"></i></span>
					<span class="dash-recent-main">
						<strong>${escapeHtml(job.title)}</strong>
						<span>${escapeHtml(job.location || "")}${job.type ? " • " + escapeHtml(job.type) : ""}</span>
					</span>
					<span class="admin-status-pill ${open ? "approved" : "reject"}">${escapeHtml(job.status || "Open")}</span>
				</a>
			`;
		})
		.join("");
}

function renderStatusBreakdown(apps) {
	const counts = { New: 0, Reviewed: 0, Shortlisted: 0, Hired: 0, Rejected: 0 };
	apps.forEach(function (app) {
		counts[normalizeStatus(app.status)] += 1;
	});
	const total = apps.length || 1;

	elements.statusBreakdown.innerHTML = STATUS_ORDER.map(function (status) {
		const count = counts[status];
		const percent = Math.round((count / total) * 100);
		return `
			<div class="dash-bar-row">
				<div class="dash-bar-top"><span>${status}</span><span>${count}</span></div>
				<div class="dash-bar-track">
					<div class="dash-bar-fill ${status.toLowerCase()}" style="width:${percent}%"></div>
				</div>
			</div>
		`;
	}).join("");

	return counts;
}

async function loadDashboard() {
	clearMessage();

	const [jobs, apps, news, partners, proposals, projects, bids] = await Promise.all([
		fetchData("/api/jobs?admin=1"),
		fetchData("/api/applications?limit=100"),
		fetchData("/api/news"),
		fetchData("/api/partner-applications"),
		fetchData("/api/project-proposals"),
		fetchData("/api/bid-projects?admin=1"),
		fetchData("/api/bids"),
	]);

	// Primary stats
	const activeJobs = jobs.filter(function (job) {
		return String(job.status || "Open") === "Open";
	}).length;
	const newThisWeek = apps.filter(function (app) {
		return isWithinLastWeek(app.created_at);
	}).length;
	const unprocessed = apps.filter(function (app) {
		return normalizeStatus(app.status) === "New";
	}).length;

	elements.totalJobs.textContent = jobs.length;
	elements.activeJobs.textContent = activeJobs;
	elements.totalApps.textContent = apps.length;
	elements.newApps.textContent = unprocessed;
	elements.newTrend.textContent = "+" + newThisWeek + " this week";

	// Secondary stats
	elements.news.textContent = news.length;
	elements.partners.textContent = partners.length;
	elements.proposals.textContent = proposals.length;

	const counts = renderStatusBreakdown(apps);
	elements.hired.textContent = counts.Hired;

	const openProjects = projects.filter(function (p) {
		return String(p.status || "Open") === "Open";
	}).length;
	elements.projects.textContent = openProjects;
	elements.bids.textContent = bids.length;

	renderRecentApplications(apps);
	renderRecentJobs(jobs);
	stopLoading();
	loadSolutionStats();
}

/* Community Solutions counts (read pagination meta for accurate totals). */
async function loadSolutionStats() {
	async function total(query) {
		try {
			const response = await fetch(API_BASE_URL + "/api/solutions?admin=1&limit=1" + query, {
				headers: { Accept: "application/json", Authorization: "Bearer " + (localStorage.getItem("adminToken") || "") },
			});
			const result = await response.json();
			if (!response.ok || result.success === false) return 0;
			return (result.meta && result.meta.total_records) || 0;
		} catch (e) { return 0; }
	}
	const totalEl = document.getElementById("stat-solutions");
	const pendingEl = document.getElementById("stat-solutions-pending");
	if (totalEl) totalEl.textContent = await total("");
	if (pendingEl) pendingEl.textContent = await total("&moderation=pending");
}

elements.refresh.addEventListener("click", function () {
	elements.statCards.forEach(function (card) {
		card.classList.add("is-loading");
	});
	elements.recentAppsLoading.classList.remove("d-none");
	elements.recentJobsLoading.classList.remove("d-none");
	void loadDashboard();
});

elements.logout.addEventListener("click", function () {
	localStorage.removeItem("isAdminLoggedIn");
	window.location.href = "/admin-login";
});

loadDashboard();
