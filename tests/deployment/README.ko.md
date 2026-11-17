# 오프라인 배포 테스트

PyYAML 설치 후 `python -m unittest discover -s tests/deployment -p 'test_*.py' -v`로 실행합니다. 17개 mock은 API 활성화/복원, UI 디렉터리 전환/TERM 복구, 미완료 marker/runtime env 차단, workflow 순서/가드/자산/버전을 검사합니다. SSH나 운영에 접속하지 않습니다. Mac mock은 flock/GNU chmod를 대체하므로 실제 서버 권한/내구성은 미검증입니다. deploy/candidate/README.ko.md를 참고하세요.
