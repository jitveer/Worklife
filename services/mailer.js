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
    subject: "Invitation to 2nd Round Interview",
    html: `
<p>Hello,</p>

    <p>
      You are invited for the <b>2nd Round Interview</b>
      for the role of <b>${roleName}</b>.
    </p>

    <p>
      Please click the button below to open the exam page.
      You will see instructions and a <b>Start Exam</b> button.
    </p>

    <p><b>Important:</b></p>
    <ul>
      <li>This link is valid for <b>5 minutes</b></li>
      <li>The timer will start only after clicking <b>Start Exam</b></li>
      <li>Please do not refresh or close the browser during the exam</li>
    </ul>

    <p style="margin:20px 0;">
      <a href="${examLink}" style="
        display:inline-block;
        padding:12px 24px;
        background:#00357a;
        color:#fff;
        text-decoration:none;
        font-weight:bold;
        border-radius:4px;
      ">
        Open Exam Page
      </a>
    </p>

    <p style="font-size:12px;color:gray">
      This is a test email (Ethereal).
    </p>
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