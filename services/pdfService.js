const PDFDocument = require('pdfkit');
const db = require('../db');

const pdfService = {
    generateAppraisalPdf: (employeeId) => {
        return new Promise((resolve, reject) => {
            // 1️⃣ Get latest appraisal for the employee
            db.query(
                "SELECT * FROM appraisals WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1",
                [employeeId],
                (err, appraisals) => {
                    if (err) return reject(err);
                    if (!appraisals.length) return reject(new Error("No appraisal found"));

                    const appraisalId = appraisals[0].id;

                    // Fetch all related data
                    db.query("SELECT * FROM business_targets WHERE appraisal_id = ?", [appraisalId], (err1, targets) => {
                        if (err1) return reject(err1);

                        db.query("SELECT * FROM competencies WHERE appraisal_id = ?", [appraisalId], (err2, competencies) => {
                            if (err2) return reject(err2);

                            db.query("SELECT * FROM mid_year_appraisals WHERE appraisal_id = ?", [appraisalId], (err3, midyear) => {
                                if (err3) return reject(err3);

                                db.query("SELECT * FROM full_year_appraisals WHERE appraisal_id = ?", [appraisalId], (err4, fullyear) => {
                                    if (err4) return reject(err4);

                                    db.query("SELECT * FROM approval_history WHERE appraisal_id = ?", [appraisalId], (err5, approvals) => {
                                        if (err5) return reject(err5);

                                        // 2️⃣ Generate PDF
                                        const doc = new PDFDocument();
                                        let buffers = [];
                                        doc.on('data', buffers.push.bind(buffers));
                                        doc.on('end', () => {
                                            const pdfBuffer = Buffer.concat(buffers);
                                            resolve(pdfBuffer);
                                        });

                                        // Title
                                        doc.fontSize(18).text("Performance Appraisal Report", { align: "center" });
                                        doc.moveDown();

                                        // Employee Info
                                        doc.fontSize(14).text(`Employee ID: ${employeeId}`);
                                        doc.text(`Status: ${appraisals[0].status}`);
                                        doc.moveDown();

                                        // Business Targets
                                        if (targets.length) {
                                            doc.fontSize(12).text("Business Targets:");
                                            targets.forEach((t, i) => {
                                                doc.text(`${i+1}. ${t.target_text || '-'} | Score: ${t.score || 0} | Accomplishments: ${t.accomplishments || '-'}`);
                                            });
                                            doc.moveDown();
                                        }

                                        // Competencies
                                        if (competencies.length) {
                                            doc.text("Competencies:");
                                            competencies.forEach((c, i) => {
                                                doc.text(`${i+1}. ${c.type} - ${c.competency_name}: ${c.rating || 0}`);
                                            });
                                            doc.moveDown();
                                        }

                                        // Mid-Year
                                        if (midyear.length) {
                                            doc.text("Mid-Year Review:");
                                            doc.text(`Strengths: ${midyear[0].strengths || '-'}`);
                                            doc.text(`Training Needs: ${midyear[0].training_needs || '-'}`);
                                            doc.text(`Manager Comments: ${midyear[0].manager_comments || '-'}`);
                                            doc.text(`Employee Comments: ${midyear[0].employee_comments || '-'}`);
                                            doc.moveDown();
                                        }

                                        // Full-Year
                                        if (fullyear.length) {
                                            doc.text("Full-Year Review:");
                                            doc.text(`Key Achievements: ${fullyear[0].key_achievements || '-'}`);
                                            doc.text(`Development Areas: ${fullyear[0].development_areas || '-'}`);
                                            doc.text(`Strengths: ${fullyear[0].strengths || '-'}`);
                                            doc.text(`Training Needs: ${fullyear[0].training_needs || '-'}`);
                                            doc.text(`Manager Comments: ${fullyear[0].manager_comments || '-'}`);
                                            doc.text(`Employee Comments: ${fullyear[0].employee_comments || '-'}`);
                                            doc.moveDown();
                                        }

                                        // Approvals
                                        if (approvals.length) {
                                            doc.text("Approvals:");
                                            approvals.forEach((a, i) => {
                                                doc.text(`${i+1}. ${a.approver_role} (ID: ${a.approver_id}) | Comments: ${a.comments || '-'} | Status: ${a.status}`);
                                            });
                                        }

                                        doc.end();
                                    });
                                });
                            });
                        });
                    });
                }
            );
        });
    }
};

module.exports = pdfService;
