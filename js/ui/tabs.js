// Three-tab layer. Panels persist; switching toggles hidden. Badges are dots.
export function createTabs(app, names) {
  const bar = document.createElement('nav');
  bar.className = 'tabBar';
  const panels = {};
  const buttons = {};
  let current = 'tonight';
  for (const id of ['tonight', 'log', 'roost']) {
    const btn = document.createElement('button');
    btn.className = 'tabBtn';
    btn.dataset.testid = 'tab-' + id;
    btn.appendChild(document.createTextNode(names.tabs[id]));
    const dot = document.createElement('span');
    dot.className = 'tabDot';
    dot.hidden = true;
    btn.appendChild(dot);
    btn.addEventListener('click', () => show(id));
    bar.appendChild(btn);
    buttons[id] = { btn, dot };
    const panel = document.createElement('section');
    panel.className = 'tabPanel';
    panel.dataset.tab = id;
    panels[id] = panel;
  }
  function show(id) {
    current = id;
    for (const key of Object.keys(panels)) {
      panels[key].hidden = key !== id;
      buttons[key].btn.classList.toggle('active', key === id);
    }
    if (id !== 'tonight') buttons[id].dot.hidden = true;
  }
  show('tonight');
  return {
    bar, panels, show,
    active: () => current,
    setBadge(id, on) { buttons[id].dot.hidden = !on; },
  };
}
