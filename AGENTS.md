# 프로젝트 작업 안내

## GitHub 계정

- 이 저장소의 GitHub 작업(푸시·PR 등)은 `Cho-WH` 계정을 사용한다. 작업 전 실제 인증 계정을 확인하고 다른 계정의 인증을 사용하지 않는다.
- Git의 인증 계정이 다르면 전역 설정을 바꾸기보다 해당 명령에만 `Cho-WH` 인증을 지정한다. GitHub CLI의 활성 계정이 `Cho-WH`임을 확인한 경우 `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push` 방식으로 사용할 수 있다.

## 게이뤼삭 전용 앱

- `gay-lussac/` 작업 전 [하위 지침](gay-lussac/AGENTS.md)을 읽고 따른다.
- [기획](gay-lussac/PLAN.md), [구현 설계](gay-lussac/DESIGN.md), [구현 원칙](gay-lussac/ARCHITECTURE.md)을 읽고 작업 범위와 기준을 확인한다.
- 게이뤼삭 전용 지침은 해당 하위 프로젝트에 적용한다.
