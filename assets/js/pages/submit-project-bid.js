document.addEventListener("DOMContentLoaded", async function () {
	const API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";
	const projectId = Number(new URLSearchParams(window.location.search).get("id"));
	const state = document.getElementById("bid-page-state");
	const layout = document.getElementById("bid-page-layout");
	const summary = document.getElementById("bid-project-summary");
	const form = document.getElementById("project-bid-page-form");
	const idField = document.getElementById("bid-page-project-id");
	const submit = document.getElementById("bid-page-submit");
	const message = document.getElementById("bid-page-message");
	const back = document.getElementById("back-to-project");

	function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }
	function show(type, text) { message.className = "alert alert-" + type; message.textContent = text; message.scrollIntoView({ behavior: "smooth", block: "center" }); }
	function fail(text) { state.className = "marketplace-state error"; state.innerHTML = "<h3>Unable to submit a proposal</h3><p>" + escapeHtml(text) + "</p><a href=\"/project-based-hiring\" class=\"theme-btn\">Browse Projects</a>"; }
	function validate(data) {
		for (const field of ["full_name", "email", "phone", "bid_amount", "delivery_days", "cover_letter"]) if (!String(data.get(field) || "").trim()) return "Please complete all required fields.";
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.get("email")))) return "Please enter a valid email address.";
		if (!/^[+()\d\s-]{7,20}$/.test(String(data.get("phone")))) return "Please enter a valid WhatsApp number.";
		if (!(Number(data.get("bid_amount")) > 0)) return "Bid amount must be greater than zero.";
		if (!Number.isInteger(Number(data.get("delivery_days"))) || Number(data.get("delivery_days")) <= 0) return "Delivery days must be a positive whole number.";
		const file = data.get("attachment");
		if (file && file.name && (!/\.(pdf|doc|docx|jpg|jpeg|png|webp)$/i.test(file.name) || file.size > 8 * 1024 * 1024)) return "Attachment must be an allowed file type and no larger than 8MB.";
		return "";
	}

	if (!Number.isInteger(projectId) || projectId <= 0) { fail("A valid project was not selected."); return; }
	try {
		const response = await fetch(API_BASE_URL + "/api/bid-projects/" + projectId, { headers: { Accept: "application/json" } });
		const result = await response.json();
		if (!response.ok || result.success === false) throw new Error(result.message || "Selected project could not be loaded.");
		if (String(result.data.status || "Open") !== "Open") throw new Error("This project is no longer accepting proposals.");
		const project = result.data;
		idField.value = project.id; back.href = "/project-bid-detail?id=" + encodeURIComponent(project.id);
		summary.innerHTML = "<h2>" + escapeHtml(project.title) + "</h2><p>" + escapeHtml(project.description) + "</p><div><span>Category</span><strong>" + escapeHtml(project.category) + "</strong></div><div><span>Duration</span><strong>" + escapeHtml(project.duration || "Flexible") + "</strong></div>";
		state.classList.add("d-none"); layout.classList.remove("d-none");
	} catch (error) { fail(error.message || "Selected project could not be loaded."); return; }

	form.addEventListener("submit", async function (event) {
		event.preventDefault(); if (submit.disabled) return;
		const data = new FormData(form); data.set("project_id", String(projectId));
		const validationError = validate(data); if (validationError) { show("danger", validationError); return; }
		submit.disabled = true; submit.textContent = "Submitting Proposal...";
		try {
			const response = await fetch(API_BASE_URL + "/api/bid-projects/" + projectId + "/bids", { method: "POST", headers: { Accept: "application/json" }, body: data });
			const result = await response.json(); if (!response.ok || result.success === false) throw new Error(result.message || "Proposal submission failed.");
			form.reset(); idField.value = projectId; show("success", result.message || "Your proposal was submitted successfully.");
		} catch (error) { show("danger", error.message || "Proposal submission failed. Please try again."); }
		finally { submit.disabled = false; submit.textContent = "Submit Proposal"; }
	});
});
