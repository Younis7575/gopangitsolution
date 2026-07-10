/**
 * Public technology-news listing.
 * Consumes GET /api/news/technology (merged company + external NewsAPI feed).
 * The NewsAPI key lives ONLY on the server; this file never sees it.
 */
(function () {
	"use strict";

	var API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";
	var PLACEHOLDER = "/assets/img/blog/p1.jpg";
	var PAGE_SIZE = 9;
	var SEARCH_DEBOUNCE = 450;

	var listEl = document.getElementById("news-list");
	var searchEl = document.getElementById("news-search");
	var sortEl = document.getElementById("news-sort");
	var loadMoreEl = document.getElementById("news-load-more");
	var loadMoreWrap = document.getElementById("news-load-more-wrap");
	var countEl = document.getElementById("news-result-count");

	if (!listEl) {
		return;
	}

	var state = {
		page: 1,
		search: "",
		sort: "latest",
		loading: false,
		hasNext: false,
		total: 0,
		requestSeq: 0,
	};
	var debounceTimer = null;

	function escapeHtml(value) {
		return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
		});
	}

	function escapeAttr(value) {
		return escapeHtml(value).replace(/`/g, "&#096;");
	}

	function formatDate(value) {
		if (!value) {
			return "";
		}
		var d = new Date(value);
		if (isNaN(d.getTime())) {
			return "";
		}
		return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
	}

	function skeletonMarkup(count) {
		var cards = "";
		for (var i = 0; i < count; i++) {
			cards +=
				'<article class="gis-news-card gis-news-skeleton" aria-hidden="true">' +
				'<div class="gis-news-card-image gis-skel"></div>' +
				'<div class="gis-news-card-body">' +
				'<div class="gis-skel gis-skel-line" style="width:40%"></div>' +
				'<div class="gis-skel gis-skel-line gis-skel-title"></div>' +
				'<div class="gis-skel gis-skel-line"></div>' +
				'<div class="gis-skel gis-skel-line" style="width:80%"></div>' +
				'<div class="gis-skel gis-skel-btn"></div>' +
				"</div></article>";
		}
		return cards;
	}

	function cardMarkup(item) {
		var isExternal = !!item.isExternal;
		var image = item.imageUrl || PLACEHOLDER;
		var href = isExternal
			? "/news-external?id=" + encodeURIComponent(item.id)
			: "/news-detail?slug=" + encodeURIComponent(item.slug);
		var sourceLabelClass = isExternal ? "gis-news-flag external" : "gis-news-flag company";
		var readTime = item.readingTime ? item.readingTime + " min read" : "";
		var authorBit = item.author ? "<span>" + escapeHtml(item.author) + "</span>" : "";

		return (
			'<article class="gis-news-card">' +
			'<div class="gis-news-card-image">' +
			'<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(item.title) + '" loading="lazy" ' +
			"onerror=\"this.onerror=null;this.src='" + PLACEHOLDER + "';\">" +
			'<span class="gis-news-badge">Technology</span>' +
			"</div>" +
			'<div class="gis-news-card-body">' +
			'<div class="gis-news-flags">' +
			'<span class="' + sourceLabelClass + '">' +
			(isExternal ? '<i class="fas fa-globe"></i> ' : '<i class="fas fa-building"></i> ') +
			escapeHtml(item.sourceLabel || (isExternal ? "External Technology News" : "Company News")) +
			"</span>" +
			"</div>" +
			"<h2>" + escapeHtml(item.title) + "</h2>" +
			"<p>" + escapeHtml(item.description || "") + "</p>" +
			'<div class="gis-news-meta">' +
			"<span>" + escapeHtml(item.sourceName || "") + "</span>" +
			authorBit +
			"<span>" + escapeHtml(formatDate(item.publishedAt)) + "</span>" +
			(readTime ? "<span>" + escapeHtml(readTime) + "</span>" : "") +
			"</div>" +
			'<a href="' + escapeAttr(href) + '" class="theme-btn gis-news-readmore"' +
			(isExternal ? "" : "") +
			">Read More" +
			(isExternal ? ' <i class="fas fa-arrow-up-right-from-square"></i>' : ' <i class="fas fa-arrow-right"></i>') +
			"</a>" +
			"</div></article>"
		);
	}

	function renderEmpty() {
		listEl.innerHTML =
			'<div class="gis-news-empty"><i class="fas fa-newspaper"></i><h3>No technology news found.</h3>' +
			"<p>" + (state.search ? "Try a different search term." : "Please check back soon.") + "</p>" +
			(state.search ? '<button type="button" class="theme-btn" id="news-clear-search">Clear Search</button>' : "") +
			"</div>";
		var clearBtn = document.getElementById("news-clear-search");
		if (clearBtn) {
			clearBtn.addEventListener("click", function () {
				if (searchEl) {
					searchEl.value = "";
				}
				state.search = "";
				reload();
			});
		}
	}

	function renderError(message) {
		listEl.innerHTML =
			'<div class="gis-news-empty gis-news-error"><i class="fas fa-triangle-exclamation"></i>' +
			"<h3>Unable to load news.</h3><p>" + escapeHtml(message || "Something went wrong.") + "</p>" +
			'<button type="button" class="theme-btn" id="news-retry">Retry</button></div>';
		var retry = document.getElementById("news-retry");
		if (retry) {
			retry.addEventListener("click", reload);
		}
	}

	function updateCount() {
		if (!countEl) {
			return;
		}
		if (state.total > 0) {
			countEl.textContent = state.total + (state.total === 1 ? " article" : " articles");
		} else {
			countEl.textContent = "";
		}
	}

	function toggleLoadMore() {
		if (!loadMoreWrap) {
			return;
		}
		loadMoreWrap.style.display = state.hasNext ? "" : "none";
		if (loadMoreEl) {
			loadMoreEl.disabled = state.loading;
			loadMoreEl.textContent = state.loading ? "Loading..." : "Load More Articles";
		}
	}

	function buildUrl() {
		var params = new URLSearchParams();
		params.set("page", String(state.page));
		params.set("pageSize", String(PAGE_SIZE));
		params.set("sort", state.sort);
		if (state.search) {
			params.set("search", state.search);
		}
		return API_BASE_URL + "/api/news/technology?" + params.toString();
	}

	function fetchFeed(append) {
		if (state.loading) {
			return;
		}
		state.loading = true;
		var seq = ++state.requestSeq;

		if (!append) {
			listEl.innerHTML = skeletonMarkup(PAGE_SIZE);
		} else {
			toggleLoadMore();
		}

		fetch(buildUrl(), { headers: { Accept: "application/json" } })
			.then(function (response) {
				return response.json().then(function (body) {
					return { ok: response.ok, body: body };
				});
			})
			.then(function (result) {
				if (seq !== state.requestSeq) {
					return; // a newer request superseded this one
				}
				state.loading = false;
				var body = result.body || {};
				if (!result.ok || body.success === false) {
					throw new Error(body.message || "Unable to load news.");
				}
				var items = Array.isArray(body.data) ? body.data : [];
				var pagination = body.pagination || {};
				state.hasNext = !!pagination.hasNextPage;
				state.total = pagination.totalResults || items.length;

				if (!append) {
					if (items.length === 0) {
						renderEmpty();
						toggleLoadMore();
						updateCount();
						return;
					}
					listEl.innerHTML = items.map(cardMarkup).join("");
				} else {
					listEl.insertAdjacentHTML("beforeend", items.map(cardMarkup).join(""));
				}
				updateCount();
				toggleLoadMore();
			})
			.catch(function (error) {
				if (seq !== state.requestSeq) {
					return;
				}
				state.loading = false;
				if (!append) {
					renderError(error.message);
				}
				state.hasNext = false;
				toggleLoadMore();
			});
	}

	function reload() {
		state.page = 1;
		fetchFeed(false);
	}

	if (searchEl) {
		searchEl.addEventListener("input", function () {
			window.clearTimeout(debounceTimer);
			var value = searchEl.value.trim();
			debounceTimer = window.setTimeout(function () {
				if (value === state.search) {
					return;
				}
				state.search = value;
				reload();
			}, SEARCH_DEBOUNCE);
		});
	}

	if (sortEl) {
		sortEl.addEventListener("change", function () {
			state.sort = sortEl.value === "oldest" ? "oldest" : "latest";
			reload();
		});
	}

	if (loadMoreEl) {
		loadMoreEl.addEventListener("click", function () {
			if (state.loading || !state.hasNext) {
				return;
			}
			state.page += 1;
			fetchFeed(true);
		});
	}

	reload();
})();
