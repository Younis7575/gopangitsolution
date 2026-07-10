/**
 * Community Solutions — question detail page.
 * Renders the question, SEO metadata, answers/comments (nested), the guest
 * answer form (with optional Cloudflare Turnstile), share + related questions.
 */
const API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";

const detailRoot = document.getElementById("solution-detail");
const commentsRoot = document.getElementById("solution-comments");
const relatedRoot = document.getElementById("solution-related");
const breadcrumbRoot = document.getElementById("solution-breadcrumb");

const state = {
    question: null,
    config: { require_captcha: false, turnstile_site_key: "" },
    turnstileReady: false,
    widgets: {},
};

/* ----------------------------- utilities ------------------------------ */
function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>'"]/g, function (char) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
}

function formatDate(value) {
    if (!value) return "";
    const date = new Date(String(value).replace(" ", "T"));
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function getSlugFromPath() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("slug")) return params.get("slug");
    if (params.get("id")) return params.get("id");
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (!segments.length) return "";
    const last = segments[segments.length - 1];
    return last === "detail.html" ? "" : last;
}

function toast(type, message) {
    let bar = document.getElementById("solutions-toast");
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "solutions-toast";
        bar.className = "solutions-toast";
        bar.setAttribute("role", "status");
        document.body.appendChild(bar);
    }
    bar.className = "solutions-toast solutions-toast--" + (type === "error" ? "error" : "success") + " is-visible";
    bar.textContent = message;
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(function () {
        bar.classList.remove("is-visible");
    }, 4200);
}

async function apiFetch(path, options) {
    const response = await fetch(API_BASE_URL + path, options || { headers: { Accept: "application/json" } });
    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json")
        ? await response.json()
        : { success: false, message: await response.text() };
    if (!response.ok || result.success === false) {
        const error = new Error(result.message || "Request failed. Please try again.");
        error.status = response.status;
        throw error;
    }
    return result;
}

/* ----------------------------- Turnstile ------------------------------ */
function loadTurnstile() {
    if (!state.config.turnstile_site_key || state.turnstileReady || window.__gisTurnstileLoading) {
        return;
    }
    window.__gisTurnstileLoading = true;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = function () {
        state.turnstileReady = true;
        Object.keys(state.widgets).forEach(renderWidget);
    };
    document.head.appendChild(script);
}

function renderWidget(containerId) {
    if (!state.config.turnstile_site_key || !window.turnstile) return;
    const el = document.getElementById(containerId);
    if (!el || el.dataset.rendered === "1") return;
    try {
        const id = window.turnstile.render("#" + containerId, { sitekey: state.config.turnstile_site_key });
        state.widgets[containerId] = id;
        el.dataset.rendered = "1";
    } catch (e) {
        /* widget already rendered or key invalid — ignore */
    }
}

function registerWidget(containerId) {
    state.widgets[containerId] = null;
    if (state.turnstileReady) renderWidget(containerId);
    else loadTurnstile();
}

function widgetToken(containerId) {
    if (!state.config.turnstile_site_key || !window.turnstile) return "";
    const id = state.widgets[containerId];
    try {
        return window.turnstile.getResponse(id) || "";
    } catch (e) {
        return "";
    }
}

function resetWidget(containerId) {
    if (window.turnstile && state.widgets[containerId] != null) {
        try { window.turnstile.reset(state.widgets[containerId]); } catch (e) { /* noop */ }
    }
}

function captchaFieldHtml(containerId) {
    if (!state.config.turnstile_site_key) return "";
    return '<div class="solutions-field"><div id="' + containerId + '" class="cf-turnstile solutions-captcha"></div></div>';
}

/* ------------------------------ SEO ----------------------------------- */
function setMeta(id, attr, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, value);
}

function applySeo(item) {
    const canonical = window.location.origin + "/solutions/" + encodeURIComponent(item.slug);
    const title = item.title + " | Community Solutions | Gopang IT Solution";
    const description = (item.short_description || item.description || "").slice(0, 300);
    document.title = title;
    setMeta("seo-description", "content", description);
    setMeta("seo-canonical", "href", canonical);
    setMeta("seo-og-title", "content", title);
    setMeta("seo-og-description", "content", description);
    setMeta("seo-og-url", "content", canonical);
    setMeta("seo-tw-title", "content", title);
    setMeta("seo-tw-description", "content", description);
    /* Only index published, non-deleted questions. */
    const indexable = String(item.status) === "approved" && !item.deleted_at;
    setMeta("seo-robots", "content", indexable ? "index, follow" : "noindex, nofollow");

    const qaSchema = {
        "@context": "https://schema.org",
        "@type": "QAPage",
        mainEntity: {
            "@type": "Question",
            name: item.title,
            text: item.description || item.short_description || item.title,
            dateCreated: item.created_at,
            answerCount: Number(item.comments_count || 0),
            author: { "@type": "Person", name: item.visitor_name || "Guest" },
        },
    };
    const schemaEl = document.getElementById("seo-qapage");
    if (schemaEl) schemaEl.textContent = JSON.stringify(qaSchema);

    const crumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: window.location.origin + "/" },
            { "@type": "ListItem", position: 2, name: "Solutions", item: window.location.origin + "/solutions" },
            { "@type": "ListItem", position: 3, name: item.title, item: canonical },
        ],
    };
    const crumbEl = document.getElementById("seo-breadcrumb");
    if (crumbEl) crumbEl.textContent = JSON.stringify(crumbSchema);
}

/* --------------------------- rendering -------------------------------- */
function renderBreadcrumb(item) {
    if (!breadcrumbRoot) return;
    breadcrumbRoot.innerHTML =
        '<a href="/">Home</a> <span>/</span> ' +
        '<a href="/solutions">Solutions</a> <span>/</span> ' +
        (item.category_slug
            ? '<a href="/solutions?category=' + encodeURIComponent(item.category_slug) + '">' + escapeHtml(item.category_name || "General") + "</a> <span>/</span> "
            : "") +
        '<span class="solutions-breadcrumb-current">' + escapeHtml(item.title) + "</span>";
}

function renderTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return "";
    return (
        '<div class="solutions-detail-tags">' +
        tags
            .map(function (tag) {
                return '<a href="/solutions?tag=' + encodeURIComponent(tag.slug) + '" class="solutions-chip">' + escapeHtml(tag.name) + "</a>";
            })
            .join("") +
        "</div>"
    );
}

function block(label, value, pre) {
    if (!value) return "";
    const body = pre ? "<pre>" + escapeHtml(value) + "</pre>" : "<p>" + escapeHtml(value) + "</p>";
    return '<div class="solutions-detail-block"><strong>' + escapeHtml(label) + "</strong>" + body + "</div>";
}

function renderDetail(item) {
    const isSolved = String(item.solved_status || "unsolved") === "solved";
    const statusClass = isSolved ? "solved" : "unsolved";
    const isAdminPost = String(item.source) === "admin";
    const canonical = window.location.origin + "/solutions/" + encodeURIComponent(item.slug);

    detailRoot.innerHTML =
        '<article class="solutions-detail-card">' +
        '<div class="solutions-detail-header">' +
        "<div>" +
        '<span class="solutions-category">' + escapeHtml(item.category_name || "General") + "</span>" +
        '<span class="solutions-status ' + statusClass + '">' + (isSolved ? "Solved" : "Open") + "</span>" +
        (isAdminPost ? '<span class="solutions-badge solutions-badge--admin">Admin Posted</span>' : "") +
        (Number(item.accepted_comment_id) ? '<span class="solutions-badge solutions-badge--accepted">Accepted Solution</span>' : "") +
        "</div>" +
        '<div class="solutions-detail-meta">' +
        "<span><i class=\"fal fa-user\" aria-hidden=\"true\"></i> " + escapeHtml(item.visitor_name || "Guest") + "</span>" +
        "<span><i class=\"fal fa-clock\" aria-hidden=\"true\"></i> " + escapeHtml(formatDate(item.created_at)) + "</span>" +
        (item.updated_at ? "<span>Updated " + escapeHtml(formatDate(item.updated_at)) + "</span>" : "") +
        "</div>" +
        "</div>" +
        "<h1>" + escapeHtml(item.title) + "</h1>" +
        '<div class="solutions-detail-summary"><p>' + escapeHtml(item.short_description || item.description || "") + "</p></div>" +
        '<div class="solutions-detail-content">' +
        "<h2>Problem</h2>" +
        "<p>" + escapeHtml(item.description || "") + "</p>" +
        block("Technologies / Platform", item.technologies, false) +
        block("Error Message", item.error_message, true) +
        block("Code Snippet", item.code_snippet, true) +
        block("Steps / Expected Result", item.expected_result, false) +
        block("Actual Result", item.actual_result, false) +
        (item.attachment_file_name
            ? '<div class="solutions-detail-block"><strong>Attachment</strong><p><a href="' +
              API_BASE_URL + "/api/solutions/" + encodeURIComponent(item.id) + '/attachment" rel="nofollow"><i class="fal fa-paperclip" aria-hidden="true"></i> ' +
              escapeHtml(item.attachment_file_name) + "</a></p></div>"
            : "") +
        "</div>" +
        '<div class="solutions-detail-stats">' +
        '<span><i class="fal fa-eye" aria-hidden="true"></i> ' + Number(item.views_count || 0) + " views</span>" +
        '<span><i class="fal fa-comments" aria-hidden="true"></i> ' + Number(item.comments_count || 0) + " answers</span>" +
        "</div>" +
        renderTags(item.tags) +
        '<div class="solutions-detail-actions">' +
        '<a href="/solutions" class="theme-btn-outline">Back to all questions</a>' +
        '<button type="button" class="theme-btn-outline solutions-share-btn" data-share-url="' + escapeHtml(canonical) + '" data-share-title="' + escapeHtml(item.title) + '"><i class="fal fa-share-alt" aria-hidden="true"></i> Share</button>' +
        '<a href="/solutions/ask" class="theme-btn">Ask a Question</a>' +
        "</div>" +
        "</article>";
}

function renderError(error) {
    const notFound = error && error.status === 404;
    detailRoot.innerHTML =
        '<div class="solutions-empty">' +
        "<h3>" + (notFound ? "Question not found" : "Unable to load this question") + "</h3>" +
        "<p>" + escapeHtml(error ? error.message : "Something went wrong.") + "</p>" +
        '<div class="solutions-detail-actions">' +
        '<button type="button" id="solution-detail-retry" class="theme-btn-outline">Retry</button>' +
        '<a href="/solutions" class="theme-btn">Back to Solutions</a>' +
        "</div>" +
        "</div>";
    const retry = document.getElementById("solution-detail-retry");
    if (retry) retry.addEventListener("click", loadDetail);
    if (commentsRoot) commentsRoot.hidden = true;
    if (relatedRoot) relatedRoot.hidden = true;
}

/* --------------------------- comments --------------------------------- */
function buildCommentTree(comments) {
    const byId = {};
    const roots = [];
    comments.forEach(function (c) {
        c.children = [];
        byId[c.id] = c;
    });
    comments.forEach(function (c) {
        if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].children.push(c);
        else roots.push(c);
    });
    return roots;
}

function renderComment(comment, depth) {
    const accepted = Number(comment.is_accepted_solution) === 1;
    const canReply = depth < 3;
    let html =
        '<article class="solutions-comment' + (accepted ? " is-accepted" : "") + '" data-comment-id="' + comment.id + '">' +
        '<div class="solutions-comment-head">' +
        '<span class="solutions-comment-author"><i class="fal fa-user-circle" aria-hidden="true"></i> ' + escapeHtml(comment.visitor_name || "Guest") + "</span>" +
        '<span class="solutions-comment-date">' + escapeHtml(formatDate(comment.created_at)) + "</span>" +
        (accepted ? '<span class="solutions-badge solutions-badge--accepted"><i class="fal fa-check-circle" aria-hidden="true"></i> Accepted Solution</span>' : "") +
        "</div>" +
        '<div class="solutions-comment-body"><p>' + escapeHtml(comment.comment).replace(/\n/g, "<br>") + "</p>" +
        (comment.code_snippet ? "<pre>" + escapeHtml(comment.code_snippet) + "</pre>" : "") +
        "</div>";
    if (canReply) {
        html += '<div class="solutions-comment-actions"><button type="button" class="solutions-reply-toggle" data-reply-to="' + comment.id + '">Reply</button></div>';
        html += '<div class="solutions-reply-slot" data-reply-slot="' + comment.id + '"></div>';
    }
    if (comment.children && comment.children.length) {
        html += '<div class="solutions-comment-children">' + comment.children.map(function (child) { return renderComment(child, depth + 1); }).join("") + "</div>";
    }
    html += "</article>";
    return html;
}

function renderComments(comments) {
    if (!commentsRoot) return;
    commentsRoot.hidden = false;
    const tree = buildCommentTree(comments);
    const count = comments.length;
    const canComment = state.question && Number(state.question.allow_comments) !== 0 && String(state.question.status) === "approved";

    const plural = count === 1 ? "" : "s";
    let listHtml;
    if (count) {
        listHtml = '<div class="solutions-comments-list">' + tree.map(function (c) { return renderComment(c, 0); }).join("") + "</div>";
    } else {
        listHtml = '<div class="solutions-empty solutions-empty--inline"><p>No answers yet. Be the first to help by sharing your solution below.</p></div>';
    }
    let formHtml;
    if (canComment) {
        formHtml = answerFormHtml("solution-answer-form", null, "Share Your Solution");
    } else {
        formHtml = '<div class="solutions-empty solutions-empty--inline"><p>This question is closed for new answers.</p></div>';
    }
    commentsRoot.innerHTML = '<div class="solutions-comments-head"><h2>' + count + " Answer" + plural + " and Solution" + plural + "</h2></div>" + listHtml + formHtml;

    if (canComment) {
        wireAnswerForm("solution-answer-form", null);
        registerWidget("captcha-solution-answer-form");
    }
    wireReplyToggles();
}

function answerFormHtml(formId, parentId, heading) {
    const captchaId = "captcha-" + formId;
    return (
        '<form class="solutions-answer-form" id="' + formId + '"' + (parentId ? ' data-parent-id="' + parentId + '"' : "") + ">" +
        (heading ? '<h3 class="solutions-answer-heading">' + escapeHtml(heading) + "</h3>" : "") +
        '<div class="solutions-form-row">' +
        '<div class="solutions-field"><label>Your Name *</label><input type="text" name="visitor_name" maxlength="180" required></div>' +
        '<div class="solutions-field"><label>Email * <span class="solutions-hint">(never shown publicly)</span></label><input type="email" name="visitor_email" maxlength="200" required></div>' +
        "</div>" +
        '<div class="solutions-field"><label>Your Answer / Solution *</label><textarea name="comment" rows="5" maxlength="8000" required></textarea><span class="solutions-counter" data-counter-for="comment">0 / 8000</span></div>' +
        '<div class="solutions-field"><label>Code Snippet <span class="solutions-hint">(optional)</span></label><textarea name="code_snippet" rows="4" maxlength="8000" class="solutions-code-input"></textarea></div>' +
        '<input type="text" name="hp_address" class="solutions-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        captchaFieldHtml(captchaId) +
        '<div class="solutions-form-actions"><button type="submit" class="theme-btn">Post ' + (parentId ? "Reply" : "Answer") + "</button>" +
        (parentId ? '<button type="button" class="theme-btn-outline solutions-reply-cancel">Cancel</button>' : "") +
        "</div>" +
        "</form>"
    );
}

function wireReplyToggles() {
    if (!commentsRoot) return;
    commentsRoot.querySelectorAll(".solutions-reply-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const parentId = btn.getAttribute("data-reply-to");
            const slot = commentsRoot.querySelector('[data-reply-slot="' + parentId + '"]');
            if (!slot) return;
            if (slot.dataset.open === "1") {
                slot.innerHTML = "";
                slot.dataset.open = "0";
                return;
            }
            const formId = "reply-form-" + parentId;
            slot.innerHTML = answerFormHtml(formId, parentId, null);
            slot.dataset.open = "1";
            wireAnswerForm(formId, parentId);
            registerWidget("captcha-" + formId);
            const cancel = slot.querySelector(".solutions-reply-cancel");
            if (cancel) cancel.addEventListener("click", function () { slot.innerHTML = ""; slot.dataset.open = "0"; });
        });
    });
}

function wireAnswerForm(formId, parentId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const counter = form.querySelector('[data-counter-for="comment"]');
    const textarea = form.querySelector('textarea[name="comment"]');
    if (counter && textarea) {
        const update = function () { counter.textContent = textarea.value.length + " / 8000"; };
        textarea.addEventListener("input", update);
        update();
    }
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        submitAnswer(form, parentId);
    });
}

async function submitAnswer(form, parentId) {
    if (!state.question) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    const data = {
        visitor_name: form.visitor_name.value.trim(),
        visitor_email: form.visitor_email.value.trim(),
        comment: form.comment.value.trim(),
        code_snippet: form.code_snippet.value.trim(),
        hp_address: form.hp_address.value,
    };
    if (parentId) data.parent_id = Number(parentId);

    if (!data.visitor_name || !data.visitor_email || !data.comment) {
        toast("error", "Please fill your name, a valid email and your answer.");
        return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.visitor_email)) {
        toast("error", "Please enter a valid email address.");
        return;
    }
    if (data.comment.length < 10) {
        toast("error", "Your answer is too short (minimum 10 characters).");
        return;
    }
    const captchaId = "captcha-" + form.id;
    if (state.config.require_captcha) {
        const token = widgetToken(captchaId);
        if (!token) {
            toast("error", "Please complete the CAPTCHA challenge.");
            return;
        }
        data["cf-turnstile-response"] = token;
    }

    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";
    try {
        const result = await apiFetch("/api/solutions/" + state.question.id + "/comments", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(data),
        });
        toast("success", result.message || "Your answer has been submitted.");
        form.reset();
        resetWidget(captchaId);
        /* If auto-published, refresh the list immediately; otherwise leave a note. */
        await loadComments();
    } catch (error) {
        toast("error", error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

async function loadComments() {
    if (!state.question || !commentsRoot) return;
    try {
        const result = await apiFetch("/api/solutions/" + state.question.id + "/comments");
        renderComments(result.data || []);
    } catch (error) {
        commentsRoot.hidden = false;
        commentsRoot.innerHTML =
            '<div class="solutions-empty solutions-empty--inline"><p>Unable to load answers.</p>' +
            '<button type="button" id="comments-retry" class="theme-btn-outline">Retry</button></div>';
        const retry = document.getElementById("comments-retry");
        if (retry) retry.addEventListener("click", loadComments);
    }
}

/* --------------------------- related ---------------------------------- */
async function loadRelated(item) {
    if (!relatedRoot || !item.category_slug) return;
    try {
        const result = await apiFetch("/api/solutions?limit=6&category=" + encodeURIComponent(item.category_slug));
        const related = (result.data || []).filter(function (q) { return q.id !== item.id; }).slice(0, 5);
        if (!related.length) { relatedRoot.hidden = true; return; }
        relatedRoot.hidden = false;
        relatedRoot.innerHTML =
            '<div class="solutions-sidebar-card"><h3>Related Questions</h3><ul class="solutions-related-list">' +
            related
                .map(function (q) {
                    return '<li><a href="/solutions/' + encodeURIComponent(q.slug) + '">' + escapeHtml(q.title) + "</a>" +
                        '<span class="solutions-related-meta">' + Number(q.comments_count || 0) + " answers &middot; " + Number(q.views_count || 0) + " views</span></li>";
                })
                .join("") +
            "</ul></div>";
    } catch (error) {
        relatedRoot.hidden = true;
    }
}

/* ----------------------------- share ---------------------------------- */
document.addEventListener("click", function (event) {
    const shareBtn = event.target.closest(".solutions-share-btn");
    if (!shareBtn) return;
    const url = shareBtn.getAttribute("data-share-url");
    const title = shareBtn.getAttribute("data-share-title");
    if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { toast("success", "Link copied to clipboard."); });
    } else {
        window.prompt("Copy this link:", url);
    }
});

/* ------------------------------ boot ---------------------------------- */
async function loadConfig() {
    try {
        const result = await apiFetch("/api/solutions/config");
        state.config = result.data || state.config;
        if (state.config.turnstile_site_key) loadTurnstile();
    } catch (e) {
        /* config is best-effort; captcha simply stays disabled */
    }
}

async function loadDetail() {
    const slug = getSlugFromPath();
    if (!slug) {
        renderError(Object.assign(new Error("This question link is missing its identifier."), { status: 404 }));
        return;
    }
    detailRoot.innerHTML = '<div class="solutions-loading"><span class="solutions-loader"></span><p>Loading question details...</p></div>';
    try {
        const result = await apiFetch("/api/solutions/slug/" + encodeURIComponent(slug));
        state.question = result.data;
        renderDetail(state.question);
        renderBreadcrumb(state.question);
        applySeo(state.question);
        await Promise.all([loadComments(), loadRelated(state.question)]);
    } catch (error) {
        renderError(error);
    }
}

loadConfig();
loadDetail();
