let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;
let toastTimeout;

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("attach-acknowledgement");

function showToast(type, title, message, duration = 4000) {
  const toast = document.getElementById("toast");
  const iconSuccess = document.getElementById("toast-icon-success");
  const iconError = document.getElementById("toast-icon-error");
  const progressBar = document.getElementById("toast-progress-bar");

  document.getElementById("toast-title").textContent = title;
  document.getElementById("toast-message").textContent = message;

  toast.classList.remove("toast-success", "toast-error", "toast-show", "toast-hide", "hidden");

  if (type === "success") {
    iconSuccess.classList.remove("hidden");
    iconError.classList.add("hidden");
    toast.classList.add("toast-success");
  } else {
    iconSuccess.classList.add("hidden");
    iconError.classList.remove("hidden");
    toast.classList.add("toast-error");
  }

  // restart slide-in animation
  void toast.offsetWidth;
  toast.classList.add("toast-show");

  // restart progress bar animation
  progressBar.style.animation = "none";
  void progressBar.offsetWidth;
  progressBar.style.animation = `toastProgress ${duration}ms linear forwards`;

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("toast-show");
    toast.classList.add("toast-hide");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}

async function finalizeSuccess() {
  try {
    await ZOHO.CRM.BLUEPRINT.proceed();
    setTimeout(() => {
      window.top.location.href = window.top.location.href;
    }, 500);
  } catch (e) {
    console.error("Blueprint error", e);
    ZOHO.CRM.UI.Popup.closeReload();
  }
}

function clearErrors() { document.querySelectorAll(".error-message").forEach(span => span.textContent = ""); }
function showError(fieldId, message) { const errorSpan = document.getElementById(`error-${fieldId}`); if (errorSpan) errorSpan.textContent = message; }

function showUploadBuffer(message = "Processing...") {
  const buffer = document.getElementById("upload-buffer");
  document.getElementById("upload-title").textContent = message;
  buffer.classList.remove("hidden");
}

function hideUploadBuffer() { document.getElementById("upload-buffer").classList.add("hidden"); }

async function closeWidget() { await ZOHO.CRM.UI.Popup.closeReload().catch(err => console.error(err)); }

ZOHO.embeddedApp.on("PageLoad", async (entity) => {
  try {
    const appResponse = await ZOHO.CRM.API.getRecord({ Entity: "Applications1", RecordID: entity.EntityId });
    const appData = appResponse.data[0];
    app_id = appData.id;
    account_id = appData.Account_Name?.id || "";
    const accResponse = await ZOHO.CRM.API.getRecord({ Entity: "Accounts", RecordID: account_id });
    const accData = accResponse.data[0];
    document.getElementById("name-of-taxable-person").value = accData.Legal_Name_of_Taxable_Person || appData.Account_Name?.name || "";
    document.getElementById("registered-address").value = accData.Registered_Address || "";
  } catch (err) { console.error(err); }
});

// Fixed handleFile using the Perfect Code implementation
async function handleFile(file) {
  clearErrors();
  const display = document.getElementById("file-name-display");
  if (!file) { cachedFile = null; cachedBase64 = null; display.textContent = "Click or drag & drop"; return; }
  
  if (file.size > 20 * 1024 * 1024) { 
    showToast("error", "File Too Large", "Max size is 20MB.");
    return; 
  }
  
  display.textContent = `File: ${file.name}`;
  
  try {
    const content = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsArrayBuffer(file); // Switched to ArrayBuffer to prevent corruption
    });
    
    cachedFile = file;
    cachedBase64 = content;
  } catch (err) { 
    showToast("error", "Error", "Failed to read file."); 
  }
}

fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const files = e.dataTransfer.files;
  if (files.length) {
    fileInput.files = files; 
    handleFile(files[0]);
  }
});

async function update_record(event) {
  event.preventDefault();
  clearErrors();
  const btn = document.getElementById("submit_button_id");
  const ref = document.getElementById("reference-number").value.trim();
  const name = document.getElementById("name-of-taxable-person").value.trim();
  const addr = document.getElementById("registered-address").value.trim();
  const date = document.getElementById("application-date").value.trim();
  
  if (!ref || !name || !addr || !date || !cachedFile || !cachedBase64) {
    if(!ref) showError("reference-number", "Required");
    if(!name) showError("name-of-taxable-person", "Required");
    if(!addr) showError("registered-address", "Required");
    if(!date) showError("application-date", "Required");
    if(!cachedFile) showError("attach-acknowledgement", "Upload required");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Updating...";
  showUploadBuffer("Submitting...");

  try {
    await ZOHO.CRM.API.updateRecord({
      Entity: "Applications1",
      APIData: { id: app_id, Reference_Number: ref, Legal_Name_of_Taxable_Person: name, Registered_Address: addr, Application_Date: date }
    });
    
    await ZOHO.CRM.FUNCTIONS.execute("ta_vatr_submit_to_auth_update_account", {
      arguments: JSON.stringify({ account_id, legal_taxable_person: name, registered_address: addr })
    });
    
    // Attachment using clean ArrayBuffer content
    await ZOHO.CRM.API.attachFile({ 
        Entity: "Applications1", 
        RecordID: app_id, 
        File: { 
            Name: cachedFile.name, 
            Content: cachedBase64 
        } 
    });
    
    hideUploadBuffer();
    showToast("success", "Success!", "Record updated successfully.");
    setTimeout(() => { finalizeSuccess(); }, 2500);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Submit Application";
    hideUploadBuffer();
    showToast("error", "Failed", "Check connection and try again.");
  }
}

document.getElementById("record-form").addEventListener("submit", update_record);
ZOHO.embeddedApp.init();