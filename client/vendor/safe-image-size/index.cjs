function disabledImageSize() {
  throw new Error('PptxGenJS 的未使用图片尺寸依赖已被安全禁用');
}

module.exports = disabledImageSize;
module.exports.default = disabledImageSize;
module.exports.imageSize = disabledImageSize;
