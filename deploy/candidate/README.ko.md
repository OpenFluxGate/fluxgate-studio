# API 활성화 후보 (운영에 연결되지 않음)

이 스크립트는 검토용이며 현재 GitHub Actions에서 호출하지 않습니다. 원격 전송, 배포 및 systemd 변경을 하지 않았습니다.

## 제안 흐름

1. 검증된 PR 통합 SHA에서 API 0.5.0을 빌드하고 JAR manifest/버전, 테스트, SHA256을 확인합니다.
2. 기존 서비스가 실행 중일 때 실행별 고유 staging 디렉터리에 JAR과 검토된 스크립트를 전송합니다. 전송 실패 시 기존 서비스는 중단되지 않습니다.
3. `bash activate-api.sh /opt/fluxgate/admin-api STAGED_JAR EXPECTED_SHA256`로 활성화합니다. 예상 SHA256은 빌드한 runner에서 전달합니다.
4. 현재 unit이 가리키는 `fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar`는 **호환용 배치 파일명**입니다. 내용은 검증된 0.5.0입니다. unit 변경 없이 기존 경로에 원자적 rename으로 배치합니다. 장기적으로 버전 독립 경로로 전환할지는 별도 검토합니다.
5. 활성화 전 기존 health와 unit 경로/로드 상태/활성 상태, checksum, 로컬 잠금을 검사하고 이전 파일을 보존합니다. 파일 준비 이후에만 stop → rename → start 합니다.
6. start 또는 health 실패 시 이전 파일을 복원하고 start/health를 확인하며 전체 작업은 실패로 종료합니다. 복구 자체 실패는 CRITICAL 메시지로 보고합니다. 백업은 자동 삭제하지 않습니다.

## 검증 및 한계

- 6개 mock 테스트: 성공, checksum 불일치, unit 경로 불일치, start 실패, health 실패, stop 실패. 이전 workflow 계약 11개도 통과했습니다.
- 테스트는 실제 SSH/systemd/DB에 접속하지 않습니다. Mac 테스트의 flock/GNU chmod는 mock이며 Ubuntu의 실제 잠금/권한/rename 검증은 남아 있습니다.
- SIGKILL, 서버 재부팅, 디스크 손상, SSH 단절 상황의 완료·복구를 보장하지 않습니다. 배포를 내구성 있는 서버 작업으로 실행하고 상태를 조회하는 방식은 추가 설계가 필요합니다.
- DB schema/데이터 변경은 되돌리지 않습니다. 새 버전과 구 버전의 데이터 호환성을 확인하기 전 실행하면 안 됩니다.
- health는 기존 8081 actuator HTTP 성공만 검사합니다. 인증된 기능 smoke test, 실제 운영 설정의 완전한 적합성, 외부 UI/API 접근은 검증하지 않습니다.
- UI는 별도 staged standalone 디렉터리 + static/public 구성 확인 + 이전 디렉터리 보존/rename/rollback 설계가 필요합니다. 기존 UI stop 후 삭제 로직을 운영 안전하다고 보지 않습니다.
- 현재 로컬 workflow 패치는 이전 main 기준입니다. 최신 #8의 0.5.0 정렬과 병합·통합 검증 전 게시/머지하지 않습니다.
