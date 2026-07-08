const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Expose-Headers": "Content-Disposition",
};

const allowedCvExtensions = [".pdf", ".doc", ".docx"];
const allowedCvMimeTypes = [
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const maxCvSize = 5 * 1024 * 1024;
const jobStatuses = ["Open", "Closed", "Draft"];

function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders,
			"Content-Type": "application/json",
		},
	});
}

function errorResponse(message, status = 400) {
	return jsonResponse(
		{
			success: false,
			message,
		},
		status,
	);
}

async function readJsonBody(request) {
	try {
		return await request.json();
	} catch (error) {
		return null;
	}
}

function getJobPayload(body) {
	return {
		title: String(body.title || "").trim(),
		company: String(body.company || "").trim(),
		location: String(body.location || "").trim(),
		type: String(body.type || "").trim(),
		salary: body.salary ? String(body.salary).trim() : null,
		description: String(body.description || "").trim(),
		experience_required: String(
			body.experience_required || body.experience || "",
		).trim(),
		overview: String(body.overview || "").trim(),
		responsibilities: String(body.responsibilities || "").trim(),
		requirements: String(body.requirements || "").trim(),
		skills: String(body.skills || "").trim(),
		benefits: String(body.benefits || "").trim(),
		working_hours: String(body.working_hours || "").trim(),
		application_deadline: body.application_deadline
			? String(body.application_deadline).trim()
			: null,
		status: jobStatuses.includes(String(body.status || "").trim())
			? String(body.status).trim()
			: "Open",
	};
}

function validateJobPayload(job) {
	if (!job.title) {
		return "title is required";
	}

	if (!job.company) {
		return "company is required";
	}

	if (!job.location) {
		return "location is required";
	}

	if (!job.type) {
		return "type is required";
	}

	if (!job.description) {
		return "description is required";
	}

	if (!job.experience_required) {
		return "experience_required is required";
	}

	if (!job.overview) {
		return "overview is required";
	}

	return null;
}

function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
	return /^[+()\d\s-]{7,20}$/.test(phone);
}

function parseRequiredNumber(value, fieldName) {
	const rawValue = String(value || "").trim();

	if (!rawValue) {
		return {
			error: `${fieldName} is required`,
		};
	}

	const parsedValue = Number(rawValue);

	if (!Number.isFinite(parsedValue) || parsedValue < 0) {
		return {
			error: `${fieldName} must be a valid number`,
		};
	}

	return {
		value: parsedValue,
	};
}

function parseOptionalNumber(value, fieldName) {
	const rawValue = String(value || "").trim();

	if (!rawValue) {
		return {
			value: null,
		};
	}

	const parsedValue = Number(rawValue);

	if (!Number.isFinite(parsedValue) || parsedValue < 0) {
		return {
			error: `${fieldName} must be a valid number`,
		};
	}

	return {
		value: parsedValue,
	};
}

function normalizeOptionalUrl(value, fieldName) {
	const rawValue = String(value || "").trim();

	if (!rawValue) {
		return {
			value: null,
		};
	}

	try {
		const url = new URL(rawValue);

		if (!["http:", "https:"].includes(url.protocol)) {
			return {
				error: `${fieldName} must start with http:// or https://`,
			};
		}

		return {
			value: url.toString(),
		};
	} catch (error) {
		return {
			error: `${fieldName} must be a valid URL`,
		};
	}
}

function sanitizeFileName(fileName) {
	const cleanName = String(fileName || "resume")
		.replace(/[/\\?%*:|"<>]/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.toLowerCase();

	return cleanName || "resume";
}

function getFileExtension(fileName) {
	const cleanName = String(fileName || "").toLowerCase();
	const lastDot = cleanName.lastIndexOf(".");
	return lastDot >= 0 ? cleanName.slice(lastDot) : "";
}

function validateCvFile(file) {
	if (!file || typeof file.arrayBuffer !== "function") {
		return "CV / Resume upload is required";
	}

	const extension = getFileExtension(file.name);

	if (!allowedCvExtensions.includes(extension)) {
		return "CV must be a PDF, DOC, or DOCX file";
	}

	if (file.type && !allowedCvMimeTypes.includes(file.type)) {
		return "CV file type must be PDF, DOC, or DOCX";
	}

	if (file.size > maxCvSize) {
		return "CV file must be 5MB or smaller";
	}

	return null;
}

function buildApplicationPayload(formData) {
	const expectedSalary = parseRequiredNumber(
		formData.get("expected_salary"),
		"expected_salary",
	);
	const currentSalary = parseOptionalNumber(
		formData.get("current_salary"),
		"current_salary",
	);
	const experienceYears = parseRequiredNumber(
		formData.get("experience_years"),
		"experience_years",
	);
	const linkedinProfile = normalizeOptionalUrl(
		formData.get("linkedin_profile"),
		"linkedin_profile",
	);
	const portfolioUrl = normalizeOptionalUrl(
		formData.get("portfolio_url"),
		"portfolio_url",
	);

	const error =
		expectedSalary.error ||
		currentSalary.error ||
		experienceYears.error ||
		linkedinProfile.error ||
		portfolioUrl.error;

	if (error) {
		return {
			error,
		};
	}

	return {
		value: {
			job_id: Number(formData.get("job_id")),
			full_name: String(formData.get("full_name") || "").trim(),
			email: String(formData.get("email") || "").trim(),
			phone: String(formData.get("phone") || "").trim(),
			current_city: String(formData.get("current_city") || "").trim(),
			position: String(formData.get("position") || "").trim(),
			expected_salary: expectedSalary.value,
			current_salary: currentSalary.value,
			experience_years: experienceYears.value,
			notice_period: String(formData.get("notice_period") || "").trim() || null,
			linkedin_profile: linkedinProfile.value,
			portfolio_url: portfolioUrl.value,
			message: String(formData.get("message") || "").trim(),
			cv_file: formData.get("cv_file"),
		},
	};
}

function validateApplicationPayload(application) {
	if (!application.job_id) {
		return "job_id is required";
	}

	if (!application.full_name) {
		return "full_name is required";
	}

	if (!application.email) {
		return "email is required";
	}

	if (!isValidEmail(application.email)) {
		return "email must be valid";
	}

	if (!application.phone) {
		return "phone is required";
	}

	if (!isValidPhone(application.phone)) {
		return "phone must be valid";
	}

	if (!application.current_city) {
		return "current_city is required";
	}

	if (!application.position) {
		return "position is required";
	}

	if (!application.message) {
		return "cover letter / message is required";
	}

	return validateCvFile(application.cv_file);
}

async function storeResume(env, application, job) {
	if (!env.CV_BUCKET) {
		throw new Error("CV storage is not configured");
	}

	const safeName = sanitizeFileName(application.cv_file.name);
	const key = [
		"job-applications",
		String(job.id),
		`${Date.now()}-${crypto.randomUUID()}-${safeName}`,
	].join("/");

	await env.CV_BUCKET.put(key, application.cv_file, {
		httpMetadata: {
			contentType: application.cv_file.type || "application/octet-stream",
			contentDisposition: `attachment; filename="${safeName}"`,
		},
		customMetadata: {
			job_id: String(job.id),
			job_title: String(job.title || ""),
			applicant_email: application.email,
		},
	});

	return {
		key,
		fileName: safeName,
		fileType: application.cv_file.type || "application/octet-stream",
		fileSize: application.cv_file.size || 0,
	};
}

function getNewsPayload(body) {
	return {
		title: String(body.title || "").trim(),
		slug: String(body.slug || "").trim(),
		short_description: String(body.short_description || "").trim(),
		content: String(body.content || "").trim(),
		image_url: body.image_url ? String(body.image_url).trim() : null,
		author: body.author ? String(body.author).trim() : null,
		status: body.status ? String(body.status).trim() : "published",
	};
}

function validateNewsPayload(news) {
	if (!news.title) {
		return "title is required";
	}

	if (!news.slug) {
		return "slug is required";
	}

	if (!news.short_description) {
		return "short_description is required";
	}

	if (!news.content) {
		return "content is required";
	}

	return null;
}

const submissionStatuses = ["Pending", "Approved", "Reject"];

function getPartnerPayload(body) {
	return {
		company: String(body.company || "").trim(),
		contact_person: String(body.contact_person || "").trim(),
		email: String(body.email || "").trim(),
		phone: body.phone ? String(body.phone).trim() : null,
		website: body.website ? String(body.website).trim() : null,
		message: body.message ? String(body.message).trim() : null,
	};
}

function validatePartnerPayload(partner) {
	if (!partner.company) {
		return "company is required";
	}

	if (!partner.contact_person) {
		return "contact_person is required";
	}

	if (!partner.email) {
		return "email is required";
	}

	return null;
}

function getProjectProposalPayload(body) {
	return {
		title: String(body.title || "").trim(),
		description: String(body.description || "").trim(),
		budget: body.budget ? String(body.budget).trim() : null,
		timeline: body.timeline ? String(body.timeline).trim() : null,
		contact_name: body.contact_name ? String(body.contact_name).trim() : null,
		email: body.email ? String(body.email).trim() : null,
		phone: body.phone ? String(body.phone).trim() : null,
		attachment_names: Array.isArray(body.attachment_names)
			? body.attachment_names.join(", ")
			: body.attachment_names
				? String(body.attachment_names).trim()
				: null,
	};
}

function validateProjectProposalPayload(proposal) {
	if (!proposal.title) {
		return "title is required";
	}

	if (!proposal.description) {
		return "description is required";
	}

	return null;
}

function normalizeSubmissionStatus(status) {
	const nextStatus = String(status || "").trim();
	return submissionStatuses.includes(nextStatus) ? nextStatus : null;
}

export default {
	async fetch(request, env, ctx) {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		const url = new URL(request.url);
		const path = url.pathname;

		try {
			if (request.method === "GET" && path === "/api/test") {
				return jsonResponse({
					success: true,
					message: "Job Apply API is working",
				});
			}

			if (request.method === "GET" && path === "/api/jobs") {
				const includeAll = url.searchParams.get("admin") === "1";
				const { results } = await env.DB.prepare(
					includeAll
						? "SELECT * FROM jobs ORDER BY id DESC"
						: "SELECT * FROM jobs WHERE COALESCE(status, 'Open') = 'Open' ORDER BY id DESC",
				).all();

				return jsonResponse({
					success: true,
					message: "Jobs fetched successfully",
					data: results,
				});
			}

			if (request.method === "GET" && path === "/api/partner-applications") {
				const email = (url.searchParams.get("email") || "").trim();
				const statement = email
					? env.DB.prepare(
							"SELECT * FROM partner_applications WHERE lower(email) = lower(?) ORDER BY id DESC",
						).bind(email)
					: env.DB.prepare("SELECT * FROM partner_applications ORDER BY id DESC");
				const { results } = await statement.all();

				return jsonResponse({
					success: true,
					message: "Partner applications fetched successfully",
					data: results,
				});
			}

			if (request.method === "POST" && path === "/api/partner-applications") {
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const partnerPayload = getPartnerPayload(body);
				const validationError = validatePartnerPayload(partnerPayload);

				if (validationError) {
					return errorResponse(validationError, 400);
				}

				const result = await env.DB.prepare(
					"INSERT INTO partner_applications (company, contact_person, email, phone, website, message, status) VALUES (?, ?, ?, ?, ?, ?, 'Pending')",
				)
					.bind(
						partnerPayload.company,
						partnerPayload.contact_person,
						partnerPayload.email,
						partnerPayload.phone,
						partnerPayload.website,
						partnerPayload.message,
					)
					.run();

				const createdPartnerApplication = await env.DB.prepare(
					"SELECT * FROM partner_applications WHERE id = ?",
				)
					.bind(result.meta.last_row_id)
					.first();

				return jsonResponse(
					{
						success: true,
						message: "Partner application submitted successfully",
						data: createdPartnerApplication,
					},
					201,
				);
			}

			const partnerStatusMatch = path.match(
				/^\/api\/partner-applications\/(\d+)\/status$/,
			);
			if (request.method === "PUT" && partnerStatusMatch) {
				const applicationId = Number(partnerStatusMatch[1]);
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const status = normalizeSubmissionStatus(body.status);

				if (!status) {
					return errorResponse("status must be Pending, Approved, or Reject", 400);
				}

				const existingApplication = await env.DB.prepare(
					"SELECT id FROM partner_applications WHERE id = ?",
				)
					.bind(applicationId)
					.first();

				if (!existingApplication) {
					return errorResponse("Partner application not found", 404);
				}

				await env.DB.prepare(
					"UPDATE partner_applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
				)
					.bind(status, applicationId)
					.run();

				const updatedApplication = await env.DB.prepare(
					"SELECT * FROM partner_applications WHERE id = ?",
				)
					.bind(applicationId)
					.first();

				return jsonResponse({
					success: true,
					message: "Partner application status updated successfully",
					data: updatedApplication,
				});
			}

			if (request.method === "GET" && path === "/api/project-proposals") {
				const email = (url.searchParams.get("email") || "").trim();
				const statement = email
					? env.DB.prepare(
							"SELECT * FROM project_proposals WHERE lower(email) = lower(?) ORDER BY id DESC",
						).bind(email)
					: env.DB.prepare("SELECT * FROM project_proposals ORDER BY id DESC");
				const { results } = await statement.all();

				return jsonResponse({
					success: true,
					message: "Project proposals fetched successfully",
					data: results,
				});
			}

			if (request.method === "POST" && path === "/api/project-proposals") {
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const proposalPayload = getProjectProposalPayload(body);
				const validationError = validateProjectProposalPayload(proposalPayload);

				if (validationError) {
					return errorResponse(validationError, 400);
				}

				const result = await env.DB.prepare(
					"INSERT INTO project_proposals (title, description, budget, timeline, contact_name, email, phone, attachment_names, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')",
				)
					.bind(
						proposalPayload.title,
						proposalPayload.description,
						proposalPayload.budget,
						proposalPayload.timeline,
						proposalPayload.contact_name,
						proposalPayload.email,
						proposalPayload.phone,
						proposalPayload.attachment_names,
					)
					.run();

				const createdProposal = await env.DB.prepare(
					"SELECT * FROM project_proposals WHERE id = ?",
				)
					.bind(result.meta.last_row_id)
					.first();

				return jsonResponse(
					{
						success: true,
						message: "Project proposal submitted successfully",
						data: createdProposal,
					},
					201,
				);
			}

			const proposalStatusMatch = path.match(
				/^\/api\/project-proposals\/(\d+)\/status$/,
			);
			if (request.method === "PUT" && proposalStatusMatch) {
				const proposalId = Number(proposalStatusMatch[1]);
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const status = normalizeSubmissionStatus(body.status);

				if (!status) {
					return errorResponse("status must be Pending, Approved, or Reject", 400);
				}

				const existingProposal = await env.DB.prepare(
					"SELECT id FROM project_proposals WHERE id = ?",
				)
					.bind(proposalId)
					.first();

				if (!existingProposal) {
					return errorResponse("Project proposal not found", 404);
				}

				await env.DB.prepare(
					"UPDATE project_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
				)
					.bind(status, proposalId)
					.run();

				const updatedProposal = await env.DB.prepare(
					"SELECT * FROM project_proposals WHERE id = ?",
				)
					.bind(proposalId)
					.first();

				return jsonResponse({
					success: true,
					message: "Project proposal status updated successfully",
					data: updatedProposal,
				});
			}

			if (request.method === "GET" && path === "/api/news") {
				const { results } = await env.DB.prepare(
					"SELECT * FROM news ORDER BY created_at DESC, id DESC",
				).all();

				return jsonResponse({
					success: true,
					message: "News fetched successfully",
					data: results,
				});
			}

			if (request.method === "POST" && path === "/api/news") {
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const newsPayload = getNewsPayload(body);
				const validationError = validateNewsPayload(newsPayload);

				if (validationError) {
					return errorResponse(validationError, 400);
				}

				const result = await env.DB.prepare(
					"INSERT INTO news (title, slug, short_description, content, image_url, author, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
				)
					.bind(
						newsPayload.title,
						newsPayload.slug,
						newsPayload.short_description,
						newsPayload.content,
						newsPayload.image_url,
						newsPayload.author,
						newsPayload.status,
					)
					.run();

				const createdNews = await env.DB.prepare("SELECT * FROM news WHERE id = ?")
					.bind(result.meta.last_row_id)
					.first();

				return jsonResponse(
					{
						success: true,
						message: "News created successfully",
						data: createdNews,
					},
					201,
				);
			}

			const newsSlugMatch = path.match(/^\/api\/news\/slug\/([^/]+)$/);
			if (request.method === "GET" && newsSlugMatch) {
				const slug = decodeURIComponent(newsSlugMatch[1]);
				const news = await env.DB.prepare("SELECT * FROM news WHERE slug = ?")
					.bind(slug)
					.first();

				if (!news) {
					return errorResponse("News not found", 404);
				}

				return jsonResponse({
					success: true,
					message: "News fetched successfully",
					data: news,
				});
			}

			const newsMatch = path.match(/^\/api\/news\/(\d+)$/);
			if (request.method === "GET" && newsMatch) {
				const newsId = Number(newsMatch[1]);
				const news = await env.DB.prepare("SELECT * FROM news WHERE id = ?")
					.bind(newsId)
					.first();

				if (!news) {
					return errorResponse("News not found", 404);
				}

				return jsonResponse({
					success: true,
					message: "News fetched successfully",
					data: news,
				});
			}

			if (request.method === "PUT" && newsMatch) {
				const newsId = Number(newsMatch[1]);
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const existingNews = await env.DB.prepare("SELECT id FROM news WHERE id = ?")
					.bind(newsId)
					.first();

				if (!existingNews) {
					return errorResponse("News not found", 404);
				}

				const newsPayload = getNewsPayload(body);
				const validationError = validateNewsPayload(newsPayload);

				if (validationError) {
					return errorResponse(validationError, 400);
				}

				await env.DB.prepare(
					"UPDATE news SET title = ?, slug = ?, short_description = ?, content = ?, image_url = ?, author = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
				)
					.bind(
						newsPayload.title,
						newsPayload.slug,
						newsPayload.short_description,
						newsPayload.content,
						newsPayload.image_url,
						newsPayload.author,
						newsPayload.status,
						newsId,
					)
					.run();

				const updatedNews = await env.DB.prepare("SELECT * FROM news WHERE id = ?")
					.bind(newsId)
					.first();

				return jsonResponse({
					success: true,
					message: "News updated successfully",
					data: updatedNews,
				});
			}

			if (request.method === "DELETE" && newsMatch) {
				const newsId = Number(newsMatch[1]);
				const existingNews = await env.DB.prepare("SELECT id FROM news WHERE id = ?")
					.bind(newsId)
					.first();

				if (!existingNews) {
					return errorResponse("News not found", 404);
				}

				await env.DB.prepare("DELETE FROM news WHERE id = ?").bind(newsId).run();

				return jsonResponse({
					success: true,
					message: "News deleted successfully",
					data: {
						id: newsId,
					},
				});
			}

			if (request.method === "POST" && path === "/api/jobs") {
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const jobPayload = getJobPayload(body);
				const validationError = validateJobPayload(jobPayload);

				if (validationError) {
					return errorResponse(validationError, 400);
				}

				const result = await env.DB.prepare(
					`INSERT INTO jobs (
						title,
						company,
						location,
						type,
						salary,
						description,
						experience_required,
						overview,
						responsibilities,
						requirements,
						skills,
						benefits,
						working_hours,
						application_deadline,
						status
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
					.bind(
						jobPayload.title,
						jobPayload.company,
						jobPayload.location,
						jobPayload.type,
						jobPayload.salary,
						jobPayload.description,
						jobPayload.experience_required,
						jobPayload.overview,
						jobPayload.responsibilities,
						jobPayload.requirements,
						jobPayload.skills,
						jobPayload.benefits,
						jobPayload.working_hours,
						jobPayload.application_deadline,
						jobPayload.status,
					)
					.run();

				const createdJob = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?")
					.bind(result.meta.last_row_id)
					.first();

				return jsonResponse(
					{
						success: true,
						message: "Job created successfully",
						data: createdJob,
					},
					201,
				);
			}

			const jobMatch = path.match(/^\/api\/jobs\/(\d+)$/);
			if (request.method === "GET" && jobMatch) {
				const jobId = Number(jobMatch[1]);
				const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?")
					.bind(jobId)
					.first();

				if (!job) {
					return errorResponse("Job not found", 404);
				}

				return jsonResponse({
					success: true,
					message: "Job fetched successfully",
					data: job,
				});
			}

			if (request.method === "PUT" && jobMatch) {
				const jobId = Number(jobMatch[1]);
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const existingJob = await env.DB.prepare("SELECT id FROM jobs WHERE id = ?")
					.bind(jobId)
					.first();

				if (!existingJob) {
					return errorResponse("Job not found", 404);
				}

				const jobPayload = getJobPayload(body);
				const validationError = validateJobPayload(jobPayload);

				if (validationError) {
					return errorResponse(validationError, 400);
				}

				await env.DB.prepare(
					`UPDATE jobs SET
						title = ?,
						company = ?,
						location = ?,
						type = ?,
						salary = ?,
						description = ?,
						experience_required = ?,
						overview = ?,
						responsibilities = ?,
						requirements = ?,
						skills = ?,
						benefits = ?,
						working_hours = ?,
						application_deadline = ?,
						status = ?,
						updated_at = CURRENT_TIMESTAMP
					WHERE id = ?`,
				)
					.bind(
						jobPayload.title,
						jobPayload.company,
						jobPayload.location,
						jobPayload.type,
						jobPayload.salary,
						jobPayload.description,
						jobPayload.experience_required,
						jobPayload.overview,
						jobPayload.responsibilities,
						jobPayload.requirements,
						jobPayload.skills,
						jobPayload.benefits,
						jobPayload.working_hours,
						jobPayload.application_deadline,
						jobPayload.status,
						jobId,
					)
					.run();

				const updatedJob = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?")
					.bind(jobId)
					.first();

				return jsonResponse({
					success: true,
					message: "Job updated successfully",
					data: updatedJob,
				});
			}

			if (request.method === "DELETE" && jobMatch) {
				const jobId = Number(jobMatch[1]);
				const existingJob = await env.DB.prepare("SELECT id FROM jobs WHERE id = ?")
					.bind(jobId)
					.first();

				if (!existingJob) {
					return errorResponse("Job not found", 404);
				}

				const applicationCount = await env.DB.prepare(
					"SELECT COUNT(*) AS count FROM applications WHERE job_id = ?",
				)
					.bind(jobId)
					.first();

				if (applicationCount && applicationCount.count > 0) {
					return errorResponse(
						"Cannot delete this job because it has submitted applications",
						409,
					);
				}

				await env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(jobId).run();

				return jsonResponse({
					success: true,
					message: "Job deleted successfully",
					data: {
						id: jobId,
					},
				});
			}

			if (request.method === "POST" && path === "/api/apply") {
				const contentType = request.headers.get("content-type") || "";

				if (!contentType.includes("multipart/form-data")) {
					return errorResponse(
						"Application submission must use multipart/form-data",
						415,
					);
				}

				const formData = await request.formData();
				const payloadResult = buildApplicationPayload(formData);

				if (payloadResult.error) {
					return errorResponse(payloadResult.error, 400);
				}

				const applicationPayload = payloadResult.value;
				const validationError = validateApplicationPayload(applicationPayload);

				if (validationError) {
					return errorResponse(validationError, 400);
				}

				const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?")
					.bind(applicationPayload.job_id)
					.first();

				if (!job) {
					return errorResponse("Job not found", 404);
				}

				if ((job.status || "Open") !== "Open") {
					return errorResponse("This job is not accepting applications", 409);
				}

				const storedResume = await storeResume(env, applicationPayload, job);

				const result = await env.DB.prepare(
					`INSERT INTO applications (
						job_id,
						full_name,
						email,
						phone,
						message,
						current_city,
						position,
						expected_salary,
						current_salary,
						experience_years,
						notice_period,
						linkedin_profile,
						portfolio_url,
						resume_file_name,
						resume_file_type,
						resume_file_size,
						resume_key,
						resume_url,
						status
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
				)
					.bind(
						applicationPayload.job_id,
						applicationPayload.full_name,
						applicationPayload.email,
						applicationPayload.phone,
						applicationPayload.message,
						applicationPayload.current_city,
						applicationPayload.position,
						applicationPayload.expected_salary,
						applicationPayload.current_salary,
						applicationPayload.experience_years,
						applicationPayload.notice_period,
						applicationPayload.linkedin_profile,
						applicationPayload.portfolio_url,
						storedResume.fileName,
						storedResume.fileType,
						storedResume.fileSize,
						storedResume.key,
						"/api/applications/:id/resume",
					)
					.run();

				const resumeUrl = `/api/applications/${result.meta.last_row_id}/resume`;

				await env.DB.prepare(
					"UPDATE applications SET resume_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
				)
					.bind(resumeUrl, result.meta.last_row_id)
					.run();

				return jsonResponse(
					{
						success: true,
						message: "Application submitted successfully",
						data: {
							id: result.meta.last_row_id,
							job_id: applicationPayload.job_id,
							full_name: applicationPayload.full_name,
							email: applicationPayload.email,
							phone: applicationPayload.phone,
							position: applicationPayload.position,
							status: "Pending",
							resume_url: resumeUrl,
						},
					},
					201,
				);
			}

			if (request.method === "GET" && path === "/api/applications") {
				const { results } = await env.DB.prepare(
					`SELECT
						applications.id,
						applications.job_id,
						applications.full_name,
						applications.email,
						applications.phone,
						applications.current_city,
						applications.position,
						applications.expected_salary,
						applications.current_salary,
						applications.experience_years,
						applications.notice_period,
						applications.linkedin_profile,
						applications.portfolio_url,
						applications.message,
						applications.resume_file_name,
						applications.resume_file_type,
						applications.resume_file_size,
						applications.resume_url,
						applications.status,
						applications.created_at,
						jobs.title AS job_title,
						jobs.company AS job_company
					FROM applications
					LEFT JOIN jobs ON jobs.id = applications.job_id
					ORDER BY applications.id DESC`,
				).all();

				return jsonResponse({
					success: true,
					message: "Applications fetched successfully",
					data: results,
				});
			}

			const applicationResumeMatch = path.match(
				/^\/api\/applications\/(\d+)\/resume$/,
			);
			if (request.method === "GET" && applicationResumeMatch) {
				const applicationId = Number(applicationResumeMatch[1]);
				const application = await env.DB.prepare(
					"SELECT resume_key, resume_file_name, resume_file_type FROM applications WHERE id = ?",
				)
					.bind(applicationId)
					.first();

				if (!application || !application.resume_key) {
					return errorResponse("Resume not found", 404);
				}

				if (!env.CV_BUCKET) {
					return errorResponse("CV storage is not configured", 500);
				}

				const object = await env.CV_BUCKET.get(application.resume_key);

				if (!object) {
					return errorResponse("Resume file not found", 404);
				}

				return new Response(object.body, {
					headers: {
						...corsHeaders,
						"Content-Type":
							application.resume_file_type || "application/octet-stream",
						"Content-Disposition": `attachment; filename="${application.resume_file_name || "resume"}"`,
					},
				});
			}

			return errorResponse("Route not found", 404);
		} catch (error) {
			console.error("API error", error);
			return errorResponse("Internal server error", 500);
		}
	},
};
