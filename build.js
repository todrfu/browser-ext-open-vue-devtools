const fs = require('fs');
const path = require('path');
const ChromeExtension = require('crx');

const extensionPath = path.join(__dirname, 'src');
const outputPath = path.join(__dirname);

async function buildCrx() {
    const privateKey = process.env.EXTENSION_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('EXTENSION_PRIVATE_KEY environment variable is not set');
    }

    const crxInstance = new ChromeExtension({
        privateKey: Buffer.from(privateKey, 'base64'),
    });

    const crx = await crxInstance.load(extensionPath);
    const crxBuffer = await crx.pack();
    fs.writeFileSync(path.join(outputPath, 'open-vue-devtools.crx'), crxBuffer);
    console.log('CRX file created successfully!');
}

buildCrx().catch(console.error);