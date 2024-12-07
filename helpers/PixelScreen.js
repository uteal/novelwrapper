import PixelSprite from './PixelSprite.js';
import ScreenSwitcher from './ScreenSwitcher.js';

export default class PixelScreen {

  constructor({
    spritePath = './sprites/',
    minPixelSize = 2,
    maxPixelSize = 4,
    frameTime = 250,
    onClick = async (_spriteName, _groupName) => { }
  } = {}) {
    this.init = async () => {
      spritePath = spritePath + (spritePath.at(-1) !== '/' ? '/' : '');
      const response = await fetch(spritePath + 'atlas.json');
      const { screen, groups, sprites } = await response.json();

      const canvas1 = this.#makeCanvas(screen, minPixelSize, maxPixelSize);
      const canvas2 = this.#makeCanvas(screen, minPixelSize, maxPixelSize);
      const ctx1 = canvas1.getContext('2d');
      const ctx2 = canvas2.getContext('2d');

      this.canvas = canvas1;
      this.ctx = ctx1;
      let intervalId = -1;
      let renderingGroup = null;
      let pixelSprites = [];

      const handler = async function({ offsetX, offsetY }) {
        const { width, height } = this.getBoundingClientRect();
        const x = Math.floor(offsetX * screen.width / width);
        const y = Math.floor(offsetY * screen.height / height);
        if (renderingGroup) {
          for (let i = renderingGroup.sprites.length - 1; i >= 0; i--) {
            const pxSpr = pixelSprites[renderingGroup.sprites[i]];
            if (pxSpr.checkIntersection(x, y)) {
              await onClick?.(pxSpr.name, renderingGroup.name);
              break;
            }
          }
        }
      };

      canvas1.addEventListener('mousedown', handler);
      canvas2.addEventListener('mousedown', handler);
      canvas1.addEventListener('touchstart', handler);
      canvas2.addEventListener('touchstart', handler);

      for (const spec of sprites) {
        pixelSprites.push(new PixelSprite({
          ...spec,
          source: spritePath + spec.source + '.png'
        }).ready);
      }

      pixelSprites = await Promise.all(pixelSprites);

      return new ScreenSwitcher({
        switchOnly: true,
        onAfterCreate: (bottomElem, topElem) => {
          topElem.append(canvas1);
          bottomElem.append(canvas2);
        },
        onBeforeScreenShow: (name, _elem) => {
          this.canvas = this.canvas === canvas1 ? canvas2 : canvas1;
          this.ctx = this.ctx === ctx1 ? ctx2 : ctx1;
          clearInterval(intervalId);
          renderingGroup = groups.find(group => group.name === name);
          if (renderingGroup) {
            this.#render(renderingGroup, pixelSprites, true);
            intervalId = setInterval(() => {
              this.#render(renderingGroup, pixelSprites);
            }, frameTime);
          } else {
            console.error('Unknown sprite group:', name);
          }
        },
        onBeforeDestroy: () => {
          clearInterval(intervalId);
          canvas1.removeEventListener('mousedown', handler);
          canvas2.removeEventListener('mousedown', handler);
          canvas1.removeEventListener('touchstart', handler);
          canvas2.removeEventListener('touchstart', handler);
          canvas1.remove();
          canvas2.remove();
        }
      });
    };
  }

  #render(group, pxSprites, resetFrames = false) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const num of group.sprites) {
      const pxSpr = pxSprites[num];
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
