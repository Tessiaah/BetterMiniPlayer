type IconName = 'play' | 'pause' | 'backward' | 'forward' | 'close';
const paths: Record<IconName, string> = {
  play: 'm9 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  backward: 'M3.5 8.5A9 9 0 1 1 3 14M3.5 3.5v5h5',
  forward: 'M20.5 8.5A9 9 0 1 0 21 14M20.5 3.5v5h-5',
  close: 'm6 6 12 12M18 6 6 18',
};

export function createIcon(doc: Document, name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  const path = doc.createElementNS(ns, 'path');
  path.setAttribute('d', paths[name]);
  if (name === 'play') { path.setAttribute('fill', 'currentColor'); path.setAttribute('stroke', 'none'); }
  if (name === 'pause') path.setAttribute('stroke-width', '3.5');
  svg.append(path);
  if (name === 'backward' || name === 'forward') {
    const text = doc.createElementNS(ns, 'text');
    for (const [key, value] of Object.entries({ x: '12', y: '15.5', fill: 'currentColor', stroke: 'none', 'text-anchor': 'middle', 'font-size': '9', 'font-family': 'system-ui', 'font-weight': '650' })) text.setAttribute(key, value);
    text.textContent = '10';
    svg.append(text);
  }
  return svg;
}
