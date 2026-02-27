const crypto = require("crypto");

const SECRET_SALT = process.env.SECRET_SALT || "default_salt";

/* =========================
   AES-256 Encryption
========================= */
function encryptAES(text, password) {
    const key = crypto.pbkdf2Sync(password, SECRET_SALT, 100000, 32, "sha256");
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(text, "utf8"),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/* =========================
   AES-256 Decryption
========================= */
function decryptAES(encryptedBase64, password) {
    try {
        const buffer = Buffer.from(encryptedBase64, "base64");

        // Extract parts
        const iv = buffer.slice(0, 12);
        const authTag = buffer.slice(12, 28);
        const encryptedText = buffer.slice(28);

        const key = crypto.pbkdf2Sync(password, SECRET_SALT, 100000, 32, "sha256");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encryptedText),
            decipher.final(),
        ]);

        return decrypted.toString("utf8");
    } catch (error) {
        console.error("Decryption failed:", error.message);
        return null;
    }
}

module.exports = {
    encryptAES,
    decryptAES
};
