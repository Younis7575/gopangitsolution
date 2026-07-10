const API_BASE_URL = window.JOB_API_BASE_URL || localStorage.getItem("JOB_API_BASE_URL") || "";

const form = document.getElementById("solutions-ask-form");
const messageBox = document.getElementById("solutions-message");
const attachmentInput = document.getElementById("supporting_attachment");
const attachmentPreview = document.getElementById("attachment-preview");
const categorySelect = document.getElementById("question_category");

function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, function (char) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[char];
    });
}

function showMessage(text, type = "success") {
    messageBox.className = "solutions-alert " + (type === "error" ? "solutions-alert-error" : "solutions-alert-success");
    messageBox.textContent = text;
    messageBox.classList.remove("d-none");
}

function clearMessage() {
    messageBox.className = "solutions-alert d-none";
    messageBox.textContent = "";
}

async function fetchJson(path) {
    const response = await fetch(API_BASE_URL + path, {
        headers: { Accept: "application/json" },
    });
    const json = await response.json();
    if (!response.ok || json.success === false) {
        throw new Error(json.message || "Unable to load data.");
    }
    return json;
}

async function loadCategories() {
    try {
        const result = await fetchJson("/api/solutions/categories");
        const categories = Array.isArray(result.data) ? result.data : [];
        categorySelect.innerHTML = "<option value=''>Select a category</option>" + categories
            .map(function (category) {
                return `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`;
            })
            .join("");
    } catch (error) {
        showMessage(error.message, "error");
    }
}

function renderAttachment(file) {
    if (!file) {
        attachmentPreview.innerHTML = "";
        return;
    }
    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function () {
            attachmentPreview.innerHTML = `<img src="${escapeHtml(reader.result)}" alt="Attachment preview">`;
        };
        reader.readAsDataURL(file);
    } else {
        attachmentPreview.innerHTML = `<div class="solutions-attachment-file">Selected file: ${escapeHtml(file.name)}</div>`;
    }
}

attachmentInput.addEventListener("change", function () {
    renderAttachment(this.files[0]);
});

form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearMessage();

    const formData = new FormData(form);
    const title = formData.get("title").trim();
    const description = formData.get("description").trim();
    const email = formData.get("visitor_email").trim();
    const name = formData.get("visitor_name").trim();
    const tags = formData.get("tags").trim();
    const consent = formData.get("consent");
    const hp = formData.get("hp_address").trim();

    if (hp !== "") {
        showMessage("Submission blocked.", "error");
        return;
    }
    if (!name || !email || !title || !description || !tags || !consent) {
        showMessage("Please fill in all required fields.", "error");
        return;
    }

    if (title.length < 15 || title.length > 220) {
        showMessage("Title must be between 15 and 220 characters.", "error");
        return;
    }
    if (description.length < 50 || description.length > 8000) {
        showMessage("Description must be between 50 and 8000 characters.", "error");
        return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showMessage("Please enter a valid email address.", "error");
        return;
    }

    const submitButton = document.getElementById("solutions-submit");
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
        const response = await fetch(API_BASE_URL + "/api/solutions", {
            method: "POST",
            body: formData,
        });
        const result = await response.json();
        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Unable to submit your query.");
        }
        showMessage("Your query has been submitted successfully and is pending admin approval.");
        form.reset();
        attachmentPreview.innerHTML = "";
    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Query";
    }
});

loadCategories();
