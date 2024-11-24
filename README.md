## NovelWrapper - Visual Novel Engine

### Overview
A quick-to-learn, fun-to-use JavaScript engine for creating browser-based visual novels.<br />
Check out the live demo: [The Glyphs](https://uteal.github.io/novelwrapper/The%20Glyphs).

### Features
🎓 Easy to pick up. Mere knowledge of JS is enough.<br />
☕ Little new. Use DOM events, use CSS styles.<br />
💬 Thoroughly explained example code.<br />
🛠️ Supplemented with a set of useful tools.<br />
👾 Upcoming PicoVN build for pixel-art novels.<br />
🌱 Seamless integration into any web-page.<br />
🕊️ Lightweight. No bundlers, no compilation step.<br />
🥩 A concise, juicy way of scripting.<br />
🍺 And of course, it's free.<br />

### Example of code
```js
// Scene is just a function. And yes, this is JavaScript.
async ({ Raven, Kestrel }) => {

  await Raven
    `Ah, here we go again...`

  await Kestrel
    `Not the best way to start a conversation, huh?`
    `What are you planning to do next anyway?`

  let choice = await select(
    "Think I should go.",     // 0
    "I'll stay here for now." // 1
  )

  if (choice == 0) {
    await Kestrel.angry `So begone.`
  } else {
    await Kestrel.smile `Do you want me to stay too?`
  }

  return choice ? 'good_ending' : 'bad_ending'

}
```

### Ecological niche
The engine was originally designed as a subsystem of a larger game, to be small and easy to embed, but still provide powerful tools for telling stories through characters and their lines. Accompanied by a set of helper scripts, it is more like a construction kit than a monolithic solution. If you need the latter, consider a heavier, more feature-rich visual novel engine like Ren'Py.

### What is PicoVN?
PicoVN is a ready-to-use build of the engine, bundled together with tools specifically designed for working with low-resolution pixel graphics. (Coming soon.)

### No warranty
The engine is still in its infancy, so breaking changes between versions are possible. The source code, although carefully written, may still contain bugs. Regular updates are likely but not guaranteed.

### How to start
Download the "lib" folder and import "nwrap.js" (or "nwrap.min.js") and "nwrap.css" into your project. While "nwrap.js" is the engine itself, "nwrap.css" provides the minimum CSS styles needed by the engine, and can be subsequently modified by you to suit the needs of your project (feel free to experiment with it).

### Documentation, maybe?
Although there is no separate documentation yet, the "init.js" and "story.js" files inside "The Glyphs" folder contain an effectively comprehensive tutorial, covering all the main features of the engine.
