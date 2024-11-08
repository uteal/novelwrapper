// The engine. Feel free to check out the source code.
import createNovel from '../lib/nwrap.js';

// Here is a visual novel script written by the author. Comments act as a built-in tutorial.
import myStory from './story.js';

// A minigame about catching falling leaves.
import playMiniGame from './minigame.js';

// Makes a new novel from the scenes given. Returns a handle with a set of useful methods.
const novel = createNovel(

  // Unique name used to differentiate between progress saves.
  'the_glyphs',

  // A function or array of functions that return dictionaries of novel scenes. Look "story.js" for more.
  myStory,

  // Initial params, none is obligatory. Default values can be seen in the engine file.
  {
    $: {                           // This is where all the game progress data should be stored,
      FISH: 0, STAR: 0, LEAF: 0    // must be JSON-serializable to saves to work properly. Empty
    },                             // object by default.

    firstScene: 'start',           // Entry point of the novel, defaults to "start".
    devMode: true,                 // Allows the engine to output logs. Essential during development.
    stepTime: 1000 / 60,           // The time it takes to print each symbol in milliseconds. Instant if zero.
    restoreFromSlot: 'autosave',   // The game tries to load from the specified slot, "autosave" by default. Nullify to start over.

    callbacks: [                   // Callbacks for standard events can be set as a single object or an array
      getCallbacks()               // of objects, for example: [{ onShow: f1, onHide: f2 }, { onShow: f3 }].
    ],                             // Full list of the callbacks can be seen in the engine file.

    ext: {                         // The engine itself does not help with anything except character conversations,
      showScreen, playMiniGame     // so sometimes you'll need a bunch of your own custom functions.
    },                             // To easily throw them into the scenes, "ext" object can be used.

    cssPrefix: 'novel',            // Engine will use this when searching for CSS styles.

    watchedAttr: 'nw-event',       // If set, the engine will automatically track elements with this attribute,
                                   // and trigger the corresponding event when they are clicked. The engine
                                   // will also apply some CSS classes to those elements, which is useful for
                                   // displaying the element's status. See the nwrap.css for details.

    imagesPath: './assets/chars',  // Path to folder with novel characters' portraits.
    imagesType: 'png',             // File extension of your character portraits. Default is png.
    appendTo: '#game',             // Where the novel element should be placed. Defaults to document.body.

    // -- Advanced parameters. None of them are used here. --

    implementations: {},             // Here you can replace some internal engine methods. For example, the way to save and load.
    delays: {},                      // Here you can set some engine's animation delays. See the engine file for a list of them.
    defaultAlign: 'right',           // Starting alignment of each character. Default is "right", other possible is "left".
    multiLangSplitRegex: /\s+>>\s+/, // Engine allows multilingual strings, like "Thank you! >> Danke!". /\s+>>\s+/ by default.
    language: -1,                    // Which part of the split string should be shown. Default: -1 (i.e. no translation).
  }

);
// The novel is ready.

// --------------------------------------------------------------------
// The code below is for creating interactive elements on game screens.
// The engine does not dictate how to create them. I chose html as the
// simplest way. For the structure of the game window, see "index.html".
// --------------------------------------------------------------------

// I wrapped the callbacks in a function just so I could place them after the createNovel() call.
function getCallbacks() {
  return {
    onStateChange(prop, _value) {
      switch (prop) {
        case 'FISH': novel.log('🐠', 'First clue found!'); break;
        case 'STAR': novel.log('⭐', 'Second clue found!'); break;
        case 'LEAF': novel.log('🍃', 'Last clue found!'); break;
      }
    },
    onGameEnd(result) {
      switch (result) {
        case 0: novel.clearSaveSlot(); window.location.reload(); break;
        case 1: window.location = 'https://github.com/uteal/novelwrapper'; break;
      }
    }
  };
}

// Makes a chosen screen visible, returning an "await"able promise that resolves in a short period of time.
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  document.querySelector('#' + screenId).classList.remove('hidden');
  return novel.sleep(1000);
}

// Assign a corresponding image to each element of the "screen" class.
document.querySelectorAll('.screen').forEach((el) => {
  el.style.backgroundImage = `url('./assets/screens/${el.getAttribute('id')}.jpg')`;
});

// Clickables are placed in their places from here.
document.querySelectorAll('.clickable').forEach((el) => {
  el.style.top = el.getAttribute('y') + 'px';
  el.style.left = el.getAttribute('x') + 'px';
  const d = parseInt(el.getAttribute('d') || '100');
  el.style.width = d + 'px';
  el.style.height = d + 'px';
  el.style.marginLeft = -d / 2 + 'px';
  el.style.marginTop = -d / 2 + 'px';
});

// Just to make it visible in browser console.
window.novel = novel;
