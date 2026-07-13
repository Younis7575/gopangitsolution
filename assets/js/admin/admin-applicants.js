/* Admin — Applicants. Lists every application from the Apply module, opens a rich
   detail drawer with all submitted data grouped into sections, CV/file downloads,
   and a status/notes editor. Reads the NEW /api/admin/apply/* endpoints. */
(function () {
    "use strict";

    if (localStorage.getItem("isAdminLoggedIn") !== "true" || !localStorage.getItem("adminToken")) {
        location.replace("/admin-login");
        return;
    }

    var API = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";
    var token = localStorage.getItem("adminToken");
    var state = { page: 1, pages: 1, current: null };

    var $ = function (s) { return document.querySelector(s); };
    function esc(v) { var d = document.createElement("div"); d.textContent = (v == null ? "" : v); return d.innerHTML; }
    function pretty(v) { return String(v == null ? "" : v).replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
    function num(v) { return (v === null || v === undefined || v === "" || isNaN(Number(v))) ? null : Number(v); }

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

    /* ---------- List ---------- */
    function filterQuery() {
        var q = new URLSearchParams({ limit: "25", page: String(state.page) });
        new FormData($("#app-filters")).forEach(function (v, k) { if (v) q.set(k, v); });
        return q;
    }

    async function loadApplications() {
        $("#app-loading").hidden = false;
        $("#app-table").hidden = true;
        $("#app-empty").hidden = true;
        try {
            var body = await req("/api/admin/apply/applications?" + filterQuery());
            var rows = body.data || [];
            var meta = body.meta || {};
            state.pages = meta.total_pages || meta.pages || 1;

            $("#app-count").textContent = (meta.total != null ? meta.total : rows.length) + " applicant" + ((meta.total || rows.length) === 1 ? "" : "s");
            $("#app-loading").hidden = true;

            if (!rows.length) {
                $("#app-empty").hidden = false;
                $("#pagination").hidden = true;
                return;
            }

            $("#app-list").innerHTML = rows.map(function (a) {
                var hasCv = !!a.resume_key;
                return '<tr data-id="' + a.id + '">' +
                    '<td><div class="aa-applicant-name">' + esc(a.applicant_name) + '</div>' +
                    '<div class="aa-applicant-sub">' + esc(a.email) + '</div>' +
                    '<div class="aa-ref">' + esc(a.reference_number) + '</div></td>' +
                    '<td>' + esc(a.opportunity_title || "Archived listing") + '</td>' +
                    '<td>' + esc(pretty(a.opportunity_category)) + '</td>' +
                    '<td>' + (hasCv
                        ? '<span class="aa-cv-tag"><i class="fal fa-file-pdf"></i> CV</span>'
                        : '<span class="aa-cv-tag is-missing">None</span>') + '</td>' +
                    '<td><span class="aa-pill ' + esc(a.status) + '">' + esc(pretty(a.status)) + '</span></td>' +
                    '<td>' + new Date(a.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) + '</td>' +
                    '</tr>';
            }).join("");

            $("#app-table").hidden = false;
            $("#pagination").hidden = state.pages <= 1;
            $("#page-info").textContent = "Page " + state.page + " of " + state.pages;
            $("#prev-page").disabled = state.page <= 1;
            $("#next-page").disabled = state.page >= state.pages;
        } catch (e) {
            $("#app-loading").hidden = true;
            toast(e.message, "error");
        }
    }

    /* ---------- Detail drawer ---------- */
    function row(label, value, isLink) {
        if (value == null || value === "") return "";
        var val = isLink
            ? '<a href="' + esc(value) + '" target="_blank" rel="noopener">' + esc(value) + '</a>'
            : esc(value);
        return '<div><dt>' + esc(label) + '</dt><dd>' + val + '</dd></div>';
    }

    function section(title, icon, innerRows) {
        innerRows = innerRows.filter(Boolean).join("");
        if (!innerRows) return "";
        return '<div class="aa-section"><div class="aa-section-title"><i class="fal ' + icon + '"></i>' + esc(title) + '</div>' +
            '<div class="aa-dl">' + innerRows + '</div></div>';
    }

    function longSection(title, icon, text) {
        if (!text) return "";
        return '<div class="aa-section"><div class="aa-section-title"><i class="fal ' + icon + '"></i>' + esc(title) + '</div>' +
            '<div class="aa-longtext">' + esc(text) + '</div></div>';
    }

    function filesBlock(a) {
        var out = "";
        if (a.resume_key) {
            out += '<div class="aa-file-card">' +
                '<span class="aa-file-icon"><i class="fal fa-file-pdf"></i></span>' +
                '<div class="aa-file-info"><div class="aa-file-label">Resume / CV</div>' +
                '<div class="aa-file-name">' + esc(a.resume_name || "resume") + '</div></div>' +
                '<button type="button" class="aa-download-btn" data-file="resume"><i class="fal fa-download"></i> Download</button></div>';
        }
        if (a.supporting_key) {
            out += '<div class="aa-file-card">' +
                '<span class="aa-file-icon aa-file-support"><i class="fal fa-paperclip"></i></span>' +
                '<div class="aa-file-info"><div class="aa-file-label">Supporting Document</div>' +
                '<div class="aa-file-name">' + esc(a.supporting_name || "document") + '</div></div>' +
                '<button type="button" class="aa-download-btn" data-file="supporting"><i class="fal fa-download"></i> Download</button></div>';
        }
        if (!out) {
            out = '<div class="aa-file-card"><span class="aa-file-icon is-missing" style="background:#f2f4f7;color:#98a2b3"><i class="fal fa-file"></i></span>' +
                '<div class="aa-file-info"><div class="aa-file-name" style="color:#98a2b3">No files were uploaded by this applicant.</div></div></div>';
        }
        return '<div class="aa-files">' + out + '</div>';
    }

    function statusOptions(current) {
        var opts = ["new", "under_review", "shortlisted", "interview_scheduled", "approved", "hired", "selected", "rejected", "on_hold", "closed", "under_evaluation", "negotiation", "awarded"];
        return opts.map(function (s) {
            return '<option value="' + s + '"' + (s === current ? " selected" : "") + '>' + pretty(s) + '</option>';
        }).join("");
    }

    function renderExtraFields(fields) {
        if (!fields || typeof fields !== "object") return "";
        var skip = { full_name: 1, email: 1, phone: 1, country: 1, city: 1, applicant_type: 1, current_designation: 1, total_experience: 1, relevant_experience: 1, expected_salary_or_budget: 1, availability: 1, university: 1, degree: 1, semester: 1, company_name: 1, website: 1, linkedin_url: 1, portfolio_url: 1, cover_letter: 1, proposal: 1, agreement: 1 };
        var rows = Object.keys(fields).filter(function (k) { return !skip[k] && fields[k] !== "" && fields[k] != null; })
            .map(function (k) { return row(pretty(k), fields[k]); });
        return section("Additional Details", "fa-list", rows);
    }

    function renderDetail(a) {
        state.current = a;
        $("#drawer-ref").textContent = a.reference_number || "—";
        $("#drawer-name").textContent = a.applicant_name || "Applicant";
        $("#drawer-opp").textContent = (a.opportunity_title || "Archived listing") + "  ·  " + pretty(a.opportunity_category);

        var html = "";
        html += filesBlock(a);

        html += '<div style="margin-bottom:16px"><span class="aa-pill ' + esc(a.status) + '" style="font-size:13px;padding:7px 14px">' + esc(pretty(a.status)) + '</span></div>';

        html += section("Contact", "fa-user", [
            row("Full name", a.applicant_name),
            row("Email", a.email),
            row("Phone", a.phone),
            row("Applicant type", a.applicant_type && pretty(a.applicant_type)),
            row("City", a.city),
            row("Country", a.country)
        ]);

        html += section("Professional", "fa-briefcase", [
            row("Current designation", a.current_designation),
            row("Company", a.company_name),
            row("Total experience", num(a.experience) != null ? a.experience + " yrs" : null),
            row("Relevant experience", num(a.relevant_experience) != null ? a.relevant_experience + " yrs" : null),
            row("Expected salary / budget", num(a.expected_salary_or_budget) != null ? a.expected_salary_or_budget : null),
            row("Availability", a.availability)
        ]);

        html += section("Education", "fa-graduation-cap", [
            row("University", a.university),
            row("Degree", a.degree),
            row("Semester", a.semester)
        ]);

        html += section("Links", "fa-link", [
            row("Website", a.website, true),
            row("LinkedIn", a.linkedin_url, true),
            row("Portfolio", a.portfolio_url, true)
        ]);

        html += longSection("Cover Letter", "fa-envelope-open-text", a.cover_letter);
        html += longSection("Proposal", "fa-file-signature", a.proposal);
        html += renderExtraFields(a.fields);

        html += section("Submission", "fa-clock", [
            row("Reference", a.reference_number),
            row("Submitted", a.created_at ? new Date(a.created_at).toLocaleString() : null),
            row("Last updated", a.updated_at ? new Date(a.updated_at).toLocaleString() : null),
            row("Source", a.source)
        ]);

        html += '<form id="status-form" class="aa-status-form">' +
            '<div><label>Update status</label><select name="status">' + statusOptions(a.status) + '</select></div>' +
            '<div><label>Internal notes (only admins see this)</label><textarea name="admin_notes" placeholder="Add a note about this applicant...">' + esc(a.admin_notes || "") + '</textarea></div>' +
            '<button type="submit" class="theme-btn">Save changes</button>' +
            '</form>';

        $("#drawer-body").innerHTML = html;
    }

    async function openApplicant(id) {
        try {
            toast("");
            var body = await req("/api/admin/apply/applications/" + id);
            renderDetail(body.data);
            var d = $("#drawer");
            d.classList.add("is-open");
            d.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
        } catch (e) {
            toast(e.message, "error");
        }
    }

    function closeDrawer() {
        var d = $("#drawer");
        d.classList.remove("is-open");
        d.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        state.current = null;
    }

    async function downloadFile(kind) {
        if (!state.current) return;
        try {
            var r = await fetch(API + "/api/admin/apply/applications/" + state.current.id + "/file/" + kind, {
                headers: { Authorization: "Bearer " + token }
            });
            if (!r.ok) throw new Error("Unable to download file");
            var blob = await r.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            var cd = r.headers.get("Content-Disposition") || "";
            var match = cd.match(/filename="?([^";]+)/);
            a.download = match ? match[1] : (kind === "resume" ? (state.current.resume_name || "resume") : (state.current.supporting_name || "document"));
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        } catch (e) {
            toast(e.message, "error");
        }
    }

    /* ---------- Events ---------- */
    $("#app-list").addEventListener("click", function (e) {
        var tr = e.target.closest("tr[data-id]");
        if (tr) openApplicant(tr.dataset.id);
    });

    $("#drawer").addEventListener("click", function (e) {
        if (e.target.hasAttribute("data-drawer-close")) closeDrawer();
        var dl = e.target.closest("[data-file]");
        if (dl) downloadFile(dl.getAttribute("data-file"));
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeDrawer();
    });

    $("#drawer-body").addEventListener("submit", async function (e) {
        if (e.target.id !== "status-form") return;
        e.preventDefault();
        if (!state.current) return;
        var data = Object.fromEntries(new FormData(e.target));
        try {
            await req("/api/admin/apply/applications/" + state.current.id + "/status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            toast("Applicant updated.", "ok");
            closeDrawer();
            loadApplications();
        } catch (x) {
            toast(x.message, "error");
        }
    });

    $("#app-filters").addEventListener("submit", function (e) { e.preventDefault(); state.page = 1; loadApplications(); });
    $("#clear-filters").addEventListener("click", function () { $("#app-filters").reset(); state.page = 1; loadApplications(); });
    $("#prev-page").addEventListener("click", function () { if (state.page > 1) { state.page--; loadApplications(); } });
    $("#next-page").addEventListener("click", function () { if (state.page < state.pages) { state.page++; loadApplications(); } });
    $("#admin-logout").addEventListener("click", function () { localStorage.clear(); location.replace("/admin-login"); });

    loadApplications();
})();
