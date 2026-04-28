const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

module.exports = async function watermarkImage(imagePath, text) {

  const absolutePath = path.join(
    process.cwd(),
    imagePath
  );

  console.log("WATERMARK PATH:", absolutePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error("Image not found: " + absolutePath);
  }

  // Get image size
  const image = sharp(absolutePath);
  const metadata = await image.metadata();

  const width = metadata.width;

  // break address into multiple lines
  const words = text.split(" ");
  let lines = [];
  let currentLine = "";

  words.forEach(word => {
    if ((currentLine + word).length > 35) {
      lines.push(currentLine);
      currentLine = word + " ";
    } else {
      currentLine += word + " ";
    }
  });

  lines.push(currentLine);

  // Build SVG text lines
  let addressText = "";
  lines.slice(0, 3).forEach((line, i) => {
    addressText += `<text x="20" y="${40 + (i * 25)}" font-size="20" fill="white">${line}</text>`;
  });

  const svg = `
<svg width="${metadata.width}" height="140">
  <rect x="0" y="0" width="${metadata.width}" height="140" fill="black" opacity="0.6"/>
  
  ${addressText}

  <text x="20" y="120" font-size="18" fill="white">
    ${new Date().toLocaleString()}
  </text>
</svg>
`;

  const buffer = Buffer.from(svg);

  await image
    .composite([{ input: buffer, gravity: "south" }])
    .toFile(absolutePath + "_tmp");

  fs.renameSync(absolutePath + "_tmp", absolutePath);
};