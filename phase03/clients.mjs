// Client IDs are stable.
// Regions and stencils share the original 512 × 640 portrait coordinate system.
export const clients = {
  sofia: {
    name: 'Sofia', portrait: 'girl.webp', stencil: 'skin.svg', eyelids: 'eyelids.svg',
    openings: ['spot', 'pores', 'redness'],
    patchAnchors: [[181, 344], [331, 344]],
    palette: { redness: [225, 64, 100], pores: '#8f3855' },
    landmarks: { mouth: [256, 382, 50, 18], eyes: [[181, 291, 50, 35], [331, 291, 50, 35]],
      brows: [[183, 230, 45, 12], [330, 230, 45, 12]] },
    regions: [[256, 192, 46], [180, 338, 35], [330, 338, 35], [254, 350, 29], [254, 412, 25]]
  },
  emma: {
    name: 'Emma', portrait: 'emma.webp', stencil: 'skin-emma.svg?v=04e', eyelids: 'eyelids-emma.svg',
    openings: ['redness', 'spot', 'pores'],
    patchAnchors: [[184, 330], [326, 330]],
    palette: { redness: [208, 54, 91], pores: '#81344f' },
    landmarks: { mouth: [256, 396, 54, 19], eyes: [[187, 284, 46, 29], [325, 284, 46, 29]],
      brows: [[184, 240, 43, 12], [325, 240, 43, 12]] },
    regions: [[255, 203, 52], [181, 346, 40], [331, 346, 40], [253, 338, 31], [255, 439, 30]]
  },
  maya: {
    name: 'Maya', portrait: 'maya.webp', stencil: 'skin-maya.svg?v=04e', eyelids: 'eyelids-maya.svg',
    openings: ['pores', 'redness', 'spot'],
    patchAnchors: [[184, 345], [330, 345]],
    shadowTone: '76,28,65',
    palette: { redness: [236, 92, 122], pores: '#56212e' },
    landmarks: { mouth: [256, 412, 56, 23], eyes: [[189, 302, 46, 30], [324, 302, 46, 30]],
      brows: [[186, 250, 45, 14], [325, 250, 45, 14]] },
    regions: [[254, 208, 52], [179, 363, 36], [329, 363, 36], [254, 347, 30], [256, 454, 30]]
  },
  alice: {
    name: 'Alice', portrait: 'alice.webp', stencil: 'skin-alice.svg', eyelids: 'eyelids-alice.svg',
    openings: ['spot', 'redness', 'pores'],
    patchAnchors: [[188, 328], [328, 328]],
    palette: { redness: [220, 63, 98], pores: '#853747' },
    landmarks: { mouth: [257, 383, 47, 15], eyes: [[185, 283, 42, 29], [328, 282, 43, 29]],
      brows: [[191, 222, 35, 9], [326, 221, 38, 9]] },
    regions: [[259, 181, 43], [177, 348, 31], [338, 348, 31], [257, 337, 27], [257, 415, 22]]
  },
  martina: {
    name: 'Martina', portrait: 'martina.webp', stencil: 'skin-martina.svg', eyelids: 'eyelids-martina.svg',
    openings: ['redness', 'spot', 'pores'],
    patchAnchors: [[190, 324], [326, 324]],
    palette: { redness: [235, 87, 105], pores: '#713047' },
    shadowTone: '92,31,70',
    landmarks: { mouth: [256, 382, 45, 15], eyes: [[185, 284, 42, 27], [328, 283, 43, 27]],
      brows: [[191, 233, 35, 10], [326, 232, 38, 10]] },
    regions: [[256, 190, 35], [177, 349, 31], [337, 349, 31], [256, 336, 25], [257, 421, 19]]
  },
  federica: {
    name: 'Federica', portrait: 'federica.webp', stencil: 'skin-federica.svg', eyelids: 'eyelids-federica.svg',
    openings: ['pores', 'redness', 'spot'],
    patchAnchors: [[187, 325], [326, 325]],
    palette: { redness: [216, 64, 104], pores: '#913c51' },
    landmarks: { mouth: [256, 381, 47, 15], eyes: [[185, 282, 43, 28], [327, 282, 43, 28]],
      brows: [[191, 228, 36, 10], [325, 228, 36, 10]] },
    regions: [[255, 187, 36], [176, 342, 31], [337, 342, 31], [256, 342, 27], [255, 419, 19]]
  },
  rachele: {
    name: 'Rachele', portrait: 'rachele.webp', stencil: 'skin-rachele.svg', eyelids: 'eyelids-rachele.svg',
    openings: ['spot', 'pores', 'redness'],
    patchAnchors: [[195, 325], [319, 325]],
    palette: { redness: [224, 77, 104], pores: '#783044' },
    shadowTone: '104,42,86',
    landmarks: { mouth: [258, 377, 44, 14], eyes: [[196, 282, 38, 25], [318, 282, 38, 25]],
      brows: [[198, 240, 32, 10], [317, 239, 33, 10]] },
    regions: [[254, 197, 39], [182, 344, 27], [330, 344, 27], [254, 341, 22], [256, 407, 16]]
  },
  ginevra: {
    name: 'Ginevra', portrait: 'ginevra.webp', stencil: 'skin-ginevra.svg', eyelids: 'eyelids-ginevra.svg',
    openings: ['redness', 'pores', 'spot'],
    patchAnchors: [[187, 326], [324, 326]],
    palette: { redness: [214, 62, 101], pores: '#873551' },
    landmarks: { mouth: [257, 387, 46, 15], eyes: [[187, 282, 42, 28], [326, 282, 42, 28]],
      brows: [[191, 233, 37, 10], [325, 233, 37, 10]] },
    regions: [[256, 193, 39], [175, 347, 31], [337, 347, 31], [256, 343, 25], [256, 425, 17]]
  },
  chiara: {
    name: 'Chiara', portrait: 'chiara.webp', stencil: 'skin-chiara.svg', eyelids: 'eyelids-chiara.svg',
    openings: ['pores', 'spot', 'redness'],
    patchAnchors: [[191, 328], [324, 328]],
    palette: { redness: [225, 72, 102], pores: '#84354b' },
    shadowTone: '105,43,83',
    landmarks: { mouth: [256, 381, 47, 15], eyes: [[190, 282, 40, 27], [323, 282, 40, 27]],
      brows: [[194, 233, 37, 10], [321, 234, 35, 10]] },
    regions: [[256, 194, 36], [177, 346, 28], [335, 346, 28], [256, 338, 25], [256, 412, 17]]
  },
  azzurrina: {
    name: 'Azzurrina', portrait: 'azzurrina.webp', stencil: 'skin-azzurrina.svg', eyelids: 'eyelids-azzurrina.svg',
    openings: ['spot', 'redness', 'pores'],
    patchAnchors: [[190, 327], [320, 327]],
    palette: { redness: [220, 69, 103], pores: '#8a3b55' },
    landmarks: { mouth: [257, 385, 47, 14], eyes: [[191, 282, 41, 27], [322, 282, 42, 27]],
      brows: [[198, 233, 34, 10], [317, 231, 37, 10]] },
    regions: [[255, 193, 36], [181, 345, 28], [331, 345, 28], [256, 336, 25], [256, 419, 17]]
  }
};
