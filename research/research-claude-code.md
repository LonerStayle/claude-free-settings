# Claude Code 무료 모델 연동 설계 - 공식 문서 기준 조사 결과

**조사 날짜**: 2026-09-21  
**기준**: code.claude.com/docs, platform.claude.com 공식 문서 (v2.1.269 이상)

---

## 1. 구독 한도 소진 시 Claude Code의 응답

### 확인된 사실
- **상태코드**: 429 (rate limit)가 아닌 **앱 레벨 에러 메시지**
  - `"You've hit your session limit"`
  - `"You've hit your weekly limit"`
  - `"You've hit your Opus limit"` (모델별)
  - `"You've hit your monthly spend limit"`
  
### API 키 사용 시 vs 구독
- **API 키 직접 사용** (`ANTHROPIC_API_KEY`): HTTP 429 (rate_limit_error), 529 (overloaded_error)
- **구독 OAuth** (`/login`): 위의 앱 레벨 메시지 + 자동 재시도 논리 적용
  
### 화면 표시
- 에러 메시지가 프롬프트 바에 나타남, 입력 불가 상태
- 사용자는 plan upgrade 또는 한도 reset 대기 필요

### 비고
- 문서에는 "usage limits" 섹션이 있지만, HTTP 상태코드 정확성에 대한 언급 없음
- 구독 한도와 API 키 한도는 **별도 체계**

---

## 2. 서드파티 게이트웨이 연결 환경변수 (현재 유효)

### 인증 관련
| 변수 | 용도 | 우선순위 | 비고 |
|------|------|--------|------|
| `ANTHROPIC_BASE_URL` | 게이트웨이 또는 프록시 주소 | 높음 | LiteLLM, 사용자 정의 엔드포인트 |
| `ANTHROPIC_API_KEY` | API 키 (X-Api-Key 헤더) | 매우 높음 | 서브스크립션 오버라이드, 게이트웨이 토큰 |
| `ANTHROPIC_AUTH_TOKEN` | Bearer 토큰 (Authorization 헤더) | 높음 | 게이트웨이 인증, API 키 대안 |
| `ANTHROPIC_PROFILE` | 명시된 Anthropic 프로필 이름 | 높음 | federation/OAuth 프로필 |
| `apiKeyHelper` (settings.json) | 자격증명 스크립트 | 높음 | 동적/회전 토큰 |

### 모델 관련
| 변수 | 용도 |
|------|------|
| `ANTHROPIC_MODEL` | 기본 모델 ID/alias |
| `ANTHROPIC_DEFAULT_MODEL` | 새 세션 기본값 (v2.1.236+) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus alias 핀 (클라우드 제공자용) |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet alias 핀 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku alias 핀 |
| `ANTHROPIC_DEFAULT_FABLE_MODEL` | Fable alias 핀 |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 서브에이전트 기본 모델 |

### 폐기된 변수
- `ANTHROPIC_SMALL_FAST_MODEL` - 폐기됨. `ANTHROPIC_DEFAULT_HAIKU_MODEL` 사용

### 설정 파일 경로
- `~/.claude/settings.json` - 사용자 전역
- `.claude/settings.json` - 프로젝트 전역
- `.claude/settings.local.json` - 프로젝트 로컬 (gitignore)
- `env` 블록 내 환경변수 선언 가능

---

## 3. 공식 LLM Gateway 문서 내용

### 엔드포인트 (필수)
```
POST /v1/messages          - 추론 요청
GET  /v1/messages/count_tokens (선택사항)  - 토큰 계산
```

### 요청 헤더 (반드시 전달)
| 헤더 | 처리 | 비고 |
|------|------|------|
| `anthropic-beta` | **Forward unchanged** | 능력 활성화, 각 릴리스마다 변함 |
| `anthropic-version` | **Forward unchanged** | `2023-06-01` |
| `Authorization`, `x-api-key` | Consume 또는 전달 | 게이트웨이 credential |
| `x-claude-code-session-id` | Consume 또는 전달 | 세션 추적용 |
| `x-claude-code-agent-id` | Consume 또는 전달 | 서브에이전트 추적용 |

### 응답 헤더
| 헤더 | 용도 |
|------|------|
| `content-type` | `text/event-stream` (streaming responses) |
| `retry-after` | 재시도 대기 시간 (초 단위 정수) |
| `x-should-retry` | `true`/`false` 재시도 가능 여부 |
| `anthropic-ratelimit-unified-*` | 사용량 표시 (claude.ai 사용자용) |

### 주요 제약
1. **Feature pass-through**: 헤더 및 body 필드를 애드혹 리스트로 취급 금지
   - 미래 능력을 위한 새로운 베타 값, 필드가 추가될 수 있음
   - 허용목록 핀 = 기능 파괴
   
2. **System prompt attribution block**
   - Claude Code가 시스템 프롬프트 시작에 부가하는 metadata
   - 첫 번째 `system` 블록이어야 api.anthropic.com이 제거 가능
   - 게이트웨이가 `system` 배열을 변경하면 제거 불가
   - `CLAUDE_CODE_ATTRIBUTION_HEADER=0`으로 비활성화 가능 (프롬프트 캐싱 호환성용)

3. **Streaming**
   - Keep-alive ping 전달 필수 (300초 idle timeout 감지용)
   - 바이너리 버퍼링 금지

4. **Model discovery** (선택사항)
   - `GET /v1/models?limit=1000` 지원 시 `/model` 선택기에 추가
   - `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`로 활성화

---

## 4. 서브에이전트 모델 지정 방법

### 우선순위 (높음→낮음)
1. **Per-invocation** - Agent 도구 호출 시 `model` 파라미터
2. **Frontmatter** - `.claude/agents/*.md`의 `model` 필드
3. **Environment** - `CLAUDE_CODE_SUBAGENT_MODEL` env var
4. **Main session** - 현재 메인 모델 (기본값)

### Frontmatter 예시
```yaml
---
name: code-improver
model: sonnet
---
```

### 사용 가능한 값
- **Model aliases**: `sonnet`, `opus`, `haiku`, `fable`, `inherit` (메인 모델 상속)
- **Full model IDs**: `claude-opus-5`, `claude-sonnet-4-6`
- **Provider prefixes**: Amazon Bedrock의 `us.anthropic.claude-opus-5` 등

### 강제 지정
```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku",
    "CLAUDE_CODE_SUBAGENT_MODEL_FORCE": "1"
  }
}
```
효과: 서브에이전트 `model` 필드, per-invocation parameter 무시

---

## 5. ANTHROPIC_BASE_URL과 OAuth 로그인 동시 유지

### 확인된 사실 (Gateway 문서 명시)
✅ **가능**: `ANTHROPIC_BASE_URL`만 설정, gateway credential 변수 없음
```bash
export ANTHROPIC_BASE_URL=https://litellm-proxy.example.com
# ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN 설정 X
```

**결과**: 
- 요청이 게이트웨이를 통과
- 저장된 claude.ai 로그인이 **활성 credential** 유지
- 서브스크립션 usage limits 적용
- 게이트웨이가 OAuth 능력 전달 필요 (`anthropic-beta` 헤더의 OAuth capability)

### 비고
- "Subscriptions and gateways" 섹션: "Setting only that variable, without a gateway credential, doesn't replace the subscription"
- 게이트웨이가 OAuth Authorization 헤더를 전달하지 않으면 401 오류

### 약관상 주의
- 게이트웨이가 구독 credential을 보면 게이트웨이가 Anthropic으로 요청을 포워드해야 함
- 게이트웨이 operator 책임: OAuth 헤더 pass-through

---

## 6. 세션 중 백엔드 전환 방법

### 방법 1: 같은 세션에서 모델만 변경
```bash
/model
/model sonnet
/model opus[1m]
```
- 모델 변경, 백엔드 유지
- 세션 재시작 불필요
- Prompt cache 유지

### 방법 2: 다른 환경에서 세션 이어가기
```bash
# 메인 터미널 (ANTHROPIC_BASE_URL=A)
claude --name my-session

# 다른 터미널 (ANTHROPIC_BASE_URL=B)
claude --resume my-session
```
- 가능 (2.1.223+)
- 그러나 **모델이 변경될 수 있음** (provider-specific model 아니면)
- 저장된 모델 ID가 새 환경에서 support되지 않으면 fallback 적용

### 방법 3: 환경 변수로 프로필 분리
```bash
# alias 작성
alias claude-free='ANTHROPIC_BASE_URL=https://free-api.example.com claude'
alias claude-paid='ANTHROPIC_BASE_URL=https://paid-api.example.com claude'

claude-paid    # Pro 세션
claude-free    # Free 세션
```
- 가능, 세션 파일 위치는 동일 프로젝트 내 공유

### 제약
- 세션 resume 시 model alias (`sonnet`, `opus`)는 새 환경의 pin 설정을 따름
- Full model ID는 새 환경에서 인식 안 되면 대체 모델 사용

---

## 7. 비-Claude 모델 제약

### 공식 명시 사항 (모든 문서에서 일관)
> "Anthropic doesn't support routing Claude Code to non-Claude models through any gateway."

### 지원되는 구조
#### A. Cloud Provider Direct (Claude 모델만)
- Amazon Bedrock: Claude 모델만 (Anthropic exclusive agreement)
- Google Cloud's Agent Platform: Claude 모델만
- Microsoft Foundry: Claude 모델만

#### B. Claude Apps Gateway + Cloud Provider
- 게이트웨이 뒤 에서 Claude 모델 라우팅

#### C. Anthropic Console / Direct API
- Anthropic이 제공하는 Claude 모델만

### 비-Claude 모델이 불가능한 이유
1. **Tool use 포맷**: Claude 특화 스키마
2. **Thinking blocks**: `{"type": "adaptive"}` 등 Claude 전용
3. **Anthropic-specific headers**: `anthropic-beta` capability 협상
4. **Prompt caching**: `cache_control` 필드 Claude API만 지원
5. **Context management**: Claude 4.5+ 전용 feature

### 대안
- **LiteLLM 게이트웨이가 다른 모델도 라우팅하려면**:
  - Claude Code는 지원하지 않음
  - 다른 AI 도구 사용 필요

### Amazon Bedrock의 경우
- Bedrock은 Claude 모델만 Claude Code와 호환
- 다른 provider 모델 (Llama 등)은 Bedrock 내에서만 지원되며, Claude Code와 호환되지 않음

### Gemini, OpenRouter, Groq
- Claude Code **직접 미지원**
- LiteLLM 게이트웨이 사용 가능 ≠ Claude Code 보장
- HTTP 호환성만 가능, Claude 특화 기능 손실 필연

---

## 8. Hooks 중 에러 감지 및 자동 조치

### 사용 가능한 Hook 이벤트
(Hooks Guide 문서에서 열거된 것)

#### 모델 관련
- `ModelSelected` - 모델 선택 후
- `ModelRequestFailed` - 모델 요청 실패 후

#### 세션 관련
- `SessionStart`, `SessionEnd` - 세션 시작/종료
- `Notification` - 알림 요청

#### 도구 관련
- `ToolSelected`, `ToolExecuted`, `ToolFailed` - 도구 실행 결과

#### 에러 관련 (확인된 것)
- `StopFailure` - "stop" 신호 실패
- `SubagentStop` - 서브에이전트 종료
- `CommandFailed` - 명령 실패

### 구독 한도 감지용 Hook
- **공식 문서 미제공**: "User's session limit" 에러를 감지하는 특화된 hook 없음
- **대안**: `ModelRequestFailed` hook로 에러 메시지 파싱 (비권장, 취약)

### 자동 조치 구현 방식
```json
{
  "hooks": {
    "ModelRequestFailed": {
      "command": "echo 'Rate limit hit, falling back...' && export ANTHROPIC_BASE_URL=https://free-tier.example.com",
      "async": true
    }
  }
}
```
- 가능하지만 **에러 메시지 문자열 매칭** 필요 (불안정)
- 공식 에러 코드/분류 없음

### Prompt-based / Agent-based Hooks
- 가능 (Sonnet 모델로 의사결정)
- 한도 감지 비용이 추가 token 소비

### 한계
- 구독 한도 에러는 앱 레벨 (HTTP 단위 아님)
- 게이트웨이 500 에러는 감지 가능하나, 한도 vs 과부하 구분 불가

---

## 최종 결론 및 권장사항

### 가능성
✅ LiteLLM 게이트웨이를 통한 구조적 지원:
1. Claude Code → LiteLLM (ANTHROPIC_BASE_URL)
2. LiteLLM → 무료 Gemini/Groq/OpenRouter (routing logic)
3. OAuth credential 유지 (사용량 표시는 게이트웨이가 담당)

### 제약
❌ **공식 보증 부재**:
- Claude Code는 Claude 모델 외 비지원
- LiteLLM의 포맷 변환 여부 미확인
- Tool use, thinking, prompt caching 손실 가능

❌ **Anthropic 약관**:
- 게이트웨이가 Anthropic API를 경유하면서 credential을 보관하는 경우, Anthropic 이용약관의 "third-party 서비스 금지" 조항 검토 필요

### 권장 접근
1. **LiteLLM 검증**: Anthropic Messages API 형식 호환성 실험
2. **Fallback 전략**: hook + `ANTHROPIC_BASE_URL` 전환 (구독 한도 감지 후)
3. **모니터링**: `/status` 커맨드로 실제 모델/공급자 확인
4. **한계 수용**: 비-Claude 모델 사용 시 advanced features (thinking, prompt cache) 손실

---

## 참고 자료

- [Claude Code Authentication](https://code.claude.com/docs/en/authentication.md) - 기본 인증, 환경변수 우선순위
- [LLM Gateway Protocol](https://code.claude.com/docs/en/llm-gateway-protocol.md) - 게이트웨이 호환성 사양
- [LLM Gateway Connect](https://code.claude.com/docs/en/llm-gateway-connect.md) - 개발자 설정 가이드
- [Environment Variables](https://code.claude.com/docs/en/env-vars.md) - 전체 env var 목록
- [Sub-agents](https://code.claude.com/docs/en/sub-agents.md) - 서브에이전트 모델 지정
- [Model Configuration](https://code.claude.com/docs/en/model-config.md) - 모델 alias 및 핀 설정
- [Sessions](https://code.claude.com/docs/en/sessions.md) - 세션 관리 및 resume
- [Third-party Integrations](https://code.claude.com/docs/en/third-party-integrations.md) - 클라우드 제공자 지원
- [Hooks Guide](https://code.claude.com/docs/en/hooks-guide.md) - Hook 이벤트 (초안)
- [Errors](https://code.claude.com/docs/en/errors.md) - 에러 메시지 (상세 분류 제한적)
