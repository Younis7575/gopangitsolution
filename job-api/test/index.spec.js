import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import worker from "../src";

describe("Job Apply API", () => {
	beforeAll(async () => {
		await env.DB.prepare(`
			CREATE TABLE IF NOT EXISTS jobs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				company TEXT NOT NULL,
				location TEXT NOT NULL,
				type TEXT NOT NULL,
				salary TEXT,
				description TEXT NOT NULL,
				experience_required TEXT DEFAULT 'Not specified',
				overview TEXT,
				responsibilities TEXT,
				requirements TEXT,
				skills TEXT,
				benefits TEXT,
				working_hours TEXT,
				application_deadline TEXT,
				status TEXT DEFAULT 'Open',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		await env.DB.prepare(`
			CREATE TABLE IF NOT EXISTS applications (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				job_id INTEGER NOT NULL,
				full_name TEXT NOT NULL,
				email TEXT NOT NULL,
				phone TEXT NOT NULL,
				message TEXT,
				current_city TEXT,
				position TEXT,
				expected_salary REAL,
				current_salary REAL,
				experience_years REAL,
				notice_period TEXT,
				linkedin_profile TEXT,
				portfolio_url TEXT,
				resume_file_name TEXT,
				resume_file_type TEXT,
				resume_file_size INTEGER,
				resume_key TEXT,
				resume_url TEXT,
				status TEXT DEFAULT 'Pending',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (job_id) REFERENCES jobs(id)
			)
		`).run();

		await env.DB.prepare(`
			INSERT INTO jobs (
				id,
				title,
				company,
				location,
				type,
				salary,
				description,
				experience_required,
				overview,
				status
			)
			VALUES (
				1,
				'Flutter Developer',
				'Gopang IT Solution',
				'Remote',
				'Full Time',
				'120000',
				'Build Flutter applications.',
				'1-3 years',
				'Build production mobile applications.',
				'Open'
			)
			ON CONFLICT(id) DO NOTHING
		`).run();
	});

	it("responds to /api/test (unit style)", async () => {
		const request = new Request("http://example.com/api/test");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			message: "Job Apply API is working",
		});
	});

	it("responds to /api/test (integration style)", async () => {
		const response = await SELF.fetch("http://example.com/api/test");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			message: "Job Apply API is working",
		});
	});

	it("creates and fetches a detailed job", async () => {
		const jobPayload = {
			title: "QA Engineer",
			company: "Gopang IT Solution",
			location: "Islamabad",
			type: "Full Time",
			salary: "90000",
			description: "Test web and mobile products.",
			experience_required: "2+ years",
			overview: "Own QA planning and release confidence.",
			responsibilities: "Write test cases\nRun regression tests",
			requirements: "Manual QA experience\nAPI testing",
			skills: "QA, Postman, Jira",
			benefits: "Learning support",
			working_hours: "Monday to Friday",
			application_deadline: "2026-12-31",
			status: "Open",
		};
		const createResponse = await SELF.fetch("http://example.com/api/jobs", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(jobPayload),
		});
		const created = await createResponse.json();

		expect(createResponse.status).toBe(201);
		expect(created.data.title).toBe(jobPayload.title);
		expect(created.data.experience_required).toBe(jobPayload.experience_required);

		const detailResponse = await SELF.fetch(
			`http://example.com/api/jobs/${created.data.id}`,
		);
		const detail = await detailResponse.json();

		expect(detailResponse.status).toBe(200);
		expect(detail.data.overview).toBe(jobPayload.overview);
	});

	it("validates application CV upload type", async () => {
		const formData = new FormData();
		formData.set("job_id", "1");
		formData.set("full_name", "Test Applicant");
		formData.set("email", "candidate@example.com");
		formData.set("phone", "+923342322324");
		formData.set("current_city", "Islamabad");
		formData.set("position", "Flutter Developer");
		formData.set("expected_salary", "120000");
		formData.set("experience_years", "2");
		formData.set("message", "I am interested in this role.");
		formData.set(
			"cv_file",
			new File(["hello"], "resume.txt", { type: "text/plain" }),
		);

		const response = await SELF.fetch("http://example.com/api/apply", {
			method: "POST",
			body: formData,
		});
		const result = await response.json();

		expect(response.status).toBe(400);
		expect(result.message).toBe("CV must be a PDF, DOC, or DOCX file");
	});
});
