/** Public news listing powered only by NewsData.io. */
(function () {
	"use strict";

	var API_URL = "https://newsdata.io/api/1/latest";
	var API_KEY = "pub_9c9bf29845024ac7bbd61fa16844c489";
	var PLACEHOLDER = "/assets/img/blog/p1.jpg";
	var listEl = document.getElementById("news-list");
	var searchEl = document.getElementById("news-search");
	var sortEl = document.getElementById("news-sort");
	var loadMoreEl = document.getElementById("news-load-more");
	var loadMoreWrap = document.getElementById("news-load-more-wrap");
	var countEl = document.getElementById("news-result-count");
	var articles = [];
	var nextPage = null;
	var loading = false;

	if (!listEl) return;

	function escapeHtml(value) {
		return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
		});
	}

	function validHttpUrl(value) {
		try { var url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
		catch (error) { return false; }
	}

	function formatDate(value) {
		if (!value) return "";
		var date = new Date(String(value).replace(" ", "T") + (String(value).indexOf("Z") < 0 ? "Z" : ""));
		return isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
	}

	function card(item) {
		var link = validHttpUrl(item.link) ? item.link : "#";
		var image = validHttpUrl(item.image_url) ? item.image_url : PLACEHOLDER;
		var category = Array.isArray(item.category) && item.category.length ? item.category[0] : "Latest";
		var author = Array.isArray(item.creator) ? item.creator.join(", ") : (item.creator || "");
		return '<article class="gis-news-card"><div class="gis-news-card-image">' +
			'<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\';">' +
			'<span class="gis-news-badge">' + escapeHtml(category) + '</span></div><div class="gis-news-card-body">' +
			'<div class="gis-news-flags"><span class="gis-news-flag external"><i class="fas fa-globe"></i> News API</span></div>' +
			'<h2>' + escapeHtml(item.title || "Untitled article") + '</h2><p>' + escapeHtml(item.description || "") + '</p>' +
			'<div class="gis-news-meta"><span>' + escapeHtml(item.source_name || item.source_id || "News") + '</span>' +
			(author ? '<span>' + escapeHtml(author) + '</span>' : '') + '<span>' + escapeHtml(formatDate(item.pubDate)) + '</span></div>' +
			'<a href="' + escapeHtml(link) + '" class="theme-btn gis-news-readmore" target="_blank" rel="noopener noreferrer">Read More <i class="fas fa-arrow-up-right-from-square"></i></a></div></article>';
	}

	function visibleArticles() {
		var query = searchEl ? searchEl.value.trim().toLowerCase() : "";
		var result = articles.filter(function (item) {
			return !query || [item.title, item.description, item.source_name].join(" ").toLowerCase().indexOf(query) !== -1;
		});
		result.sort(function (a, b) {
			var difference = new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
			return sortEl && sortEl.value === "oldest" ? -difference : difference;
		});
		return result;
	}

	function render() {
		var items = visibleArticles();
		listEl.innerHTML = items.length ? items.map(card).join("") : '<div class="gis-news-empty"><i class="fas fa-newspaper"></i><h3>No news found.</h3><p>Try a different search term.</p></div>';
		if (countEl) countEl.textContent = items.length + (items.length === 1 ? " article" : " articles");
		if (loadMoreWrap) loadMoreWrap.style.display = nextPage ? "" : "none";
	}

	function load(append) {
		if (loading) return;
		loading = true;
		if (!append) listEl.innerHTML = '<div class="gis-news-loading"><p>Loading latest news...</p></div>';
		if (loadMoreEl) { loadMoreEl.disabled = true; loadMoreEl.textContent = "Loading..."; }
		var url = API_URL + "?apikey=" + encodeURIComponent(API_KEY) + (append && nextPage ? "&page=" + encodeURIComponent(nextPage) : "");
		fetch(url, { headers: { Accept: "application/json" } }).then(function (response) {
			return response.json().then(function (body) { if (!response.ok || body.status !== "success") throw new Error(body.results && body.results.message || body.message || "Unable to load news."); return body; });
		}).then(function (body) {
			var incoming = Array.isArray(body.results) ? body.results : [];
			articles = append ? articles.concat(incoming.filter(function (item) { return !articles.some(function (old) { return old.article_id === item.article_id; }); })) : incoming;
			nextPage = body.nextPage || null;
			render();
		}).catch(function (error) {
			if (!append) listEl.innerHTML = '<div class="gis-news-empty gis-news-error"><h3>Unable to load news.</h3><p>' + escapeHtml(error.message) + '</p><button class="theme-btn" id="news-retry">Retry</button></div>';
			var retry = document.getElementById("news-retry"); if (retry) retry.onclick = function () { load(false); };
		}).finally(function () { loading = false; if (loadMoreEl) { loadMoreEl.disabled = false; loadMoreEl.textContent = "Load More Articles"; } });
	}

	if (searchEl) searchEl.addEventListener("input", render);
	if (sortEl) sortEl.addEventListener("change", render);
	if (loadMoreEl) loadMoreEl.addEventListener("click", function () { load(true); });
	load(false);
})();
