/*! NovelWrapper v0.4.6 | (c) 2025 uteal | MIT License */

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
 * @param {string} params.watchedAttr The engine will track elements with this attribute, listen to their events and apply CSS classes.
 * @param {string} params.imagesPath Path to the folder with portraits of the novel's characters.
 * @param {string} params.imagesType File extension of the novel's character portraits. Default is "png".
 * @param {(string|null)} params.firstScene Entry point of the novel, defaults to "start". Set to null to prevent the game from starting automatically.
 * @param {string} params.restoreFromSlot The game tries to load from the specified slot, "autosave" by default.
 * @param {boolean} params.startOver Should the game ignore the save data and start over?
 * @param {boolean} params.noReadWrite Do not read or write the game state. Default is false.
 * @param {boolean} params.noKeyboard Ignore keyboard controls. Default is false.
 * @param {boolean} params.useLocationHash If true, the game will store its state as the hash property of the window location object.
 * @param {(string|HTMLElement)} params.appendTo Where the novel element should be placed. Defaults to document.body.
 * @param {object} params.implementations An object with functions that will override certain engine methods. They run in the context of this object.
 * @param {object} params.delays Engine animation delays, for deep customization. See the engine file for a list of them.
 * @param {('left'|'right')} params.defaultAlign Starting alignment of each character. Default is "right".
 * @param {RegExp} params.multiLangSplitRegex Delimiter of multilingual strings. /\s+>>\s+/ by default.
 * @param {number} params.language Which part of the split multilingual string should be shown. Default: -1 (i.e. no translation).
 * @preserve
 */
export default (novelTag, factories, {
  $: initialState                  = {},
  ext: externalData                = {},
  callbacks                        = [],
  devMode: DEV_MODE                = true,
  stepTime: STEP_TIME              = 1000 / 60,
  cssPrefix: __                    = 'novel',
  watchedAttr                      = undefined,
  imagesPath                       = './images/',
  imagesType                       = 'png',
  firstScene                       = 'start',
  restoreFromSlot                  = 'autosave',
  startOver                        = false,
  noReadWrite                      = false,
  noKeyboard                       = false,
  useLocationHash                  = false,
  appendTo                         = document.body,
  implementations                  = {},
  delays                           = {},
  defaultAlign: DEFAULT_ALIGN      = 'right',
  multiLangSplitRegex: SPLIT_REGEX = /\s+>>\s+/,
  language: LANGUAGE               = -1
} = {}) => {

  if (!factories || (Array.isArray(factories) && !factories.length)) {
    throw new Error('You should provide at least one scene factory function.');
  }

  const VERSION_NAME = 'Sasuke';

  const isTouchDevice = matchMedia('(pointer: coarse)').matches;

  const imagesBasePath = imagesPath + (imagesPath.endsWith('/') ? '' : '/');
  const imagesExtension = imagesType.toLowerCase();

  let GAME_READY = false;
  let onGameReady;
  let GAME_ENDED = false;
  const ABORT_SIGNAL = 'AbortSignal';

  const descriptor = {};

  const ASSERT_RELEVANCE = () => {
    if (GAME_ENDED) {
      throw ABORT_SIGNAL;
    }
  };

  const state = {};
  const scenes = {};
  const characters = {};
  const history = [];
  const pressed = {};

  let novel;
  let currentScene;
  let shownCharacter;
  let watchersCallback;
  let dialogsCallback;
  let choicesCallback;
  let lastReject;
  let callStackSize = 0;

  let TALKING = false;
  let CHOOSING = false;
  let WAITING_FOR_ACTION = false;
  let SCRIPT_FLOW_ENDED = true;
  // let PRINTING = false;
  let FAST_PRINTING = false;
  let SKIP_PRINTING = false;

  let $container;
  let $dialogs;
  let $choices;
  let $textbox;
  let $message;
  let $msgRendered;
  let $msgPlaceholder;
  let $select;

  const DELAYS = {
    CHARACTER_SHOW       : 350,
    CHARACTER_HIDE       : 350,
    CHARACTER_MOOD_CHANGE: 100,
    BEFORE_SELECT_ACTIVE : 350,
    AFTER_OPTION_CLICK   : 250,
    BEFORE_FIRST_PRINT   : 500,
    BEFORE_SKIP_PRINTING : 200,
    BEFORE_IDLE_PROCEED  : 500
  };

  // #region CALLBACKS
  const CALLBACKS = {

    /**
     * Fires when the game starts.
     * @param {object} handle Novel descriptor.
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
     * @param {HTMLElement} elem The printed character's element.
     * @param {string} tag The corresponding tag, if any.
     * @param {number} stepTime Current step time, zero if skipping.
     * @param {boolean} isOption Whether the printed text is option text.
     * @returns {(undefined|number|[number, number])} Additional print time: before/after if array, evenly distributed if number.
     */
    onBeforeType: null,

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
     * Fires when a field is set in the game data object ($).
     * Note: Changes to nested structures are not tracked.
     * @param {any} name Property name.
     * @param {any} value Property value.
     */
    onStateChange: null,

    /**
     * Fires when the game is ended.
     * @param {any} result The value that ended the game.
     */
    onGameEnd: null

  };
  // #endregion

  // #region IMPLEMENTED
  const IMPLEMENTED = {

    getCharacterPortraitPath(id, mood) {
      return `${imagesBasePath}${id}/${mood}.${imagesExtension}`;
    },

    createKey(novelTag, slotName) {
      return `${novelTag}(${slotName})`;
    },

    writeState(key, clonedState) {
      // log('💾', key, clonedState);
      if (useLocationHash) {
        let store = {};
        try { store = JSON.parse(decodeURIComponent(window.location.hash).slice(1)) } catch (e) { }
        store[key] = clonedState;
        window.history.pushState(undefined, undefined, '#' + JSON.stringify(store));
      } else {
        localStorage.setItem(key, JSON.stringify(clonedState));
      }
    },

    readState(key) {
      log('↻', key);
      if (useLocationHash) {
        let store = {};
        try { store = JSON.parse(decodeURIComponent(window.location.hash).slice(1)) } catch (e) { }
        return store[key];
      } else {
        let value;
        try { value = JSON.parse(localStorage.getItem(key)) } catch (e) { }
        return value;
      }
    },

    clearSavedState(key) {
      log('🗑️', key);
      if (useLocationHash) {
        let store = {};
        try { store = JSON.parse(decodeURIComponent(window.location.hash).slice(1)) } catch (e) { }
        delete store[key];
        window.history.replaceState(undefined, undefined, '#' + JSON.stringify(store));
      } else {
        localStorage.removeItem(key);
      }
    },

    onUserNavigates() {
      if (useLocationHash) {
        window.history.go(0);
      }
    }
    
  };
  // #endregion

  const stateProxy = new Proxy(state, {
    set(target, prop, value) {
      target.$[prop] = value;
      CALLBACKS.onStateChange?.(prop, value);
      return true;
    },
    get(target, prop) {
      return target.$[prop];
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
    if (!GAME_ENDED && (WAITING_FOR_ACTION || force) && dialogsCallback) {
      WAITING_FOR_ACTION = false;
      const resolve = dialogsCallback;
      dialogsCallback = null;
      resolve();
    }
  };

  const onSelectClick = async ({ target }) => {
    if (!GAME_ENDED && WAITING_FOR_ACTION && choicesCallback && target?.classList.contains(__ + '-select-option')) {
      WAITING_FOR_ACTION = false;
      CALLBACKS.onOptionClick?.();
      const value = target.getAttribute('select-option-value') ??
        [...$select.querySelectorAll('.' + __ + '-select-option')].findIndex(el => target === el);
      $select.classList.add(__ + '-select-hidden');
      const resolve = choicesCallback;
      choicesCallback = null;
      log('👉', target.innerText);
      await sleep(DELAYS.AFTER_OPTION_CLICK);
      CHOOSING = false;
      resolve(value);
    }
  };

  // #region Novel
  class Novel {

    constructor() {
      Object.assign(DELAYS, delays);

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

      $dialogs.addEventListener(isTouchDevice ? 'touchend' : 'click', () => onDialogsClick());
      $select.addEventListener(isTouchDevice ? 'touchend' : 'click', event => onSelectClick(event));

      if (!Array.isArray(callbacks)) {
        callbacks = [callbacks];
      }
      if (watchedAttr) {
        callbacks.push(getWatchedElementsCallbacks());
      }
      this.setCallbacks(callbacks);

      for (const [key, val] of Object.entries(implementations)) {
        if (Object.hasOwn(IMPLEMENTED, key)) {
          IMPLEMENTED[key] = val;
        } else {
          console.error(`Unknown name for implementation given: "${key}".`);
        }
      }

      this.getScenes();

      if (typeof appendTo === 'string') {
        appendTo = document.querySelector(appendTo);
      }
      appendTo.append($container);

      const restored = !startOver && this.loadState(restoreFromSlot);
      if (restored && restored.version === VERSION_NAME) {
        Object.assign(state, restored);
      } else {
        log('🎬', novelTag);
        Object.assign(state, this.createNewState());
        Object.assign(state.$, initialState);
      }
      log('📦', structuredClone(state));
      // To make it safe to use the novel handle inside standard callbacks.
      doubleRAF(() => {
        GAME_READY = true;
        if (state.scene) {
          this.runScene(state.scene, state.args, false);
        }
        CALLBACKS.onGameStart?.(descriptor);
        onGameReady?.(descriptor);
      });
    }

    setCallbacks(arr) {
      const acc = Object.fromEntries(Object.keys(CALLBACKS).map(key => [key, []]));
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
          CALLBACKS[name] = list.length === 1
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
            $: stateProxy,
            watch,
            select,
            call,
            print,
            clear,
            sleep,
            save: this.saveState,
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

    saveState(slotName = 'autosave') {
      ASSERT_RELEVANCE();
      if (noReadWrite) {
        return;
      }
      const key = IMPLEMENTED.createKey?.(novelTag, slotName);
      return IMPLEMENTED.writeState?.(key, structuredClone(state));
    }

    loadState(slotName) {
      ASSERT_RELEVANCE();
      if (noReadWrite) {
        return;
      }
      const key = IMPLEMENTED.createKey?.(novelTag, slotName);
      return IMPLEMENTED.readState?.(key);
    }

    clearSaveSlot(slotName) {
      ASSERT_RELEVANCE();
      if (noReadWrite) {
        return;
      }
      const key = IMPLEMENTED.createKey?.(novelTag, slotName);
      return IMPLEMENTED.clearSavedState?.(key);
    }

    createNewState() {
      return {
        scene: firstScene,
        args: [],
        $: {},
        characters: {},
        version: VERSION_NAME
      };
    }

    async runScene(id, args = [], autosave = true) {
      ASSERT_RELEVANCE();
      if (args.length) {
        log('⛰️', id, args);
      } else {
        log('⛰️', id);
      }
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
      state.scene = id;
      state.args = structuredClone(args);
      if (autosave) {
        this.saveState('autosave');
      }
      CALLBACKS.onSceneEnter?.(id, true);
      let result;
      try {
        result = structuredClone(await currentScene.run(...structuredClone(args)));
      } catch (e) {
        if (e === ABORT_SIGNAL) {
          log('✋', 'The game was manually interrupted.');
          log('🪂', 'Emergency exiting.');
          return;
        } else {
          throw e;
        }
      }
      CALLBACKS.onSceneLeave?.(id, true);
      if (typeof result === 'string') {
        setTimeout(() => this.runScene(result));
      } else if (Array.isArray(result) && typeof result[0] === 'string') {
        setTimeout(() => this.runScene(result[0], result.slice(1)));
      } else if (result !== undefined) {
        log('🏁', 'Game ended.');
        CALLBACKS.onGameEnd?.(result);
      }
    }

    async notify(event, ...args) {
      ASSERT_RELEVANCE();
      log('⚡', event);
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
      if (!watcher.cb) {
        log('🍋', 'Callback not set.');
        return;
      }
      if (watcher) {
        SCRIPT_FLOW_ENDED = false;
        CALLBACKS.onEventEnter?.(event, ...args);
        let result;
        try {
          result = structuredClone(await watcher.cb(...args));
        } catch (e) {
          if (e === ABORT_SIGNAL) {
            log('✋', 'The game was manually interrupted.');
            log('🪂', 'Emergency exiting.');
            return;
          } else {
            throw e;
          }
        }
        CALLBACKS.onEventLeave?.(event, result);
        if (typeof result === 'string' || (Array.isArray(result) && typeof result[0] === 'string')) {
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

    async run(...args) {
      let result = await this.cb(charactersProxy, ...args);
      if (result === undefined) {
        SCRIPT_FLOW_ENDED = true;
        shownCharacter?.hide();
        $choices.style.pointerEvents = 'none';
        $dialogs.style.pointerEvents = 'none';
        $container.style.pointerEvents = 'none';
        if (this.watchers.length) {
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
        CALLBACKS.onWatcherRemove?.(event);
        log('🧹', event);
      }
    }

    end() {
      this.watchers.forEach(({ event }) => {
        CALLBACKS.onWatcherRemove?.(event);
      });
      this.watchers = [];
    }
  }
  // #endregion

  function watch(event, cb) {
    ASSERT_RELEVANCE();
    if (currentScene.watchers.some(obj => obj.event === event)) {
      console.error(`Multiple watchers of the same event (${event}) not allowed at scene (${currentScene.id})`);
      return;
    }
    log('📌', event);
    currentScene.watchers.push({ event, cb });
    CALLBACKS.onWatcherCreate?.(event);
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
          state.characters[id].align = 'left';
          return this.proxy_;
        },
        $toRight: () => {
          this.setAlign('right');
          state.characters[id].align = 'right';
          return this.proxy_;
        },
        $setLabel: (str) => {
          this.setLabel(str);
          state.characters[id].label = str;
          return this.proxy_;
        },
        $flipImage: () => {
          this.setFlip(!this.flipped);
          state.characters[id].flipped = this.flipped;
          return this.proxy_;
        },
        then: () => {
          console.error(
            `Seemingly useless "await" before ${this.id}'s handle. This error may be caused by:\n` +
            '1. Erroneous usage of "await" with syncronous methods like "$toLeft", "$toRight", "$setLabel".\n' +
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
          if (prop === 'then') {
            return async (resolve, reject) => {
              const args = this.queue;
              this.queue = [];
              await this.say(nextMood, ...args).catch(reject);
              nextMood = 'normal';
              resolve();
            };
          } else {
            console.error(`Once the call chain has started, property getting is not allowed. Requested property: "${prop}".`);
          }
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

      if (Object.hasOwn(state.characters, id)) {
        const data = state.characters[id];
        this.setLabel(data.label);
        this.setAlign(data.align);
        this.setFlip(data.flipped);
        log('↻', data);
      } else {
        state.characters[id] = {};
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

    setAlign(align = DEFAULT_ALIGN) {
      if (align !== this.align) {
        this.$el.classList.remove(__ + '-character-align-' + this.align);
        this.$el.classList.add(__ + '-character-align-' + align);
        this.align = align;
        if (this.visible) {
          this.updateTextboxAlign();
        }
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
          let source = IMPLEMENTED.getCharacterPortraitPath(this.id, mood);
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
        $msgRendered.replaceChildren();
        $msgPlaceholder.innerText = '';
        $dialogs.append(this.$el);
        // Cancel the cleanup task if any.
        clearTimeout(this.timeout);
        CALLBACKS.onShow?.(this.id);
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
      if (!this) {
        await doubleRAF(() => {
          if (!TALKING) {
            $textbox.classList.add(__ + '-textbox-hidden');
          }
        });
      } else if (this.visible) {
        this.visible = false;
        shownCharacter = undefined;
        this.$el.classList.remove(__ + '-character-mood-' + this.mood);
        this.$el.classList.add(__ + '-character-inactive');
        this.$label.classList.add(__ + '-label-hidden');
        for (const $elem of this.$portraits.children) {
          $elem.classList.add(__ + '-portrait-hidden');
        }
        await doubleRAF(() => {
          if (!TALKING) {
            $textbox.classList.add(__ + '-textbox-hidden');
          }
        });
        CALLBACKS.onHide?.(this.id);
        // For optimization purposes.
        this.timeout = setTimeout(() => this.$el.remove(), 5000);
        await sleep(DELAYS.CHARACTER_HIDE);
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
      ASSERT_RELEVANCE();
      if (TALKING || CHOOSING) {
        console.error(
          'Message from ' + (this?.id ?? '[print]') + ' was ignored because the previous ' +
          'task was not finished. Check if you placed "await"s correctly.'
        );
        console.error('Message:', args);
        return;
      }
      TALKING = true;
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
        $msgRendered.replaceChildren();
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
        if (typeof messages[i] !== 'string') continue;
        let auto = false;
        let autoWaitTime = 0;
        let stepTime = STEP_TIME;
        let directives = [];
        if (typeof messages[i + 1] === 'number') {
          auto = true;
          autoWaitTime = messages[i + 1];
        }
        let [str, pauses] = stripPauses(translate(messages[i]));
        if (str[0] === '[') {
          const index = str.indexOf(']');
          if (index !== -1) {
            const firstTagIndex = str.indexOf('::');
            if (firstTagIndex === -1 || firstTagIndex > index) {
              directives = str.slice(1, index).split('');
              pauses = pauses.slice(index + 1);
              str = str.slice(index + 1);
            }
          }
        }
        if (directives.includes('!')) {
          stepTime = 0;
        }
        if (directives.includes('~')) {
          stepTime = stepTime * 2;
        }

        await renderText(...parseStringWithTags(str, pauses), stepTime, directives.includes('+'));

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
        
        let resolve;
        const promise = new Promise((res, rej) => {
          resolve = res;
          lastReject = rej;
        });

        const nextPlayerAction = () => {
          WAITING_FOR_ACTION = true;
          CALLBACKS.onStop?.();
          return promise;
        };

        dialogsCallback = () => {
          $msgRendered.classList.remove(__ + '-message-rendered-writing');
          $msgRendered.classList.remove(__ + '-message-rendered-stopped');
          resolve();
        };

        if (SKIP_PRINTING) {
          await sleep(DELAYS.BEFORE_SKIP_PRINTING);
        }

        if (SKIP_PRINTING) {
          onDialogsClick(true);
        } else if (auto) {
          await sleep(autoWaitTime);
          onDialogsClick(true);
        } else if (pressed[' ']) {
          await sleep(DELAYS.BEFORE_IDLE_PROCEED);
          if (pressed[' ']) {
            onDialogsClick(true);
          } else {
            await nextPlayerAction();
          }
        } else {
          await nextPlayerAction();
        }
      }
      TALKING = false;
    }
  }
  // #endregion

  // #region select
  async function select(...args) {
    ASSERT_RELEVANCE();
    log('📋', args);
    if (TALKING || CHOOSING) {
      console.error(
        'Cannot show selectable options because the previous ' +
        'task was not finished. Check if you placed "await"s correctly.'
      );
      console.error('Options:', args);
      return;
    }
    args = args.filter(arg => typeof arg === 'string' || arg instanceof Object);
    if (!args.length) {
      return;
    }
    CHOOSING = true;
    WAITING_FOR_ACTION = true;
    $choices.style.pointerEvents = 'all';
    $select.replaceChildren(...args.map((opt) => {
      const $option = div(__ + '-select-option');
      if (typeof opt !== 'string') {
        const pair = Object.entries(opt)[0];
        $option.setAttribute('select-option-value', pair[0]);
        opt = pair[1];
      }
      const [str, tags] = parseStringWithTags(...stripPauses(translate(opt)));
      const charNodes = toCharNodes(str);
      for (let i = 0; i < charNodes.length; i++) {
        CALLBACKS.onBeforeType?.(str[i], charNodes[i], tags[i], 0, true);
      }
      $option.replaceChildren(...charNodes);
      return $option;
    }));
    $select.classList.remove(__ + '-select-hidden');
    CALLBACKS.onShowOptions?.();
    await sleep(DELAYS.BEFORE_SELECT_ACTIVE);
    return new Promise((resolve, reject) => {
      lastReject = reject;
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

  function getWatchedElementsCallbacks() {
    const elems = [];
    return {
      onWatcherCreate(eventName) {
        document.querySelectorAll(`[${watchedAttr}="${eventName}"]`).forEach((el) => {
          el.classList.add(__ + '-watched');
          el.addEventListener(isTouchDevice ? 'touchend' : 'click', onWatchedElementClick);
          elems.push(el);
        });
      },
      onWatcherRemove(eventName) {
        for (let i = elems.length - 1; i >= 0; i--) {
          const el = elems[i];
          if (el.getAttribute(watchedAttr) === eventName) {
            el.classList.remove(__ + '-watched');
            el.removeEventListener(isTouchDevice ? 'touchend' : 'click', onWatchedElementClick);
            elems.splice(i, 1);
          }
        }
      },
      onEventEnter(eventName) {
        elems.forEach((el) => {
          if (el.getAttribute(watchedAttr) === eventName) {
            el.classList.add(__ + '-watched-clicked');
          } else {
            el.classList.add(__ + '-watched-clicked-other');
          }
        });
      },
      onEventLeave() {
        elems.forEach((el) => {
          el.classList.remove(__ + '-watched-clicked');
          el.classList.remove(__ + '-watched-clicked-other');
        });
      }
    };
  }

  function onWatchedElementClick() {
    novel.notify(this.getAttribute(watchedAttr));
  }

  function removeListeners() {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('popstate', onPopState);
    if (watchedAttr) {
      document.querySelectorAll(`[${watchedAttr}]`).forEach((el) => {
        el.removeEventListener(isTouchDevice ? 'touchend' : 'click', onWatchedElementClick);
        el.classList.remove(__ + '-watched');
        el.classList.remove(__ + '-watched-clicked');
        el.classList.remove(__ + '-watched-clicked-other');
      });
    }
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
    if (args.length) {
      log('💬', sceneId, args);
    } else {
      log('💬', sceneId);
    }
    return (async () => {
      CALLBACKS.onSceneEnter?.(sceneId, false);
      const result = await scenes[sceneId].cb(charactersProxy, ...args);
      CALLBACKS.onSceneLeave?.(sceneId, false);
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
    if (shownCharacter) {
      return shownCharacter.hide();
    } else {
      return Character.prototype.hide.call(null);
    }
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      lastReject = reject;
      setTimeout(resolve, ms);
    });
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

  function renderText(str, tags, pauses, stepTime, keepPrevious) {
    if (!keepPrevious) {
      $msgRendered.replaceChildren();
      $msgPlaceholder.innerText = str;
    }
    return new Promise((resolve) => {
      const printChar = (i) => {
        if (SKIP_PRINTING || stepTime === 0) {
          const charNodes = toCharNodes(str.slice(i));
          for (let j = 0; j < charNodes.length; j++) {
            CALLBACKS.onBeforeType?.(str[i + j], charNodes[j], tags[i + j], 0, false);
          }
          $msgRendered.append(...charNodes);
          if (!keepPrevious) {
            $msgPlaceholder.innerText = '';
          }
          resolve();
        } else {
          if (i < str.length) {
            const currentStepTime = FAST_PRINTING ? stepTime / 2 : stepTime;
            setTimeout(() => {
              const charNode = toCharNode(str[i]);
              const t = CALLBACKS.onBeforeType?.(str[i], charNode, tags[i], currentStepTime, false);
              if (!t) {
                $msgRendered.append(charNode);
                if (!keepPrevious) {
                  $msgPlaceholder.innerText = str.slice(i + 1);
                }
                printChar(i + 1);
              } else {
                let before = 0;
                let after = 0;
                if (typeof t === 'number') {
                  before = t / 2;
                  after = t / 2;
                } else if (Array.isArray(t)) {
                  before = t[0] ?? before;
                  after = t[1] ?? after;
                } else {
                  throw new Error('onBeforeType callback must return undefined, number or array');
                }
                setTimeout(() => {
                  $msgRendered.append(charNode);
                  if (!keepPrevious) {
                    $msgPlaceholder.innerText = str.slice(i + 1);
                  }
                  setTimeout(() => printChar(i + 1), after);
                }, before);
              }
            }, currentStepTime + pauses[i]);
          } else {
            resolve();
          }
        }
      };
      printChar(0);
    });
  }

  function toCharNode(char) {
    const span = document.createElement('span');
    span.style.pointerEvents = 'none';
    span.innerText = char;
    return span;
  }

  function toCharNodes(str) {
    const nodes = [];
    for (const char of str) {
      nodes.push(toCharNode(char));
    }
    return nodes;
  }

  function findNextTag(str, startIndex = 0) {
    if (!str.slice(startIndex).includes('::')) {
      return false;
    }
    const wordDelimiterRegex = /[!?.,;:\s"()\]]/;
    let prevOpeningBracketIndex = undefined;
    let prevWordDelimiterIndex = undefined;
    for (let i = startIndex; i < str.length; i++) {
      if (str[i] === '[') {
        prevOpeningBracketIndex = i;
      } else if (str[i] === ':' && str[i + 1] === ':') {
        for (let j = i + 2; j <= str.length; j++) {
          if (j === str.length || str[j] === ']' || (prevOpeningBracketIndex === undefined && wordDelimiterRegex.test(str[j]))) {
            const leftIndex = prevOpeningBracketIndex ?? prevWordDelimiterIndex;
            return [leftIndex !== undefined ? leftIndex + 1 : startIndex, i + 2, j];
          }
        }
      } else if (prevOpeningBracketIndex === undefined && wordDelimiterRegex.test(str[i])) {
        prevWordDelimiterIndex = i;
      }
    }
    return false;
  }
  
  function getTags(str) {
    const tags = [];
    let startFrom = 0;
    while (true) {
      const indices = findNextTag(str, startFrom);
      if (indices) {
        tags.push(indices);
        startFrom = indices[2] + 1;
      } else {
        return tags;
      }
    }
  }
  
  function parseStringWithTags(str, pauses = []) {
    const tags = getTags(str);
    if (!tags.length) {
      return [str, [], pauses];
    }
    const arr = str.split('');
    const arr_ = Array(str.length).fill(undefined);
    for (const [i, j, k] of tags) {
      const tag = str.slice(i, j - 2);
      for (let m = i; m < j; m++) {
        arr[m] = false;
        arr_[m] = false;
        firstZeroToFalse(pauses, m);
      }
      for (let n = j; n < k; n++) {
        arr_[n] = tag;
      }
    }
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === '[' || arr[i] === ']') {
        arr[i] = false;
        arr_[i] = false;
        firstZeroToFalse(pauses, i);
      }
    }
    return [
      arr.filter(v => v !== false).join(''),
      arr_.filter(v => v !== false),
      pauses.filter(v => v !== false)
    ];
  }

  function firstZeroToFalse(arr, startFrom) {
    for (let i = startFrom; i < arr.length; i++) {
      if (arr[i] === 0) {
        arr[i] = false;
        return;
      }
    }
  }

  function stripPauses(str) {
    const digits = '0123456789';
    const arr = str.split('');
    const arr_ = Array(str.length).fill(0);
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === '[') {
        let numStr = '';
        let j;
        for (j = i + 1; j < arr.length; j++) {
          if (arr[j] === ']') {
            break;
          }
          if (digits.includes(arr[j])) {
            numStr += arr[j];
          } else {
            numStr = '';
            break;
          }
        }
        if (numStr) {
          arr_[j + 1] = +numStr;
          for (let k = i; k <= j; k++) {
            arr[k] = false;
            arr_[k] = false;
          }
        }
        i = j;
      }
    }
    return [
      arr.filter(v => v !== false).join(''),
      arr_.filter(v => v !== false)
    ];
  }

  function log(...args) {
    if (DEV_MODE) {
      console.log(...args.map(arg => arg === stateProxy ? state.$ : arg));
    }
  }
  // #endregion

  // #region global listeners
  const onKeyDown = ({ key }) => {
    if (noKeyboard) {
      return;
    }
    if (!pressed[key]) {
      pressed[key] = true;
      switch (key) {
        case ' ':
          FAST_PRINTING = true;
          onDialogsClick();
          break;
        case 'Control':
          onDialogsClick();
          SKIP_PRINTING = true;
          break;
      }
    }
  };

  const onKeyUp = ({ key }) => {
    if (noKeyboard) {
      return;
    }
    delete pressed[key];
    switch (key) {
      case ' ':
        FAST_PRINTING = false;
        break;
      case 'Control':
        SKIP_PRINTING = false;
        break;
    }
  };

  const onPopState = (_event) => {
    IMPLEMENTED.onUserNavigates?.();
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('popstate', onPopState);
  // #endregion

  // #region init
  novel = new Novel();

  Object.assign(descriptor, {

    event: (str, ...args) => {
      if (!GAME_READY) {
        console.error('Game is not ready. Use "await createNovel(...).promise" for proper timing.');
        return;
      }
      novel.notify(str, ...args);
    },

    runScene: (id, ...args) => {
      if (!GAME_READY) {
        console.error('Game is not ready. Use "await createNovel(...).promise" for proper timing.');
        return;
      }
      if (!SCRIPT_FLOW_ENDED) {
        console.error(`Manual scene run failed: script flow not ended. (Scene: "${id}")`);
        return;
      }
      novel.runScene(id, args);
    },

    $: stateProxy,

    getHistory: () => history,

    clearSaveSlot: (slotName = 'autosave') => {
      return novel.clearSaveSlot(slotName);
    },

    remove: () => {
      if (!GAME_READY) {
        console.error('Game is not ready. Use "await createNovel(...).promise" for proper timing.');
        return;
      }
      GAME_ENDED = true;
      removeListeners();
      $container.remove();
      for (const key of Object.keys(CALLBACKS)) {
        CALLBACKS[key] = null;
      }
      for (const key of Object.keys(IMPLEMENTED)) {
        IMPLEMENTED[key] = null;
      }
      lastReject?.(ABORT_SIGNAL);
    },

    // A utility function that returns a promise that resolves after
    // a specified number of milliseconds. Can be useful in callbacks.
    // Automatically rejected if the game is forced to end.
    sleep,

    // Alias for console.log that will be silent when not in development mode,
    // and also unwraps the game state object ($) for better view.
    log,

    promise: new Promise((resolve) => { onGameReady = resolve; })

  });
  // #endregion

  return descriptor;

};
