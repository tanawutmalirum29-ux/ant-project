// Colony Milestones V1: presentation only. The simulation owns all progress.
const LABELS = Object.freeze({
  carbsSeen: 'พลังงานในคลัง', proteinSeen: 'โปรตีนในคลัง',
  waterSeen: 'น้ำในคลัง', digCompleted: 'ขุดอุโมงค์สำเร็จ',
  nurseryReadyConnected: 'ห้องเลี้ยงตัวอ่อนพร้อมใช้และเชื่อมต่อ',
  enemyDefeated: 'ปราบศัตรูจริง', queenAlive: 'นางพญายังมีชีวิต'
});

/** Format only fields from frozen Snapshot V1; do not infer game achievements. */
export function stageProgressLines(stage) {
  const p = stage.progress;
  switch (stage.id) {
    case 'stock-and-dig':
      return ['carbsSeen', 'proteinSeen', 'waterSeen', 'digCompleted']
        .map(key => ({ label: LABELS[key], value: p[key] ? 'สำเร็จ' : 'ยังไม่สำเร็จ' }));
    case 'nursery-and-workers':
      return [
        { label: LABELS.nurseryReadyConnected, value: p.nurseryReadyConnected ? 'พร้อม' : 'ยังไม่พร้อม' },
        { label: 'มดงานมีชีวิต', value: `${p.livingWorkers} / ${p.requiredWorkers} ตัว` }
      ];
    case 'defend-queen':
      return ['enemyDefeated', 'queenAlive']
        .map(key => ({ label: LABELS[key], value: p[key] ? 'สำเร็จ' : 'ยังไม่สำเร็จ' }));
    default:
      return []; // Do not invent progress for an unknown contract version.
  }
}

export class MilestonesPanel {
  constructor(game, options = {}) {
    const doc = options.document ?? document;
    this.document = doc;
    const byId = id => doc.getElementById(id);
    this.root = byId('milestones-panel');
    this.toggle = byId('milestones-toggle');
    this.closeButton = byId('milestones-close');
    this.summary = byId('milestones-summary');
    this.tickLabel = byId('milestones-tick');
    this.list = byId('milestones-list');
    this.game = game;
    this.onOpen = options.onOpen ?? null;
    this.lastSignature = null;
    this.toggle.addEventListener('click', () => this.setOpen(this.root.hidden));
    this.closeButton.addEventListener('click', () => this.setOpen(false, true));
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.root.hidden) {
        event.preventDefault();
        event.stopPropagation?.();
        this.setOpen(false, true);
      }
    });
    this.render(true);
  }

  setOpen(open, restoreFocus = false) {
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      this.onOpen?.();
      this.render(true);
      this.closeButton.focus({ preventScroll: true });
    } else if (restoreFocus) {
      this.toggle.focus({ preventScroll: true });
    }
  }

  /** Called after each new Game(seed); never retain references to the old Game. */
  setGame(game) {
    this.game = game;
    this.lastSignature = null;
    this.render(true);
  }

  /** Read-only snapshot, called from the existing HUD cadence in main.js. */
  render(force = false) {
    // The UI branch starts before the Core implementation has been integrated.
    const snapshot = this.game?.milestones?.getSnapshot?.() ?? null;
    const signature = JSON.stringify(snapshot);
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.list.replaceChildren();
    if (!snapshot) {
      this.summary.textContent = 'กำลังเชื่อมต่อระบบภารกิจ';
      this.tickLabel.textContent = 'รอข้อมูลจากเกม';
      return;
    }

    this.tickLabel.textContent = `ติ๊กจำลอง ${snapshot.tick}`;
    this.summary.textContent = snapshot.allComplete
      ? 'ภารกิจรังมดทั้ง 3 ขั้นสำเร็จแล้ว'
      : snapshot.activeStage === null
        ? 'กำลังอ่านสถานะภารกิจ'
        : `กำลังดำเนินการขั้น ${snapshot.activeStage + 1} จาก ${snapshot.stages.length}`;

    for (const [index, stage] of snapshot.stages.entries()) {
      const item = this.document.createElement('li');
      item.className = 'milestones-stage';
      item.dataset.stageId = stage.id;
      if (stage.complete) item.classList.add('is-complete');
      if (index === snapshot.activeStage) {
        item.classList.add('is-active');
        item.setAttribute('aria-current', 'step');
      }
      const header = this.document.createElement('div');
      header.className = 'milestones-stage-head';
      const title = this.document.createElement('strong');
      title.textContent = `${index + 1}. ${stage.title}`;
      const status = this.document.createElement('span');
      status.className = 'milestones-stage-status';
      status.textContent = stage.complete ? 'สำเร็จ' :
        index === snapshot.activeStage ? 'กำลังดำเนินการ' : 'ยังไม่ปลดล็อก';
      header.append(title, status);
      item.append(header);
      const details = this.document.createElement('ul');
      details.className = 'milestones-progress';
      for (const row of stageProgressLines(stage)) {
        const line = this.document.createElement('li');
        const name = this.document.createElement('span');
        name.textContent = row.label;
        const value = this.document.createElement('span');
        value.textContent = row.value;
        line.append(name, value);
        details.append(line);
      }
      item.append(details);
      if (stage.completedTick !== null) {
        const completed = this.document.createElement('small');
        completed.className = 'milestones-completed-tick';
        completed.textContent = `สำเร็จที่ติ๊ก ${stage.completedTick}`;
        item.append(completed);
      }
      this.list.append(item);
    }
  }
}
