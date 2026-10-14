'use strict';
// Спільні налаштування Playwright-тестів: шлях до клієнта, запуск Chromium (локально — з PLAYWRIGHT/CHROMIUM_PATH, у CI — стандартний).
const path = require('path');
const fs = require('fs');
const HTML_URL = 'file://' + path.resolve(__dirname, '../public/sklad.html');
const CSS_PATH = path.join(__dirname, 'tw-fallback.css');
const local = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
const launchOpts = local ? { executablePath: local } : {};
module.exports = { HTML_URL, CSS_PATH, launchOpts };
