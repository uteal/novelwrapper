/**
 * Parses an image with a pixel font, returning a character
 * renderer function and a dictionary for tracking indents.
 * @param {object} params
 * @param {string} params.source
 * @param {[number, number]} params.cell
 * @param {string[]} params.rows
 * @example
 * const { $, h } = await parsePixelFont({
 *   source: './pixelFontSheet.png',
 *   cell: [8, 8],
 *   rows: [
 *     '0123456789',
 *     'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
 *     'abcdefghijklmnopqrstuvwxyz'
 *   ]
 * })
 */
export default async ({ source, cell: [cw, ch] = [8, 8], rows }) => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const image = new Image();
  image.src = source;
  image.onload = resolve;
  image.onerror = reject;
  await promise;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const dict = {};
  for (let rowNum = 0; rowNum < rows.length; rowNum++) {
    for (let colNum = 0; colNum < rows[rowNum].length; colNum++) {
      const char = rows[rowNum][colNum];
      if (char === ' ') continue;
      const sx = colNum * cw;
      const sy = rowNum * ch;
      let left = Infinity;
      let right = -Infinity;
      for (let y = sy; y < sy + cw; y++) {
        for (let x = sx; x < sx + cw; x++) {
          if (ctx.getImageData(x, y, 1, 1).data[3] !== 0) {
            if (x < left) left = x;
            if (x > right) right = x;
      }}}
      dict[char] = { x: left, y: sy, w: right - left + 1, h: ch };
  }}
  return {
    $: structuredClone(dict),
    h: makeRenderFunction(canvas, dict)
  };
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} dict
 */
const makeRenderFunction = (canvas, dict) => {
  const { width, height } = canvas;
  const canvas_ = document.createElement('canvas');
  canvas_.width = width;
  canvas_.height = height;
  const ctx_ = canvas_.getContext('2d', { willReadFrequently: true });

  /**
   * @param {string} char
   * @param {number} left
   * @param {number} top
   * @param {number[]} color
   */
  return (char, left, top, color = undefined) => {
    if (!Object.hasOwn(dict, char)) {
      console.error(`Unknown symbol: "${char}"`);
      return;
    }
    const { x, y, w, h } = dict[char];
    if (!color) {
      return [canvas, x, y, w, h, left, top, w, h];
    } else {
      const [r = 0, g = 0, b = 0, a = 1] = color;
      ctx_.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx_.clearRect(0, 0, width, height);
      ctx_.drawImage(canvas, 0, 0);
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          if (ctx_.getImageData(i, j, 1, 1).data[3] === 255) {
            if (a !== 1) {
              ctx_.clearRect(i, j, 1, 1);
            }
            ctx_.fillRect(i, j, 1, 1);
      }}}
      return [canvas_, x, y, w, h, left, top, w, h];
    }
  };
};
