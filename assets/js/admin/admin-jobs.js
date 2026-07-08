const API_BASE_URL =
	window.JOB_API_BASE_URL ||
	localStorage.getItem("JOB_API_BASE_URL") ||
	"https://job-api.gopangit.workers.dev";

if (localStorage.getItem("isAdminLoggedIn") !== "true") {
	window.location.replace("/admin-login");
}

const state = {
	jobs: [],
	editingJobId: null,
};

const elements = {
	form: document.getElementById("job-form"),
	jobId: document.getElementById("job-id"),
	title: document.getElementById("job-title"),
	company: document.getElementById("job-company"),
	location: document.getElementById("job-location"),
	type: document.getElementById("job-type"),
	salary: document.getElementById("job-salary"),
	description: document.getElementById("job-description"),
	experience: document.getElementById("job-experience"),
	status: document.getElementById("job-status"),
	workingHours: document.getElementById("job-working-hours"),
	deadline: document.getElementById("job-deadline"),
	overview: document.getElementById("job-overview"),
	responsibilities: document.getElementById("job-responsibilities"),
	requirements: document.getElementById("job-requirements"),
	skills: document.getElementById("job-skills"),
	benefits: document.getElementById("job-benefits"),
	saveJobBtn: document.getElementById("save-job-btn"),
	resetJobForm: document.getElementById("reset-job-form"),
	refreshJobs: document.getElementById("refresh-jobs"),
	refreshApplications: document.getElementById("refresh-applications"),
	logout: document.getElementById("admin-logout"),
	jobsLoading: document.getElementById("jobs-loading"),
	jobsList: document.getElementById("jobs-list"),
	applicationsLoading: document.getElementById("applications-loading"),
	applicationsTable: document.getElementById("applications-table"),
	globalMessage: document.getElementById("global-message"),
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

function showMessage(type, message) {
	elements.globalMessage.className = "admin-alert " + type;
	elements.globalMessage.textContent = message;
}

function clearMessage() {
	elements.globalMessage.className = "admin-alert d-none";
	elements.globalMessage.textContent = "";
}

async function fetchJson(path, options) {
	const response = await fetch(API_BASE_URL + path, options);
	const contentType = response.headers.get("content-type") || "";
	const result = contentType.includes("application/json")
		? await response.json()
		: { success: false, message: await response.text() };

	if (!response.ok || result.success === false) {
		throw new Error(result.message || "Request failed. Please try again.");
	}

	return result;
}

function getJobPayload() {
	return {
		title: elements.title.value.trim(),
		company: elements.company.value.trim(),
		location: elements.location.value.trim(),
		type: elements.type.value.trim(),
		salary: elements.salary.value.trim(),
		description: elements.description.value.trim(),
		experience_required: elements.experience.value.trim(),
		status: elements.status.value,
		working_hours: elements.workingHours.value.trim(),
		application_deadline: elements.deadline.value,
		overview: elements.overview.value.trim(),
		responsibilities: elements.responsibilities.value.trim(),
		requirements: elements.requirements.value.trim(),
		skills: elements.skills.value.trim(),
		benefits: elements.benefits.value.trim(),
	};
}

function resetJobForm() {
	state.editingJobId = null;
	elements.form.reset();
	elements.jobId.value = "";
	elements.saveJobBtn.textContent = "Add Job";
	clearMessage();
}

function fillJobForm(job) {
	state.editingJobId = job.id;
	elements.jobId.value = job.id;
	elements.title.value = job.title || "";
	elements.company.value = job.company || "";
	elements.location.value = job.location || "";
	elements.type.value = job.type || "";
	elements.salary.value = job.salary || "";
	elements.description.value = job.description || "";
	elements.experience.value = job.experience_required || "";
	elements.status.value = job.status || "Open";
	elements.workingHours.value = job.working_hours || "";
	elements.deadline.value = job.application_deadline || "";
	elements.overview.value = job.overview || "";
	elements.responsibilities.value = job.responsibilities || "";
	elements.requirements.value = job.requirements || "";
	elements.skills.value = job.skills || "";
	elements.benefits.value = job.benefits || "";
	elements.saveJobBtn.textContent = "Update Job";
	window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderJobs(jobs) {
	if (!Array.isArray(jobs) || jobs.length === 0) {
		elements.jobsList.innerHTML = '<div class="admin-empty">No jobs found.</div>';
		return;
	}

	elements.jobsList.innerHTML = jobs
		.map(function (job) {
			return `
				<article class="admin-job-card">
					<h3>${escapeHtml(job.title)}</h3>
					<div class="admin-job-meta">
						<span>${escapeHtml(job.company)}</span>
						<span>${escapeHtml(job.location)}</span>
						<span>${escapeHtml(job.type)}</span>
						<span>${escapeHtml(job.salary || "Salary not specified")}</span>
						<span>${escapeHtml(job.experience_required || "Experience not specified")}</span>
						<span>${escapeHtml(job.status || "Open")}</span>
						<span>${escapeHtml(job.created_at || "")}</span>
					</div>
					<p class="admin-job-description">${escapeHtml(job.description)}</p>
					<div class="admin-job-detail-list">
						<div><span>Working Hours:</span> ${escapeHtml(job.working_hours || "Not specified")}</div>
						<div><span>Deadline:</span> ${escapeHtml(job.application_deadline || "Open until filled")}</div>
						<div><span>Skills:</span> ${escapeHtml(job.skills || "Not specified")}</div>
					</div>
					<div class="admin-job-actions">
						<button type="button" class="admin-action-btn" data-action="edit" data-id="${escapeHtml(job.id)}">Edit</button>
						<button type="button" class="admin-action-btn danger" data-action="delete" data-id="${escapeHtml(job.id)}">Delete</button>
					</div>
				</article>
			`;
		})
		.join("");
}

function renderApplications(applications) {
	if (!Array.isArray(applications) || applications.length === 0) {
		elements.applicationsTable.innerHTML = '<tr><td colspan="9" class="admin-empty">No applications found.</td></tr>';
		return;
	}

	elements.applicationsTable.innerHTML = applications
		.map(function (application) {
			const resumeUrl = application.resume_url
				? API_BASE_URL + application.resume_url
				: "";

			return `
				<tr>
					<td>
						${escapeHtml(application.full_name)}
						<span class="admin-applicant-note">${escapeHtml(application.message || "")}</span>
					</td>
					<td>${escapeHtml(application.position || application.job_title || "")}</td>
					<td>${escapeHtml(application.email)}</td>
					<td>${escapeHtml(application.phone)}</td>
					<td>${escapeHtml(application.current_city || "")}</td>
					<td>${escapeHtml(application.expected_salary || "")}</td>
					<td>${escapeHtml(application.experience_years || "")}</td>
					<td>${resumeUrl ? `<a class="admin-cv-link" href="${escapeHtml(resumeUrl)}" target="_blank" rel="noopener noreferrer">Download CV</a>` : "No CV"}</td>
					<td><span class="admin-status-pill pending">${escapeHtml(application.status || "Pending")}</span></td>
					<td>${escapeHtml(application.created_at || "")}</td>
				</tr>
			`;
		})
		.join("");
}

async function loadJobs() {
	elements.jobsLoading.classList.remove("d-none");
	elements.jobsLoading.textContent = "Loading jobs...";

	try {
		const result = await fetchJson("/api/jobs?admin=1", {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});
		state.jobs = result.data || [];
		renderJobs(state.jobs);
	} catch (error) {
		elements.jobsList.innerHTML = '<div class="admin-empty">' + escapeHtml(error.message) + "</div>";
	} finally {
		elements.jobsLoading.classList.add("d-none");
	}
}

async function loadApplications() {
	elements.applicationsLoading.classList.remove("d-none");
	elements.applicationsLoading.textContent = "Loading applications...";

	try {
		const result = await fetchJson("/api/applications", {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});
		renderApplications(result.data || []);
	} catch (error) {
		elements.applicationsTable.innerHTML = '<tr><td colspan="9" class="admin-empty">' + escapeHtml(error.message) + "</td></tr>";
	} finally {
		elements.applicationsLoading.classList.add("d-none");
	}
}

async function saveJob(event) {
	event.preventDefault();
	clearMessage();

	const payload = getJobPayload();
	const isEditing = Boolean(state.editingJobId);
	const path = isEditing ? "/api/jobs/" + state.editingJobId : "/api/jobs";
	const method = isEditing ? "PUT" : "POST";

	elements.saveJobBtn.disabled = true;
	elements.saveJobBtn.textContent = isEditing ? "Updating..." : "Adding...";

	try {
		const result = await fetchJson(path, {
			method,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		resetJobForm();
		showMessage("success", result.message || "Job saved successfully.");
		await loadJobs();
	} catch (error) {
		showMessage("error", error.message || "Unable to save job.");
	} finally {
		elements.saveJobBtn.disabled = false;
		elements.saveJobBtn.textContent = state.editingJobId ? "Update Job" : "Add Job";
	}
}

async function deleteJob(jobId) {
	const confirmed = window.confirm("Delete this job? This action cannot be undone.");
	if (!confirmed) {
		return;
	}

	clearMessage();

	try {
		const result = await fetchJson("/api/jobs/" + jobId, {
			method: "DELETE",
			headers: {
				Accept: "application/json",
			},
		});
		showMessage("success", result.message || "Job deleted successfully.");
		await loadJobs();
	} catch (error) {
		showMessage("error", error.message || "Unable to delete job.");
	}
}

elements.form.addEventListener("submit", saveJob);
elements.resetJobForm.addEventListener("click", resetJobForm);
elements.refreshJobs.addEventListener("click", loadJobs);
elements.refreshApplications.addEventListener("click", loadApplications);
elements.logout.addEventListener("click", function () {
	localStorage.clear();
	window.location.href = "/admin-login";
});

elements.jobsList.addEventListener("click", function (event) {
	const button = event.target.closest("button[data-action]");
	if (!button) {
		return;
	}

	const jobId = Number(button.getAttribute("data-id"));
	const action = button.getAttribute("data-action");

	if (action === "edit") {
		const job = state.jobs.find(function (item) {
			return Number(item.id) === jobId;
		});

		if (job) {
			fillJobForm(job);
		}
	}

	if (action === "delete") {
		void deleteJob(jobId);
	}
});

loadJobs();
loadApplications();
