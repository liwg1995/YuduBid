function logInfo(...args) {
  console.log('[yudubid-client]', ...args);
}

function logError(...args) {
  console.error('[yudubid-client]', ...args);
}

module.exports = {
  logError,
  logInfo,
};
