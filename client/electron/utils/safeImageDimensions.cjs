const DEFAULT_MAX_IMAGE_BYTES = 32 * 1024 * 1024;

function assertBuffer(buffer, maxBytes) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('图片数据必须是 Buffer');
  }
  if (!buffer.length) {
    throw new Error('图片数据为空');
  }
  if (buffer.length > maxBytes) {
    throw new Error(`图片超过安全解析上限（${Math.floor(maxBytes / 1024 / 1024)}MB）`);
  }
}

function validateDimensions(width, height, type) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`${type.toUpperCase()} 图片尺寸无效`);
  }
  if (width > 100000 || height > 100000 || width * height > 400000000) {
    throw new Error(`${type.toUpperCase()} 图片尺寸超过安全上限`);
  }
  return { width, height, type };
}

function readPngDimensions(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }
  return validateDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20), 'png');
}

function readGifDimensions(buffer) {
  if (buffer.length < 10 || !['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
    return null;
  }
  return validateDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8), 'gif');
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new Error('JPEG 图片段长度无效');
    }
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) throw new Error('JPEG 尺寸段不完整');
      return validateDimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3), 'jpg');
    }
    offset += segmentLength;
  }
  throw new Error('JPEG 图片缺少有效尺寸信息');
}

function detectBlockedFormat(buffer) {
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'icns') return 'ICNS';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0x0a) return 'JXL';
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'HEIF/AVIF';
  return null;
}

function getSafeImageDimensions(buffer, options = {}) {
  const maxBytes = Math.max(1024, Number(options.maxBytes) || DEFAULT_MAX_IMAGE_BYTES);
  assertBuffer(buffer, maxBytes);

  const blockedFormat = detectBlockedFormat(buffer);
  if (blockedFormat) {
    throw new Error(`出于安全原因不解析 ${blockedFormat} 图片，请转换为 PNG 或 JPEG`);
  }

  const dimensions = readPngDimensions(buffer) || readGifDimensions(buffer) || readJpegDimensions(buffer);
  if (!dimensions) {
    throw new Error('仅支持安全解析 PNG、JPEG 或 GIF 图片尺寸');
  }
  return dimensions;
}

module.exports = {
  DEFAULT_MAX_IMAGE_BYTES,
  getSafeImageDimensions,
};
