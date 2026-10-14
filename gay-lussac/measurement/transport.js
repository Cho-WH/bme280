import * as bluetooth from '../../js/bluetooth.js';
import { decode } from './decoder.js';
import { isValidReading } from '../data/contracts.js';
import { CONNECTION } from '../program-config.js';

const errorMessage = (error) => ({
  NotFoundError: '장치 선택을 취소했거나 장치를 찾지 못했어요. 전원을 확인하고 다시 연결해 주세요.',
  NotAllowedError: 'Bluetooth 연결 권한을 허용한 뒤 다시 시도해 주세요.',
  SecurityError: '이 화면에서는 장치를 연결할 수 없어요. Chrome·Edge에서 https로 시작하는 실험 주소를 열어 주세요.',
  NetworkError: '연결이 끊겼어요. 전원과 거리를 확인하고 다른 탭의 연결을 해제해 주세요.',
}[error?.name] || '장치에 연결하지 못했어요. 전원과 실험 프로그램을 확인해 주세요.');

export function createTransport({ ble = bluetooth, clock = { utc: () => Date.now(), mono: () => performance.now() },
  timers = globalThis, config = CONNECTION } = {}) {
  let attemptId = 0;
  let pending = null;
  let closing = null;
  let previousDevice = null;
  let timeout, retry;
  let state = { status: 'disconnected', busy: false, deviceName: '', message: '' };
  let onState = () => {};
  const emit = (patch) => { state = { ...state, ...patch, attemptId }; onState({ ...state }); };
  const clearTimers = () => { timers.clearTimeout(timeout); timers.clearTimeout(retry); };
  const isCurrent = (id) => id === attemptId;

  function connect(profile, inputHandler, stateHandler, { reuseDevice = false } = {}) {
    if (pending || closing || state.status !== 'disconnected') return pending;
    onState = stateHandler;
    if (reuseDevice && !previousDevice) {
      emit({ message: '이전에 연결한 장치 정보가 없어요. 마이크로비트 연결을 눌러 장치를 선택해 주세요.' });
      return Promise.resolve();
    }
    const id = ++attemptId;
    let hasReading = false;
    emit({ status: 'connecting', busy: true, message: '', deviceName: '' });
    ble.setDisconnectedListener(() => {
      ++attemptId;
      clearTimers();
      emit({ status: 'disconnected', busy: !!pending || !!closing, message: '장치 연결이 끊겼어요. 전원과 거리를 확인해 주세요.' });
    });
    // requestDevice runs before any await, preserving the user's activation.
    pending = (async () => {
      try {
        const device = reuseDevice ? previousDevice : await ble.requestDevice();
        if (!isCurrent(id)) return;
        await ble.connect(device);
        if (!isCurrent(id)) return;
        await ble.startNotifications((line) => {
          if (!isCurrent(id)) return;
          const input = { ...decode(line, profile), attemptId: id, receivedAt: clock.utc(), monotonicAt: clock.mono() };
          if (isValidReading(input)) { hasReading = true; clearTimers(); }
          inputHandler(input);
        });
        if (!isCurrent(id)) return;
        previousDevice = device;
        emit({ status: 'connected', deviceName: device.name || 'micro:bit', busy: false });
        if (hasReading) return;
        timeout = timers.setTimeout(() => {
          if (isCurrent(id) && !hasReading) return disconnect('연결됐지만 새 온도·압력값이 없어요. 프로그램과 배선을 확인해 주세요.');
        }, config.firstReadingTimeoutMs);
        let sends = 0;
        async function send() {
          if (!isCurrent(id) || hasReading || sends >= config.retryLimit) return;
          ++sends;
          try { await ble.sendBmeCommand(); } catch { /* The first-reading deadline handles failed writes. */ }
          if (isCurrent(id) && !hasReading && sends < config.retryLimit) retry = timers.setTimeout(send, config.retryIntervalMs);
        }
        void send();
      } catch (error) {
        if (isCurrent(id)) {
          ++attemptId;
          emit({ status: 'disconnected', message: reuseDevice
            ? '이전 마이크로비트에 다시 연결하지 못했어요. 전원을 확인한 뒤 마이크로비트 연결을 눌러 주세요.'
            : errorMessage(error) });
        }
      } finally {
        if (!isCurrent(id)) {
          clearTimers();
          ble.setDisconnectedListener(null);
          try { await ble.disconnect(); } catch { /* Preserve the original connection error. */ }
        }
        pending = null;
        emit({ busy: !!closing });
      }
    })();
    return pending;
  }
  function disconnect(message = '') {
    if (closing) return closing;
    ++attemptId;
    clearTimers();
    ble.setDisconnectedListener(null);
    emit({ status: 'disconnected', busy: true, message });
    closing = (async () => {
      try { await pending; await ble.disconnect(); }
      catch (error) { emit({ message: errorMessage(error) }); }
      finally { closing = null; emit({ status: 'disconnected', busy: false }); }
    })();
    return closing;
  }
  return { connect, disconnect, forgetDevice: () => { previousDevice = null; },
    isSupported: ble.isSupported, getState: () => ({ ...state }) };
}
