const API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";

const state = {
    page: 1,
    limit: 10,
    category: "",
    status: "",
    sort: "newest",
    search: "",
    tag: "",
    total: 0,
};

const elements = {
    search: document.getElementById("solutions-search-input"),
    category: document.getElementById("solutions-category-filter"),
    status: document.getElementById("solutions-status-filter"),
    sort: document.getElementById("solutions-sort"),
    list: document.getElementById("solutions-list"),
    pageSummary: document.getElementById("solutions-page-summary"),
    prev: document.getElementById("solutions-prev"),
    next: document.getElementById("solutions-next"),
    message: document.getElementById("solutions-message"),
    popularTags: document.getElementById("solutions-popular-tags"),
    featuredList: document.getElementById("solutions-featured"),
    trendingList: document.getElementById("solutions-trending"),
};

function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, function (char) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[char];
    });
}

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function showMessage(text, type = "info") {
    elements.message.className = "solutions-alert " + (type === "error" ? "solutions-alert-error" : "solutions-alert-success");
    elements.message.textContent = text;
    elements.message.classList.remove("d-none");
}

function clearMessage() {
    elements.message.className = "solutions-alert d-none";
    elements.message.textContent = "";
}

function buildUrl() {
    const params = new URLSearchParams();
    params.set("page", state.page);
    params.set("limit", state.limit);
    if (state.category) params.set("category", state.category);
    if (state.status) params.set("status", state.status);
    if (state.sort) params.set("sort", state.sort);
    if (state.search) params.set("search", state.search);
    if (state.tag) params.set("tag", state.tag);
    return "/api/solutions?" + params.toString();
}

async function fetchJson(path) {
    const response = await fetch(API_BASE_URL + path, {
        headers: {
            Accept: "application/json",
        },
    });
    const json = await response.json();
    if (!response.ok || json.success === false) {
        throw new Error(json.message || "Unable to load data.");
    }
    return json;
}

function renderTags(tags) {
    return tags
        .map(function (tag) {
            return `<a href="/solutions?tag=${encodeURIComponent(tag.slug)}" class="solutions-chip">${escapeHtml(tag.name)}</a>`;
        })
        .join("");
}

function renderQuestion(item) {
    const solved = String(item.solved_status || "unsolved") === "solved";
    const featured = item.is_featured ? "solutions-badge solutions-badge-featured" : "";
    const pinned = item.is_pinned ? "solutions-badge solutions-badge-pinned" : "";
    const isAdmin = String(item.source || "") === "admin";
    const hasAccepted = Number(item.accepted_comment_id) > 0;
    return `
        <article class="solutions-card">
            <div class="solutions-card-header">
                <div>
                    <span class="solutions-category">${escapeHtml(item.category_name || "General")}</span>
                    ${featured ? `<span class="solutions-badge solutions-badge-featured">Featured</span>` : ""}
                    ${pinned ? `<span class="solutions-badge solutions-badge-pinned">Pinned</span>` : ""}
                    ${isAdmin ? `<span class="solutions-badge solutions-badge--admin">Admin Posted</span>` : ""}
                    ${hasAccepted ? `<span class="solutions-badge solutions-badge--accepted">Accepted Solution</span>` : ""}
                </div>
                <span class="solutions-status ${solved ? "solved" : "unsolved"}">${solved ? "Solved" : "Unsolved"}</span>
            </div>
            <h2><a href="/solutions/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></h2>
            <p>${escapeHtml(item.short_description || item.description || "No description available.").slice(0, 220)}${item.short_description && item.short_description.length > 220 ? "..." : ""}</p>
            <div class="solutions-meta">
                <span><strong>${escapeHtml(item.visitor_name || item.author || "Anonymous")}</strong></span>
                <span>${escapeHtml(formatDate(item.created_at))}</span>
                <span>${escapeHtml(item.views_count || 0)} views</span>
                <span>${escapeHtml(item.comments_count || 0)} answers</span>
            </div>
            <div class="solutions-card-tags">
                ${item.tags ? renderTags(item.tags) : ""}
            </div>
        </article>
    `;
}

function renderSkeletons() {
    return Array.from({ length: state.limit }, () => `
        <article class="solutions-card solutions-card-skeleton">
            <div class="solutions-card-header"><div class="skeleton-line skeleton-short"></div><div class="skeleton-pill"></div></div>
            <div class="skeleton-title"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text"></div>
            <div class="solutions-card-tags"><span class="skeleton-chip"></span><span class="skeleton-chip"></span></div>
        </article>
    `).join("");
}

async function loadCategories() {
    try {
        const result = await fetchJson("/api/solutions/categories");
        const categories = Array.isArray(result.data) ? result.data : [];
        elements.category.innerHTML = '<option value="">All categories</option>' + categories.map(function (category) {
            return `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`;
        }).join("");
    } catch (error) {
        console.warn(error);
    }
}

async function loadTags() {
    try {
        const result = await fetchJson("/api/solutions/tags");
        const tags = Array.isArray(result.data) ? result.data : [];
        elements.popularTags.innerHTML = tags.slice(0, 12).map(function (tag) {
            return `<button type="button" class="solutions-chip" data-tag="${escapeHtml(tag.slug)}">${escapeHtml(tag.name)}</button>`;
        }).join("");
    } catch (error) {
        elements.popularTags.innerHTML = "<div class='solutions-empty'>Unable to load tags.</div>";
    }
}

async function loadFeaturedAndTrending() {
    try {
        const result = await fetchJson("/api/solutions?limit=5&sort=newest");
        const items = Array.isArray(result.data) ? result.data : [];
        elements.featuredList.innerHTML = items.filter(function (item) {
            return item.is_featured || item.is_pinned;
        }).slice(0, 4).map(function (item) {
            return `<a class="solutions-small-item" href="/solutions/${encodeURIComponent(item.slug)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.category_name || "General")}</span></a>`;
        }).join("");

        if (!elements.featuredList.innerHTML) {
            elements.featuredList.innerHTML = "<div class='solutions-empty'>No featured questions yet.</div>";
        }

        elements.trendingList.innerHTML = items.slice(0, 4).map(function (item) {
            return `<a class="solutions-small-item" href="/solutions/${encodeURIComponent(item.slug)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.comments_count || 0)} answers</span></a>`;
        }).join("");
    } catch (error) {
        elements.featuredList.innerHTML = "<div class='solutions-empty'>Unable to load featured questions.</div>";
        elements.trendingList.innerHTML = "<div class='solutions-empty'>Unable to load trending questions.</div>";
    }
}

function getQueryValues() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("category")) state.category = params.get("category");
    if (params.has("status")) state.status = params.get("status");
    if (params.has("sort")) state.sort = params.get("sort");
    if (params.has("search")) state.search = params.get("search");
    if (params.has("page")) state.page = Math.max(1, Number(params.get("page")) || 1);
    if (params.has("tag")) state.tag = params.get("tag");
}

function syncUI() {
    elements.search.value = state.search;
    elements.category.value = state.category;
    elements.status.value = state.status;
    elements.sort.value = state.sort;
}

async function loadSolutions() {
    clearMessage();
    elements.list.innerHTML = renderSkeletons();

    try {
        const result = await fetchJson(buildUrl());
        const items = Array.isArray(result.data) ? result.data : [];
        state.total = result.meta ? result.meta.total_records : items.length;
        elements.list.innerHTML = items.length ? items.map(renderQuestion).join("") : '<div class="solutions-empty"><h3>No matching questions found.</h3><p>Try changing your filters or submit a new query.</p></div>';
        elements.pageSummary.textContent = `Page ${state.page} of ${result.meta ? result.meta.total_pages : 1}`;
        elements.prev.disabled = state.page <= 1;
        elements.next.disabled = !result.meta || state.page >= result.meta.total_pages;
    } catch (error) {
        elements.list.innerHTML = `<div class="solutions-empty"><h3>Unable to load questions.</h3><p>${escapeHtml(error.message)}</p><button id="solutions-retry" class="theme-btn-outline">Retry</button></div>`;
    }
}

function updateUrl() {
    const params = new URLSearchParams();
    if (state.search) params.set("search", state.search);
    if (state.tag) params.set("tag", state.tag);
    if (state.category) params.set("category", state.category);
    if (state.status) params.set("status", state.status);
    if (state.sort) params.set("sort", state.sort);
    if (state.page > 1) params.set("page", state.page);
    const url = window.location.pathname + "?" + params.toString();
    window.history.replaceState({}, "", url);
}

function initEvents() {
    elements.search.addEventListener("input", function () {
        state.search = this.value.trim();
        state.page = 1;
        updateUrl();
        debounce(loadSolutions, 400)();
    });

    elements.category.addEventListener("change", function () {
        state.category = this.value;
        state.page = 1;
        updateUrl();
        loadSolutions();
    });

    elements.status.addEventListener("change", function () {
        state.status = this.value;
        state.page = 1;
        updateUrl();
        loadSolutions();
    });

    elements.sort.addEventListener("change", function () {
        state.sort = this.value;
        state.page = 1;
        updateUrl();
        loadSolutions();
    });

    elements.prev.addEventListener("click", function () {
        if (state.page <= 1) return;
        state.page -= 1;
        updateUrl();
        loadSolutions();
    });

    elements.next.addEventListener("click", function () {
        state.page += 1;
        updateUrl();
        loadSolutions();
    });

    elements.popularTags.addEventListener("click", function (event) {
        const button = event.target.closest("button[data-tag]");
        if (!button) return;
        state.tag = button.dataset.tag;
        state.page = 1;
        syncUI();
        updateUrl();
        loadSolutions();
    });

    elements.list.addEventListener("click", function (event) {
        const retry = event.target.closest("#solutions-retry");
        if (retry) {
            loadSolutions();
        }
    });
}

function debounce(fn, delay) {
    let timeout;
    return function () {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, arguments), delay);
    };
}

function init() {
    getQueryValues();
    syncUI();
    loadCategories();
    loadTags();
    loadFeaturedAndTrending();
    initEvents();
    loadSolutions();
}

init();
