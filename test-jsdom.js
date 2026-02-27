const fs = require('fs');
const { JSDOM } = require("jsdom");

const html = fs.readFileSync("./index.html", "utf8");
const dom = new JSDOM(html, {
    url: "http://localhost:5000",
    runScripts: "dangerously",
    resources: "usable"
});

dom.window.fetch = async (url, options) => {
    return {
        ok: true,
        json: async () => ({
            image: "data:image/png;base64,123",
            decryptUrl: "http://localhost:5000/decrypt?d=..."
        })
    };
};

dom.window.document.addEventListener('DOMContentLoaded', () => {
    try {
        const form = dom.window.document.getElementById('qr-form');
        dom.window.document.getElementById('qr-data').value = "test auth";
        dom.window.document.getElementById('password').value = "secret";

        // Let's create an Event and dispatch it manually
        const submitEvent = new dom.window.Event('submit', { cancelable: true });
        form.dispatchEvent(submitEvent);

        setTimeout(() => {
            console.log("Check if QR Output has image:", dom.window.document.getElementById('qr-output').innerHTML);
            console.log("Toasts count:", dom.window.document.querySelectorAll('.toast').length);
            dom.window.document.querySelectorAll('.toast').forEach(t => console.log("Toast inside:", t.textContent));
        }, 1000);
    } catch (err) {
        console.error("Test threw err:", err);
    }
});
