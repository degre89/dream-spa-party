// Portrait-specific timing and expression strength in the Studio only.
// Eye poses are shared by the portrait overlay and the pigment renderer.
export const reactions = {
  sofia:     { pause: 4700, blink: 150, smile: .48 },
  emma:      { pause: 3400, blink: 155, smile: .92 },
  maya:      { pause: 5400, blink: 280, smile: .45, eyes: .94 },
  alice:     { pause: 4300, blink: 230, smile: .58, wink: 'left' },
  martina:   { pause: 4900, blink: 165, smile: .60 },
  federica:  { pause: 3700, blink: 175, smile: 1 },
  rachele:   { pause: 4050, blink: 180, smile: .67, brows: 1.3 },
  ginevra:   { pause: 5600, blink: 370, smile: .55 },
  chiara:    { pause: 4550, blink: 175, smile: .78, wink: 'right', twice: true },
  azzurrina: { pause: 5100, blink: 195, smile: .65, magic: true },
};

export function reactionFrames(profile) {
  if (!profile.wink) return [];
  const poses = [[120, profile.wink], [120 + profile.blink, false]];
  if (profile.twice) poses.push([515, profile.wink], [515 + profile.blink, false]);
  return poses;
}

export function eyeSlices(pose, width) {
  if (pose === true) return [[0, width]];
  if (pose === 'left') return [[0, width / 2]];
  if (pose === 'right') return [[width / 2, width / 2]];
  return [];
}
