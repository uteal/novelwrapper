
export default class SoundController {

  #sounds = {};
  #searchTemplate;
  #defaultVolume = 1;
  #exited = false;

  /**
   * A simple class for loading and playing sounds.
   * @param {string} searchTemplate Sound search template. The * will be replaced with the requested name. Default is "./sounds/*.ogg".
   * @returns {SoundController}
   * @example
   *    const sc = new SoundController()
   *    sc.play("main_theme")       // Load audio from "./sounds/main_theme.ogg" and play it.
   *    sc.play("main_theme", 0.5)  // The same, but at half volume.
   *    sc.load("main_theme")       // Just load audio without playing. Useful for precaching.
   *    await sc.load("main_theme") // Wait for the audio to be ready for playing.
   *    await sc.play("main_theme") // Wait for the audio to be loaded and played.
   *    sc.setVolume(0.75)          // Set default volume.
   *    sc.stopAll()                // Stop all sounds.
   *    sc.exit()                   // Destroy the SoundController instance.
   */
  constructor(searchTemplate = './sounds/*.ogg') {
    this.#searchTemplate = searchTemplate;
  }

  async play(name, volume = this.#defaultVolume) {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    if (!Object.hasOwn(this.#sounds, name)) {
      try {
        await this.load(name);
      } catch (e) {
        return;
      }
    }
    if (this.#exited) {
      reject();
      return;
    }
    const onEnded = () => {
      this.#sounds[name].removeEventListener('ended', onEnded);
      if (this.#exited) {
        reject();
        return;
      }
      resolve();
    };
    this.#sounds[name].volume = volume;
    this.#sounds[name].play();
    this.#sounds[name].addEventListener('ended', onEnded);
    await promise;
  }

  load(name) {
    return new Promise((resolve, reject) => {
      if (this.#exited) {
        reject();
        return;
      }
      if (Object.hasOwn(this.#sounds, name)) {
        resolve();
        return;
      }
      this.#sounds[name] = new Audio(this.#searchTemplate.replace('*', name));
      this.#sounds[name].addEventListener('canplaythrough', resolve);
      this.#sounds[name].addEventListener('error', reject);
    });
  }

  setVolume(volume = 1) {
    this.#defaultVolume = volume;
  }

  stopAll() {
    for (const sound of Object.values(this.#sounds)) {
      sound.pause();
      sound.currentTime = 0;
    }
  }

  exit() {
    this.#exited = true;
    this.stopAll();
    this.#sounds = {};
  }

}
