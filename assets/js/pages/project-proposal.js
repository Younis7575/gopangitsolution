const API_BASE_URL = "";

const projectForm = document.getElementById("project-proposal-form");
const projectMessage = document.getElementById("project-form-message");
const projectSubmitBtn = document.getElementById("project-submit-btn");

function showProjectMessage(type, message) {
	projectMessage.className = "alert alert-" + type;
	projectMessage.textContent = message;
}

function clearProjectMessage() {
	projectMessage.className = "alert d-none";
	projectMessage.textContent = "";
}

async function submitProjectProposal(event) {
	event.preventDefault();
	clearProjectMessage();

	const formData = new FormData(projectForm);
	const files = Array.from(formData.getAll("attachments[]"))
		.filter(function (file) {
			return file && file.name;
		})
		.map(function (file) {
			return file.name;
		});
	const payload = {
		title: String(formData.get("title") || "").trim(),
		description: String(formData.get("description") || "").trim(),
		budget: String(formData.get("budget") || "").trim(),
		timeline: String(formData.get("timeline") || "").trim(),
		contact_name: String(formData.get("contact_name") || "").trim(),
		email: String(formData.get("email") || "").trim(),
		phone: String(formData.get("phone") || "").trim(),
		attachment_names: files,
	};

	if (!payload.title || !payload.description) {
		showProjectMessage("danger", "Please fill project title and short description.");
		return;
	}

	projectSubmitBtn.disabled = true;
	projectSubmitBtn.textContent = "Submitting...";

	try {
		const response = await fetch(API_BASE_URL + "/api/project-proposals", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
		const result = await response.json();

		if (!response.ok || result.success === false) {
			throw new Error(result.message || "Unable to submit project proposal.");
		}

		projectForm.reset();
		showProjectMessage("success", result.message || "Project proposal submitted successfully. Status: Pending.");
	} catch (error) {
		showProjectMessage("danger", error.message || "Unable to submit project proposal.");
	} finally {
		projectSubmitBtn.disabled = false;
		projectSubmitBtn.textContent = "Submit Project";
	}
}

if (projectForm) {
	projectForm.addEventListener("submit", submitProjectProposal);
}
