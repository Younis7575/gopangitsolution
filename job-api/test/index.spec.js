import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

describe("Job Apply API", () => {
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
});
