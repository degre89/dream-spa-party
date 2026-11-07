// Traced against the 512 × 640 source portraits. Left/right are screen sides.
// Open-eye arcs sit above the iris and preserve the lash line.
export const faces = {
  sofia: {
    shadow: [
      'M154 266 C169 252 202 250 221 267 Q228 273 232 284 C215 257 178 260 154 270 Z',
      'M280 284 C289 260 314 247 342 254 Q352 257 359 265 L359 269 C329 257 299 261 280 284 Z',
    ],
    closed: [
      'M145 284 C156 257 202 249 222 272 Q229 280 224 298 Q181 311 145 284 Z',
      'M288 298 Q280 281 299 268 C324 250 355 264 366 284 Q327 311 288 298 Z',
    ],
    blush: [[178, 345, 42, 23], [334, 345, 42, 23]],
    lips: [
      'M211 376 Q225 382 243 376 Q250 373 256 376 Q263 373 273 376 Q286 381 300 376 Q285 385 256 387 Q229 385 211 376Z',
      'M215 379 Q252 394 298 378 C282 393 275 398 255 399 Q233 399 215 379Z',
    ],
    jewels: [[178, 339, 25, 12], [334, 339, 25, 12], [257, 204, 18, 13]],
  },
  azzurrina: {
    shadow: [
      'M161 263 C170 248 193 247 207 251 Q220 255 225 273 C210 251 180 252 161 266Z',
      'M289 274 Q298 247 325 248 Q346 249 355 263 L355 267 Q323 247 296 266Z',
    ],
    closed: [
      'M150 277 C160 253 201 248 220 266 Q226 277 226 292 Q182 298 150 277Z',
      'M289 292 Q292 261 314 254 C337 248 355 259 363 276 Q332 299 289 292Z',
    ],
    blush: [[182, 339, 35, 22], [331, 339, 35, 22]],
    lips: [
      'M216 377 Q230 382 245 376 Q251 373 256 376 Q262 374 271 376 Q285 381 297 377 Q280 386 257 386 Q235 385 216 377Z',
      'M220 380 Q253 392 295 379 C280 392 272 398 257 398 Q237 397 220 380Z',
    ],
    jewels: [[181, 334, 20, 13], [332, 334, 20, 13], [256, 203, 15, 13]],
  },
};

export const palettes = {
  shadow: { label: 'Ombretto', hint: 'Sfuma sopra le ciglia con il pennellino.', radius: 16, colors: [
    ['Rosa confetto', '#f779bf'], ['Lilla', '#b685f6'], ['Azzurro cielo', '#4faeff'],
    ['Turchese', '#20cabd'], ['Viola', '#8e47d9'], ['Oro perlato', '#f1be64'],
  ] },
  blush: { label: 'Blush', hint: 'Fai piccoli cerchi sulle guance.', radius: 24, colors: [
    ['Rosa', '#f75c9e'], ['Pesca', '#ff985f'], ['Lilla', '#b478e9'], ['Corallo', '#f65a70'],
  ] },
  lips: { label: 'Labbra', hint: 'Passa l’applicatore lungo le labbra.', radius: 13, colors: [
    ['Rosa brillante', '#f04d9a'], ['Pesca perlato', '#f58b6d'], ['Lilla', '#ab68d3'],
    ['Fucsia', '#d82a91'], ['Gloss trasparente', null],
  ] },
  jewels: { label: 'Decori', hint: 'Prova il decoro sul viso e solleva il dito per fissarlo. Tocca un decoro già presente per toglierlo.', colors: [
    ['Stellina', '#ffe18a', '★'], ['Cuoricino', '#ff82be', '♥'],
    ['Farfallina', '#c0a8ff', 'butterfly'], ['Brillantino', '#a7f2ff', '◆'],
  ] },
};
