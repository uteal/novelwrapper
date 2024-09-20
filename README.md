## NovelWrapper - Visual Novel Engine

### Overview
A quick-to-learn, fun-to-use JavaScript engine for creating browser-based visual novels.<br />
Check out the live demo: [The Glyphs](https://uteal.github.io/novelwrapper/).

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
The engine was originally created as a subsystem of a larger game project with the goal of adding visual novel elements to it while being easily embedded. The engine provides a rather modest set of features, so it is hardly a replacement for full-fledged visual novel builders such as Ren'Py. Engine's true power lies in its interaction with other parts of the web page. The novel it creates is essentially a layer that can be placed on top of any HTML element.

### No warranty
The engine is in early development, so breaking changes between versions are possible. The source code, although carefully written, may still contain bugs. Regular updates are likely but not guaranteed, so think twice before starting a serious project relying on this engine unless you are experienced enough to troubleshoot issues yourself.

### How to start
To start using the engine, simply download the "lib" folder and import its contents into your project. The "nwrap.js" is the engine itself. The second file includes the minimum CSS styles needed by the engine, and can be subsequently modified by you to suit the needs of your project (feel free to experiment with it). If ES modules are not to your liking, open "nwrap.js" and change the export method as specified in the hint inside.

### Documentation, maybe?
Although there is no separate documentation yet, the "init.js" and "story.js" files contain an effectively comprehensive tutorial, covering all the main features of the engine.
