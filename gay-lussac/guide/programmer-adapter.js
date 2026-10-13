import { createUSBConnection, createUniversalHexFlashDataSource } from '../vendor/microbit-usb-1.0.0.js';

const messages = {
  'no-device-selected': '장치 선택을 취소했어요. 준비되면 다시 설치할 수 있어요.',
  'device-in-use': '다른 탭이나 프로그램이 USB를 사용 중이에요. 해당 연결을 해제한 뒤 다시 설치하세요.',
  'device-disconnected': 'USB 연결이 끊겼어요. 케이블을 연결하고 다시 설치하세요.',
  timeout: '장치 응답을 기다리다 멈췄어요. USB를 다시 연결한 뒤 설치하세요.',
  'firmware-update-required': '장치의 USB 인터페이스를 확인해야 해요. micro:bit 공식 도움말을 참고하세요.',
  'wrong-board': '이 실험은 micro:bit V2를 사용해요. V2 장치를 연결해 주세요.',
};
const busyStatuses = new Set(['loading', 'connecting', 'flashing']);

// Owns only program preparation and USB transfer. BLE/readings stay in their adapters.
export function createProgrammer({ program, onState = () => {}, beforeFlash = async () => {},
  createConnection = createUSBConnection, makeSource = createUniversalHexFlashDataSource,
  fetchFile = globalThis.fetch, crypto = globalThis.crypto,
  supported = () => !!globalThis.navigator?.usb && globalThis.isSecureContext,
} = {}) {
  let usb, source, preparation, pending;
  let disposed = false;
  let state = { status: 'idle', busy: false, canInstall: false, progress: null, deviceName: '', message: '' };
  const emit = patch => {
    if (disposed) return;
    state = { ...state, ...patch };
    state.busy = busyStatuses.has(state.status);
    state.canInstall = !!source && !state.busy;
    onState({ ...state });
  };
  async function prepare() {
    if (disposed || source || preparation) return preparation;
    if (!supported()) {
      emit({ status: 'unavailable', message: globalThis.isSecureContext === false
        ? '이 주소에서는 프로그램을 설치할 수 없어요. https로 시작하는 실험 주소를 열어 주세요.'
        : 'USB로 프로그램을 설치하려면 노트북의 최신 Chrome·Edge에서 열어 주세요.' });
      return;
    }
    emit({ status: 'loading', message: '실험 프로그램을 준비하고 있어요.' });
    preparation = (async () => {
      try {
        const response = await fetchFile(program.url);
        if (!response.ok) throw new Error('프로그램 파일을 불러오지 못했어요. 연결을 확인하고 다시 준비하세요.');
        const bytes = await response.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== program.sha256) throw new Error('프로그램 파일 확인에 실패했어요. 화면을 새로고침한 뒤 다시 시도하세요.');
        const candidate = makeSource(new TextDecoder().decode(bytes));
        await candidate('V2'); // Validate the V2 part before opening or halting any device.
        if (disposed) return;
        usb ??= createConnection({ pauseOnHidden: false });
        await usb.initialize();
        source = candidate;
        emit({ status: 'ready', message: 'USB를 연결한 뒤 설치 버튼을 누르세요. 처음에는 장치 선택 창이 열립니다.' });
      } catch (error) {
        emit({ status: 'error', message: error.message || '프로그램을 준비하지 못했어요. 다시 준비해 주세요.' });
      } finally { preparation = null; }
    })();
    return preparation;
  }
  function install() {
    if (disposed || !state.canInstall || pending) return pending;
    emit({ status: 'connecting', progress: null, deviceName: '', message: 'USB 장치를 연결하고 있어요. 선택 창이 열리면 사용할 micro:bit를 골라 주세요.' });
    // Call the official connection API in the click handler, before file/network waits.
    pending = (async () => {
      let outcome;
      try {
        await usb.connect();
        if (disposed) return;
        if (usb.getBoardVersion() !== 'V2') throw Object.assign(new Error(), { code: 'wrong-board' });
        emit({ deviceName: usb.getDevice()?.productName || 'micro:bit V2' });
        await beforeFlash();
        if (disposed) return;
        emit({ status: 'flashing', message: '프로그램을 설치하고 있어요. USB를 꽂아 두세요.' });
        await usb.flash(source, { partial: false, progress(stage, fraction) {
          if (stage !== 'FullFlashing') return;
          emit({ progress: Number.isFinite(fraction) ? Math.max(0, Math.min(100, Math.round(fraction * 100))) : null });
        } });
        outcome = { status: 'success', progress: 100, message: '설치가 완료됐어요. 이제 Bluetooth로 새 측정값을 확인하세요.' };
      } catch (error) {
        outcome = { status: error.code === 'no-device-selected' ? 'cancelled' : 'error', progress: null,
          message: messages[error.code] || '설치하지 못했어요. USB와 다른 탭의 연결을 확인한 뒤 다시 설치하세요.' };
      } finally {
        // Keep the selected device for this page, but release its USB interface.
        try { await usb.disconnect(); } catch { /* Preserve the transfer result. */ }
        pending = null;
        if (outcome) emit(outcome);
      }
    })();
    return pending;
  }
  async function dispose() {
    disposed = true;
    await preparation;
    await pending;
    await usb?.disconnect();
    usb?.dispose();
  }
  return { prepare, install, dispose, getState: () => ({ ...state }) };
}
