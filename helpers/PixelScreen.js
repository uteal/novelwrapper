import PixelSprite from './PixelSprite.js';
import ScreenSwitcher from './ScreenSwitcher.js';

export default class PixelScreen {

  constructor({
    spritePath = './sprites/',
    minPixelSize = 2,
    maxPixelSize = 4,
    frameTime = 250
  } = {}) {
    spritePath = spritePath + (spritePath.at(-1) !== '/' ? '/' : '');
    this.init = async () => {
      const response = await fetch(spritePath + 'atlas.json');
      const { screen, groups, sprites } = await response.json();

      const canvas1 = this.#makeCanvas(screen, minPixelSize, maxPixelSize);
      const canvas2 = this.#makeCanvas(screen, minPixelSize, maxPixelSize);
      const ctx1 = canvas1.getContext('2d');
      const ctx2 = canvas2.getContext('2d');

      this.canvas = canvas1;
      this.ctx = ctx1;

      let renderingGroup;

      this.bg = new ScreenSwitcher({
        switchOnly: true,
        onBeforeScreenShow: async (name, elem) => {
          this.canvas = this.canvas === canvas1 ? canvas2 : canvas1;
          this.ctx = this.ctx === ctx1 ? ctx2 : ctx1;
          renderingGroup = groups.find(group => group.name === name);
          if (renderingGroup) {
            this.#render(renderingGroup, true);
            elem.append(this.canvas);
          } else {
            console.error('Unknown sprite group:', name);
          }
        },
        onAfterScreenHide: async (_name, elem) => {
          elem.replaceChildren();
        }
      });

      this.pixelSprites = [];

      for (const spec of sprites) {
        this.pixelSprites.push(new PixelSprite({
          ...spec,
          source: spritePath + spec.source + '.png'
        }).ready);
      }
      this.pixelSprites = await Promise.all(this.pixelSprites);

      this.intervalId = setInterval(() => {
        if (renderingGroup) {
          this.#render(renderingGroup);
        }
      }, frameTime);

      return this;
    };
  }

  #render(group, resetFrames = false) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const num of group.sprites) {
      const pxSpr = this.pixelSprites[num];
      if (resetFrames) {
        pxSpr.resetFrames();
      } else {
        pxSpr.nextFrame();
      }
      this.ctx.drawImage(...pxSpr.getDrawImageArgs());
    }
  }

  #makeCanvas({ width, height }, minPixelSize, maxPixelSize) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    Object.assign(canvas.style, {
      minWidth: width * minPixelSize + 'px',
      minHeight: height * minPixelSize + 'px',
      maxWidth: width * maxPixelSize + 'px',
      maxHeight: height * maxPixelSize + 'px',
      width: '100%',
      height: '100%',
      imageRendering: 'pixelated',
      backgroundColor: '#eee'
    });
    return canvas;
  }

}
