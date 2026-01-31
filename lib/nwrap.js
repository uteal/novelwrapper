/*! NovelWrapper v0.5.3 | (c) 2026 uteal | MIT License */

/**
 * Makes a new novel from the scenes given. Returns a handle with a set of useful methods.
 * @param {string} novelTag A novel-specific name used when saving or restoring a game state.
 * @param {(function|function[])} factories A function or array of functions that return dictionaries of novel scenes.
 * @param {object} params Initial params.
 * @param {object} params.$ Initial game state. Should be JSON-serializable. Empty object by default.
 * @param {object} params.ext A helper object for passing custom functions or data to scenes.
 * @param {(object|object[])} params.callbacks Callbacks for standard events in form of object or array of objects.
 * @param {boolean} params.devMode Allows the engine to output logs. Essential during development.
 * @param {string} params.cssPrefix Engine will use this when searching for CSS styles. Default is "novel".
 * @param {string} params.watchedAttr The engine will track elements with this attribute, listen to their events and apply CSS classes.
 * @param {string} params.imagesPath Path to the folder with portraits of the novel's characters.
 * @param {string} params.imagesType File extension of the novel's character portraits. Default is "png".
 * @param {(string|null)} params.firstScene Entry point of the novel, defaults to "start". Set to null to prevent the game from starting automatically.
 * @param {string} params.restoreFromSlot The game tries to load from the specified slot, "autosave" by default.
 * @param {boolean} params.startOver Should the game ignore the save data and start over?
 * @param {boolean} params.noSaveLoad Do not save or load the game state. Default is false.
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
  cssPrefix: __                    = 'novel',
  watchedAttr                      = undefined,
  imagesPath                       = './images/',
  imagesType                       = 'png',
  firstScene                       = 'start',
  restoreFromSlot                  = 'autosave',
  startOver                        = false,
  noSaveLoad                       = false,
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

  const VERSION_NAME = 'Hinata';

  const isTouchDevice = matchMedia('(pointer: coarse)').matches;
  const pointerEventType = isTouchDevice ? 'touchend' : 'click';

  const imagesBasePath = imagesPath + (imagesPath.endsWith('/') ? '' : '/');
  const imagesExtension = imagesType.toLowerCase();

  const maxPassageCount = 50;
  const pageLinkAttr = 'nw-page-link';

  let GAME_ENDED = false;
  let onGameReady;
  const gameReadyPromise = new Promise((resolve) => { onGameReady = resolve; });
  const ABORT_SIGNAL = 'AbortSignal';

  const ASSERT_RELEVANCE = () => {
    if (GAME_ENDED) {
      throw ABORT_SIGNAL;
    }
  };

  const descriptor = {};
  const lastChoice = new Map();

  const state = {};
  const scenes = {};
  const characters = {};
  const history = [];
  const pressed = {};

  let novel;
  let currentScene;
  let shownCharacter;
  let watchersCallback;
  let storiesCallback;
  let dialogsCallback;
  let choicesCallback;
  let lastReject;
  let callStackSize = 0;

  let WRITING = false;
  let SPEAKING = false;
  let CHOOSING = false;
  let WAITING_FOR_ACTION = false;
  let SCRIPT_FLOW_ENDED = true;
  let SKIP_TEXT_ANIMATION = false;

  let $container;
  let $stories;
  let $dialogs;
  let $choices;
  let $page;
  let $textbox;
  let $messages;
  let $select;

  const DELAYS = {
    CHARACTER_SHOW       : 350,
    CHARACTER_HIDE       : 350,
    CHARACTER_MOOD_CHANGE: 100,
    BEFORE_SELECT_ACTIVE : 350,
    BEFORE_DIALOGS_ACTIVE: 250,
    BEFORE_STORIES_ACTIVE: 250,
    AFTER_OPTION_CLICK   : 250,
    BEFORE_FIRST_NOTE    : 500,
    BEFORE_IDLE_PROCEED  : 400,
    PAGE_SHOW            : 500,
    PAGE_HIDE            : 500
  };

  // #region CALLBACKS
  const CALLBACKS = {

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
     * Fires when the textbox is waiting for player's action.
     */
    onStopTyping: null,

    /**
     * Fires every time a tagged part of text is processed.
     * @param {HTMLElement} elem The tagged part's element.
     * @param {Array<string>} tags The corresponding tags.
     */
    onTaggedPart: null,

    /**
     * Fires every time a next chunk of text is rendered.
     * @param {boolean} isStoryText Whether the displayed text is part of the story.
     */
    onRenderFragments: null,

    /**
     * Fires when the page is waiting for player's action.
     */
    onStopWriting: null,

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

  // #region Proxies
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

  const onStoriesClick = (event, force = false) => {
    if (!GAME_ENDED) {
      if (storiesCallback) {
        if (WAITING_FOR_ACTION || force) {
          WAITING_FOR_ACTION = false;
          const resolve = storiesCallback;
          storiesCallback = null;
          resolve();
        }
      } else if (event?.target.hasAttribute(pageLinkAttr)) {
        // $stories.style.pointerEvents = 'none';
        const tag = event.target.getAttribute(pageLinkAttr);
        if (tag[0] === '@') {
          novel.runScene(tag.slice(1));
        } else if (tag[0] === '&') {
          novel.notify(tag.slice(1));
        }
      }
    }
  };

  const onDialogsClick = (_event, force = false) => {
    if (!GAME_ENDED && (WAITING_FOR_ACTION || force) && dialogsCallback) {
      WAITING_FOR_ACTION = false;
      const resolve = dialogsCallback;
      dialogsCallback = null;
      resolve();
    }
  };

  const onSelectClick = async (event, optNum = undefined) => {
    if (GAME_ENDED || !WAITING_FOR_ACTION || !choicesCallback) {
      return;
    }
    let target;
    let targetIndex;
    if (typeof optNum === 'number') {
      targetIndex = optNum;
      target = $select.querySelectorAll('.' + __ + '-select-option')[optNum];
      if (!target) {
        return;
      }
    } else {
      target = event.target;
      if (!target?.classList.contains(__ + '-select-option')) {
        return;
      }
      targetIndex = [...$select.querySelectorAll('.' + __ + '-select-option')].findIndex(el => target === el);
    }
    WAITING_FOR_ACTION = false;
    CALLBACKS.onOptionClick?.();
    const value = target.getAttribute('select-option-value') ?? targetIndex;
    lastChoice.clear();
    lastChoice.set(String(value), true);
    lastChoice.set('__value__', value);
    $select.classList.add(__ + '-select-hidden');
    const resolve = choicesCallback;
    choicesCallback = null;
    log('👉', target.innerText.replaceAll('\n', ' '));
    await sleep(DELAYS.AFTER_OPTION_CLICK);
    CHOOSING = false;
    resolve(value);
  };

  // #region colors

  const black = (str) => '\x1b[30m' + str + '\x1b[0m';
  const red = (str) => '\x1b[31m' + str + '\x1b[0m';
  const green = (str) => '\x1b[32m' + str + '\x1b[0m';
  const yellow = (str) => '\x1b[33m' + str + '\x1b[0m';
  const blue = (str) => '\x1b[34m' + str + '\x1b[0m';
  const magenta = (str) => '\x1b[35m' + str + '\x1b[0m';
  const cyan = (str) => '\x1b[36m' + str + '\x1b[0m';
  const white = (str) => '\x1b[37m' + str + '\x1b[0m';
  const gray = (str) => '\x1b[90m' + str + '\x1b[0m';

  // #region Novel
  class Novel {

    constructor() {
      Object.assign(DELAYS, delays);

      $container = div(__ + '-container', __ + '-layer');

      $stories = div(__ + '-stories', __ + '-layer');
      $page = div(__ + '-page', __ + '-page-hidden');
      
      $dialogs = div(__ + '-dialogs', __ + '-layer');
      $textbox = div(__ + '-textbox', __ + '-textbox-hidden');
      $messages = div(__ + '-messages');
      
      $choices = div(__ + '-choices', __ + '-layer');
      $select = div(__ + '-select', __ + '-select-hidden');

      $container.append($stories, $dialogs, $choices);
      $stories.append($page);
      $choices.append($select);
      $dialogs.append($textbox);
      $textbox.append($messages);

      $stories.addEventListener(pointerEventType, onStoriesClick);
      $dialogs.addEventListener(pointerEventType, onDialogsClick);
      $select.addEventListener(pointerEventType, onSelectClick);

      $container.style.pointerEvents = 'none';

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
      onGameReady(descriptor);
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
            _: selectProxy,
            write,
            erase,
            when: createWatcher,
            call,
            note,
            mute,
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
      if (noSaveLoad) {
        return;
      }
      const key = IMPLEMENTED.createKey?.(novelTag, slotName);
      return IMPLEMENTED.writeState?.(key, structuredClone(state));
    }

    loadState(slotName) {
      ASSERT_RELEVANCE();
      if (noSaveLoad) {
        return;
      }
      const key = IMPLEMENTED.createKey?.(novelTag, slotName);
      return IMPLEMENTED.readState?.(key);
    }

    clearSaveSlot(slotName) {
      ASSERT_RELEVANCE();
      if (noSaveLoad) {
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
      if (currentScene) {
        currentScene.end();
      }
      if (id?.[0] === '~') {
        id = id.slice(1);
      } else {
        await Promise.all([erase(), mute()]);
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
      lastChoice.clear();
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
        $page.classList.remove(__ + '-page-written');
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
          $stories.style.pointerEvents = hasPageLinks() ? 'all' : 'none';
          $dialogs.style.pointerEvents = 'none';
          $choices.style.pointerEvents = 'none';
          $page.classList.add(__ + '-page-written');
          SCRIPT_FLOW_ENDED = true;
          log('⛰️', currentScene.id, '↩');
        }
      }
    }
  }

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
        $stories.style.pointerEvents = hasPageLinks() ? 'all' : 'none';
        $dialogs.style.pointerEvents = 'none';
        $choices.style.pointerEvents = 'none';
        $page.classList.add(__ + '-page-written');
        if (this.watchers.length) {
          result = await new Promise((resolve) => {
            watchersCallback = resolve;
          });
        } else if (!hasPageLinks('@')) {
          // Scene has no active watchers, no scene links and returned undefined.
          log('🚧', 'The game has stalled.');
        }
      }
      return result;
    }

    removeWatcher(event) {
      const index = this.watchers.findIndex(obj => obj.event === event);
      if (index !== -1) {
        this.watchers.splice(index, 1);
        removePageEventLink(event);
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

  // #region createWatcher
  const createWatcher = (event, cb) => {
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
        console.error(`There is no point in "await" before "when" (scene: "${sceneId}", event: "${event}").`);
      }
    };
  };

  // #region Character
  class Character {

    constructor(id) {
      log('🦊', id);
      this.id = id;
      this.label = '';
      this.align = DEFAULT_ALIGN;
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
            console.error('Once the call chain has started, property getting is not allowed. Requested property: ' + prop);
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
        __ + '-label-of-' + id,
        __ + '-label-hidden'
      );
      this.$el.append(this.$portraits, this.$label);

      if (Object.hasOwn(state.characters, id)) {
        const data = state.characters[id];
        this.setLabel(data.label);
        this.setAlign(data.align);
        log('↻', data);
      } else {
        state.characters[id] = {};
      }
    }

    // #region .setLabel
    setLabel(str = '') {
      this.$label.innerText = str;
      this.label = str;
      if (!str) {
        this.$label.classList.add(__ + '-label-hidden');
      } else if (this.visible) {
        this.$label.classList.remove(__ + '-label-hidden');
      }
    }

    // #region .setAlign
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

    // #region .setMood
    setMood(mood) {
      if (mood !== this.mood) {
        this.$el.classList.remove(__ + '-character-mood-' + this.mood);
        this.$el.classList.add(__ + '-character-mood-' + mood);
        this.mood = mood;
        return true;
      }
      return false;
    }

    // #region .show
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
        $messages.replaceChildren();
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

    // #region .hide
    async hide() {
      if (!this) {
        await doubleRAF(() => {
          if (!SPEAKING) {
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
          if (!SPEAKING) {
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

    // #region .say
    async say(modifier, ...args) {
      ASSERT_RELEVANCE();
      if (WRITING || SPEAKING || CHOOSING) {
        console.error(
          'Message from ' + (this?.id ?? '[note]') + ' was ignored because the previous ' +
          'task was not finished. Check if you placed "await"s correctly.'
        );
        console.error('Message:', args);
        return;
      }
      SPEAKING = true;
      $stories.style.pointerEvents = 'none';
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
        $textbox.classList.remove(__ + '-textbox-note');
        await this.show(modifier);
      } else {
        const textboxHidden = $textbox.classList.contains(__ + '-textbox-hidden');
        const delayNeeded = textboxHidden || !!shownCharacter;
        shownCharacter?.hide();
        $messages.replaceChildren();
        $textbox.classList.remove(__ + '-textbox-left');
        $textbox.classList.remove(__ + '-textbox-right');
        $textbox.classList.add(__ + '-textbox-note');
        if (textboxHidden) {
          $textbox.classList.remove(__ + '-textbox-hidden');
        }
        if (delayNeeded) {
          await sleep(DELAYS.BEFORE_FIRST_NOTE);
        }
      }
      for (let i = 0; i < messages.length; i++) {
        if (typeof messages[i] !== 'string') continue;
        let auto = false;
        let autoWaitTime = 0;
        if (typeof messages[i + 1] === 'number') {
          auto = true;
          autoWaitTime = messages[i + 1];
        }
        const [str, pauses] = stripPauses(translate(messages[i]));

        await renderText(...parseStringWithTags(str, pauses), false, (blocks) => {
          for (const $elem of blocks) {
            $elem.classList.add(__ + '-message', __ + '-message-' + modifier);
          }
          $messages.replaceChildren(...blocks);
        });

        history.push({
          id: this?.id ?? '[note]',
          label: this?.label ?? '[note]',
          text: $messages.innerText.replaceAll('\n', ' ')
        });
        if (history.length > 100) {
          history.shift();
        }
        
        let resolve;
        const promise = new Promise((res, rej) => {
          resolve = res;
          lastReject = rej;
        });

        const nextPlayerAction = () => {
          WAITING_FOR_ACTION = true;
          CALLBACKS.onStopTyping?.();
          return promise;
        };

        dialogsCallback = () => {
          $textbox.classList.remove(__ + '-textbox-waiting');
          resolve();
        };
        
        if (SKIP_TEXT_ANIMATION) {
          await sleep(DELAYS.BEFORE_IDLE_PROCEED);
        }
        
        if (SKIP_TEXT_ANIMATION) {
          onDialogsClick(null, true);
        } else if (auto) {
          await sleep(autoWaitTime);
          onDialogsClick(null, true);
        } else {
          await sleep(DELAYS.BEFORE_DIALOGS_ACTIVE);
          $textbox.classList.add(__ + '-textbox-waiting');
          if (SKIP_TEXT_ANIMATION) {
            onDialogsClick(null, true);
          } else {
            await nextPlayerAction();
          }
        }
      }
      SPEAKING = false;
    }
  }

  // #region renderText
  const renderText = (str, tags, pauses, makeLinks, onParagraphs) => {
    // console.log(red('renderText'));
    // console.log(white('Input data:'));
    // console.log(str.replaceAll('\n', '|'));
    // console.log(tags.map(v => v && v[0] || '.').join(''));
    // console.log(pauses.map(v => v && v.toString()[0] || '-').join(''));

    const fragmentClass = __ + (makeLinks ? '-passageFragment' : '-messageFragment');

    if (pauses.length > str.length) {
      console.error('Do not put a pause at the end of the text (it is ignored).');
    }

    for (let i = str.length - 1; i >= 0; i--) {
      if (str[i] === ' ' || str[i] === '\n') {
        if (pauses[i] !== 0) {
          console.error('Do not insert a pause before spaces or new lines (it is ignored).');
        }
        tags.splice(i, 1);
        pauses.splice(i, 1);
      }
    }

    const fr_map = new Map();
    const parts = [];

    let offset = 0;
    let delay = 0;

    const blocks = [];
    for (const paragraph of str.split(/\n+/)) {
      const $paragraph = div(__ + '-paragraph');

      for (const word of paragraph.replace(/^ +| +$/g, '').split(/ +/)) {
        const $word = span(__ + '-word');
        const w_pauses = pauses.slice(offset, offset + word.length);
        const w_tags = tags.slice(offset, offset + word.length);

        let $fragment;
        let $part;
        let tag;
        for (let i = 0; i < word.length; i++) {
          if (i === 0 || w_pauses[i] !== 0) {
            $fragment = span(fragmentClass);
            $word.append($fragment);
            delay += w_pauses[i];
            if (!fr_map.has(delay)) {
              fr_map.set(delay, []);
            }
            fr_map.get(delay).push($fragment);
            $part = span();
            $fragment.append($part);
            tag = w_tags[i];
            if (tag) {
              parts.push([$part, tag]);
            }
          } else if (tag !== w_tags[i]) {
            $part = span();
            $fragment.append($part);
            tag = w_tags[i];
            if (tag) {
              parts.push([$part, tag]);
            }
          }
          $part.innerText += word[i];
        }

        $paragraph.append($word);
        offset += word.length;
      }

      blocks.push($paragraph);
    }

    // console.log(fr_map);
    // console.log(parts);

    for (const [$part, tagStr] of parts) {
      const splitTags = tagStr?.trim().split(/\s*,\s*/) ?? [];
      if (makeLinks) {
        for (let i = splitTags.length - 1; i >= 0; i--) {
          const tag = splitTags[i];
          if (tag[0] === '@' || tag[0] === '&') {
            $part.classList.add(__ + '-link-' + (tag[0] === '@' ? 'scene' : 'event'));
            $part.setAttribute(pageLinkAttr, tag);
            splitTags.splice(i, 1);
          }
        }
      }
      if (splitTags.length) {
        CALLBACKS.onTaggedPart?.($part, splitTags);
      }
    }

    onParagraphs(blocks);

    return new Promise((resolve) => {
      const entries = [...fr_map.entries()];
      const render = (i, justWaited) => {
        for (let j = i; j < entries.length; j++) {
          const delay = entries[j][0] - (entries[j - 1]?.[0] ?? 0);
          if (!justWaited && !SKIP_TEXT_ANIMATION && delay > 0) {
            setTimeout(() => render(j, true), delay);
            return;
          }
          entries[j][1].forEach(elem => elem.classList.add(fragmentClass + '-rendered'));
          justWaited = false;
          CALLBACKS.onRenderFragments?.(!!makeLinks);
        }
        resolve();
      };
      doubleRAF(() => render(0, false));
    });

  };

  // #region select
  const select = async (...args) => {
    ASSERT_RELEVANCE();
    log('📋', args);
    if (WRITING || SPEAKING || CHOOSING) {
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
    $stories.style.pointerEvents = 'none';
    $dialogs.style.pointerEvents = 'none';
    $choices.style.pointerEvents = 'all';
    $select.replaceChildren();
    for (let opt of args) {
      const $option = div(__ + '-select-option');
      if (typeof opt !== 'string') {
        const pair = Object.entries(opt)[0];
        $option.setAttribute('select-option-value', pair[0]);
        opt = pair[1];
      }
      renderText(...parseStringWithTags(...stripPauses(translate(opt))), false, (blocks) => {
        for (const el of blocks) {
          el.style.pointerEvents = 'none';
        }
        $option.append(...blocks);
      });
      $select.append($option);
    }
    $select.classList.remove(__ + '-select-hidden');
    CALLBACKS.onShowOptions?.();
    await sleep(DELAYS.BEFORE_SELECT_ACTIVE);
    return new Promise((resolve, reject) => {
      lastReject = reject;
      choicesCallback = resolve;
    });
  };

  const selectProxy = new Proxy(select, {
    set() {
      console.error('This object is readonly.');
    },
    get(_target, prop) {
      return lastChoice.get(prop);
    }
  });

  // #region write
  const write = (() => {

    let queue = [];
    let modifier = 'normal';

    // Allows only function calls and "then".
    const __proxy = new Proxy(() => { }, {
      get: (_target, prop) => {
        if (prop === 'then') {
          return async (resolve, reject) => {
            const args = queue;
            queue = [];
            await __write(modifier, ...args).catch(reject);
            modifier = 'normal';
            resolve();
          };
        } else {
          console.error('Once the call chain has started, property getting is not allowed. Requested property: ' + prop);
        }
      },
      apply: (_target, _thisArg, args) => {
        // Checking if function was called as a template tag.
        if (Array.isArray(args[0]) && Array.isArray(args[0].raw)) {
          args = [templateToString(...args)];
        }
        queue.push(...args);
        return __proxy;
      }
    });

    return new Proxy(() => { }, {
      get: (_target, prop) => {
        if (prop === 'then') {
          console.error(
            'Seemingly useless "await" before write function. This error may be caused by:\n' +
            '- Using quotes or double quotes instead of backticks in parenthesis-less notation.\n' +
            '- Using a comma or semicolon before the first argument in parenthesis-less notation.'
          );
        } else {
          modifier = prop;
          return __proxy;
        }
      },
      apply: (_target, _thisArg, args) => {
        // Checking if there are still planned messages left. This almost certainly indicates a forgotten "await".
        if (DEV_MODE) {
          if (queue.length) {
            console.error('Unexpected state. Check the "await" before these words:', [...queue]);
            return;
          }
        }
        // After the first call in the chain, this function returns a proxy object that allows the engine to track down certain types of errors.
        return __proxy(...args);
      }
    });

  })();

  const __write = async (modifier, ...args) => {
    ASSERT_RELEVANCE();
    if (WRITING || SPEAKING || CHOOSING) {
      console.error('Writing task was ignored because the previous task was not finished. Check if you placed "await"s correctly.');
      console.error('Skipped text:', args);
      return;
    }
    WRITING = true;
    $stories.style.pointerEvents = 'all';
    $dialogs.style.pointerEvents = 'none';
    $choices.style.pointerEvents = 'none';
    const messages = [];
    for (const arg of args) {
      if (Array.isArray(arg)) {
        messages.push(...arg);
      } else {
        messages.push(arg);
      }
    }
    if ($page.classList.contains(__ + '-page-hidden')) {
      $page.classList.remove(__ + '-page-hidden');
      await sleep(DELAYS.PAGE_SHOW);
    }
    for (let i = 0; i < messages.length; i++) {
      if (typeof messages[i] !== 'string') continue;
      let auto = false;
      let autoWaitTime = 0;
      if (typeof messages[i + 1] === 'number') {
        auto = true;
        autoWaitTime = messages[i + 1];
      }
      await renderText(...parseStringWithTags(...stripPauses(translate(messages[i]))), true, (blocks) => {
        for (const $elem of blocks) {
          $elem.classList.add(__ + '-passage', __ + '-passage-' + modifier);
          $page.append($elem);
          if ($page.children.length > maxPassageCount) {
            $page.children[0].remove();
          }
        }
        if ($page.scrollHeight > $page.clientHeight) {
          $page.scrollTo({ top: $page.scrollHeight, left: 0, behavior: 'smooth' });
        }
      });

      let resolve;
      const promise = new Promise((res, rej) => {
        resolve = res;
        lastReject = rej;
      });

      const nextPlayerAction = () => {
        WAITING_FOR_ACTION = true;
        CALLBACKS.onStopWriting?.();
        return promise;
      };

      storiesCallback = () => {
        $page.classList.remove(__ + '-page-waiting');
        resolve();
      };

      if (SKIP_TEXT_ANIMATION) {
        await sleep(DELAYS.BEFORE_IDLE_PROCEED);
      }
      
      if (SKIP_TEXT_ANIMATION) {
        onStoriesClick(null, true);
      } else if (auto) {
        await sleep(autoWaitTime);
        onStoriesClick(null, true);
      } else {
        await sleep(DELAYS.BEFORE_STORIES_ACTIVE);
        $page.classList.add(__ + '-page-waiting');
        if (SKIP_TEXT_ANIMATION) {
          onStoriesClick(null, true);
        } else {
          await nextPlayerAction();
        }
      }
    }
    WRITING = false;
  };

  // #region erase
  const erase = async () => {
    if (!$page.classList.contains(__ + '-page-hidden')) {
      $page.classList.add(__ + '-page-hidden');
      await sleep(DELAYS.PAGE_HIDE);
    }
    $page.replaceChildren();
    $page.classList.remove(__ + '-page-written');
    $stories.style.pointerEvents = 'none';
  };

  // #region utils
  const div = (...classes) => {
    const el = document.createElement('div');
    if (classes.length) {
      el.classList.add(...classes);
    }
    return el;
  };

  const span = (...classes) => {
    const el = document.createElement('span');
    if (classes.length) {
      el.classList.add(...classes);
    }
    return el;
  };

  const doubleRAF = (cb) => {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          await cb();
          resolve();
        });
      });
    });
  };

  function onWatchedElementClick() {
    novel.notify(this.getAttribute(watchedAttr));
  }

  const getWatchedElementsCallbacks = () => {
    const elems = [];
    return {
      onWatcherCreate(eventName) {
        document.querySelectorAll(`[${watchedAttr}="${eventName}"]`).forEach((el) => {
          el.classList.add(__ + '-watched');
          el.addEventListener(pointerEventType, onWatchedElementClick);
          elems.push(el);
        });
      },
      onWatcherRemove(eventName) {
        for (let i = elems.length - 1; i >= 0; i--) {
          const el = elems[i];
          if (el.getAttribute(watchedAttr) === eventName) {
            el.classList.remove(__ + '-watched');
            el.removeEventListener(pointerEventType, onWatchedElementClick);
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
  };

  const removeListeners = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('popstate', onPopState);
    if (watchedAttr) {
      document.querySelectorAll(`[${watchedAttr}]`).forEach((el) => {
        el.removeEventListener(pointerEventType, onWatchedElementClick);
        el.classList.remove(__ + '-watched');
        el.classList.remove(__ + '-watched-clicked');
        el.classList.remove(__ + '-watched-clicked-other');
      });
    }
  };

  const removePageEventLink = (name) => {
    for (const elem of $page.querySelectorAll(`[${pageLinkAttr}="@${name}"]`)) {
      elem.removeAttribute(pageLinkAttr);
      elem.classList.remove(__ + '-link-event');
    }
  };

  const hasPageLinks = (prefix = undefined) => {
    for (const elem of $page.querySelectorAll(`[${pageLinkAttr}]`)) {
      if (!prefix || elem.getAttribute(pageLinkAttr).startsWith(prefix)) {
        return true;
      }
    }
    return false;
  };

  const call = (sceneId, ...args) => {
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
  };

  const note = (() => {

    let queue = [];
    let modifier = 'normal';

    // Allows only function calls and "then".
    const __proxy = new Proxy(() => { }, {
      get: (_target, prop) => {
        if (prop === 'then') {
          return async (resolve, reject) => {
            const args = queue;
            queue = [];
            await Character.prototype.say.call(null, modifier, ...args).catch(reject);
            modifier = 'normal';
            resolve();
          };
        } else {
          console.error('Once the call chain has started, property getting is not allowed. Requested property: ' + prop);
        }
      },
      apply: (_target, _thisArg, args) => {
        // Checking if function was called as a template tag.
        if (Array.isArray(args[0]) && Array.isArray(args[0].raw)) {
          args = [templateToString(...args)];
        }
        queue.push(...args);
        return __proxy;
      }
    });

    return new Proxy(() => { }, {
      get: (_target, prop) => {
        if (prop === 'then') {
          console.error(
            'Seemingly useless "await" before note function. This error may be caused by:\n' +
            '- Using quotes or double quotes instead of backticks in parenthesis-less notation.\n' +
            '- Using a comma or semicolon before the first argument in parenthesis-less notation.'
          );
        } else {
          modifier = prop;
          return __proxy;
        }
      },
      apply: (_target, _thisArg, args) => {
        // Checking if there are still planned messages left. This almost certainly indicates a forgotten "await".
        if (DEV_MODE) {
          if (queue.length) {
            console.error('Unexpected state. Check the "await" before these words from "note":', [...queue]);
            return;
          }
        }
        // After the first call in the chain, this function returns a proxy object that allows the engine to track down certain types of errors.
        return __proxy(...args);
      }
    });

  })();

  const mute = () => {
    if (shownCharacter) {
      return shownCharacter.hide();
    } else {
      return Character.prototype.hide.call(null);
    }
  };

  const sleep = (ms) => {
    return new Promise((resolve, reject) => {
      lastReject = reject;
      setTimeout(resolve, ms);
    });
  };

  const translate = (str) => {
    if (LANGUAGE !== -1 && typeof str === 'string') {
      const arr = str.split(SPLIT_REGEX);
      if (LANGUAGE < arr.length) {
        return arr[LANGUAGE];
      }
      return arr[0];
    }
    return str;
  };

  const templateToString = (strings, ...values) => {
    let result = '';
    for (let i = 0; i < strings.length; i++) {
      result += strings[i];
      if (i < strings.length - 1) {
        result += `${values[i]}`;
      }
    }
    return result;
  };

  const stripPauses = (str) => {
    const chars = str.split('');
    const pauses = new Array(str.length).fill(0);
    let shift = 0;
    for (const { '0': substr, '1': digits, index } of str.matchAll(/\[(\d+)\]/g)) {
      chars.splice(index - shift, substr.length);
      pauses.splice(index - shift, substr.length);
      pauses[index - shift] = +digits;
      shift += substr.length;
    }
    return [chars.join(''), pauses];
  };

  const parseStringWithTags = (str, pauses = []) => {

    // console.log(red('parseStringWithTags'));
    // console.log(white('Input data:'));
    // console.log(str.replaceAll('\n', '|'));
    // console.log(pauses.map(v => v ? (v + '')[0] : '-').join(''));
    
    const chars = str.split('');
    const tags = new Array(str.length).fill(undefined);
    let shift = 0;
    for (const obj of str.matchAll(/\[(.*?)::(.*?)\]/gs)) {
      const { '1': tag, '2': word, index } = obj;
      // console.log({ tag, word, index });
      pauses.splice(index - shift + 1, tag.length + 2);
      chars.splice(index - shift + 1, tag.length + 2);
      tags.splice(index - shift + 1, tag.length + 2);
      for (let i = index - shift + 1; i < index - shift + 1 + word.length; i++) {
        tags[i] = tag;
      }
      shift += tag.length + 2;
    }

    // console.log(white('\nAfter first tag cutting:'));
    // console.log(chars.join('').replaceAll('\n', '|'));
    // console.log(tags.map(v => v ? v[0] : '.').join(''));
    // console.log(pauses.map(v => v ? (v + '')[0] : '-').join(''));

    shift = 0;
    for (const obj of chars.join('').matchAll(/([\p{L}\d_#&@~]*)::([\p{L}\d_*\-]*)/gu)) {
      const { '1': tag, '2': word, index } = obj;
      // console.log({ tag, word, index });
      pauses.splice(index - shift + 1, tag.length + 2);
      chars.splice(index - shift, tag.length + 2);
      tags.splice(index - shift, tag.length + 2);
      for (let i = index - shift; i < index - shift + word.length; i++) {
        tags[i] = tag;
      }
      shift += tag.length + 2;
    }

    // console.log(white('\nAfter second tag cutting:'));
    // console.log(chars.join('').replaceAll('\n', '|'));
    // console.log(tags.map(v => v ? v[0] : '.').join(''));
    // console.log(pauses.map(v => v ? (v + '')[0] : '-').join(''));

    for (let i = chars.length - 1; i >= 0; i--) {
      const char = chars[i];
      if (char === '[' || char === ']') {
        chars.splice(i, 1);
        tags.splice(i, 1);
        pauses.splice(char === '[' ? i + 1 : i, 1);
      }
    }

    // console.log(white('\nAfter removing brackets:'));
    // console.log(chars.join('').replaceAll('\n', '|'));
    // console.log(tags.map(v => v ? v[0] : '.').join(''));
    // console.log(pauses.map(v => v ? (v + '')[0] : '-').join(''));

    return [chars.join(''), tags, pauses];
  };

  const log = (...args) => {
    if (DEV_MODE) {
      console.log(...args.map(arg => arg === stateProxy ? state.$ : arg));
    }
  };

  // #region global listeners
  const onKeyDown = ({ key }) => {
    if (noKeyboard) {
      return;
    }
    if (!pressed[key]) {
      pressed[key] = true;
      switch (key) {
        case ' ':
          onStoriesClick();
          onDialogsClick();
          SKIP_TEXT_ANIMATION = true;
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          onSelectClick(null, key - 1);
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
        SKIP_TEXT_ANIMATION = false;
        break;
    }
  };

  const onPopState = (_event) => {
    IMPLEMENTED.onUserNavigates?.();
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('popstate', onPopState);

  // #region init
  novel = new Novel();

  Object.assign(descriptor, {

    run() {
      if (!currentScene && state.scene) {
        novel.runScene(state.scene, state.args, false);
      }
      return descriptor;
    },

    event: (str, ...args) => {
      novel.notify(str, ...args);
    },

    clearSaveSlot: (slotName = 'autosave') => {
      return novel.clearSaveSlot(slotName);
    },

    remove: () => {
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

    getHistory: () => history,

    $: stateProxy,

    // A utility function that returns a promise that resolves after
    // a specified number of milliseconds. Can be useful in callbacks.
    // Automatically rejected if the game is forced to end.
    sleep,

    // Alias for console.log that will be silent when not in development mode,
    // and also unwraps the game state object ($) for better view.
    log

  });

  return gameReadyPromise;

};
