document.addEventListener("DOMContentLoaded", function () {
	const API_BASE_URL =
		window.JOB_API_BASE_URL ||
		localStorage.getItem("JOB_API_BASE_URL") ||
		"";

	const state = {
		projects: [],
		filtered: [],
		selectedProject: null,
	};

	const elements = {
		list: document.getElementById("projects-list"),
		count: document.getElementById("projects-count"),
		status: document.getElementById("projects-status"),
		retry: document.getElementById("retry-projects"),
		filterSearch: document.getElementById("filter-search"),
		filterCategory: document.getElementById("filter-category"),
		clearFilters: document.getElementById("clear-filters"),
		detailPanel: document.getElementById("project-detail-panel"),
		detailContent: document.getElementById("project-detail-content"),
		bidPanel: document.getElementById("bid-form-panel"),
		bidForm: document.getElementById("bid-form"),
		bidMessage: document.getElementById("bid-message"),
		submitBid: document.getElementById("submit-bid"),
		cancelBid: document.getElementById("cancel-bid"),
		projectId: document.getElementById("bid-project-id"),
		bidHeading: document.getElementById("bid-heading"),
		bidSub: document.getElementById("bid-sub"),
	};

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

	function splitLines(value) {
		return String(value || "")
			.split(/\r?\n|,/)
			.map(function (item) { return item.trim(); })
			.filter(Boolean);
	}

	function renderList(value) {
		const items = splitLines(value);
		if (!items.length) {
			return "<p>Details will be shared during discussion.</p>";
		}
		return "<ul>" + items.map(function (i) { return "<li>" + escapeHtml(i) + "</li>"; }).join("") + "</ul>";
	}

	function budgetText(project) {
		const min = project.budget_min;
		const max = project.budget_max;
		const suffix = String(project.budget_type) === "Hourly" ? " /hr" : "";
		if (min && max) return "$" + Number(min).toLocaleString() + " - $" + Number(max).toLocaleString() + suffix;
		if (max) return "Up to $" + Number(max).toLocaleString() + suffix;
		if (min) return "From $" + Number(min).toLocaleString() + suffix;
		return "Budget on discussion";
	}

	function setStatus(type, title, message, showRetry) {
		elements.status.className = "gis-careers-state " + type;
		elements.status.innerHTML = "<h3>" + escapeHtml(title) + "</h3><p>" + escapeHtml(message) + "</p>";
		elements.retry.hidden = !showRetry;
	}

	function clearStatus() {
		elements.status.className = "gis-careers-state d-none";
		elements.status.innerHTML = "";
		elements.retry.hidden = true;
	}

	function showBidMessage(type, message) {
		elements.bidMessage.className = "alert alert-" + type;
		elements.bidMessage.textContent = message;
	}

	function clearBidMessage() {
		elements.bidMessage.className = "alert d-none";
		elements.bidMessage.textContent = "";
	}

	async function fetchJson(url, options) {
		const response = await fetch(url, options);
		const contentType = response.headers.get("content-type") || "";
		const result = contentType.includes("application/json")
			? await response.json()
			: { success: false, message: await response.text() };
		if (!response.ok || result.success === false) {
			throw new Error(result.message || "Request failed. Please try again.");
		}
		return result;
	}

	function renderProjects(projects) {
		if (!Array.isArray(projects) || projects.length === 0) {
			elements.count.textContent = "0";
			elements.list.innerHTML = "";
			if (state.projects.length > 0) {
				setStatus("empty", "No projects match your filters.", "Try a different category or search keyword, or clear the filters.", false);
			} else {
				setStatus("empty", "No open projects right now.", "Please check back soon — new projects are posted regularly.", false);
			}
			return;
		}

		elements.count.textContent = projects.length;
		clearStatus();

		elements.list.innerHTML = projects
			.map(function (project) {
				return `
					<div class="col-md-6 col-xl-4">
						<article class="gis-job-card h-100">
							<div class="gis-job-card-top">
								<span>${escapeHtml(project.category)}</span>
								<small>${escapeHtml(project.duration || "Flexible")}</small>
							</div>
							<div class="gis-job-card-body">
								<h3>${escapeHtml(project.title)}</h3>
								<p class="gis-job-company">${escapeHtml(budgetText(project))} <span class="gis-job-dept">${escapeHtml(String(project.bid_count || 0))} bids</span></p>
								<p class="gis-job-description">${escapeHtml(project.description)}</p>
							</div>
							<div class="gis-job-facts">
								<div><span>Budget</span><strong>${escapeHtml(project.budget_type || "Fixed")}</strong></div>
								<div><span>Level</span><strong>${escapeHtml(project.experience_level || "Any")}</strong></div>
							</div>
							<div class="gis-job-card-footer">
								<button type="button" class="apply-btn" data-action="details" data-project-id="${escapeHtml(project.id)}">View Details</button>
								<button type="button" class="apply-btn solid" data-action="bid" data-project-id="${escapeHtml(project.id)}">Place Bid</button>
							</div>
						</article>
					</div>
				`;
			})
			.join("");
	}

	function renderProjectDetail(project) {
		state.selectedProject = project;
		elements.detailContent.innerHTML = `
			<div class="gis-detail-head">
				<div>
					<span>${escapeHtml(project.category)}</span>
					<h2 id="project-detail-title">${escapeHtml(project.title)}</h2>
					<p>${escapeHtml(project.description)}</p>
				</div>
				<button type="button" class="theme-btn" data-action="detail-bid">Place Bid</button>
			</div>
			<div class="gis-detail-meta">
				<div><span>Budget</span><strong>${escapeHtml(budgetText(project))}</strong></div>
				<div><span>Type</span><strong>${escapeHtml(project.budget_type || "Fixed")}</strong></div>
				<div><span>Duration</span><strong>${escapeHtml(project.duration || "Flexible")}</strong></div>
				<div><span>Experience</span><strong>${escapeHtml(project.experience_level || "Any level")}</strong></div>
				<div><span>Deadline</span><strong>${escapeHtml(project.deadline || "Open until filled")}</strong></div>
			</div>
			<div class="gis-detail-grid">
				<section><h3>Skills Required</h3>${renderList(project.skills)}</section>
			</div>
		`;
		elements.detailPanel.classList.remove("d-none");
		elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	async function openProjectDetail(projectId) {
		elements.detailPanel.classList.remove("d-none");
		elements.detailContent.innerHTML = '<div class="gis-jobs-loading"><span class="gis-loader"></span><p>Loading project...</p></div>';
		try {
			const result = await fetchJson(API_BASE_URL + "/api/bid-projects/" + projectId, {
				method: "GET",
				headers: { Accept: "application/json" },
			});
			renderProjectDetail(result.data);
		} catch (error) {
			elements.detailContent.innerHTML =
				'<div class="gis-careers-state error"><h3>Unable to load project.</h3><p>' +
				escapeHtml(error.message || "Please try again.") + "</p></div>";
		}
	}

	function openBidForm(project) {
		if (!project) return;
		state.selectedProject = project;
		elements.projectId.value = project.id || "";
		elements.bidHeading.textContent = "Bid on: " + (project.title || "Selected Project");
		elements.bidSub.textContent = "Set your price and delivery time, and pitch why you're the best fit.";
		clearBidMessage();
		elements.bidPanel.classList.remove("d-none");
		elements.bidPanel.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	function getSelectedProject(projectId) {
		return state.projects.find(function (p) { return Number(p.id) === Number(projectId); });
	}

	function validateBid(formData) {
		const required = ["full_name", "email", "phone", "bid_amount", "delivery_days", "cover_letter"];
		for (const field of required) {
			if (!String(formData.get(field) || "").trim()) {
				return "Please fill all required fields.";
			}
		}
		const email = String(formData.get("email") || "").trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address.";
		const phone = String(formData.get("phone") || "").trim();
		if (!/^[+()\d\s-]{7,20}$/.test(phone)) return "Please enter a valid phone number.";
		const amount = Number(formData.get("bid_amount"));
		if (!Number.isFinite(amount) || amount <= 0) return "Bid amount must be a positive number.";
		const days = Number(formData.get("delivery_days"));
		if (!Number.isInteger(days) || days <= 0) return "Delivery time must be a whole number of days.";

		const file = formData.get("attachment");
		if (file && file.name) {
			if (!/\.(pdf|doc|docx|jpg|jpeg|png|webp)$/i.test(file.name)) {
				return "Attachment must be PDF, DOC, DOCX, JPG, PNG, or WEBP.";
			}
			if (file.size > 8 * 1024 * 1024) return "Attachment must be 8MB or smaller.";
		}
		return "";
	}

	function applyFilters() {
		const search = elements.filterSearch.value.trim().toLowerCase();
		const category = elements.filterCategory.value;
		state.filtered = state.projects.filter(function (project) {
			if (category && (project.category || "") !== category) return false;
			if (search) {
				const haystack = ((project.title || "") + " " + (project.description || "") + " " + (project.skills || "")).toLowerCase();
				if (haystack.indexOf(search) === -1) return false;
			}
			return true;
		});
		renderProjects(state.filtered);
	}

	async function loadProjects() {
		elements.count.textContent = "--";
		elements.list.innerHTML = "";
		setStatus("loading", "Loading open projects...", "Please wait while we fetch the latest projects.", false);
		try {
			const result = await fetchJson(API_BASE_URL + "/api/bid-projects", {
				method: "GET",
				headers: { Accept: "application/json" },
			});
			state.projects = result.data || [];
			applyFilters();
		} catch (error) {
			elements.count.textContent = "--";
			elements.list.innerHTML = "";
			setStatus("error", "Unable to load projects.", error.message || "Please try again in a moment.", true);
		}
	}

	elements.list.addEventListener("click", function (event) {
		const button = event.target.closest("button[data-project-id]");
		if (!button) return;
		const projectId = button.getAttribute("data-project-id");
		const action = button.getAttribute("data-action");
		const project = getSelectedProject(projectId);
		if (action === "details") {
			void openProjectDetail(projectId);
		}
		if (action === "bid") {
			if (project) {
				renderProjectDetail(project);
				openBidForm(project);
			} else {
				void openProjectDetail(projectId);
			}
		}
	});

	elements.detailContent.addEventListener("click", function (event) {
		if (event.target.closest("button[data-action='detail-bid']")) {
			openBidForm(state.selectedProject);
		}
	});

	elements.bidForm.addEventListener("submit", async function (event) {
		event.preventDefault();
		clearBidMessage();
		const formData = new FormData(elements.bidForm);
		const error = validateBid(formData);
		if (error) {
			showBidMessage("danger", error);
			return;
		}
		const projectId = elements.projectId.value;
		elements.submitBid.disabled = true;
		elements.submitBid.textContent = "Submitting...";
		try {
			const result = await fetchJson(API_BASE_URL + "/api/bid-projects/" + projectId + "/bids", {
				method: "POST",
				headers: { Accept: "application/json" },
				body: formData,
			});
			elements.bidForm.reset();
			elements.projectId.value = projectId;
			showBidMessage("success", result.message || "Your bid has been submitted successfully.");
		} catch (error) {
			showBidMessage("danger", error.message || "Bid submission failed. Please try again.");
		} finally {
			elements.submitBid.disabled = false;
			elements.submitBid.textContent = "Submit Bid";
		}
	});

	elements.cancelBid.addEventListener("click", function () {
		elements.bidPanel.classList.add("d-none");
		elements.bidForm.reset();
		clearBidMessage();
	});

	elements.retry.addEventListener("click", loadProjects);

	let searchTimer = 0;
	elements.filterSearch.addEventListener("input", function () {
		window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(applyFilters, 200);
	});
	elements.filterCategory.addEventListener("change", applyFilters);
	elements.clearFilters.addEventListener("click", function () {
		elements.filterSearch.value = "";
		elements.filterCategory.value = "";
		applyFilters();
	});

	loadProjects();
});
