const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const sourcePath = path.resolve(process.argv[2] || '');
const assetsDir = path.resolve(__dirname, '../assets');
const pngSizes = [16, 24, 32, 48, 64, 128, 256];

if (!sourcePath || !fs.existsSync(sourcePath)) {
  throw new Error('请提供存在的 PNG 图标源文件路径');
}

function roundedSquarePath(context, size, radius) {
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(size - radius, 0);
  context.quadraticCurveTo(size, 0, size, radius);
  context.lineTo(size, size - radius);
  context.quadraticCurveTo(size, size, size - radius, size);
  context.lineTo(radius, size);
  context.quadraticCurveTo(0, size, 0, size - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
}

function renderRoundedIcon(image, size) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = (image.width - sourceSize) / 2;
  const sourceY = (image.height - sourceSize) / 2;
  context.save();
  roundedSquarePath(context, size, Math.round(size * 0.19));
  context.clip();
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  context.restore();
  return canvas.toBuffer('image/png');
}

function createIco(images) {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = headerSize;
  images.forEach(({ size, buffer }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, ...images.map(({ buffer }) => buffer)]);
}

async function main() {
  const image = await loadImage(sourcePath);
  const rendered = pngSizes.map((size) => ({ size, buffer: renderRoundedIcon(image, size) }));
  rendered.forEach(({ size, buffer }) => fs.writeFileSync(path.join(assetsDir, `icon_${size}.png`), buffer));

  const ico = createIco(rendered);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
  fs.writeFileSync(path.join(assetsDir, 'yibiao_256.ico'), ico);

  if (process.platform === 'darwin') {
    const iconsetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yudubid-iconset-'));
    const namedSizes = [16, 32, 128, 256, 512];
    try {
      for (const size of namedSizes) {
        fs.writeFileSync(path.join(iconsetDir, `icon_${size}x${size}.png`), renderRoundedIcon(image, size));
        fs.writeFileSync(path.join(iconsetDir, `icon_${size}x${size}@2x.png`), renderRoundedIcon(image, size * 2));
      }
      const iconsetPath = `${iconsetDir}.iconset`;
      fs.renameSync(iconsetDir, iconsetPath);
      const result = spawnSync('/usr/bin/iconutil', ['-c', 'icns', iconsetPath, '-o', path.join(assetsDir, 'icon.icns')], {
        encoding: 'utf-8',
      });
      if (result.status !== 0) throw new Error(result.stderr || 'iconutil 生成失败');
      fs.rmSync(iconsetPath, { recursive: true, force: true });
    } catch (error) {
      if (fs.existsSync(iconsetDir)) fs.rmSync(iconsetDir, { recursive: true, force: true });
      throw error;
    }
  }

  console.log(`已从 ${sourcePath} 更新应用图标，PNG 四角已透明圆角化。`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
