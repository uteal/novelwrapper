// This is a story that is divided into scenes. Scenes are represented
// by a key-value dictionary, where the keys are scene identifiers.

// The wrapping function provides a couple of data objects and a set of utility functions.
// For demonstration purposes I have listed them all, but you can specify only those that you need.

// $      - Persistent data object, its initial fields can be set via initial parameters.
// _      - A special read-only object that stores the result of the last choice in the current scene.
// watch  - Creates a watcher attached to the current scene. That is how outer events are processed.
// select - Lets the player choose an answer from the options given. To be used with "await".
// call   - Calls a scene as a subscene. An example will be given below. To be used with "await".
// print  - Allows you to type text without specifying the speaker. To be used with "await".
// clear  - Force hide currently visible character and text. For a short pause can be used with "await".
// sleep  - Explicitly pauses the execution flow, gets time in milliseconds. To be used with "await".
// save   - Saves the current game state immediately. Only use if you know what you're doing.
// log    - Alias for console.log that will be silent when not in development mode, and also unwraps $ for cleaner view.
// ext    - An object with your custom data, as given at the initialization step.
export default ({ $, _, watch, select, call, print, clear, sleep, save, log, ext: { showScreen, playMiniGame } }) => ({

  // An example of the most basic scene, completely invisible for a player.
  // It does nothing except redirecting the player to another scene named 'road'.
  start: () => 'road',

  // It's time for some magic. You can get any character from here, even one that doesn't exist yet.
  // Just retrieve it by the identifier you like and it will be created on the fly and linked to the corresponding images.
  road: async ({ Raven }) => {

    // Now the character "Raven" is created and associated with `${imagesPath}/Raven/` folder.
    // Once created, the character retains its acquired parameters, such as position and display name.

    // Character's methods showcase. All are syncronous (no "await" required). Chaining is available.
    // The "$" prefix signals that the method modifies the character's persistent data.
    // For example, a character's name set in one scene will be the same in another.
    Raven
    //.$flipImage()          // Flip character's portraits horizontally. Not needed here.
    //.$toRight()            // The default position for a newly created character is right, so this method is not needed here.
      .$toLeft()             // I'll move Raven to the left side of the screen since he is the main character.
      .$setLabel('Wanderer') // A label that will be shown near the character. It can be changed at any time.

    // The character is still invisible. He will appear when he needs to say something.
    // Let's show the landscape of the current scene. This is what our custom function is for.
    await showScreen('road')

    // Now we'll talk about why the "async" keyword appears before the declaration of this scene.
    // It allows us to stop the JavaScript execution flow inside this function using the "await" keyword.
    // We do it because we DON'T want the execution flow to run further, at least for now.
    // We want it to sit and wait, until the player clicks, makes a choice, or just stares at the text
    // or the emerging landscape for a while. Furthermore, the engine won't start its next built-in action
    // (like a character's speech) until the previous one is finished, and will (hopefully) log an error.

    // [NOTE] It is required to put "await" before each speaking character, select(), call(), print() or sleep().

    // The character object can be called like a function.
    await Raven('So the rumors were white::true.')

    // As you might guess, Raven will say the phrase in parentheses. There is no need
    // to make the speaking character visible or hide the others. Engine takes care of that.

    // There is a built-in way to mark some parts of the text with a custom tag. Here I mark the word
    // "true" with the tag "white". Tags are just strings, you can add and use them as you wish.
    // For an example, see the "onBeforeType" callback in the init.js file. Allowed syntax:
    // tag::word
    // [tag::several words]

    await Raven `The awakened portal should be nearby.`

    // Another way to make a character talk. Note the lack of parentheses and the string enclosed in backticks.
    // This is essentially the function call. If you don't know why this is valid JavaScript, you can read
    // about "tagged templates" in your spare time. For now, just know that the engine can make use of it.

    // These expressions are equivalent and valid:
    // 1) await Raven `foo` `bar`
    // 2) await Raven('foo', 'bar')
    // 3) await Raven('foo')('bar') // I don't recommend this, but it is technically correct.

    // But these are NOT:
    // 4) await Raven `foo`, `bar` // Here, because of the comma, the word "bar" will be quietly lost.
    // 5) await Raven 'foo' 'bar'  // This is a syntax error: only strings in backticks can call a function without parentheses.

    // I will use the first notation as the most concise and clean. But the second method is robust and error-proof.
    // Actually, it may be safer not to use semicolons at the end of lines unless necessary, to avoid accidentally
    // splitting parentheses-less calls. Again: if you feel unsure, the second notation is perfectly fine.

    // An example of using the "print" function. Its syntax is less free: only the second notation is supported.
    await print("Click on the [white::tavern's door].", 0) // The second argument is for auto-proceeding, this will be explained later.

    // [NOTE] Text printed by the "print" function is "sticky": it can only be removed
    // by calling the "clear" function or by overwriting it with the character's speech.

    // Before the current scene comes to an end and Raven is removed from the screen, let's do one more thing.
    // Here is how to add a watcher. Watchers are used to handle events that can be sent into the novel
    // via the .event(str, ...args) method. The watcher below reacts to the player clicking on the tavern picture.
    watch('to_tavern', async (/* ...args */) => {
      await Raven
        `The noise from the tavern makes me think that I was far from the first of the new arrivals.`
        `I guess I should drop in for a drink too.`

      // If the watcher returns a string value, it is treated as a redirect to the corresponding scene.
      // The scene the player exited from does not retain memory of its previous state, so all of scene's
      // watchers disappear along with it.
      return 'tavern'
    })

    // This is the end of the current scene. Note the lack of a return value.
    // Usually, a scene that has active watchers should not automatically
    // redirect the player somewhere else. Otherwise, why would it need watchers?
  },

  tavern: async ({ Raven, Innkeeper, Kestrel }) => {
    // By the way, the game progress is saved every time the player switches between scenes (and only then),
    // so you shouldn't create scenes that are too long to play through.

    await showScreen('tavern')

    await Raven
      `Oh, as expected.`
      `Lots of adventurers eager to explore the world beyond the newly awakened portal.`
      `But has anyone been able to broke the guard seal yet?`
      `Whatever.[350] I need to wet my throat.` // The number in square brackets indicates the pause in milliseconds.

    // The "select" function allows the player to choose one of several options passed to it, and (in its simplest form)
    // returns the ordinal number of chosen option, starting from zero. Thus, answer_num will be equal to 0 or 1 depending
    // on the player's choice. And don't forget to "await" while the player makes his decision.
    // By the way, tags work here too (but directives and pauses don't).
    const answer_num = await select(
      "Bring me a [yellow::mug of beer]!", // 0
      "I'd like a [blue::glass of water]." // 1
    )

    // Let's say I want to record the player's drink choice for future reference. This is where
    // the game data object comes in handy. It's persistent between game sessions, and that's the whole point.
    $.chosen_drink = ['BEER', 'WATER'][answer_num] // Well, really, why not save it in a more readable form?

    // Alternative notation. You can pass objects as options to get string keys instead of numbers.
    /*
    $.chosen_drink = await select(
      { BEER : "Bring me a mug of beer!"    }, // "BEER"
      { WATER: "I'd like a glass of water." }  // "WATER"
    )
    */

    // Another bit of syntactic sugar: you can use a special variable _ that
    // stores the result of the player's last choice until leaving the scene.
    /*
    await select("foo", "bar")
    _[0] && log("player chose foo")
    _[1] && log("player chose bar")
    log(_.__VALUE__) // 0 or 1

    await select(
      { BEER : "Bring me a mug of beer!"    },
      { WATER: "I'd like a glass of water." }
    )
    _.BEER && log("player chose beer")
    _.WATER && log("player chose water")
    log(_.__VALUE__) // "BEER" or "WATER"
    */

    // Let's take Raven off screen and add a dramatic pause while he waits for his order.
    clear()
    await sleep(1000)

    Innkeeper.$setLabel('Innkeeper')
    await Innkeeper `Your order.`

    // [NOTE] Do not chain method calls and character's speech. They are strictly separated to avoid many problems.
    // The engine will treat the line below as an error:
    // await Innkeeper('Your order.').$setLabel('Innkeeper')

    if ($.chosen_drink == 'BEER') {

      await Innkeeper
        `Any decent guest here will tell you that our beer is worth every penny.`
      await Raven
        `I hope so.`

    } else {

      await Innkeeper
        `Normally, we don't serve [white::plain water]. So it's only out of respect for the path you have overcome...`
        `...judging by the rags you have instead of clothes.`
      await Raven
        `That's...[500] kind of you.`
      
    }

    // If there is a number after the message, it means the pause in milliseconds before auto-proceed.
    // Numbers are written in parentheses because only the `string inside backticks` can cause a function call
    // without parentheses. This was discussed above.
    await Raven
      ``(300)`*gulp*`(500)
      ``(300)`*gulp*`(500)
      ($.chosen_drink == 'BEER' ? 'Unexpectedly strong!' : 'Nothing beats pure water.')
      `It's getting dark, and I doubt there's any sense in asking about available rooms.`
      `So I'd better look for a free bench outside...`

    // Directive symbols can be placed in square brackets at the beginning of a message.
    // "~" - the text will be printed at lower speed.
    // "!" - the text will be printed instantly.
    await Kestrel
      `[~]Hey! [350]Wait a minute.`
      `Am I imagining things, or...`
      `Is it really you[500], [slow, blue::Black Raven]?`
    
    Raven.$setLabel('Raven')
    
    await Raven
      `.[300].[300].`(800)
      `More like Wingless Raven now.`
      `But you guessed right[500], [slow, red::Kestrel].`
    
    Kestrel.$setLabel('Kestrel')

    await Kestrel
      `Damn, it's true. No one here knows me by that name. I've been just a mechanic for a long time now.`
      `The new world will again require flying machines, as well as new workshops.`
    
    await Raven
      `New world - new wars. This never changes.`
      `And dusty veterans like me will find a use for ourselves again.`
      `Look around. These people are just waiting for the next conflict to start. Isn't it...`
    
    await Kestrel
      `Sad, I would say.`
      `What's even sadder is that it looks like they won't have to wait long.`
      `...You were going to leave anyway, right?`

    return 'square'
  },

  // What's interesting about the scene below is that our heroes return there several times, and depending
  // on their progress, the scene behaves differently. There is nothing stopping you from creating several
  // much simpler scenes that will seem the same scene to the player. But the approach below works just as well.
  square: async ({ Raven, Kestrel }, ALL_FOUND = false) => {

    // This code will be re-run every time the scene is entered, so we only need to rely on differences in the state
    // of our data storage. As I said, don't use other variables to store data that needs to persist between scenes.

    // Remember that the player can arbitrarily close or reload the game page, and if all the necessary data is not saved,
    // the player's save slot will be effectively broken. But since writing data storage to a persistent browser memory only
    // happens between scenes, you don't have to worry about the page reloading somewhere at the middle of a scene where
    // the data storage is in an intermediate state and not ready.

    // Here I just want to see the contents of the data storage in the console, marked with the fancy floppy disk emoji.
    // [HINT] When you log the game data object using the engine's log function, it additionally unwraps the actual $ value.
    log('💾', $)

    await showScreen('square')

    // Kestrel must find three forgotten words in her memory. Let them be a FISH, a STAR and a LEAF.

    if ($.FISH == 0 && $.STAR == 0 && $.friendly_talk_was_shown != true) {
      // There was quite a large wall of text here, so I decided to put it into a separate scene. The "call" function allows you
      // to run the specified scene as a plain function (it is still wrapped in Promise and needs "await"). You can pass additional
      // arguments end even retrieve the return value. (Whatever the called scene returns will not cause a redirect or something.)
      // The called scene of course also has access to the storage ($), so I pass an extra argument there just for demonstration.
      await call('friendly_talk', $.chosen_drink == 'BEER') // If you're interested, "friendly_talk" scene is added immediately after the current one.

      // Once you feel confident in managing the game state, you can save it at any time (by default it only saves between scenes,
      // where it is safe to do so). Here I update an "autosave" slot so that if the player leaves the game before exiting this scene
      // (i.e. before "autosave" normally written), he still won't see next time the long dialogue above.
      $.friendly_talk_was_shown = true
      save() // the same as 'save("autosave")'
    }

    if ($.FISH == 0 && $.STAR == 1) {
      await Kestrel
        `...And is that white::captain of yours by any chance the gambling white::half-fox who played poker with us?`
        `It's just that he's owed me a bottle of whiskey and his tail for ten years now.`
    }

    if ($.FISH == 1 && $.STAR == 0) {
      await Raven
        `You know, I'm pretty sure the innkeeper was involved in that memory loss thing.`
        `He's definitely a seasoned mage, and his face makes me feel uneasy.`

      // To prevent characters from talking with the same face all the time, you can give them different moods.
      // The character's mood is also the name of the image file in the character's folder. For example, the engine
      // will search for a picture of a smiling Kestrel at the following path: `${imagesPath}/Kestrel/smiling.png`.
      // (Each part of it can differ depending on the initial parameters you set, the character id, and the mood.)
      // The mood can be set by placing a period after the character's name and before the character begins to speak.
      await Kestrel.smiling
        `If you are so impressionable, be careful when looking in the mirror.`

      // If the mood is not specified, it is considered "normal", so "Kestrel/normal.png" is the main portrait.
      // (It is technically correct to write "Kestrel.normal" by analogy with "Kestrel.smiling", but it is redundant.)
      await Kestrel
        `Just kidding. You might be right about him.`
    }

    if ($.FISH == 0) {
      watch('to_fountain', () => 'fountain')
    }

    if ($.STAR == 0) {
      watch('to_beacon', () => 'beacon')
    }

    if ($.LEAF == 0) {

      watch('to_chasm', async () => {
        if ($.FISH == 0) {
          await Kestrel `There must be a great view there. But maybe we should go to the fountain first?`
          // If the watcher does not return a string, the player remains in the current scene.
          return
        }
        if ($.STAR == 0) {
          await Raven `Let's first look at the lighthouse.`
          return
        }
        return 'chasm'
      })

      if ($.FISH == 1 && $.STAR == 1) {

        await Raven
          `There's just one [white::last glyph] left to recall, right? Maybe your memory will give us some clue?`
        await Kestrel
          `I think... [350]don't laugh... [350]that this is something related to "[slow, white::Birds of Prey]".`
        await Raven
          `...to our former squad? Hmm.`
        
      }
    }

    // If you're curious about how active element highlighting is implemented,
    // take a look at the callback functions inside the "init.js" file.

    if (ALL_FOUND) {
      await Kestrel
        `So we have all [white::three glyphs].`
        `Ready? Let's go then.`

      // The special prefix "~" before the scene id allows you to make a transition without hiding
      // the current character. Since Kestrel's line both ends this scene and opens the next one,
      // I made sure her portrait doesn't jump around unnecessarily. But it's purely optional.
      return '~portal'
    }
    
  },

  // This scene is created only to be called. It's essentially a conveniently separated chunk of conversation.
  friendly_talk: async ({ Raven, Kestrel }, isRavenDrunk) => {

    // During declaration, there is no difference between "regular" and "callable" scenes, so you can call every scene you want.
    // Just remember that since the called scene is not considered... a scene, no progress is saved when entering or leaving it.
    // All watchers created inside a called scene are attached to the underlying non-called scene. This is true even if the called scene calls a scene itself!

    await Raven
      `After the last time we spoke alone, I spent a week drinking. So I'm a little nervous.`
    
    await Kestrel
      `You weren't the only one who confessed to me during those years.`
      `But you did it in the most awkward way.[500]\nAnd the funniest one.`
    
    await Raven
      `Not sure my feelings have changed much since then. However, you know, I'm too proud to propose twice.`
      `I see you have something to share. Is it related to the new portal?`
    
    await Kestrel
      `Today I managed to decipher the last [white::three glyphs] of the guard seal.`
      `But then... it's like someone cast a spell of oblivion on me. As if they didn't want the portal to open yet.`
    
    await Raven
      `Probably one of the corporations is going to claim the portal as their property. We don't even need a new world for a new war.`
      `But if I remember correctly, you've always been resistant to mind magic. Maybe fresh air will just bring your memory back?`
    
    await Kestrel
      `Are you suggesting that we take a walk arm in arm?`
      (
        isRavenDrunk
        ? "That's right, who else will hold you when you're so wobbly? Let's go."
        : "A tempting offer, considering you're the only sober man in the area. Let's go."
      )
  },

  fountain: async ({ Raven, Kestrel }) => {
    await showScreen('fountain')
    await Kestrel
      `I have a feeling that the first white::glyph I forgot meant something white::golden.`

    watch('coins', async () => {
      await Raven
        `Maybe it's a white::coin? [500]Like these at the bottom.`
      await Kestrel
        `Does anyone really believe that throwing a coin into a fountain will make their wish come true?`
      
      if ($.chosen_drink == 'WATER') {

        await Raven
          `Why not give it a try?`
          `*splash*`
        await Kestrel
          `Are you sure you can afford to throw coins around?`
          `I hope the wish was worth it.`
        await Raven
          `Rest assured.`

      } else {

        await Kestrel
          `...Just don't tell me you're going to toss a coin too.`
        await Raven
          `Perhaps not this time. I spent too much on booze.`

      }
      
      await Kestrel
        `I think I get it. The white::golden color is from white::fish, like the ones in the water.`
        `Well, I actually recalled that. Thanks for the walk, it helps.`
        `Let's go somewhere else?`
      
      // By the way, there is a callback for tracking changing fields in the persistent storage ($).
      // Note: the engine does not track changes in nested structures such as arrays and objects.
      $.FISH = 1
      return 'square'
    })
  },

  beacon: async ({ Raven, Kestrel }) => {
    await showScreen('beacon')
    await Raven `Haven't felt the salty wind for a long.`

    watch('lighthouse', async () => {
      await Kestrel `They say the lighthouse hasn't worked for years. Ships don't moor here at night.`
      await Raven `When the sky is clear, the stars are bright here. I knew a captain who could navigate by them very well.`
      
      // A watcher can be created inside a watcher. The created watcher will also be attached to the current scene.
      watch('star', async () => {
        await Kestrel
          `Stars?.. That's right.`
          `One of the three white::glyphs I forgot meant the white::star.`
        await Raven
          `Really? Not very original.`
          `Okay then. It's a bit chilly here. I think we should go back.`
        $.STAR = 1
        return 'square'
      })

      // If the watcher returns false, it will be removed from the scene.
      return false
    })
  },

  chasm: async ({ Raven, Kestrel }) => {
    // We already have an autosave, but if there was an important plot branch here and we wanted to create
    // an additional restore point that wouldn't be overwritten automatically, we could write the game state
    // to a specific slot, like this:
    // save('leaf_fall')

    await showScreen('chasm')
    await Raven
      `There is something mesmerizing about this tree.`
      `It seems as if it is about to fall down. But it still stands, decade after decade.`

    watch('tree_on_the_edge', async () => {
      await Raven
        `If the [white::last glyph] is as simple as the previous ones, I think I know it.`
        `Remember what we took for good luck before the flight?`
      
      await print('(Catch as many leaves as you can.)', 500)

      // Embedding a minigame. Yes, it's that simple.
      // You can give control to any other function and continue with the result.
      const leaves_caught = await playMiniGame()

      log('🍂 Your result:', leaves_caught)

      if (leaves_caught >= 15) {
        await Kestrel `Stop, stop! I see you're a pro at this!`
      } else if (leaves_caught >= 10) {
        await Kestrel `Wow, I couldn't catch that much.`
      } else if (leaves_caught > 0) {
        await Kestrel.smiling `It's not easy to catch them, huh?`
      } else {
        await Kestrel `Do you like watching the leaves fall?`
      }

      await Kestrel
        `You mean... I remember. A silly tradition.`
        `But you're right. This is it.`
        `A [white::leaf caught in the wind] was the sign of our squad.`
      await Raven
        `Just as elusive - and just as short-lived.`
      await Kestrel
        `...I don't mind indulging in nostalgia, but we have business now, don't we?`
      $.LEAF = 1
      return ['square', true] // We can use this method to pass arguments to the scene (ALL_FOUND will be true now).
    })
  },

  portal: async ({ Raven, Kestrel }) => {
    showScreen('portal') // I don't want to "await" here. It's my custom function anyway, not an engine's one.
    
    await Kestrel
      `The first white::glyph is white::Fish.`
      `The second one is white::Star.`
      `And third is... [500][white,slow::Leaf].`

    await showScreen('active_portal')

    await Kestrel.smiling
      `It worked! Looks like you and I are still a worthy team, right, Raven?`
      
    await Raven
      `Fascinating.`
      `I don't know what we'll find there.`
      `But the new world awaits.`

    clear()
    await sleep(1000)
    await print('[~]The End.[500] Thanks for playing.')

    // If a scene returns anything other than string, undefined or array starting with a string,
    // it is considered game over, and the return value is passed to "onGameEnd" callback.
    return await select("Replay the game", "Go to project's GitHub") // returns 0 or 1
  }

})
