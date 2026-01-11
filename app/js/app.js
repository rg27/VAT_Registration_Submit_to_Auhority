let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("attach-acknowledgement");

function showModal(type, title, message) {
  const modal = document.getElementById("custom-modal");
  const iconSuccess = document.getElementById("modal-icon-success");
  const iconError = document.getElementById("modal-icon-error");
  const modalBtn = document.getElementById("modal-close");
  
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;
  
  modalBtn.onclick = closeModal;

  if (type === "success") { 
    iconSuccess.classList.remove("hidden"); 
    iconError.classList.add("hidden");
    
    modalBtn.onclick = async () => {
      modalBtn.disabled = true;
      modalBtn.textContent = "Finalizing...";
      
      try {
        // 1. Tell the Blueprint to move forward
        await ZOHO.CRM.BLUEPRINT.proceed();
        
        // 2. Small delay to allow DB commit
        setTimeout(() => {
          // 3. The most reliable 'Hard Reload' for Zoho Widgets:
          // We try the SDK method first, then force the top window location.
          ZOHO.CRM.UI.Popup.closeReload().then(() => {
             // Fallback: If the popup closes but page doesn't refresh
             top.location.reload(true); 
          }).catch(() => {
             // Second Fallback: Force jump to the record URL
             top.location.href = top.location.href;
          });
        }, 600);
      } catch (e) {
        console.error("Blueprint error", e);
        ZOHO.CRM.UI.Popup.closeReload();
      }
    };
  } else { 
    iconSuccess.classList.add("hidden"); 
    iconError.classList.remove("hidden"); 
  }
  
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeModal() {
  const modal = document.getElementById("custom-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
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

async function handleFile(file) {
  clearErrors();
  const display = document.getElementById("file-name-display");
  if (!file) { cachedFile = null; cachedBase64 = null; display.textContent = "Click or drag & drop"; return; }
  if (file.size > 10 * 1024 * 1024) { 
    showModal("error", "File Too Large", "Max size is 10MB.");
    return; 
  }
  display.textContent = `File: ${file.name}`;
  try {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    cachedFile = file;
    cachedBase64 = dataUrl.split(',')[1];
  } catch (err) { showModal("error", "Error", "Failed to read file."); }
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
  
  if (!ref || !name || !addr || !date || !cachedFile) {
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
    await ZOHO.CRM.API.attachFile({ Entity: "Applications1", RecordID: app_id, File: { Name: cachedFile.name, Content: cachedBase64 } });
    hideUploadBuffer();
    showModal("success", "Success!", "Record updated. Click Ok to reload.");
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Submit Application";
    hideUploadBuffer();
    showModal("error", "Failed", "Check connection and try again.");
  }
}

document.getElementById("record-form").addEventListener("submit", update_record);
ZOHO.embeddedApp.init();