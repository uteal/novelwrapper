/*! NovelWrapper v0.2.2 | (c) 2024 uteal | MIT License */

// Hint: If you don't want to use this file as a module, comment out
// the line starting with "export" and uncomment the line below it.

/**
 * Makes a new novel from the scenes given. Returns a handle with a set of useful methods.
 * @param {string} novelTag A novel-specific name used when saving or restoring a game state.
 * @param {(function|function[])} factories A function or array of functions that return dictionaries of novel scenes.
 * @param {object} params Initial params.
 * @param {object} params.$ Initial game state. Should be JSON-serializable. Empty object by default.
 * @param {object} params.ext A helper object for passing custom functions or data to scenes.
 * @param {(object|object[])} params.callbacks Callbacks for standard events in form of object or array of objects.
 * @param {boolean} params.devMode Allows the engine to output logs. Essential during development.
 * @param {number} params.stepTime The time it takes to print each symbol in milliseconds. Instant if zero.
 * @param {string} params.cssPrefix Engine will use this when searching for CSS styles. Default is "novel".
 * @param {string} params.imagesPath Path to the folder with portraits of the novel's characters.
 * @param {string} params.imagesType File extension of the novel's character portraits. Default is "png".
 * @param {string} params.firstScene Entry point of the novel, defaults to "start".
 * @param {boolean} params.skipRestoring Should the game ignore (and clear) the previous save? Default is false.
 * @param {(string|HTMLElement)} params.appendTo Where the novel element should be placed. Defaults to document.body.
 * @param {object} params.delays Engine animation delays, for deep customization. See the engine file for a list of them.
 * @param {('left'|'right')} params.defaultAlign Starting alignment of each character. Default is "right".
 * @param {RegExp} params.multiLangSplitRegex Multilingual strings delimeter. Default: /\s>>\s/
 * @param {number} params.language Which part of the split multilingual string should be shown. Default: -1 (i.e. no translation).
 */
export default (novelTag, factories, params = {}) => {
// window.createNovel = (novelTag, factories, params = {}) => {

  // #region globals
  const store = {};
  const scenes = {};
  const characters = {};
  const history = [];
  const pressed = {};
  const externalData = {};

  const DELAYS = {
    CHARACTER_SHOW       : 350,
    CHARACTER_HIDE       : 350,
    CHARACTER_MOOD_CHANGE: 100,
    BEFORE_SELECT_ACTIVE : 350,
    AFTER_OPTION_CLICK   : 250,
    BEFORE_FIRST_PRINT   : 500,
    BEFORE_FAST_FORWARD  : 200,
    BEFORE_IDLE_PROCEED  : 500
  };

  const stdCallbacks = {

    /**
     * Fires when the game starts.
     * @param {object} novel Novel handler.
     */
    onGameStart: null,

    /**
     * Fires when a novel character appears.
     * @param {string} id The character's id.
     */
    onShow: null,

    /**
     * Fires when a novel character disappears.
     * @param {string} id The character's id.
     */
    onHide: null,

    /**
     * Fires every time a text character is printed.
     * @param {string} char The character printed.
     */
    onType: null,

    /**
     * Fires when the text field is waiting for player's action.
     */
    onStop: null,

    /**
     * Fires when the player enters a scene.
     * @param {string} id The scene's id.
     * @param {boolean} real Is the transition real? If false, the scene is called.
     */
    onSceneEnter: null,

    /**
     * Fires when the player leaves a scene.
     * @param {string} id The scene's id.
     * @param {boolean} real Is the transition real? If false, the scene is called.
     */
    onSceneLeave: null,

    /**
     * Fires when the watcher is created.
     * @param {string} event The watched event name.
     */
    onWatcherCreate: null,

    /**
     * Fires when the watcher is removed.
     * @param {string} event The no longer watched event name.
     */
    onWatcherRemove: null,

    /**
     * Fires when the player enters the watcher's callback.
     * @param {string} event The event name.
     * @param {...any} args The additional arguments passed to the watcher's callback.
     */
    onEventEnter: null,

    /**
     * Fires when the player leaves the watcher's callback.
     * @param {string} event The event name.
     * @param {any} result The returned value of the watcher's callback.
     */
    onEventLeave: null,

    /**
     * Fires when a list of selectable options is shown.
     */
    onShowOptions: null,

    /**
     * Fires when the player selects an option from the list.
     */
    onOptionClick: null,

    /**
     * Fires when a field is set in the storage object ($).
     * Note: Changes to nested structures are not tracked.
     * @param {any} name Property name.
     * @param {any} value Property value.
     */
    onStoreChange: null,

    /**
     * Fires when the game is ended.
     * @param {any} result The value that ended the game.
     */
    onGameEnd: null

  };

  let novel;
  let currentScene;
  let shownCharacter;
  let callStackSize = 0;
  let watchersCallback;
  let dialogsCallback;
  let choicesCallback;

  let DEV_MODE = true;
  let WRITING = false;
  let CHOOSING = false;
  let LANGUAGE = -1;
  let SPLIT_REGEX = /\s>>\s/;
  let WAITING_FOR_ACTION = false;
  let SCRIPT_FLOW_ENDED = false;
  let STEP_TIME = 1000 / 60;
  let FAST_FORWARD = false;
  let DEFAULT_ALIGN = 'right';

  let __;
  let imagesBasePath;
  let imagesExtension;
  let initialSceneId;
  let restoredData;

  let $container;
  let $dialogs;
  let $choices;
  let $textbox;
  let $message;
  let $msgRendered;
  let $msgPlaceholder;
  let $select;

  const storeProxy = new Proxy(store, {
    set(target, prop, value) {
      target[prop] = value;
      stdCallbacks.onStoreChange?.(prop, value);
      return true;
    }
  });

  const charactersProxy = new Proxy(characters, {
    get(target, prop) {
      if (Object.hasOwn(target, prop)) {
        return target[prop].proxy;
      } else {
        target[prop] = new Character(prop);
        return target[prop].proxy;
      }
    }
  });

  const onDialogsClick = (force = false) => {
    if ((WAITING_FOR_ACTION || force) && dialogsCallback) {
      WAITING_FOR_ACTION = false;
      const resolve = dialogsCallback;
      dialogsCallback = null;
      resolve();
    }
  };

  const onSelectClick = async ({ target }) => {
    if (WAITING_FOR_ACTION && choicesCallback && target?.classList.contains(__ + '-select-option')) {
      WAITING_FOR_ACTION = false;
      stdCallbacks.onOptionClick?.();
      const num = [...$select.querySelectorAll('.' + __ + '-select-option')].findIndex(el => target === el);
      $select.classList.add(__ + '-select-hidden');
      const resolve = choicesCallback;
      choicesCallback = null;
      log('👉', target.innerText);
      await sleep(DELAYS.AFTER_OPTION_CLICK);
      CHOOSING = false;
      resolve(num);
    }
  };
  // #endregion

  // #region Novel
  class Novel {

    constructor(id, {
      $ = {},
      ext = {},
      callbacks = [],
      devMode = DEV_MODE,
      stepTime = STEP_TIME,
      cssPrefix = 'novel',
      imagesPath = './images/',
      imagesType = 'png',
      firstScene = 'start',
      skipRestoring = false,
      appendTo = document.body,
      delays = {},
      defaultAlign = DEFAULT_ALIGN,
      multiLangSplitRegex = SPLIT_REGEX,
      language = LANGUAGE,
    }) {
      this.id = id;
      Object.assign(store, $);
      Object.assign(externalData, ext);
      Object.assign(DELAYS, delays);
      DEV_MODE = devMode;
      STEP_TIME = stepTime;
      SPLIT_REGEX = multiLangSplitRegex;
      LANGUAGE = language;
      DEFAULT_ALIGN = ['left', 'right'].includes(defaultAlign) ? defaultAlign : DEFAULT_ALIGN;
      initialSceneId = firstScene;
      imagesBasePath = imagesPath + (imagesPath.at(-1) !== '/' ? '/' : '');
      imagesExtension = imagesType.toLowerCase();
      __ = cssPrefix;

      $container = div(__ + '-container', __ + '-layer');
      $dialogs = div(__ + '-dialogs', __ + '-layer');
      $choices = div(__ + '-choices', __ + '-layer');
      $textbox = div(__ + '-textbox', __ + '-textbox-hidden');
      $message = div(__ + '-message');
      $msgRendered = span(__ + '-message-rendered');
      $msgPlaceholder = span(__ + '-message-placeholder');
      $select = div(__ + '-select', __ + '-select-hidden');

      $container.append($dialogs, $choices);
      $message.append($msgRendered, $msgPlaceholder);
      $textbox.append($message);
      $dialogs.append($textbox);
      $choices.append($select);

      $dialogs.addEventListener('click', () => onDialogsClick());
      $select.addEventListener('click', event => onSelectClick(event));

      this.setCallbacks(callbacks);
      this.getScenes();

      if (typeof appendTo === 'string') {
        appendTo = document.querySelector(appendTo);
      }
      appendTo.append($container);

      if (skipRestoring) {
        this.clearSaveSlot('autosave');
      }
      restoredData = this.restoreState('autosave');
      Object.assign(store, restoredData.store);
      log('📦', store);
      // To make it safe to use the novel handle inside standard callbacks.
      doubleRAF(() => {
        this.runScene(restoredData.scene, false);
        stdCallbacks.onGameStart?.(novel);
      });
    }

    setCallbacks(arr) {
      if (!Array.isArray(arr)) {
        arr = [arr];
      }
      const acc = Object.fromEntries(Object.keys(stdCallbacks).map(key => [key, []]));
      for (const dict of arr) {
        for (const [name, func] of Object.entries(dict)) {
          if (!Object.hasOwn(acc, name)) {
            console.error('Unknown callback:', name);
            continue;
          }
          acc[name].push(func);
        }
      }
      for (const [name, list] of Object.entries(acc)) {
        if (list.length > 0) {
          stdCallbacks[name] = list.length === 1
            ? list[0]
            : function(...args) { list.forEach(cb => cb.apply(this, args)) };
        }
      }
    }

    getScenes() {
      if (!Array.isArray(factories)) {
        factories = [factories];
      }
      for (const f of factories) {
        Object.entries(
          f({
            $: storeProxy,
            watch,
            select,
            call,
            print,
            clear,
            sleep,
            log,
            ext: externalData
          })
        ).forEach(([id, cb]) => {
          if (!Object.hasOwn(scenes, id)) {
            scenes[id] = new Scene(id, cb);
          } else {
            console.error('Scene redeclaration:', id);
          }
        });
      }
    }

    createKey(slotName) {
      return `novel : ${novelTag} : ${slotName}`;
    }

    saveState(slotName) {
      const key = this.createKey(slotName);
      const val = {
        scene: currentScene.id,
        characters: Object.fromEntries(Object.values(characters).map(
          ch => [ch.id, {
            align: ch.align,
            label: ch.label || undefined,
            flipped: ch.flipped || undefined
          }]
        )),
        store
      };
      localStorage.setItem(key, JSON.stringify(val));
      // log('💾', slotName, {...store});
    }

    restoreState(slotName) {
      const key = this.createKey(slotName);
      let val;
      try { val = JSON.parse(localStorage.getItem(key)) } catch (e) { }
      if (val) {
        log('↻', novelTag, slotName);
        return val;
      } else {
        log('🎬', novelTag);
        return {
          scene: initialSceneId,
          characters: {},
          store: {},
        };
      }
    }

    clearSaveSlot(slotName) {
      const key = this.createKey(slotName);
      localStorage.removeItem(key);
      log('🗑️', novelTag, slotName);
    }

    async runScene(id, autosave = true) {
      log('⛰️', id);
      if (id?.[0] === '~') {
        id = id.slice(1);
      } else {
        shownCharacter?.hide();
      }
      if (currentScene) {
        currentScene.end();
      }
      if (!Object.hasOwn(scenes, id)) {
        console.error('Trying to run unknown scene:', id);
        return;
      }
      currentScene = scenes[id];
      if (autosave) {
        this.saveState('autosave');
      }
      stdCallbacks.onSceneEnter?.(id, true);
      const result = await currentScene.run();
      stdCallbacks.onSceneLeave?.(id, true);
      if (typeof result === 'string') {
        setTimeout(() => this.runScene(result));
      } else {
        log('🏁', 'Game ended.');
        stdCallbacks.onGameEnd?.(result);
      }
    }

    async notify(event, ...args) {
      log('👁️', event);
      if (!currentScene) {
        console.error(`Event "${event}" occured while no scene is active`);
        return;
      }
      if (!SCRIPT_FLOW_ENDED) {
        console.error(`Event "${event}" occured while the script flow was not ended.`);
        return;
      }
      const watcher = currentScene.watchers.find(obj => obj.event === event);
      if (!watcher) {
        log('🥥', 'No such watcher.');
        return;
      }
      if (watcher) {
        SCRIPT_FLOW_ENDED = false;
        stdCallbacks.onEventEnter?.(event, ...args);
        const result = await watcher.cb(...args);
        stdCallbacks.onEventLeave?.(event, result);
        if (typeof result === 'string') {
          watchersCallback(result);
        } else {
          if (result === false) {
            currentScene.removeWatcher(event);
          }
          shownCharacter?.hide();
          $choices.style.pointerEvents = 'none';
          $dialogs.style.pointerEvents = 'none';
          SCRIPT_FLOW_ENDED = true;
          log('⛰️', currentScene.id, '↩');
        }
      }
    }
  }
  // #endregion

  // #region Scene
  class Scene {

    watchers = [];

    constructor(id, cb) {
      this.id = id;
      this.cb = cb;
    }

    async run() {
      let result = await this.cb(charactersProxy);
      if (result === undefined) {
        if (this.watchers.length) {
          SCRIPT_FLOW_ENDED = true;
          shownCharacter?.hide();
          $choices.style.pointerEvents = 'none';
          $dialogs.style.pointerEvents = 'none';
          $container.style.pointerEvents = 'none';
          result = await new Promise((resolve) => {
            watchersCallback = resolve;
          });
        } else {
          // Scene has no active watchers and yet returned undefined.
          log('🚧', 'The game has stalled.');
        }
      }
      return result;
    }

    removeWatcher(event) {
      const index = this.watchers.findIndex(obj => obj.event === event);
      if (index !== -1) {
        this.watchers.splice(index, 1);
        stdCallbacks.onWatcherRemove?.(event);
        log('🧹', event);
      }
    }

    end() {
      this.watchers.forEach(({ event }) => {
        stdCallbacks.onWatcherRemove?.(event);
      });
      this.watchers = [];
    }
  }
  // #endregion

  function watch(event, cb) {
    if (currentScene.watchers.some(obj => obj.event === event)) {
      console.error(`Multiple watchers of the same event (${event}) not allowed at scene (${currentScene.id})`);
      return;
    }
    log('📌', event);
    currentScene.watchers.push({ event, cb });
    stdCallbacks.onWatcherCreate?.(event);
    const sceneId = currentScene.id;
    return {
      then: () => {
        console.error(`There is no point in "await" before "watch" (scene: "${sceneId}", event: "${event}").`);
      }
    };
  }

  // #region Character
  class Character {

    constructor(id) {
      log('🦊', id);
      this.id = id;
      this.label = '';
      this.align = DEFAULT_ALIGN;
      this.flipped = false;
      this.visible = false;
      this.timeout;
      this.mood = 'normal';
      this.queue = [];

      let nextMood = 'normal';

      const $$ = (...args) => {
        // Checking if there is a character with the planned messages. This almost certainly indicates a forgotten "await".
        if (DEV_MODE) {
          for (const { id, queue } of Object.values(characters)) {
            if (queue.length) {
              console.error(`Unexpected state. Check the "await" before these words of ${id}:`, [...queue]);
              return;
            }
          }
        }
        // After the first call in the chain, this function returns a proxy object that allows the engine to track down certain types of errors.
        return this.proxy__(...args);
      };

      Object.assign($$, {
        $toLeft: () => {
          this.setAlign('left');
          return this.proxy_;
        },
        $toRight: () => {
          this.setAlign('right');
          return this.proxy_;
        },
        $setName: (str) => {
          this.setLabel(str);
          return this.proxy_;
        },
        $flipImage: () => {
          this.setFlip(!this.flipped);
          return this.proxy_;
        },
        then: () => {
          console.error(
            `Seemingly useless "await" before ${this.id}'s handle. This error may be caused by:\n` +
            '1. Erroneous usage of "await" with syncronous methods like "$toLeft", "$toRight", "$setName".\n' +
            '2. Using quotes or double quotes instead of backticks in parenthesis-less notation.\n' +
            '3. Using a comma or semicolon before the first argument in parenthesis-less notation.'
          );
        }
      });

      // This object is passed to the scene function as a character handle.
      this.proxy = new Proxy($$, {
        get: (target, prop) => {
          if (Object.hasOwn(target, prop)) {
            return target[prop];
          } else {
            nextMood = prop;
            return this.proxy__;
          }
        }
      });

      // Allows only method calls.
      this.proxy_ = new Proxy($$, {
        apply: () => {
          console.error('Direct function call in a method chain. Chaining of methods and function calls is prohibited.');
          return;
        }
      });

      // Allows only function calls and "then".
      this.proxy__ = new Proxy($$, {
        get: (_target, prop) => {
          if (prop !== 'then') {
            console.error(`Once the call chain has started, property getting is not allowed. Requested property: "${prop}".`);
            return;
          }
          return async (resolve) => {
            const args = this.queue;
            this.queue = [];
            await this.say(nextMood, ...args);
            nextMood = 'normal';
            resolve();
          };
        },
        apply: (_target, _thisArg, args) => {
          // Checking if function was called as a template tag.
          if (Array.isArray(args[0]) && Array.isArray(args[0].raw)) {
            args = [templateToString(...args)];
          }
          this.queue.push(...args);
          return this.proxy__;
        }
      });

      this.$el = div(
        __ + '-character',
        __ + '-character-id-' + id,
        __ + '-character-align-' + this.align,
        __ + '-character-inactive'
      );
      this.$portraits = div(
        __ + '-character-portraits'
      );
      this.$label = div(
        __ + '-label',
        __ + '-label-id-' + id,
        __ + '-label-hidden'
      );
      this.$el.append(this.$portraits, this.$label);

      if (restoredData?.characters && Object.hasOwn(restoredData.characters, id)) {
        const data = restoredData.characters[id];
        this.setLabel(data.label);
        this.setAlign(data.align);
        this.setFlip(data.flipped);
        log('↻', data);
      }
    }

    setLabel(str = '') {
      this.$label.innerText = str;
      this.label = str;
      if (!str) {
        this.$label.classList.add(__ + '-label-hidden');
      } else if (this.visible) {
        this.$label.classList.remove(__ + '-label-hidden');
      }
    }

    setFlip(flip = false) {
      this.flipped = flip;
      if (flip) {
        this.$el.classList.add(__ + '-character-flipped');
      } else {
        this.$el.classList.remove(__ + '-character-flipped');
      }
    }

    setMood(mood) {
      if (mood !== this.mood) {
        this.$el.classList.remove(__ + '-character-mood-' + this.mood);
        this.$el.classList.add(__ + '-character-mood-' + mood);
        this.mood = mood;
        return true;
      }
      return false;
    }

    async show(mood = this.mood) {
      const moodChanged = this.setMood(mood);
      const sameHero = !!shownCharacter && shownCharacter === this;
      const sameSide = !!shownCharacter && shownCharacter.align === this.align;
      let $portrait = this.$portraits.querySelector('.' + __ + '-portrait-mood-' + mood);

      if (!$portrait) {
        $portrait = div(
          __ + '-portrait',
          __ + '-portrait-mood-' + mood,
          __ + '-portrait-hidden'
        );
        this.$portraits.append($portrait);
        await new Promise((resolve) => {
          let source = `${imagesBasePath}${this.id}/${mood}.${imagesExtension}`;
          if (DEV_MODE) {
            source += '?' + Math.random();
          }
          const image = new Image();
          image.src = source;
          image.onload = () => {
            $portrait.style.backgroundImage = `url('${source}')`;
            resolve();
          };
          image.onerror = () => {
            resolve();
          };
        });
      } else if ($portrait.classList.contains(__ + '-portrait-hidden')) {
        this.$portraits.append($portrait);
      }

      if (!sameHero) {
        if (sameSide) {
          await shownCharacter?.hide();
        } else {
          shownCharacter?.hide();
        }
      }

      if ($portrait.classList.contains(__ + '-portrait-hidden')) {
        doubleRAF(() => {
          $portrait.classList.remove(__ + '-portrait-hidden');
        });
      }

      if (!this.visible) {
        this.visible = true;
        shownCharacter = this;
        $msgRendered.innerText = '';
        $msgPlaceholder.innerText = '';
        $dialogs.append(this.$el);
        // Cancel the cleanup task if any.
        clearTimeout(this.timeout);
        stdCallbacks.onShow?.(this.id);
        await doubleRAF(() => {
          this.$el.classList.remove(__ + '-character-inactive');
          $textbox.classList.remove(__ + '-textbox-hidden');
          for (let i = $textbox.classList.length - 1; i >= 0; i--) {
            const className = $textbox.classList[i];
            if (className.startsWith(__ + '-textbox-of-')) {
              $textbox.classList.remove(className);
            }
          }
          $textbox.classList.add(__ + '-textbox-of-' + this.id);
          this.updateTextboxAlign();
        });
        if (this.label) {
          this.$label.classList.remove(__ + '-label-hidden');
        } else {
          this.$label.classList.add(__ + '-label-hidden');
        }
        await sleep(DELAYS.CHARACTER_SHOW);
      } else {
        await doubleRAF(async () => {
          await sleep(moodChanged ? DELAYS.CHARACTER_MOOD_CHANGE : 0);
          for (let i = 0; i < this.$portraits.children.length - 1; i++) {
            this.$portraits.children[i].classList.add(__ + '-portrait-hidden');
          }
          this.updateTextboxAlign();
        });
      }
    }

    async hide() {
      if (this.visible) {
        this.visible = false;
        shownCharacter = undefined;
        this.$el.classList.remove(__ + '-character-mood-' + this.mood);
        this.$el.classList.add(__ + '-character-inactive');
        this.$label.classList.add(__ + '-label-hidden');
        for (const $elem of this.$portraits.children) {
          $elem.classList.add(__ + '-portrait-hidden');
        }
        await doubleRAF(() => {
          if (!WRITING) {
            $textbox.classList.add(__ + '-textbox-hidden');
          }
        });
        stdCallbacks.onHide?.(this.id);
        // For optimization purposes.
        this.timeout = setTimeout(() => this.$el.remove(), 5000);
        await sleep(DELAYS.CHARACTER_HIDE);
      }
    }

    setAlign(align) {
      if (align !== this.align) {
        this.$el.classList.remove(__ + '-character-align-' + this.align);
        this.$el.classList.add(__ + '-character-align-' + align);
        this.align = align;
        if (this.visible) {
          this.updateTextboxAlign();
        }
      }
    }

    updateTextboxAlign() {
      if (this.align === 'left') {
        $textbox.classList.remove(__ + '-textbox-right');
        $textbox.classList.add(__ + '-textbox-left');
      } else {
        $textbox.classList.remove(__ + '-textbox-left');
        $textbox.classList.add(__ + '-textbox-right');
      }
    }

    async say(mood, ...args) {
      if (WRITING || CHOOSING) {
        console.error(
          'Message from ' + (this?.id ?? '[print]') + ' was ignored because the previous ' +
          'task was not finished. Check if you placed "await"s correctly.'
        );
        console.error('Message:', args);
        return;
      }
      WRITING = true;
      $dialogs.style.pointerEvents = 'all';
      $choices.style.pointerEvents = 'none';
      const messages = [];
      for (const arg of args) {
        if (Array.isArray(arg)) {
          messages.push(...arg);
        } else {
          messages.push(arg);
        }
      }
      if (this) {
        $textbox.classList.remove(__ + '-textbox-printed');
        await this.show(mood);
      } else {
        const textboxHidden = $textbox.classList.contains(__ + '-textbox-hidden');
        const delayNeeded = textboxHidden || !!shownCharacter;
        shownCharacter?.hide();
        $msgRendered.innerText = '';
        $msgPlaceholder.innerText = '';
        $textbox.classList.remove(__ + '-textbox-left');
        $textbox.classList.remove(__ + '-textbox-right');
        $textbox.classList.add(__ + '-textbox-printed');
        if (textboxHidden) {
          $textbox.classList.remove(__ + '-textbox-hidden');
        }
        if (delayNeeded) {
          await sleep(DELAYS.BEFORE_FIRST_PRINT);
        }
      }
      for (let i = 0; i < messages.length; i++) {
        if (typeof messages[i] !== 'string') { continue }
        let auto = false;
        let autoWaitTime = 0;
        let stepTime = STEP_TIME;
        let directives = [];
        if (typeof messages[i + 1] === 'number') {
          auto = true;
          autoWaitTime = messages[i + 1];
        }
        let str = messages[i];
        if (str[0] === '[') {
          const index = str.indexOf(']');
          directives = str.slice(1, index).split('');
          str = str.slice(index + 1);
        }
        if (directives.includes('~')) {
          stepTime = stepTime * 2;
        }
        if (stepTime > 0) {
          await write(str, stepTime, directives.includes('+'));
        } else {
          if (directives.includes('+')) {
            $msgRendered.innerText += str;
          } else {
            $msgRendered.innerText = str;
          }
        }

        if (directives.includes('+')) {
          history.pop();
        }
        history.push({
          id: this?.id ?? '[print]',
          label: this?.label ?? '[print]',
          text: $msgRendered.innerText
        });
        if (history.length > 100) {
          history.shift();
        }

        if (auto) {
          $msgRendered.classList.add(__ + '-message-rendered-writing');
        } else {
          $msgRendered.classList.add(__ + '-message-rendered-stopped');
        }
        await new Promise((resolve) => {
          dialogsCallback = () => {
            $msgRendered.classList.remove(__ + '-message-rendered-writing');
            $msgRendered.classList.remove(__ + '-message-rendered-stopped');
            resolve();
          };
          (async () => {
            // Give the player time to release the fast forward button.
            if (FAST_FORWARD) {
              await sleep(DELAYS.BEFORE_FAST_FORWARD);
            }
            if (FAST_FORWARD) {
              onDialogsClick(true);
            } else if (auto) {
              await sleep(autoWaitTime);
              onDialogsClick(true);
            } else if (pressed[' ']) {
              await sleep(DELAYS.BEFORE_IDLE_PROCEED);
              onDialogsClick(true);
            } else {
              WAITING_FOR_ACTION = true;
              stdCallbacks.onStop?.();
            }
          })();
        });
      }
      WRITING = false;
    }
  }
  // #endregion

  // #region select
  async function select(...args) {
    log('📋', args.map(str => translate(str)));
    if (WRITING || CHOOSING) {
      console.error(
        'Cannot show selectable options because the previous ' +
        'task was not finished. Check if you placed "await"s correctly.'
      );
      console.error('Options:', args);
      return;
    }
    CHOOSING = true;
    WAITING_FOR_ACTION = true;
    $choices.style.pointerEvents = 'all';
    $select.replaceChildren(...args.map((str) => {
      const $option = div(__ + '-select-option');
      $option.innerText = translate(str);
      return $option;
    }));
    $select.classList.remove(__ + '-select-hidden');
    stdCallbacks.onShowOptions?.();
    await sleep(DELAYS.BEFORE_SELECT_ACTIVE);
    return new Promise((resolve) => {
      choicesCallback = resolve;
    });
  }
  // #endregion

  // #region utils
  const elem = (tag, ...classes) => {
    const el = document.createElement(tag);
    el.classList.add(...classes);
    return el;
  };
  const div = elem.bind(null, 'div');
  const span = elem.bind(null, 'span');

  function doubleRAF(cb) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          await cb();
          resolve();
        });
      });
    });
  }

  function call(sceneId, ...args) {
    if (!Object.hasOwn(scenes, sceneId)) {
      console.error('Trying to call unknown scene:', sceneId);
      return;
    }
    if (callStackSize > 99) {
      console.error(`Scene "${sceneId}" cannot be called: stack size limit reached (${callStackSize}).`);
      return;
    }
    callStackSize += 1;
    log('💬', sceneId);
    return (async () => {
      stdCallbacks.onSceneEnter?.(sceneId, false);
      const result = await scenes[sceneId].cb(charactersProxy, ...args);
      stdCallbacks.onSceneLeave?.(sceneId, false);
      callStackSize -= 1;
      if (!callStackSize) {
        log('⛰️', currentScene?.id, '↩');
      }
      return result;
    })();
  }

  function print(...args) {
    return Character.prototype.say.call(null, null, ...args);
  }

  function clear() {
    return shownCharacter?.hide();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function translate(str) {
    if (LANGUAGE !== -1 && typeof str === 'string') {
      const arr = str.split(SPLIT_REGEX);
      if (LANGUAGE < arr.length) {
        return arr[LANGUAGE];
      }
      return arr[0];
    }
    return str;
  }

  function templateToString(strings, ...values) {
    let result = '';
    for (let i = 0; i < strings.length; i++) {
      result += strings[i];
      if (i < strings.length - 1) {
        result += `${values[i]}`;
      }
    }
    return result;
  }

  function write(str, stepTime, keepPrevious) {
    str = translate(str);
    if (!keepPrevious) {
      $msgRendered.innerText = '';
      $msgPlaceholder.innerText = str;
    }
    return new Promise((resolve) => {
      const writeChar = (i) => {
        if (FAST_FORWARD) {
          $msgRendered.innerText += str.slice(i);
          if (!keepPrevious) {
            $msgPlaceholder.innerText = '';
          }
          resolve();
        } else {
          if (i < str.length) {
            setTimeout(() => {
              $msgRendered.innerText += str[i];
              if (!keepPrevious) {
                $msgPlaceholder.innerText = str.slice(i + 1);
              }
              stdCallbacks.onType?.(str[i]);
              writeChar(i + 1);
            }, stepTime / (str[i] === ' ' ? 2 : 1));
          } else {
            resolve();
          }
        }
      };
      writeChar(0);
    });
  }

  function log(...args) {
    if (DEV_MODE) {
      console.log(...args.map(arg => arg === storeProxy ? store : arg));
    }
  }
  // #endregion

  // #region keyboard
  const onKeyDown = ({ key }) => {
    if (!pressed[key]) {
      pressed[key] = true;
      switch (key) {
        case ' ':
          onDialogsClick();
          break;
        case 'Control':
          onDialogsClick();
          FAST_FORWARD = true;
          break;
      }
    }
  };

  const onKeyUp = ({ key }) => {
    delete pressed[key];
    switch (key) {
      case 'Control':
        FAST_FORWARD = false;
        break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  // #endregion

  // #region init
  novel = new Novel(novelTag, params);

  return {

    event(str, ...args) {
      novel.notify(str, ...args);
    },

    getHistory() {
      return history;
    },

    clearAutosave() {
      novel.clearSaveSlot('autosave');
    },

    // For testing only. This can easily break the game logic.
    jumpTo(sceneId) {
      currentScene = { id: sceneId };
      novel.saveState('autosave');
      window.location.reload();
    },

    // Persistent storage wrapped in a proxy object.
    $: storeProxy,

    // A utility function that returns a promise that resolves after
    // a specified number of milliseconds. Can be useful in callbacks.
    sleep,

    // Alias for console.log that will be silent when not in development mode,
    // and also unwraps the storage object ($) for cleaner view.
    log,

    remove() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      $container.remove();
    }

  };
  // #endregion

};
