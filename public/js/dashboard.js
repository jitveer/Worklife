document.addEventListener("DOMContentLoaded", async function () {

  const res = await fetch("/api/auth/session-check", {
    credentials: "include"
  });

  const data = await res.json();

  if (!data.loggedIn) {
    window.location.replace("index.html");
    return;
  }

  const roleId = data.user.roleId;
  const currentPage = window.location.pathname.split("/").pop();

  // 🚫 Employee on admin dashboard
  if (roleId === 4 && currentPage === "dashboard.html") {
    window.location.replace("employee-dashboard.html");
    return;
  }

  // 🚫 Admin / HR on employee dashboard
  if (roleId !== 4 && currentPage === "employee-dashboard.html") {
    window.location.replace("dashboard.html");
    return;
  }

  // ✅ SHOW PAGE ONLY AFTER CHECK (IMPORTANT)
  document.body.style.display = "block";

  // ✅ continue your code
  const nameEl = document.getElementById("userName");
  if (nameEl) {
    nameEl.textContent = data.user.name;
  }

  loadNotifications(data.user.email, roleId);
  loadCalendar();

  navigator.serviceWorker.register("/sw.js").then(async (reg) => {

    const existingSub = await reg.pushManager.getSubscription();

    if (existingSub) {
      fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: data.user.email,
          subscription: existingSub
        })
      });

    } else {
      subscribeUser(data.user.email);
    }

  });

});



// loadNotifications
function loadNotifications(email, role) {
  fetch(`/api/notifications`)
    .then(res => res.json())
    .then(data => {
      const notifications = data.notifications;
      const list = document.getElementById('notificationList');
      if (!list) return;
      list.innerHTML = '';
      // Premium Empty State
      if (!notifications.length) {
        list.innerHTML = `
          <div style="text-align:center; padding: 30px 10px; color: #888; font-size: 13px; font-weight: bold;">
             <i class="fa-solid fa-inbox" style="font-size: 32px; margin-bottom: 12px; color: #ddd; display: block;"></i>
             You're all caught up!<br>No new notifications.
          </div>`;
        return;
      }
      notifications.forEach(note => {
        const div = document.createElement('div');
        // Defaults
        let alertClass = 'alert-info';
        let iconHtml = '<i class="fa-solid fa-circle-info"></i>';

        const msg = note.message.toLowerCase();
        // Assign specific classes and icons based on notification text
        if (msg.includes('approved')) {
          alertClass = 'alert-success';
          iconHtml = '<i class="fa-solid fa-circle-check"></i>';
        } else if (msg.includes('cancelled') || msg.includes('rejected')) {
          alertClass = 'alert-danger';
          iconHtml = '<i class="fa-solid fa-circle-xmark"></i>';
        } else if (msg.includes('pending')) {
          alertClass = 'alert-warning';
          iconHtml = '<i class="fa-solid fa-clock-rotate-left"></i>';
        }
        div.className = `alert ${alertClass}`;
        div.role = 'alert';

        // Premium inline dynamic hover interactivity
        div.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";
        div.style.cursor = 'pointer';
        div.style.padding = '12px 14px'; // Slightly expanded padding
        div.style.marginBottom = '10px';

        div.onmouseover = () => {
          div.style.transform = "translateY(-3px)";
          div.style.boxShadow = "0 6px 14px rgba(0, 0, 0, 0.12)";
        };
        div.onmouseout = () => {
          div.style.transform = "translateY(0)";
          div.style.boxShadow = "0 2px 6px rgba(0, 0, 0, .06)";
        };
        // Injecting the new HTML layout for the card
        div.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 14px; width: 100%;">
             <div style="font-size: 18px; margin-top: 1px;">
                 ${iconHtml}
             </div>
             <div style="flex: 1;">
                 <div style="font-size: 13px; font-weight: 700; line-height: 1.4; margin-bottom: 4px;">
                    ${note.message}
                 </div>
                 <div style="font-size: 11px; opacity: 0.75; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    Click to view details <i class="fa-solid fa-arrow-right" style="font-size: 10px; margin-left: 4px;"></i>
                 </div>
             </div>
          </div>
        `;
        div.onclick = () => {
          window.location.href = note.link;
        };
        list.appendChild(div);
      });
    })
    .catch(err => {
      console.error("Notification load error:", err);
      const list = document.getElementById('notificationList');
      if (list) {
        list.innerHTML = `<p style="color:red; font-size:12px; font-weight:bold;">Failed to load notifications.</p>`;
      }
    });
}




// Fetch pending task count from backend
fetch('/api/dashboard/pending-count', {
  method: 'GET',
  credentials: 'include' // IMPORTANT: sends session cookie
})
  .then(response => {
    if (!response.ok) throw new Error("Not logged in");
    return response.json();
  })
  .then(data => {
    document.querySelector('.circle-number').textContent = data.pending;
  })
  .catch(err => {
    console.error("Error fetching pending count:", err);
  });




let currentMonth = new Date().getMonth(); // 0–11
let currentYear = new Date().getFullYear();


// calendar
async function loadCalendar() {
  const res = await fetch("/api/dashboard/calendar-events");
  const events = await res.json();

  /* ===============================
     🔔 BADGE COUNT LOGIC (ADD HERE)
     =============================== */

  const badge = document.getElementById("calendar-count");
  const readEvents = JSON.parse(localStorage.getItem("readCalendarEvents")) || [];

  const unreadCount = events.filter(
    e => !readEvents.includes(e.event_date.slice(0, 10))
  ).length;

  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
  const greenDates = events.map(e => e.event_date.slice(0, 10));
  const calendarBox = document.getElementById("calendar-box");
  calendarBox.innerHTML = "";

  // Month name
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Set calendar title
  document.getElementById("calendar-title").innerText =
    `${monthNames[currentMonth]} ${currentYear}`;

  // First day of month (Mon = 0)
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const startDay = firstDay === 0 ? 6 : firstDay - 1;

  // Total days in month
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Empty slots before day 1
  for (let i = 0; i < startDay; i++) {
    calendarBox.innerHTML += `<div></div>`;
  }

  // Actual dates
  // Actual dates
  for (let day = 1; day <= totalDays; day++) {

    const date =
      `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // ✅ CREATE div (THIS LINE WAS MISSING)
    const div = document.createElement("div");

    div.className = "day " + (greenDates.includes(date) ? "green" : "");
    div.textContent = day;

    // ✅ add event listener
    div.addEventListener("click", () => {
      if (greenDates.includes(date)) {
        viewEvent(date);
      } else {
        openForm(date);
      }
    });

    // ✅ append to calendar
    calendarBox.appendChild(div);
  }
}


function openForm(date) {
  document.getElementById("picked-date").innerText = date;

  calendarModal.classList.add("hidden");
  eventForm.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

async function saveCalendarEvent() {
  const date = document.getElementById("picked-date").innerText;
  const title = document.getElementById("event-title").value;
  const image = document.getElementById("event-image").files[0];

  const form = new FormData();
  form.append("event_date", date);
  form.append("title", title);
  form.append("image", image);

  await fetch("/api/dashboard/calendar-event", {
    method: "POST",
    body: form
  });

  document.getElementById("event-form").classList.add("hidden");
  openCalendar();
}


//view event
async function viewEvent(date) {
  overlay.classList.remove("hidden");

  const modal = document.getElementById("event-view-modal");
  const imageBox = document.getElementById("event-image-box");
  const textBox = document.getElementById("event-text-box");

  modal.classList.remove("hidden");
  imageBox.classList.add("hidden");
  imageBox.innerHTML = "";
  textBox.innerHTML = "Loading...";

  const res = await fetch(`/api/dashboard/calendar-event/${date}`);

  if (!res.ok) {
    textBox.innerHTML = "No event found for this date.";
    return;
  }

  const text = await res.text();
  if (!text) {
    textBox.innerHTML = "No event details available.";
    return;
  }

  const event = JSON.parse(text);

  /* ===============================
   🔔 REDUCE BADGE COUNT (HERE)
   =============================== */

  const readEvents = getReadEvents();

  const eventKey = event.event_date.slice(0, 10); // YYYY-MM-DD

  if (!readEvents.includes(eventKey)) {
    readEvents.push(eventKey);
    setReadEvents(readEvents);
  }

  // 🔔 UPDATE BADGE DIRECTLY (NO RE-FETCH)
  const badge = document.getElementById("calendar-count");

  if (badge) {
    const currentCount = parseInt(badge.textContent || "0", 10) - 1;

    if (currentCount > 0) {
      badge.textContent = currentCount;
    } else {
      badge.classList.add("hidden");
      badge.textContent = "";
    }
  }

  /* TEXT ALWAYS */
  textBox.innerHTML = `
    <strong>${event.title || "Event"}</strong><br><br>
    ${event.description || ""}
  `;

  /* IMAGE ONLY IF EXISTS */
  if (event.image) {
    imageBox.innerHTML = `
      <img src="/uploads/calendar_events/${event.image}">
    `;
    imageBox.classList.remove("hidden");
  }
}

function getReadEvents() {
  return JSON.parse(localStorage.getItem("readCalendarEvents")) || [];
}

function setReadEvents(arr) {
  localStorage.setItem("readCalendarEvents", JSON.stringify(arr));
}

const overlay = document.getElementById("overlay");
const calendarModal = document.getElementById("calendar-modal");
const eventForm = document.getElementById("event-form");

/* Floating button click */
document.getElementById("calendar-btn").addEventListener("click", openCalendar);

function openCalendar() {
  overlay.classList.remove("hidden");
  calendarModal.classList.remove("hidden");
}

function closeCalendar() {
  calendarModal.classList.add("hidden");
  eventForm.classList.add("hidden");
  overlay.classList.add("hidden");
}

function closeEventForm() {
  eventForm.classList.add("hidden");
  overlay.classList.add("hidden");
}

overlay.onclick = () => {
  calendarModal.classList.add("hidden");
  eventForm.classList.add("hidden");
  document.getElementById("event-view-modal").classList.add("hidden");
  overlay.classList.add("hidden");

}

const realFileInput = document.getElementById("event-image");
const fakeInput = document.getElementById("file-display");

fakeInput.addEventListener("click", () => realFileInput.click());

realFileInput.addEventListener("change", () => {
  fakeInput.value = realFileInput.files.length
    ? realFileInput.files[0].name
    : "";
});

function closeEventView() {
  document.getElementById("event-view-modal").classList.add("hidden");
  overlay.classList.add("hidden");
}


function nextMonth() {
  currentMonth++;

  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }

  loadCalendar();
}

function prevMonth() {
  currentMonth--;

  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }

  loadCalendar();
}




// onclick buttons
document.addEventListener("DOMContentLoaded", function () {

  // ✅ Attendance button
  const attendanceBtn = document.getElementById("attendanceBtn");
  if (attendanceBtn) {
    attendanceBtn.addEventListener("click", () => {
      window.location.href = "attendance.html";
    });
  }

  // ✅ Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutUser);
  }

  // ✅ Calendar navigation
  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", prevMonth);
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", nextMonth);
  }

  // ✅ Close calendar
  const closeCalendarBtn = document.getElementById("closeCalendarBtn");
  if (closeCalendarBtn) {
    closeCalendarBtn.addEventListener("click", closeCalendar);
  }

  // ✅ Close event form
  const closeEventFormBtn = document.getElementById("closeEventFormBtn");
  if (closeEventFormBtn) {
    closeEventFormBtn.addEventListener("click", closeEventForm);
  }

  // ✅ Save event
  const saveEventBtn = document.getElementById("saveEventBtn");
  if (saveEventBtn) {
    saveEventBtn.addEventListener("click", saveCalendarEvent);
  }

  // ✅ Close event view
  const closeEventViewBtn = document.getElementById("closeEventViewBtn");
  if (closeEventViewBtn) {
    closeEventViewBtn.addEventListener("click", closeEventView);
  }

});





//  Logout 
function logoutUser() {
  Swal.fire({
    title: "Are you sure?",
    text: "You’ll be logged out of Worklife Dashboard.",
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

            setTimeout(() => {
              window.location.href = "index.html";
            }, 2000);
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
