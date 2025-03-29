const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// Function to read and parse YAML files
function readYamlFile(filePath) {
    try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        return yaml.load(fileContents);
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e);
        return null;
    }
}

// Read all YAML files from _data directory
const dataDir = path.join(__dirname, '_data');
const siteData = {};

fs.readdirSync(dataDir).forEach(file => {
    if (file.endsWith('.yaml')) {
        const name = path.basename(file, '.yaml');
        const data = readYamlFile(path.join(dataDir, file));
        if (data) {
            siteData[name] = data[name] || data;
        }
    }
});

// Generate JavaScript file
const jsContent = `// This file is auto-generated. Do not edit directly.
const siteData = ${JSON.stringify(siteData, null, 2)};
export default siteData;`;

// Ensure js directory exists
const jsDir = path.join(__dirname, 'js');
if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir);
}

// Write the generated file
fs.writeFileSync(path.join(jsDir, 'site-data.js'), jsContent);
console.log('Successfully generated site-data.js'); 