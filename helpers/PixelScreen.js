import PixelSprite from './PixelSprite.js';
import ScreenSwitcher from './ScreenSwitcher.js';

export default class PixelScreen {

  constructor({
    spritePath = './sprites/',
    minPixelSize = 2,
    maxPixelSize = 4,
    frameTime = 250
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

      const onClick = function({ offsetX, offsetY }) {
        const { width, height } = this.getBoundingClientRect();
        const x = Math.floor(offsetX * screen.width / width);
        const y = Math.floor(offsetY * screen.height / height);
        if (renderingGroup) {
          for (let i = renderingGroup.sprites.length - 1; i >= 0; i--) {
            const pxSpr = pixelSprites[renderingGroup.sprites[i]];
            if (pxSpr.checkIntersection(x, y)) {
              console.log(pxSpr.name);
              break;
            }
          }
        }
      };

      canvas1.addEventListener('mousedown', onClick);
      canvas2.addEventListener('mousedown', onClick);
      canvas1.addEventListener('touchstart', onClick);
      canvas2.addEventListener('touchstart', onClick);

      for (const spec of sprites) {
        pixelSprites.push(new PixelSprite({
          ...spec,
          source: spritePath + spec.source + '.png'
        }).ready);
      }

      pixelSprites = await Promise.all(pixelSprites);

      // Reminder: The proxy object should not be returned directly from the async function.
      // Due to the way the await works, this results in a .then() call on the proxy object.
      return { screen: new ScreenSwitcher({
        switchOnly: true,
        onAfterCreate: (bottomElem, topElem) => {
          topElem.append(canvas1);
          bottomElem.append(canvas2);
        },
        onBeforeScreenShow: (name, _elem) => {
          console.log('onBeforeScreenShow:', name);
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
          canvas1.removeEventListener('mousedown', onClick);
          canvas2.removeEventListener('mousedown', onClick);
          canvas1.removeEventListener('touchstart', onClick);
          canvas2.removeEventListener('touchstart', onClick);
          canvas1.remove();
          canvas2.remove();
        }
      })};
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
