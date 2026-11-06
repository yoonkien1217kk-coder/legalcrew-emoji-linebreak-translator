# 모지브릿지 / LegalCrew Slack 앱

Slack 문구 속 `:tada:` 같은 단축어를 브라우저에서 표시되는 실제 유니코드 이모지로 바꿉니다.
빈 줄에는 보이지 않는 문자(U+200B)를 넣어 인스타그램·페이스북 게시물에서도 줄 간격을 유지합니다.

## 웹 번역기

1. Slack에서 문구를 복사해 입력란에 붙여넣습니다.
2. 처음 보는 커스텀 이모지가 나오면 대신 쓸 실제 이모지를 고릅니다.
3. 매칭하지 않은 커스텀 이모지는 `[이모지 이름]`으로 안전하게 표시됩니다.
4. `결과 복사`를 눌러 원하는 브라우저 입력란에 붙여넣습니다.

커스텀 이모지 매핑은 현재 브라우저에만 저장됩니다. 입력 문구는 서버로 전송되지 않습니다.

## LegalCrew Slack 앱

채널 메시지의 `⋯` 메뉴에서 `이모지/줄바꿈 변환`을 선택하면 Slack 모달에서 복사용 결과가 열립니다. 기본 이모지는 기존 사전으로 변환합니다. 사전에 없는 이름 중 워크스페이스의 커스텀 이모지로 확인된 것만 `[읽기 쉬운 이름]`으로 표시하며, `□`나 `�`를 남기지 않습니다. 커스텀 목록에 없는 미지원 단축어는 원형을 유지합니다.

커스텀 이모지 이미지를 다운로드하거나 AI에 보내지 않습니다. 이 Slack 흐름에서 OpenAI API는 호출하지 않으므로 AI 사용료가 발생하지 않습니다.
커스텀 목록 조회에 실패하면 기본 이모지를 커스텀으로 오인하지 않도록 복사 가능한 결과 대신 재시도 안내를 표시합니다.

### 로컬 실행

```bash
npm install
cp .env.example .env
# .env에 개발용 값을 입력한 뒤
set -a
source .env
set +a
npm test
npm start
```

서버 상태 확인:

```bash
curl -fsS http://127.0.0.1:3000/health
```

`dist/`는 빌드 과정이 없는 정적 웹 번역기이고, `server/`가 Slack 앱용 Node 서버입니다. Node.js 20 이상이 필요합니다.

### 환경 변수

- `SLACK_SIGNING_SECRET`: Slack App Credentials의 Signing Secret. 서버 시작에 필요합니다.
- `SLACK_BOT_TOKEN`: 설치 승인 후 발급되는 `xoxb-` 토큰. 승인 전에는 비워둘 수 있습니다.
- `SLACK_TEAM_ID`: LegalCrew workspace ID. 설정하면 다른 워크스페이스 요청을 거부합니다.
- `PORT`: 기본값 `3000`.

기존 배포 환경에 `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATA_FILE`이 남아 있어도 현재 Slack 처리 경로에서는 사용하지 않습니다.

### 배포 및 관리자 승인 순서

1. Node 서버를 공개 HTTPS 호스트에 배포합니다. 최초 `SLACK_SIGNING_SECRET`에는 임시 비밀 문자열을 넣어 서버를 먼저 기동할 수 있습니다.
2. [Slack 앱 관리 화면](https://api.slack.com/apps)에서 **Create New App → From an app manifest**를 선택합니다.
3. `slack-app-manifest.yaml`을 LegalCrew 워크스페이스에 가져옵니다. 현재 interaction URL은 `https://web-production-d545e.up.railway.app/slack/interactions`입니다.
4. **Basic Information → App Credentials**의 실제 Signing Secret을 배포 환경에 등록하고 서버를 재시작합니다.
5. **Install App → Install to Workspace**를 누릅니다. 관리자 승인이 필요한 워크스페이스라면 manifest의 `commands`, `emoji:read`, `users:read`, `channels:read`, `groups:read` 권한에 대한 승인 요청이 전송됩니다.
6. 승인 후 표시되는 Bot User OAuth Token을 `SLACK_BOT_TOKEN`에 등록하고 서버를 재시작합니다.
7. LegalCrew 채널의 메시지 `⋯` 메뉴에서 `이모지/줄바꿈 변환`을 실행해 기본 이모지·커스텀 이름 표시·복사를 확인합니다.

앱은 `chat:write`나 채널 기록 권한을 요청하지 않습니다. `users:read`와 채널 읽기 권한은 태그에 표시할 이름을 조회하는 데 사용합니다.

### Cloudflare Workers 무료 배포

`wrangler.jsonc`는 Slack 요청용 Worker와 `dist/`의 정적 웹 번역기를 함께 배포합니다. 기존 Railway 서버와 같은 변환 모듈을 사용하지만 Slack 앱의 Request URL을 바꾸기 전에는 운영 트래픽이 이동하지 않습니다.

```bash
npm ci
npm test
npx wrangler login --device
npx wrangler deploy --dry-run
npx wrangler deploy
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SLACK_BOT_TOKEN
```

`SLACK_TEAM_ID`는 `wrangler.jsonc`에 LegalCrew의 공개 Team ID로 설정돼 있습니다. 비밀값은 대화나 저장소에 기록하지 말고 Wrangler의 대화형 입력으로 등록합니다. 새 Worker의 `/health`와 웹 화면을 확인한 뒤, Slack 앱 관리 화면의 **Interactivity & Shortcuts → Request URL**을 새 Worker 주소의 `/slack/interactions`로 바꿉니다. 실제 일반·커스텀 이모지 변환과 본인 전용 복사용 메시지까지 확인한 후에만 Railway를 중지합니다.

Workers Free의 요청당 CPU 제한은 10ms입니다. 긴 Slack 메시지는 배포 후 실제 요청과 Worker 오류 지표로 확인해야 합니다. Worker 배포만으로 현재 Slack 앱 설정이나 봇 권한이 자동 변경되지는 않습니다.

## 테스트

```bash
npm test
npm audit
```
