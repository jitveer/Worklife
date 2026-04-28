const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();

console.log("PUBLIC KEY:", keys.publicKey);
console.log("PRIVATE KEY:", keys.privateKey);