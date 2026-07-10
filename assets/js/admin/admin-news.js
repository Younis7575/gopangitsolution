const API_BASE_URL = "";

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
	window.location.replace("/admin-login");
}

const state = {
	news: [],
	editingNewsId: null,
	slugTouched: false,
};

const elements = {
	form: document.getElementById("news-form"),
	id: document.getElementById("news-id"),
	title: document.getElementById("news-title"),
	slug: document.getElementById("news-slug"),
	shortDescription: document.getElementById("news-short-description"),
	content: document.getElementById("news-content"),
	imageUrl: document.getElementById("news-image-url"),
	category: document.getElementById("news-category"),
	publishedAt: document.getElementById("news-published-at"),
	seoTitle: document.getElementById("news-seo-title"),
	metaDescription: document.getElementById("news-meta-description"),
	author: document.getElementById("news-author"),
	status: document.getElementById("news-status"),
	saveBtn: document.getElementById("save-news-btn"),
	resetBtn: document.getElementById("reset-news-form"),
	refreshBtn: document.getElementById("refresh-news"),
	logout: document.getElementById("admin-logout"),
	loading: document.getElementById("news-loading"),
	list: document.getElementById("news-list"),
	message: document.getElementById("global-message"),
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

function slugify(value) {
	return String(value || "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
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

function getNewsPayload() {
	return {
		title: elements.title.value.trim(),
		slug: elements.slug.value.trim(),
		short_description: elements.shortDescription.value.trim(),
		content: elements.content.value.trim(),
		image_url: elements.imageUrl.value.trim(),
		category: (elements.category && elements.category.value.trim()) || "technology",
		published_at: (elements.publishedAt && elements.publishedAt.value) || "",
		seo_title: (elements.seoTitle && elements.seoTitle.value.trim()) || "",
		meta_description: (elements.metaDescription && elements.metaDescription.value.trim()) || "",
		author: elements.author.value.trim(),
		status: elements.status.value,
	};
}

function toDateInput(value) {
	if (!value) {
		return "";
	}
	var d = new Date(String(value).replace(" ", "T"));
	if (isNaN(d.getTime())) {
		return "";
	}
	return d.toISOString().slice(0, 10);
}

function resetForm() {
	state.editingNewsId = null;
	state.slugTouched = false;
	elements.form.reset();
	elements.author.value = "Admin";
	elements.status.value = "published";
	if (elements.category) {
		elements.category.value = "technology";
	}
	elements.id.value = "";
	elements.saveBtn.textContent = "Add News";
	clearMessage();
}

function fillForm(item) {
	state.editingNewsId = item.id;
	state.slugTouched = true;
	elements.id.value = item.id;
	elements.title.value = item.title || "";
	elements.slug.value = item.slug || "";
	elements.shortDescription.value = item.short_description || "";
	elements.content.value = item.content || "";
	elements.imageUrl.value = item.image_url || "";
	if (elements.category) {
		elements.category.value = item.category || "technology";
	}
	if (elements.publishedAt) {
		elements.publishedAt.value = toDateInput(item.published_at);
	}
	if (elements.seoTitle) {
		elements.seoTitle.value = item.seo_title || "";
	}
	if (elements.metaDescription) {
		elements.metaDescription.value = item.meta_description || "";
	}
	elements.author.value = item.author || "Admin";
	elements.status.value = item.status || "published";
	elements.saveBtn.textContent = "Update News";
	window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderNews(items) {
	if (!Array.isArray(items) || items.length === 0) {
		elements.list.innerHTML = '<div class="admin-empty">No news found.</div>';
		return;
	}

	elements.list.innerHTML = items
		.map(function (item) {
			const status = item.status || "published";
			const imageUrl = item.image_url || "/assets/img/blog/p1.jpg";
			return `
				<article class="admin-job-card">
					<div class="admin-news-card-image" style="background-image: url('${escapeHtml(imageUrl)}')"></div>
					<span class="admin-news-status ${escapeHtml(status)}">${escapeHtml(status)}</span>
					<h3>${escapeHtml(item.title)}</h3>
					<div class="admin-job-meta">
						<span>${escapeHtml(item.slug)}</span>
						<span>${escapeHtml(item.author || "Admin")}</span>
						<span>${escapeHtml(item.created_at || "")}</span>
					</div>
					<p class="admin-job-description">${escapeHtml(item.short_description)}</p>
					<div class="admin-job-actions">
						<a class="admin-action-btn" href="/news-detail?slug=${encodeURIComponent(item.slug)}" target="_blank" rel="noopener noreferrer">View</a>
						<button type="button" class="admin-action-btn" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
						<button type="button" class="admin-action-btn danger" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>
					</div>
				</article>
			`;
		})
		.join("");
}

async function loadNews() {
	elements.loading.classList.remove("d-none");
	elements.loading.textContent = "Loading news...";

	try {
		const result = await fetchJson("/api/news", {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});
		state.news = result.data || [];
		renderNews(state.news);
	} catch (error) {
		elements.list.innerHTML = '<div class="admin-empty">' + escapeHtml(error.message) + "</div>";
	} finally {
		elements.loading.classList.add("d-none");
	}
}

async function saveNews(event) {
	event.preventDefault();
	clearMessage();

	const payload = getNewsPayload();
	const isEditing = Boolean(state.editingNewsId);
	const path = isEditing ? "/api/news/" + state.editingNewsId : "/api/news";
	const method = isEditing ? "PUT" : "POST";

	elements.saveBtn.disabled = true;
	elements.saveBtn.textContent = isEditing ? "Updating..." : "Adding...";

	try {
		const result = await fetchJson(path, {
			method,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		resetForm();
		showMessage("success", result.message || "News saved successfully.");
		await loadNews();
	} catch (error) {
		showMessage("error", error.message || "Unable to save news.");
	} finally {
		elements.saveBtn.disabled = false;
		elements.saveBtn.textContent = state.editingNewsId ? "Update News" : "Add News";
	}
}

async function deleteNews(newsId) {
	if (!window.confirm("Delete this news item? This action cannot be undone.")) {
		return;
	}

	clearMessage();

	try {
		const result = await fetchJson("/api/news/" + newsId, {
			method: "DELETE",
			headers: {
				Accept: "application/json",
			},
		});
		showMessage("success", result.message || "News deleted successfully.");
		await loadNews();
	} catch (error) {
		showMessage("error", error.message || "Unable to delete news.");
	}
}

elements.title.addEventListener("input", function () {
	if (!state.slugTouched) {
		elements.slug.value = slugify(elements.title.value);
	}
});

elements.slug.addEventListener("input", function () {
	state.slugTouched = true;
	elements.slug.value = slugify(elements.slug.value);
});

elements.form.addEventListener("submit", saveNews);
elements.resetBtn.addEventListener("click", resetForm);
elements.refreshBtn.addEventListener("click", loadNews);
elements.logout.addEventListener("click", function () {
	localStorage.clear();
	window.location.href = "/admin-login";
});

elements.list.addEventListener("click", function (event) {
	const button = event.target.closest("button[data-action]");
	if (!button) {
		return;
	}

	const newsId = Number(button.getAttribute("data-id"));
	const action = button.getAttribute("data-action");

	if (action === "edit") {
		const item = state.news.find(function (newsItem) {
			return Number(newsItem.id) === newsId;
		});

		if (item) {
			fillForm(item);
		}
	}

	if (action === "delete") {
		void deleteNews(newsId);
	}
});

/* ------------------------------------------------------------------ */
/* External Technology News (NewsAPI) admin panel                      */
/* ------------------------------------------------------------------ */
var extEls = {
	statusCards: document.getElementById("ext-status-cards"),
	refresh: document.getElementById("ext-refresh"),
	settingsForm: document.getElementById("ext-settings-form"),
	enabled: document.getElementById("ext-enabled"),
	pageSize: document.getElementById("ext-page-size"),
	cacheMinutes: document.getElementById("ext-cache-minutes"),
	saveBtn: document.getElementById("ext-save-settings"),
	latestList: document.getElementById("ext-latest-list"),
};

var EXT_STATUS_META = {
	ok: { label: "Connected", cls: "ok" },
	disabled: { label: "Disabled", cls: "warn" },
	no_key: { label: "API key missing", cls: "warn" },
	error: { label: "Unavailable", cls: "error" },
};

function formatDateTime(value) {
	if (!value) {
		return "Never";
	}
	var d = new Date(value);
	if (isNaN(d.getTime())) {
		return "Never";
	}
	return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function renderExternalStatus(data) {
	if (!extEls.statusCards) {
		return;
	}
	var meta = EXT_STATUS_META[data.status] || EXT_STATUS_META.error;
	extEls.statusCards.innerHTML =
		'<div class="gis-ext-stat ' + meta.cls + '"><span>Connection</span><strong>' + escapeHtml(meta.label) + "</strong></div>" +
		'<div class="gis-ext-stat"><span>Last synced</span><strong>' + escapeHtml(formatDateTime(data.lastSyncedAt)) + "</strong></div>" +
		'<div class="gis-ext-stat"><span>Cached articles</span><strong>' + escapeHtml(String(data.articleCount || 0)) + "</strong></div>" +
		'<div class="gis-ext-stat"><span>Serving from cache</span><strong>' + (data.cached ? "Yes" : "No") + "</strong></div>";

	if (extEls.enabled) {
		extEls.enabled.value = data.enabled ? "true" : "false";
	}
	if (extEls.pageSize && data.pageSize) {
		extEls.pageSize.value = data.pageSize;
	}
	if (extEls.cacheMinutes && data.cacheMinutes) {
		extEls.cacheMinutes.value = data.cacheMinutes;
	}

	if (extEls.latestList) {
		var articles = Array.isArray(data.latestArticles) ? data.latestArticles : [];
		if (articles.length === 0) {
			extEls.latestList.innerHTML = data.status === "ok"
				? "No articles cached yet. Try Refresh Cache."
				: "External news is not available right now.";
		} else {
			extEls.latestList.innerHTML =
				'<ul class="gis-ext-latest-ul">' +
				articles
					.map(function (a) {
						return (
							'<li><a href="' + escapeHtml(a.originalUrl || "#") + '" target="_blank" rel="noopener noreferrer nofollow">' +
							escapeHtml(a.title) + "</a><small>" + escapeHtml(a.sourceName || "") + "</small></li>"
						);
					})
					.join("") +
				"</ul>";
		}
	}
}

async function loadExternalStatus() {
	if (!extEls.statusCards) {
		return;
	}
	try {
		var result = await fetchJson("/api/news/external/status", {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		renderExternalStatus(result.data || {});
	} catch (error) {
		extEls.statusCards.innerHTML = '<div class="gis-ext-stat error"><span>Connection</span><strong>' + escapeHtml(error.message) + "</strong></div>";
	}
}

async function refreshExternal() {
	if (!extEls.refresh) {
		return;
	}
	extEls.refresh.disabled = true;
	extEls.refresh.textContent = "Refreshing...";
	try {
		var result = await fetchJson("/api/news/external/refresh", {
			method: "POST",
			headers: { Accept: "application/json" },
		});
		renderExternalStatus(result.data || {});
		showMessage("success", result.message || "External news refreshed.");
	} catch (error) {
		showMessage("error", error.message || "Unable to refresh external news.");
	} finally {
		extEls.refresh.disabled = false;
		extEls.refresh.textContent = "Refresh Cache";
	}
}

async function saveExternalSettings(event) {
	event.preventDefault();
	if (!extEls.saveBtn) {
		return;
	}
	extEls.saveBtn.disabled = true;
	extEls.saveBtn.textContent = "Saving...";
	try {
		var payload = {
			enabled: extEls.enabled.value === "true",
			pageSize: Number(extEls.pageSize.value) || 20,
			cacheMinutes: Number(extEls.cacheMinutes.value) || 30,
		};
		var result = await fetchJson("/api/news/external/settings", {
			method: "POST",
			headers: { Accept: "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		renderExternalStatus(result.data || {});
		showMessage("success", result.message || "External settings saved.");
	} catch (error) {
		showMessage("error", error.message || "Unable to save external settings.");
	} finally {
		extEls.saveBtn.disabled = false;
		extEls.saveBtn.textContent = "Save External Settings";
	}
}

if (extEls.refresh) {
	extEls.refresh.addEventListener("click", refreshExternal);
}
if (extEls.settingsForm) {
	extEls.settingsForm.addEventListener("submit", saveExternalSettings);
}

loadNews();
loadExternalStatus();
