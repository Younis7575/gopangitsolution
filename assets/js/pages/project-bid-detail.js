document.addEventListener("DOMContentLoaded", async function () {
	const API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";
	const params = new URLSearchParams(window.location.search);
	const projectId = Number(params.get("id"));
	const state = document.getElementById("project-detail-state");
	const layout = document.getElementById("project-detail-page");
	const main = document.getElementById("project-detail-main");
	const summary = document.getElementById("project-detail-summary");
	const title = document.getElementById("detail-page-title");
	const proposalLink = document.getElementById("submit-proposal-link");

	function escapeHtml(value) {
		return String(value || "").replace(/[&<>"']/g, function (char) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
		});
	}
	function money(value) { return value !== null && value !== "" ? "$" + Number(value).toLocaleString() : ""; }
	function budget(project) {
		const suffix = project.budget_type === "Hourly" ? " / hr" : "";
		if (project.budget_min && project.budget_max) return money(project.budget_min) + " – " + money(project.budget_max) + suffix;
		if (project.budget_max) return "Up to " + money(project.budget_max) + suffix;
		if (project.budget_min) return "From " + money(project.budget_min) + suffix;
		return "Budget on discussion";
	}
	function skillTags(value) {
		const skills = String(value || "").split(/,|\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
		return skills.length ? skills.map(function (skill) { return "<span>" + escapeHtml(skill) + "</span>"; }).join("") : "<em>Skills will be discussed with the selected freelancer.</em>";
	}
	function fail(message) {
		state.className = "marketplace-state error";
		state.innerHTML = "<h3>Project unavailable</h3><p>" + escapeHtml(message) + "</p><a href=\"/project-based-hiring\" class=\"theme-btn\">Browse Projects</a>";
	}

	if (!Number.isInteger(projectId) || projectId <= 0) { fail("A valid project was not selected."); return; }
	try {
		const response = await fetch(API_BASE_URL + "/api/bid-projects/" + projectId, { headers: { Accept: "application/json" } });
		const result = await response.json();
		if (!response.ok || result.success === false) throw new Error(result.message || "Unable to load this project.");
		const project = result.data;
		if (String(project.status || "Open") !== "Open") throw new Error("This project is no longer accepting proposals.");
		document.title = project.title + " | Gopang IT Solution";
		title.textContent = project.title;
		main.innerHTML =
			'<div class="marketplace-detail-labels"><span>' + escapeHtml(project.category) + '</span><span class="open">Open</span></div>' +
			'<h2>Project Description</h2><p class="marketplace-description">' + escapeHtml(project.description) + '</p>' +
			'<h2>Skills and Expertise</h2><div class="marketplace-skill-tags">' + skillTags(project.skills) + "</div>";
		summary.innerHTML =
			'<h3>Project Overview</h3>' +
			'<div><span>Budget</span><strong>' + escapeHtml(budget(project)) + '</strong></div>' +
			'<div><span>Project type</span><strong>' + escapeHtml(project.budget_type || "Fixed") + '</strong></div>' +
			'<div><span>Duration</span><strong>' + escapeHtml(project.duration || "Flexible") + '</strong></div>' +
			'<div><span>Experience</span><strong>' + escapeHtml(project.experience_level || "Any level") + '</strong></div>' +
			'<div><span>Deadline</span><strong>' + escapeHtml(project.deadline || "Open until filled") + '</strong></div>' +
			'<div><span>Proposals</span><strong>' + escapeHtml(project.bid_count || 0) + " submitted</strong></div>";
		proposalLink.href = "/submit-project-bid?id=" + encodeURIComponent(project.id);
		state.classList.add("d-none"); layout.classList.remove("d-none");
	} catch (error) { fail(error.message || "Unable to load this project."); }
});
