self.addEventListener("push", event => {
  console.log("🔥 Push received");

  let data = {};

  if (event.data) {
    try {
      data = event.data.json(); // try JSON
    } catch (e) {
      console.log("⚠️ Not JSON, fallback to text");

      data = {
        title: "Test Notification",
        body: event.data.text(),
        url: "/"
      };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Notification", {
      body: data.body || "You have a new update",
      data: {
        url: data.url || "/"
      }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});