# 오프라인 배포 테스트

PyYAML 설치 후 `python -m unittest discover -s tests/deployment -p 'test_*.py' -v`로 실행합니다. 17개 mock은 API 활성화/복원, UI 디렉터리 전환/TERM 복구, 미완료 marker/runtime env 차단, workflow 순서/가드/자산/버전을 검사합니다. SSH나 운영에 접속하지 않습니다. Mac mock은 flock/GNU chmod를 대체하므로 실제 서버 권한/내구성은 미검증입니다. deploy/candidate/README.ko.md를 참고하세요.

추가 로컬 검증: SIGKILL 중단 및 후속 배포 차단 테스트를 포함해 Python 22개가 통과했습니다. 기존 공식 Maven 이미지로 네트워크 없는 비특권·읽기 전용 컨테이너에서 `linux-filesystem-smoke.sh`를 실행하여 실제 Linux flock/chmod/sha256sum/cp/mv 기반 API/UI 성공·실패복원 4개를 통과했습니다. systemd/HTTP는 여전히 mock입니다. Docker 컨테이너 재시작은 VM/서버 재부팅 검증을 대신하지 못합니다. 실제 SSH 연결 단절·systemd transient service 수명·부팅 시 old/new 실행 및 API/UI 혼합버전 호환성은 미검증이며 운영 hard hold를 유지합니다.
