const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

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

	return null;
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
				const { results } = await env.DB.prepare(
					"SELECT * FROM jobs ORDER BY id DESC",
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
					"INSERT INTO jobs (title, company, location, type, salary, description) VALUES (?, ?, ?, ?, ?, ?)",
				)
					.bind(
						jobPayload.title,
						jobPayload.company,
						jobPayload.location,
						jobPayload.type,
						jobPayload.salary,
						jobPayload.description,
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
					"UPDATE jobs SET title = ?, company = ?, location = ?, type = ?, salary = ?, description = ? WHERE id = ?",
				)
					.bind(
						jobPayload.title,
						jobPayload.company,
						jobPayload.location,
						jobPayload.type,
						jobPayload.salary,
						jobPayload.description,
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
				const body = await readJsonBody(request);

				if (!body) {
					return errorResponse("Invalid JSON body", 400);
				}

				const jobId = Number(body.job_id);
				const fullName = String(body.full_name || "").trim();
				const email = String(body.email || "").trim();
				const phone = String(body.phone || "").trim();
				const message = body.message ? String(body.message).trim() : null;

				if (!jobId) {
					return errorResponse("job_id is required", 400);
				}

				if (!fullName) {
					return errorResponse("full_name is required", 400);
				}

				if (!email) {
					return errorResponse("email is required", 400);
				}

				if (!phone) {
					return errorResponse("phone is required", 400);
				}

				const job = await env.DB.prepare("SELECT id FROM jobs WHERE id = ?")
					.bind(jobId)
					.first();

				if (!job) {
					return errorResponse("Job not found", 404);
				}

				const result = await env.DB.prepare(
					"INSERT INTO applications (job_id, full_name, email, phone, message) VALUES (?, ?, ?, ?, ?)",
				)
					.bind(jobId, fullName, email, phone, message)
					.run();

				return jsonResponse(
					{
						success: true,
						message: "Application submitted successfully",
						data: {
							id: result.meta.last_row_id,
							job_id: jobId,
							full_name: fullName,
							email,
							phone,
							message,
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
						applications.message,
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

			return errorResponse("Route not found", 404);
		} catch (error) {
			console.error("API error", error);
			return errorResponse("Internal server error", 500);
		}
	},
};
