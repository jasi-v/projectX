require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { PNG } = require("pngjs");
const path = require("path");
const multer = require("multer");

const { encryptAES, decryptAES } = require("./lib/utils");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const PORT = process.env.PORT || 5000;

/* =========================
   Static Pages
========================= */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/decrypt", (req, res) => {
    res.sendFile(path.join(__dirname, "decrypt.html"));
});

/* =========================
   API: Decrypt Endpoint
========================= */
app.post("/api/decrypt", (req, res) => {
    try {
        const { data, password } = req.body;
        if (!data || !password) {
            return res.status(400).json({ error: "Missing data or password" });
        }
        const decrypted = decryptAES(data, password);
        if (decrypted === null) {
            return res.status(401).json({ error: "Wrong password or corrupted data" });
        }
        res.json({ decrypted });
    } catch (err) {
        console.error("Decrypt API error:", err);
        res.status(500).json({ error: "Decryption failed" });
    }
});

/* =========================
   Steganography (LSB)
========================= */
function applySteganography(buffer, hiddenData) {
    const png = PNG.sync.read(buffer);
    const data = png.data;

    const hiddenBytes = Buffer.from(hiddenData, "utf8");
    let startOffset = Math.floor(data.length / 4);
    if (startOffset % 4 !== 0) startOffset += (4 - (startOffset % 4));

    let bitIndex = startOffset;

    for (let i = 0; i < hiddenBytes.length; i++) {
        for (let bit = 7; bit >= 0; bit--) {
            if (bitIndex >= data.length) break;
            const bitValue = (hiddenBytes[i] >> bit) & 1;
            // Use Blue channel for better compatibility than Alpha
            data[bitIndex + 2] = (data[bitIndex + 2] & 0xfe) | bitValue;
            bitIndex += 4;
        }
    }

    return PNG.sync.write(png);
}

/* =========================
   Advanced Steganography (with Length Prefix)
========================= */
function embedInImage(buffer, hiddenData) {
    const png = PNG.sync.read(buffer);
    const data = png.data;

    const hiddenBytes = Buffer.from(hiddenData, "utf8");
    const len = hiddenBytes.length;

    // We store the length as a 4-byte header
    const header = Buffer.alloc(4);
    header.writeUInt32BE(len, 0);

    const payload = Buffer.concat([header, hiddenBytes]);

    // Skip first row to preserve some image metadata if present
    let bitIndex = png.width * 4;

    // Ensure we have enough capacity
    if (bitIndex + (payload.length * 8 * 4) > data.length) {
        throw new Error("Image is too small to hold this data");
    }

    for (let i = 0; i < payload.length; i++) {
        for (let bit = 7; bit >= 0; bit--) {
            if (bitIndex + 2 >= data.length) break;
            const bitValue = (payload[i] >> bit) & 1;
            // Use blue channel (offset + 2) which is safer than Alpha
            data[bitIndex + 2] = (data[bitIndex + 2] & 0xfe) | bitValue;
            bitIndex += 4;
        }
    }

    return PNG.sync.write(png);
}

function extractFromImage(buffer) {
    const png = PNG.sync.read(buffer);
    const data = png.data;

    let bitIndex = png.width * 4;

    // Read 4-byte length header
    const header = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) {
        let byte = 0;
        for (let bit = 7; bit >= 0; bit--) {
            const bitValue = data[bitIndex + 2] & 1;
            byte |= (bitValue << bit);
            bitIndex += 4;
        }
        header[i] = byte;
    }

    const payloadLength = header.readUInt32BE(0);
    // Sanity check length to prevent malicious/corrupt loops
    if (payloadLength === 0 || payloadLength > 100000 || bitIndex + (payloadLength * 8 * 4) > data.length) {
        return null; // Not found or corrupted
    }

    const extractedBytes = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
        let byte = 0;
        for (let bit = 7; bit >= 0; bit--) {
            const bitValue = data[bitIndex + 2] & 1;
            byte |= (bitValue << bit);
            bitIndex += 4;
        }
        extractedBytes[i] = byte;
    }

    return extractedBytes.toString("utf8");
}

/* =========================
   Generate Encrypted QR
========================= */
app.post("/generate", async (req, res) => {
    try {
        const { data, password, useStego } = req.body;

        if (!data || !password) {
            return res.status(400).json({ error: "Missing data or password" });
        }

        const encryptedData = encryptAES(data, password);

        // Encode a real URL so any QR scanner opens the decrypt page directly
        // We MUST use the machine's local IP, not localhost, so phones can reach it
        const os = require('os');
        const interfaces = os.networkInterfaces();
        let localIp = 'localhost';

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                    break;
                }
            }
            if (localIp !== 'localhost') break;
        }

        const protocol = req.headers["x-forwarded-proto"] || "http";
        // If the request came from a public domain, use that, otherwise use local IP
        const host = req.headers.host.includes('localhost') ? `${localIp}:${PORT}` : req.headers.host;
        const decryptUrl = `${protocol}://${host}/decrypt?d=${encodeURIComponent(encryptedData)}`;

        const qrBuffer = await QRCode.toBuffer(decryptUrl, {
            type: "png",
            errorCorrectionLevel: "M",
            width: 400,
            margin: 2,
        });

        let finalBuffer = qrBuffer;

        if (useStego) {
            finalBuffer = applySteganography(qrBuffer, encryptedData);
        }

        // Return both the image and the URL so the frontend can display it
        const pngBase64 = finalBuffer.toString("base64");
        res.json({
            image: `data:image/png;base64,${pngBase64}`,
            decryptUrl,
        });

    } catch (error) {
        console.error("QR ERROR:", error);
        res.status(500).json({ error: "QR generation failed" });
    }
});

/* =========================
   API: File Embed & Extract
========================= */

function getNetworkUrl(req, encryptedData) {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIp = iface.address;
                break;
            }
        }
        if (localIp !== 'localhost') break;
    }

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host.includes('localhost') ? `${localIp}:${PORT}` : req.headers.host;
    return `${protocol}://${host}/decrypt?d=${encodeURIComponent(encryptedData)}`;
}

// 1. Hide QR payload in an uploaded custom image
app.post("/api/embed", upload.single("image"), async (req, res) => {
    try {
        const { data, password } = req.body;
        if (!data || !password || !req.file) {
            return res.status(400).json({ error: "Missing data, password, or image file" });
        }

        const encryptedData = encryptAES(data, password);
        const decryptUrl = getNetworkUrl(req, encryptedData);

        // Hide the decryptUrl inside the uploaded image
        const modifiedImageBuffer = embedInImage(req.file.buffer, decryptUrl);

        res.set("Content-Type", "image/png");
        res.set("Content-Disposition", 'attachment; filename="hidden_secret.png"');
        res.send(modifiedImageBuffer);

    } catch (err) {
        console.error("Embed Error:", err);
        res.status(500).json({ error: err.message || "Failed to embed data in image" });
    }
});

// 2. Extract QR payload from an uploaded image
app.post("/api/extract", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Missing image file" });
        }

        const decryptUrl = extractFromImage(req.file.buffer);
        if (!decryptUrl) {
            return res.status(400).json({ error: "No hidden data found in this image" });
        }

        // Regenerate the QR code for this URL
        const qrBuffer = await QRCode.toBuffer(decryptUrl, {
            type: "png",
            errorCorrectionLevel: "M",
            width: 400,
            margin: 2,
        });

        const pngBase64 = qrBuffer.toString("base64");

        res.json({
            image: `data:image/png;base64,${pngBase64}`,
            decryptUrl
        });

    } catch (err) {
        console.error("Extract Error:", err);
        res.status(500).json({ error: "Failed to extract data" });
    }
});

/* =========================
   Start Server
========================= */
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`(To scan with a phone, ensure it's on the same WiFi and use your machine's local IP)`);
});
