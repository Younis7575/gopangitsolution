(function () {
	"use strict";

	const API_BASE_URL =
		window.JOB_API_BASE_URL ||
		localStorage.getItem("JOB_API_BASE_URL") ||
		"https://job-api.gopangit.workers.dev";
	const maxAttachmentSize = 8 * 1024 * 1024;
	const allowedExtensions = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"];

	const form = document.getElementById("project-hiring-form");
	const submitButton = document.getElementById("project-hiring-submit");
	const message = document.getElementById("project-hiring-message");

	if (!form || !submitButton || !message) {
		return;
	}

	function showMessage(type, text) {
		message.className = "alert alert-" + type;
		message.textContent = text;
	}

	function clearMessage() {
		message.className = "alert d-none";
		message.textContent = "";
	}

	function getValue(name) {
		const field = form.elements[name];
		return field ? field.value.trim() : "";
	}

	function validateEmail(email) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	function validatePhone(phone) {
		return /^[+()\d\s-]{7,20}$/.test(phone);
	}

	function getFileExtension(fileName) {
		const cleanName = String(fileName || "").toLowerCase();
		const lastDot = cleanName.lastIndexOf(".");
		return lastDot >= 0 ? cleanName.slice(lastDot) : "";
	}

	function validateForm() {
		const attachment = form.elements.attachment.files[0];

		if (!getValue("full_name")) {
			return "Full name is required.";
		}

		if (!validateEmail(getValue("email"))) {
			return "A valid email is required.";
		}

		if (!validatePhone(getValue("phone"))) {
			return "A valid phone / WhatsApp number is required.";
		}

		if (!getValue("country_city")) {
			return "Country / city is required.";
		}

		if (!getValue("project_title")) {
			return "Project title is required.";
		}

		if (!getValue("project_category")) {
			return "Project category is required.";
		}

		if (!getValue("budget_range")) {
			return "Budget range is required.";
		}

		if (!getValue("expected_timeline")) {
			return "Expected timeline is required.";
		}

		if (getValue("project_description").length < 20) {
			return "Project description must be at least 20 characters.";
		}

		if (!form.elements.agreement.checked) {
			return "Please agree to be contacted regarding your project request.";
		}

		if (attachment) {
			if (!allowedExtensions.includes(getFileExtension(attachment.name))) {
				return "Attachment must be PDF, DOC, DOCX, JPG, PNG, or WEBP.";
			}

			if (attachment.size > maxAttachmentSize) {
				return "Attachment file must be 8MB or smaller.";
			}
		}

		return "";
	}

	async function readJsonResponse(response) {
		const contentType = response.headers.get("content-type") || "";
		const result = contentType.includes("application/json")
			? await response.json()
			: { success: false, message: await response.text() };

		if (!response.ok || result.success === false) {
			throw new Error(result.message || "Unable to submit request.");
		}

		return result;
	}

	form.addEventListener("submit", async function (event) {
		event.preventDefault();

		if (submitButton.disabled) {
			return;
		}

		clearMessage();

		const validationError = validateForm();

		if (validationError) {
			showMessage("danger", validationError);
			return;
		}

		submitButton.disabled = true;
		submitButton.textContent = "Submitting...";

		try {
			const response = await fetch(API_BASE_URL + "/api/project-hiring/apply", {
				method: "POST",
				body: new FormData(form),
			});
			const result = await readJsonResponse(response);

			form.reset();
			showMessage("success", result.message || "Project request submitted successfully.");
		} catch (error) {
			showMessage("danger", error.message || "Unable to submit project request.");
		} finally {
			submitButton.disabled = false;
			submitButton.textContent = "Submit Project Request";
		}
	});
})();
