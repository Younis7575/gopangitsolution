/* Admin Website Analytics — dashboard controller (admin-only). */
(function () {
	"use strict";

	var API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";

	if (localStorage.getItem("isAdminLoggedIn") !== "true" || !localStorage.getItem("adminToken")) {
		window.location.replace("/admin-login");
		return;
	}

	var state = { charts: null, summary: null, activeTab: "overview", liveTimer: null, visitorPage: 1 };

	/* -------------------------------------------------- helpers -------- */
	function $(id) { return document.getElementById(id); }
	function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

	function authHeaders() {
		return { Accept: "application/json", Authorization: "Bearer " + (localStorage.getItem("adminToken") || "") };
	}

	function esc(v) {
		return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
		});
	}

	function showMessage(type, text) {
		var el = $("global-message");
		if (!el) return;
		el.className = "admin-alert " + type;
		el.textContent = text;
	}
	function clearMessage() {
		var el = $("global-message");
		if (el) { el.className = "admin-alert d-none"; el.textContent = ""; }
	}

	function filterQuery(extra) {
		var params = {
			range: ($("an-range") || {}).value || "30d",
			from: ($("an-from") || {}).value || "",
			to: ($("an-to") || {}).value || "",
			country: ($("an-country") || {}).value || "",
			device: ($("an-device") || {}).value || "",
			browser: ($("an-browser") || {}).value || "",
			os: ($("an-os") || {}).value || "",
			source: ($("an-source") || {}).value || "",
			applied: ($("an-applied") || {}).value || ""
		};
		if (extra) { for (var k in extra) { params[k] = extra[k]; } }
		return Object.keys(params).filter(function (k) { return params[k] !== ""; })
			.map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); }).join("&");
	}

	async function apiGet(path) {
		try {
			var res = await fetch(API_BASE_URL + path, { headers: authHeaders() });
			if (res.status === 401) {
				localStorage.removeItem("isAdminLoggedIn");
				localStorage.removeItem("adminToken");
				window.location.replace("/admin-login");
				return null;
			}
			var body = await res.json();
			if (!res.ok || body.success === false) return null;
			return body;
		} catch (e) { return null; }
	}

	async function apiPost(path, payload) {
		try {
			var res = await fetch(API_BASE_URL + path, {
				method: "POST",
				headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
				body: JSON.stringify(payload)
			});
			var body = await res.json();
			if (!res.ok || body.success === false) return null;
			return body;
		} catch (e) { return null; }
	}

	function set(id, value) { var el = $(id); if (el) el.textContent = value; }

	function fmtDuration(seconds) {
		seconds = Math.max(0, parseInt(seconds, 10) || 0);
		if (seconds < 60) return seconds + "s";
		var m = Math.floor(seconds / 60), s = seconds % 60;
		if (m < 60) return m + "m " + s + "s";
		var h = Math.floor(m / 60); m = m % 60;
		return h + "h " + m + "m";
	}

	function timeAgo(value) {
		if (!value) return "";
		var clean = String(value).replace(" ", "T");
		var then = Date.parse(clean.endsWith("Z") ? clean : clean + "Z");
		if (isNaN(then)) return String(value).slice(0, 16);
		var diff = Date.now() - then;
		if (diff < 60000) return Math.max(1, Math.round(diff / 1000)) + "s ago";
		if (diff < 3600000) return Math.round(diff / 60000) + "m ago";
		if (diff < 86400000) return Math.round(diff / 3600000) + "h ago";
		return String(value).slice(0, 16);
	}

	/* -------------------------------------------------- filter selects - */
	function fillSelect(id, items) {
		var el = $(id);
		if (!el) return;
		var current = el.value;
		var opts = '<option value="">All</option>';
		(items || []).forEach(function (it) {
			var label = it.label == null || it.label === "" ? "Unknown" : it.label;
			opts += '<option value="' + esc(label) + '">' + esc(label) + " (" + it.value + ")</option>";
		});
		el.innerHTML = opts;
		if (current) el.value = current;
	}

	function populateFilters(charts) {
		fillSelect("an-country", charts.countries);
		fillSelect("an-device", charts.devices);
		fillSelect("an-browser", charts.browsers);
		fillSelect("an-os", charts.os);
		fillSelect("an-source", charts.sources);
	}

	/* -------------------------------------------------- summary -------- */
	function renderSummary(s) {
		state.summary = s;
		set("s-live", s.live);
		set("s-today", s.today);
		set("s-yesterday", s.yesterday);
		set("s-week", s.week);
		set("s-month", s.month);
		set("s-year", s.year);
		set("s-total", s.total);
		set("s-pageviews", s.page_views);
		set("s-new", s.new);
		set("s-returning", s.returning);
		set("s-bounce", s.bounce_rate + "%");
		set("s-avg", fmtDuration(s.avg_session_seconds));
		set("s-applied", s.applied);
		set("s-conversion", (s.conversion_rate != null ? s.conversion_rate : 0) + "%");
		var badge = $("an-live-badge"); if (badge) badge.textContent = s.live;
	}

	/* -------------------------------------------------- charts --------- */
	function C() { return window.AnalyticsCharts; }

	function renderTabCharts(tab) {
		var d = state.charts;
		if (!d || !C()) return;
		if (tab === "overview") {
			C().render($("chart-daily"), { type: "line", data: d.daily });
			C().render($("chart-sources"), { type: "doughnut", data: d.sources });
			C().render($("chart-hourly"), { type: "bar", data: d.hourly });
			C().render($("chart-devices"), { type: "doughnut", data: d.devices });
			C().render($("chart-toppages"), { type: "hbar", data: (d.top_pages || []).map(pageLabel) });
			C().render($("chart-conversions"), { type: "doughnut", data: d.conversions });
			C().render($("chart-monthly"), { type: "bar", data: d.monthly });
			C().render($("chart-yearly"), { type: "bar", data: d.yearly });
		} else if (tab === "sources") {
			C().render($("chart-sources-full"), { type: "hbar", data: d.sources, limit: 12 });
			renderRankList("an-sources-list", d.sources, totalOf(d.sources));
		} else if (tab === "geo") {
			C().render($("chart-countries"), { type: "hbar", data: d.countries, limit: 10 });
			C().render($("chart-cities"), { type: "hbar", data: d.cities, limit: 10 });
		} else if (tab === "tech") {
			C().render($("chart-browsers"), { type: "doughnut", data: d.browsers });
			C().render($("chart-os"), { type: "doughnut", data: d.os });
			C().render($("chart-devices-full"), { type: "bar", data: d.devices, multi: true });
		}
		C().redrawAll();
	}

	function pageLabel(p) { return { label: p.label, value: Number(p.value) }; }
	function totalOf(arr) { return (arr || []).reduce(function (s, p) { return s + Number(p.value); }, 0) || 0; }

	function renderRankList(id, items, total) {
		var el = $(id);
		if (!el) return;
		if (!items || !items.length) { el.innerHTML = '<div class="an-empty">No data for this range.</div>'; return; }
		total = total || totalOf(items);
		el.innerHTML = items.map(function (it, i) {
			var label = it.label == null || it.label === "" ? "Unknown" : it.label;
			var pct = total ? Math.round((it.value / total) * 100) : 0;
			var extra = it.avg_time != null ? '<span class="an-rank-extra">avg ' + fmtDuration(it.avg_time) + "</span>" : "";
			return '<div class="an-rank-row">' +
				'<span class="an-rank-num">' + (i + 1) + "</span>" +
				'<div class="an-rank-main"><div class="an-rank-top"><span class="an-rank-label" title="' + esc(label) + '">' + esc(label) + "</span>" +
				"<span>" + it.value + extra + "</span></div>" +
				'<div class="an-rank-track"><div class="an-rank-fill" style="width:' + pct + '%;background:' + color(i) + '"></div></div></div></div>';
		}).join("");
	}

	var PAL = ["#0f62fe", "#12b76a", "#7c3aed", "#f79009", "#f04438", "#0891b2", "#ec4899", "#65a30d", "#e11d48", "#2563eb"];
	function color(i) { return PAL[i % PAL.length]; }

	/* -------------------------------------------------- data loads ----- */
	async function loadCore() {
		clearMessage();
		var results = await Promise.all([
			apiGet("/api/admin/analytics/summary?" + filterQuery()),
			apiGet("/api/admin/analytics/charts?" + filterQuery())
		]);
		if (results[0] && results[0].data) renderSummary(results[0].data);
		if (results[1] && results[1].data) {
			state.charts = results[1].data;
			populateFilters(state.charts);
			renderTabCharts(state.activeTab);
		}
		if (!results[0] && !results[1]) {
			showMessage("error", "Could not load analytics. Please refresh or log in again.");
		}
	}

	async function loadLive() {
		var body = await apiGet("/api/admin/analytics/live");
		var rows = (body && body.data) || [];
		set("an-live-count", rows.length);
		var badge = $("an-live-badge"); if (badge) badge.textContent = rows.length;
		var tbody = $("an-live-rows");
		if (!tbody) return;
		if (!rows.length) { tbody.innerHTML = '<tr><td colspan="10" class="an-empty">No active visitors right now.</td></tr>'; return; }
		tbody.innerHTML = rows.map(function (r) {
			return "<tr>" +
				td(r.country || "Unknown") + td(r.city || "—") +
				td(r.current_page || "—") + td(r.device_type) + td(r.os || "—") +
				td(r.browser || "—") + td(r.referrer_source) + td(r.page_views) +
				td(fmtDuration(r.duration)) + '<td><span class="an-live-dot"></span>' + esc(timeAgo(r.last_activity)) + "</td>" +
				"</tr>";
		}).join("");
	}
	function td(v) { return "<td>" + esc(v) + "</td>"; }

	async function loadVisitors() {
		var tbody = $("an-visitor-rows");
		var search = ($("an-visitor-search") || {}).value || "";
		var body = await apiGet("/api/admin/analytics/visitors?" + filterQuery({ page: state.visitorPage, limit: 25, search: search }));
		var rows = (body && body.data) || [];
		if (!tbody) return;
		if (!rows.length) { tbody.innerHTML = '<tr><td colspan="12" class="an-empty">No visitors for this range.</td></tr>'; }
		else {
			tbody.innerHTML = rows.map(function (r) {
				var type = Number(r.is_returning) === 1 ? '<span class="an-tag an-tag-ret">Returning</span>' : '<span class="an-tag an-tag-new">New</span>';
				var applied = Number(r.applied) === 1
					? '<span class="an-tag an-tag-applied">' + esc(r.applied_type || "Applied") + "</span>"
					: '<span class="an-muted">—</span>';
				return "<tr>" +
					td(String(r.created_at).slice(0, 16)) + "<td>" + type + "</td>" + "<td>" + applied + "</td>" +
					td(r.country || "Unknown") + td(r.city || "—") + td(r.device_type) +
					td(r.os || "—") + td(r.browser || "—") + td(r.referrer_source) +
					'<td title="' + esc(r.landing_page) + '">' + esc(String(r.landing_page || "—").slice(0, 28)) + "</td>" +
					td(r.page_views) + td(fmtDuration(r.duration)) + "</tr>";
			}).join("");
		}
		renderPagination(body && body.meta);
	}

	function renderPagination(meta) {
		var el = $("an-visitor-pagination");
		if (!el || !meta) { if (el) el.innerHTML = ""; return; }
		var pages = meta.total_pages || 1, cur = meta.current_page || 1;
		var html = '<span class="an-page-info">' + (meta.total_records || 0) + " visitors · page " + cur + " of " + pages + "</span>";
		html += '<span class="an-page-btns">';
		html += '<button class="admin-ghost-btn" ' + (cur <= 1 ? "disabled" : "") + ' data-page="' + (cur - 1) + '">Prev</button>';
		html += '<button class="admin-ghost-btn" ' + (cur >= pages ? "disabled" : "") + ' data-page="' + (cur + 1) + '">Next</button>';
		html += "</span>";
		el.innerHTML = html;
		qsa("#an-visitor-pagination button[data-page]").forEach(function (b) {
			b.addEventListener("click", function () {
				var p = parseInt(b.getAttribute("data-page"), 10);
				if (p >= 1) { state.visitorPage = p; loadVisitors(); }
			});
		});
	}

	async function loadPages() {
		var body = await apiGet("/api/admin/analytics/pages?" + filterQuery());
		var d = (body && body.data) || {};
		renderRankList("an-most-visited", (d.most_visited || []).map(pageLabel));
		renderRankList("an-least-visited", (d.least_visited || []).map(pageLabel));
		renderRankList("an-landing", d.top_landing);
		renderRankList("an-exit", d.top_exit);
	}

	async function loadSettings() {
		var body = await apiGet("/api/admin/analytics/settings");
		var d = (body && body.data) || {};
		["tracking_enabled", "exclude_admin", "bot_detection", "geo_lookup", "session_timeout", "cleanup_days", "excluded_ips"].forEach(function (k) {
			var el = $("set-" + k);
			if (el && d[k] != null) el.value = d[k];
		});
	}

	/* -------------------------------------------------- tabs ----------- */
	function activateTab(tab) {
		state.activeTab = tab;
		qsa(".an-tab").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === tab); });
		qsa(".an-panel").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-panel") === tab); });

		if (tab === "live") { startLive(); } else { stopLive(); }
		if (tab === "visitors") loadVisitors();
		if (tab === "pages") loadPages();
		if (tab === "settings") loadSettings();
		if (["overview", "sources", "geo", "tech"].indexOf(tab) !== -1) renderTabCharts(tab);
	}

	function startLive() {
		loadLive();
		stopLive();
		if (($("an-live-toggle") || {}).checked) {
			state.liveTimer = setInterval(loadLive, 10000);
		}
	}
	function stopLive() { if (state.liveTimer) { clearInterval(state.liveTimer); state.liveTimer = null; } }

	/* -------------------------------------------------- export --------- */
	async function exportData(format) {
		if (format === "pdf") { window.print(); return; }
		showMessage("info", "Preparing " + format.toUpperCase() + " export…");
		try {
			var res = await fetch(API_BASE_URL + "/api/admin/analytics/export?format=" + format + "&" + filterQuery(), { headers: authHeaders() });
			if (!res.ok) { showMessage("error", "Export failed."); return; }
			var blob = await res.blob();
			var url = URL.createObjectURL(blob);
			var a = document.createElement("a");
			a.href = url;
			a.download = "analytics-visitors-" + new Date().toISOString().slice(0, 10) + (format === "excel" ? ".xls" : ".csv");
			document.body.appendChild(a); a.click(); document.body.removeChild(a);
			URL.revokeObjectURL(url);
			clearMessage();
		} catch (e) { showMessage("error", "Export failed."); }
	}

	/* -------------------------------------------------- events --------- */
	function bind() {
		qsa(".an-tab").forEach(function (b) {
			b.addEventListener("click", function () { activateTab(b.getAttribute("data-tab")); });
		});

		var range = $("an-range");
		if (range) range.addEventListener("change", function () {
			var custom = range.value === "custom";
			qsa(".an-custom").forEach(function (el) { el.classList.toggle("d-none", !custom); });
			if (!custom) reloadAll();
		});

		if ($("an-apply")) $("an-apply").addEventListener("click", reloadAll);
		if ($("an-refresh")) $("an-refresh").addEventListener("click", reloadAll);
		["an-country", "an-device", "an-browser", "an-os", "an-source", "an-applied"].forEach(function (id) {
			var el = $(id); if (el) el.addEventListener("change", reloadAll);
		});

		if ($("an-reset")) $("an-reset").addEventListener("click", function () {
			["an-country", "an-device", "an-browser", "an-os", "an-source", "an-applied"].forEach(function (id) { if ($(id)) $(id).value = ""; });
			if ($("an-range")) $("an-range").value = "30d";
			qsa(".an-custom").forEach(function (el) { el.classList.add("d-none"); });
			state.visitorPage = 1;
			reloadAll();
		});

		qsa("[data-export]").forEach(function (b) {
			b.addEventListener("click", function () { exportData(b.getAttribute("data-export")); });
		});

		var vs = $("an-visitor-search");
		if (vs) {
			var t = null;
			vs.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.visitorPage = 1; loadVisitors(); }, 400); });
		}

		var toggle = $("an-live-toggle");
		if (toggle) toggle.addEventListener("change", function () { if (state.activeTab === "live") startLive(); });

		var form = $("an-settings-form");
		if (form) form.addEventListener("submit", async function (e) {
			e.preventDefault();
			var payload = {};
			["tracking_enabled", "exclude_admin", "bot_detection", "geo_lookup", "session_timeout", "cleanup_days", "excluded_ips"].forEach(function (k) {
				var el = $("set-" + k); if (el) payload[k] = el.value;
			});
			var res = await apiPost("/api/admin/analytics/settings", payload);
			showMessage(res ? "success" : "error", res ? "Settings saved successfully." : "Could not save settings.");
		});

		if ($("an-run-cleanup")) $("an-run-cleanup").addEventListener("click", async function () {
			if (!confirm("Delete analytics records older than the retention window?")) return;
			var res = await apiPost("/api/admin/analytics/cleanup", {});
			showMessage(res ? "success" : "error", res ? ("Cleanup complete. Removed " + (res.data.removed || 0) + " old records.") : "Cleanup failed.");
			if (res) reloadAll();
		});

		var logout = $("admin-logout");
		if (logout) logout.addEventListener("click", function () {
			localStorage.removeItem("isAdminLoggedIn");
			localStorage.removeItem("adminToken");
			window.location.href = "/admin-login";
		});
	}

	function reloadAll() {
		state.visitorPage = 1;
		loadCore();
		if (state.activeTab === "live") startLive();
		if (state.activeTab === "visitors") loadVisitors();
		if (state.activeTab === "pages") loadPages();
	}

	/* -------------------------------------------------- init ----------- */
	bind();
	loadCore();
	/* Keep the live badge fresh even when not on the Live tab. */
	setInterval(async function () {
		var body = await apiGet("/api/admin/analytics/summary?" + filterQuery());
		if (body && body.data) {
			var badge = $("an-live-badge"); if (badge) badge.textContent = body.data.live;
			set("s-live", body.data.live);
		}
	}, 30000);
})();
