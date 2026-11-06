// Observe the frame changes in the page, before replaying the hint.
export function captureSpeech(portraitLocator) {
  return portraitLocator.evaluate(portrait => new Promise(resolve => {
    const canvas = portrait.querySelector('.reaction-face');
    const context = canvas.getContext('2d');
    const samples = new Map();
    const observer = new MutationObserver(() => {
      const frame = portrait.dataset.mouth;
      if (frame && !canvas.hidden && !samples.has(frame)) {
        samples.set(frame, context.getImageData(0, 0, canvas.width, canvas.height).data);
      }
      if (samples.size === 2) finish();
    });
    const timeout = setTimeout(finish, 3000);
    function finish() {
      clearTimeout(timeout);
      observer.disconnect();
      resolve({
        changed: samples.size === 2 && samples.get('1').some((pixel, i) => pixel !== samples.get('2')[i]),
        heroHidden: getComputedStyle(portrait.querySelector('img.hero')).opacity === '0'
      });
    }
    observer.observe(portrait, { attributes: true, attributeFilter: ['data-mouth'] });
    document.querySelector('#repeatHint').click();
  }));
}
