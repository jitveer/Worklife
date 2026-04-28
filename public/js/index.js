function showError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(id + "Error");
  input.classList.add("error"); // red underline
  error.textContent = message;  // message below input
}

function clearErrors() {
  ["company", "role", "password", "email"].forEach(id => {
    const input = document.getElementById(id);
    const error = document.getElementById(id + "Error");
    input.classList.remove("error");
    error.textContent = "";
  });
}

document.getElementById("CompanyLoginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  clearErrors();

  const company = document.getElementById("company").value;
  const role = document.getElementById("role").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  let hasError = false;

  if (!company) {
    showError("company", "Please select a company.");
    hasError = true;
  }

  if (!role) {
    showError("role", "Please select a role.");
    hasError = true;
  }
  if (!email) {
    showError("email", "Please enter email.");
    hasError = true;
  }
  if (!password) {
    showError("password", "Please enter password.");
    hasError = true;
  }

  if (hasError) {
    Toastify({
      text: "Please fill all required fields.",
      duration: 3000,
      gravity: "top",
      position: "right",
      style: {
        background: "linear-gradient(to right, #ff5f6d, #ffc371)"
      }
    }).showToast();
    return;
  }


  // Send to backend
  fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ company, role, email, password })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        Toastify({
          text: "Login successful!",
          duration: 3000,
          gravity: "top",
          position: "right",
          style: {
            background: "green"
          },
        }).showToast();

        const roleId = data.user?.roleId || data.roleId;
        setTimeout(() => {
         if (roleId === 4) {
            // Employee
            window.location.replace("employee-dashboard.html");
          } else {
            // Admin / HR / Super-Admin
            window.location.replace("dashboard.html");
          }
        }, 1000);
      } else {
        Toastify({
          text: data.message || "Invalid email or password.",
          duration: 3000,
          gravity: "top",
          position: "right",
          style: {
            background: "linear-gradient(to right, #ff5f6d, #ffc371)"
          }
        }).showToast();
      }
    })
    .catch(err => {
      console.error("Login error:", err);
      Toastify({
        text: "Server error. Please try again later.",
        duration: 3000,
        gravity: "top",
        position: "right",
        style: {
          background: "linear-gradient(to right, #ff5f6d, #ffc371)"
        }
      }).showToast();
    });
});


// Check session immediately when login page loads
fetch("/api/auth/session-check", {
  credentials: "include"
})
  .then(res => res.json())
  .then(data => {
    if (data.loggedIn) {

         const roleId = data.user?.roleId || data.roleId;

      if (roleId === 4) {
        window.location.replace("employee-dashboard.html");
      } else {
        window.location.replace("dashboard.html");
      }
    }
  });