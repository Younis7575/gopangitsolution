/**
 * Admin — Solutions Management (questions, answers/comments, categories, tags).
 * Mirrors the existing admin CRUD pattern (admin-projects.js / admin-applications.js).
 */
const API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
    window.location.replace("/admin-login");
}

const PAGE_SIZE = 10;
const state = {
    questions: [],
    qPage: 1,
    qMeta: null,
    editingQuestionId: null,
    categories: [],
    comments: [],
    cFiltered: [],
    cPage: 1,
    editingCommentId: null,
};

/* ------------------------------- helpers ------------------------------- */
function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>'"]/g, function (char) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
}

function adminHeaders(extra) {
    return Object.assign({ Authorization: "Bearer " + (localStorage.getItem("adminToken") || "") }, extra || {});
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
    const result = contentType.includes("application/json") ? await response.json() : { success: false, message: await response.text() };
    if (!response.ok || result.success === false) {
        throw new Error(result.message || "Request failed. Please try again.");
    }
    return result;
}

function showMessage(type, text) {
    const el = document.getElementById("global-message");
    if (!el) return;
    el.className = "admin-alert " + (type === "error" ? "error" : "success");
    el.textContent = text;
    window.clearTimeout(showMessage._t);
    showMessage._t = window.setTimeout(clearMessage, 5000);
}
function clearMessage() {
    const el = document.getElementById("global-message");
    if (el) { el.className = "admin-alert d-none"; el.textContent = ""; }
}

function formatDate(value) {
    if (!value) return "";
    const d = new Date(String(value).replace(" ", "T"));
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function statusPill(status) {
    return '<span class="admin-status-pill ' + String(status || "").toLowerCase().replace(/\s+/g, "-") + '">' + escapeHtml(status || "") + "</span>";
}

function el(id) { return document.getElementById(id); }

/* ------------------------------- tabs ---------------------------------- */
document.querySelectorAll(".admin-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
        const tab = btn.getAttribute("data-tab");
        document.querySelectorAll(".admin-tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
        document.querySelectorAll(".admin-tab-panel").forEach(function (p) {
            p.classList.toggle("d-none", p.getAttribute("data-tab-panel") !== tab);
        });
        if (tab === "comments" && !state.comments.length) loadComments();
        if (tab === "taxonomy" && !state.categories.length) { /* categories load on boot */ loadTaxonomy(); }
    });
});

/* ------------------------------ modals --------------------------------- */
function openModal(id) { el(id).classList.remove("d-none"); document.body.classList.add("admin-modal-open"); }
function closeModal(id) { el(id).classList.add("d-none"); document.body.classList.remove("admin-modal-open"); }
document.addEventListener("click", function (e) {
    if (e.target.closest("[data-close-modal]")) {
        closeModal("question-modal");
        closeModal("comment-modal");
    }
});

/* ========================= CATEGORIES / TAGS ========================== */
async function loadCategories() {
    try {
        const result = await fetchJson("/api/solutions/categories/all");
        state.categories = result.data || [];
    } catch (e) {
        /* fall back to public active categories */
        try { const r = await fetchJson("/api/solutions/categories"); state.categories = r.data || []; } catch (e2) { state.categories = []; }
    }
    populateCategorySelects();
}

function populateCategorySelects() {
    const formSel = el("q-category");
    const filterSel = el("q-filter-category");
    if (formSel) {
        formSel.innerHTML = '<option value="">Select category</option>' + state.categories.map(function (c) {
            return '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>";
        }).join("");
    }
    if (filterSel) {
        filterSel.innerHTML = '<option value="">All categories</option>' + state.categories.map(function (c) {
            return '<option value="' + escapeHtml(c.slug) + '">' + escapeHtml(c.name) + "</option>";
        }).join("");
    }
}

function renderCategoriesTable() {
    const tbody = el("categories-table");
    if (!tbody) return;
    if (!state.categories.length) { tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No categories.</td></tr>'; return; }
    tbody.innerHTML = state.categories.map(function (c) {
        return "<tr>" +
            "<td>" + escapeHtml(c.name) + "</td>" +
            "<td>" + escapeHtml(c.slug) + "</td>" +
            "<td>" + escapeHtml(c.sort_order != null ? c.sort_order : 0) + "</td>" +
            "<td>" + (Number(c.is_active) ? "Yes" : "No") + "</td>" +
            '<td><button class="admin-action-btn" data-cat-edit="' + c.id + '">Edit</button> ' +
            '<button class="admin-action-btn danger" data-cat-del="' + c.id + '">Delete</button></td>' +
            "</tr>";
    }).join("");
}

async function loadTags() {
    try {
        const result = await fetchJson("/api/solutions/tags");
        const tbody = el("tags-table");
        const tags = result.data || [];
        if (!tbody) return;
        tbody.innerHTML = tags.length ? tags.map(function (t) {
            return "<tr><td>" + escapeHtml(t.name) + "</td><td>" + escapeHtml(t.slug) + "</td><td>" + Number(t.usage_count || 0) + "</td>" +
                '<td><button class="admin-action-btn danger" data-tag-del="' + t.id + '">Delete</button></td></tr>';
        }).join("") : '<tr><td colspan="4" class="admin-empty">No tags.</td></tr>';
    } catch (e) { showMessage("error", e.message); }
}

function loadTaxonomy() { renderCategoriesTable(); loadTags(); }

/* Category form */
const categoryForm = el("category-form");
if (categoryForm) {
    categoryForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const id = el("category-id").value;
        const payload = {
            name: el("cat-name").value.trim(),
            sort_order: Number(el("cat-sort").value || 0),
            is_active: Number(el("cat-active").value),
            description: el("cat-description").value.trim(),
        };
        if (!payload.name) { showMessage("error", "Category name is required."); return; }
        try {
            const path = id ? "/api/solutions/categories/" + id : "/api/solutions/categories";
            await fetchJson(path, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            showMessage("success", id ? "Category updated." : "Category created.");
            resetCategoryForm();
            await loadCategories();
            renderCategoriesTable();
        } catch (err) { showMessage("error", err.message); }
    });
}
function resetCategoryForm() {
    categoryForm.reset();
    el("category-id").value = "";
    el("category-form-title").textContent = "Add Category";
    el("save-category-btn").textContent = "Add Category";
}
const resetCatBtn = el("reset-category-form");
if (resetCatBtn) resetCatBtn.addEventListener("click", resetCategoryForm);

/* Tag form */
const tagForm = el("tag-form");
if (tagForm) {
    tagForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const name = el("tag-name").value.trim();
        if (!name) return;
        try {
            await fetchJson("/api/solutions/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) });
            showMessage("success", "Tag created.");
            tagForm.reset();
            loadTags();
        } catch (err) { showMessage("error", err.message); }
    });
}

/* delegated actions for taxonomy tables */
document.addEventListener("click", async function (e) {
    const catEdit = e.target.closest("[data-cat-edit]");
    const catDel = e.target.closest("[data-cat-del]");
    const tagDel = e.target.closest("[data-tag-del]");
    if (catEdit) {
        const cat = state.categories.find(function (c) { return String(c.id) === catEdit.getAttribute("data-cat-edit"); });
        if (!cat) return;
        el("category-id").value = cat.id;
        el("cat-name").value = cat.name;
        el("cat-sort").value = cat.sort_order != null ? cat.sort_order : 0;
        el("cat-active").value = Number(cat.is_active) ? "1" : "0";
        el("cat-description").value = cat.description || "";
        el("category-form-title").textContent = "Edit Category";
        el("save-category-btn").textContent = "Update Category";
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (catDel) {
        if (!window.confirm("Delete this category? Categories with questions cannot be deleted.")) return;
        try { await fetchJson("/api/solutions/categories/" + catDel.getAttribute("data-cat-del"), { method: "DELETE" }); showMessage("success", "Category deleted."); await loadCategories(); renderCategoriesTable(); }
        catch (err) { showMessage("error", err.message); }
    }
    if (tagDel) {
        if (!window.confirm("Delete this tag?")) return;
        try { await fetchJson("/api/solutions/tags/" + tagDel.getAttribute("data-tag-del"), { method: "DELETE" }); showMessage("success", "Tag deleted."); loadTags(); }
        catch (err) { showMessage("error", err.message); }
    }
});

/* ============================== QUESTIONS ============================== */
function questionFilters() {
    const params = new URLSearchParams();
    params.set("admin", "1");
    params.set("page", state.qPage);
    params.set("limit", PAGE_SIZE);
    const search = el("q-search").value.trim();
    if (search) params.set("search", search);
    const statusSel = el("q-status").value;
    if (statusSel === "deleted") params.set("deleted", "1");
    else if (statusSel) params.set("moderation", statusSel);
    const solved = el("q-filter-solved").value;
    if (solved) params.set("status", solved);
    const cat = el("q-filter-category").value;
    if (cat) params.set("category", cat);
    params.set("sort", "newest");
    return params.toString();
}

async function loadQuestions() {
    el("questions-loading").classList.remove("d-none");
    try {
        const result = await fetchJson("/api/solutions?" + questionFilters());
        state.questions = result.data || [];
        state.qMeta = result.meta || null;
        renderQuestions();
    } catch (e) {
        showMessage("error", e.message);
        el("questions-table").innerHTML = '<tr><td colspan="9" class="admin-empty">Unable to load. <button class="admin-action-btn" id="q-retry">Retry</button></td></tr>';
        const r = el("q-retry"); if (r) r.addEventListener("click", loadQuestions);
    } finally {
        el("questions-loading").classList.add("d-none");
    }
}

function renderQuestions() {
    const tbody = el("questions-table");
    if (!state.questions.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="admin-empty">No questions match your filters.</td></tr>';
    } else {
        tbody.innerHTML = state.questions.map(function (q) {
            return "<tr>" +
                "<td><strong>" + escapeHtml(q.title) + "</strong></td>" +
                "<td>" + escapeHtml(q.category_name || "") + "</td>" +
                "<td>" + escapeHtml(q.visitor_name || "") + "</td>" +
                "<td>" + (String(q.source) === "admin" ? '<span class="admin-status-pill approved">Admin</span>' : "Visitor") + "</td>" +
                "<td>" + statusPill(q.status) + "</td>" +
                "<td>" + (String(q.solved_status) === "solved" ? '<span class="admin-status-pill hired">Solved</span>' : "Open") + "</td>" +
                "<td>" + Number(q.comments_count || 0) + "</td>" +
                "<td>" + Number(q.views_count || 0) + "</td>" +
                '<td><button class="admin-action-btn" data-q-view="' + q.id + '">Manage</button></td>' +
                "</tr>";
        }).join("");
    }
    const meta = state.qMeta || { current_page: 1, total_pages: 1, total_records: state.questions.length };
    el("q-page-summary").textContent = "Page " + meta.current_page + " of " + meta.total_pages + " • " + meta.total_records + " total";
    el("q-prev").disabled = meta.current_page <= 1;
    el("q-next").disabled = meta.current_page >= meta.total_pages;
}

async function openQuestion(id) {
    try {
        const result = await fetchJson("/api/solutions/" + id);
        const q = result.data;
        state.currentQuestion = q;
        el("question-modal-title").textContent = q.title;
        const rows = [
            ["Author", (q.visitor_name || "") + " (" + (q.visitor_email || "n/a") + ")"],
            ["Category", q.category_name || ""],
            ["Status", q.status],
            ["Solved", q.solved_status],
            ["Source", q.source],
            ["Views", q.views_count],
            ["Answers", q.comments_count],
            ["Created", formatDate(q.created_at)],
            ["Published", q.published_at ? formatDate(q.published_at) : "—"],
        ];
        let html = rows.map(function (r) {
            return '<div class="admin-detail-item"><span>' + escapeHtml(r[0]) + "</span><strong>" + escapeHtml(r[1]) + "</strong></div>";
        }).join("");
        html += '<div class="admin-detail-item admin-detail-wide"><span>Description</span><p>' + escapeHtml(q.description || "") + "</p></div>";
        if (q.code_snippet) html += '<div class="admin-detail-item admin-detail-wide"><span>Code</span><pre>' + escapeHtml(q.code_snippet) + "</pre></div>";
        el("question-detail").innerHTML = html;

        el("question-modal-actions").innerHTML = questionActionButtons(q);
        el("question-comments").innerHTML = '<p class="admin-loading">Loading answers...</p>';
        openModal("question-modal");
        loadQuestionComments(q.id);
    } catch (e) { showMessage("error", e.message); }
}

function questionActionButtons(q) {
    const btns = [];
    if (q.status !== "approved") btns.push('<button class="admin-action-btn" data-q-status="approved" data-id="' + q.id + '">Approve / Publish</button>');
    if (q.status !== "pending") btns.push('<button class="admin-action-btn" data-q-status="pending" data-id="' + q.id + '">Set Pending</button>');
    if (q.status !== "rejected") btns.push('<button class="admin-action-btn" data-q-status="rejected" data-id="' + q.id + '">Reject</button>');
    if (String(q.solved_status) === "solved") btns.push('<button class="admin-action-btn" data-q-solved="unsolved" data-id="' + q.id + '">Reopen (Unsolved)</button>');
    else btns.push('<button class="admin-action-btn" data-q-solved="solved" data-id="' + q.id + '">Mark Solved</button>');
    btns.push('<button class="admin-action-btn" data-q-flag="is_featured" data-val="' + (Number(q.is_featured) ? 0 : 1) + '" data-id="' + q.id + '">' + (Number(q.is_featured) ? "Unfeature" : "Feature") + "</button>");
    btns.push('<button class="admin-action-btn" data-q-flag="allow_comments" data-val="' + (Number(q.allow_comments) ? 0 : 1) + '" data-id="' + q.id + '">' + (Number(q.allow_comments) ? "Disable Comments" : "Enable Comments") + "</button>");
    btns.push('<button class="admin-action-btn" data-q-edit="' + q.id + '">Edit</button>');
    if (q.deleted_at) {
        btns.push('<button class="admin-action-btn" data-q-restore="' + q.id + '">Restore</button>');
        btns.push('<button class="admin-action-btn danger" data-q-perma="' + q.id + '">Delete Permanently</button>');
    } else {
        btns.push('<button class="admin-action-btn danger" data-q-delete="' + q.id + '">Delete</button>');
    }
    return btns.join(" ");
}

async function loadQuestionComments(questionId) {
    try {
        const result = await fetchJson("/api/solutions/comments?question_id=" + questionId);
        const comments = result.data || [];
        const box = el("question-comments");
        if (!comments.length) { box.innerHTML = '<h3 class="admin-modal-comments-title">Answers</h3><p class="admin-empty">No answers yet.</p>'; return; }
        box.innerHTML = '<h3 class="admin-modal-comments-title">Answers (' + comments.length + ")</h3>" + comments.map(function (c) {
            return '<div class="admin-inline-comment">' +
                "<div><strong>" + escapeHtml(c.visitor_name) + "</strong> " + statusPill(c.status) +
                (Number(c.is_accepted_solution) ? ' <span class="admin-status-pill hired">Accepted</span>' : "") + "</div>" +
                "<p>" + escapeHtml(c.comment) + "</p>" +
                '<div class="admin-inline-comment-actions">' +
                (c.status !== "approved" ? '<button class="admin-action-btn" data-c-status="approved" data-id="' + c.id + '" data-q="' + questionId + '">Approve</button> ' : "") +
                (Number(c.is_accepted_solution) ? '<button class="admin-action-btn" data-c-unaccept="' + c.id + '" data-q="' + questionId + '">Remove Accepted</button> '
                    : (c.status === "approved" ? '<button class="admin-action-btn" data-c-accept="' + c.id + '" data-q="' + questionId + '">Accept</button> ' : "")) +
                '<button class="admin-action-btn danger" data-c-del="' + c.id + '" data-q="' + questionId + '">Delete</button>' +
                "</div></div>";
        }).join("");
    } catch (e) { el("question-comments").innerHTML = '<p class="admin-empty">Unable to load answers.</p>'; }
}

/* Question create/edit form */
const questionForm = el("question-form");
if (questionForm) {
    questionForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const id = el("question-id").value;
        const btn = el("save-question-btn");
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = id ? "Updating..." : "Adding...";
        try {
            if (id) {
                const payload = {
                    title: el("q-title").value.trim(),
                    description: el("q-description").value.trim(),
                    category_id: Number(el("q-category").value),
                    visitor_name: el("q-author").value.trim(),
                    visitor_email: el("q-email").value.trim(),
                    technologies: el("q-technologies").value.trim(),
                    expected_result: el("q-expected").value.trim(),
                    actual_result: el("q-actual").value.trim(),
                    error_message: el("q-error").value.trim(),
                    code_snippet: el("q-code").value.trim(),
                    tags: el("q-tags").value.trim(),
                };
                await fetchJson("/api/solutions/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                showMessage("success", "Question updated.");
            } else {
                const fd = new FormData();
                fd.append("admin", "1");
                fd.append("title", el("q-title").value.trim());
                fd.append("description", el("q-description").value.trim());
                fd.append("category_id", el("q-category").value);
                fd.append("visitor_name", el("q-author").value.trim());
                fd.append("visitor_email", el("q-email").value.trim());
                fd.append("technologies", el("q-technologies").value.trim());
                fd.append("expected_result", el("q-expected").value.trim());
                fd.append("actual_result", el("q-actual").value.trim());
                fd.append("error_message", el("q-error").value.trim());
                fd.append("code_snippet", el("q-code").value.trim());
                fd.append("tags", el("q-tags").value.trim());
                const created = await fetchJson("/api/solutions?admin=1", { method: "POST", body: fd });
                const createdStatus = created.data && created.data.status;
                if (createdStatus === "approved") {
                    showMessage("success", "Question published and is now live on the site.");
                } else {
                    /* Old backend (or non-admin mode) saved it as pending — tell the truth. */
                    showMessage("error", "Saved as \"" + (createdStatus || "pending") + "\". It will NOT appear on the site until approved. Open it below and click \"Approve / Publish\" (and re-deploy api/index.php so admin posts publish automatically).");
                }
            }
            resetQuestionForm();
            loadQuestions();
        } catch (err) { showMessage("error", err.message); }
        finally { btn.disabled = false; btn.textContent = original; }
    });
}
function resetQuestionForm() {
    questionForm.reset();
    el("question-id").value = "";
    el("q-author").value = "Gopang Team";
    el("q-email").value = "info@gopangitsolution.com";
    el("question-form-title").textContent = "Add a Question";
    el("save-question-btn").textContent = "Add Question";
}
const resetQBtn = el("reset-question-form");
if (resetQBtn) resetQBtn.addEventListener("click", resetQuestionForm);

function fillQuestionForm(q) {
    el("question-id").value = q.id;
    el("q-title").value = q.title || "";
    el("q-description").value = q.description || "";
    el("q-category").value = q.category_id || "";
    el("q-author").value = q.visitor_name || "";
    el("q-email").value = q.visitor_email || "";
    el("q-technologies").value = q.technologies || "";
    el("q-expected").value = q.expected_result || "";
    el("q-actual").value = q.actual_result || "";
    el("q-error").value = q.error_message || "";
    el("q-code").value = q.code_snippet || "";
    el("q-tags").value = (q.tags || []).map(function (t) { return t.name; }).join(", ");
    el("question-form-title").textContent = "Edit Question";
    el("save-question-btn").textContent = "Update Question";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* Delegated question actions */
document.addEventListener("click", async function (e) {
    const view = e.target.closest("[data-q-view]");
    if (view) { openQuestion(view.getAttribute("data-q-view")); return; }

    const edit = e.target.closest("[data-q-edit]");
    if (edit) { fillQuestionForm(state.currentQuestion); closeModal("question-modal"); return; }

    const st = e.target.closest("[data-q-status]");
    if (st) return doQuestionAction(st.getAttribute("data-id"), "PATCH", "?status=" + st.getAttribute("data-q-status"), "Status updated.");
    const sv = e.target.closest("[data-q-solved]");
    if (sv) return doQuestionAction(sv.getAttribute("data-id"), "PATCH", "?solved_status=" + sv.getAttribute("data-q-solved"), "Solved status updated.");
    const fl = e.target.closest("[data-q-flag]");
    if (fl) return doQuestionAction(fl.getAttribute("data-id"), "PATCH", "?" + fl.getAttribute("data-q-flag") + "=" + fl.getAttribute("data-val"), "Question updated.");
    const rs = e.target.closest("[data-q-restore]");
    if (rs) return doQuestionAction(rs.getAttribute("data-q-restore"), "POST", "/restore", "Question restored.");
    const dl = e.target.closest("[data-q-delete]");
    if (dl) { if (!window.confirm("Soft-delete this question? It can be restored later.")) return; return doQuestionAction(dl.getAttribute("data-q-delete"), "DELETE", "", "Question deleted."); }
    const pm = e.target.closest("[data-q-perma]");
    if (pm) { if (!window.confirm("Permanently delete this question and its answers? This cannot be undone.")) return; return doQuestionAction(pm.getAttribute("data-q-perma"), "DELETE", "?permanent=1", "Question permanently deleted."); }
});

async function doQuestionAction(id, method, suffix, msg) {
    try {
        await fetchJson("/api/solutions/" + id + suffix, { method: method });
        showMessage("success", msg);
        closeModal("question-modal");
        loadQuestions();
    } catch (e) { showMessage("error", e.message); }
}

/* Delegated inline comment actions (inside question modal) */
document.addEventListener("click", async function (e) {
    const q = function (node) { return node.getAttribute("data-q"); };
    const app = e.target.closest("[data-c-status]");
    if (app) return doCommentAction(app.getAttribute("data-id"), "PATCH", "/status", { status: app.getAttribute("data-c-status") }, "Comment approved.", q(app));
    const acc = e.target.closest("[data-c-accept]");
    if (acc) return doCommentAction(acc.getAttribute("data-c-accept"), "PATCH", "/accept", null, "Marked as accepted solution.", q(acc));
    const unacc = e.target.closest("[data-c-unaccept]");
    if (unacc) return doCommentAction(unacc.getAttribute("data-c-unaccept"), "PATCH", "/remove-accepted", null, "Accepted solution removed.", q(unacc));
    const cdel = e.target.closest("[data-c-del]");
    if (cdel) { if (!window.confirm("Delete this answer?")) return; return doCommentAction(cdel.getAttribute("data-c-del"), "DELETE", "", null, "Answer deleted.", q(cdel)); }
});

async function doCommentAction(id, method, suffix, body, msg, questionId) {
    try {
        const opts = { method: method };
        if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
        await fetchJson("/api/solutions/comments/" + id + suffix, opts);
        showMessage("success", msg);
        if (questionId) loadQuestionComments(questionId);
        loadQuestions();
        if (!document.querySelector('[data-tab-panel="comments"]').classList.contains("d-none")) loadComments();
    } catch (e) { showMessage("error", e.message); }
}

/* ======================= COMMENTS (standalone tab) ==================== */
async function loadComments() {
    el("comments-loading").classList.remove("d-none");
    try {
        const params = new URLSearchParams();
        const s = el("c-search").value.trim(); if (s) params.set("search", s);
        const st = el("c-status").value; if (st) params.set("status", st);
        const qid = el("c-question").value; if (qid) params.set("question_id", qid);
        const result = await fetchJson("/api/solutions/comments?" + params.toString());
        state.comments = result.data || [];
        state.cPage = 1;
        renderCommentsTable();
    } catch (e) {
        showMessage("error", e.message);
    } finally { el("comments-loading").classList.add("d-none"); }
}

function renderCommentsTable() {
    const tbody = el("comments-table");
    const start = (state.cPage - 1) * PAGE_SIZE;
    const pageItems = state.comments.slice(start, start + PAGE_SIZE);
    if (!pageItems.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">No answers found.</td></tr>';
    } else {
        tbody.innerHTML = pageItems.map(function (c) {
            const excerpt = String(c.comment || "").slice(0, 90);
            return "<tr>" +
                "<td>" + escapeHtml(c.visitor_name) + "<br><small>" + escapeHtml(c.visitor_email || "") + "</small></td>" +
                "<td>" + escapeHtml(excerpt) + (c.comment && c.comment.length > 90 ? "..." : "") + "</td>" +
                "<td>" + escapeHtml(c.question_title || ("#" + c.question_id)) + "</td>" +
                "<td>" + statusPill(c.status) + "</td>" +
                "<td>" + (Number(c.is_accepted_solution) ? "Yes" : "No") + "</td>" +
                "<td>" + formatDate(c.created_at) + "</td>" +
                "<td>" +
                (c.status !== "approved" ? '<button class="admin-action-btn" data-cc-status="approved" data-id="' + c.id + '">Approve</button> ' : "") +
                '<button class="admin-action-btn" data-cc-status="hidden" data-id="' + c.id + '">Hide</button> ' +
                '<button class="admin-action-btn" data-cc-status="spam" data-id="' + c.id + '">Spam</button> ' +
                (Number(c.is_accepted_solution) ? '<button class="admin-action-btn" data-cc-unaccept="' + c.id + '">Unaccept</button> '
                    : (c.status === "approved" ? '<button class="admin-action-btn" data-cc-accept="' + c.id + '">Accept</button> ' : "")) +
                '<button class="admin-action-btn" data-cc-edit="' + c.id + '">Edit</button> ' +
                '<button class="admin-action-btn danger" data-cc-del="' + c.id + '">Delete</button>' +
                "</td></tr>";
        }).join("");
    }
    const totalPages = Math.max(Math.ceil(state.comments.length / PAGE_SIZE), 1);
    el("c-page-summary").textContent = "Page " + state.cPage + " of " + totalPages + " • " + state.comments.length + " total";
    el("c-prev").disabled = state.cPage <= 1;
    el("c-next").disabled = state.cPage >= totalPages;
}

document.addEventListener("click", async function (e) {
    const st = e.target.closest("[data-cc-status]");
    if (st) return commentTabAction(st.getAttribute("data-id"), "PATCH", "/status", { status: st.getAttribute("data-cc-status") }, "Updated.");
    const acc = e.target.closest("[data-cc-accept]");
    if (acc) return commentTabAction(acc.getAttribute("data-cc-accept"), "PATCH", "/accept", null, "Marked accepted.");
    const un = e.target.closest("[data-cc-unaccept]");
    if (un) return commentTabAction(un.getAttribute("data-cc-unaccept"), "PATCH", "/remove-accepted", null, "Accepted removed.");
    const del = e.target.closest("[data-cc-del]");
    if (del) { if (!window.confirm("Delete this answer?")) return; return commentTabAction(del.getAttribute("data-cc-del"), "DELETE", "", null, "Deleted."); }
    const edit = e.target.closest("[data-cc-edit]");
    if (edit) {
        const c = state.comments.find(function (x) { return String(x.id) === edit.getAttribute("data-cc-edit"); });
        if (!c) return;
        state.editingCommentId = c.id;
        el("comment-detail").innerHTML = '<div class="admin-detail-item admin-detail-wide"><span>Author</span><strong>' + escapeHtml(c.visitor_name) + "</strong></div>";
        el("comment-edit-text").value = c.comment || "";
        el("comment-edit-code").value = c.code_snippet || "";
        openModal("comment-modal");
    }
});

const commentSaveBtn = el("comment-save-btn");
if (commentSaveBtn) {
    commentSaveBtn.addEventListener("click", async function () {
        if (!state.editingCommentId) return;
        try {
            await fetchJson("/api/solutions/comments/" + state.editingCommentId, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment: el("comment-edit-text").value.trim(), code_snippet: el("comment-edit-code").value.trim() }),
            });
            showMessage("success", "Answer updated.");
            closeModal("comment-modal");
            loadComments();
        } catch (e) { showMessage("error", e.message); }
    });
}

async function commentTabAction(id, method, suffix, body, msg) {
    try {
        const opts = { method: method };
        if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
        await fetchJson("/api/solutions/comments/" + id + suffix, opts);
        showMessage("success", msg);
        loadComments();
    } catch (e) { showMessage("error", e.message); }
}

/* ------------------------------- wiring -------------------------------- */
let qSearchTimer;
["q-search", "q-status", "q-filter-solved", "q-filter-category"].forEach(function (id) {
    const node = el(id);
    if (!node) return;
    const handler = function () { state.qPage = 1; window.clearTimeout(qSearchTimer); qSearchTimer = window.setTimeout(loadQuestions, 250); };
    node.addEventListener(node.tagName === "SELECT" ? "change" : "input", handler);
});
el("q-prev").addEventListener("click", function () { if (state.qPage > 1) { state.qPage--; loadQuestions(); } });
el("q-next").addEventListener("click", function () { state.qPage++; loadQuestions(); });
el("refresh-questions").addEventListener("click", loadQuestions);

let cSearchTimer;
["c-search", "c-status", "c-question"].forEach(function (id) {
    const node = el(id);
    if (!node) return;
    node.addEventListener(node.tagName === "SELECT" ? "change" : "input", function () { window.clearTimeout(cSearchTimer); cSearchTimer = window.setTimeout(loadComments, 250); });
});
el("c-prev").addEventListener("click", function () { if (state.cPage > 1) { state.cPage--; renderCommentsTable(); } });
el("c-next").addEventListener("click", function () { state.cPage++; renderCommentsTable(); });
el("refresh-comments").addEventListener("click", loadComments);
const refreshTax = el("refresh-taxonomy");
if (refreshTax) refreshTax.addEventListener("click", function () { loadCategories().then(renderCategoriesTable); loadTags(); });

const logoutBtn = el("admin-logout");
if (logoutBtn) logoutBtn.addEventListener("click", function () {
    localStorage.removeItem("isAdminLoggedIn");
    localStorage.removeItem("adminToken");
    window.location.href = "/admin-login";
});

/* ------------------------------- boot ---------------------------------- */
(async function init() {
    await loadCategories();
    renderCategoriesTable();
    loadQuestions();
})();
