const API_BASE_URL = "";

const detailRoot = document.getElementById("news-detail");
const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

function escapeHtml(value) {
	return String(value || "").replace(/[&<>"']/g, function (char) {
		return {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#039;",
		}[char];
	});
}

function formatDate(value) {
	if (!value) {
		return "";
	}

	return new Date(value).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

async function fetchNewsDetail() {
	if (!slug) {
		throw new Error("News slug is missing.");
	}

	const response = await fetch(API_BASE_URL + "/api/news/slug/" + encodeURIComponent(slug), {
		headers: {
			Accept: "application/json",
		},
	});
	const result = await response.json();

	if (!response.ok || result.success === false) {
		throw new Error(result.message || "Unable to load article.");
	}

	return result.data;
}

function setMeta(attr, key, content) {
	if (!content) {
		return;
	}
	let el = document.head.querySelector(`meta[${attr}="${key}"]`);
	if (!el) {
		el = document.createElement("meta");
		el.setAttribute(attr, key);
		document.head.appendChild(el);
	}
	el.setAttribute("content", content);
}

function setCanonical(href) {
	let el = document.head.querySelector('link[rel="canonical"]');
	if (!el) {
		el = document.createElement("link");
		el.setAttribute("rel", "canonical");
		document.head.appendChild(el);
	}
	el.setAttribute("href", href);
}

function applySeo(item) {
	const title = (item.seo_title || item.title) + " | Gopang IT Solution";
	const description = item.meta_description || item.short_description || "";
	const image = item.image_url || "/assets/img/blog/p1.jpg";
	const canonical = window.location.origin + "/news-detail?slug=" + encodeURIComponent(item.slug || "");

	document.title = title;
	setMeta("name", "description", description);
	setCanonical(canonical);
	setMeta("property", "og:type", "article");
	setMeta("property", "og:title", item.seo_title || item.title);
	setMeta("property", "og:description", description);
	setMeta("property", "og:image", image);
	setMeta("property", "og:url", canonical);
	setMeta("name", "twitter:card", "summary_large_image");
	setMeta("name", "twitter:title", item.seo_title || item.title);
	setMeta("name", "twitter:description", description);
	setMeta("name", "twitter:image", image);
}

function renderDetail(item) {
	const imageUrl = item.image_url || "/assets/img/blog/p1.jpg";
	applySeo(item);

	detailRoot.innerHTML = `
		<article class="gis-news-detail-article">
			<div class="gis-news-detail-image" style="background-image: url('${escapeHtml(imageUrl)}')"></div>
			<div class="gis-news-detail-body">
				<div class="gis-news-meta">
					<span>${escapeHtml(item.author || "Admin")}</span>
					<span>${escapeHtml(formatDate(item.published_at || item.created_at))}</span>
				</div>
				<h1>${escapeHtml(item.title)}</h1>
				<div class="gis-news-detail-content">${escapeHtml(item.content)}</div>
			</div>
		</article>
	`;
}

async function loadDetail() {
	try {
		const item = await fetchNewsDetail();
		renderDetail(item);
	} catch (error) {
		detailRoot.innerHTML = '<div class="gis-news-empty"><h3>Unable to load article.</h3><p>' + escapeHtml(error.message) + '</p><a href="/news" class="theme-btn">Back to News</a></div>';
	}
}

loadDetail();
