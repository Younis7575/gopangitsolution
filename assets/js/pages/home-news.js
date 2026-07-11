(function () {
	"use strict";
	var root = document.getElementById("home-news-list");
	if (!root) return;
	var endpoint = "https://newsdata.io/api/1/latest?apikey=pub_9c9bf29845024ac7bbd61fa16844c489";
	function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }
	function date(value) { var d = new Date(String(value || "").replace(" ", "T") + "Z"); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
	function render(items) {
		root.innerHTML = items.slice(0, 3).map(function (item) {
			var image = /^https?:\/\//i.test(item.image_url || "") ? item.image_url : "/assets/img/blog/b1.jpg";
			return '<div class="col-xl-4 col-md-6 gis-reveal"><article class="single-blog-item"><div class="post-featured-thumb bg-cover" style="background-image:url(&quot;' + esc(image) + '&quot;)"><div class="post-cat"><a href="/news">' + esc(item.source_name || "News") + '</a></div></div><div class="content"><div class="post-meta"><span class="post-date"><i class="fal fa-calendar-alt" aria-hidden="true"></i>' + esc(date(item.pubDate)) + '</span></div><h3><a href="' + esc(item.link || "#") + '" target="_blank" rel="noopener noreferrer">' + esc(item.title || "Latest news") + '</a></h3><p>' + esc(item.description || "") + '</p></div></article></div>';
		}).join("") || '<div class="col-12 text-center"><p class="mb-0">No news available.</p></div>';
	}
	fetch(endpoint, { headers: { Accept: "application/json" } }).then(function (r) { return r.json().then(function (b) { if (!r.ok || b.status !== "success") throw new Error(b.message || "Unable to load news."); return b; }); }).then(function (body) { render(Array.isArray(body.results) ? body.results : []); }).catch(function (error) { root.innerHTML = '<div class="col-12 text-center"><p class="mb-0 text-danger">' + esc(error.message) + '</p></div>'; });
})();
