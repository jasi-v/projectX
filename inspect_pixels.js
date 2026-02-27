const fs = require('fs');
const PNG = require('pngjs').PNG;

const file = process.argv[2];
if (!file) {
    console.log("Usage: node inspect_pixels.js <file>");
    process.exit(1);
}

fs.createReadStream(file)
    .pipe(new PNG())
    .on('parsed', function () {
        console.log(`Image size: ${this.width}x${this.height}`);
        console.log("First 10 pixels (RGBA):");
        for (let i = 0; i < 10; i++) {
            const idx = i * 4;
            const r = this.data[idx];
            const g = this.data[idx + 1];
            const b = this.data[idx + 2];
            const a = this.data[idx + 3];
            console.log(`Pixel ${i}: R=${r} G=${g} B=${b} A=${a}`);
        }
    });
