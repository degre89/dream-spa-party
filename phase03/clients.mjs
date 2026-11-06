// Regions and stencils share the original 512 × 640 portrait coordinate system.
export const clients = {
  sofia: {
    name: 'Sofia', portrait: 'girl.webp', stencil: 'skin.svg', eyelids: 'eyelids.svg',
    regions: [[256, 192, 46], [180, 338, 35], [330, 338, 35], [254, 350, 29], [254, 412, 25]]
  },
  emma: {
    name: 'Emma', portrait: 'emma.webp', stencil: 'skin-emma.svg?v=04e', eyelids: 'eyelids-emma.svg',
    regions: [[255, 203, 52], [181, 346, 40], [331, 346, 40], [253, 338, 31], [255, 439, 30]]
  },
  maya: {
    name: 'Maya', portrait: 'maya.webp', stencil: 'skin-maya.svg?v=04e', eyelids: 'eyelids-maya.svg',
    regions: [[254, 208, 52], [179, 363, 36], [329, 363, 36], [254, 347, 30], [256, 454, 30]]
  }
};
