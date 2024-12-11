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
      spritePath += spritePath.endsWith('/') ? '' : '/';
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
      const getSprites = () => (renderingGroup?.sprites ?? []).map(n => pixelSprites[n]);

      const handler = async function({ offsetX, offsetY }) {
        const { width, height } = this.getBoundingClientRect();
        const x = Math.floor(offsetX * screen.width / width);
        const y = Math.floor(offsetY * screen.height / height);
        const sprites = getSprites();
        for (let i = sprites.length - 1; i >= 0; i--) {
          const spr = sprites[i];
          if (spr.isVisible && spr.checkIntersection(x, y)) {
            await onClick?.(spr.name, renderingGroup.name);
            break;
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

      return {
        spr: (name) => {
          return getSprites().find(spr => spr.name === name);
        },
        show: new ScreenSwitcher({
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
              const sprites = getSprites();
              sprites.forEach(spr => spr.reset());
              this.#render(sprites);
              intervalId = setInterval(() => {
                sprites.forEach(spr => spr.nextFrame());
                this.#render(sprites);
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
        })
      };
    };
  }

  #render(sprites) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    sprites.forEach((spr) => {
      if (spr.isVisible) {
        this.ctx.drawImage(...spr.getDrawImageArgs());
      }
    });
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
