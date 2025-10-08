let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;
let legalNameTaxablePerson = ""; 
let registered_Address = ""; 

// --- Core Functions for UI/Error Management ---

/**
 * Clears all displayed error messages on the form.
 */
function clearErrors() {
  document.querySelectorAll(".error-message").forEach(span => span.textContent = "");
}

/**
 * Displays an error message next to a specific field.
 * @param {string} fieldId - The ID suffix of the error span (e.g., 'reference-number').
 * @param {string} message - The error message to display.
 */
function showError(fieldId, message) {
  const errorSpan = document.getElementById(`error-${fieldId}`);
  if (errorSpan) errorSpan.textContent = message;
}

/**
 * Shows the file upload progress buffer/overlay.
 * @param {string} message - The message to display in the buffer.
 */
function showUploadBuffer(message = "Caching file...") {
  const buffer = document.getElementById("upload-buffer");
  const title = document.getElementById("upload-title");
  const bar = document.getElementById("upload-progress");
  if (title) title.textContent = message;
  if (buffer) buffer.classList.remove("hidden");
  if (bar) {
    // Trick to restart CSS animation (uses CSS keyframes defined in index.css)
    bar.classList.remove("animate");
    void bar.offsetWidth; 
    bar.classList.add("animate");
  }
}

/**
 * Hides the file upload progress buffer/overlay.
 */
function hideUploadBuffer() {
  const buffer = document.getElementById("upload-buffer");
  const bar = document.getElementById("upload-progress");
  if (buffer) buffer.classList.add("hidden");
  if (bar) bar.classList.remove("animate");
}

/**
 * Closes the embedded widget and reloads the parent CRM window.
 */
async function closeWidget() {
  await ZOHO.CRM.UI.Popup.closeReload().catch(err => console.error("Error closing widget:", err));
}

// --- Data Fetching and Caching Logic ---

/**
 * Executes on widget load to fetch initial data (App ID, Account ID, default field values).
 */
ZOHO.embeddedApp.on("PageLoad", async (entity) => {
  try {
    const entity_id = entity.EntityId;
    const appResponse = await ZOHO.CRM.API.getRecord({
      Entity: "Applications1",
      approved: "both",
      RecordID: entity_id,
    });
    const applicationData = appResponse.data[0];
    app_id = applicationData.id;
    account_id = applicationData.Account_Name.id;

    const accountResponse = await ZOHO.CRM.API.getRecord({
      Entity: "Accounts",
      approved: "both",
      RecordID: account_id,
    });
    const accountData = accountResponse.data[0];
    
    // Use existing Account data or fallback to Application data
    legalNameTaxablePerson = accountData.Legal_Name_of_Taxable_Person || applicationData.Account_Name.name || "";
    registered_Address = accountData.Registered_Address || "";

    // Populate form fields
    document.getElementById("name-of-taxable-person").value = legalNameTaxablePerson;
    document.getElementById("registered-address").value = registered_Address;
  } catch (err) {
    console.error("Error during PageLoad data fetch:", err);
  }
});

/**
 * Reads the selected file into memory (Base64) and performs size validation.
 * The Base64 content is cached for later CRM upload.
 * @param {Event} event - The file input change event.
 */
async function cacheFileOnChange(event) {
  clearErrors();

  const fileInput = event.target;
  const file = fileInput?.files[0];

  if (!file) {
    cachedFile = null;
    cachedBase64 = null;
    return;
  }

  // File size validation (Max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showError("proof-of-submission", "File size must not exceed 10MB. 🙅‍♂️");
    cachedFile = null; 
    cachedBase64 = null;
    fileInput.value = ""; 
    return;
  }

  showUploadBuffer("Reading file into memory...");

  try {
    // FIX: Use readAsDataURL to get the base64 string directly, avoiding
    // corruption issues with ArrayBuffer to Base64 conversion for large/binary files.
    const base64DataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // result is now the data URL
      reader.onerror = reject;
      reader.readAsDataURL(file); // Switched to readAsDataURL
    });

    // Extract the raw Base64 string (the part after the first comma)
    const base64 = base64DataUrl.split(',')[1];
    
    cachedFile = file;
    cachedBase64 = base64;
    
    // Simulate a slight delay for better UX and hide buffer
    await new Promise((res) => setTimeout(res, 1000));
    hideUploadBuffer();
    // Removed: showError("proof-of-submission", `File '${file.name}' ready for submission.`);
    
  } catch (err) {
    console.error("Error caching file:", err);
    hideUploadBuffer();
    showError("proof-of-submission", "Failed to read file. Please try a smaller file or a different format.");
    cachedFile = null;
    cachedBase64 = null;
    fileInput.value = "";
  }
}

/**
 * Uploads the cached file (Base64) to the Applications1 record in CRM.
 */
async function uploadFileToCRM() {
  if (!cachedFile || !cachedBase64) {
    throw new Error("No cached file found. Upload validation failed.");
  }

  showUploadBuffer("Uploading file to CRM...");

  return await ZOHO.CRM.API.attachFile({
    Entity: "Applications1",
    RecordID: app_id,
    File: {
      Name: cachedFile.name,
      Content: cachedBase64,
    },
  });
}

// --- Main Submission Logic ---

/**
 * Handles the form submission event, performing validation and sending data to CRM.
 * This function now correctly handles the entire flow.
 * @param {Event} event - The form submit event.
 */
async function update_record(event) {
  event.preventDefault(); // Crucial: Stop default form submission

  clearErrors();
  let hasError = false;

  const submitBtn = document.getElementById("submit_button_id");
  const referenceNo = document.getElementById("reference-number")?.value.trim();
  const taxablePerson = document.getElementById("name-of-taxable-person")?.value.trim();
  const registeredAddress = document.getElementById("registered-address")?.value.trim();
  const applicationDate = document.getElementById("application-date")?.value.trim();

  // Disable button and show loading state
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
  }

  // 1. Validation Checks
  if (!referenceNo) {
    showError("reference-number", "Reference Number is required.");
    hasError = true;
  }

  if (!taxablePerson) {
    showError("name-of-taxable-person", "Legal Name of Taxable Person is required.");
    hasError = true;
  }

  if (!registeredAddress) {
    showError("registered-address", "Registered Address is required.");
    hasError = true;
  }

  if (!applicationDate) {
    showError("application-date", "Application Date is required.");
    hasError = true;
  }

  if (!cachedFile || !cachedBase64) {
    showError("proof-of-submission", "Please upload the Proof of Submission file first.");
    hasError = true;
  }

  if (hasError) {
    // Re-enable button and exit if validation fails
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
    hideUploadBuffer();
    return;
  }

  // 2. Data Submission
  try {
    // Update Application Record
    await ZOHO.CRM.API.updateRecord({
      Entity: "Applications1",
      APIData: {
        id: app_id,
        Reference_Number: referenceNo,
        Legal_Name_of_Taxable_Person: taxablePerson,
        Registered_Address: registeredAddress,
        Application_Date: applicationDate
      }
    });

    // Update Account Record (for consistency)
    await ZOHO.CRM.API.updateRecord({
      Entity: "Accounts",
      APIData: {
        id: account_id,
        Legal_Name_of_Taxable_Person: taxablePerson,
        Registered_Address: registeredAddress
      },
    });

    // Attach File
    await uploadFileToCRM();
    hideUploadBuffer();

    // 3. Blueprint Proceed and Widget Close (Success)
    await ZOHO.CRM.BLUEPRINT.proceed();
    await ZOHO.CRM.UI.Popup.closeReload(); 
    
  } catch (err) {
    console.error("Error on final submit or API call:", err);
    hideUploadBuffer();
    showError("submit_button_id", "Submission failed. Please check console for details.");
    
    // Re-enable button on failure
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  }
}

// --- Event Listeners and Initialization ---

// Listener for file input change to cache the file
document.getElementById("proof-of-submission").addEventListener("change", cacheFileOnChange);

// Listener for form submission to trigger validation and update logic
document.getElementById("record-form").addEventListener("submit", update_record);

// Initialize the Zoho Embedded App
ZOHO.embeddedApp.init();