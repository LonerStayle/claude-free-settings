# Claude Code 무료 모델 폴백 설계

작성일: 2026-09-21
상태: 1단계 구현·부분 검증 완료 (2026-09-22). 실제 파일은 `config.yaml`, `docker-compose.yml`, `shell/claude-free.zsh`, `claude/free-session.settings.json`, `hooks/sensitive-guard.sh`. 검증 현황은 6절.

표기: [확인] 공식 문서·공식 API로 확인 / [2차] 블로그·집계 사이트 / [미확인] 확인 못 함

---

## 1. 결론

1. 통합 계층은 LiteLLM 프록시로 한다. 여러 무료 제공처의 한도 합산과 429 자동 전환이 둘 다 문서화된 도구는 LiteLLM뿐이다.
2. 구독 세션과 무료 세션을 분리한다. 평소에는 `claude`(구독 직결), 한도가 소진되면 `claude-free`(LiteLLM 경유)로 세션을 이어간다.
3. 구독 트래픽은 프록시에 태우지 않는다. 전환은 명령으로 한다(사용자 결정). 자동 전환은 하지 않는다.
4. 서브에이전트 모델 분리는 Claude Code 환경변수로 처리한다. 추가 도구는 필요 없다.
5. Jev는 1단계에서 제외한다. 7절 참고.

전제: Anthropic은 게이트웨이를 통한 비-Claude 모델 연결을 공식 지원하지 않는다 [확인]. 동작은 하지만 품질과 호환성은 보장되지 않는다.

---

## 2. 429 질문에 대한 답

| 상황 | 응답 | 근거 |
|---|---|---|
| API 키 사용 중 한도 초과 | HTTP 429 `rate_limit_error` | [확인] |
| Anthropic 과부하 | HTTP 529 `overloaded_error` | [확인] |
| 구독 한도 소진 | 화면에 "You've hit your session limit / weekly limit" 표시. 내부 HTTP 상태코드는 [미확인] | 조사 결과가 엇갈림 |
| 무료 제공처 한도 초과 | HTTP 429 (OpenRouter, Groq, Cerebras, SambaNova 등) | [확인] |

구독 한도는 메인과 서브에이전트가 같은 한도를 공유한다. 서브에이전트만 막히는 경우는 없고, 막히면 세션 전체가 막힌다.
따라서 요구사항은 두 경우로 나뉜다.

| 경우 | 처리 |
|---|---|
| 구독 세션에서 한도 소진 | `claude-free`로 세션 전환 (수동, 4.4절) |
| 무료 세션에서 서브에이전트가 429 수신 | LiteLLM이 해당 제공처를 쿨다운하고 다음 제공처로 자동 전환 |

---

## 3. 구조

```
평소
  claude ──────────────────────────────▶ Anthropic (구독 OAuth)

한도 소진 후
  claude-free ──▶ LiteLLM (127.0.0.1:4000)
                    ├─ claude-free-main  메인 루프
                    │    NVIDIA NIM / OpenRouter :free / Requesty
                    ├─ claude-free-sub   서브에이전트
                    │    Gemini Flash-Lite / Mistral / OpenRouter :free
                    └─ claude-free-fast  백그라운드 소형 요청
                         Groq / Gemini Flash-Lite

  같은 그룹 안: 로드밸런싱, 429 받은 제공처는 쿨다운
  그룹 전체 실패: fallbacks 에 적힌 다른 그룹으로 이동
```

| 그룹 | Claude Code에서 연결되는 곳 | 선정 기준 |
|---|---|---|
| `claude-free-main` | 메인 모델, `opus`/`sonnet`/`fable` alias | 긴 컨텍스트, tool calling, 토큰 한도 큼 |
| `claude-free-sub` | `CLAUDE_CODE_SUBAGENT_MODEL` | 일일 요청 수 많음 |
| `claude-free-fast` | `haiku` alias (제목 생성, 요약 등) | 요청이 작아서 TPM 낮은 제공처도 사용 가능 |

그룹 이름에 `claude`를 넣는 이유: 이름에 `claude`가 있어야 `/model` 선택기에 나타난다 [확인].

---

## 4. 구성

### 4.1 제공처 선정

Claude Code는 요청 1건이 시스템 프롬프트와 도구 정의만으로 수만 토큰이다. TPM이 낮은 제공처는 메인 루프에 쓸 수 없다.

| 제공처 | 무료 한도 | 쓸 모델 | 배치 | 비고 |
|---|---|---|---|---|
| NVIDIA NIM | 40 RPM [2차], 일일 상한 비공개 | `moonshotai/kimi-k3`, `z-ai/glm-5.3` | 보류 | 2026-09-22 신규 계정에 "API Access Unavailable" 표시, 수동 인증 필요. 포럼에 8~9월 같은 사례 다수, 한 달 이상 무응답 보고 있음. 인증되면 main에 추가 |
| OpenRouter ($10 1회 충전) | 20 RPM / 1,000 RPD [확인] | `nvidia/nemotron-3-ultra-550b-a55b:free` (1M), `qwen/qwen3.8-27b:free` (262K) | main, sub | 일일 처리량의 주축. 한도는 키 단위라 main과 sub가 공유한다 |
| Requesty | 200 RPD [확인] | `nvidia/nemotron-3-ultra-550b-a55b`, `google/gemma-4-31b-it` | main | tool calling 플래그 확인됨 |
| Gemini API | Flash 약 20 RPD, Flash-Lite 약 500 RPD [2차, 출처 간 상충] | Flash-Lite 계열 | sub, fast | 무료분 데이터는 제품 개선에 사용됨 [확인] |
| Mistral | 1 RPS, 월 4M~10M 토큰 [2차] | `codestral-2508`, `mistral-medium-3504` | sub | 전화 인증 필요. 학습 활용 기본값, 끌 수 있음 |
| Groq | 30 RPM / 1K RPD / 8K TPM [확인] | `openai/gpt-oss-120b` | fast 전용 | 8K TPM이라 메인·서브 불가 |
| Ollama 로컬 | 제한 없음 | 하드웨어에 따름 | 선택 | 모든 외부 한도 소진 시 사용 |

제외: GitHub Models(2026-07-30 종료), Cerebras(카드 필수), SambaNova(20 RPD), Cloudflare Workers AI, Hugging Face(월 $0.10), Chutes·Together·Fireworks(무료 종료).
보류: Kilo Gateway(익명 시간당 200건 [확인], Claude Code 연동 실측 없음).

OpenRouter 충전 (결정 사항: $10을 1회 충전한다):

- 한도 등급은 누적 크레딧 구매액으로 정해진다 [확인]. 누적 $10 이상이면 50 RPD가 1,000 RPD로 오른다. 월 결제가 아니다. "평생 유지"라는 문구는 문서에 없다. 정책이 바뀌면 달라질 수 있다.
  - 출처: https://openrouter.ai/docs/api_reference/limits (2026-09-22 확인). 원문: "The limit tier is selected by all-time credits purchased. Less than 10 credits: 50 requests per day / At least 10 credits: 1000 requests per day."
- `:free` 모델 호출은 잔액을 쓰지 않는다. 충전한 $10은 그대로 남는다.
- 잔액이 음수가 되면 `:free` 모델도 402로 거절된다 [확인]. config에는 `:free` 접미사가 붙은 모델만 등록한다.
- 잔액을 $10 이상으로 유지해야 하는지는 [미확인]. 충전 전에 OpenRouter 한도 문서를 확인한다.
- OpenRouter 설정에서 학습을 허용하는 제공자를 제외할 수 있다 [2차].

하루 처리량은 OpenRouter 1,000 RPD가 주축이고, Requesty(200 RPD), Gemini Flash-Lite가 보조한다. NVIDIA NIM은 계정 인증 대기로 보류.

모델 ID와 한도는 자주 바뀐다. 적용 전에 각 콘솔에서 다시 확인한다. Gemini는 `aistudio.google.com/rate-limit`에서 실제 값을 본다.

### 4.2 LiteLLM 설치

- Docker 이미지만 사용한다. PyPI `litellm` 1.82.7, 1.82.8은 2026-03-24 공급망 침해 버전이다 [확인].
- `ghcr.io/berriai/litellm`의 안정판(조사 시점 v1.101.0)을 cosign 검증 후 digest로 고정한다. `latest`, `main-stable` 태그는 쓰지 않는다.
- 포트는 `127.0.0.1`에만 연다.

```bash
docker run -d --name litellm --restart unless-stopped \
  -p 127.0.0.1:4000:4000 \
  --env-file .env \
  -v "$PWD/config.yaml:/app/config.yaml:ro" \
  ghcr.io/berriai/litellm@sha256:<검증한 digest> \
  --config /app/config.yaml
```

`.env` (git에 올리지 않는다):

```
LITELLM_MASTER_KEY=sk-<임의 문자열>
NVIDIA_NIM_API_KEY=
OPENROUTER_API_KEY=
REQUESTY_API_KEY=
GEMINI_API_KEY=
MISTRAL_API_KEY=
GROQ_API_KEY=
```

### 4.3 config.yaml

`rpm` 값은 실제 무료 한도보다 조금 낮게 적는다. LiteLLM이 한도 도달 전에 다른 제공처로 분산한다.

```yaml
model_list:
  # ── main: 메인 루프 ──
  - model_name: claude-free-main
    litellm_params:
      model: nvidia_nim/moonshotai/kimi-k3
      api_key: os.environ/NVIDIA_NIM_API_KEY
      rpm: 30
  - model_name: claude-free-main
    litellm_params:
      model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
      api_key: os.environ/OPENROUTER_API_KEY
      rpm: 10          # OpenRouter 20 RPM을 main 10 + sub 8로 나눈다
  - model_name: claude-free-main
    litellm_params:
      model: openai/nvidia/nemotron-3-ultra-550b-a55b   # Requesty는 OpenAI 호환으로 연결
      api_base: https://router.requesty.ai/v1            # 적용 전 URL 확인
      api_key: os.environ/REQUESTY_API_KEY
      rpm: 10

  # ── sub: 서브에이전트 ──
  - model_name: claude-free-sub
    litellm_params:
      model: gemini/<Flash-Lite 모델 ID>
      api_key: os.environ/GEMINI_API_KEY
      rpm: 10
  - model_name: claude-free-sub
    litellm_params:
      model: mistral/codestral-2508
      api_key: os.environ/MISTRAL_API_KEY
      rpm: 30
  - model_name: claude-free-sub
    litellm_params:
      model: openrouter/qwen/qwen3.8-27b:free
      api_key: os.environ/OPENROUTER_API_KEY
      rpm: 8

  # ── fast: 백그라운드 소형 요청 ──
  - model_name: claude-free-fast
    litellm_params:
      model: groq/openai/gpt-oss-120b
      api_key: os.environ/GROQ_API_KEY
      rpm: 25
      tpm: 7000
  - model_name: claude-free-fast
    litellm_params:
      model: gemini/<Flash-Lite 모델 ID>
      api_key: os.environ/GEMINI_API_KEY
      rpm: 5

litellm_settings:
  drop_params: true      # 제공처가 모르는 파라미터 제거
  modify_params: true    # 제공처 형식에 맞게 요청 보정

router_settings:
  routing_strategy: simple-shuffle   # Redis 없이 동작. rpm 가중 분산
  num_retries: 2
  allowed_fails: 1
  cooldown_time: 300                 # 429는 즉시 쿨다운. 일일 한도 소진을 고려해 5분
  enable_pre_call_checks: true
  optional_pre_call_checks:
    - enforce_model_rate_limits
  fallbacks:
    - claude-free-main: ["claude-free-sub"]
    - claude-free-sub: ["claude-free-main"]
    - claude-free-fast: ["claude-free-sub"]
  context_window_fallbacks:
    - claude-free-sub: ["claude-free-main"]
    - claude-free-fast: ["claude-free-main"]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

동작 순서 (서브에이전트가 429를 받을 때):

1. 서브에이전트 요청이 `claude-free-sub` 그룹으로 들어온다.
2. 선택된 제공처가 429를 반환한다. 그 제공처는 300초 동안 제외된다.
3. 같은 그룹의 다른 제공처로 재시도한다 (최대 2회).
4. 그룹 전체가 실패하면 `claude-free-main`으로 넘어간다.
5. Claude Code는 정상 응답만 받는다. 전환 과정은 LiteLLM 로그에만 남는다.

### 4.4 Claude Code 연결

`~/.zshrc`에 함수로 둔다. 환경변수가 이 프로세스에만 적용되므로 평소 `claude`의 구독 로그인에는 영향이 없다.

```zsh
claude-free() {
  ANTHROPIC_BASE_URL="http://127.0.0.1:4000" \
  ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY" \
  ANTHROPIC_API_KEY="" \
  ANTHROPIC_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_OPUS_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_SONNET_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_FABLE_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-free-fast" \
  CLAUDE_CODE_SUBAGENT_MODEL="claude-free-sub" \
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1 \
  claude "$@"
}
```

| 변수 | 역할 |
|---|---|
| `ANTHROPIC_DEFAULT_*_MODEL` | 에이전트 파일이나 Agent 도구가 `opus`/`sonnet`/`haiku`/`fable`을 지정해도 무료 그룹으로 연결된다 |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 모델을 지정하지 않은 서브에이전트의 기본값 |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` | 비-Claude 모델이 모르는 beta 필드로 인한 400 방지 |

서브에이전트 모델 우선순위 [확인]: 호출 시 `model` 파라미터 > 에이전트 frontmatter `model` > `CLAUDE_CODE_SUBAGENT_MODEL` > 메인 모델.
전부 한 그룹으로 강제하려면 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`을 추가한다.
특정 에이전트만 다른 그룹을 쓰게 하려면 `.claude/agents/<이름>.md` frontmatter에 `model: claude-free-main`처럼 그룹 이름을 적는다.

한도 소진 시 전환 절차:

1. 구독 세션에 한도 메시지가 뜬다.
2. 세션을 종료한다.
3. 같은 디렉터리에서 `claude-free --continue`를 실행한다. 직전 대화가 이어진다.
4. 한도가 복구되면 `claude --continue`로 돌아온다.

주의: 구독 세션에서 `.env`, `infra/`, `deploy/` 등 민감 경로를 다뤘다면 `--continue`를 쓰지 않고 새 세션으로 시작한다. 이전 대화 전체가 무료 제공처로 전송되기 때문이다 (`SENSITIVE.md` 2.1절).

주의: 모델이 바뀐 직후 첫 요청은 이전 대화의 thinking 블록 때문에 실패할 수 있다 [미확인]. 실패하면 `/compact` 후 다시 시도하거나 새 세션으로 시작한다.

---

## 5. 제약과 위험

| 항목 | 내용 | 대응 |
|---|---|---|
| 공식 비지원 | 비-Claude 모델 연결은 Anthropic 지원 범위 밖 | 무료 세션은 보조 용도로 사용 |
| 서버 도구 | WebSearch 등 Anthropic 서버 도구는 동작하지 않음 | 검색이 필요하면 MCP 검색 도구 사용 |
| tool calling 품질 | 무료 모델은 도구 호출을 가끔 누락함 [2차] | 6절 2단계에서 모델별로 확인 후 그룹에서 제외 |
| prompt caching | 비-Claude 대상에서는 적용되지 않음. 요청마다 전체 토큰 소모 | TPM 큰 제공처를 main에 배치 |
| count_tokens | OpenRouter, Groq, Mistral 대상은 미지원 [확인]. Claude Code가 글자 수로 추정함 | 오류는 아님. 컨텍스트 표시가 부정확해짐 |
| 데이터 학습 | Gemini 무료분, Mistral 기본값, NVIDIA NIM(로깅)은 입력을 활용함 | `SENSITIVE.md`의 등급별 차단·전환 적용 |
| 약한 모델의 배포 명령 실행 | 무료 모델은 도구 호출 오류 가능성이 높음 | 무료 세션에서 배포·인프라 변경 명령 차단 (`SENSITIVE.md` 5.2절) |
| 무료 정책 변경 | 최근 1년간 축소 추세 | 분기마다 4.1절 표 갱신 |
| OpenRouter 잔액 | 유료 모델을 호출해 잔액이 음수가 되면 `:free`도 402 | config에 `:free` 모델만 등록. OpenRouter 키에 크레딧 한도를 설정 |
| 키 관리 | `.env`에 키 6개 | `.gitignore` 등록, 포트는 127.0.0.1 한정 |

---

## 6. 검증 순서

각 단계가 통과해야 다음으로 간다. 상태는 2026-09-22 기준.

| 단계 | 할 일 | 통과 기준 | 상태 |
|---|---|---|---|
| 1 | OpenRouter `:free` 모델의 도구 호출 확인 (OpenRouter API 직접 호출) | `read_file` 도구를 호출한다 | 통과. 결과는 아래 표 |
| 2 | LiteLLM 기동 후 `curl http://127.0.0.1:4000/v1/messages` 호출 | 세 그룹 모두 200, 도구 호출 응답 | 통과 |
| 3 | `claude-free -p`로 단순 응답, 파일 읽기, `.env` 읽기 시도 | 응답·읽기 성공, `.env`는 차단 | 통과. `Read(.env)`는 `permissions.deny`가 막고, 이어서 시도한 `cat .env`는 hook이 막았다 |
| 4 | `claude-free` 대화 세션에서 서브에이전트(Explore) 호출 | LiteLLM 응답 헤더 `x-litellm-model-group`이 `claude-free-sub` | 미실행 |
| 5 | 무료 제공처 429 시 다른 제공처로 전환 | Claude Code에 오류 없음 | 통과 (의도치 않게 확인됨. qwen 업스트림 429 → `x-litellm-attempted-fallbacks: 1`로 main 그룹 응답) |
| 6 | 구독 세션에서 한도 메시지가 뜰 때 `claude --debug` 로그 확인 | 실제 HTTP 상태코드 기록 (2절 [미확인] 해소) | 미실행 |
| 7 | `claude-free --continue`로 세션 전환 | 직전 대화가 이어지고 첫 요청이 성공한다 | 미실행 |

1단계 결과 (OpenRouter `:free`, 2026-09-22):

| 모델 | 컨텍스트 | 도구 호출 | 배치 |
|---|---|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | 통과 | main |
| `nvidia/nemotron-3.5-lightning:free` | 1M | 통과 | main, fast |
| `nex-agi/nex-n2.5-pro:free` | 262K | 통과 | main |
| `inclusionai/ling-3.0-flash-vl:free` | 262K | 통과 | main |
| `cohere/north-mini-code:free` | 256K | 통과 | sub |
| `poolside/laguna-xs-2.1:free` | 262K | 통과 | sub, fast |
| `nex-agi/nex-n2.5-mini:free` | 262K | 통과 | sub, fast |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K | 통과 | sub |
| `qwen/qwen3.8-27b:free` | 262K | 미확인 | 제외. 업스트림 429가 잦음 |
| `poolside/laguna-s-2.1:free` | 262K | 미확인 | 시험 중 429 |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | 미확인 | 시험 중 503 |
| `google/gemma-4-31b-it:free`, `gemma-4-26b-a4b-it:free` | 262K | 미확인 | 시험 중 429 |
| `thinkingmachines/inkling:free`, `inkling-small:free` | 1M | 제외 | 403 |
| `dots-studio/dots-3-note-preview:free` | 512K | 제외 | 400 |
| `stepfun/step-3.7-flash:free` | — | 제외 | 무료 제공 종료 (404) |

### 429 "No deployments available" 장애와 수정 (2026-09-22)

증상: 실사용 중 Claude Code에 `429 No deployments available for selected model, Try again in 300 seconds. Passed model=claude-free-main`이 떴다.

원인: 세 가지가 겹쳤다.

1. main 그룹에 배포가 1개뿐이었다. 그 하나가 죽으면 그룹이 빈다.
2. `allowed_fails: 1` — 업스트림 일시 장애(NVIDIA "Service temporarily overloaded") 한 번에 배포가 쿨다운에 들어갔다.
3. `cooldown_time: 300` — 5분간 그룹이 비었다. fallback 대상인 sub 그룹도 같은 이유로 비어 있어 429가 그대로 올라왔다.

수정:

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 그룹당 배포 수 | main 1, sub 3, fast 2 | main 4, sub 4, fast 3 |
| `allowed_fails` | 1 | 3 |
| `cooldown_time` | 300 | 60 |
| `num_retries` | 2 | 3 |
| `optional_pre_call_checks` | `enforce_model_rate_limits` | 삭제. rpm 초과 시 배포를 걸러내 그룹이 비는 원인이 된다 |
| `fallbacks` | 한 방향씩 | 세 그룹 상호 연결 |

수정 후 세 그룹을 3회씩 호출한 결과 9건 모두 도구 호출에 성공했고 fallback 없이 서로 다른 배포로 분산됐다.

무료 모델은 업스트림 429·503이 흔하다. 그룹당 배포를 4개 이상 유지한다.

추가 확인 사항: `ANTHROPIC_AUTH_TOKEN`이 설정되면 Claude Code가 claude.ai 커넥터(Gmail, Drive, Notion 등)를 비활성화한다고 안내한다. `SENSITIVE.md` 5.7절의 [미확인]이 해소됐다. 무료 세션에서는 커넥터가 로드되지 않는다.

---

## 7. Jev

| 항목 | 내용 |
|---|---|
| 정체 | TypeSafe AI가 2026-09-15 공개한 결정 전용 모델 API. 텍스트를 생성하지 않고, 상태와 타입이 지정된 질문을 받아 선택·점수·확률만 반환한다 [확인] |
| API | `POST /v1/systemone`, 64K 컨텍스트, 1,200 RPM |
| 가격 | 입력 $0.042/1M 토큰, 출력 무료. 얼리 액세스 대기자 명단. 공식 무료 할당량 [미확인] |
| 모델 라우팅과의 관계 | Jev 자체는 프록시가 아니다. 요청 난이도를 분류하는 용도로 쓰고, 실제 라우팅은 다른 도구가 한다 |
| 관련 도구 | `gargpratyush/jev-router`: 구독 로그인을 유지한 채 요청마다 Haiku/Sonnet/Opus/Fable을 고른다. LiteLLM v1.103 계열(rc)에 `classifier_type: jev` 추가됨 |
| 제한 | 한국어·중국어·일본어 입력은 신뢰도가 낮다고 공식 문서가 명시. 프롬프트가 TypeSafe로 전송된다 |

1단계에서 제외하는 이유:

- 429 전환과 무료 한도 합산을 해결하지 않는다.
- 유료이고 무료 할당량이 확인되지 않았다.
- 한국어로 작업하는 환경에서 분류 정확도가 낮을 수 있다.

쓸 만한 위치 (3단계 선택 사항):

- 구독 세션에 `jev-router`를 붙여 쉬운 요청을 Haiku로 보낸다. 구독 한도 소진 시점을 늦추는 효과가 있다.
- 무료 세션에서 LiteLLM `classifier_type: jev`로 쉬운 요청은 `sub`, 어려운 요청은 `main`으로 보낸다. 안정판에 포함된 뒤 검토한다.

---

## 8. 단계 계획

| 단계 | 범위 | 조건 |
|---|---|---|
| 1 | 이 문서의 구성. 세션 분리 + LiteLLM 무료 그룹 3개. `SENSITIVE.md`의 경로 기준 차단(5.1~5.4절) 포함 | 6절 검증 통과 |
| 1.5 | `SENSITIVE.md`의 LiteLLM 요청 내용 검사(5.5절). 비공개 그룹은 선택 | custom callback이 `/v1/messages`에서 동작하는지 확인 |
| 3 | Jev 난이도 라우팅 추가 | 무료 할당량 또는 비용 확인, 한국어 정확도 확인 |

제외: 구독 트래픽을 LiteLLM에 통과시켜 Anthropic 한도 초과 시 자동 전환하는 구성. 사용자 결정(2026-09-22)으로 뺐다. 전환은 `claude-free --continue` 명령으로 한다. 이에 따라 LiteLLM OAuth 통과 버그(#42170 등)는 이 프로젝트와 무관하다.

대안 (LiteLLM이 맞지 않을 때):

| 도구 | 강점 | 약점 |
|---|---|---|
| claude-code-router v3 | 서브에이전트별 모델 지정 태그, 키 로테이션, 웹 UI | 이종 프로토콜 fallback 400 버그(#1615), 옛 설정 예시가 v3와 다름 |
| OpenRouter 직결 | 환경변수 4줄, 설치 없음 | fallback 없음, 한도 합산 불가 |
| Requesty 직결 | 대시보드에서 fallback 설정 | 200 RPD 단일 한도 |

---

## 9. 관련 문서와 조사 원문

| 파일 | 내용 | 주의 |
|---|---|---|
| `SENSITIVE.md` | 민감 정보 등급, 경로 기준 차단, LiteLLM 요청 내용 검사, 비공개 그룹 | 스크립트 미실행 |
| `research/research-free-tiers.md` | 제공처 27곳 한도·모델·출처 URL | Gemini, Mistral 수치는 2차 출처 |
| `research/research-routing.md` | Jev, LiteLLM, 대안 라우터, 출처 URL, 미확인 목록 | config 예시는 미실행 |
| `research/research-claude-code.md` | Claude Code 환경변수, 게이트웨이 규격, 서브에이전트 모델 | 8절 hooks 이벤트 이름과 1절 "429 아님" 주장은 근거가 약함. 이 문서에 반영하지 않았다 |
