/*
  A minigame about catching falling leaves.
*/

export default () => {

  const container = document.createElement('div');
  const w = 600, h = 600;

  const leafSpriteEncoded = "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADg" +
  "dz34AAAAAXNSR0IArs4c6QAAATJJREFUSIntlTGOwjAQRT9wA0TpJhISsrRFem7hJpdITUnBGXICujQ5xW5PgRRRpXELN" +
  "0ChQIPGztgGFiQKRorsRM77838iG/jWfyufHPq3wn/nee+L8Pt8cujpegreb2eOCBelOV13i3D4cTVzRLgoXxMSGMeETn" +
  "tg+nMdAaDKCizXFqc9oI2FNhZ/GxVtdiR1X2UFtLE3eGhsGwVtLNpGoexq7M6LAW/gYHdejMquRtuoJPyeGgjwHHk8fCQ" +
  "4da+NRZUV4i/tWKJ46GWpeOe0JhbR7QHP3gdykC8egwMsIp59Ct42ylkXisdx4DvhMGnuV8iJaIu6ochi4JSIKCA5SdXD" +
  "DqqsQNnV4E44jIRpHvvQA7i0uR1X7p7jb3pJsC8iifqb2kvPitDZ8NJ6K/xj6wIdGSfLDmDF6QAAAABJRU5ErkJggg==')";

  Object.assign(container.style, {
    width: w + 'px',
    height: h + 'px',
    marginLeft: -w / 2 + 'px',
    marginTop: -h / 2 - 80 + 'px',
    left: '50%',
    top: '50%',
    position: 'absolute',
    backgroundColor: 'rgba(120, 120, 120, 0.2)',
    border: '2px solid gray',
    backdropFilter: 'blur(5px)',
    borderRadius: '16px',
    overflow: 'hidden',
    opacity: '0',
    transition: 'opacity 1s ease'
  });

  let leaves_caught = 0;

  class Leaf {
    constructor() {
      const el = document.createElement('div');
      const size = 24 * 3;

      Object.assign(el.style, {
        position: 'absolute',
        left: Math.random() * (w - 50 * 2) - size / 2 + 50 + 'px',
        top: -Math.random() * 300 - 50 + 'px',
        marginLeft: -size / 2 + 'px',
        marginTop: -size / 2 + 'px',
        width: size + 'px',
        height: size + 'px',
        transition: 'all 3s ease-out',
        transitionProperty: 'left, top, transform',
        backgroundImage: leafSpriteEncoded,
        backgroundSize: 'contain',
        imageRendering: 'pixelated'
      });

      const onCatch = () => {
        leaves_caught += 1;
        el.remove();
      };

      el.addEventListener('mousedown', onCatch);
      el.addEventListener('touchstart', onCatch);

      container.append(el);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.left = Math.random() * w - size / 2 + 'px';
          el.style.top = '700px';
          el.style.transform = `rotate(${(Math.random() < 0.5 ? 1 : -1) * Math.random() * 360}deg)`;
        });
      });

      setTimeout(() => el.remove(), 5000);
    }
  }

  document.body.append(container);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.style.opacity = '1';
    });
  });

  const endGame = () => {
    container.style.pointerEvents = 'none';
    container.style.opacity = '0';
    setTimeout(() => {
      container.remove();
    }, 1500);
  };

  return new Promise((resolve) => {
    const startTime = Date.now();
    const addNextLeaf = () => {
      if (leaves_caught >= 15) {
        endGame();
        resolve(leaves_caught);
      } else {
        setTimeout(() => {
          if (Date.now() - startTime < 10_000) {
            new Leaf();
            addNextLeaf();
          } else {
            endGame();
            resolve(leaves_caught);
          }
        }, Math.random() * 100 + 400);
      }
    };
    addNextLeaf();
  });

};
