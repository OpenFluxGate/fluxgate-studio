# Studio 0.5.0 배포 안전 경로

API/UI workflow에 연결된 활성화 스크립트입니다. **실제 운영 검증과 활성화 승인은 아직 완료되지 않았습니다.** 운영 변수 두 개가 모두 true가 아니면 업로드 전에 실패합니다: `STUDIO_SAFE_DEPLOY_ENABLED`, `STUDIO_AUDIT_RETENTION_REVIEWED`. 변수는 사용자 승인을 대체하지 않습니다.

## 동작

- 서비스가 실행 중인 동안 실행별 staging에 JAR 또는 완성된 UI archive와 스크립트, SHA256 목록을 업로드합니다. checksum 검증 실패는 기존 서비스를 중단시키지 않습니다.
- 서버 `systemd-run --wait` transient service로 활성화를 실행해 SSH 클라이언트와 작업 수명을 분리합니다. 서버의 기존 배포 사용자 UID로 실행하며 sudo 권한이 필요합니다.
- API는 기존 unit이 가리키는 `fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar`를 호환용 배치명으로 유지합니다. 실제 내용은 0.5.0입니다. 사전 unit 경로/health/checksum/lock 검증 및 이전 파일 백업 후 stop→원자적 rename→start 합니다.
- UI는 static/public을 standalone 안에 포함시켜 staging하고, 기존 `.next`를 보존한 다음 디렉터리를 전환합니다. 기존 standalone에 runtime `.env*`가 있으면 명시적 이전 검토 전 거부합니다.
- start/health/전환 실패는 이전 artifact/tree로 복원하고 health를 확인합니다. 작업 전체는 실패로 종료합니다. 복구 실패는 CRITICAL로 표시하고 marker/백업을 남깁니다.
- 성공 또는 확인된 복구에만 `.activation-pending`을 제거합니다. marker가 남아 있으면 다음 배포는 거부합니다. 백업은 자동 삭제하지 않습니다.

## 장애 대응과 제한

SSH가 끊기면 GitHub는 결과를 모를 수 있습니다. **재시도 전** `systemctl status fluxgate-deploy-{api|ui}-RUN_ID-RUN_ATTEMPT`, pending marker와 기록된 backup/live 상태를 확인해야 합니다. 서버 재부팅/SIGKILL은 자동 복구되지 않습니다. marker는 덮어쓰기 방지 장치이지 내구 복구 보장이 아닙니다. 손상된 상태를 확인 없이 삭제/재시작하지 마세요.

#8의 audit retention opt-in 수정(405c548)을 보존했습니다. 운영 환경이 TTL 생성을 명시적으로 켜는지, 기존 인덱스/데이터/보존정책은 여전히 확인해야 합니다. TTL 삭제 데이터는 JAR 롤백으로 복원되지 않습니다. 데이터 호환성/보존정책 검토 전 활성화하지 마세요.

실제 Ubuntu의 sudo/systemd-run/lock/권한, SSH 단절 시 실행 유지, 디스크 공간, runtime 설정, 외부 접근 및 인증된 기능 검증은 남아 있습니다. 테스트는 실제 서비스를 실행하거나 DB를 변경하지 않습니다. API6/UI8/통합 workflow3 = 17개 mock 테스트가 통과했습니다. UI는 TERM 중단 복구를 포함합니다. 파일·디렉터리 전환 사이의 짧은 서비스 중단은 있습니다. API/UI 두 컴포넌트의 원자적 동시 배포는 보장하지 않습니다.

## Additional review hardening

Every SCP/SSH action requires LIGHTSAIL_HOST_FINGERPRINT. The pre-upload gate rejects absent/malformed SHA256 fingerprints. Obtain and verify the server host fingerprint over an independent trusted channel before configuring it; do not infer or trust-on-first-use from the deployment connection. No fingerprint value has been registered. Checksums do not authenticate SSH hosts.

Rollback must successfully stop the service AND observe ActiveState=inactive/MainPID=0 before replacing any file. Failure preserves the pending marker and new artifact for manual recovery. Process-model tests distinguish running version/PID from on-disk bytes. Real service-user ownership/readability and sudo/systemd-run permissions remain deployment prerequisites, not mock-proven facts.
