// Interpolate the moving jet across the same skin cells used by the treatments.
export function prepareSkin(session, point) {
  const from = session.lastPoint;
  if (!from) {
    session.lastPoint = point;
    return false;
  }
  const distance = Math.hypot(point.x - from.x, point.y - from.y);
  if (distance < 4) return false;
  session.lastPoint = point;

  const samples = Math.ceil(distance / 18);
  let reached = false;
  for (let i = 1; i <= samples; i++) {
    const x = from.x + (point.x - from.x) * i / samples;
    const y = from.y + (point.y - from.y) * i / samples;
    if (!session.skinAt(x, y)) continue;
    reached = true;
    for (const cell of session.cells) {
      if (!cell.prepared && (cell.x - x) ** 2 + (cell.y - y) ** 2 <= 52 ** 2) cell.prepared = true;
    }
  }
  return reached;
}
