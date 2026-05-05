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
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});



// Callback-based version
exports.sendPasscodeEmail = (to, passcode, callback) => {
  const mailOptions = {
    from: "WorkLife <mnmbrundhas@gmail.com>",
    to,
    subject: "Your WorkLife Login Passcode",
    html: `
      <p>Hello,</p>
      <p>Your WorkLife login passcode is:</p>
      <h2>${passcode}</h2>
      <p>Please log in and change your password after first login.</p>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log("Email error:", err);
      if (callback) callback(err);
    } else {
      console.log("Email sent:", info.response);
      if (callback) callback(null, info);
    }
  });
};






// ===============================
// SEND INTERVIEW INVITE (TEST)
// ===============================
exports.sendInterviewInviteEmail = (to, examLink, roleName) => {

  const mailOptions = {
    from: "WorkLife HR <mnmbrundhas@gmail.com>",
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
      console.log("Interview mail sent (TEST)");
      console.log("Preview URL:", require("nodemailer").getTestMessageUrl(info));
    }
  });
};


// send link to fill employee form 
exports.sendEmployeeFormEmail = (to, link) => {
  const mailOptions = {
    from: "WorkLife HR <mnmbrundhas@gmail.com>",
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
      console.log("Employee form email error:", err);
    } else {
      console.log("Employee form email sent");
      console.log(
        "Preview URL:",
        require("nodemailer").getTestMessageUrl(info)
      );
    }
  });
};




// send pay slip through mailer 
exports.sendPayslipEmail = (to, subject, text, pdfBuffer) => {

  if (!to) {
    console.log("❌ No email found");
    return;
  }


  const htmlTemplate = `
  <p>Dear Employee,</p>

  <p>Greetings!</p>

  <p>
  Please find attached the Pay-Slip for the month of ${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}.
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
    from: `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_USER}>`,
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
      console.log("Payslip email sent ✅");
    }
  });
};