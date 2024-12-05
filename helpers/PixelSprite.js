
const COLORS = {
  '@white' : [255, 255, 255],
  '@yellow': [255, 255, 0],
  '@orange': [255, 127, 0],
  '@purple': [255, 0, 255],
  '@green' : [0, 255, 0],
  '@blue'  : [0, 0, 255],
  '@red'   : [255, 0, 0]
};

export default class PixelSprite {

  /**
   * @param {object} spec Specification of the new sprite.
   * @param {string} spec.name Name of the new sprite.
   * @param {string[]} spec.flags Sprite flags.
   * @param {string|HTMLImageElement} spec.source Image or its url.
   * @param {object} spec.sheet
   * @param {number} spec.sheet.width Sprite sheet width in pixels.
   * @param {number} spec.sheet.height Sprite sheet height in pixels.
   * @param {number} spec.sheet.rows Number of rows in spritesheet.
   * @param {number} spec.sheet.cols Number of columns in spritesheet.
   * @param {object} spec.frames
   * @param {number} spec.frames.unique Number of frames with unique picture.
   * @param {number[]} spec.frames.order Order of frames.
   * @param {number[][]} spec.frames.shift Shift of frames.
   */
  constructor({
    name = '',
    flags = [],
    source = undefined,
    sheet = {
      width: 0,
      height: 0,
      rows: 0,
      cols: 0
    },
    frames = {
      unique: 0,
      order: [],
      shift: []
    }
  }) {
    this.name = name;
    this.flags = [...flags];
    this.sheet = structuredClone(sheet);
    this.frames = structuredClone(frames);
    this.curFrameNum = 0;
    this.maxFrameNum = frames.order.length - 1;
    this.frameRects = [];

    for (const flag of flags) {
      if (Object.hasOwn(COLORS, flag)) {
        this.outlineColor = COLORS[flag];
        break;
      }
    }

    this.isActive = !!this.outlineColor;
    this.isOutlined = false;

    const fw = sheet.width / sheet.cols;
    const fh = sheet.height / sheet.rows;
    for (let i = 0; i < frames.unique; i++) {
      const row = Math.floor(i / sheet.cols);
      const col = i - row * sheet.cols;
      this.frameRects.push([col * fw, row * fh, fw, fh]);
    }

    this.canvas = this.#makeCanvas();
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (this.isActive) {
      this.canvas_ = this.#makeCanvas();
      this.ctx_ = this.canvas_.getContext('2d', { willReadFrequently: true });
    }

    this.ready = new Promise((resolve) => {
      if (source instanceof Image) {
        this.ctx.drawImage(source, 0, 0);
        if (this.isActive) {
          this.ctx_.drawImage(source, 0, 0);
          this.#outline(this.ctx_).then(() => resolve(this));
        } else {
          resolve(this);
        }
      } else if (typeof source === 'string') {
        const image = new Image();
        image.src = source;
        image.onload = () => {
          this.ctx.drawImage(image, 0, 0);
          if (this.isActive) {
            this.ctx_.drawImage(image, 0, 0);
            this.#outline(this.ctx_).then(() => resolve(this));
          } else {
            resolve(this);
          }
        };
        image.onerror = () => {
          console.error('Image not found or could not be loaded.');
          resolve(this);
        };
      } else {
        console.error('Parameter "source" should be string or Image.');
      }
    });
  }

  nextFrame() {
    this.curFrameNum = this.curFrameNum < this.maxFrameNum ? this.curFrameNum + 1 : 0;
  }

  resetFrames() {
    this.curFrameNum = 0;
  }

  getDrawImageArgs() {
    const n = this.curFrameNum;
    const [x, y, w, h] = this.frameRects[this.frames.order[n]];
    return [
      this.isOutlined ? this.canvas_ : this.canvas,
      x, y, w, h, ...this.frames.shift[n], w, h
    ];
  }

  setOutline() {
    if (this.isActive) {
      this.isOutlined = true;
    }
  }

  clearOutline() {
    if (this.isActive) {
      this.isOutlined = false;
    }
  }

  checkIntersection(x, y) {
    return this.ctx.getImageData(x, y, 1, 1).data[3] !== 0;
  }

  #makeCanvas() {
    const el = document.createElement('canvas');
    el.width = this.sheet.width;
    el.height = this.sheet.height;
    el.style.pointerEvents = 'none';
    return el;
  }

  async #outline(context) {
    // const t = performance.now();
    const { sheet, frames } = this;
    const [r, g, b] = this.outlineColor;
    const imageData = context.getImageData(0, 0, sheet.width, sheet.height);
    const { width, height, data } = imageData;
    const imageData_ = new ImageData(width, height);
    const data_ = imageData_.data;
    const { rows, cols } = sheet;
    const fw = sheet.width / cols;
    const fh = sheet.height / rows;
    for (let y = 0; y < height; y++) {
      const rowNum = Math.floor(y / fh);
      if (rowNum >= rows) {
        break;
      }
      const frameTop = y % fh === 0;
      const frameBottom = y % fh === fh - 1;
      for (let x = 0; x < width; x++) {
        const colNum = Math.floor(x / fw);
        if (colNum >= cols) {
          break;
        }
        const frameNum = rowNum * cols + colNum;
        if (frameNum >= frames) {
          break;
        }
        const frameLeft = x % fw === 0;
        const frameRight = x % fw === fw - 1;
        const offset = (y * width + x) * 4;
        if (data[offset + 3] === 0) {
          if (
            (!frameBottom && data[(offset + width * 4) + 3] > 0) ||
            (!frameRight && data[(offset + 4) + 3] > 0) ||
            (!frameLeft && data[(offset - 4) + 3] > 0) ||
            (!frameTop && data[(offset - width * 4) + 3] > 0)
          ) {
            data_[offset + 0] = r;
            data_[offset + 1] = g;
            data_[offset + 2] = b;
            data_[offset + 3] = 255;
          }
        }
      }
    }
    context.drawImage(await createImageBitmap(imageData_), 0, 0);
    // console.log(performance.now() - t);
  }

}
