# Studio 0.5.0 API·UI 배포와 복구

API와 UI는 같은 Studio 커밋으로 함께 검증한다. 새 UI가 이전 API를 호출하면 로그인 후 대시보드가 실패한다. 이전 UI에서 새 API로 규칙을 수정하면 버전 정보가 빠져 요청이 거부된다. 온라인에서 한쪽씩 전환하는 두 워크플로의 운영 활성화는 차단돼 있다. 두 빌드는 활성화 전에 각자의 번들을 GitHub Actions에 보관한다.

## 테스트 서버에 같은 릴리스 준비

별도 스테이징이 없는 설치에서는 데모 서버의 독립된 디렉터리와 루프백 포트를 사용할 수 있다. 데모 방문자용 UI는 자체 이벤트 API를 사용한다. 정식 UI/API 한 쌍을 시험할 때는 두 프로세스 모두 같은 격리 환경에서 시작하고 별도의 합성 데이터, 로그인 설정, 포트를 사용한다. GitHub에서 두 빌드 작업의 저장소와 후보 커밋, 작업 성공 여부를 확인한다. `SHA`는 검토한 40자리 커밋이며 `API_RUN`과 `UI_RUN`은 해당 빌드의 실행 번호다.

```sh
set -eu
downloads=$(mktemp -d)
gh run download "$API_RUN" -R OpenFluxGate/fluxgate-studio -n "studio-api-$SHA" -D "$downloads/api"
gh run download "$UI_RUN" -R OpenFluxGate/fluxgate-studio -n "studio-ui-$SHA" -D "$downloads/ui"
python3 deploy/candidate/stage-bundles.py --commit "$SHA" --api-bundle "$downloads/api" \
  --ui-bundle "$downloads/ui" --destination "$downloads/verified"
```

`verified/SOURCE_COMMIT`은 두 번들의 파일 목록, 복사한 파일의 SHA-256, 공통 복구 코드, UI 아카이브 구조가 모두 검증된 후 생긴다. JAR와 UI 아카이브는 각각 `verified/api/api.jar`, `verified/ui/ui.tar.gz`에 있다. 대상 호스트로 전송할 때에는 해당 호스트에서 별도로 확인한 SSH 호스트 키를 사용한다. UI 실행 환경에는 실제 API 주소를 `ADMIN_API_URL`로 지정한다. 로그인 화면만 뜨면 잘못된 API 주소를 놓칠 수 있으므로 로그인한 브라우저의 프록시 요청도 확인한다.

## 동일 호스트의 systemd 복구 설치

기존 API unit은 `fluxgate-admin-api`이고 JAR 배치명은 `fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar`다. UI unit은 `fluxgate-studio`이며 `.next/standalone/server.js`를 실행한다. 해당 서비스 계정으로 파일을 읽고 배포 계정으로 배포 경로에 쓸 수 있어야 한다. Java 종료 시 143을 정상 종료로 반환하는 unit에는 `SuccessExitStatus=143`을 지정한다. 중지 후 `ActiveState=inactive`, `MainPID=0`가 되어야 복구가 파일을 교체한다.

검토한 소스에서 기존 서비스가 정상일 때 구성요소별로 복구 유닛을 설치한다.

```sh
sudo bash deploy/candidate/install-recovery.sh api /opt/fluxgate/admin-api "$DEPLOY_USER"
sudo bash deploy/candidate/install-recovery.sh ui /opt/fluxgate/studio "$DEPLOY_USER"
systemctl is-active fluxgate-recover-api.service fluxgate-recover-ui.service
```

활성화는 디스크에 저널을 기록하고 파일시스템과 동기화한 뒤 이전 아티팩트를 보존하고 교체한다. 재부팅 시 복구 unit은 서비스보다 먼저 중단된 전환을 복구하고, 시작 후 확인 unit이 PID와 HTTP 응답을 검사한다. 현재 부팅에서 배포 프로세스만 종료된 경우, 해당 배포가 이미 끝났는지와 `.activation-pending`을 확인한 뒤 동일 계정에서 `bash deploy/candidate/recover.sh api "$API_ROOT" manual` 또는 UI용 명령을 실행한다. 이전 형식의 저널이나 파일 불일치가 발견되면 해당 unit의 journal을 확인한다. 보존된 이전 릴리스와 저널은 복구에 사용된다.

각 구성요소는 루트 소유의 독립된 복구 코드 버전을 사용한다. API는 JAR 전체를, UI는 설치 디렉터리 식별자와 standalone 실행 트리의 파일·정적 자산·링크를 검증한다. Next.js가 실행 중 생성하는 `standalone/.next/cache`는 비교에서 제외한다. 상태 검사는 안정된 PID에서 API의 HTTP 200 및 JSON `status=UP`, UI의 `/login` HTTP 200을 요구한다. 실제 연결과 권한은 아래 로그인 검증에서 확인한다.

## 운영 전환 순서

1. 기존 API JAR와 UI 트리가 정상일 때 `pair-preflight.py capture --api JAR --ui NEXT_DIR`로 한 쌍의 기준값을 보관한다. 신뢰할 수 있는 후보 빌드도 따로 기록한다. `pair-preflight.py verify --help`에 따라 준비된 두 쌍을 해당 기준값과 비교한다. 호스트의 배포 사용자와 두 서비스의 파일 소유권, 상태 URL과 남은 저장 공간을 확인한다.
2. 두 서비스의 외부 트래픽과 쓰기를 함께 중지하고 처리 중인 요청을 비운다. 점검 상태는 배포 프로세스 종료나 호스트 재부팅 후에도 유지돼야 한다. 이 저장소는 호스트 앞의 라우터를 관리하지 않는다.
3. API를 먼저 시작해 상태, 역할별 권한과 규칙을 확인한다. 이어서 같은 릴리스의 UI에서 실제 로그인, Overview, 관리자 이벤트 조회, Viewer의 접근 거부를 확인한다. 두 서비스의 설치본과 서비스 응답을 확인한 뒤 외부 트래픽을 재개한다.
4. 실패 시 점검 상태를 유지하고 보관한 같은 릴리스의 API와 UI를 복원한다. 이전 버전의 로그인·대시보드·규칙 조회 계약을 확인한다. 이전 릴리스에는 이벤트 화면이 없고 접근 제어도 당시 동작으로 돌아간다.

## 감사 로그 보존

MongoDB 읽기 전용 연결을 `FLUXGATE_MONGO_URI`로 주입하고 실제 DB 이름을 `FLUXGATE_MONGO_DB`에 지정한다. `STUDIO_AUDIT_COLLECTION`과 합의된 보존 기간을 사용한다. `STUDIO_AUDIT_EXPECTED_TTL_SECONDS=none`은 영구 보존, 정수는 초 단위다.

```sh
mongosh --nodb --norc --quiet --file deploy/candidate/audit-retention.js
```

검사기는 기본 감사 컬렉션과 메뉴 정책 감사 컬렉션의 존재, 유형 및 TTL 인덱스를 조회한다. 결과 0은 일치, 1은 누락 또는 정책 불일치, 2는 조회 오류다. 기존 도입 환경은 해당 두 컬렉션의 백업을 별도 DB로 복구해 문서와 인덱스를 비교한다. 신규 도입으로 컬렉션이 없다면 실제 설정으로 최초 생성한 뒤 확인한다. TTL로 삭제된 데이터의 복구에는 DB 백업이 필요하다.
