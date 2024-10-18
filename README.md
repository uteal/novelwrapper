## NovelWrapper - Visual Novel Engine

### Overview
A quick-to-learn, fun-to-use JavaScript engine for creating browser-based visual novels.<br />
Check out the live demo: [The Glyphs](https://uteal.github.io/novelwrapper/The%20Glyphs).

### Features
🎓 Easy to pick up. Basic knowledge of JS is enough.<br />
☕ Little new. Use DOM events, use CSS styles.<br />
💬 Thoroughly explained example code.<br />
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
The engine was originally designed as a subsystem of a larger game, to be small and easy to embed, but still provide powerful tools for telling stories through characters and their lines. It doesn't care about preloading assets, switching backgrounds, animating sprites, or playing sounds. If you can't do these things yourself (and still need them), consider a heavier, more feature-rich visual novel engine like Ren'Py.

### No warranty
The engine is still in its infancy, so breaking changes between versions are possible. The source code, although carefully written, may still contain bugs. Regular updates are likely but not guaranteed.

### How to start
To start using the engine, simply download the "lib" folder and import its contents into your project. The "nwrap.js" is the engine itself. The second file includes the minimum CSS styles needed by the engine, and can be subsequently modified by you to suit the needs of your project (feel free to experiment with it). If ES modules are not to your liking, open "nwrap.js" and change the export method as specified in the hint inside.

### Documentation, maybe?
Although there is no separate documentation yet, the "init.js" and "story.js" files inside "The Glyphs" folder contain an effectively comprehensive tutorial, covering all the main features of the engine.
