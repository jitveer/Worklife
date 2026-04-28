console.log("JS loaded ✅");

document.addEventListener("DOMContentLoaded", () => {

    // ==========================
    // Session Check
    // ==========================
    fetch("/api/auth/session-check")
        .then(res => res.json())
        .then(data => {
            if (!data.loggedIn) {
                window.location.href = "index.html";
            } else {
                document.getElementById("userName").textContent = data.user.name;
                loadPerformancePersonalInfo();
            }
        })
        .catch(error => {
            console.error("Session check failed:", error);
            window.location.href = "index.html";
        });


    // ==========================
    // EVENTS (THIS WAS NOT RUNNING BEFORE 🔥)
    // ==========================

    // LOGOUT
    document.getElementById("logoutBtn")?.addEventListener("click", logoutUser);

    // SIDEBAR
    document.getElementById("hrBtn")?.addEventListener("click", () => {
        window.location.href = "humanresource.html?section=hr-logo";
    });

    document.getElementById("financeBtn")?.addEventListener("click", () => {
        window.location.href = "humanresource.html?section=finance-logo";
    });

    document.getElementById("itBtn")?.addEventListener("click", () => {
        window.location.href = "humanresource.html?section=it-logo";
    });

    document.getElementById("performanceBtn")?.addEventListener("click", () => {
        window.location.href = "humanresource.html?section=performance-logo";
    });

    document.getElementById("reportsBtn")?.addEventListener("click", () => {
        window.location.href = "humanresource.html?section=reports-logo";
    });

    // ADD ROW
    document.getElementById("addRowBtn")?.addEventListener("click", addBusinessTargetRow);

});




// ==========================
// Logout
// ==========================
window.logoutUser = function () {
    Swal.fire({
        title: "Are you sure?",
        text: "You will be logged out from your session.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, logout",
        cancelButtonText: "Cancel"
    }).then((result) => {
        if (result.isConfirmed) {
            fetch("/api/auth/logout")
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        Swal.fire({
                            title: "Logged Out!",
                            text: "You have been successfully logged out.",
                            icon: "success",
                            showConfirmButton: false,
                            timer: 2000
                        });
                        setTimeout(() => window.location.href = "index.html", 2000);
                    } else {
                        Swal.fire("Oops!", "Logout failed. Try again.", "error");
                    }
                })
                .catch(err => {
                    console.error("Logout error:", err);
                    Swal.fire("Error", "Something went wrong. Try again.", "error");
                });
        }
    });
};



// ==========================
// Load Personal Info
// ==========================
async function loadPerformancePersonalInfo() {
    try {
        const r = await fetch("/api/section/personalinfo", { credentials: "include" });
        const data = await r.json();
        if (!data.success) return;

        const container = document.querySelector(".personal-info");
        if (!container) return;

        const infoBlocks = [
            { label: "Request Number:", value: data.req_no },
            { label: "Employee Id:", value: data.employee_id },
            { label: "Name:", value: data.name },
            { label: "Email:", value: data.email },
            { label: "Company:", value: data.company },
            { label: "Department:", value: data.department },
            { label: "Designation:", value: data.designation },
            { label: "Line Manager:", value: data.line_manager },
            { label: "Joining Date:", value: data.joining_date || "-" }
        ];

        container.innerHTML = `
                <h6 class="info-heading">Personal Information</h6>
                ${infoBlocks.map(b => `
                    <div class="info-block">
                        <span class="label">${b.label}</span>
                        <div>${b.value || "-"}</div>
                    </div>`).join("")}
            `;
    } catch (err) {
        console.error("Fetch personal info error:", err);
    }
}



// when i open any id page till last it should b in that id page only it should not forget the id 
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    const hiddenInput = document.getElementById("appraisalId");

    // 🔹 If URL has id → store it
    if (id) {
        sessionStorage.setItem("currentAppraisalId", id);
        if (hiddenInput) hiddenInput.value = id;
        console.log("✅ Appraisal ID set from URL:", id);
    }
    // 🔹 Else try from storage
    else {
        const storedId = sessionStorage.getItem("currentAppraisalId");
        if (storedId && hiddenInput) {
            hiddenInput.value = storedId;
            console.log("✅ Appraisal ID loaded from sessionStorage:", storedId);
        } else {
            console.warn("⚠️ No appraisalId found in URL or storage");
        }
    }
});



// ==========================
// Stage Sections Mapping
// ==========================
const stageSections = {
    start_stage: ["sectionRating", "sectionTargets"],
    mid_stage: ["sectionCompetencies", "sectionBehavioral", "sectionMidYear"],
    full_stage: ["sectionRating", "sectionTargets", "sectionCompetencies", "sectionBehavioral", "sectionMidYear", "sectionFullYear", "sectionEvaluationSummary", "sectionApprovalHistory"]
};

function toggleSections(stage) {
    // Hide all sections
    [
        "sectionRating",
        "sectionTargets",
        "sectionCompetencies",
        "sectionBehavioral",
        "sectionMidYear",
        "sectionFullYear",
        "sectionEvaluationSummary",
        "sectionApprovalHistory"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    // Show current stage sections
    if (stageSections[stage]) {
        stageSections[stage].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
    }

    // // Always show approval history + actions
    // const hist = document.getElementById("sectionApprovalHistory");
    // const actions = document.getElementById("sectionApprovalActions");
    // if (hist) hist.style.display = "block";
    // if (actions) actions.style.display = "block";
}



// ==========================
// Get appraisalId from URL
// ==========================
const urlParams = new URLSearchParams(window.location.search);
const appraisalId = urlParams.get('id');
const stage = urlParams.get('stage');

if (appraisalId) {
    fetchStageDetails(appraisalId, stage);
}




// ==========================
// Fetch Stage Details
// ==========================
function fetchStageDetails(appraisalId, stage) {
    console.log("👉 Fetching stage details for appraisalId:", appraisalId, "stage:", stage);

    let url = `/api/section/appraisals/stage-info?id=${appraisalId}`;
    if (stage) {
        url += `&stage=${stage}`;
    }

    fetch(url)
        .then(res => res.json())
        .then(result => {
            console.log("Parsed JSON:", result);
            console.log("✅ Full stage-info response:", result);
            console.log("✅ Approvals array received:", result.approvals);

            if (!result.success) {
                alert(result.message);
                return;
            }

            const stage = result.stage; // start_stage | mid_stage | full_stage
            const employee = result.employee;
            const items = result.items || [];
            const comments = result.comments || "";
            const approvals = result.approvals || [];

            // Toggle sections
            toggleSections(stage);

            // Fill targets table (start_stage only)
            const tbody = document.getElementById('targetsBody');
            if (tbody && stage === "start_stage") {
                tbody.innerHTML = "";
                items.forEach((t, idx) => {
                    const row = document.createElement("tr");
                    row.setAttribute("data-item-id", t.id);
                    row.innerHTML = `
                        <td>${idx + 1}</td>
                        <td><textarea>${t.target_text || ""}</textarea></td>
                        <td><textarea>${t.manager_comments || ""}</textarea></td>
                        <td><textarea>${t.accomplishments || ""}</textarea></td>
                        <td><input type="number" value="${t.weightage || 0}" class="weight-input"></td>
                        <td>
                            <select>
                                <option value="0" ${t.rating === 0 ? "selected" : ""}>0</option>
                                <option value="5" ${t.rating === 5 ? "selected" : ""}>5</option>
                                <option value="4" ${t.rating === 4 ? "selected" : ""}>4</option>
                                <option value="3" ${t.rating === 3 ? "selected" : ""}>3</option>
                                <option value="2" ${t.rating === 2 ? "selected" : ""}>2</option>
                                <option value="1" ${t.rating === 1 ? "selected" : ""}>1</option>
                            </select>
                        </td>
                        <td><input type="text" value="${t.score || ""}"></td>
                        <td><button class="btn btn-sm btn-danger delete-row">X</button></td>
                    `;
                    tbody.appendChild(row);
                });

                // Total row
                const totalRow = document.createElement("tr");
                totalRow.id = "totalRow";
                totalRow.setAttribute("data-total-row", "true");
                totalRow.innerHTML = `
                    <td></td>
                    <td></td>
                    <td></td>
                    <td><strong>Total</strong></td>
                    <td id="totalWeight"><strong>0%</strong></td>
                    <td></td>
                    <td id="totalScore"><strong>0.0</strong></td>
                    <td></td>
                `;
                tbody.appendChild(totalRow);

                // Reindex & update total
                reindexSNo();
                updateTotalWeight();
            }

            // Comments box
            const commentsBox = document.getElementById("stageComments");
            if (commentsBox) {
                commentsBox.value = comments;
            }


            if (stage === "mid_stage") {
                const midData = result.stageData || {};   // ✅ use stageData, not items

                const idMap = {
                    // DB field → Element ID
                    communication: "communication",
                    decision_making: "decision_making",
                    quality_orientation: "quality_orientation",
                    initiative: "initiative",
                    technical_skills: "technical_skills",

                    team_work: "team_work",
                    planning_organizing: "planning_organizing",
                    adaptability: "adaptability",
                    self_confidence: "self_confidence",
                    creativity_innovation: "creativity_innovation",

                    strengths: "strengths",
                    training_needs: "training_needs",
                    manager_comments: "manager_comments",
                    employee_comments: "employee_comments",
                    comments: "midComments"

                };

                Object.keys(idMap).forEach(dbField => {
                    const elementId = idMap[dbField];
                    let el = document.querySelector(`[data-name="${elementId}"]`);
                    if (!el) el = document.getElementById(elementId);

                    if (el && midData[dbField] !== undefined) {
                        if (el.tagName === "SELECT") {
                            el.value = Math.round(Number(midData[dbField]));
                        } else {
                            el.value = midData[dbField];
                        }
                    }
                });

                // ✅ Totals
                const professionalTotal = parseFloat(result.professional_total || midData.professional_total || 0).toFixed(2);
                const behavioralTotal = parseFloat(result.behavioral_total || midData.behavioral_total || 0).toFixed(2);

                // safely update DOM only if elements exist
                const coreEl = document.getElementById("coreTotal");
                const behavioralEl = document.getElementById("behavioralTotal");

                if (coreEl) coreEl.textContent = professionalTotal;
                if (behavioralEl) behavioralEl.textContent = behavioralTotal;

            }

            // ----------------------
            // Full Stage Prefill
            // ----------------------
            if (stage === "full_stage") {
                const startItems = result.targets?.start || [];
                const midData = result.targets?.mid || {};
                const fullData = result.stageData || {};


                // ----- START STAGE -----
                const tbody = document.getElementById('targetsBody');
                if (tbody) {
                    tbody.innerHTML = "";
                    startItems.forEach((t, idx) => {
                        const row = document.createElement("tr");
                        row.setAttribute("data-item-id", t.id);
                        row.innerHTML = `
                            <td>${idx + 1}</td>
                            <td><textarea>${t.target_text || ""}</textarea></td>
                            <td><textarea>${t.manager_comments || ""}</textarea></td>
                            <td><textarea>${t.accomplishments || ""}</textarea></td>
                            <td><input type="number" value="${t.weightage || 0}" class="weight-input"></td>
                            <td>
                            <select>
                            ${[0, 1, 2, 3, 4, 5].map(r => `<option value="${r}" ${r === t.rating ? "selected" : ""}>${r}</option>`).join("")}
                            </select>
                            </td>
                            <td><input type="text" value="${t.score || ""}"></td>
                            <td><button class="btn btn-sm btn-danger delete-row">X</button></td>
                            `;
                        tbody.appendChild(row);
                    });
                    reindexSNo();
                    updateTotalWeight();
                    const totalRow = document.createElement("tr");
                    totalRow.id = "totalRow";
                    totalRow.setAttribute("data-total-row", "true");
                    totalRow.innerHTML = `
                        <td></td>
                        <td></td>
                        <td></td>
                        <td><strong>Total</strong></td>
                        <td id="totalWeight"><strong>0%</strong></td>
                        <td></td>
                        <td id="totalScore"><strong>0.0</strong></td>
                        <td></td>
                        `;
                    tbody.appendChild(totalRow);
                }


                if (document.getElementById("stageComments")) {
                    document.getElementById("stageComments").value = result.startComments || "";
                }

                if (document.getElementById("midComments")) {
                    document.getElementById("midComments").value = result.midComments || "";
                }

                // ----- MID STAGE -----
                const midMap = {
                    communication: "communication",
                    decision_making: "decision_making",
                    quality_orientation: "quality_orientation",
                    initiative: "initiative",
                    technical_skills: "technical_skills",
                    team_work: "team_work",
                    planning_organizing: "planning_organizing",
                    adaptability: "adaptability",
                    self_confidence: "self_confidence",
                    creativity_innovation: "creativity_innovation",
                    strengths: "strengths",
                    training_needs: "training_needs",
                    manager_comments: "manager_comments",
                    employee_comments: "employee_comments",
                };

                // Fill values into inputs/selects
                Object.keys(midMap).forEach(key => {
                    const el = document.getElementById(midMap[key]);
                    if (!el) return; // skip if element not found
                    const value = midData[key] ?? ""; // fallback to empty string

                    if (el.tagName === "SELECT") {
                        el.value = Number(value) || 0; // ensure numeric value for rating selects
                    } else {
                        el.value = value;
                    }
                });
                // ✅ NEW: Store mid_item ID for update
                if (document.getElementById("midItemId")) {
                    document.getElementById("midItemId").value = midData.id || midData.item_id || "";
                    console.log("💾 Prefilled midItemId:", midData.id || midData.item_id);
                }

                // Update totals safely
                const coreTotalEl = document.getElementById("coreTotal");
                const behavioralTotalEl = document.getElementById("behavioralTotal");

                if (coreTotalEl) {
                    coreTotalEl.textContent = parseFloat(midData.professional_total || 0).toFixed(2);
                } else {
                    console.warn("⚠️ #coreTotal element not found");
                }

                if (behavioralTotalEl) {
                    behavioralTotalEl.textContent = parseFloat(midData.behavioral_total || 0).toFixed(2);
                } else {
                    console.warn("⚠️ #behavioralTotal element not found");
                }

                console.log("✅ Mid Stage Totals:", {
                    professional_total: midData.professional_total,
                    behavioral_total: midData.behavioral_total
                });


                // ----- FULL STAGE -----
                const fullMap = {
                    key_achievements: "fullAchievements",
                    development_areas: "fullDevelopment",
                    employee_comments: "fullEmpComments",
                    strengths: "fullStrengths",
                    training_needs: "fullTraining",
                    manager_comments: "fullLMComments",
                    comments: "fullComments"
                };

                Object.keys(fullMap).forEach(k => {
                    const el = document.getElementById(fullMap[k]);
                    if (el && fullData[k] !== undefined) el.value = fullData[k];
                });

                console.log("➡ Full Stage Totals:", {
                    professional_total: fullData.professional_total,
                    behavioral_total: fullData.behavioral_total
                });
                // ✅ NEW: Store full_item ID for update
                if (document.getElementById("fullItemId")) {
                    const fullItemId = fullData.full_item_id || fullData.item_id || fullData.id || "";
                    document.getElementById("fullItemId").value = fullItemId;
                    console.log("💾 Prefilled fullItemId:", fullItemId);
                }


                // Full Stage Totals
                const businessEl = document.getElementById("business_score");
                const professionalEl = document.getElementById("professional_score");
                const behavioralEl = document.getElementById("behavioral_score");
                const overallEl = document.getElementById("overall_score");

                if (businessEl) businessEl.textContent = parseFloat(fullData.business_targets_score || 0).toFixed(2);
                if (professionalEl) professionalEl.textContent = parseFloat(fullData.competencies_score || 0).toFixed(2);
                if (behavioralEl) behavioralEl.textContent = parseFloat(fullData.behavioral_total || 0).toFixed(2);
                if (overallEl) overallEl.textContent = parseFloat(fullData.overall_score || 0).toFixed(2);

            }

            // 🟢 Prefill Approval History Section (Section 8)
            const approvalRows = document.querySelectorAll(".approval-table tbody tr");
            console.log("✅ Full stage response (check Section 8):", result);
            console.log("✅ section8Approvals:", result.section8Approvals);
            console.log("✅ approvals:", result.approvals);

            // Prefer stage_approvals if available (Section 8)
            const approvalsData = Array.isArray(result.section8Approvals) && result.section8Approvals.length > 0
                ? result.section8Approvals
                : result.approvals;

            if (Array.isArray(approvalsData) && approvalsData.length > 0 && approvalRows.length > 0) {
                console.log("🧾 Prefilling Approval History Section (Section 8):", approvalsData);

                approvalsData.forEach(a => {
                    const approverType = (a.approver_type || "").trim().toLowerCase();

                    approvalRows.forEach(row => {
                        const rowType = row.cells[0]?.innerText?.trim().toLowerCase();
                        if (rowType === approverType) {

                            if (a.id) row.setAttribute("data-id", a.id);

                            // Fill Approver Name
                            const nameCell = row.cells[1];
                            if (nameCell) {
                                if (nameCell.getAttribute("contenteditable") === "true") {
                                    nameCell.innerText = a.approver_name || "";
                                } else {
                                    nameCell.textContent = a.approver_name || "";
                                }
                            }

                            // Fill Approval Date
                            const dateCell = row.cells[2];
                            const input = dateCell?.querySelector("input.approval-date");
                            if (input) {
                                input.value = a.approval_date
                                    ? new Date(a.approval_date).toLocaleDateString("en-GB", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric"
                                    })
                                    : "";
                            }

                            // Fill Comments
                            const commentCell = row.cells[3];
                            if (commentCell) {
                                if (commentCell.getAttribute("contenteditable") === "true") {
                                    commentCell.innerText = a.comments || "";
                                } else {
                                    commentCell.textContent = a.comments || "";
                                }
                            }
                        }
                    });
                });
            } else {
                console.warn("⚠️ No approval history data found for this appraisal:", appraisalId);
            }


            // Approve/Reject buttons
            const approveBtn = document.getElementById("btnApprove");
            const rejectBtn = document.getElementById("btnReject");
            if (approveBtn) {
                approveBtn.addEventListener("click", () => {
                    updateApproval("Approved", stage, appraisalId);
                });
            }

            if (rejectBtn) {
                rejectBtn.addEventListener("click", () => {
                    updateApproval("Rejected", stage, appraisalId);
                });
            }

            console.log("Approvals for this stage:", approvals);

        })
        .catch(err => console.error("Error fetching stage details:", err));
}




// fetch data from employee update changes before approve
function collectStartStageUpdates(appraisalId) {
    const stageUpdates = [];
    const itemUpdates = [];

    const comments = document.getElementById("stageComments").value;
    const totalWeight = Number(document.getElementById("totalWeight").innerText.replace('%', '') || 0);
    const totalScore = Number(document.getElementById("totalScore").innerText || 0);

    stageUpdates.push({ appraisalId, comments, total_weight: totalWeight, total_score: totalScore });


    const tbody = document.getElementById('targetsBody');
    tbody.querySelectorAll('tr[data-item-id]').forEach(row => { // use data-item-id
        if (row.hasAttribute('data-total-row')) return;

        const itemId = row.getAttribute('data-item-id');
        const target_text = row.querySelector('td:nth-child(2) textarea')?.value || "";
        const manager_comments = row.querySelector('td:nth-child(3) textarea')?.value || "";
        const accomplishments = row.querySelector('td:nth-child(4) textarea')?.value || "";
        const weightage = Number(row.querySelector('td:nth-child(5) input')?.value || 0);
        const rating = Number(row.querySelector('td:nth-child(6) select')?.value || 0);
        const score = Number(row.querySelector('td:nth-child(7) input')?.value || 0);

        itemUpdates.push({
            itemId,
            target_text,
            manager_comments,
            accomplishments,
            weightage,
            rating,
            score
        });
    });

    // ✅ Return object in backend-friendly format
    return { appraisalId, stageUpdates, itemUpdates };
}


function collectMidStageUpdates(appraisalId) {
    const stageUpdates = {
        communication: parseFloat(document.getElementById("communication")?.value) || 0,
        decision_making: parseFloat(document.getElementById("decision_making")?.value) || 0,
        quality_orientation: parseFloat(document.getElementById("quality_orientation")?.value) || 0,
        initiative: parseFloat(document.getElementById("initiative")?.value) || 0,
        technical_skills: parseFloat(document.getElementById("technical_skills")?.value) || 0,
        team_work: parseFloat(document.getElementById("team_work")?.value) || 0,
        planning_organizing: parseFloat(document.getElementById("planning_organizing")?.value) || 0,
        adaptability: parseFloat(document.getElementById("adaptability")?.value) || 0,
        self_confidence: parseFloat(document.getElementById("self_confidence")?.value) || 0,
        creativity_innovation: parseFloat(document.getElementById("creativity_innovation")?.value) || 0,
        strengths: document.getElementById("strengths")?.value || "",
        training_needs: document.getElementById("training_needs")?.value || "",
        manager_comments: document.getElementById("manager_comments")?.value || "",
        employee_comments: document.getElementById("employee_comments")?.value || ""
    };

    // Totals sent **separately**, matching backend keys
    const professional_total = parseFloat(document.getElementById("coreTotal")?.textContent) || 0;
    const behavioral_total = parseFloat(document.getElementById("behavioralTotal")?.textContent) || 0;

    const comments = document.getElementById("midComments")?.value || "";
    const status = "pending";

    return { appraisalId, stageUpdates, comments, status, professional_total, behavioral_total };
}



// COLLECT FULL STAGE THEN TAKE ACTION
function collectFullStageUpdates() {

    console.log("🟢 Function collectFullStageUpdates() called");

    console.log("Business span text:", document.getElementById("business_score")?.innerText);
    console.log("Professional span text:", document.getElementById("professional_score")?.innerText);
    console.log("Behavioral span text:", document.getElementById("behavioral_score")?.innerText);
    console.log("Overall span text:", document.getElementById("overall_score")?.innerText);

    console.log("Business hidden value:", document.getElementById("business_score_input")?.value);
    console.log("Professional hidden value:", document.getElementById("professional_score_input")?.value);
    console.log("Behavioral hidden value:", document.getElementById("behavioral_score_input")?.value);
    console.log("Overall hidden value:", document.getElementById("overall_score_input")?.value);


    let appraisalId =
        Number(document.getElementById("appraisalId")?.value) ||
        Number(new URLSearchParams(window.location.search).get("id")) ||
        Number(sessionStorage.getItem("currentAppraisalId")) ||
        0;

    // Fallback for older logic
    if (!appraisalId && window.currentAppraisalId)
        appraisalId = Number(window.currentAppraisalId);

    console.log("▶ collectFullStageUpdates() - resolved appraisalId:", appraisalId);

    // -----------------------------
    // Section 2: Business Targets (start_items)
    // -----------------------------
    const startItems = [];
    const targetRows = Array.from(document.querySelectorAll("#targetsBody tr")).filter(r => !r.hasAttribute("data-total-row"));
    console.log("▶ Number of target rows found:", targetRows.length);

    targetRows.forEach((row, index) => {
        // support both dataset.itemId or dataset.id
        const itemId = row.dataset.itemId || row.dataset.id || null;

        // selectors that match your HTML (textarea in 2nd col, managerComments 3rd, accomplishments 4th, weight input 5th etc)
        const target_text = row.querySelector('td:nth-child(2) textarea')?.value?.trim() || "";
        const manager_comments = row.querySelector('td:nth-child(3) textarea')?.value?.trim() || "";
        const accomplishments = row.querySelector('td:nth-child(4) textarea')?.value?.trim() || "";
        const weightage = parseFloat(row.querySelector('td:nth-child(5) input')?.value || 0);
        const rating = parseFloat(row.querySelector('td:nth-child(6) select')?.value || 0);
        const score = parseFloat(row.querySelector('td:nth-child(7) input')?.value || 0);


        const item = {
            appraisalId,       // include appraisalId for safety
            itemId,            // backend expects .itemId (or we will accept id)
            target_text,
            manager_comments,
            accomplishments,
            weightage,
            rating,
            score
        };

        console.log(`▶ start row #${index + 1}:`, item);
        startItems.push(item);
    });

    const startStage = {
        appraisalId,
        comments: document.getElementById("stageComments")?.value?.trim() || "",
        total_weight: parseFloat(document.getElementById("totalWeight")?.textContent.replace('%', '')) || 0,
        total_score: parseFloat(document.getElementById("totalScore")?.textContent) || 0
    };
    console.log("▶ startStage:", startStage);

    // -----------------------------
    // MID STAGE (core/behavioral)
    // -----------------------------
    const midStage = {
        appraisalId,
        comments: document.getElementById("midComments")?.value?.trim() || "",
        professional_total: parseFloat(document.getElementById("coreTotal")?.textContent) || 0,
        behavioral_total: parseFloat(document.getElementById("behavioralTotal")?.textContent) || 0,
        strengths: document.getElementById("strengths")?.value?.trim() || "",
        training_needs: document.getElementById("training_needs")?.value?.trim() || "",
        manager_comments: document.getElementById("manager_comments")?.value?.trim() || "",
        employee_comments: document.getElementById("employee_comments")?.value?.trim() || ""
    };

    // midItems is a single-row object in your DB; include an itemId if present
    const midItems = [{
        appraisalId,
        itemId: document.getElementById("midItemId")?.value || null,
        communication: parseInt(document.getElementById("communication")?.value || 0),
        decision_making: parseInt(document.getElementById("decision_making")?.value || 0),
        quality_orientation: parseInt(document.getElementById("quality_orientation")?.value || 0),
        initiative: parseInt(document.getElementById("initiative")?.value || 0),
        technical_skills: parseInt(document.getElementById("technical_skills")?.value || 0),
        team_work: parseInt(document.getElementById("team_work")?.value || 0),
        planning_organizing: parseInt(document.getElementById("planning_organizing")?.value || 0),
        adaptability: parseInt(document.getElementById("adaptability")?.value || 0),
        self_confidence: parseInt(document.getElementById("self_confidence")?.value || 0),
        creativity_innovation: parseInt(document.getElementById("creativity_innovation")?.value || 0),
        strengths: midStage.strengths,
        training_needs: midStage.training_needs,
        manager_comments: midStage.manager_comments,
        employee_comments: midStage.employee_comments
    }];
    console.log("▶ midStage:", midStage, "midItems:", midItems);

    // -----------------------------
    // FULL STAGE
    // -----------------------------
    const fullStage = {
        appraisalId,
        business_targets_score: parseFloat(document.getElementById("business_score_input")?.value || 0),
        professional: parseFloat(document.getElementById("professional_score_input")?.value || 0),
        behavioral: parseFloat(document.getElementById("behavioral_score_input")?.value || 0),
        overall_score: parseFloat(document.getElementById("overall_score_input")?.value || 0),
        status: document.getElementById("fullStatus")?.value || "pending"
    };

    const fullItems = [{
        appraisalId,
        itemId: document.getElementById("fullItemId")?.value || null,
        key_achievements: document.getElementById("fullAchievements")?.value?.trim() || "",
        development_areas: document.getElementById("fullDevelopment")?.value?.trim() || "",
        employee_comments: document.getElementById("fullEmpComments")?.value?.trim() || "",
        manager_comments: document.getElementById("fullLMComments")?.value?.trim() || "",
        strengths: document.getElementById("fullStrengths")?.value?.trim() || "",
        training_needs: document.getElementById("fullTraining")?.value?.trim() || ""
    }];
    console.log("▶ fullStage:", fullStage, "fullItems:", fullItems);

    // ----- Section 3: Approval History (Section 8) -----
    const approvalRows = document.querySelectorAll(".approval-table tbody tr");
    const approvals = Array.from(approvalRows).map(row => {
        const cells = row.querySelectorAll("td");
        return {
            id: row.dataset.id ? Number(row.dataset.id) : null,
            approver_type: cells[0]?.innerText.trim() || "",
            approver_name: cells[1]?.innerText.trim() || "",
            approval_date: cells[2]?.querySelector("input")?.value || null,
            comments: cells[3]?.innerText.trim() || ""
        };
    });


    // ✅ Attach approvals correctly inside fullStage
    fullStage.section8Approvals = approvals;

    console.log("🟢 Collected Section 8 Approvals:", approvals);

    const payload = {
        appraisalId,
        startStage,
        startItems,
        midStage,
        midItems,
        fullStage,
        fullItems,
        section8Approvals: approvals
    };

    console.log("🚀 Sending to backend:", {
        appraisalId,
        startStage,
        startItems,
        midStage,
        midItems,
        fullStage,
        fullItems
    });

    console.log("🟢 Collected approvals:", approvals);
    return payload;
}




// ==========================
// Approve/Reject (with SweetAlert)
// ==========================
function updateApproval(newStatus, stage, appraisalId) {
    if (!appraisalId) return;

    document.getElementById("btnApprove").disabled = true;
    document.getElementById("btnReject").disabled = true;


    const cleanStage = stage.replace("_", "-"); // e.g. start_stage → start-stage
    const action = newStatus === "Approved" ? "approve" : "reject";

    let updates = null;
    let updateUrl = "";

    // 🔹 Decide which collector + API to use
    if (stage === "start_stage") {

        updates = collectStartStageUpdates(appraisalId);
        updateUrl = "/api/section/appraisals/start-stage/update-fields";
    } else if (stage === "mid_stage") {
        updates = collectMidStageUpdates(appraisalId);
        updateUrl = "/api/section/appraisals/mid-stage/update-fields";
    } else if (stage === "full_stage") {
        const allUpdates = collectFullStageUpdates(appraisalId);
        console.log("🟢 FULL STAGE COLLECTED DATA:", allUpdates);

        updates = {
            appraisalId: allUpdates.appraisalId,
            startStage: allUpdates.startStage,
            startItems: allUpdates.startItems,
            midStage: allUpdates.midStage,
            midItems: allUpdates.midItems,
            fullStage: allUpdates.fullStage,
            fullItems: allUpdates.fullItems
        };
        updateUrl = "/api/section/appraisals/full-stage/update-fields";
    }


    // 🔹 Save edits first
    fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                Swal.fire("Error", "Failed to save edits", "error");
                return;
            }

            // 🔹 Handle Reject with reason
            if (newStatus === "Rejected") {
                Swal.fire({
                    title: "Reason for rejection",
                    input: "textarea",
                    inputLabel: "Rejection Reason",
                    inputPlaceholder: "Enter reason here...",
                    inputValidator: (value) => {
                        if (!value || value.trim() === "") {
                            return "Reason required!";
                        }
                    },
                    showCancelButton: true
                }).then(result => {
                    if (result.isConfirmed) {
                        fetch(`/api/section/appraisals/${cleanStage}/${action}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                appraisalId: appraisalId,
                                status: newStatus,
                                reason: result.value // ✅ backend expects reason
                            })
                        })
                            .then(res => res.json())
                            .then(data => {
                                if (data.success) {
                                    Swal.fire("Rejected!", data.message, "success")
                                        .then(() => location.reload());
                                } else {
                                    Swal.fire("Notice", data.message, "warning");
                                    document.querySelectorAll(".approve-btn, .reject-btn").forEach(btn => btn.disabled = false);
                                }
                            })
                            .catch(err => {
                                console.error("Reject error:", err);
                                Swal.fire("Error", "Something went wrong", "error");
                                document.querySelectorAll(".approve-btn, .reject-btn").forEach(btn => btn.disabled = false);
                            });
                    } else {
                        // If cancel reject prompt, re-enable buttons
                        document.querySelectorAll(".approve-btn, .reject-btn").forEach(btn => btn.disabled = false);
                    }
                });

            } else {
                // 🔹 Handle Approve (no reason needed)
                Swal.fire({
                    title: "Approve appraisal?",
                    text: "Once approved, cannot be reverted.",
                    icon: "question",
                    showCancelButton: true,
                    confirmButtonText: "Approve"
                }).then(result => {
                    if (result.isConfirmed) {
                        fetch(`/api/section/appraisals/${cleanStage}/${action}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                appraisalId: appraisalId,
                                status: newStatus
                            })
                        })
                            .then(res => res.json())
                            .then(data => {
                                if (data.success) {
                                    Swal.fire("Approved!", data.message, "success")
                                        .then(() => location.reload());
                                } else {
                                    Swal.fire("Notice", data.message, "warning");
                                    document.querySelectorAll(".approve-btn, .reject-btn").forEach(btn => btn.disabled = false);
                                }
                            })
                            .catch(err => {
                                console.error("Approve error:", err);
                                Swal.fire("Error", "Something went wrong", "error");
                                document.querySelectorAll(".approve-btn, .reject-btn").forEach(btn => btn.disabled = false);
                            });
                    } else {
                        // If cancel approve prompt, re-enable buttons
                        document.querySelectorAll(".approve-btn, .reject-btn").forEach(btn => btn.disabled = false);
                    }
                });
            }
        })
        .catch(err => {
            console.error("Save error:", err);
            Swal.fire("Error", "Something went wrong", "error");
            document.querySelectorAll(".approve-btn, .reject-btn").forEach(btn => btn.disabled = false);
        });
}





// ================================
// Update total weight dynamically
// ================================

function updateTotalWeight() {
    const weightInputs = document.querySelectorAll('#targetsBody .weight-input');
    let total = 0;
    weightInputs.forEach(input => total += parseFloat(input.value) || 0);

    const totalRow = document.querySelector('#totalRow');
    if (totalRow) {
        const totalCell = totalRow.querySelector('td:nth-child(5)');
        if (totalCell) {
            totalCell.innerHTML = `<strong>${total}%</strong>`;
            totalCell.style.color = (total === 100 ? "green" : (total > 100 ? "red" : "black"));
        }
    }
}





// ==========================
// Update scores dynamically
// ==========================
function updateScores() {
    const tbody = document.getElementById('targetsBody');
    if (!tbody) return;

    let totalScore = 0;

    tbody.querySelectorAll('tr:not([data-total-row="true"])').forEach(row => {
        const weightInput = row.querySelector('td:nth-child(5) input');
        const ratingSelect = row.querySelector('td:nth-child(6) select');
        const scoreInput = row.querySelector('td:nth-child(7) input');

        const weight = parseFloat(weightInput.value) || 0;
        const rating = parseFloat(ratingSelect.value) || 0;

        const score = (weight / 100) * rating;
        scoreInput.value = score;

        totalScore += parseFloat(score);
    });

    // Update total score in the totalRow (7th column)
    const totalRow = document.getElementById('totalRow');
    if (totalRow) {
        const totalScoreCell = totalRow.querySelector('td:nth-child(7)');
        if (totalScoreCell) totalScoreCell.innerHTML = `<strong>${totalScore.toFixed(2)}</strong>`;
    }

    // also update the evaluation summary business score span
    const businessSummaryEl = document.getElementById("business_score");
    if (businessSummaryEl) {
        businessSummaryEl.textContent = totalScore.toFixed(2);
        document.getElementById("business_score_input").value = totalScore.toFixed(2);
    }

    // recalc overall
    calculateOverallFullStageScore();

}





// ==========================
// Listen to changes on weight or rating
// ==========================
document.addEventListener('input', function (e) {
    if (e.target.classList.contains('weight-input')) {
        updateTotalWeight();
        updateScores();
    }
});

document.addEventListener('change', function (e) {
    if (e.target.tagName === "SELECT") {
        updateScores();
    }
});






// ==========================
// Helper for Numeric Reading
// ==========================
function readNumericFromText(raw) {
    if (raw === null || raw === undefined) return 0;
    const cleaned = ("" + raw).replace(/[^\d.-]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}



// ==========================
// NEW: Update Professional (Core) Table Scores
// ==========================
function updateProfessionalScores() {
    const coreTotalEl = document.getElementById("coreTotal");
    if (!coreTotalEl) return;

    const total = parseFloat(coreTotalEl.textContent) || 0;
    const coreFinal = Number(total.toFixed(2));

    document.getElementById("professional_score").textContent = coreFinal;
    document.getElementById("professional_score_input").value = coreFinal;

    calculateOverallFullStageScore();
}

// ==========================
// NEW: Update Behavioral Table Scores
// ==========================
function updateBehavioralScores() {
    const behTotalEl = document.getElementById("behavioralTotal");
    if (!behTotalEl) return;

    const total = parseFloat(behTotalEl.textContent) || 0;
    const behFinal = Number(total.toFixed(2));

    document.getElementById("behavioral_score").textContent = behFinal;
    document.getElementById("behavioral_score_input").value = behFinal;

    calculateOverallFullStageScore();
}

// ==========================
// Listeners for Core & Behavioral Tables
// ==========================
document.querySelectorAll(".tech-rating").forEach(select => {
    select.addEventListener("change", updateProfessionalScores);
});
document.querySelectorAll(".beh-rating").forEach(select => {
    select.addEventListener("change", updateBehavioralScores);
});





// Auto-sync core total to hidden field and summary
const coreObserver = new MutationObserver(() => {
    updateProfessionalScores();
});
coreObserver.observe(document.getElementById("coreTotal"), { childList: true, characterData: true, subtree: true });

// Auto-sync behavioral total to hidden field and summary
const behavioralObserver = new MutationObserver(() => {
    updateBehavioralScores();
});
behavioralObserver.observe(document.getElementById("behavioralTotal"), { childList: true, characterData: true, subtree: true });





// ==========================
// Overall Full Stage Score
// ==========================
window.calculateOverallFullStageScore = function () {
    const read = n => {
        const v = parseFloat(String(n).replace(/[^\d.-]/g, ""));
        return isNaN(v) ? 0 : v;
    };

    const business = read(document.getElementById("business_score")?.textContent);
    const professional = read(document.getElementById("professional_score")?.textContent);
    const behavioral = read(document.getElementById("behavioral_score")?.textContent);

    // ✅ Correct 60–20–20 weighting formula
    const overall = (business * 0.6) + (professional * 0.2) + (behavioral * 0.2);
    const final = Number(overall.toFixed(2));

    document.getElementById("overall_score").textContent = final;
    document.getElementById("overall_score_input").value = final;
};





// ==========================
// Add/Delete Row for Business Targets
// ==========================

window.addBusinessTargetRow = function () {
    const tbody = document.getElementById("targetsBody");
    if (!tbody) return;

    const totalRow = tbody.querySelector("tr[data-total-row='true']");

    const tr = document.createElement("tr");

    const newId = `new-${Date.now()}`;
    tr.setAttribute('data-item-id', newId);

    tr.innerHTML = `
        <td class="sno"></td>
        <td><textarea placeholder="Enter target"></textarea></td>
        <td><textarea placeholder="Manager comments"></textarea></td>
        <td><textarea placeholder="Accomplishments"></textarea></td>
        <td><input type="number" value="0" min="0" max="100" class="weight-input"></td>
        <td>
            <select>
                <option value="0" selected>0</option>
                <option value="5">5</option>
                <option value="4">4</option>
                <option value="3">3</option>
                <option value="2">2</option>
                <option value="1">1</option>
            </select>
        </td>
        <td><input type="text" placeholder="Score" readonly></td>
        <td><button class="btn btn-sm btn-danger delete-row">X</button></td>
        `;

    // Insert new row before total
    tbody.insertBefore(tr, totalRow);

    // Reindex S.No.
    reindexSNo();
    // Update total weight
    updateTotalWeight();
};

// Reindex S.No.
function reindexSNo() {
    const rows = document.querySelectorAll("#targetsBody tr:not([data-total-row='true'])");
    rows.forEach((row, index) => {
        const snoCell = row.querySelector(".sno") || row.querySelector("td:first-child");
        if (snoCell) snoCell.textContent = index + 1;
    });
}


// Delete row
document.getElementById("targetsBody").addEventListener("click", async function (e) {
    const btn = e.target.closest(".delete-row");
    if (!btn) return;

    const row = btn.closest("tr");
    if (!row) return;

    if (row.dataset.totalRow === "true") return;

    // Read correct id (from any attribute)
    const id =
        row.dataset.id ||
        row.dataset.itemId ||
        row.getAttribute("data-item-id") ||
        null;

    console.log("Deleting item with id:", id);

    if (!confirm("Delete this row?")) return;

    // --- CASE 1: delete from DB ---
    if (id && !id.startsWith("new-")) {

        const res = await fetch("/api/section/appraisals/start-stage/delete-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });

        const data = await res.json();

        if (!data.success) {
            alert("Delete failed!");
            return;
        }
    }

    // --- CASE 2: delete only from UI ---
    row.remove();
    reindexSNo();
    updateTotalWeight();
    updateScores();
});

// function attachDeleteButtons() {
//     const buttons = document.querySelectorAll(".delete-row");
//     buttons.forEach(btn => {
//         btn.onclick = () => {
//             btn.closest('tr').remove();
//             reindexSNo();
//             updateTotalWeight();
//         };
//     });
// }

// Listen to input changes to update total weight dynamically
document.addEventListener('input', function (e) {
    if (e.target.classList.contains('weight-input')) {
        updateTotalWeight();
    }
});
// ✅ PUT THIS HERE (very bottom)
document.addEventListener("DOMContentLoaded", () => {
    updateScores();
    updateProfessionalScores();
    updateBehavioralScores();
    calculateOverallFullStageScore();
});





// display of rating even though using default 0 
function populateMidStageRatings(midData) {
    // midData.targets contains the filled data object
    const data = midData.targets;

    // Professional/Technical competencies
    document.querySelectorAll("#sectionCompetencies select.tech-rating").forEach(select => {
        const field = select.dataset.name; // e.g., "communication"
        if (data[field] !== undefined) {
            select.value = data[field];  // set dropdown value
        }
    });

    // Behavioral competencies
    document.querySelectorAll("#sectionBehavioral select.beh-rating").forEach(select => {
        const field = select.dataset.name; // e.g., "team_work"
        if (data[field] !== undefined) {
            select.value = data[field]; // set dropdown value
        }
    });
    calculateAverage(".tech-rating", "#coreTotal");
    calculateAverage(".beh-rating", "#behavioralTotal");
}



// behaviour and competencies total calculations
document.addEventListener("DOMContentLoaded", function () {

    // Generic function to calculate average of selected dropdowns
    function calculateAverage(selectorClass, totalCellSelector) {
        let total = 0;
        let count = 0;

        document.querySelectorAll(selectorClass).forEach(select => {
            const val = parseInt(select.value, 10);
            if (val > 0) {
                total += val;
                count++;
            }
        });

        const average = count > 0 ? (total / count).toFixed(1) : '0.0';

        // Update the total cell (last row, last cell)
        const totalCell = document.querySelector(totalCellSelector);
        if (totalCell) {
            totalCell.textContent = average;
        }
    }

    // Function to attach change listeners to dropdowns
    function setupListeners(selectorClass, totalCellSelector) {
        document.querySelectorAll(selectorClass).forEach(select => {
            select.addEventListener("change", function () {
                calculateAverage(selectorClass, totalCellSelector);
            });
        });
    }

    /// Core Competencies
    setupListeners(".tech-rating", "#coreTotal");  // Change selector
    calculateAverage(".tech-rating", "#coreTotal");  // Change selector

    // Behavioral Competencies
    setupListeners(".beh-rating", "#behavioralTotal");  // Change selector
    calculateAverage(".beh-rating", "#behavioralTotal");  // Change selector

});




