const API_BASE_URL = "https://job-api.gopangit.workers.dev";

const partnerForm = document.getElementById("partner-application-form");
const partnerMessage = document.getElementById("partner-form-message");
const partnerSubmitBtn = document.getElementById("partner-submit-btn");

function showPartnerMessage(type, message) {
	partnerMessage.className = "alert alert-" + type;
	partnerMessage.textContent = message;
}

function clearPartnerMessage() {
	partnerMessage.className = "alert d-none";
	partnerMessage.textContent = "";
}

async function submitPartnerApplication(event) {
	event.preventDefault();
	clearPartnerMessage();

	const formData = new FormData(partnerForm);
	const payload = {
		company: String(formData.get("company") || "").trim(),
		contact_person: String(formData.get("contact_person") || "").trim(),
		email: String(formData.get("email") || "").trim(),
		phone: String(formData.get("phone") || "").trim(),
		website: String(formData.get("website") || "").trim(),
		message: String(formData.get("message") || "").trim(),
	};

	if (!payload.company || !payload.contact_person || !payload.email) {
		showPartnerMessage("danger", "Please fill company, contact person, and email.");
		return;
	}

	partnerSubmitBtn.disabled = true;
	partnerSubmitBtn.textContent = "Sending...";

	try {
		const response = await fetch(API_BASE_URL + "/api/partner-applications", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
		const result = await response.json();

		if (!response.ok || result.success === false) {
			throw new Error(result.message || "Unable to submit partner application.");
		}

		partnerForm.reset();
		showPartnerMessage("success", result.message || "Partner application submitted successfully. Status: Pending.");
	} catch (error) {
		showPartnerMessage("danger", error.message || "Unable to submit partner application.");
	} finally {
		partnerSubmitBtn.disabled = false;
		partnerSubmitBtn.textContent = "Send Proposal";
	}
}

if (partnerForm) {
	partnerForm.addEventListener("submit", submitPartnerApplication);
}
