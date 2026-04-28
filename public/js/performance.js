// ==========================
// Session Check + Logout
// ==========================
fetch("/api/auth/session-check", {
    credentials: "include"   // ⭐ IMPORTANT
})
    .then(res => res.json())
    .then(data => {

        if (!data.loggedIn) {
            window.location.href = "index.html";
            return;
        }

        // ✅ Username
        document.getElementById("userName").textContent = data.user.name;

        // ===============================
        // ✅ HEADER REDIRECT
        // ===============================
        const header = document.getElementById("headerLogo");

        if (header) {
            header.addEventListener("click", () => {
                window.location.href =
                    data.user.roleId === 4
                        ? "employee-dashboard.html"
                        : "humanresource.html";
            });
        }



        // ===============================
        // ✅ SIDEBAR CHANGE
        // ===============================
        if (data.user.roleId === 4) {

            const panel = document.getElementById("sidePanel");

            if (panel) {
                panel.innerHTML = `

            <button class="btn-hr" id="leaveBtn">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <i class="fa-solid fa-calendar-check"></i>
                    <span>Leave</span>
                </div>
            </button>

            <button class="btn-finance" id="expenseBtn">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <i class="fa-solid fa-money-bill"></i>
                    <span>Expense</span>
                </div>
            </button>

            <button class="btn-reports" id="performanceBtn2">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <i class="fa-solid fa-chart-column"></i>
                    <span>Performance</span>
                </div>
            </button>

            <button class="btn-it" id="petrolBtn">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <i class="fa-solid fa-gas-pump"></i>
                    <span>Petrol</span>
                </div>
            </button>

            <button class="btn-pm" id="salesBtn">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <i class="fa-solid fa-chart-line"></i>
                    <span>Incentive</span>
                </div>
            </button>

            <!-- 🔵 Blue Certificate -->
            <button class="btn-reports" style="background-color:#0d6efd;" id="certificateBtn">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <i class="fa-solid fa-certificate"></i>
                    <span>Certificate</span>
                </div>
            </button>

            `;
                document.getElementById("leaveBtn")?.addEventListener("click", () => location.href = "LeaveRequest.html");
                document.getElementById("expenseBtn")?.addEventListener("click", () => location.href = "expense-claim.html");
                document.getElementById("performanceBtn2")?.addEventListener("click", () => location.href = "performance.html");
                document.getElementById("petrolBtn")?.addEventListener("click", () => location.href = "petrol-conveyance.html");
                document.getElementById("salesBtn")?.addEventListener("click", () => location.href = "sales.html");
                document.getElementById("certificateBtn")?.addEventListener("click", () => location.href = "certificate.html");
            }
        }

        // ✅ Your existing function
        loadPerformancePersonalInfo();

    })
    .catch(error => {
        console.error("Session check failed:", error);
        window.location.href = "index.html";
    });

// logout
function logoutUser() {
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
}


// ==========================
// Personal Info Block
// ==========================
async function loadPerformancePersonalInfo() {
    try {
        const r = await fetch("/api/section/personalinfo", { credentials: "include" });
        const data = await r.json();
        if (!data.success) {
            console.warn("Personal info not found:", data.message);
            return;
        }

        const container = document.querySelector(".personal-info");
        if (!container) return;

        const infoBlocks = [
            { label: "Request No:", value: data.req_no },
            { label: "Employee Id:", value: data.employee_id },
            { label: "Name:", value: data.name },
            { label: "My Email:", value: data.email },
            { label: "Company:", value: data.company },
            { label: "Department:", value: data.department },
            { label: "Designation:", value: data.designation },
            { label: "Line Manager:", value: data.line_manager },
            { label: "Joining Date:", value: data.joining_date || "-" }
        ];

        container.innerHTML = `
      <h6 class="info-heading">Personal Information:</h6>
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



// stage visiblities
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const appraisalId = params.get("id");
    const stage = params.get("stage"); // start_stage | mid_stage | full_stage

    if (!appraisalId || !stage) {
        alert("Invalid link!");
        return;
    }

    console.log("👉 Opening Appraisal:", appraisalId, "Stage:", stage);

    // ✅ All section IDs
    const allSections = [
        "sectionRating",
        "sectionTargets",
        "sectionCompetencies",
        "sectionBehavioral",
        "sectionMidYear",
        "sectionFullYear",
        "sectionEvaluationSummary",
        "sectionApprovalHistory"
    ];

    // ✅ Always show all sections
    allSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "block";
    });

    // ✅ Utility: disable entire section
    function disableSection(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll("input, textarea, select, button")
            .forEach(elm => elm.disabled = true);
    }

    // ✅ Utility: enable entire section
    function enableSection(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll("input, textarea, select, button")
            .forEach(elm => elm.disabled = false);
    }


    // ✅ Disable contenteditable cells too
    function disableContentEditable(id) {
        const el = document.getElementById(id);
        if (!el) return;

        el.querySelectorAll("[contenteditable='true']")
            .forEach(cell => {
                cell.setAttribute("contenteditable", "false");
                cell.style.pointerEvents = "none";
                cell.style.backgroundColor = "#eee";
            });
    }

    // ✅ Enable contenteditable cells (full_stage)
    function enableContentEditable(id) {
        const el = document.getElementById(id);
        if (!el) return;

        el.querySelectorAll("[contenteditable='true']")
            .forEach(cell => {
                cell.setAttribute("contenteditable", "true");
                cell.style.pointerEvents = "auto";
                cell.style.backgroundColor = "";
            });
    }


    // ✅ Determine which sections must be enabled
    let sectionsToEnable = [];

    if (stage === "start_stage")
        sectionsToEnable = ["sectionRating", "sectionTargets"];

    if (stage === "mid_stage")
        sectionsToEnable = ["sectionCompetencies", "sectionBehavioral", "sectionMidYear"];

    if (stage === "full_stage")
        sectionsToEnable = allSections; // full access

    // ✅ First disable everything
    allSections.forEach(id => disableSection(id));

    // ✅ Enable only the required sections
    sectionsToEnable.forEach(id => enableSection(id));

    // ✅ Disable Approval History in start & mid stage
    if (stage === "start_stage" || stage === "mid_stage") {
        disableContentEditable("sectionApprovalHistory");
    }

    // ✅ Enable Approval History in full stage
    if (stage === "full_stage") {
        enableContentEditable("sectionApprovalHistory");
    }

    // ---------------------------------------
    // ✅ 4. Disable required fields inside Start Stage
    // ---------------------------------------
    if (stage === "start_stage") {

        function disableStartStageFields() {
            document.querySelectorAll("#targetsBody td[data-field='managerComments'] textarea")
                .forEach(el => el.disabled = true);
            document.querySelectorAll("#targetsBody td[data-field='accomplishments'] textarea")
                .forEach(el => el.disabled = true);
            document.querySelectorAll("#targetsBody td[data-field='rating'] select")
                .forEach(el => el.disabled = true);
            document.querySelectorAll("#targetsBody td[data-field='score'] input")
                .forEach(el => el.disabled = true);
        }

        disableStartStageFields();
    }

    // ===== Start-Stage Initialization =====
    if (stage === "start_stage") {
        const targetsBody = document.getElementById("targetsBody");
        //const btnSubmit = document.getElementById("btnSubmit");

        if (targetsBody) {
            setTableEditable();
            updateTotalWeight();
            updateScore();

            targetsBody.addEventListener("input", (e) => {
                if (e.target.matches("[data-field='weight'] input") || e.target.matches("[data-field='rating'] select")) {
                    updateTotalWeight();
                    updateScore();
                }
            });

            targetsBody.addEventListener("change", (e) => {
                if (e.target.tagName === "SELECT") updateScore();
            });
        }

    }

    // ===== Mid-Stage Initialization =====
    if (stage === "mid_stage") {
        console.log("✅ Mid-stage initialization running");

        const midSections = ["sectionCompetencies", "sectionBehavioral", "sectionMidYear"];
        midSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });


        if (typeof loadMidStageData === "function") loadMidStageData(appraisalId, stage);
        if (typeof attachMidStageListeners === "function") attachMidStageListeners(appraisalId, stage);

        const btnMid = document.getElementById("midStageSubmit");
        if (btnMid) btnMid.addEventListener("click", submitMidStage);
    }

    // ===== Full Stage Initialization (if needed) =====
    if (stage === "full_stage") {
        console.log("✅ Full-stage initialization running");

        const appraisalId = new URLSearchParams(window.location.search).get("id");

        // Step 1: Prefill data from start & mid stage
        // NEW (matches your routes)
        fetch(`/api/section/employee/full-stage-prefill/${appraisalId}`)
            .then(res => res.json())
            .then(({ success, data }) => {
                if (!success) {
                    console.error("Failed to load full-stage prefill data");
                    return;
                }

                // Prefill Start Stage (Section 1 & 2)
                if (data.startStage && data.startItems) {
                    prefillStartStage(data.startStage, data.startItems);
                }

                // Prefill Mid Stage (Section 3 & 4)
                if (data.midStage && data.midItems) {
                    prefillMidStage(data.midStage, data.midItems[0] || {});
                }

            })
            .catch(err => console.error("❌ Error fetching full-stage prefill:", err));

        // Step 2: Evaluation Summary
        loadEvaluationSummary(appraisalId);

    }

    // ===== Unified Submit Button =====
    const btnSubmit = document.getElementById("btnSubmit");
    if (btnSubmit) {
        btnSubmit.addEventListener("click", () => {
            if (stage === "start_stage") submitStartStage();
            else if (stage === "mid_stage") submitMidStage();
            else if (stage === "full_stage") submitFullStage?.(); // optional, if defined
        });
    }

    // Load data from backend
    fetch(`/api/section/appraisals/stage-info?id=${appraisalId}&stage=${stage}`)
        .then(res => res.json())
        .then(data => console.log("Stage Data:", data))
        .catch(err => console.error(err));
});



// ==========================
// Table Dynamic Functions
// ==========================

// Enable/disable fields dynamically
function setTableEditable() {
    document.querySelectorAll("#targetsBody tr").forEach(row => {
        if (row.dataset.totalRow) return;

        // Map of fields and whether they should be editable
        const fields = {
            target: true,            // target_text
            comments: true,       // comments
            weight: true,            // weightage
            managerComments: false,  // manager_comments
            accomplishments: false,  // accomplishments
            rating: false,           // rating select
            score: false             // score input
        };

        for (const [field, editable] of Object.entries(fields)) {
            const cell = row.querySelector(`[data-field='${field}']`);
            if (!cell) continue;

            const input = cell.querySelector("textarea, input, select");
            if (!input) continue;

            if (editable) {
                input.removeAttribute("disabled");
                input.removeAttribute("readonly");
            } else {
                if (input.tagName === "INPUT" || input.tagName === "TEXTAREA") input.disabled = true;
                if (input.tagName === "SELECT") input.disabled = true;
                if (field === "score") input.readOnly = true; // optional, make score readonly
            }
        }
    });

    // Show Add Row button
    const addBtn = document.querySelector(".add-row-btn");
    if (addBtn) addBtn.style.display = "inline-block";
}


// update total weight 
function updateTotalWeight() {
    const weightInputs = document.querySelectorAll("#targetsBody .weight-input");
    let total = 0;

    weightInputs.forEach(input => {
        total += parseFloat(input.value) || 0;
    });

    const totalRow = document.querySelector("tr[data-total-row='true']");
    if (!totalRow) return;

    const totalCell = totalRow.querySelector("td[data-field='weight']");
    if (totalCell) {
        totalCell.innerHTML = `<strong>${total}%</strong>`;
        totalCell.style.color = total === 100 ? "green" : (total > 100 ? "red" : "black");
    }
}


// score calculation
function updateScore() {
    const rows = document.querySelectorAll("#targetsBody tr:not([data-total-row='true'])");
    let totalScore = 0;

    rows.forEach(row => {
        const weightInput = row.querySelector("[data-field='weight'] input");
        const ratingSelect = row.querySelector("[data-field='rating'] select");
        const scoreInput = row.querySelector("[data-field='score'] input");

        const weight = parseFloat(weightInput?.value) || 0;
        const rating = parseFloat(ratingSelect?.value) || 0;

        const score = ((weight * rating) / 100).toFixed(2);
        if (scoreInput) scoreInput.value = score;

        totalScore += parseFloat(score);
    });

    // Update total score in total row
    const totalRow = document.querySelector("tr[data-total-row='true']");
    if (!totalRow) return;

    const totalScoreCell = totalRow.querySelector("td[data-field='score']");
    if (totalScoreCell) totalScoreCell.innerHTML = `<strong>${totalScore.toFixed(2)}</strong>`;
}


document.getElementById("targetsBody").addEventListener("input", (e) => {
    if (e.target.classList.contains("weight-input")) {
        updateTotalWeight();
        updateScore();
    }
});

document.getElementById("targetsBody").addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT") {
        updateScore();
    }
});





// Add new row dynamically
function addBusinessTargetRow() {
    const tbody = document.getElementById("targetsBody");
    const totalRow = tbody.querySelector("tr[data-total-row='true']");

    // Create new row
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td class="sno"></td>
        <td data-field="target"><textarea placeholder="Enter target"></textarea></td>
        <td data-field="managerComments"><textarea placeholder="Manager comments"></textarea></td>
        <td data-field="accomplishments"><textarea placeholder="Accomplishments"></textarea></td>
        <td data-field="weight"><input type="number" value="0" min="0" max="100" class="weight-input"></td>
        <td data-field="rating">
            <select>
                <option value="0" selected>0</option>
                <option value="5">5</option>
                <option value="4">4</option>
                <option value="3">3</option>
                <option value="2">2</option>
                <option value="1">1</option>
            </select>
        </td>
        <td data-field="score"><input type="text" readonly></td>
        <td><button class="btn btn-sm btn-danger delete-row">X</button></td>
    `;

    // ✅ Always insert BEFORE total row
    tbody.insertBefore(tr, totalRow);

    reindexSNo();
    setTableEditable();
    updateTotalWeight();
    updateScore();
}



// 🔹 Reindex S.No. for all non-total rows only
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
//     document.querySelectorAll(".delete-row").forEach(btn => {
//         btn.onclick = (e) => {
//             const row = e.target.closest("tr");
//             if (row.dataset.totalRow) return;
//             row.remove();
//             reindexSNo();
//             updateTotalWeight();
//             updateScore();
//         };
//     });
// }



// start stage submit button 
function submitStartStage() {
    const rows = document.querySelectorAll("#targetsBody tr:not([data-total-row='true'])");
    const totalRow = document.querySelector("tr[data-total-row='true']");
    const totalWeight = parseFloat(totalRow.querySelector("td[data-field='weight'] strong")?.textContent) || 0;
    const totalScore = parseFloat(totalRow.querySelector("td[data-field='score'] strong")?.textContent) || 0;
    const targets = [];
    const overallComments = document.getElementById("Comments")?.value || "";

    rows.forEach(row => {
        const textareas = row.querySelectorAll("textarea");
        const inputs = row.querySelectorAll("input[type='number'], input[type='text']");
        const select = row.querySelector("select");
        const targetText = textareas[0]?.value.trim();
        if (!targetText) return;

        targets.push({
            id: row.dataset.dbId || null,
            target_text: targetText,
            manager_comments: row.querySelector("[data-field='managerComments'] textarea")?.value || "",
            accomplishments: textareas[1]?.value || "",
            weightage: parseFloat(inputs[0]?.value) || 0,
            rating: parseInt(select?.value) || 0,
            score: parseFloat(inputs[1]?.value) || 0
        });
    });

    fetch("/api/section/submit-start-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets, overallComments })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) Swal.fire("Submitted!", data.message, "success");
            else Swal.fire("Error", data.message, "error");
        })
        .catch(err => Swal.fire("Error", "Something went wrong", "error"));
}




// mid stage submit button
//document.getElementById("btnSubmit").addEventListener("click", submitMidStage);

function submitMidStage() {
    const appraisalId = new URLSearchParams(window.location.search).get("id");
    if (!appraisalId) return Swal.fire("Error", "Appraisal ID missing", "error");

    const professionalTotal = document.querySelector("#sectionCompetencies table tr:last-child td:last-child")?.textContent.trim() || "0";
    const behavioralTotal = document.querySelector("#sectionBehavioral table tr:last-child td:last-child")?.textContent.trim() || "0";

    const payload = {
        appraisalId,
        stage: "mid_stage",
        professional_total: parseFloat(professionalTotal),
        behavioral_total: parseFloat(behavioralTotal),
        items: [{
            communication: document.querySelector('[data-name="Communication"]')?.value || "",
            decision_making: document.querySelector('[data-name="Decision Making"]')?.value || "",
            quality_orientation: document.querySelector('[data-name="Quality Orientation And Accuracy"]')?.value || "",
            initiative: document.querySelector('[data-name="Initiative"]')?.value || "",
            technical_skills: document.querySelector('[data-name="Technical Skills"]')?.value || "",
            team_work: document.querySelector('[data-name="Team Work"]')?.value || "",
            planning_organizing: document.querySelector('[data-name="Planning and Organizing"]')?.value || "",
            adaptability: document.querySelector('[data-name="Adaptability / Flexibility"]')?.value || "",
            self_confidence: document.querySelector('[data-name="Self Confidence"]')?.value || "",
            creativity_innovation: document.querySelector('[data-name="Creativity and Innovation"]')?.value || "",
            strengths: document.getElementById("midStrengths")?.value || "",
            training_needs: document.getElementById("midTraining")?.value || "",
            manager_comments: document.getElementById("midLMComments")?.value || "",
            employee_comments: document.getElementById("midEmpComments")?.value || ""
        }],
        overallComments: document.getElementById("midComments")?.value || ""
    };

    console.log("Submitting mid-stage:", payload);

    fetch("/api/section/submit-mid-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Swal.fire("Submitted!", data.message, "success");
                loadEvaluationSummary(appraisalId);
            } else {
                Swal.fire("Error", data.message, "error");
            }
        })
        .catch(err => Swal.fire("Error", "Something went wrong", "error"));
}


// behaviour and competencies total calculations


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

document.addEventListener("DOMContentLoaded", function () {
    // Core Competencies
    setupListeners(".tech-rating", "#sectionCompetencies table tr:last-child td:last-child");
    calculateAverage(".tech-rating", "#sectionCompetencies table tr:last-child td:last-child");

    // Behavioral Competencies
    setupListeners(".beh-rating", "#sectionBehavioral table tr:last-child td:last-child");
    calculateAverage(".beh-rating", "#sectionBehavioral table tr:last-child td:last-child");

});


//===========================
// full stage 
//===========================
// function loadFullStage(appraisalId) {
//     var xhr = new XMLHttpRequest();
//     xhr.open("GET", "/api/section/employee/full-stage/" + appraisalId, true);
//     xhr.setRequestHeader("Content-Type", "application/json");

//     xhr.onreadystatechange = function () {
//         if (xhr.readyState === 4) {
//             if (xhr.status === 200) {
//                 var res = JSON.parse(xhr.responseText);

//                 if (res.success) {
//                     // Prefill Section 1 (start_stage data)
//                     document.getElementById("Comments").value = res.stageData.comments || "";
//                     document.getElementById("weight").innerHTML = "<strong>" + (res.stageData.total_weight || 100) + "%</strong>";
//                     document.getElementById("score").innerHTML = "<strong>" + (res.stageData.total_score || 0) + "</strong>";

//                     // Prefill Section 2 (start_items targets)
//                     var targetsBody = document.getElementById("targetsBody");
//                     targetsBody.innerHTML = ""; // clear existing rows


//                     for (var i = 0; i < res.items.length; i++) {
//                         var item = res.items[i];

//                         var tr = document.createElement("tr");
//                         tr.setAttribute("data-item-id", item.id);

//                         tr.innerHTML = `
//                             <td>${i + 1}</td>
//                             <td data-field="target"><textarea>${item.target_text || ""}</textarea></td>
//                             <td data-field="managerComments"><textarea>${item.manager_comments || ""}</textarea></td>
//                             <td data-field="accomplishments"><textarea>${item.accomplishments || ""}</textarea></td>
//                             <td data-field="weight"><input type="number" class="weight-input" value="${item.weightage || 0}"></td>
//                             <td data-field="rating">
//                                 <select>
//                                     <option value="0" ${item.rating === 0 ? "selected" : ""}>0</option>
//                                     <option value="1" ${item.rating === 1 ? "selected" : ""}>1</option>
//                                     <option value="2" ${item.rating === 2 ? "selected" : ""}>2</option>
//                                     <option value="3" ${item.rating === 3 ? "selected" : ""}>3</option>
//                                     <option value="4" ${item.rating === 4 ? "selected" : ""}>4</option>
//                                     <option value="5" ${item.rating === 5 ? "selected" : ""}>5</option>
//                                 </select>
//                             </td>
//                             <td data-field="score"><input type="text" value="${item.score || 0}" readonly></td>
//                             <td><button class="btn btn-sm btn-danger delete-row">X</button></td>
//                         `;
//                         targetsBody.appendChild(tr);
//                     }

//                     // Re-add total row from backend values
//                     var totalRow = document.createElement("tr");
//                     totalRow.id = "totalRow";
//                     totalRow.setAttribute("data-total-row", "true");
//                     totalRow.innerHTML = `
//                         <td></td>
//                         <td></td>
//                         <td></td>
//                         <td><strong>Total</strong></td>
//                         <td data-field="weight"><strong>${res.stageData.total_weight || 0}%</strong></td>
//                         <td></td>
//                         <td data-field="score"><strong>${res.stageData.total_score || 0}</strong></td>
//                         <td></td>
//                     `;
//                     targetsBody.appendChild(totalRow);

//                 } else {
//                     alert(res.message);
//                 }
//             } else {
//                 alert("Error fetching full-stage data!");
//             }
//         }
//     };

//     xhr.send();
// }


function loadPreviousForFullStage(appraisalId) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/section/employee/full-stage/prefill/" + appraisalId, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var res = JSON.parse(xhr.responseText);
            if (res.success) {
                // 📝 Prefill Start Stage Targets
                if (res.startStage && res.startItems) {
                    prefillStartStage(res.startStage, res.startItems);
                    updateTotalWeight(); // ✅ calculate totals
                    updateScore();       // ✅ calculate scores
                }

                // 📝 Prefill Mid Stage Competencies
                if (res.midStage && res.midItems) {
                    prefillMidStage(res.midStage, res.midItems[0]);
                    calculateAverage(".tech-rating", "#coreTotal");
                    calculateAverage(".beh-rating", "#behavioralTotal");
                }

                // 📝 You can extend this to prefill behavioral/technical fields too
            } else {
                alert(res.message);
            }
        }
    };
    xhr.send();
}


function prefillStartStage(stageData, items) {
    updateTotalWeight();
    updateScore();
    // Prefill comments & totals
    document.getElementById("Comments").value = stageData.comments || "";
    document.getElementById("weight").textContent = stageData.total_weight || "0%";
    document.getElementById("score").textContent = stageData.total_score || 0;

    const tbody = document.getElementById("targetsBody");
    tbody.innerHTML = ""; // clear existing rows

    // Add rows dynamically with id
    items.forEach((item, index) => {
        const tr = document.createElement("tr");
        tr.dataset.id = item.id || ""; // ✅ preserve id

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td data-field="target"><textarea placeholder="Enter target">${item.target_text || ""}</textarea></td>
            <td data-field="managerComments"><textarea placeholder="Manager comments">${item.manager_comments || ""}</textarea></td>
            <td data-field="accomplishments"><textarea placeholder="Accomplishments">${item.accomplishments || ""}</textarea></td>
            <td data-field="weight"><input type="number" class="weight-input" value="${item.weightage || 0}"></td>
            <td data-field="rating">
                <select>
                    ${[5, 4, 3, 2, 1, 0].map(r => `<option value="${r}" ${r == item.rating ? "selected" : ""}>${r}</option>`).join('')}
                </select>
            </td>
            <td data-field="score"><input type="text" value="${item.score || 0}"></td>
            <td><button class="btn btn-sm btn-danger delete-row">X</button></td>
        `;

        tbody.appendChild(tr);
    });

    // Add total row at the end
    const totalRow = document.createElement("tr");
    totalRow.setAttribute("id", "totalRow");
    totalRow.setAttribute("data-total-row", "true");
    totalRow.innerHTML = `
        <td></td><td></td><td></td>
        <td><strong>Total</strong></td>
        <td data-field="weight" id="weight"><strong>${stageData.total_weight || "0%"}</strong></td>
        <td></td>
        <td data-field="score" id="score"><strong>${stageData.total_score || 0}</strong></td>
        <td></td>
    `;
    tbody.appendChild(totalRow);

    // Reattach your table listeners
    setTableEditable();
    updateTotalWeight();
    updateScore();
}
// event listner for calculations 
function setTableEditable() {
    document.querySelectorAll(".weight-input").forEach(input =>
        input.addEventListener("input", () => {
            updateTotalWeight();
            updateScore();
        })
    );

    document.querySelectorAll("select[data-field='rating']").forEach(sel =>
        sel.addEventListener("change", () => updateScore())
    );
}



function prefillMidStage(stageData, midItemsObj = {}) {
    console.log("🔹 Prefilling Mid Stage");

    // ----------------------
    // Section 3: Core Competencies
    // ----------------------
    const professionalMap = {
        "Communication": "communication",
        "Decision Making": "decision_making",
        "Quality Orientation And Accuracy": "quality_orientation",
        "Initiative": "initiative",
        "Technical Skills": "technical_skills"
    };

    for (const name in professionalMap) {
        const el = document.querySelector(`select[data-type="professional"][data-name="${name}"]`);
        if (el) {
            const key = professionalMap[name];
            const val = midItemsObj[key] !== undefined ? Math.round(Number(midItemsObj[key])) : 0;
            el.value = String(val);
            if (midItemsObj.id) el.dataset.id = midItemsObj.id;
        }
    }

    const coreTotalEl = document.getElementById("coreTotal");
    if (coreTotalEl) coreTotalEl.textContent = stageData.professional_total?.toFixed(2) || "0.00";

    // ----------------------
    // Section 4: Behavioral Competencies
    // ----------------------
    const behavioralMap = {
        "Team Work": "team_work",
        "Planning and Organizing": "planning_organizing",


        "Adaptability / Flexibility": "adaptability",
        "Self Confidence": "self_confidence",
        "Creativity and Innovation": "creativity_innovation"
    };

    for (const name in behavioralMap) {
        const el = document.querySelector(`select[data-type="behavioral"][data-name="${name}"]`);
        if (el) {
            const key = behavioralMap[name];
            const val = midItemsObj[key] !== undefined ? Math.round(Number(midItemsObj[key])) : 0;
            el.value = String(val);
            if (midItemsObj.id) el.dataset.id = midItemsObj.id; // ✅ preserve id
        }
    }

    const behTotalEl = document.getElementById("behavioralTotal");
    if (behTotalEl) behTotalEl.textContent = stageData.behavioral_total?.toFixed(2) || "0.00";

    // ----------------------
    // Section 5: Comments
    // ----------------------
    const commentsEl = document.getElementById("midComments");
    if (commentsEl) {
        commentsEl.value = stageData.comments || "";
        if (midItemsObj.id) commentsEl.dataset.id = midItemsObj.id; // ✅ preserve id
    }

    // ----------------------
    // Section 6: Additional Mid-Year Appraisal fields
    // ----------------------
    const strengthsEl = document.getElementById("midStrengths");
    if (strengthsEl) {
        strengthsEl.value = midItemsObj.strengths || "";
        if (midItemsObj.id) strengthsEl.dataset.id = midItemsObj.id;
    }

    const trainingEl = document.getElementById("midTraining");
    if (trainingEl) {
        trainingEl.value = midItemsObj.training_needs || "";
        if (midItemsObj.id) trainingEl.dataset.id = midItemsObj.id;
    }

    const lmCommentsEl = document.getElementById("midLMComments");
    if (lmCommentsEl) {
        lmCommentsEl.value = midItemsObj.manager_comments || "";
        if (midItemsObj.id) lmCommentsEl.dataset.id = midItemsObj.id;
    }

    const empCommentsEl = document.getElementById("midEmpComments");
    if (empCommentsEl) {
        empCommentsEl.value = midItemsObj.employee_comments || "";
        if (midItemsObj.id) empCommentsEl.dataset.id = midItemsObj.id;
    }

    console.log("✅ Mid Stage prefilling complete");

    // Recalculate Core & Behavioral totals
    calculateAverage(".tech-rating", "#coreTotal");
    calculateAverage(".beh-rating", "#behavioralTotal");

    // Attach change listeners for dynamic updates
    document.querySelectorAll(".tech-rating").forEach(sel =>
        sel.addEventListener("change", () => calculateAverage(".tech-rating", "#coreTotal"))
    );

    document.querySelectorAll(".beh-rating").forEach(sel =>
        sel.addEventListener("change", () => calculateAverage(".beh-rating", "#behavioralTotal"))
    );

}




// evaluation summary calulation
async function loadEvaluationSummary(appraisalId) {
    try {
        const res = await fetch(`/api/section/evaluation-summary/${appraisalId}`);

        if (!res.ok) {
            console.error(`❌ Failed to load evaluation summary. Status: ${res.status}`);
            return;
        }


        const result = await res.json();
        if (result.success && result.data) {
            const data = result.data;
            document.getElementById("business_score").innerText = data.business_score.toFixed(2);
            document.getElementById("professional_score").innerText = data.professional_score.toFixed(2);
            document.getElementById("behavioral_score").innerText = data.behavioral_score.toFixed(2);
            document.getElementById("overall_score").innerText = data.overall_score.toFixed(2);
        } else {
            console.error("No summary data found:", result.message);
        }
    } catch (error) {
        console.error("⚠️ Error fetching evaluation summary:", error);
    }
}



// =========================
// Collect Full Payload
// =========================
function collectFullStageData() {
    updateTotalWeight();
    updateScore();
    calculateAverage(".tech-rating", "#coreTotal");
    calculateAverage(".beh-rating", "#behavioralTotal");

    // ----- Section 2: Business Targets -----
    const startItems = Array.from(document.querySelectorAll("#targetsBody tr"))
        .filter(row => !row.dataset.totalRow)
        .map(row => ({
            id: row.dataset.id || null,
            target_text: row.querySelector('td[data-field="target"] textarea').value.trim(),
            manager_comments: row.querySelector('td[data-field="managerComments"] textarea').value.trim(),
            accomplishments: row.querySelector('td[data-field="accomplishments"] textarea').value.trim(),
            weightage: parseFloat(row.querySelector('td[data-field="weight"] input').value) || 0,
            rating: parseFloat(row.querySelector('td[data-field="rating"] select').value) || 0,
            score: parseFloat(row.querySelector('td[data-field="score"] input').value) || 0,
            comments: document.getElementById("Comments").value.trim()
        }));

    // ----- Section 3 & 4: Core + Behavioral Competencies -----
    const mapCompetency = {
        "Communication": "communication",
        "Decision Making": "decision_making",
        "Quality Orientation And Accuracy": "quality_orientation",
        "Initiative": "initiative",
        "Technical Skills": "technical_skills",
        "Team Work": "team_work",
        "Planning and Organizing": "planning_organizing",
        "Adaptability / Flexibility": "adaptability",
        "Self Confidence": "self_confidence",
        "Creativity and Innovation": "creativity_innovation"
    };

    const coreItems = Array.from(document.querySelectorAll('.tech-rating'));
    const behItems = Array.from(document.querySelectorAll('.beh-rating'));

    const midStageObj = {};
    [...coreItems, ...behItems].forEach(item => {
        const key = mapCompetency[item.dataset.name];
        if (key) midStageObj[key] = parseFloat(item.value) || 0;
    });

    // ----- Totals -----
    const professionalKeys = ["communication", "decision_making", "quality_orientation", "initiative", "technical_skills"];
    const behavioralKeys = ["team_work", "planning_organizing", "adaptability", "self_confidence", "creativity_innovation"];
    midStageObj.professional_total = professionalKeys.reduce((sum, k) => sum + (midStageObj[k] || 0), 0);
    midStageObj.behavioral_total = behavioralKeys.reduce((sum, k) => sum + (midStageObj[k] || 0), 0);

    // ----- Include mid_items ID if present -----
    const midCommentsEl = document.getElementById("midComments");
    midStageObj.id = midCommentsEl?.dataset.id || null;

    // ----- Mid-stage text fields -----
    midStageObj.strengths = document.getElementById("midStrengths").value.trim();
    midStageObj.training_needs = document.getElementById("midTraining").value.trim();
    midStageObj.manager_comments = document.getElementById("midLMComments").value.trim();
    midStageObj.employee_comments = document.getElementById("midEmpComments").value.trim();
    midStageObj.comments = midCommentsEl?.value.trim() || "";

    // ----- Section 8: Full-Year Appraisal -----

    const fullStage = {
        id: document.getElementById("fullStageId")?.value || null,
        key_achievements: document.getElementById("fullAchievements").value.trim(),
        development_areas: document.getElementById("fullDevelopment").value.trim(),
        employee_comments: document.getElementById("fullEmpComments").value.trim(),
        strengths: document.getElementById("fullStrengths").value.trim(),
        training_needs: document.getElementById("fullTraining").value.trim(),
        manager_comments: document.getElementById("fullLMComments").value.trim(),
    };
    // ----- Approver Comments -----
    const startComments = document.getElementById("Comments").value.trim();
    const midComments = document.getElementById("midComments").value.trim();


    // ----- Section 9: Approval History -----
    const approvals = Array.from(document.querySelectorAll("#sectionApprovalHistory tbody tr")).map(row => {
        const cells = row.querySelectorAll("td");
        const approverTypes = ["Line Manager", "HR", "Employee"];
        return {
            approver_type: cells[0]?.innerText.trim() || "",
            approver_name: cells[1]?.innerText.trim() || "",
            approval_date: cells[2]?.querySelector("input")?.value.trim() || "",
            comments: cells[3]?.innerText.trim() || ""
        };
    });

    return {
        start_stage_items: startItems,
        mid_stage_items: [midStageObj], // backend expects array of one object
        full_stage_items: [fullStage],  // backend expects array of one object
        professional_total: midStageObj.professional_total,
        behavioral_total: midStageObj.behavioral_total,
        start_comments: startComments,
        mid_comments: midComments,
        approvals
    };
}


// full stage submit handler
function submitFullStage() {
    const data = collectFullStageData();
    const appraisalId = new URLSearchParams(window.location.search).get("id");

    const payload = {
        appraisal_id: appraisalId,
        start_stage_items: data.start_stage_items,
        mid_stage_items: data.mid_stage_items,
        full_stage_items: data.full_stage_items,
        professional_total: data.professional_total,  // ✅ correct value
        behavioral_total: data.behavioral_total,
        start_comments: data.start_comments,
        mid_comments: data.mid_comments,
        approvals: data.approvals
    };

    console.log("Full stage payload to submit:", payload);

    fetch("/api/section/employee/submit-full-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(resp => {
            if (resp.success) {
                // ✅ SweetAlert for success
                Swal.fire({
                    icon: 'success',
                    title: 'Submitted!',
                    text: resp.message,
                    confirmButtonText: 'OK'
                }).then(() => {
                    loadEvaluationSummary(appraisalId); // reload summary after OK
                });
            } else {
                // ❌ SweetAlert for error
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: resp.message,
                });
            }
        })
        .catch(err => {
            console.error("❌ Error submitting full-stage:", err);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Something went wrong while submitting full-stage!',
            });
        });
}


// onclick
document.addEventListener("DOMContentLoaded", () => {

    console.log("JS working ✅");

    // ==========================
    // LOGOUT
    // ==========================
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logoutUser);
    }

    // ==========================
    // HEADER CLICK
    // ==========================
    const headerLogo = document.getElementById("headerLogo");
    if (headerLogo) {
        headerLogo.addEventListener("click", () => {
            window.location.href = "dashboard.html";
        });
    }

    // ==========================
    // SIDEBAR BUTTONS
    // ==========================
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

    // ==========================
    // ADD ROW BUTTON
    // ==========================
    const addRowBtn = document.getElementById("addRowBtn");

    if (addRowBtn) {
        addRowBtn.addEventListener("click", () => {
            console.log("Add Row Clicked ✅");
            addBusinessTargetRow();
        });
    }

});