// src/utils/logger.js
let LOG_ENABLED = process.env.DISABLE_LOGS !== 'true';

export function setLoggingEnabled(enabled) {
  LOG_ENABLED = enabled;
}

export function log(...args) {
  if (LOG_ENABLED) {
    console.log(...args);
  }
}

export function error(...args) {
  if (LOG_ENABLED) {
    console.error(...args);
  }
}