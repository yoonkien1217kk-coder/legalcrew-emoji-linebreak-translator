# 모지브릿지 / LegalCrew Slack 앱

Slack 문구 속 `:tada:` 같은 단축어를 브라우저에서 표시되는 실제 유니코드 이모지로 바꿉니다.

## 웹 번역기

1. Slack에서 문구를 복사해 입력란에 붙여넣습니다.
2. 처음 보는 커스텀 이모지가 나오면 대신 쓸 실제 이모지를 고릅니다.
3. 매칭하지 않은 커스텀 이모지는 `[이모지 이름]`으로 안전하게 표시됩니다.
4. `결과 복사`를 눌러 원하는 브라우저 입력란에 붙여넣습니다.

커스텀 이모지 매핑은 현재 브라우저에만 저장됩니다. 입력 문구는 서버로 전송되지 않습니다.

## LegalCrew Slack 앱

채널 메시지의 `⋯` 메뉴에서 `SNS용 이모지 변환`을 선택하면 Slack 모달에서 복사용 결과가 열립니다. 기본 이모지는 기존 사전으로 변환하고, 처음 보는 커스텀 이모지는 이름과 이미지를 OpenAI 비전으로 분석해 최대 3개의 유니코드 이모지로 바꿉니다. 분석에 실패하면 `[이름]`으로 표시하며 `□`나 `�`를 남기지 않습니다.

Slack 메시지 원문과 사용자 정보는 OpenAI에 보내지 않습니다. 커스텀 이모지 이름과 이미지만 처음 분석할 때 전송하고, 저장 파일에는 이름·유니코드 결과·신뢰도만 보관합니다.

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
- `OPENAI_API_KEY`: 처음 보는 커스텀 이모지 분석에 필요합니다.
- `OPENAI_MODEL`: 기본값 `gpt-6-luna`.
- `DATA_FILE`: 분석 결과 JSON 경로. 운영에서는 영구 볼륨 경로를 사용합니다.
- `PORT`: 기본값 `3000`.

### 배포 및 관리자 승인 순서

1. Node 서버를 공개 HTTPS 호스트에 배포합니다. 최초 `SLACK_SIGNING_SECRET`에는 임시 비밀 문자열을 넣어 서버를 먼저 기동할 수 있습니다.
2. [Slack 앱 관리 화면](https://api.slack.com/apps)에서 **Create New App → From an app manifest**를 선택합니다.
3. `slack-app-manifest.yaml`의 `YOUR_PUBLIC_HOST`를 실제 호스트로 바꾸고 LegalCrew 워크스페이스에 manifest를 가져옵니다.
4. **Basic Information → App Credentials**의 실제 Signing Secret을 배포 환경에 등록하고 서버를 재시작합니다.
5. `OPENAI_API_KEY`와 영구 `DATA_FILE` 경로를 등록합니다.
6. **Install App → Install to Workspace**를 누릅니다. 관리자 승인이 필요한 워크스페이스라면 이 단계에서 `commands`, `emoji:read` 승인 요청이 전송됩니다.
7. 승인 후 표시되는 Bot User OAuth Token을 `SLACK_BOT_TOKEN`에 등록하고 서버를 재시작합니다.
8. LegalCrew 채널의 메시지 `⋯` 메뉴에서 `SNS용 이모지 변환`을 실행해 모달과 복사를 확인합니다.

앱은 `chat:write`, 채널 기록, 사용자 프로필 권한을 요청하지 않으며 채널에 메시지를 게시하지 않습니다.

## 테스트

```bash
npm test
npm audit
```
