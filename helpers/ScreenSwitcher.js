
export default class ScreenSwitcher {

  #none = '__none__';
  #prev = '__prev__';
  #exited = false;
  #switchOnly;
  #searchTemplate;
  #element = null;
  #transitionTime;
  #history = [this.#none];
  #tasks = [];
  #working = false;
  #visible = false;
  #onBeforeScreenShow;
  #onAfterScreenHide;
  #onAfterCreate;
  #onBeforeDestroy;

  /**
   * Provides smooth switching between screens.
   * @param {object} params Constructor params.
   * @param {string} params.switchOnly Do not search or load images. In this case, you must take care of filling the screen components yourself.
   * @param {string} params.searchTemplate Image search template. The * will be replaced with the requested name. Default is "./screens/*.jpg".
   * @param {number} params.transitionTime Screen change time in milliseconds.
   * @param {(string|HTMLElement)} params.appendTo Where the element should be placed. Defaults to document.body.
   * @param {function} params.onBeforeScreenShow Fires before the screen starts to appear. Receives the screen name and its html element.
   * @param {function} params.onAfterScreenHide Fires after the screen disappears. There are only two actual screen elements, so be careful.
   * @param {function} params.onAfterCreate Fires after the switcher instance created. Receives both screen elements.
   * @param {function} params.onBeforeDestroy Fires before the switcher instance destroyed. Receives both screen elements.
   * @returns {ScreenSwitcher}
   * @example
   *    const show = new ScreenSwitcher()
   *    show("mountain")       // Show screen with background image "./screens/mountain.jpg".
   *    await show("mountain") // The same, but wait until the screen appears completely.
   *    await show("sea", 750) // Switch to screen "./screens/sea.jpg" using custom transition time (in milliseconds).
   *    await show("__prev__") // Switch back to the previous screen (i.e. "mountain").
   *    await show("__none__") // Switch to no screen.
   *    await show.prev()      // Shortcut for `await show("__prev__")`. Can be used with custom transition time parameter.
   *    await show.none()      // Shortcut for `await show("__none__")`. Can be used with custom transition time parameter.
   *    show.exit()            // Destroy the ScreenSwitcher instance and remove its element.
   */
  constructor({
    switchOnly = false,
    searchTemplate = './screens/*.jpg',
    transitionTime = 1000,
    appendTo = document.body,
    onBeforeScreenShow = async (_name, _elem) => { },
    onAfterScreenHide = async (_name, _elem) => { },
    onAfterCreate = (_first, _last) => { },
    onBeforeDestroy = (_first, _last) => { }
  } = {}) {
    this.#switchOnly = switchOnly;
    this.#searchTemplate = searchTemplate;
    this.#transitionTime = transitionTime;
    this.#onBeforeScreenShow = onBeforeScreenShow;
    this.#onAfterScreenHide = onAfterScreenHide;
    this.#onAfterCreate = onAfterCreate;
    this.#onBeforeDestroy = onBeforeDestroy;
    this.#element = document.createElement('div');
    this.#element.style.position = 'absolute';
    this.#element.style.inset = '0';
    for (let i = 0; i < 2; i++) {
      const elem = document.createElement('div');
      Object.assign(elem.style, {
        position: 'absolute',
        inset: '0',
        opacity: '0',
        backgroundSize: 'cover',
        transitionProperty: 'opacity',
        transitionTimingFunction: 'ease'
      });
      this.#element.append(elem);
    }
    if (typeof appendTo === 'string') {
      document.querySelector(appendTo).append(this.#element);
    } else {
      appendTo.append(this.#element);
    }
    this.#onAfterCreate?.(
      this.#element.firstChild,
      this.#element.lastChild
    );
    const f = (name, time = undefined) => {
      if (this.#exited) {
        return;
      }
      return this.#setScreen(name, time);
    };
    f.none = (time = undefined) => f(this.#none, time);
    f.prev = (time = undefined) => f(this.#prev, time);
    f.exit = () => {
      if (this.#exited) {
        return;
      }
      this.#onBeforeDestroy?.(
        this.#element.firstChild,
        this.#element.lastChild
      );
      this.#destroy();
    };
    return f;
  }

  async #setScreen(name, time = this.#transitionTime) {
    if (this.#working) {
      this.#tasks.push(name);
      return;
    }
    const prev = name === this.#prev;
    if (prev) {
      name = this.#history.at(-2);
    }
    if (!name || name === this.#history.at(-1)) {
      return this.#nextTask();
    }
    const lastName = this.#history.at(-1);
    if (prev) {
      this.#history.pop();
    } else {
      this.#history.push(name);
    }
    if (this.#history.length > 100) {
      this.#history.shift();
    }
    this.#working = true;
    const { firstChild, lastChild } = this.#element;
    if (name === this.#none) {
      await this.#hide(lastChild, time);
      await this.#onAfterScreenHide?.(lastName, lastChild);
      this.#visible = false;
      this.#working = false;
      await this.#nextTask();
    } else if (this.#switchOnly) {
      await this.#onBeforeScreenShow?.(name, firstChild);
      this.#show(firstChild, this.#visible ? 0 : time);
      await this.#hide(lastChild, time);
      await this.#onAfterScreenHide?.(lastName, lastChild);
      this.#element.prepend(lastChild);
      this.#working = false;
      await this.#nextTask();
    } else {
      let resolve;
      const promise = new Promise((res) => (resolve = res));
      const image = new Image();
      image.src = this.#searchTemplate.replace('*', name);
      image.onload = async () => {
        if (this.#exited) {
          resolve();
          return;
        }
        firstChild.style.backgroundImage = `url('${image.src}')`;
        await this.#onBeforeScreenShow?.(name, firstChild);
        this.#show(firstChild, this.#visible ? 0 : time);
        await this.#hide(lastChild, time);
        await this.#onAfterScreenHide?.(lastName, lastChild);
        this.#element.prepend(lastChild);
        this.#working = false;
        await this.#nextTask();
        resolve();
      };
      image.onerror = async () => {
        if (this.#exited) {
          resolve();
          return;
        }
        this.#working = false;
        await this.#nextTask();
        resolve();
      };
      await promise;
    }
  }

  #show(elem, time) {
    this.#visible = true;
    elem.style.transitionDuration = time ? time + 'ms' : '0s';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elem.style.opacity = '1';
      });
    });
  }

  #hide(elem, time) {
    return new Promise((resolve) => {
      elem.style.transitionDuration = time ? time + 'ms' : '0s';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          elem.style.opacity = '0';
          setTimeout(resolve, time);
        });
      });
    });
  }

  #nextTask() {
    if (!this.#exited && this.#tasks.length) {
      return this.#setScreen(this.#tasks.shift());
    }
  }

  #destroy() {
    this.#exited = true;
    this.#history = [];
    this.#tasks = [];
    this.#onBeforeScreenShow = undefined;
    this.#onAfterScreenHide = undefined;
    for (let i = 0; i < this.#element.children.length; i++) {
      this.#element.children[i].replaceChildren();
    }
    this.#element.replaceChildren();
    this.#element.remove();
    this.#element = null;
  }

}
