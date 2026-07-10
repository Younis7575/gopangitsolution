document.addEventListener("DOMContentLoaded", function () {
	const API_BASE_URL =
		window.JOB_API_BASE_URL ||
		localStorage.getItem("JOB_API_BASE_URL") ||
		"";
	const state = {
		jobs: [],
		filtered: [],
		selectedJob: null,
	};

	const elements = {
		jobsList: document.getElementById("jobs-list"),
		jobsCount: document.getElementById("jobs-count"),
		jobsStatus: document.getElementById("jobs-status"),
		retryJobs: document.getElementById("retry-jobs"),
		filterSearch: document.getElementById("filter-search"),
		filterDepartment: document.getElementById("filter-department"),
		filterType: document.getElementById("filter-type"),
		clearFilters: document.getElementById("clear-filters"),
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
		informationPage: document.getElementById("career-information-page"),
		listingSurface: document.getElementById("jobs-listing-surface"),
	};

	const careerProfiles = {
		Development: { icon: "fal fa-code", image: "/assets/img/services/b1.jpg", title: "Software Development Careers", intro: "Discover how our engineering teams turn business ideas into secure, scalable web, mobile and backend products.", skills: ["Problem solving", "Clean architecture", "APIs and databases", "Testing and Git"], flow: ["Understand requirements", "Plan architecture", "Build in iterations", "Test and review", "Deploy and improve"], areas: ["Frontend Engineering", "Backend Engineering", "Mobile Applications", "Full-stack Development"] },
		Design: { icon: "fal fa-pencil-ruler", image: "/assets/img/about-img.jpg", title: "UI/UX Design Careers", intro: "Learn how our designers research users, shape intuitive journeys and deliver polished interfaces that support real business goals.", skills: ["Figma", "User research", "Wireframing", "Design systems"], flow: ["Discover users", "Map journeys", "Create wireframes", "Prototype and test", "Developer handoff"], areas: ["Product Design", "UX Research", "Visual Design", "Interaction Design"] },
		Marketing: { icon: "fal fa-bullhorn", image: "/assets/img/home2/slide1.jpg", title: "Digital Marketing Careers", intro: "See how strategy, content, search and paid campaigns work together to create measurable growth for modern brands.", skills: ["Content strategy", "SEO and analytics", "Paid media", "Campaign reporting"], flow: ["Research the market", "Define audience", "Plan campaigns", "Launch and optimize", "Measure outcomes"], areas: ["SEO", "Social Media", "Performance Marketing", "Content Marketing"] },
		Sales: { icon: "fal fa-handshake", image: "/assets/img/contact-img.jpg", title: "Technology Sales Careers", intro: "Understand our consultative sales process—from discovering a client challenge to proposing the right digital solution.", skills: ["Communication", "Lead qualification", "Solution selling", "CRM discipline"], flow: ["Identify prospects", "Discover needs", "Design solution", "Present proposal", "Build relationship"], areas: ["Business Development", "Account Management", "Pre-sales", "Client Success"] },
		"Human Resources": { icon: "fal fa-users", image: "/assets/img/team/6.jpg", title: "Human Resources Careers", intro: "Explore how our people team attracts talent, supports development and builds a healthy, inclusive workplace.", skills: ["Talent acquisition", "People operations", "Communication", "Performance support"], flow: ["Plan workforce", "Source talent", "Interview fairly", "Onboard people", "Support growth"], areas: ["Recruitment", "People Operations", "Learning", "Culture"] },
		"Quality Assurance": { icon: "fal fa-check-circle", image: "/assets/img/why-bg.jpg", title: "Quality Assurance Careers", intro: "Learn how QA professionals protect product quality through thoughtful test planning, automation and continuous feedback.", skills: ["Test planning", "Bug reporting", "API testing", "Automation basics"], flow: ["Review requirements", "Design test cases", "Test every build", "Report defects", "Verify release"], areas: ["Manual QA", "Automation QA", "API Testing", "Mobile Testing"] },
		DevOps: { icon: "fal fa-cloud", image: "/assets/img/services-bg.jpg", title: "DevOps & Cloud Careers", intro: "See how infrastructure, automation and observability help our teams ship reliable software confidently and repeatedly.", skills: ["Linux and networking", "CI/CD", "Cloud platforms", "Monitoring"], flow: ["Design infrastructure", "Automate builds", "Deploy safely", "Monitor systems", "Improve reliability"], areas: ["Cloud Engineering", "CI/CD", "Infrastructure", "Site Reliability"] },
		Management: { icon: "fal fa-tasks", image: "/assets/img/project/case-head.png", title: "Project Management Careers", intro: "Understand how our managers align clients and delivery teams around clear scope, priorities, communication and outcomes.", skills: ["Planning", "Stakeholder communication", "Risk management", "Agile delivery"], flow: ["Define outcomes", "Plan delivery", "Coordinate teams", "Track risks", "Review results"], areas: ["Project Management", "Product Operations", "Delivery Management", "Team Leadership"] },
		"Full Time": { icon: "fal fa-briefcase", image: "/assets/img/man-img.jpg", title: "Full-Time Careers", intro: "Build long-term expertise, own meaningful work and grow with a collaborative technology team.", skills: ["Ownership", "Team collaboration", "Continuous learning", "Reliable delivery"], flow: ["Join your team", "Set clear goals", "Deliver projects", "Receive feedback", "Grow your career"], areas: ["Stable team role", "Mentorship", "Career progression", "Performance growth"] },
		"Part Time": { icon: "fal fa-clock", image: "/assets/img/team/4.jpg", title: "Part-Time Careers", intro: "Contribute specialist skills through a structured schedule while maintaining flexibility and clear delivery expectations.", skills: ["Time management", "Clear communication", "Focused delivery", "Remote collaboration"], flow: ["Agree schedule", "Define priorities", "Complete focused work", "Share progress", "Review outcomes"], areas: ["Flexible schedule", "Defined workload", "Team access", "Practical experience"] },
		Remote: { icon: "fal fa-laptop-house", image: "/assets/img/home3/hero.png", title: "Remote Careers", intro: "Work effectively from your location through outcome-based planning, modern collaboration tools and transparent communication.", skills: ["Async communication", "Self-management", "Digital collaboration", "Accountability"], flow: ["Plan weekly goals", "Collaborate online", "Share progress", "Review together", "Deliver outcomes"], areas: ["Location flexibility", "Remote teamwork", "Digital tools", "Outcome-based work"] },
		Internship: { icon: "fal fa-graduation-cap", image: "/assets/img/team/3.jpg", title: "Internship Program", intro: "Start your technology career with guided learning, real project exposure and feedback from experienced team members.", skills: ["Learning mindset", "Core fundamentals", "Communication", "Problem solving"], flow: ["Orientation", "Learn the tools", "Shadow the team", "Complete tasks", "Present your work"], areas: ["Mentorship", "Real assignments", "Portfolio growth", "Career guidance"] }
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

	function renderCareerInformation(profile, label) {
		document.title = profile.title + " | Gopang IT Solution";
		const heroTitle = document.querySelector(".gis-careers-hero h1");
		const heroText = document.querySelector(".gis-careers-hero .col-lg-8 p");
		const heroEyebrow = document.querySelector(".gis-careers-eyebrow");
		if (heroTitle) heroTitle.textContent = profile.title;
		if (heroText) heroText.textContent = profile.intro;
		if (heroEyebrow) heroEyebrow.textContent = label + " at Gopang IT Solution";
		elements.listingSurface.classList.add("d-none");
		elements.informationPage.classList.remove("d-none");
		elements.jobsCount.textContent = label;
		if (elements.jobsCount.nextElementSibling) elements.jobsCount.nextElementSibling.textContent = "Career Area";
		elements.informationPage.innerHTML = `
			<div class="career-info-hero">
				<div><span>Career Path</span><h2>${escapeHtml(profile.title)}</h2><p>${escapeHtml(profile.intro)}</p><a href="/apply-job" class="theme-btn">View Current Open Jobs</a></div>
				<img src="${escapeHtml(profile.image)}" alt="${escapeHtml(profile.title)} workflow">
			</div>
			<div class="career-info-grid">
				<section><span class="career-info-icon"><i class="${escapeHtml(profile.icon)}"></i></span><h3>What You Can Work On</h3><div class="career-chip-list">${profile.areas.map(function (item) { return "<span>" + escapeHtml(item) + "</span>"; }).join("")}</div></section>
				<section><h3>Skills That Matter</h3><ul>${profile.skills.map(function (item) { return "<li><i class=\"fal fa-check-circle\"></i>" + escapeHtml(item) + "</li>"; }).join("")}</ul></section>
			</div>
			<section class="career-workflow"><span>How the work happens</span><h3>Our Typical Workflow</h3><div>${profile.flow.map(function (item, index) { return "<article><strong>0" + (index + 1) + "</strong><h4>" + escapeHtml(item) + "</h4></article>"; }).join("")}</div></section>
			<section class="career-growth"><div><span>Grow with us</span><h3>What You Will Experience</h3><p>Collaborative delivery, practical feedback, real client problems and opportunities to improve your craft.</p></div><a href="/apply-job" class="gis-retry-btn">Explore Open Positions</a></section>`;
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
			if (state.jobs.length > 0) {
				setStatus(
					"empty",
					"No jobs match your filters.",
					"Try a different department, job type, or search keyword — or clear the filters to see all roles.",
					false,
				);
			} else {
				setStatus(
					"empty",
					"No open positions right now.",
					"Please check back soon. New opportunities will appear here as soon as they are available.",
					false,
				);
			}
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
								<p class="gis-job-company">${escapeHtml(job.company || "Gopang IT Solution")}${job.department ? ' <span class="gis-job-dept">' + escapeHtml(job.department) + "</span>" : ""}</p>
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

	function applyFilters() {
		const search = (elements.filterSearch ? elements.filterSearch.value : "").trim().toLowerCase();
		const department = elements.filterDepartment ? elements.filterDepartment.value : "";
		const type = elements.filterType ? elements.filterType.value : "";

		state.filtered = state.jobs.filter(function (job) {
			if (department && (job.department || "") !== department) {
				return false;
			}
			if (type && (job.type || "") !== type) {
				return false;
			}
			if (search) {
				const haystack = (
					(job.title || "") + " " + (job.description || "") + " " +
					(job.location || "") + " " + (job.skills || "")
				).toLowerCase();
				if (haystack.indexOf(search) === -1) {
					return false;
				}
			}
			return true;
		});

		renderJobs(state.filtered);
	}

	function applyUrlFilters() {
		const params = new URLSearchParams(window.location.search);
		const dept = params.get("department");
		const type = params.get("type");
		if (dept && elements.filterDepartment) {
			elements.filterDepartment.value = dept;
		}
		if (type && elements.filterType) {
			elements.filterType.value = type;
		}
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
			applyUrlFilters();
			applyFilters();
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

	let searchTimer = 0;
	if (elements.filterSearch) {
		elements.filterSearch.addEventListener("input", function () {
			window.clearTimeout(searchTimer);
			searchTimer = window.setTimeout(applyFilters, 200);
		});
	}
	if (elements.filterDepartment) {
		elements.filterDepartment.addEventListener("change", applyFilters);
	}
	if (elements.filterType) {
		elements.filterType.addEventListener("change", applyFilters);
	}
	if (elements.clearFilters) {
		elements.clearFilters.addEventListener("click", function () {
			if (elements.filterSearch) elements.filterSearch.value = "";
			if (elements.filterDepartment) elements.filterDepartment.value = "";
			if (elements.filterType) elements.filterType.value = "";
			applyFilters();
		});
	}

	const pageParams = new URLSearchParams(window.location.search);
	const careerLabel = pageParams.get("department") || pageParams.get("type");
	if (careerLabel && careerProfiles[careerLabel]) {
		renderCareerInformation(careerProfiles[careerLabel], careerLabel);
	} else {
		loadJobs();
	}
});
