const fs = require('fs');
const PNG = require('pngjs').PNG;
const jsQR = require('jsqr');
const { decryptAES } = require('./lib/utils');
require('dotenv').config();

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log("Usage: node verify_qr.js <image_path> <password>");
    process.exit(1);
}

const imagePath = args[0];
const password = args[1];

if (!fs.existsSync(imagePath)) {
    console.error(`Error: File not found: ${imagePath}`);
    process.exit(1);
}

const buffer = fs.readFileSync(imagePath);
const png = PNG.sync.read(buffer);

const code = jsQR(png.data, png.width, png.height);

if (code) {
    console.log("QR Code detected!");
    console.log("Encrypted Data (Base64):", code.data);

    const decrypted = decryptAES(code.data, password);
    if (decrypted) {
        console.log("\n✅ Decryption SUCCESS:");
        console.log(decrypted);
    } else {
        console.log("\n❌ Decryption FAILED. Check password or salt.");
    }

    // Attempt Steganography Verification (Experimental)
    // Since we know the length of the encrypted data from the QR code,
    // we can try to extract that many bytes from the alpha channel to see if it matches.
    // This confirms steganography was applied.
    try {
        const extracted = extractSteganography(png, code.data.length);
        if (extracted === code.data) {
            console.log("\n✅ Steganography Match: Hidden data matches QR payload.");
        } else {
            console.log("\n⚠️ Steganography Mismatch or not present.");
            // console.log("Extracted:", extracted); // Debugging
        }
    } catch (e) {
        console.log("\n⚠️ Could not verify steganography:", e.message);
    }

} else {
    console.error("❌ No QR code found in the image.");
}

function extractSteganography(png, length) {
    const data = png.data;
    let startOffset = Math.floor(data.length / 4);
    if (startOffset % 4 !== 0) startOffset += (4 - (startOffset % 4));

    let bitIndex = startOffset;
    const extractedBytes = Buffer.alloc(length);

    // We assumed the data stored is the utf8 string of the base64 code.
    // In backend.js: Buffer.from(hiddenData, "utf8") where hiddenData is the base64 string.

    for (let i = 0; i < length; i++) {
        let byte = 0;
        for (let bit = 7; bit >= 0; bit--) {
            if (bitIndex >= data.length) break;

            // Extract from Alpha channel (offset + 3)
            const bitValue = data[bitIndex + 3] & 1;
            byte |= (bitValue << bit);

            bitIndex += 4;
        }
        extractedBytes[i] = byte;
    }

    return extractedBytes.toString('utf8');
}
