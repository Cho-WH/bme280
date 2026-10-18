import { createGuideLayout } from './guide-layout.js';

const GROUP_LABELS = ['준비물', '배선', 'USB', '프로그램', '통신 연결', '배터리', '용기'];
const WIRING = [
  ['vcc', '전원', 'V', 'VCC'], ['gnd', '접지', 'G', 'GND'],
  ['scl', '클록', 'CL · P19', 'SCL'], ['sda', '데이터', 'DA · P20', 'SDA'],
];

function renderText(root, step) {
  root.querySelector('.step-counter').textContent = `${String(step.group).padStart(2, '0')} / 07 · ${step.label}`;
  root.querySelector('.step-title').textContent = step.title;
  root.querySelector('.step-description').textContent = step.description;
}

function createWiringTable(host) {
  const table = document.createElement('table');
  table.className = 'wiring-table';
  table.innerHTML = '<caption>확장 보드 ↔ BMP280 배선표</caption><thead><tr><th scope="col">역할</th><th scope="col">확장 보드</th><th scope="col">BMP280</th></tr></thead><tbody></tbody>';
  const rows = WIRING.map(([wire, role, board, sensor]) => {
    const row = table.tBodies[0].insertRow();
    const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = role;
    const marker = document.createElement('small'); marker.textContent = '현재 단계'; marker.hidden = true;
    heading.append(marker); row.append(heading);
    for (const pin of [board, sensor]) {
      const label = document.createElement('span'); label.className = 'pin-label'; label.textContent = pin;
      row.insertCell().append(label);
    }
    return { wire, row, marker };
  });
  host.replaceChildren(table);
  return wire => rows.forEach(item => {
    const active = item.wire === wire;
    item.row.classList.toggle('wire-active', active);
    item.marker.hidden = !active;
  });
}

// Owns preparation presentation only. Navigation and device operations stay in app.js.
export function createGuideView({ root, steps, onSelectStep, onRestore }) {
  const get = id => root.querySelector(`#${id}`);
  const content = root.querySelector('.step-content');
  const progress = get('guide-progress');
  const listeners = new AbortController();
  const listen = (element, action) => element.addEventListener('click', action, { signal: listeners.signal });
  let step = steps[0], busy = false, viewerState = 'loading', mode = '3d';
  let completed = new Set();
  const highlightWire = createWiringTable(get('fallback-table'));
  const buttons = GROUP_LABELS.map((label, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button';
    const text = document.createElement('span'); text.textContent = `${index + 1} ${label}`;
    const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    check.setAttribute('viewBox', '0 0 24 24'); check.setAttribute('aria-hidden', 'true');
    check.classList.add('step-check');
    check.innerHTML = '<path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    button.append(text, check);
    listen(button, () => { if (!busy) onSelectStep(steps.find(candidate => candidate.group === index + 1)); });
    item.append(button); progress.append(item);
    return button;
  });
  const layout = createGuideLayout({ content, progress, steps,
    measureSteps: steps.filter(candidate => candidate.model.wire),
    createMeasurement(candidate) {
      const copy = document.createElement('div');
      copy.className = 'step-content'; copy.dataset.group = '2';
      for (const selector of ['.step-counter', '.step-title', '.step-description', '#wiring-note']) {
        const element = content.querySelector(selector).cloneNode(true);
        element.removeAttribute('id'); element.removeAttribute('tabindex'); element.hidden = false;
        copy.append(element);
      }
      renderText(copy, candidate);
      return copy;
    },
  });

  function renderNavigation() {
    buttons.forEach((button, index) => {
      button.disabled = busy;
      const done = steps.filter(candidate => candidate.group === index + 1).every(candidate => completed.has(candidate.id));
      button.classList.toggle('completed', done);
      button.setAttribute('aria-label', `${index + 1} ${GROUP_LABELS[index]}${done ? ', 완료' : ''}`);
      if (index + 1 === step.group) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    get('previous-step').disabled = step === steps[0] || busy;
    layout.syncProgress();
  }

  function renderViewer() {
    const placement = step.id === 'placement';
    const wiringStep = step.group <= 2;
    const unavailable = viewerState === 'unavailable';
    const fallback = (wiringStep && mode === 'table') || unavailable;
    get('guide-frame').hidden = placement || fallback;
    get('placement-figure').hidden = !placement;
    get('model-fallback').hidden = placement || !fallback;
    get('model-toolbar').hidden = placement;
    get('viewer-modes').hidden = !wiringStep && !unavailable;
    get('show-3d').disabled = unavailable;
    get('show-3d').setAttribute('aria-pressed', String(!fallback));
    get('show-wiring').setAttribute('aria-pressed', String(fallback));
    get('restore-view').hidden = placement || fallback;
    root.querySelector('.model-panel').dataset.mode = placement ? 'placement' : fallback ? 'table' : '3d';
    const status = unavailable ? '3D를 표시할 수 없어 배선표를 보여드려요.'
      : !fallback && viewerState !== 'applied' ? '3D를 불러오는 중…' : '';
    get('viewer-status').hidden = placement || !status;
    get('viewer-status').textContent = status;
    highlightWire(step.model.wire);
  }

  function renderProgram(next) {
    busy = next.busy;
    renderNavigation();
    get('program-message').textContent = next.message;
    get('program-message').dataset.status = next.status;
    get('program-progress').hidden = next.status !== 'flashing';
    if (next.progress === null) get('program-progress').removeAttribute('value');
    else get('program-progress').value = next.progress;
    get('program-progress-text').textContent = next.status === 'flashing' && next.progress !== null ? `${next.progress}%` : '';
    get('install-program').textContent = next.busy ? (next.status === 'loading' ? '프로그램 준비 중…' : '설치 진행 중…')
      : next.status === 'success' ? '프로그램 다시 설치' : next.status === 'error' ? (next.canInstall ? '다시 설치' : '다시 준비') : 'USB로 프로그램 설치';
    get('skip-program').hidden = next.status === 'success';
    get('skip-program').disabled = next.busy;
  }

  function renderStatus({ saved, live, connection, program, actions, supported, secure, snapshot, fresh, ready }) {
    get('device-name').textContent = connection.deviceName && connection.status === 'connected' ? connection.deviceName : '마이크로비트 연결';
    get('connect').disabled = !actions.canConnect;
    if (supported && secure) get('connection-help').textContent = saved?.runStatus === 'complete'
      ? '측정을 마친 실험이에요. 위의 추가 측정으로 이어가거나 새 실험을 시작하세요.'
      : !actions.canConnectSource && saved ? '재생 또는 가져온 자료예요. 실제 장치 기록은 새 실험에서 시작하세요.'
        : live?.state === 'paused' ? '기록 일시정지 중이에요. 연결해도 기록 재개 전에는 현재 값만 표시합니다.'
          : !live ? '이어 측정을 선택한 뒤 장치를 연결해 주세요.' : '전원을 켠 뒤 사용할 장치를 선택하세요.';
    get('install-program').disabled = program.busy || connection.busy || (!program.canInstall && program.status !== 'error');
    get('connect').textContent = connection.status === 'connecting' ? '장치 연결 중…' : connection.status === 'connected' ? '연결됨' : '마이크로비트 연결';
    // A pending chooser/GATT operation must settle before another attempt uses the shared BLE module.
    get('disconnect').disabled = connection.status === 'disconnected' || connection.busy;
    get('connection-message').textContent = connection.message;
    get('connection-message').hidden = !connection.message;
    if (!supported || !secure) get('connection-help').textContent = !secure
      ? '이 주소에서는 장치를 연결할 수 없어요. https로 시작하는 실험 주소를 열어 주세요.'
      : '장치를 연결하려면 노트북의 최신 Chrome·Edge에서 열어 주세요.';
    for (const [selector, field, digits] of [['[data-temperature]', 'temperatureC', 2], ['[data-pressure]', 'pressureHpa', 2]]) {
      root.querySelectorAll(selector).forEach((element) => {
        element.textContent = snapshot.latest ? snapshot.latest[field].toFixed(digits) : '—';
        element.classList.toggle('stale', !fresh || snapshot.latest?.validity[field] !== 'valid');
      });
    }
    const batteryStep = step.id === 'battery';
    const check = batteryStep ? snapshot.battery : snapshot.reception;
    const confirmed = fresh && check.ready;
    get('check-title').textContent = batteryStep && !snapshot.battery.armed ? 'USB 분리 후 확인을 시작하세요'
      : confirmed ? '새 값 수신을 확인했어요' : '새 값이 이어서 들어오는지 확인 중';
    get('check-detail').textContent = snapshot.problem || (confirmed ? '새 온도·압력값이 계속 들어오고 있어요.'
      : '새 측정값이 계속 들어오는지 확인하고 있어요.');
    if (saved?.runStatus === 'complete') {
      get('check-title').textContent = '측정을 마친 실험이에요';
      get('check-detail').textContent = '위의 추가 측정에서 조건을 확인하면 수신 확인을 다시 할 수 있어요.';
    }
    if (['reception', 'battery'].includes(step.id)) {
      get('step-description').textContent = saved?.runStatus === 'complete'
        ? '측정을 마친 실험이에요. 추가 측정에서 조건을 확인하거나 새 실험을 시작한 뒤 장치를 연결해 주세요.'
        : step.description;
    }
    get('reception-check').dataset.ready = confirmed;
    get('confirm-battery').disabled = connection.status !== 'connected' || connection.busy;
    get('confirm-battery').textContent = snapshot.battery.armed ? 'USB 분리 시점부터 다시 확인' : '배터리 연결 후 USB를 분리했어요';
    get('next-step').disabled = program.busy || (step.id === 'program' ? program.status !== 'success'
      : step.id === 'reception' ? !ready : batteryStep ? !confirmed : false);
  }

  listen(get('restore-view'), onRestore);
  listen(get('show-3d'), () => { mode = '3d'; renderViewer(); });
  listen(get('show-wiring'), () => { mode = 'table'; renderViewer(); });
  return {
    renderProgram, renderStatus,
    render(next, { focus = false } = {}) {
      step = next;
      renderText(content, step); content.dataset.group = String(step.group);
      get('next-step').textContent = step.action;
      get('program-actions').hidden = step.id !== 'program';
      get('connection-tools').hidden = step.id !== 'reception';
      get('battery-connection').hidden = step.id !== 'battery';
      get('reception-check').hidden = !['reception', 'battery'].includes(step.id);
      get('confirm-battery').hidden = step.id !== 'battery';
      get('wiring-note').hidden = !step.model.wire;
      renderNavigation(); renderViewer(); layout.measure(); layout.transition(step.id);
      if (focus) get('step-title').focus({ preventScroll: true });
    },
    setCompleted(ids) { completed = new Set(ids); renderNavigation(); },
    setViewerState(value) { viewerState = value; renderViewer(); },
    dispose() { listeners.abort(); layout.dispose(); },
  };
}
