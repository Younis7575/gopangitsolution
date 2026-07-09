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

function renderDetail(item) {
	const imageUrl = item.image_url || "/assets/img/blog/p1.jpg";
	document.title = item.title + " | Gopang IT Solution";

	detailRoot.innerHTML = `
		<article class="gis-news-detail-article">
			<div class="gis-news-detail-image" style="background-image: url('${escapeHtml(imageUrl)}')"></div>
			<div class="gis-news-detail-body">
				<div class="gis-news-meta">
					<span>${escapeHtml(item.author || "Admin")}</span>
					<span>${escapeHtml(formatDate(item.created_at))}</span>
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
