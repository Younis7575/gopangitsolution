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
	const payload = Object.fromEntries(formData.entries());

	if (!payload.title || !payload.description) {
		showProjectMessage("danger", "Please fill project title and short description.");
		return;
	}

	projectSubmitBtn.disabled = true;
	projectSubmitBtn.textContent = "Submitting...";

	try {
		const response = await fetch(API_BASE_URL + "/api/proposals", {
			method: "POST",
			headers: { Accept: "application/json" },
			body: formData,
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
