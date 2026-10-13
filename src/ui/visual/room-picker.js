/* Ant Kingdom UI V2.1: presentation-only room chooser.
   The original #room-type <select> remains authoritative for U5 gameplay. */
(() => {
  const select = document.getElementById('room-type');
  const palette = document.getElementById('room-palette');
  if (!select || !palette || select.dataset.visualPicker === 'ready') return;

  const icons = {
    food_store: '◉', water_store: '◈', nursery: '✿', rest: '☾', guard: '⬡'
  };
  const picker = document.createElement('div');
  picker.className = 'room-picker';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'room-picker-toggle';
  trigger.className = 'room-picker-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'room-picker-options');
  const mark = document.createElement('span');
  mark.className = 'room-picker-mark';
  mark.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'room-picker-name';
  const arrow = document.createElement('span');
  arrow.className = 'room-picker-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '⌄';
  trigger.append(mark, title, arrow);
  const list = document.createElement('div');
  list.id = 'room-picker-options';
  list.className = 'room-picker-options';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'เลือกประเภทห้องที่จะสร้าง');
  list.hidden = true;
  const options = [];
  for (const option of select.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'room-picker-option';
    button.dataset.roomValue = option.value;
    button.setAttribute('role', 'option');
    const glyph = document.createElement('span');
    glyph.className = 'room-picker-mark';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = icons[option.value] || '▣';
    const label = document.createElement('span');
    label.textContent = option.textContent;
    button.append(glyph, label);
    button.addEventListener('click', () => {
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      close(true);
    });
    list.append(button);
    options.push(button);
  }
  picker.append(trigger, list);
  select.after(picker);

  function sync() {
    const value = select.value;
    const selected = [...select.options].find(o => o.value === value);
    title.textContent = selected?.textContent || 'เลือกประเภทห้อง';
    mark.textContent = icons[value] || '▣';
    for (const button of options) {
      button.setAttribute('aria-selected', String(button.dataset.roomValue === value));
    }
  }
  function close(restoreFocus = false) {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !palette.classList.contains('hidden')) trigger.focus();
  }
  function open() {
    if (palette.classList.contains('hidden')) return;
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  }
  trigger.addEventListener('click', () => {
    if (list.hidden) open(); else close();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      if (list.hidden) {
        event.preventDefault();
        open();
        options.find(b => b.dataset.roomValue === select.value)?.focus();
      }
    }
    if (event.key === 'Escape') close(true);
  });
  list.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length].focus();
    }
    if (event.key === 'Home') { event.preventDefault(); options[0]?.focus(); }
    if (event.key === 'End') { event.preventDefault(); options[options.length - 1]?.focus(); }
  });
  select.addEventListener('change', sync);
  document.addEventListener('pointerdown', event => {
    if (!picker.contains(event.target)) close();
  });
  const observer = new MutationObserver(() => {
    if (palette.classList.contains('hidden')) close();
  });
  observer.observe(palette, { attributes: true, attributeFilter: ['class'] });
  // Leave the real select operational as a fallback and for existing test controls.
  sync();
  palette.classList.add('room-picker-ready');
  select.dataset.visualPicker = 'ready';
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
})();
