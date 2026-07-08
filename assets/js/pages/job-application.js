document.addEventListener("DOMContentLoaded", function () {
	const API_BASE_URL =
		window.JOB_API_BASE_URL ||
		localStorage.getItem("JOB_API_BASE_URL") ||
		"https://job-api.gopangit.workers.dev";
	const state = {
		jobs: [],
		selectedJob: null,
	};

	const elements = {
		jobsList: document.getElementById("jobs-list"),
		jobsCount: document.getElementById("jobs-count"),
		jobsStatus: document.getElementById("jobs-status"),
		retryJobs: document.getElementById("retry-jobs"),
		detailPanel: document.getElementById("job-detail-panel"),
		detailContent: document.getElementById("job-detail-content"),
		applicationPanel: document.getElementById("application-form"),
		applicationForm: document.getElementById("job-application-form"),
		formMessage: document.getElementById("form-message"),
		submitBtn: document.getElementById("submit-application"),
		cancelBtn: document.getElementById("cancel-apply"),
		jobId: document.getElementById("job_id"),
		position: document.getElementById("position"),
		formHeading: document.getElementById("form-heading"),
		formSub: document.getElementById("form-sub"),
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
			.map(function (item) {
				return item.trim();
			})
			.filter(Boolean);
	}

	function renderList(value) {
		const items = splitLines(value);

		if (!items.length) {
			return "<p>Details will be shared during the hiring discussion.</p>";
		}

		return (
			"<ul>" +
			items
				.map(function (item) {
					return "<li>" + escapeHtml(item) + "</li>";
				})
				.join("") +
			"</ul>"
		);
	}

	function setStatus(type, title, message, showRetry) {
		elements.jobsStatus.className = "gis-careers-state " + type;
		elements.jobsStatus.innerHTML =
			"<h3>" + escapeHtml(title) + "</h3><p>" + escapeHtml(message) + "</p>";
		elements.retryJobs.hidden = !showRetry;
	}

	function clearStatus() {
		elements.jobsStatus.className = "gis-careers-state d-none";
		elements.jobsStatus.innerHTML = "";
		elements.retryJobs.hidden = true;
	}

	function showFormMessage(type, message) {
		elements.formMessage.className = "alert alert-" + type;
		elements.formMessage.textContent = message;
	}

	function clearFormMessage() {
		elements.formMessage.className = "alert d-none";
		elements.formMessage.textContent = "";
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

	function renderJobs(jobs) {
		if (!Array.isArray(jobs) || jobs.length === 0) {
			elements.jobsCount.textContent = "0";
			elements.jobsList.innerHTML = "";
			setStatus(
				"empty",
				"No open positions right now.",
				"Please check back soon. New opportunities will appear here as soon as they are available.",
				false,
			);
			return;
		}

		elements.jobsCount.textContent = jobs.length;
		clearStatus();

		elements.jobsList.innerHTML = jobs
			.map(function (job) {
				return `
					<div class="col-md-6 col-xl-4">
						<article class="gis-job-card h-100">
							<div class="gis-job-card-top">
								<span>${escapeHtml(job.type)}</span>
								<small>${escapeHtml(job.location)}</small>
							</div>
							<div class="gis-job-card-body">
								<h3>${escapeHtml(job.title)}</h3>
								<p class="gis-job-company">${escapeHtml(job.company || "Gopang IT Solution")}</p>
								<p class="gis-job-description">${escapeHtml(job.description)}</p>
							</div>
							<div class="gis-job-facts">
								<div><span>Salary</span><strong>${escapeHtml(job.salary || "Not specified")}</strong></div>
								<div><span>Experience</span><strong>${escapeHtml(job.experience_required || "Relevant experience")}</strong></div>
							</div>
							<div class="gis-job-card-footer">
								<button type="button" class="apply-btn" data-action="details" data-job-id="${escapeHtml(job.id)}">View Details</button>
								<button type="button" class="apply-btn solid" data-action="apply" data-job-id="${escapeHtml(job.id)}">Apply Now</button>
							</div>
						</article>
					</div>
				`;
			})
			.join("");
	}

	function renderJobDetail(job) {
		state.selectedJob = job;
		elements.detailContent.innerHTML = `
			<div class="gis-detail-head">
				<div>
					<span>${escapeHtml(job.company || "Gopang IT Solution")}</span>
					<h2>${escapeHtml(job.title)}</h2>
					<p>${escapeHtml(job.overview || job.description)}</p>
				</div>
				<button type="button" class="theme-btn" data-action="detail-apply">Apply Now</button>
			</div>
			<div class="gis-detail-meta">
				<div><span>Location</span><strong>${escapeHtml(job.location)}</strong></div>
				<div><span>Job Type</span><strong>${escapeHtml(job.type)}</strong></div>
				<div><span>Salary</span><strong>${escapeHtml(job.salary || "Not specified")}</strong></div>
				<div><span>Experience</span><strong>${escapeHtml(job.experience_required || "Relevant experience")}</strong></div>
				<div><span>Working Hours</span><strong>${escapeHtml(job.working_hours || "Standard business hours")}</strong></div>
				<div><span>Deadline</span><strong>${escapeHtml(job.application_deadline || "Open until filled")}</strong></div>
			</div>
			<div class="gis-detail-grid">
				<section><h3>Responsibilities</h3>${renderList(job.responsibilities)}</section>
				<section><h3>Requirements</h3>${renderList(job.requirements)}</section>
				<section><h3>Skills Required</h3>${renderList(job.skills)}</section>
				<section><h3>Benefits</h3>${renderList(job.benefits)}</section>
			</div>
		`;
		elements.detailPanel.classList.remove("d-none");
		elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	async function openJobDetail(jobId) {
		elements.detailPanel.classList.remove("d-none");
		elements.detailContent.innerHTML = '<div class="gis-jobs-loading"><span class="gis-loader"></span><p>Loading job details...</p></div>';

		try {
			const result = await fetchJson(API_BASE_URL + "/api/jobs/" + jobId, {
				method: "GET",
				headers: { Accept: "application/json" },
			});
			renderJobDetail(result.data);
		} catch (error) {
			elements.detailContent.innerHTML =
				'<div class="gis-careers-state error"><h3>Unable to load job details.</h3><p>' +
				escapeHtml(error.message || "Please try again.") +
				"</p></div>";
		}
	}

	function openApplicationForm(job) {
		if (!job) {
			return;
		}

		state.selectedJob = job;
		elements.jobId.value = job.id || "";
		elements.position.value = job.title || "";
		elements.formHeading.textContent = "Apply for " + (job.title || "Selected Position");
		elements.formSub.textContent = "Share your details and upload your resume. Our hiring team will review it from the admin dashboard.";
		clearFormMessage();
		elements.applicationPanel.classList.remove("d-none");
		elements.applicationPanel.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	function getSelectedJob(jobId) {
		return state.jobs.find(function (job) {
			return Number(job.id) === Number(jobId);
		});
	}

	function validateForm(formData) {
		const email = String(formData.get("email") || "").trim();
		const phone = String(formData.get("phone") || "").trim();
		const expectedSalary = String(formData.get("expected_salary") || "").trim();
		const currentSalary = String(formData.get("current_salary") || "").trim();
		const experienceYears = String(formData.get("experience_years") || "").trim();
		const cvFile = formData.get("cv_file");
		const requiredFields = [
			"full_name",
			"email",
			"phone",
			"current_city",
			"position",
			"expected_salary",
			"experience_years",
			"message",
		];

		for (const field of requiredFields) {
			if (!String(formData.get(field) || "").trim()) {
				return "Please fill all required fields.";
			}
		}

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return "Please enter a valid email address.";
		}

		if (!/^[+()\d\s-]{7,20}$/.test(phone)) {
			return "Please enter a valid phone number.";
		}

		if (!Number.isFinite(Number(expectedSalary)) || Number(expectedSalary) < 0) {
			return "Expected salary must be a valid number.";
		}

		if (currentSalary && (!Number.isFinite(Number(currentSalary)) || Number(currentSalary) < 0)) {
			return "Current salary must be a valid number.";
		}

		if (!Number.isFinite(Number(experienceYears)) || Number(experienceYears) < 0) {
			return "Experience must be a valid number.";
		}

		if (!cvFile || !cvFile.name) {
			return "Please upload your CV / Resume.";
		}

		if (!/\.(pdf|doc|docx)$/i.test(cvFile.name)) {
			return "CV must be a PDF, DOC, or DOCX file.";
		}

		if (cvFile.size > 5 * 1024 * 1024) {
			return "CV file must be 5MB or smaller.";
		}

		return "";
	}

	async function loadJobs() {
		elements.jobsCount.textContent = "--";
		elements.jobsList.innerHTML = "";
		setStatus("loading", "Loading open positions...", "Please wait while we fetch the latest roles.", false);

		try {
			const result = await fetchJson(API_BASE_URL + "/api/jobs", {
				method: "GET",
				headers: { Accept: "application/json" },
			});
			state.jobs = result.data || [];
			renderJobs(state.jobs);
		} catch (error) {
			elements.jobsCount.textContent = "--";
			elements.jobsList.innerHTML = "";
			setStatus(
				"error",
				"Unable to load jobs.",
				error.message || "Please try again in a moment.",
				true,
			);
		}
	}

	elements.jobsList.addEventListener("click", function (event) {
		const button = event.target.closest("button[data-job-id]");

		if (!button) {
			return;
		}

		const jobId = button.getAttribute("data-job-id");
		const action = button.getAttribute("data-action");
		const selectedJob = getSelectedJob(jobId);

		if (action === "details") {
			void openJobDetail(jobId);
		}

		if (action === "apply") {
			if (selectedJob) {
				renderJobDetail(selectedJob);
				openApplicationForm(selectedJob);
			} else {
				void openJobDetail(jobId);
			}
		}
	});

	elements.detailContent.addEventListener("click", function (event) {
		const button = event.target.closest("button[data-action='detail-apply']");

		if (button) {
			openApplicationForm(state.selectedJob);
		}
	});

	elements.applicationForm.addEventListener("submit", async function (event) {
		event.preventDefault();
		clearFormMessage();

		const formData = new FormData(elements.applicationForm);
		const validationError = validateForm(formData);

		if (validationError) {
			showFormMessage("danger", validationError);
			return;
		}

		elements.submitBtn.disabled = true;
		elements.submitBtn.textContent = "Submitting...";

		try {
			const result = await fetchJson(API_BASE_URL + "/api/apply", {
				method: "POST",
				headers: { Accept: "application/json" },
				body: formData,
			});
			const appliedJob = state.selectedJob;
			elements.applicationForm.reset();
			elements.jobId.value = appliedJob ? appliedJob.id : "";
			elements.position.value = appliedJob ? appliedJob.title : "";
			showFormMessage("success", result.message || "Application submitted successfully.");
		} catch (error) {
			showFormMessage(
				"danger",
				error.message || "Application submission failed. Please try again.",
			);
		} finally {
			elements.submitBtn.disabled = false;
			elements.submitBtn.textContent = "Submit Application";
		}
	});

	elements.cancelBtn.addEventListener("click", function () {
		elements.applicationPanel.classList.add("d-none");
		elements.applicationForm.reset();
		clearFormMessage();
	});

	elements.retryJobs.addEventListener("click", loadJobs);

	loadJobs();
});
