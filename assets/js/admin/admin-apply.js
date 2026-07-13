/* Admin — Opportunities. Create / edit / duplicate / archive all five listing types.
   Applicants live on their own page (/admin-applicants). */
(function () {
    "use strict";

    if (localStorage.getItem("isAdminLoggedIn") !== "true" || !localStorage.getItem("adminToken")) {
        location.replace("/admin-login");
        return;
    }

    var API = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";
    var token = localStorage.getItem("adminToken");
    var $ = function (s) { return document.querySelector(s); };
    function esc(v) { var d = document.createElement("div"); d.textContent = (v == null ? "" : v); return d.innerHTML; }
    function pretty(v) { return String(v == null ? "" : v).replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

    function toast(msg, kind) {
        var el = $("#toast");
        el.textContent = msg;
        el.className = "aa-toast " + (kind || "ok");
        if (!msg) el.classList.add("is-hidden");
        clearTimeout(toast._t);
        if (msg && kind !== "error") toast._t = setTimeout(function () { el.classList.add("is-hidden"); }, 4000);
    }

    async function req(path, opt) {
        opt = opt || {};
        opt.headers = Object.assign({ Accept: "application/json", Authorization: "Bearer " + token }, opt.headers || {});
        var r = await fetch(API + path, opt);
        var body = await r.json().catch(function () { return {}; });
        if (r.status === 401) { localStorage.clear(); location.replace("/admin-login"); throw new Error("Session expired"); }
        if (!r.ok || !body.success) throw new Error(body.message || "Request failed");
        return body;
    }

    function query(form) {
        var q = new URLSearchParams({ limit: "60" });
        new FormData(form).forEach(function (v, k) { if (v) q.set(k, v); });
        return q;
    }

    /* ---------- List ---------- */
    async function loadPosts() {
        $("#post-loading").hidden = false;
        $("#post-empty").hidden = true;
        $("#post-list").innerHTML = "";
        try {
            var body = await req("/api/admin/opportunities?" + query($("#post-filters")));
            var rows = body.data || [];
            var meta = body.meta || {};
            $("#post-count").textContent = (meta.total != null ? meta.total : rows.length) + " listing" + ((meta.total || rows.length) === 1 ? "" : "s");
            $("#post-loading").hidden = true;

            if (!rows.length) { $("#post-empty").hidden = false; return; }

            $("#post-list").innerHTML = rows.map(function (o) {
                return '<article class="aa-opp-card">' +
                    '<div class="aa-opp-card-top">' +
                        '<span class="aa-cat-chip">' + esc(pretty(o.category)) + '</span>' +
                        '<span class="aa-pill ' + esc(o.status === "published" ? "approved" : o.status) + '">' + esc(pretty(o.status)) + '</span>' +
                    '</div>' +
                    '<h3>' + esc(o.title) + '</h3>' +
                    '<div class="aa-opp-meta">' +
                        (o.location ? '<span><i class="fal fa-map-marker-alt"></i>' + esc(o.location) + '</span>' : '<span><i class="fal fa-globe"></i>Flexible</span>') +
                        (o.opportunity_type ? '<span><i class="fal fa-clock"></i>' + esc(o.opportunity_type) + '</span>' : '') +
                        '<span><i class="fal fa-calendar"></i>Deadline: ' + esc(o.application_deadline || "Open") + '</span>' +
                        (o.is_featured ? '<span><i class="fal fa-star" style="color:#f79009"></i>Featured</span>' : '') +
                    '</div>' +
                    '<div class="aa-opp-actions">' +
                        '<button data-edit="' + o.id + '"><i class="fal fa-pen"></i> Edit</button>' +
                        '<button data-duplicate="' + o.id + '"><i class="fal fa-copy"></i> Duplicate</button>' +
                        '<button class="aa-danger" data-delete="' + o.id + '"><i class="fal fa-archive"></i> Archive</button>' +
                    '</div>' +
                    '</article>';
            }).join("");
        } catch (e) {
            $("#post-loading").hidden = true;
            toast(e.message, "error");
        }
    }

    /* ---------- Modal ---------- */
    function openModal() { var m = $("#post-modal"); m.classList.add("is-open"); m.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
    function closeModal() { var m = $("#post-modal"); m.classList.remove("is-open"); m.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }

    /* Internships are unpaid — hide + clear pay inputs. */
    function togglePay() {
        var f = $("#post-form");
        var intern = f.elements.category && f.elements.category.value === "internship";
        Array.prototype.forEach.call(document.querySelectorAll("#post-form [data-pay]"), function (l) {
            l.style.display = intern ? "none" : "";
        });
        if (intern) { f.elements.budget_min.value = ""; f.elements.budget_max.value = ""; }
    }

    async function editPost(id) {
        try {
            var body = await req("/api/admin/opportunities/" + id);
            var o = body.data;
            var f = $("#post-form");
            f.reset();
            Object.keys(o).forEach(function (k) {
                var el = f.elements[k];
                if (!el) return;
                if (el.type === "checkbox") el.checked = !!Number(o[k]);
                else if (k === "skills" && Array.isArray(o[k])) el.value = o[k].join(", ");
                else el.value = (o[k] == null ? "" : o[k]);
            });
            togglePay();
            $("#post-form-title").textContent = "Edit opportunity";
            openModal();
        } catch (e) { toast(e.message, "error"); }
    }

    /* ---------- Events ---------- */
    $("#new-post").addEventListener("click", function () {
        var f = $("#post-form");
        f.reset();
        f.elements.id.value = "";
        togglePay();
        $("#post-form-title").textContent = "Add opportunity";
        openModal();
    });

    $("#post-form").elements.category.addEventListener("change", togglePay);

    $("#post-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var data = Object.fromEntries(new FormData(e.target));
        data.is_featured = e.target.elements.is_featured.checked;
        ["budget_min", "budget_max"].forEach(function (k) { if (data[k] === "") delete data[k]; });
        var id = data.id;
        delete data.id;
        if (data.category === "internship") {
            data.salary_min = data.salary_max = data.stipend = data.budget_min = data.budget_max = data.investment_required = null;
        } else if (data.category === "job") {
            data.salary_min = data.budget_min;
            data.salary_max = data.budget_max;
            data.budget_min = null;
            data.budget_max = null;
        }
        try {
            await req("/api/admin/opportunities" + (id ? "/" + id : ""), {
                method: id ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            closeModal();
            toast("Opportunity saved.", "ok");
            loadPosts();
        } catch (x) { toast(x.message, "error"); }
    });

    $("#post-list").addEventListener("click", async function (e) {
        var btn = e.target.closest("[data-edit],[data-duplicate],[data-delete]");
        if (!btn) return;
        var id = btn.dataset.edit || btn.dataset.duplicate || btn.dataset.delete;
        try {
            if (btn.dataset.edit) return editPost(id);
            if (btn.dataset.duplicate) { await req("/api/admin/opportunities/" + id + "/duplicate", { method: "POST" }); toast("Opportunity duplicated.", "ok"); }
            if (btn.dataset.delete && confirm("Archive this opportunity? It will be hidden from the website.")) {
                await req("/api/admin/opportunities/" + id, { method: "DELETE" });
                toast("Opportunity archived.", "ok");
            }
            loadPosts();
        } catch (x) { toast(x.message, "error"); }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-modal-close]"), function (b) {
        b.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

    $("#post-filters").addEventListener("submit", function (e) { e.preventDefault(); loadPosts(); });
    $("#clear-filters").addEventListener("click", function () { $("#post-filters").reset(); loadPosts(); });
    $("#logout").addEventListener("click", function () { localStorage.clear(); location.replace("/admin-login"); });

    loadPosts();
})();
