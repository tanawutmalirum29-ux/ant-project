/* Cross-platform game choice UI: real DOM buttons styled by CSS.
 * Native <select> remains the authoritative value for gameplay, events and
 * compatibility, but never opens the operating-system picker after enhancement.
 * The room selector already has its own production game-styled picker. */
(() => {
  const selects = [...document.querySelectorAll('#app select:not(#room-type)')];

  for (const select of selects) {
    if (select.dataset.gameChoice === 'ready' || !select.id) continue;

    const picker = document.createElement('div');
    picker.className = 'game-choice';
    picker.dataset.for = select.id;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'game-choice-trigger';
    trigger.id = select.id + '-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', select.id + '-options');
    const value = document.createElement('span');
    value.className = 'game-choice-value';
    const arrow = document.createElement('span');
    arrow.className = 'game-choice-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '⌄';
    trigger.append(value, arrow);

    const list = document.createElement('div');
    list.className = 'game-choice-options';
    list.id = select.id + '-options';
    list.setAttribute('role', 'listbox');
    list.hidden = true;

    const labels = [...document.querySelectorAll('label[for]')].filter(l => l.htmlFor === select.id);
    const labelText = labels.map(l => l.textContent.trim()).join(' ') || select.getAttribute('aria-label') || 'เลือกตัวเลือก';
    list.setAttribute('aria-label', labelText);

    const buttons = [...select.options].map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-choice-option';
      button.setAttribute('role', 'option');
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      button.disabled = option.disabled;
      button.addEventListener('click', () => {
        if (select.value !== option.value) {
          select.value = option.value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        close(true);
      });
      list.append(button);
      return button;
    });

    picker.append(trigger, list);
    select.after(picker);

    function sync() {
      const selected = [...select.options].find(o => o.value === select.value);
      value.textContent = selected?.textContent || labelText;
      trigger.setAttribute('aria-label', labelText + ': ' + value.textContent);
      for (const button of buttons)
        button.setAttribute('aria-selected', String(button.dataset.value === select.value));
    }
    function close(focus = false) {
      list.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (focus) trigger.focus();
    }
    function open() {
      if (trigger.disabled) return;
      document.querySelectorAll('.game-choice-options:not([hidden])').forEach(other => {
        if (other !== list) {
          other.hidden = true;
          other.previousElementSibling?.setAttribute('aria-expanded', 'false');
        }
      });
      list.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      // Nested Nursery scroll pane: keep the list usable even at 320px.
      list.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    trigger.addEventListener('click', () => list.hidden ? open() : close());
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        if (list.hidden) open();
        (buttons.find(b => b.dataset.value === select.value && !b.disabled) || buttons.find(b => !b.disabled))?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation(); // Escape only closes this dropdown, not Nursery drawer.
        close(true);
      }
    });
    list.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      const active = buttons.filter(b => !b.disabled);
      const index = active.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 :
          event.key === 'End' ? active.length - 1 :
          (index + (event.key === 'ArrowDown' ? 1 : active.length - 1)) % active.length;
        active[next]?.focus();
      }
    });
    picker.addEventListener('focusout', event => {
      if (!event.relatedTarget || !picker.contains(event.relatedTarget)) close();
    });
    document.addEventListener('pointerdown', event => {
      if (!picker.contains(event.target)) close();
    });
    select.addEventListener('change', sync);
    for (const label of labels) label.htmlFor = trigger.id;
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    select.dataset.gameChoice = 'ready';
    sync();
  }
})();
