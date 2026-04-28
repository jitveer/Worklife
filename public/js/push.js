async function subscribeUser(email) {
  if (!("serviceWorker" in navigator)) {
    alert("Service Worker not supported");
    return;
  }

  const reg = await navigator.serviceWorker.register("/sw.js");

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    alert("Permission denied");
    return;
  }

  // 🔥 Convert public key (IMPORTANT)
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array("BGweiEJgmCAxdWu5ulUvEd4jF8V6PPW2gyV2x1qV4YhczD5s_nhlgkvzlyamv8Fm4yTMBjNQOCO75RXYRsWte-s")
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: email,
      subscription: subscription
    })
  });

  console.log("✅ Subscribed!");
}