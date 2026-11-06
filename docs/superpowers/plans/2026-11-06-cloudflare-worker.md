# Cloudflare Workers 무료 배포 계획

## 목표

기존 Railway Slack 앱 기능을 유지한 채 Cloudflare Workers Free에서 별도로 실행하고 검증한다. Slack의 Request URL은 새 배포에서 실제 바로가기와 복사용 메시지를 확인한 뒤 변경한다.

## 현재 경계

- `server/http-server.js`는 Railway용 Node.js 진입점으로 유지한다.
- `server/interaction.js`, `server/modal.js`, `server/slack.js`, `dist/translator.js`는 두 실행 환경에서 공유한다.
- 현재 Slack 처리 경로는 이미지 분석, 데이터베이스, OpenAI API를 사용하지 않는다.
- Slack 앱의 권한 범위와 기존 비밀값은 바꾸지 않는다.

## 작업 1: Worker 요청 처리

파일: `server/worker.js`, `tests/worker.test.mjs`

1. 실패하는 테스트로 `/health`, 잘못된 서명, 다른 Team ID, 유효한 바로가기의 즉시 ACK와 `ctx.waitUntil`, 1MB 초과 본문을 확인한다.
2. `fetch(request, env, ctx)` 진입점을 추가한다. Slack 요청의 원문 본문과 헤더로 기존 `verifySlackRequest`를 호출한다.
3. 기존 `handleShortcut`/`handleDraftSubmission`에 동일한 Slack API 의존성을 연결한다. 응답 뒤 작업은 `ctx.waitUntil`에 등록한다.
4. `node --test tests/worker.test.mjs`와 `npm test`를 실행한다.

## 작업 2: 로컬 Workers 실행

파일: `wrangler.jsonc`, `package.json`, `package-lock.json`, `README.md`

1. 프로젝트에 Wrangler를 개발 의존성으로 고정하고 오늘의 compatibility date를 설정한다.
2. `wrangler dev`에서 `/health` 및 서명된 상호작용 요청을 확인한다. 비밀값은 로컬 비추적 파일이나 환경 변수로만 다룬다.
3. Worker의 로그와 추적을 활성화하고, 오류에 메시지 본문·토큰이 기록되지 않도록 한다.
4. `wrangler deploy --dry-run`으로 번들 구성을 검사한다.

## 작업 3: 계정 배포 및 전환

1. 확인된 Cloudflare Free 계정의 새 Worker로 배포하고 `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`를 비밀값/환경 변수로 등록한다.
2. 공개 `/health`와 Worker 로그를 확인한다. 실제 Slack 메시지로 일반 이모지, 커스텀 이모지, 태그, 긴 결과, 본인 전용 복사 메시지를 시험한다.
3. Slack 앱의 Request URL을 Worker URL로 바꾼 뒤 다시 시험한다. 실패하면 즉시 이전 Railway URL로 돌린다.
4. 안정화 전에는 Railway를 중지하지 않는다.

## 확인할 제한

- Workers Free는 하루 요청 100,000건, 요청당 CPU 10ms다. 실제 배포에서 긴 메시지의 CPU 사용량과 오류를 확인한다.
- `ctx.waitUntil` 작업은 응답 후 최대 30초까지만 보장된다. Slack `trigger_id`는 3초 안에 사용해야 한다.
- `workers.dev` 주소는 무료로 시험할 수 있지만 Cloudflare는 업무상 중요한 운영에 자체 도메인을 권장한다.
