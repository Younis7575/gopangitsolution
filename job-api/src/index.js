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
