/**
 * A function for preloading graphic assets, all parameters are optional. For it to work, provide
 * either a path to a JSON file with a list of resource paths, or a list of resource paths directly.
 * @param {object} params
 * @param {string} params.fromFile A path to a JSON file with a list of resource paths (relative to the file path).
 * @param {string[]} params.fromList An array with resource paths.
 * @param {function} params.onProgress A callback that gets the number of currently loaded and total resources.
 * @param {function} params.onComplete Fires on completion, receiving a boolean indicator of whether the download was error-free.
 * @returns {Promise<boolean>} A promise that resolves to the same value that is passed to the onComplete callback.
 * @example
 *    cacheResources({
 *      fromList: [
 *        './assets/characters/Raven/normal.png',
 *        './assets/characters/Raven/gloomy.png'
 *      ],
 *      fromFile: './assets/screens/resources.json',
 *      onProgress: (cur, max) => {
 *        console.log(`Loaded: ${cur} of ${max}`)
 *      },
 *      onComplete: (success) => { }
 *    });
 */
export default async function cacheResources({
  fromFile = '',
  fromList = [],
  onProgress = (_current, _total) => { },
  onComplete = (_success) => { }
} = {}) {
  const tasks = [];
  let loaded = 0;
  let errors = 0;
  if (fromFile) {
    const response = await fetch(fromFile);
    const pathToFile = fromFile.split('/').slice(0, -1).join('/');
    fromList = [
      ...fromList,
      ...(await response.json())
        .map(str => pathToFile + (str.startsWith('/') ? str : '/' + str))
    ];
  }
  for (const path of fromList) {
    const image = new Image();
    image.src = path;
    tasks.push(new Promise((resolve) => {
      image.onload = () => {
        loaded += 1;
        onProgress(loaded, tasks.length);
        resolve();
      };
      image.onerror = () => {
        errors += 1;
        onProgress(loaded, tasks.length);
        resolve();
      };
    }));
  }
  await Promise.all(tasks);
  onComplete(errors === 0);
  return errors === 0;
}
