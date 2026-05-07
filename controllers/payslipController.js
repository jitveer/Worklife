const { table } = require('pdfkit');
const db = require('../db');
const puppeteer = require("puppeteer");
const { sendPayslipEmail } = require("../services/mailer");

const fs = require("fs");
const path = require("path");

// fetching name and emp_id to fill bank details for popup 
exports.getEmployees = (req, res) => {
    const sql = `
        SELECT id, employee_id, first_name, last_name 
        FROM employees
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
};


// insert new bank details
exports.addBankDetails = (req, res) => {
    const { emp_id, bank_name, account_number } = req.body;

    const sql = `
        INSERT INTO bank_details (emp_id, bank_name, account_number)
        VALUES (?, ?, ?)
    `;

    db.query(sql, [emp_id, bank_name, account_number], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Already exists or DB error" });
        }

        res.json({ message: "Bank details saved" });
    });
};




// update existing bank details
exports.updateBankDetails = (req, res) => {
    const { emp_id, bank_name, account_number } = req.body;

    const sql = `
        UPDATE bank_details
        SET bank_name = ?, account_number = ?
        WHERE emp_id = ?
    `;

    db.query(sql, [bank_name, account_number, emp_id], (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.affectedRows === 0) {
            return res.json({ message: "No bank record found" });
        }

        res.json({ message: "Bank details updated" });
    });
};




// frontend employees table
exports.getEmployeeList = (req, res) => {

    const sql = `
        SELECT 
            e.id,
            e.employee_id,
            CONCAT(e.first_name, ' ', e.last_name) AS name,
            e.email,
            MAX(p.updated_at) AS last_sent_date
        FROM employees e
        LEFT JOIN payslips p 
            ON e.id = p.emp_id
        GROUP BY e.id
        ORDER BY e.id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json(err);
        }
        res.json(results);
    });
};




// payslip form popup auto fill from employees table
exports.getEmployeePayslipDetails = (req, res) => {
    const emp_id = req.params.emp_id;

    const sql = `
        SELECT 
            e.id,
            e.employee_id,
            CONCAT(e.first_name, ' ', e.last_name) AS name,
            e.designation,
            e.doj,
            e.pan_number,
            b.bank_name,
            b.account_number
        FROM employees e
        LEFT JOIN bank_details b 
            ON e.id = b.emp_id
        WHERE e.id = ?
    `;

    db.query(sql, [emp_id], (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.json(result[0]);
    });
};



// payslip data prefill from employees table 
exports.getEmployeePayslipDetails = (req, res) => {
    const emp_id = req.params.emp_id;

    const sql = `
        SELECT 
            e.id,
            e.employee_id,
            CONCAT(e.first_name, ' ', e.last_name) AS name,
            e.designation,
            e.doj,
            e.pan_number,
            b.bank_name,
            b.account_number
        FROM employees e
        LEFT JOIN bank_details b 
            ON e.id = b.emp_id
        WHERE e.id = ?
    `;

    db.query(sql, [emp_id], (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.json(result[0]);
    });
};




// save data and send mail
exports.savePayslip = (req, res) => {

    const {
        emp_id,
        employee_code,
        employee_name,
        designation,
        pan,
        bank_name,
        account_number,
        doj,
        total_working_days,
        basic_salary,
        net_salary
    } = req.body;

    const sqlFetch = `
        SELECT email 
        FROM employees 
        WHERE id = ?
    `;

    db.query(sqlFetch, [emp_id], (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        const emp = result[0];

        const sqlInsert = `
            INSERT INTO payslips (
                emp_id,
                employee_code,
                employee_name,
                designation,
                pan,
                bank_name,
                bank_account_number,
                date_of_joining,
                total_working_days,
                basic_salary,
                net_salary
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const logoPath = path.join(process.cwd(), "public", "images", "mnm-logo.png");
        const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
        const logoSrc = `data:image/png;base64,${logoBase64}`;

        db.query(sqlInsert, [
            emp_id,
            employee_code,
            employee_name,
            designation,
            pan,
            bank_name,
            account_number,
            doj,
            total_working_days,
            basic_salary,
            net_salary
        ], (err) => {

            if (err) {
                console.error("DB ERROR:", err);
                return res.status(500).json({ message: "DB error" });
            }

            if (!emp.email) {
                return res.json({ message: "Saved but email missing" });
            }

            // after saving to DB

            const fullHTML = `
<html>
<head>
    <style>

        body {
            font-family: 'Segoe UI', sans-serif;
            padding: 20px;
        }

        .payslip-print-area {
            border: 2px solid #000;
            width: 100%;
        }
            
        .ps-header {
            background: #fae5e3;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .ps-logo {
            position: static;
            /* ✅ VERY IMPORTANT */
        }

        .ps-company {
            font-size: 24px;
            font-weight: bold;
            margin: 0;
            letter-spacing: 1px;
        }

        .ps-address {
            text-align: center;
            font-size: 13px;
            font-weight: bold;
            padding: 6px;
            border-bottom: 2px solid #000;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        td, th {
            border: 1px solid #000;
            padding: 6px;
            font-size: 13px;
        }

        .center {
            text-align: center;
        }

    </style>
</head>

<body>
    ${req.body.html.replace('/images/mnm-logo.png', logoSrc)}
</body>
</html>
`;

            (async () => {

                const pdfBuffer = await generatePayslipPDF(fullHTML);

                sendPayslipEmail(
                    emp.email,
                    "Payslip",
                    "Please find attached payslip",
                    pdfBuffer
                );

            })();

            res.json({ message: "Saved & email sent" });
        });
    });
};




// pdf design of payslip
async function generatePayslipPDF(html) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
            top: "10px",
            bottom: "10px",
            left: "10px",
            right: "10px"
        }
    });

    await browser.close();

    return pdfBuffer;
}