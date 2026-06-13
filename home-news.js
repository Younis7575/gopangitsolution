const API_BASE_URL = "https://job-api.gopangit.workers.dev";

const homeNewsList = document.getElementById("home-news-list");

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

async function fetchNews() {
	const response = await fetch(API_BASE_URL + "/api/news", {
		headers: {
			Accept: "application/json",
		},
	});
	const result = await response.json();

	if (!response.ok || result.success === false) {
		throw new Error(result.message || "Unable to load latest articles.");
	}

	return result.data || [];
}

function renderHomeNews(items) {
	const publishedNews = items
		.filter(function (item) {
			return !item.status || item.status === "published";
		})
		.slice(0, 3);

	if (publishedNews.length === 0) {
		homeNewsList.innerHTML = '<div class="col-12 text-center"><p class="mb-0">No articles published yet.</p></div>';
		return;
	}

	homeNewsList.innerHTML = publishedNews
		.map(function (item) {
			const imageUrl = item.image_url || "assets/img/blog/b1.jpg";
			const detailUrl = "news-detail.html?slug=" + encodeURIComponent(item.slug);
			return `
				<div class="col-xl-4 col-md-6 gis-reveal">
					<article class="single-blog-item">
						<div class="post-featured-thumb bg-cover" style="background-image:url('${escapeHtml(imageUrl)}')">
							<div class="post-cat"><a href="news.html">${escapeHtml(item.author || "News")}</a></div>
						</div>
						<div class="content">
							<div class="post-meta">
								<span class="post-date"><i class="fal fa-calendar-alt" aria-hidden="true"></i>${escapeHtml(formatDate(item.created_at))}</span>
							</div>
							<h3><a href="${detailUrl}">${escapeHtml(item.title)}</a></h3>
							<p>${escapeHtml(item.short_description)}</p>
						</div>
					</article>
				</div>
			`;
		})
		.join("");
}

async function loadHomeNews() {
	if (!homeNewsList) {
		return;
	}

	try {
		const items = await fetchNews();
		renderHomeNews(items);
	} catch (error) {
		homeNewsList.innerHTML = '<div class="col-12 text-center"><p class="mb-0 text-danger">' + escapeHtml(error.message) + "</p></div>";
	}
}

loadHomeNews();
