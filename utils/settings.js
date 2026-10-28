const fs = require('fs');
const path = require('path');
const { parse, printParseErrorCode } = require('jsonc-parser');
const log = require('./logger');

const settingsPath = path.join(__dirname, '..', 'settings.jsonc');

let settings = {};
try {
    const errors = [];
    settings = parse(fs.readFileSync(settingsPath, 'utf8'), errors, { allowTrailingComma: true, disallowComments: false });
    for (const error of errors) {
        log.warn(`settings.jsonc: ${printParseErrorCode(error.error)} at offset ${error.offset}.`);
    }
} catch (err) {
    log.error(`Cannot load settings.jsonc: ${err.message}`);
}

module.exports = settings;
