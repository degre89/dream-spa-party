const definitions = {
  cleanser: [
    ['strawberry', 'Fragola', '#ff769e', '#c72c60', '●', '🍓'],
    ['peach', 'Pesca', '#ffc394', '#df7040', '○', '◌'],
    ['lavender', 'Lavanda', '#d9b5ff', '#874cbb', '❋', '❋'],
    ['coconut', 'Cocco', '#f7ffff', '#76c6e5', '◒', '○'],
  ],
  cream: [
    ['rose', 'Rosa', '#ffd6e5', '#db78a6', '❀', '❀ ✧'],
    ['vanilla', 'Vaniglia', '#fff1ba', '#d4a047', '★', '✦'],
    ['aloe', 'Aloe', '#a9efdc', '#3ba68f', '♢', '♦'],
    ['blueberry', 'Mirtillo', '#c4b5fd', '#6359bb', '●', '• ✦'],
  ],
  sponge: [
    ['classic', 'Classica', '#ffe3a0', '#ef9a53', '', '○'],
    ['heart', 'Cuore', '#ffa9cb', '#d74a88', '', '♡'],
    ['flower', 'Fiore', '#f5baff', '#a55ac9', '', '❀'],
    ['star', 'Stellina', '#fff3a4', '#e5a142', '', '☆'],
  ],
  steamer: [
    ['classic', 'Classico rosa', '#ffbada', '#c75592', '○', ''],
    ['stars', 'Lilla con stelline', '#d6beff', '#865ab7', '★', ''],
    ['cloud', 'Azzurro con nuvole', '#b1e6ff', '#569fc6', '☁', ''],
    ['pearl', 'Rosa perlato con cuori', '#ffeaf0', '#d893b6', '♥', ''],
  ],
};

const spongeShapes = {
  classic: 'M12 22Q12 13 23 13H43Q54 13 54 24V40Q54 50 43 50H23Q12 50 12 39Z',
  heart: 'M32 52C24 45 9 35 9 23C9 10 25 7 32 19C40 7 55 10 55 23C55 35 40 46 32 52Z',
  flower: 'M32 15C42 1 55 12 49 23C65 24 63 44 47 43C51 58 33 62 28 48C17 59 3 47 13 36C0 27 10 12 23 20C21 13 26 9 32 15Z',
  star: 'M32 6Q34 6 36 13L41 23L54 25Q61 26 56 31L46 41L48 54Q49 60 43 57L32 51L20 57Q14 60 15 54L18 41L8 31Q3 26 10 25L23 23L28 12Q30 6 32 6Z',
};

function illustration(category, key, light, dark, badge) {
  const badgeText = '<text x="32" y="43" text-anchor="middle" font-size="16" fill="' + dark + '">' + badge + '</text>';
  const art = {
    cleanser: '<path d="M28 16V9H45V13H35V19" fill="' + dark + '"/><rect x="17" y="17" width="30" height="40" rx="10" fill="url(#body)"/><rect x="21" y="27" width="22" height="20" rx="7" fill="#fff9"/>' + badgeText,
    cream: '<rect x="11" y="25" width="42" height="29" rx="10" fill="url(#body)"/><rect x="9" y="17" width="46" height="12" rx="5" fill="' + light + '"/><ellipse cx="32" cy="19" rx="18" ry="3" fill="#fff9"/>' + badgeText,
    sponge: '<path d="' + (spongeShapes[key] ?? spongeShapes.classic) + '" fill="url(#body)"/><path d="M23 28h.1m8-5h.1m8 10h.1m-10 5h.1m10 5h.1" fill="none" stroke="#fff9" stroke-width="3" stroke-linecap="round"/>',
    steamer: '<path d="M27 37V23L13 16L8 21L22 31V45" fill="' + dark + '"/><path d="M20 48C20 38 25 32 35 32H43C53 32 58 42 58 51Q57 57 49 57H27Q20 57 20 48Z" fill="url(#body)"/><ellipse cx="41" cy="49" rx="10" ry="6" fill="#fff8"/><text x="41" y="53" text-anchor="middle" font-size="12" fill="' + dark + '">' + badge + '</text>',
  };
  return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="body" x2=".4" y2="1"><stop stop-color="' + light + '"/><stop offset="1" stop-color="' + dark + '"/></linearGradient></defs>' + art[category] + '</svg>');
}

export const products = Object.fromEntries(Object.entries(definitions).map(([category, variants]) => [
  category,
  variants.map(([key, name, light, dark, badge, glyph], index) => ({
    id: category + '-' + key,
    category,
    name,
    asset: illustration(category, key, light, dark, badge),
    effect: { glyph, color: light, shadow: dark },
    availability: index === 0 ? 'free' : 'unlockable',
    futurePrice: null,
  })),
]));
