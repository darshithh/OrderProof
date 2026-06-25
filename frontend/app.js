/* ==========================================================================
   OrderProof Frontend Application Logic
   Handles SPA routing, form upload, dynamic gauge rendering, and Admin Panel
   ========================================================================== */

// Global State
let ordersList = [];
let complaintsList = [];
let selectedFile = null;
let latestResult = null;

// API Base URL (default is empty since we serve from the same FastAPI instance)
const API_BASE = "";

// Circular Progress Bar Constant (r=90, Circumference = 2 * pi * r = 565.48)
const PROGRESS_CIRCUMFERENCE = 565.48;

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initRouting();
  initSandboxSelect();
  initDragAndDrop();
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

    if (adminPending) adminPending.textContent = stats.pending_count;
    if (adminApproved) adminApproved.textContent = stats.approved_count;
    if (adminRejected) adminRejected.textContent = stats.rejected_count;

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
    selectedFile = file;

    // Show preview & hide default content
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
    fileInput.value = "";
    previewImg.src = "";
    previewContainer.style.display = "none";
    dropZoneContent.style.display = "flex";
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
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i> <span>Analyzing Risk...</span>';
    lucide.createIcons();

    // Prepare FormData payload
    const formData = new FormData();
    formData.append("order_id", document.getElementById("input-order-id").value.trim());
    formData.append("customer_id", document.getElementById("input-customer-id").value.trim());
    formData.append("customer_name", document.getElementById("input-customer-name").value.trim());
    formData.append("restaurant_name", document.getElementById("input-restaurant-name").value.trim());
    formData.append("complaint_text", document.getElementById("input-complaint-text").value.trim());
    formData.append("image", selectedFile);

    try {
      const res = await fetch(`${API_BASE}/api/complaints`, {
        method: "POST",
        body: formData
      });

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
      document.getElementById("btn-remove-file").click(); // Trigger clean input reset

      // Reveal Result Navigation View menu option
      document.getElementById("nav-item-result").style.display = "flex";
      appRouter("result");

    } catch (error) {
      console.error(error);
      alert(`Error submitting complaint: ${error.message}`);
    } finally {
      // Revert button status
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
      lucide.createIcons();
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
  document.getElementById("result-meta-order-id").textContent = complaint.order_id;
  document.getElementById("result-meta-customer").textContent = `${complaint.customer_name} (${complaint.customer_id})`;
  document.getElementById("result-meta-restaurant").textContent = complaint.restaurant_name;

  // 2. Score Gauge
  const score = complaint.risk_score;
  document.getElementById("result-score-val").textContent = score;

  // Calculate Dash Offset ( r=90, circumference = 565.48 )
  const barEl = document.getElementById("progress-ring-bar");
  const offset = PROGRESS_CIRCUMFERENCE - (score / 100) * PROGRESS_CIRCUMFERENCE;
  barEl.style.strokeDashoffset = offset;

  // Update design color theme based on score thresholds
  const root = document.documentElement;
  const decisionBadge = document.getElementById("result-decision-badge");
  const decisionText = document.getElementById("result-decision-text");
  const decisionBox = document.getElementById("result-decision-container");

  // Clean decision label for the badge
  let decisionLabel = complaint.decision;
  if (decisionLabel === "Manual Review Needed") {
    decisionLabel = "Manual Review";
  }
  decisionBadge.textContent = decisionLabel;

  if (score <= 30) {
    root.style.setProperty("--accent-color", "var(--success)");
    decisionBox.style.background = "var(--success-bg)";
    decisionBox.style.border = "1px solid var(--success-border)";
    decisionBadge.style.color = "var(--success)";
    decisionText.textContent = "This complaint has a low risk profile and is pre-approved for automatic refund processing.";
  } else if (score <= 70) {
    root.style.setProperty("--accent-color", "var(--warning)");
    decisionBox.style.background = "var(--warning-bg)";
    decisionBox.style.border = "1px solid var(--warning-border)";
    decisionBadge.style.color = "var(--warning)";
    decisionText.textContent = "Moderate risk triggers detected. This claim requires manual validation from a human claims manager.";
  } else {
    root.style.setProperty("--accent-color", "var(--danger)");
    decisionBox.style.background = "var(--danger-bg)";
    decisionBox.style.border = "1px solid var(--danger-border)";
    decisionBadge.style.color = "var(--danger)";
    decisionText.textContent = "Highly suspicious signals triggered! Automatic refund is blocked. Investigation recommended.";
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
      c.complaint_text.toLowerCase().includes(query)
    );

    // 2. Decision level filter
    const matchesDecision = (decisionFilter === "ALL" || c.decision === decisionFilter);

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
    if (c.risk_score > 30 && c.risk_score <= 70) scoreColorClass = "text-warning";
    else if (c.risk_score > 70) scoreColorClass = "text-danger";

    // Decision badge label & cleaned text
    let decisionBadgeClass = "tag-success";
    let decisionText = c.decision;
    if (c.decision === "Manual Review Needed") {
      decisionBadgeClass = "tag-warning";
      decisionText = "Manual Review";
    } else if (c.decision === "Suspicious") {
      decisionBadgeClass = "tag-danger";
    }

    // Status label
    let statusClass = "badge-status-pending";
    if (c.status === "Approved") statusClass = "badge-status-approved";
    else if (c.status === "Rejected") statusClass = "badge-status-rejected";

    row.innerHTML = `
      <td>#${c.id}</td>
      <td>
        <span class="admin-order-id">${c.order_id}</span>
        <div class="admin-delivery-time">${new Date(c.created_at).toLocaleDateString()}</div>
      </td>
      <td>
        <div class="admin-customer-info">
          <span class="admin-customer-name">${c.customer_name} (${c.customer_id})</span>
          <span class="admin-restaurant-name">${c.restaurant_name}</span>
        </div>
      </td>
      <td class="cell-risk-score ${scoreColorClass}">${c.risk_score}%</td>
      <td>
        <img src="${API_BASE}/${c.image_path}" class="table-image-thumbnail" alt="Complaint proof" onclick="openDetailsModal(${c.id})">
      </td>
      <td>
        <span class="tag ${decisionBadgeClass}">${decisionText}</span>
      </td>
      <td>
        <span class="badge-status ${statusClass}">${c.status}</span>
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
  let decisionBadgeClass = "tag-success";
  let decisionText = c.decision;
  if (c.decision === "Manual Review Needed") {
    decisionBadgeClass = "tag-warning";
    decisionText = "Manual Review";
  } else if (c.decision === "Suspicious") {
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

  contentArea.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
      <!-- Left Info -->
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="modal-text-block">
          <h4>Customer Details</h4>
          <p><strong>Name:</strong> ${c.customer_name} (${c.customer_id})</p>
          <p><strong>Order ID:</strong> ${c.order_id}</p>
          <p><strong>Restaurant:</strong> ${c.restaurant_name}</p>
        </div>
        <div class="modal-text-block">
          <h4>Complaint Description</h4>
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
        <div class="modal-text-block" style="text-align: center; display: flex; align-items: center; justify-content: space-around;">
          <div>
            <h4>Risk Score</h4>
            <span style="font-size: 2.25rem; font-weight:800; font-family: var(--font-logo); color: ${c.risk_score > 70 ? 'var(--danger)' : c.risk_score > 30 ? 'var(--warning)' : 'var(--success)'};">${c.risk_score}%</span>
          </div>
          <div>
            <h4>System Decision</h4>
            <span class="tag ${decisionBadgeClass}" style="font-size:0.85rem; padding: 0.25rem 0.6rem;">${decisionText}</span>
          </div>
        </div>
        
        <div class="modal-text-block" style="padding: 0;">
          <h4 style="padding: 0.75rem 1rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">Fraud Signals Analysis</h4>
          <div style="max-height: 150px; overflow-y: auto; padding: 0 1rem 1rem;">
            ${rulesHTML}
          </div>
        </div>

        <div class="img-frame" style="max-height: 150px;">
          <img src="${API_BASE}/${c.image_path}" alt="Complaint evidence proof" style="max-height: 150px;">
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
  
  // 2. Fetch and load the corresponding image
  try {
    // If we're loading the suspicious claim, we want to fetch pizza_plastic.png, but name the File object "midjourney_pizza_ref.png" to trigger the AI Filename check!
    const fetchImageName = type === 'suspicious' ? 'pizza_plastic.png' : imageName;
    const response = await fetch(`test_images/${fetchImageName}`);
    if (!response.ok) throw new Error("Sample image not found");
    
    const blob = await response.blob();
    const file = new File([blob], imageName, { type: 'image/png' });
    
    // Assign to global file selection variable
    selectedFile = file;
    
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
