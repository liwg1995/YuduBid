const DEFAULT_SEGMENT_TRIGGER_CHARS = 120000;
const DEFAULT_SEGMENT_MAX_CHARS = 60000;

function normalizeLimit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function splitUserTextByContextLimit(text, options = {}) {
  const source = String(text || '');
  const triggerChars = normalizeLimit(options.triggerChars, DEFAULT_SEGMENT_TRIGGER_CHARS);
  const maxChars = Math.max(1000, normalizeLimit(options.maxChars, DEFAULT_SEGMENT_MAX_CHARS));
  if (source.length <= triggerChars) return [source];

  const chunks = [];
  let cursor = 0;
  while (cursor < source.length) {
    const hardEnd = Math.min(source.length, cursor + maxChars);
    if (hardEnd >= source.length) {
      chunks.push(source.slice(cursor));
      break;
    }

    const window = source.slice(cursor, hardEnd);
    const boundary = Math.max(
      window.lastIndexOf('\n\n'),
      window.lastIndexOf('\n'),
      window.lastIndexOf('。'),
      window.lastIndexOf('；'),
    );
    const end = boundary >= Math.floor(maxChars * 0.55) ? cursor + boundary + 1 : hardEnd;
    chunks.push(source.slice(cursor, end));
    cursor = end;
  }

  return chunks.filter((chunk) => chunk.trim());
}

function isLongUserText(text, options = {}) {
  return splitUserTextByContextLimit(text, options).length > 1;
}

module.exports = {
  DEFAULT_SEGMENT_TRIGGER_CHARS,
  DEFAULT_SEGMENT_MAX_CHARS,
  isLongUserText,
  splitUserTextByContextLimit,
};
