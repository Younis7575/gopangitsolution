const API_BASE_URL = "";

const newsList = document.getElementById("news-list");

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
		month: "short",
		day: "numeric",
	});
}

async function fetchJson(path) {
	const response = await fetch(API_BASE_URL + path, {
		headers: {
			Accept: "application/json",
		},
	});
	const result = await response.json();

	if (!response.ok || result.success === false) {
		throw new Error(result.message || "Unable to load news.");
	}

	return result;
}

function renderNews(items) {
	if (!Array.isArray(items) || items.length === 0) {
		newsList.innerHTML = '<div class="gis-news-empty"><h3>No news published yet.</h3><p>Please check back soon.</p></div>';
		return;
	}

	newsList.innerHTML = items
		.map(function (item) {
			const imageUrl = item.image_url || "/assets/img/blog/p1.jpg";
			return `
				<article class="gis-news-card">
					<div class="gis-news-card-image" style="background-image: url('${escapeHtml(imageUrl)}')"></div>
					<div class="gis-news-card-body">
						<div class="gis-news-meta">
							<span>${escapeHtml(item.author || "Admin")}</span>
							<span>${escapeHtml(formatDate(item.created_at))}</span>
						</div>
						<h2>${escapeHtml(item.title)}</h2>
						<p>${escapeHtml(item.short_description)}</p>
						<a href="/news-detail?slug=${encodeURIComponent(item.slug)}" class="theme-btn">Read More</a>
					</div>
				</article>
			`;
		})
		.join("");
}

async function loadNews() {
	try {
		const result = await fetchJson("/api/news");
		renderNews(result.data || []);
	} catch (error) {
		newsList.innerHTML = '<div class="gis-news-empty"><h3>Unable to load news.</h3><p>' + escapeHtml(error.message) + "</p></div>";
	}
}

loadNews();
