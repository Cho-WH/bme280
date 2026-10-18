# 고정한 외부 라이브러리

파일 확보·확인일: 2026-10-11. 앱은 로컬 파일을 사용하며 실행 시 CDN에 의존하지 않습니다.

의견 보내기 아이콘은 **Lucide 0.468.0**의 [message-square-plus 원본](https://raw.githubusercontent.com/lucide-icons/lucide/0.468.0/icons/message-square-plus.svg)을 [로컬 SVG](lucide-message-square-plus.svg)로 사용합니다. 확보일: 2026-10-19. 원문을 변경하지 않고 CSS 마스크로 표시하며 기존 [ISC 라이선스](lucide-LICENSE)를 따릅니다. SHA-256: `8b55e33a7215ffcc0cd3d0bd88aafa0a00f8827b8d7646cac14df60202a7a32f`.

| 사용 파일 | 버전 | 출처 | 라이선스 |
|---|---|---|---|
| [idb-8.0.4.umd.js](idb-8.0.4.umd.js) | idb 8.0.4 | [npm 고정 배포 파일](https://cdn.jsdelivr.net/npm/idb@8.0.4/build/umd.js), [공식 저장소](https://github.com/jakearchibald/idb/tree/v8.0.4) | [ISC](idb-LICENSE) |
| [기존 Chart.js](../../vendor/chart.umd.js) | Chart.js 4.5.0 | 저장소 기존 파일 재사용, [공식 릴리스](https://github.com/chartjs/Chart.js/releases/tag/v4.5.0) | [MIT](chart-LICENSE.md) |
| [microbit-usb-1.0.0.js](microbit-usb-1.0.0.js) | @microbit/microbit-connection 1.0.0 | [공식 저장소](https://github.com/microbit-foundation/microbit-connection), npm 배포본의 USB·Universal HEX 진입점을 로컬 번들 | [MIT 및 포함 의존성 고지](microbit-usb-LICENSES.md) |
| [papaparse-5.7.0.min.js](papaparse-5.7.0.min.js) | Papa Parse 5.7.0 | [공식 태그 배포 파일](https://raw.githubusercontent.com/mholt/PapaParse/5.7.0/papaparse.min.js) | [MIT](papaparse-LICENSE) |

SHA-256 (실제 포함된 파일 기준):

```text
idb-8.0.4.umd.js  84a1b83a821969a36592964874997757d8bde798dc1b89a5891391bd29e5c08c
idb-LICENSE       873a2f333fda393ec3464f4579209b019d98e97c3bf498b10e85f630162fd708
../../vendor/chart.umd.js  142c618355d6cfeb081ccc5fdeddafb0b76f4b8bf9bc94efc54b6864cb29aebe
chart-LICENSE.md  41a84aa2caba645f966a18d9c2056b73e6d3a81d80bc0046bc0011a2634d4cce
papaparse-5.7.0.min.js  4d5d2d6e3282b66aafaa5e6de8ca3ae06f8d3440111ae99c6a30f6c00cfac33e
papaparse-LICENSE  99aa68e4b42758b09828a46515f70369e5463458ab7a990189f641af2b8d9b4e
```

라이선스 원본: [idb 8.0.4 LICENSE](https://cdn.jsdelivr.net/npm/idb@8.0.4/LICENSE), [Chart.js 4.5.0 LICENSE.md](https://raw.githubusercontent.com/chartjs/Chart.js/v4.5.0/LICENSE.md).

`globalThis.idb`는 `data/repository.js`, `globalThis.Chart`는 `ui/chart-view.js`, `globalThis.Papa`는 `data/files.js`에서만 접근합니다. Papa Parse는 M2 전체 CSV에 사용합니다. [라이선스 원문](https://raw.githubusercontent.com/mholt/PapaParse/5.7.0/LICENSE)도 같은 태그에서 고정했습니다. 테스트는 고정한 배포본으로 CSV를 다시 읽어 확인합니다.

USB 번들은 `guide/programmer-adapter.js`에서만 가져옵니다. 포함 패키지는 microbit-connection 1.0.0 (MIT), microbit-universal-hex 0.2.2 (MIT), nrf-intel-hex 1.4.0 (BSD-3-Clause)입니다. 정확한 npm 주소·무결성·번들 및 라이선스 SHA-256은 [manifest](microbit-usb-manifest.json)에 기록됩니다. esbuild 0.25.12는 개발용 번들 도구이며 앱 실행에 포함되지 않습니다.

재생성은 저장소 루트에서 다음 명령을 사용합니다. 일반 앱 실행에는 설치·빌드가 필요 없습니다. USB에서 사용하지 않는 모바일 전용 peer dependencies는 설치하지 않습니다.

```powershell
npm --prefix gay-lussac/dev/usb-library ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm --prefix gay-lussac/dev/usb-library run build
```

빌드 스크립트는 실제 번들에 들어간 의존성만 골라 원문 라이선스와 manifest를 생성하며, 검토하지 않은 의존성이 새로 들어오면 실패합니다.

분석 도구줄의 되돌리기·다시 실행은 **Lucide 0.468.0**의 [undo-2](https://lucide.dev/icons/undo-2)·[redo-2](https://lucide.dev/icons/redo-2)를 사용합니다. 원본 path와 선 속성을 [로컬 SVG 심벌](lucide-history.svg)로 묶었습니다. [고정 버전 원본](https://github.com/lucide-icons/lucide/tree/0.468.0/icons), [ISC 라이선스](lucide-LICENSE), [출처·버전·SHA-256](lucide-history-manifest.json)을 보관하며 CDN이나 추가 런타임을 사용하지 않습니다.

계산 열의 편집 버튼은 같은 **Lucide 0.468.0**의 [pencil 원본](https://raw.githubusercontent.com/lucide-icons/lucide/0.468.0/icons/pencil.svg)을 [로컬 SVG](lucide-pencil.svg)로 보관하고 CSS 마스크로 표시합니다. [ISC 라이선스](lucide-LICENSE)를 따르며 SVG 원문은 변경하지 않았습니다. SHA-256: `7e1ca7a6f5c1eb949671df762f2baadd32f5bd841d43153c3a15279af7d78d0c`.
