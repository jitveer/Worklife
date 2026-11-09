const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: "mnmbrundhas@gmail.com",
//     pass: "olchihnfdbxfosdg" 
//   }
// });


const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  },
  tls: {
    rejectUnauthorized: false,
  },
});



// Callback-based version
exports.sendCredentialsEmail = (
  to,
  loginPassword,
  attendancePasscode,
  callback
) => {

  const mailOptions = {
    from: `WorkLife <${process.env.MAIL_FROM}>`,
    to,
    subject: "Your WorkLife Login Credentials",

    html: `
      <div style="font-family: Arial;">

        <h2>Welcome to WorkLife</h2>

        <p>Your account has been created successfully.</p>

        <hr>

        <h3>Login Credentials</h3>

        <p>
          <b>Email:</b> ${to}
        </p>

        <p>
          <b>Login Password:</b>
          ${loginPassword}
        </p>

        <hr>

        <h3>Attendance Passcode</h3>

        <p>
          <b>4-Digit Attendance Code:</b>
          ${attendancePasscode}
        </p>

        <hr>

       <p>
          <b>EMS Login Link:</b><br>
          <a href="https://worklife-ems.mnmreality.com/index.html">
             https://worklife-ems.mnmreality.com/index.html
          </a>
       </p>

      </div>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {

    if (err) {
      console.log("Email error:", err);

      if (callback) callback(err);

    } else {

      if (callback) callback(null, info);

    }

  });

};






// ===============================
// SEND INTERVIEW INVITE (TEST)
// ===============================
exports.sendInterviewInviteEmail = (to, examLink, roleName) => {

  const mailOptions = {
    from: `WorkLife HR<${process.env.MAIL_FROM}>`,
    to: to,
    subject: "Invitation to 1st Round Interview",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">Online Interview Assessment</h2>
      <p>Hello,</p>
      <p>
        You have been invited for the <b>1st Round Online Assessment</b> for the role of <b>${roleName}</b> at <b>MNM Reality Pvt Ltd</b>.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #00357a; padding: 12px 16px; margin: 16px 0;">
        <h4 style="margin: 0 0 8px 0; color: #00357a;">📌 Strict Examination Guidelines:</h4>
        <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.6;">
          <li><b>Duration:</b> Exactly <b>5 Minutes</b> once started.</li>
          <li><b>Camera Proctoring:</b> A working webcam is <b>mandatory</b> throughout the entire exam.</li>
          <li><b>Zero Tab-Switching:</b> You are strictly not allowed to switch tabs, minimize the browser, or open other windows. You will receive <b>only 1 warning</b>; a 2nd infraction will immediately terminate and submit your exam.</li>
          <li><b>Copy/Paste & Right-Click Disabled:</b> Unfair means are automatically blocked.</li>
        </ul>
      </div>

      <p style="margin: 25px 0;">
        <a href="${examLink}" style="
          display: inline-block;
          padding: 12px 28px;
          background: #00357a;
          color: #ffffff;
          text-decoration: none;
          font-weight: bold;
          border-radius: 6px;
        ">
          Proceed to Assessment
        </a>
      </p>

      <p style="font-size: 12px; color: #64748b; margin-top: 30px;">
        Please make sure you are in a quiet, well-lit environment with your camera ready before starting.
      </p>
    </div>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log("Interview mail error:", err);
    } else {
      // console.log("Interview mail sent (TEST)", info);
      // console.log("Preview URL:", require("nodemailer").getTestMessageUrl(info));
    }
  });
};


// send link to fill employee form 
exports.sendEmployeeFormEmail = (to, link) => {
  const mailOptions = {
    from: `WorkLife HR <${process.env.MAIL_FROM}>`,
    to,
    subject: "Fill Employee Details",
    html: `
      <p>Hello,</p>

      <p>Please click the button below to fill employee details.</p>

      <p style="margin:20px 0;">
        <a href="${link}" style="
          display:inline-block;
          padding:12px 24px;
          background:#3ba37b;
          color:#fff;
          text-decoration:none;
          font-weight:bold;
          border-radius:4px;
        ">
          Open Employee Form
        </a>
      </p>

      <p style="font-size:12px;color:gray">
        This link opens the employee form popup directly.
      </p>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      // console.log("Employee form email error:", err);
    } else {
      // console.log("Employee form email sent", info);
      // console.log(
      //   "Preview URL:",
      //   require("nodemailer").getTestMessageUrl(info)
      // );
    }
  });
};




// send pay slip through mailer 
exports.sendPayslipEmail = (to, subject, text, pdfBuffer, employeeName, payMonth) => {

  if (!to) {
    console.log("❌ No email found");
    return;
  }


  const htmlTemplate = `
  <p>Dear ${employeeName || "Employee"},</p>

  <p>Greetings!</p>

  <p>
  Please find attached the Pay-Slip for the month of ${payMonth}.
  </p>

  <br>

  <p>Regards,</p>
  <p>
  HR Department<br>
  MNM Enterprises<br>
  askhr@mnmreality.com
  </p>
  `;



  const mailOptions = {
    from: `WorkLife HR <${process.env.MAIL_FROM}>`,
    to,
    subject,
    html: htmlTemplate,
    attachments: [
      {
        filename: "payslip.pdf",
        content: pdfBuffer
      }
    ]
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log("Payslip email error:", err);
    } else {
      // console.log("Payslip email sent ✅", info);
    }
  });
};