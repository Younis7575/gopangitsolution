/**
 * External technology-article preview page.
 * Fetches GET /api/news/external/{id} (server-cached NewsAPI article) and shows
 * an internal preview with clear publisher attribution. The full article opens
 * on the original publisher's site in a new tab (noopener/noreferrer/nofollow).
 * We never scrape or reproduce the publisher's complete article.
 */
(function () {
	"use strict";

	var API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";
	var PLACEHOLDER = "/assets/img/blog/p1.jpg";

	var root = document.getElementById("news-external");
	if (!root) {
		return;
	}

	var params = new URLSearchParams(window.location.search);
	var id = params.get("id");

	function escapeHtml(value) {
		return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
		});
	}

	function escapeAttr(value) {
		return escapeHtml(value);
	}

	function isSafeHttpUrl(value) {
		if (!value) {
			return false;
		}
		try {
			var u = new URL(value, window.location.origin);
			return u.protocol === "http:" || u.protocol === "https:";
		} catch (e) {
			return false;
		}
	}

	function formatDate(value) {
		if (!value) {
			return "";
		}
		var d = new Date(value);
		if (isNaN(d.getTime())) {
			return "";
		}
		return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
	}

	function renderMessage(title, message) {
		root.innerHTML =
			'<div class="gis-news-empty"><i class="fas fa-newspaper"></i><h3>' +
			escapeHtml(title) + "</h3><p>" + escapeHtml(message) + "</p>" +
			'<a href="/news" class="theme-btn">Back to News</a></div>';
	}

	function render(item) {
		document.title = (item.title || "Technology Article") + " | Gopang IT Solution";

		var image = item.imageUrl || PLACEHOLDER;
		var author = item.author ? "<span>" + escapeHtml(item.author) + "</span>" : "";
		var readTime = item.readingTime ? "<span>" + escapeHtml(item.readingTime + " min read") + "</span>" : "";
		var safeUrl = isSafeHttpUrl(item.originalUrl) ? item.originalUrl : "";

		var readFullBtn = safeUrl
			? '<a href="' + escapeAttr(safeUrl) + '" class="theme-btn" target="_blank" rel="noopener noreferrer nofollow">' +
			  'Read Full Article <i class="fas fa-arrow-up-right-from-square"></i></a>'
			: "";

		root.innerHTML =
			'<article class="gis-ext-article">' +
			'<div class="gis-ext-image">' +
			'<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(item.title) + '" ' +
			"onerror=\"this.onerror=null;this.src='" + PLACEHOLDER + "';\">" +
			'<span class="gis-ext-badge">Technology</span>' +
			"</div>" +
			'<div class="gis-ext-body">' +
			'<div class="gis-ext-source-note"><i class="fas fa-globe"></i> External Technology News' +
			(item.sourceName ? " — via " + escapeHtml(item.sourceName) : "") + "</div>" +
			"<h1>" + escapeHtml(item.title) + "</h1>" +
			'<div class="gis-news-meta">' +
			"<span>" + escapeHtml(item.sourceName || "") + "</span>" +
			author +
			"<span>" + escapeHtml(formatDate(item.publishedAt)) + "</span>" +
			readTime +
			"</div>" +
			(item.description ? '<p class="gis-ext-content"><strong>' + escapeHtml(item.description) + "</strong></p>" : "") +
			(item.contentPreview ? '<div class="gis-ext-content">' + escapeHtml(item.contentPreview) + "</div>" : "") +
			'<div class="gis-ext-actions">' +
			readFullBtn +
			'<a href="/news" class="theme-btn-outline">Back to News</a>' +
			"</div>" +
			'<p class="gis-ext-attribution">This is a preview. Full article &copy; ' +
			escapeHtml(item.sourceName || "the original publisher") +
			". Gopang IT Solution does not claim ownership of external content.</p>" +
			"</div></article>";
	}

	if (!id) {
		renderMessage("Article not specified", "No article was selected. Please return to the news page.");
		return;
	}

	fetch(API_BASE_URL + "/api/news/external/" + encodeURIComponent(id), {
		headers: { Accept: "application/json" },
	})
		.then(function (response) {
			return response.json().then(function (body) {
				return { ok: response.ok, body: body };
			});
		})
		.then(function (result) {
			var body = result.body || {};
			if (!result.ok || body.success === false || !body.data) {
				renderMessage(
					"Article unavailable",
					body.message || "This article may have expired from our cache. Please browse the latest news."
				);
				return;
			}
			render(body.data);
		})
		.catch(function () {
			renderMessage("Unable to load article", "Please check your connection and try again.");
		});
})();
