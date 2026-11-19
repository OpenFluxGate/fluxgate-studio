# 배포 검증

Python 3와 PyYAML을 설치한 뒤 워크플로, 스테이징, API·UI 조합 식별, 활성화와 복구 테스트를 실행한다. 로컬 테스트는 임시 파일과 제어 가능한 systemd·HTTP 대역을 사용한다.

```sh
python3 -B -m unittest discover -s tests/deployment -p 'test_*.py' -v
```

GNU 파일시스템 도구의 동작은 네트워크를 끄고 읽기 전용으로 마운트한 Linux 컨테이너에서 확인한다.

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 64 --memory 128m --cpus 1 \
  --tmpfs /tmp:rw,exec,nosuid,size=32m -v "$PWD:/src:ro" \
  --entrypoint /bin/bash python:3.12-slim /src/tests/deployment/linux-filesystem-smoke.sh
```

[VM 재부팅 시험](vm/README.md)은 폐기 가능한 게스트에서 실제 systemd 서비스와 서로 다른 Java·Node 프로그램을 시작하고, 호스트에서 전원을 차단한 뒤 커널 부팅 ID와 실행 결과를 비교한다. [MongoDB 시험](test_audit_retention.sh)은 두 감사 컬렉션을 검사하고 합성 문서와 인덱스를 새 DB로 복구한다. 배포할 버전 조합, 대상 점검과 전환 순서는 [운영 절차](../../deploy/candidate/README.ko.md)를 따른다.
