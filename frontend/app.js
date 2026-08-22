/* ==========================================================================
   OrderProof Frontend Application Logic
   Handles SPA routing, form upload, dynamic gauge rendering, and Admin Panel
   ========================================================================== */

// Global State
let ordersList = [];
let complaintsList = [];
let selectedFile = null;
let evidenceSource = "upload";
let latestResult = null;

// API Base URL (default is empty since we serve from the same FastAPI instance)
const API_BASE = "";

// Circular Progress Bar Constant (r=80, Circumference = 2 * pi * r = 502.65)
const PROGRESS_CIRCUMFERENCE = 502.65;

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initRouting();
  initSandboxSelect();
  initDragAndDrop();
  initCameraModalHandlers();
  initFormSubmit();
  initAdminFilters();
  initModalClose();

  // Bind Hero see logic button scroll
  const seeLogicBtn = document.getElementById("btn-see-logic");
  if (seeLogicBtn) {
    seeLogicBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const element = document.getElementById("scoring-logic-card");
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // Load default dashboard statistics
  fetchDashboardStats();

  // Render lucide icons
  lucide.createIcons();
});

// --- Live Clock Header Utility ---
function initClock() {
  const clockEl = document.getElementById("live-time");
  const updateClock = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString();
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// --- Single Page App Router ---
function initRouting() {
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view-section");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");

  const routeDetails = {
    home: {
      title: "Dashboard Overview",
      subtitle: "System health, performance metrics, and pre-seeded testing environment."
    },
    upload: {
      title: "Submit a Complaint",
      subtitle: "Upload evidence of food contamination to trigger instant fraud checks."
    },
    result: {
      title: "Analysis Results",
      subtitle: "Computed risk classification and individual signal reports."
    },
    admin: {
      title: "Admin Investigation Board",
      subtitle: "Manual review panel, verification triggers, and historic logs."
    }
  };

  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = item.getAttribute("data-target");
      if (target) {
        appRouter(target);
      }
    });
  });
}

function appRouter(target) {
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view-section");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");

  const routeDetails = {
    home: {
      title: "Dashboard Overview",
      subtitle: "System health, performance metrics, and pre-seeded testing environment."
    },
    upload: {
      title: "Submit a Complaint",
      subtitle: "Upload evidence of food contamination to trigger instant fraud checks."
    },
    result: {
      title: "Analysis Results",
      subtitle: "Computed risk classification and individual signal reports."
    },
    admin: {
      title: "Admin Investigation Board",
      subtitle: "Manual review panel, verification triggers, and historic logs."
    }
  };

  // Toggle active views
  views.forEach(view => {
    if (view.id === `view-${target}`) {
      view.classList.add("active");
    } else {
      view.classList.remove("active");
    }
  });

  // Toggle active nav menu highlights
  navItems.forEach(nav => {
    if (nav.getAttribute("data-target") === target) {
      nav.classList.add("active");
    } else {
      nav.classList.remove("active");
    }
  });

  // Update Header Text
  if (routeDetails[target]) {
    pageTitle.textContent = routeDetails[target].title;
    pageSubtitle.textContent = routeDetails[target].subtitle;
  }

  // Action Triggers when switching to view
  if (target === "home") {
    fetchDashboardStats();
  } else if (target === "upload") {
    loadOrdersForSelect();
  } else if (target === "admin") {
    fetchComplaintsForAdmin();
  } else if (target === "result") {
    const emptyState = document.getElementById("result-empty-state");
    const gridContent = document.getElementById("result-grid-content");
    if (!latestResult) {
      if (emptyState) emptyState.style.display = "flex";
      if (gridContent) gridContent.style.display = "none";
    } else {
      if (emptyState) emptyState.style.display = "none";
      if (gridContent) gridContent.style.display = "grid";
      renderAnalysisResult(latestResult);
    }
  }

  // Render Lucide Icons to cover dynamically updated pages
  setTimeout(() => lucide.createIcons(), 50);
}

// --- Fetch Dashboard Stats ---
async function fetchDashboardStats() {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/stats`);
    if (!res.ok) throw new Error("Failed to load dashboard statistics");

    const stats = await res.json();

    // Update overview stats
    document.getElementById("stat-genuine-count").textContent = stats.genuine_count;
    document.getElementById("stat-review-count").textContent = stats.review_count;
    document.getElementById("stat-suspicious-count").textContent = stats.suspicious_count;
    document.getElementById("stat-total-count").textContent = stats.total_complaints;

    // Update admin panel totals if elements exist
    const adminPending = document.getElementById("admin-pending-count");
    const adminApproved = document.getElementById("admin-approved-count");
    const adminRejected = document.getElementById("admin-rejected-count");
    const adminNeedsEvidence = document.getElementById("admin-needs-evidence-count");

    if (adminPending) adminPending.textContent = stats.pending_count;
    if (adminApproved) adminApproved.textContent = stats.approved_count;
    if (adminRejected) adminRejected.textContent = stats.rejected_count;
    if (adminNeedsEvidence) adminNeedsEvidence.textContent = stats.needs_evidence_count || 0;

  } catch (error) {
    console.error("Dashboard Stats Fetch Error:", error);
  }
}

// --- Sandbox Quick Select Orders ---
async function loadOrdersForSelect() {
  try {
    const res = await fetch(`${API_BASE}/api/orders`);
    if (!res.ok) throw new Error("Failed to fetch order records");

    ordersList = await res.json();

    const selectEl = document.getElementById("order-select");
    // Clear except first option
    selectEl.innerHTML = '<option value="">-- Choose sandbox order to auto-populate --</option>';

    ordersList.forEach(order => {
      const opt = document.createElement("option");
      opt.value = order.id;
      opt.textContent = `${order.id} | ${order.customer_name} (${order.restaurant_name})`;
      selectEl.appendChild(opt);
    });
  } catch (error) {
    console.error("Failed to load sandbox orders list:", error);
  }
}

function initSandboxSelect() {
  const selectEl = document.getElementById("order-select");
  selectEl.addEventListener("change", (e) => {
    const selectedId = e.target.value;
    if (!selectedId) return;

    const matchingOrder = ordersList.find(o => o.id === selectedId);
    if (matchingOrder) {
      document.getElementById("input-customer-name").value = matchingOrder.customer_name;
      document.getElementById("input-customer-id").value = matchingOrder.customer_id;
      document.getElementById("input-order-id").value = matchingOrder.id;
      document.getElementById("input-restaurant-name").value = matchingOrder.restaurant_name;
    }
  });
}

// --- Camera Capture Modal Handlers (Phase 3) ---
let cameraStream = null;

function initCameraModalHandlers() {
  const btnCaptureTrigger = document.getElementById("btn-capture-photo-trigger");
  const btnUploadTrigger = document.getElementById("btn-upload-file-trigger");
  const fileInput = document.getElementById("input-file");
  const btnRetake = document.getElementById("btn-evidence-retake");
  const btnRemove = document.getElementById("btn-evidence-remove");

  const btnModalCapture = document.getElementById("btn-camera-modal-capture");
  const btnModalCancel = document.getElementById("btn-camera-modal-cancel");
  const btnModalClose = document.getElementById("btn-camera-modal-close");

  if (btnCaptureTrigger) btnCaptureTrigger.addEventListener("click", openCameraModal);
  if (btnUploadTrigger) btnUploadTrigger.addEventListener("click", () => fileInput.click());
  
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length) {
        updateEvidencePreview(e.target.files[0], "upload");
      }
    });
  }

  if (btnRetake) btnRetake.addEventListener("click", openCameraModal);
  if (btnRemove) btnRemove.addEventListener("click", clearEvidence);

  if (btnModalCapture) btnModalCapture.addEventListener("click", captureModalSnapshot);
  if (btnModalCancel) btnModalCancel.addEventListener("click", closeCameraModal);
  if (btnModalClose) btnModalClose.addEventListener("click", closeCameraModal);
}

async function openCameraModal() {
  const modal = document.getElementById("camera-modal");
  const video = document.getElementById("camera-modal-video");
  const errorEl = document.getElementById("camera-modal-error");

  if (errorEl) errorEl.style.display = "none";
  if (modal) modal.style.display = "flex";

  try {
    // Request environment camera stream
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    if (video) {
      video.srcObject = cameraStream;
      await video.play();
    }
  } catch (err) {
    console.error("Camera access error:", err);
    if (errorEl) {
      errorEl.textContent = "Camera access denied or unsupported. Please use Upload Existing Image instead.";
      errorEl.style.display = "block";
    }
    alert("Could not start camera. Please verify permissions or click 'Upload Existing Image' fallback.");
  }
}

function closeCameraModal() {
  stopCameraStream();
  const modal = document.getElementById("camera-modal");
  if (modal) modal.style.display = "none";
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

function captureModalSnapshot() {
  const video = document.getElementById("camera-modal-video");
  const canvas = document.getElementById("camera-modal-canvas");

  if (!video || !canvas) return;

  const context = canvas.getContext("2d");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;

  // Capture frame to canvas
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if (blob) {
      // Create JPEG File object
      const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: "image/jpeg" });
      updateEvidencePreview(file, "camera");
    }
    closeCameraModal();
  }, "image/jpeg", 0.95);
}

function updateEvidencePreview(file, source) {
  selectedFile = file;
  evidenceSource = source;

  const previewBox = document.getElementById("evidence-preview-box");
  const previewImg = document.getElementById("evidence-preview-display-img");
  const statusLabel = document.getElementById("evidence-status-label");
  const btnRetake = document.getElementById("btn-evidence-retake");

  if (!previewBox || !previewImg || !statusLabel) return;

  // Create Object URL for display
  const objUrl = URL.createObjectURL(file);
  previewImg.src = objUrl;

  previewImg.onload = () => {
    URL.revokeObjectURL(objUrl);
  };

  // Configure UI styling based on source
  if (source === "camera") {
    statusLabel.innerHTML = `<i data-lucide="check-circle-2" style="color: var(--success); width:16px; height:16px;"></i> <span style="color: var(--success);">✓ Photo captured from camera</span>`;
    if (btnRetake) btnRetake.style.display = "inline-flex";
  } else {
    statusLabel.innerHTML = `<i data-lucide="alert-triangle" style="color: var(--warning); width:16px; height:16px;"></i> <span style="color: var(--warning);">⚠ Existing/uploaded evidence</span>`;
    if (btnRetake) btnRetake.style.display = "none";
  }

  // Display the preview block
  previewBox.style.display = "flex";

  lucide.createIcons();
}

function clearEvidence() {
  selectedFile = null;
  evidenceSource = "upload";

  const fileInput = document.getElementById("input-file");
  if (fileInput) fileInput.value = "";

  const previewBox = document.getElementById("evidence-preview-box");
  const previewImg = document.getElementById("evidence-preview-display-img");
  if (previewBox) previewBox.style.display = "none";
  if (previewImg) previewImg.src = "";
  
  // Clear sandbox developer preview sync
  clearSandboxFile();
}

function clearSandboxFile() {
  const fileInput = document.getElementById("input-file");
  const previewContainer = document.getElementById("file-preview-container");
  const dropZoneContent = document.querySelector("#drop-zone .drop-zone-content");
  
  if (fileInput) fileInput.value = "";
  if (previewContainer) previewContainer.style.display = "none";
  if (dropZoneContent) dropZoneContent.style.display = "flex";
}

// --- Drag & Drop Image Handler ---
function initDragAndDrop() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("input-file");
  const dropZoneContent = dropZone.querySelector(".drop-zone-content");
  const previewContainer = document.getElementById("file-preview-container");
  const previewImg = document.getElementById("file-preview-img");
  const previewName = document.getElementById("file-preview-name");
  const previewSize = document.getElementById("file-preview-size");
  const btnRemove = document.getElementById("btn-remove-file");

  // Open file selector when clicking the drop zone
  dropZone.addEventListener("click", (e) => {
    // Avoid double trigger if clicking inside preview button
    if (e.target.closest("#btn-remove-file")) return;
    fileInput.click();
  });

  // Highlight drop zone on dragover
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  ["dragleave", "drop"].forEach(event => {
    dropZone.addEventListener(event, () => {
      dropZone.classList.remove("dragover");
    });
  });

  // Handle dropped files
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  // Handle traditional input selection
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      handleFileSelected(e.target.files[0]);
    }
  });

  // Remove file action
  btnRemove.addEventListener("click", (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  function handleFileSelected(file) {
    if (!file.type.startsWith("image/")) {
      alert("Invalid file format. Please upload an image file (JPG, PNG, WebP).");
      return;
    }
    updateEvidencePreview(file, "upload");

    previewName.textContent = file.name;
    previewSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewContainer.style.display = "flex";
      dropZoneContent.style.display = "none";
    };
    reader.readAsDataURL(file);
  }

  function clearSelectedFile() {
    selectedFile = null;
    evidenceSource = "upload";
    fileInput.value = "";
    previewImg.src = "";
    previewContainer.style.display = "none";
    dropZoneContent.style.display = "flex";
    
    const primaryBox = document.getElementById("evidence-preview-box");
    if (primaryBox) primaryBox.style.display = "none";
  }
}

// --- Submit Complaint Form ---
function initFormSubmit() {
  const form = document.getElementById("complaint-form");
  const btnSubmit = document.getElementById("btn-submit-complaint");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      alert("Please upload an evidence image.");
      return;
    }

    // Set Loading State
    btnSubmit.disabled = true;
    btnSubmit.classList.add("btn-loading");
    const originalText = btnSubmit.innerHTML;

    // Staged loading messages array
    const loadingMessages = [
      "Uploading evidence...",
      "Checking image metadata...",
      "Scanning for duplicate evidence...",
      "Analyzing complaint history...",
      "Calculating risk score..."
    ];

    // Initialize with the first message and a spinner
    btnSubmit.innerHTML = `
      <div class="spinner"></div>
      <span id="loading-text-span">${loadingMessages[0]}</span>
    `;

    // Rotate messages every 650ms
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      const textSpan = document.getElementById("loading-text-span");
      if (textSpan) {
        textSpan.textContent = loadingMessages[messageIndex];
      }
    }, 650);

    // Prepare AbortController for a 25-second timeout fallback
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 25000);

    // Validate that evidence is selected
    if (!selectedFile) {
      alert("Please capture or upload an evidence photo before submitting your claim.");
      btnSubmit.disabled = false;
      btnSubmit.classList.remove("btn-loading");
      btnSubmit.innerHTML = originalText;
      clearInterval(messageInterval);
      clearTimeout(timeoutId);
      return;
    }

    // Prepare FormData payload
    const formData = new FormData();
    formData.append("order_id", document.getElementById("input-order-id").value.trim());
    formData.append("customer_id", document.getElementById("input-customer-id").value.trim());
    formData.append("customer_name", document.getElementById("input-customer-name").value.trim());
    formData.append("restaurant_name", document.getElementById("input-restaurant-name").value.trim());
    formData.append("complaint_text", document.getElementById("input-complaint-text").value.trim());
    formData.append("category", document.getElementById("input-complaint-category").value);
    formData.append("evidence_source", evidenceSource);
    formData.append("image", selectedFile);

    try {
      const res = await fetch(`${API_BASE}/api/complaints`, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      // Clear timeout immediately upon response
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Server error analyzing complaint");
      }

      const result = await res.json();
      latestResult = result;

      // Populate Result View & Switch to it
      renderAnalysisResult(result);

      // Reset Form and file selection
      form.reset();
      clearEvidence();

      // Reveal Result Navigation View menu option
      document.getElementById("nav-item-result").style.display = "flex";
      appRouter("result");

    } catch (error) {
      console.error(error);
      if (error.name === "AbortError") {
        alert("Analysis failed. Request timed out. Please try again.");
      } else {
        alert(`Analysis failed. Please try again. (${error.message || "Server error"})`);
      }
    } finally {
      // Clear timers and restore button status
      clearTimeout(timeoutId);
      clearInterval(messageInterval);
      btnSubmit.disabled = false;
      btnSubmit.classList.remove("btn-loading");
      btnSubmit.innerHTML = originalText;
    }
  });
}

// --- Render Analysis Results (circular gauge & details table) ---
function renderAnalysisResult(complaint) {
  // Toggle visibility of empty state and content
  const emptyState = document.getElementById("result-empty-state");
  const gridContent = document.getElementById("result-grid-content");
  if (emptyState) emptyState.style.display = "none";
  if (gridContent) gridContent.style.display = "grid";

  // 1. Text Info fields
  document.getElementById("result-meta-claim-id").textContent = `#${complaint.id}`;
  document.getElementById("result-meta-order-id").textContent = complaint.order_id;
  document.getElementById("result-meta-customer").textContent = `${complaint.customer_name} (${complaint.customer_id})`;
  document.getElementById("result-meta-restaurant").textContent = complaint.restaurant_name;
  document.getElementById("result-meta-category").textContent = complaint.category || "Other";
  document.getElementById("result-meta-source").textContent = complaint.evidence_source ? complaint.evidence_source.toUpperCase() : "UPLOAD";
  document.getElementById("result-meta-time").textContent = new Date(complaint.created_at).toLocaleString();

  // Populate Customer History Stats
  const history = complaint.analysis_details.customer_history || {};
  document.getElementById("result-history-total").textContent = history.total_claims !== undefined ? history.total_claims : 0;
  document.getElementById("result-history-recent").textContent = history.recent_claims !== undefined ? history.recent_claims : 0;
  document.getElementById("result-history-suspicious").textContent = history.suspicious_claims !== undefined ? history.suspicious_claims : 0;
  document.getElementById("result-history-similar").textContent = history.similar_claims !== undefined ? history.similar_claims : 0;

  // Populate Risk Score Breakdown (Phase 4)
  const breakdown = complaint.analysis_details.breakdown || {
    evidence_source: 0,
    image_analysis: 0,
    duplicate_detection: 0,
    customer_history: 0,
    suspicious_content: 0
  };
  document.getElementById("breakdown-source").textContent = (breakdown.evidence_source >= 0 ? "+" : "") + breakdown.evidence_source;
  document.getElementById("breakdown-image").textContent = (breakdown.image_analysis >= 0 ? "+" : "") + breakdown.image_analysis;
  document.getElementById("breakdown-duplicate").textContent = (breakdown.duplicate_detection >= 0 ? "+" : "") + breakdown.duplicate_detection;
  document.getElementById("breakdown-history").textContent = (breakdown.customer_history >= 0 ? "+" : "") + breakdown.customer_history;
  document.getElementById("breakdown-content").textContent = (breakdown.suspicious_content >= 0 ? "+" : "") + breakdown.suspicious_content;

  // 2. Score Gauge
  const score = complaint.risk_score;
  document.getElementById("result-score-val").textContent = score;

  // Calculate Dash Offset ( r=80, Circumference = 502.65 )
  const barEl = document.getElementById("progress-ring-bar");
  const offset = PROGRESS_CIRCUMFERENCE - (score / 100) * PROGRESS_CIRCUMFERENCE;
  barEl.style.strokeDashoffset = offset;

  // Update design color theme based on score thresholds
  const root = document.documentElement;
  const decisionBadge = document.getElementById("result-decision-badge");
  const decisionText = document.getElementById("result-decision-text");
  const decisionBox = document.getElementById("result-decision-container");
  const recBadge = document.getElementById("result-recommendation-badge");

  // Clean decision label for the badge
  let decisionLabel = complaint.decision;
  if (decisionLabel === "Manual Review Needed") {
    decisionLabel = "Manual Review";
  }
  decisionBadge.textContent = decisionLabel;
  
  const recVal = complaint.recommendation || (score <= 29 ? "NORMAL PROCESSING" : score <= 59 ? "REVIEW RECOMMENDED" : "MANUAL REVIEW REQUIRED");
  recBadge.textContent = recVal;

  if (score <= 29) {
    root.style.setProperty("--accent-color", "var(--success)");
    decisionBox.style.background = "var(--success-bg)";
    decisionBox.style.border = "1px solid var(--success-border)";
    decisionBadge.style.color = "var(--success)";
    recBadge.className = "tag tag-success";
    decisionText.textContent = "This claim has a low risk profile and is suitable for automated settlement.";
  } else if (score <= 59) {
    root.style.setProperty("--accent-color", "var(--warning)");
    decisionBox.style.background = "var(--warning-bg)";
    decisionBox.style.border = "1px solid var(--warning-border)";
    decisionBadge.style.color = "var(--warning)";
    recBadge.className = "tag tag-warning";
    decisionText.textContent = "Moderate risk triggers detected. Claim review recommended before refund processing.";
  } else {
    root.style.setProperty("--accent-color", "var(--danger)");
    decisionBox.style.background = "var(--danger-bg)";
    decisionBox.style.border = "1px solid var(--danger-border)";
    decisionBadge.style.color = "var(--danger)";
    recBadge.className = "tag tag-danger";
    decisionText.textContent = "High claim risk profile detected! Manual review and forensic evidence validation required.";
  }

  // 3. Populate Rules List
  const rulesListContainer = document.getElementById("analysis-rules-list");
  rulesListContainer.innerHTML = "";

  const rules = complaint.analysis_details.rules || [];
  rules.forEach(rule => {
    const row = document.createElement("div");
    row.className = "analysis-rule-row";

    // Select status icon and styles
    let iconName = "check";
    let iconClass = "rule-pass";
    let pointsClass = "rule-pass";
    let pointsText = "0 pts";

    if (rule.score_added > 0) {
      iconName = "alert-triangle";
      iconClass = "rule-fail";
      pointsClass = "rule-fail";
      pointsText = `+${rule.score_added} pts`;
    } else if (rule.score_added < 0) {
      iconName = "info";
      iconClass = "rule-warn";
      pointsClass = "rule-pass";
      pointsText = `${rule.score_added} pts`; // Negative mitigations
    }

    row.innerHTML = `
      <div class="rule-status-icon ${iconClass}">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="rule-info">
        <h5>${rule.rule || rule.name}</h5>
        <p>${rule.message}</p>
      </div>
      <span class="rule-points ${pointsClass}">${pointsText}</span>
    `;
    rulesListContainer.appendChild(row);
  });

  // 4. Image Diagnostics Block
  const meta = complaint.analysis_details.metadata || {};
  document.getElementById("diag-dimensions").textContent = meta.width ? `${meta.width} x ${meta.height}` : "Unknown";
  document.getElementById("diag-format").textContent = meta.format || "Unknown";
  document.getElementById("diag-exif").textContent = meta.has_exif ? "EXIF Present" : "Missing EXIF";

  // Show SHA-256 and dHash
  const dup = complaint.analysis_details.duplicate_detection || {};
  document.getElementById("diag-dhash").textContent = dup.dhash || "None";
  document.getElementById("diag-sha256").textContent = dup.sha256 || complaint.image_hash || "None";

  // Update Duplicate Badges
  const exactStatusEl = document.getElementById("diag-exact-match-status");
  const visualStatusEl = document.getElementById("diag-visual-match-status");

  if (dup.exact_match) {
    exactStatusEl.className = "diag-status-badge status-match";
    exactStatusEl.innerHTML = `<i data-lucide="alert-triangle"></i> <span>Exact Hash Match: Complaint #${dup.exact_match_id}</span>`;
  } else {
    exactStatusEl.className = "diag-status-badge status-unique";
    exactStatusEl.innerHTML = `<i data-lucide="check-circle-2"></i> <span>Exact Hash Match: None</span>`;
  }

  if (dup.visual_match && !dup.exact_match) {
    visualStatusEl.className = "diag-status-badge status-match";
    visualStatusEl.innerHTML = `<i data-lucide="alert-triangle"></i> <span>Visual Similarity: Match (Complaint #${dup.visual_match_id}, Dist: ${dup.hamming_distance}/64)</span>`;
  } else if (dup.exact_match) {
    visualStatusEl.className = "diag-status-badge status-match";
    visualStatusEl.innerHTML = `<i data-lucide="alert-triangle"></i> <span>Visual Similarity: Exact Match</span>`;
  } else {
    visualStatusEl.className = "diag-status-badge status-unique";
    visualStatusEl.innerHTML = `<i data-lucide="check-circle-2"></i> <span>Visual Similarity: None</span>`;
  }

  document.getElementById("result-evidence-img").src = `${API_BASE}/${complaint.image_path}`;

  // Trigger Lucide updates
  lucide.createIcons();
}

// --- Admin Panel Functions ---
async function fetchComplaintsForAdmin() {
  try {
    const res = await fetch(`${API_BASE}/api/complaints`);
    if (!res.ok) throw new Error("Failed to fetch complaint logs");

    complaintsList = await res.json();
    applyAdminFilters();
  } catch (error) {
    console.error("Admin complaints fetch error:", error);
  }
}

function initAdminFilters() {
  const searchInput = document.getElementById("admin-search-input");
  const filterDecision = document.getElementById("admin-filter-decision");
  const filterStatus = document.getElementById("admin-filter-status");

  // Hook listeners
  searchInput.addEventListener("input", applyAdminFilters);
  filterDecision.addEventListener("change", applyAdminFilters);
  filterStatus.addEventListener("change", applyAdminFilters);
}

function applyAdminFilters() {
  const query = document.getElementById("admin-search-input").value.toLowerCase().trim();
  const decisionFilter = document.getElementById("admin-filter-decision").value;
  const statusFilter = document.getElementById("admin-filter-status");
  const statusVal = statusFilter ? statusFilter.value : "ALL";

  const tableBody = document.getElementById("complaints-table-body");
  const emptyState = document.getElementById("no-complaints-msg");

  tableBody.innerHTML = "";

  // Perform client-side filter
  const filtered = complaintsList.filter(c => {
    // 1. Text Search query
    const matchesSearch = (
      c.customer_name.toLowerCase().includes(query) ||
      c.customer_id.toLowerCase().includes(query) ||
      c.restaurant_name.toLowerCase().includes(query) ||
      c.order_id.toLowerCase().includes(query) ||
      c.complaint_text.toLowerCase().includes(query) ||
      (c.category && c.category.toLowerCase().includes(query))
    );

    // 2. Risk Level filter
    const rLevel = c.risk_level || (c.risk_score <= 29 ? "LOW" : c.risk_score <= 59 ? "MEDIUM" : "HIGH");
    const matchesDecision = (decisionFilter === "ALL" || rLevel === decisionFilter);

    // 3. Verification status filter
    const matchesStatus = (statusVal === "ALL" || c.status === statusVal);

    return matchesSearch && matchesDecision && matchesStatus;
  });

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    document.getElementById("complaints-table").style.display = "none";
    return;
  }

  emptyState.style.display = "none";
  document.getElementById("complaints-table").style.display = "table";

  filtered.forEach(c => {
    const row = document.createElement("tr");

    // Risk score color label
    let scoreColorClass = "text-success";
    let decisionBadgeClass = "tag-success";
    let riskLevel = c.risk_level || (c.risk_score <= 29 ? "LOW" : c.risk_score <= 59 ? "MEDIUM" : "HIGH");
    
    if (riskLevel === "MEDIUM") {
      scoreColorClass = "text-warning";
      decisionBadgeClass = "tag-warning";
    } else if (riskLevel === "HIGH") {
      scoreColorClass = "text-danger";
      decisionBadgeClass = "tag-danger";
    }

    let recommendation = c.recommendation || (c.risk_score <= 29 ? "NORMAL PROCESSING" : c.risk_score <= 59 ? "REVIEW RECOMMENDED" : "MANUAL REVIEW REQUIRED");

    // Status label
    let statusClass = "badge-status-pending";
    let statusStyle = "";
    if (c.status === "Approved") statusClass = "badge-status-approved";
    else if (c.status === "Rejected") statusClass = "badge-status-rejected";
    else if (c.status === "Needs Evidence") {
      statusClass = "";
      statusStyle = "background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2);";
    }

    row.innerHTML = `
      <td>#${c.id}</td>
      <td>
        <div style="font-weight:700; color:white;">${c.customer_name}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${c.customer_id}</div>
        <div style="font-size:0.75rem; font-family:var(--font-logo); color:var(--text-muted);">${c.order_id}</div>
      </td>
      <td>
        <div style="font-weight:600; color:white;">${c.restaurant_name}</div>
        <span class="tag tag-info" style="font-size:0.7rem; padding: 0.15rem 0.35rem; display:inline-block; margin-top:0.15rem;">${c.category || "Other"}</span>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top: 0.2rem;">${new Date(c.created_at).toLocaleDateString()} ${new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
      </td>
      <td>
        <div class="cell-risk-score ${scoreColorClass}" style="font-weight:700; font-size:1.05rem;">${c.risk_score}%</div>
        <span class="tag ${decisionBadgeClass}" style="font-size:0.7rem; padding: 0.1rem 0.3rem; margin-top:0.2rem; display:inline-block;">${riskLevel}</span>
      </td>
      <td>
        <div style="font-size: 0.75rem; font-weight: 700; color: ${riskLevel === 'HIGH' ? 'var(--danger)' : riskLevel === 'MEDIUM' ? 'var(--warning)' : 'var(--success)'};">
          ${recommendation}
        </div>
      </td>
      <td>
        <div style="position:relative; display:inline-block;">
          <img src="${API_BASE}/${c.image_path}" class="table-image-thumbnail" alt="Complaint proof" onclick="openDetailsModal(${c.id})">
          <span class="tag ${c.evidence_source === 'camera' ? 'tag-success' : 'tag-warning'}" style="position:absolute; bottom:-5px; right:-5px; font-size:0.6rem; padding:0 0.2rem; border-radius:3px; font-weight:700;">
            ${c.evidence_source === 'camera' ? 'CAMERA' : 'UPLOAD'}
          </span>
        </div>
      </td>
      <td>
        <span class="badge-status ${statusClass}" style="${statusStyle}">${c.status}</span>
      </td>
      <td class="actions-col">
        <div class="admin-action-buttons">
          <button class="btn-icon-only btn-details" title="View Details" onclick="openDetailsModal(${c.id})">
            <i data-lucide="eye"></i>
          </button>
          <button class="btn-icon-only btn-approve" title="Approve Refund" onclick="updateComplaintStatus(${c.id}, 'Approved')" ${c.status === 'Approved' ? 'disabled' : ''}>
            <i data-lucide="check"></i>
          </button>
          <button class="btn-icon-only btn-reject" title="Reject Refund" onclick="updateComplaintStatus(${c.id}, 'Rejected')" ${c.status === 'Rejected' ? 'disabled' : ''}>
            <i data-lucide="x"></i>
          </button>
          <button class="btn-icon-only btn-review" title="Send to Manual Review" onclick="updateComplaintStatus(${c.id}, 'Pending')" ${c.status === 'Pending' ? 'disabled' : ''}>
            <i data-lucide="rotate-ccw"></i>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });

  lucide.createIcons();
}

// --- Update Complaint Review Status (Approve/Reject) ---
async function updateComplaintStatus(complaintId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/complaints/${complaintId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!res.ok) throw new Error("Could not update verification status.");

    const updatedComplaint = await res.json();

    // Update local table dataset and refresh view
    const index = complaintsList.findIndex(c => c.id === complaintId);
    if (index !== -1) {
      complaintsList[index] = updatedComplaint;
      applyAdminFilters();
    }

    // Reload dashboard stats in background
    fetchDashboardStats();
  } catch (error) {
    console.error("Status Update error:", error);
    alert(error.message);
  }
}

// --- Admin Details Diagnostic Modal ---
function openDetailsModal(complaintId) {
  const c = complaintsList.find(item => item.id === complaintId);
  if (!c) return;

  const modal = document.getElementById("admin-detail-modal");
  const contentArea = document.getElementById("modal-content-area");

  // Format decision class & cleaned text
  let riskLevel = c.risk_level || (c.risk_score <= 29 ? "LOW" : c.risk_score <= 59 ? "MEDIUM" : "HIGH");
  let recommendation = c.recommendation || (c.risk_score <= 29 ? "NORMAL PROCESSING" : c.risk_score <= 59 ? "REVIEW RECOMMENDED" : "MANUAL REVIEW REQUIRED");
  let decisionBadgeClass = "tag-success";
  if (riskLevel === "MEDIUM") {
    decisionBadgeClass = "tag-warning";
  } else if (riskLevel === "HIGH") {
    decisionBadgeClass = "tag-danger";
  }

  // Build list of rules triggered
  const rules = c.analysis_details.rules || [];
  let rulesHTML = "";
  rules.forEach(rule => {
    let rowClass = "rule-pass";
    let sign = "✔";
    if (rule.score_added > 0) {
      rowClass = "rule-fail";
      sign = `✘ (+${rule.score_added} pts)`;
    } else if (rule.score_added < 0) {
      rowClass = "rule-warn";
      sign = `ℹ (${rule.score_added} pts)`;
    }
    rulesHTML += `
      <div style="padding: 0.65rem; border-bottom: 1px solid rgba(255,255,255,0.03); display: flex; justify-content: space-between; font-size: 0.8rem;">
        <div>
          <strong style="color: white; display:block;">${rule.name || rule.rule}</strong>
          <span style="color: var(--text-muted);">${rule.message}</span>
        </div>
        <span class="${rowClass}" style="font-weight:700; align-self:center;">${sign}</span>
      </div>
    `;
  });

  const meta = c.analysis_details.metadata || {};

  // Show hashes
  const dup = c.analysis_details.duplicate_detection || {};
  const displayDhash = dup.dhash || "None";
  const displaySha256 = dup.sha256 || c.image_hash || "None";
  
  const history = c.analysis_details.customer_history || {};
  let historyHTML = `
    <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.65rem 0.85rem;">
      <p style="margin:0;"><strong>Total Claims Filed:</strong> ${history.total_claims !== undefined ? history.total_claims : 0}</p>
      <p style="margin:0;"><strong>Claims in Last 7d:</strong> ${history.recent_claims !== undefined ? history.recent_claims : 0}</p>
      <p style="margin:0;"><strong>Suspicious Claims:</strong> ${history.suspicious_claims !== undefined ? history.suspicious_claims : 0}</p>
      <p style="margin:0;"><strong>Similar Claims (in Category):</strong> ${history.similar_claims !== undefined ? history.similar_claims : 0}</p>
    </div>
  `;

  contentArea.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
      <!-- Left Info -->
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="modal-text-block">
          <h4>Customer & Order Details</h4>
          <p><strong>Name:</strong> ${c.customer_name} (${c.customer_id})</p>
          <p><strong>Order ID:</strong> ${c.order_id}</p>
          <p><strong>Restaurant:</strong> ${c.restaurant_name}</p>
          <p><strong>Category:</strong> <span class="tag tag-info" style="font-size:0.75rem; padding:0.1rem 0.35rem;">${c.category || "Other"}</span></p>
          <p><strong>Evidence Source:</strong> <span class="tag ${c.evidence_source === 'camera' ? 'tag-success' : 'tag-warning'}" style="font-size:0.75rem; padding:0.1rem 0.35rem;">${c.evidence_source ? c.evidence_source.toUpperCase() : "UPLOAD"}</span></p>
          <p><strong>Submitted At:</strong> ${new Date(c.created_at).toLocaleString()}</p>
        </div>
        <div class="modal-text-block">
          <h4>Claim Description</h4>
          <p style="white-space: pre-wrap; font-style: italic;">"${c.complaint_text}"</p>
        </div>
        <div class="modal-text-block">
          <h4>Image Diagnostics</h4>
          <p><strong>Dimensions:</strong> ${meta.width ? `${meta.width} x ${meta.height}` : "Unknown"}</p>
          <p><strong>File Format:</strong> ${meta.format || "Unknown"}</p>
          <p><strong>EXIF Check:</strong> ${meta.has_exif ? "EXIF Present" : "Missing EXIF"}</p>
          <p style="word-break: break-all; margin-bottom: 0.35rem;"><strong>SHA-256 Hash:</strong> <code class="hash-text">${displaySha256}</code></p>
          <p style="word-break: break-all;"><strong>dHash:</strong> <code class="hash-text">${displayDhash}</code></p>
        </div>
      </div>

      <!-- Right Analysis & Image -->
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="modal-text-block" style="text-align: center; display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 0.5rem; padding: 0.75rem;">
          <div>
            <h4 style="margin:0;">Risk Score</h4>
            <span style="font-size: 2rem; font-weight:800; font-family: var(--font-logo); color: ${riskLevel === 'HIGH' ? 'var(--danger)' : riskLevel === 'MEDIUM' ? 'var(--warning)' : 'var(--success)'};">${c.risk_score}%</span>
          </div>
          <div>
            <h4 style="margin:0; margin-bottom: 0.2rem;">Risk Level</h4>
            <span class="tag ${decisionBadgeClass}" style="font-size:0.8rem; padding: 0.20rem 0.5rem; font-weight: 700;">${riskLevel}</span>
          </div>
          <div style="width: 100%; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.4rem; margin-top: 0.2rem;">
            <span style="font-size:0.75rem; font-weight: 800; color: ${riskLevel === 'HIGH' ? 'var(--danger)' : riskLevel === 'MEDIUM' ? 'var(--warning)' : 'var(--success)'};">${recommendation}</span>
          </div>
        </div>
        
        <div class="modal-text-block" style="padding: 0;">
          <h4 style="padding: 0.75rem 1rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom:0.25rem;">Customer Claim History</h4>
          ${historyHTML}
        </div>

        <div class="modal-text-block" style="padding: 0;">
          <h4 style="padding: 0.75rem 1rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">Risk Signals Analysis</h4>
          <div style="max-height: 120px; overflow-y: auto; padding: 0 1rem 1rem;">
            ${rulesHTML}
          </div>
        </div>

        <div class="img-frame" style="max-height: 120px;">
          <img src="${API_BASE}/${c.image_path}" alt="Complaint evidence proof" style="max-height: 120px;">
        </div>
      </div>
    </div>

    <!-- Quick action buttons directly inside the modal -->
    <div class="modal-actions-bar" style="display:flex; gap: 0.75rem; justify-content: flex-end; padding-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 1.5rem; flex-wrap: wrap;">
      <button class="btn btn-secondary" style="color: var(--success); border-color: var(--success-border); background: var(--success-bg);" onclick="updateComplaintStatus(${c.id}, 'Approved'); document.getElementById('admin-detail-modal').style.display = 'none';" ${c.status === 'Approved' ? 'disabled' : ''}>
        <i data-lucide="check"></i> Approve Refund
      </button>
      <button class="btn btn-secondary" style="color: var(--danger); border-color: var(--danger-border); background: var(--danger-bg);" onclick="updateComplaintStatus(${c.id}, 'Rejected'); document.getElementById('admin-detail-modal').style.display = 'none';" ${c.status === 'Rejected' ? 'disabled' : ''}>
        <i data-lucide="x"></i> Reject Claim
      </button>
      <button class="btn btn-secondary" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.2); background: rgba(56, 189, 248, 0.1);" onclick="requestMoreEvidence(${c.id}); document.getElementById('admin-detail-modal').style.display = 'none';" ${c.status === 'Needs Evidence' ? 'disabled' : ''}>
        <i data-lucide="help-circle"></i> Request More Evidence
      </button>
      <button class="btn btn-secondary" style="color: var(--warning); border-color: var(--warning-border); background: var(--warning-bg);" onclick="updateComplaintStatus(${c.id}, 'Pending'); document.getElementById('admin-detail-modal').style.display = 'none';" ${c.status === 'Pending' ? 'disabled' : ''}>
        <i data-lucide="rotate-ccw"></i> Send to Manual Review
      </button>
    </div>
  `;

  modal.style.display = "flex";
  lucide.createIcons();
}

function initModalClose() {
  const modal = document.getElementById("admin-detail-modal");
  const btnClose = document.getElementById("btn-close-modal");

  btnClose.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Close when clicking background overlay
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
}

// --- Interactive Demo Auto-fill Helper ---
async function fillDemoClaim(type) {
  let customerName, customerId, orderId, restaurantName, complaintText, imageName;

  if (type === 'genuine') {
    customerName = 'Alice Smith';
    customerId = 'CUST-1001';
    orderId = 'ORD-1001';
    restaurantName = 'Burger House';
    complaintText = 'Found a long black hair baked into my burger bun. This is completely unhygienic and disgusting!';
    imageName = 'burger_hair.png';
  } else if (type === 'late') {
    customerName = 'Bob Jones';
    customerId = 'CUST-1002';
    orderId = 'ORD-1002'; // Delivered 3 days ago (>30 mins)
    restaurantName = 'Sushi Central';
    complaintText = 'I am filing a complaint because the sushi delivered was extremely warm and tasted completely off. I could not eat it.';
    imageName = 'sushi_bug.png';
  } else if (type === 'suspicious') {
    customerName = 'Alice Smith';
    customerId = 'CUST-1001'; // Alice has 2 previous claims (+20 pts)
    orderId = 'ORD-1004'; // Alice's order delivered 5 hours ago (+20 pts)
    restaurantName = 'Pizza Palace';
    complaintText = 'If I do not get a full refund immediately I will contact my lawyer and sue this platform. Extremely suspicious quality!';
    imageName = 'midjourney_pizza_ref.png'; // AI generated filename trigger (+25 pts)
  }

  // 1. Populate form fields
  document.getElementById("input-customer-name").value = customerName;
  document.getElementById("input-customer-id").value = customerId;
  document.getElementById("input-order-id").value = orderId;
  document.getElementById("input-restaurant-name").value = restaurantName;
  document.getElementById("input-complaint-text").value = complaintText;

  // Set category dropdown
  let categoryVal = "Other";
  if (type === 'genuine') categoryVal = "Foreign Object";
  else if (type === 'late') categoryVal = "Food Quality";
  else if (type === 'suspicious') categoryVal = "Contamination Concern";
  
  const categoryEl = document.getElementById("input-complaint-category");
  if (categoryEl) categoryEl.value = categoryVal;

  // Reset any active camera stream/preview so sandbox image takes precedence
  clearEvidence();

  // 2. Fetch and load the corresponding image
  try {
    // If we're loading the suspicious claim, we want to fetch pizza_plastic.png, but name the File object "midjourney_pizza_ref.png" to trigger the AI Filename check!
    const fetchImageName = type === 'suspicious' ? 'pizza_plastic.png' : imageName;
    const response = await fetch(`test_images/${fetchImageName}`);
    if (!response.ok) throw new Error("Sample image not found");

    const blob = await response.blob();
    const file = new File([blob], imageName, { type: 'image/png' });

    // Assign to global file selection variable and update previews
    selectedFile = file;
    updateEvidencePreview(file, "upload");

    // Update the Drag & Drop Preview UI
    const fileInput = document.getElementById("input-file");
    const dropZoneContent = document.querySelector("#drop-zone .drop-zone-content");
    const previewContainer = document.getElementById("file-preview-container");
    const previewImg = document.getElementById("file-preview-img");
    const previewName = document.getElementById("file-preview-name");
    const previewSize = document.getElementById("file-preview-size");

    previewName.textContent = file.name;
    previewSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewContainer.style.display = "flex";
      dropZoneContent.style.display = "none";
    };
    reader.readAsDataURL(file);

  } catch (error) {
    console.error("Error loading demo image:", error);
    alert(`Could not load demo image: ${error.message}. Please upload an image manually.`);
  }

  // Re-render lucide icons in case anything dynamic changed
  lucide.createIcons();
}

// Bind fillDemoClaim to window so it's globally accessible from HTML onclick attributes
window.fillDemoClaim = fillDemoClaim;

function requestMoreEvidence(complaintId) {
  alert("Additional evidence is required before this claim can be reviewed.");
  updateComplaintStatus(complaintId, 'Needs Evidence');
}
window.requestMoreEvidence = requestMoreEvidence;
