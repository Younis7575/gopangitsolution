const API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";
const detailRoot = document.getElementById("solution-detail");

function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, function (char) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[char];
    });
}

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

function getSlugFromPath() {
    const segments = window.location.pathname.split('/').filter(Boolean);
    if (!segments.length) return '';
    return segments[segments.length - 1];
}

function renderTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) {
        return '';
    }
    return tags.map(function (tag) {
        return `<a href="/solutions?tag=${encodeURIComponent(tag.slug)}" class="solutions-chip">${escapeHtml(tag.name)}</a>`;
    }).join('');
}

function renderDetail(item) {
    const isSolved = String(item.solved_status || 'unsolved') === 'solved';
    const statusClass = isSolved ? 'solved' : 'unsolved';
    document.title = `${item.title} | Gopang IT Solution`;

    detailRoot.innerHTML = `
        <article class="solutions-detail-card">
            <div class="solutions-detail-header">
                <div>
                    <span class="solutions-category">${escapeHtml(item.category_name || 'General')}</span>
                    <span class="solutions-status ${statusClass}">${isSolved ? 'Solved' : 'Unsolved'}</span>
                </div>
                <div class="solutions-detail-meta">
                    <span>${escapeHtml(item.visitor_name || 'Guest')}</span>
                    <span>${escapeHtml(formatDate(item.created_at))}</span>
                </div>
            </div>
            <h1>${escapeHtml(item.title)}</h1>
            <div class="solutions-detail-summary">
                <p>${escapeHtml(item.short_description || item.description || '')}</p>
            </div>
            <div class="solutions-detail-content">
                <h2>Problem</h2>
                <p>${escapeHtml(item.description || '')}</p>
                ${item.technologies ? `<div class="solutions-detail-block"><strong>Technologies:</strong> ${escapeHtml(item.technologies)}</div>` : ''}
                ${item.error_message ? `<div class="solutions-detail-block"><strong>Error Message:</strong> <pre>${escapeHtml(item.error_message)}</pre></div>` : ''}
                ${item.code_snippet ? `<div class="solutions-detail-block"><strong>Code Snippet:</strong><pre>${escapeHtml(item.code_snippet)}</pre></div>` : ''}
                ${item.expected_result ? `<div class="solutions-detail-block"><strong>Expected Result:</strong> <p>${escapeHtml(item.expected_result)}</p></div>` : ''}
                ${item.actual_result ? `<div class="solutions-detail-block"><strong>Actual Result:</strong> <p>${escapeHtml(item.actual_result)}</p></div>` : ''}
                ${item.attachment_file_name ? `<div class="solutions-detail-block"><strong>Attachment:</strong> <a href="/api/solutions/${encodeURIComponent(item.id)}/attachment" download>${escapeHtml(item.attachment_file_name)}</a></div>` : ''}
            </div>
            <div class="solutions-detail-stats">
                <span>${escapeHtml(item.views_count || 0)} views</span>
                <span>${escapeHtml(item.comments_count || 0)} answers</span>
            </div>
            <div class="solutions-detail-tags">
                ${renderTags(item.tags)}
            </div>
            <div class="solutions-detail-actions">
                <a href="/solutions" class="theme-btn-outline">Back to all questions</a>
                <a href="/solutions/ask" class="theme-btn">Ask a Question</a>
            </div>
        </article>
    `;
}

function renderError(error) {
    detailRoot.innerHTML = `
        <div class="solutions-empty">
            <h3>Unable to load question.</h3>
            <p>${escapeHtml(error.message)}</p>
            <a href="/solutions" class="theme-btn">Back to Solutions</a>
        </div>
    `;
}

async function loadDetail() {
    const slug = getSlugFromPath();
    if (!slug) {
        renderError(new Error('Question slug is missing.'));
        return;
    }
    try {
        const response = await fetch(API_BASE_URL + '/api/solutions/slug/' + encodeURIComponent(slug), {
            headers: { Accept: 'application/json' },
        });
        const result = await response.json();
        if (!response.ok || result.success === false) {
            throw new Error(result.message || 'Unable to load question details.');
        }
        renderDetail(result.data);
    } catch (error) {
        renderError(error);
    }
}

loadDetail();
