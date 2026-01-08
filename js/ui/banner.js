import { isSupported } from '../bluetooth.js'

const createBanner = (type, message) => {
  const banner = document.createElement('div')
  banner.className = `banner ${type}`
  banner.textContent = message
  return banner
}

export const initBanner = ({ mockEnabled = false } = {}) => {
  const host = document.getElementById('banner-root')
  if (!host) {
    return
  }

  if (!isSupported()) {
    host.append(createBanner('warning', '이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome, Edge 등의 최신 데스크톱 브라우저를 사용해 주세요.'))
  }

  if (mockEnabled) {
    host.append(createBanner('info', 'Mock 텔레메트리를 통해 UI 상태를 확인하는 중입니다. 실제 디바이스 연결 시 ?mock=1을 제거하세요.'))
  }
}
