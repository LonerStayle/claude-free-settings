# Claude Code 무료 서드파티 모델 라우팅/프록시 계층 조사

- 조사일: 2026-09-21
- 방법: 웹 검색 + 공식 문서/저장소 직접 열람. 이 조사에서 **어떤 설정도 직접 실행해 보지는 않았다.** "문서 확인"은 공식 문서에 그렇게 적혀 있다는 뜻이고, "동작 확인"이 아니다.
- 표기: **[확인]** = 공식 문서/공식 저장소/1차 출처에서 직접 읽음, **[2차]** = 블로그·검색 요약 등 2차 출처, **[추정]** = 출처를 바탕으로 한 본 조사자의 추론(검증 안 됨), **[상충]** = 출처끼리 서로 어긋남.

---

## A. "Jev" 의 정체

### A-1. 결론: 실제로 존재한다. 단, 프록시/게이트웨이가 아니라 "라우팅 결정을 내려 주는 모델 API" 다

- **[확인]** Jev 는 TypeSafe AI 가 2026-09-15 에 공개한 "System One Model". 텍스트를 생성하지 않고(문자열 생성 포기), 상태(state) + 타입이 지정된 질문을 받아 Choice / Score / Noul(0~1 확률) 같은 **구조화된 결정**만 돌려준다. 응답 70~500ms.
  출처: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- 사용자가 말한 "요즘 핫한 모델 API 이고 LLM 자체는 아니다" 라는 설명과 정확히 일치한다. (생성형 LLM 이 아니라 분류/라우팅/채점 전용 결정 모델)
- **[확인]** 엔드포인트 `POST /v1/systemone`, 현재 버전 Jev 1.13.0, 컨텍스트 64k(상태+최장 질문 32k), 1,200 RPM, 텍스트 입력만. 영어가 가장 정확하고 CJK 는 "동작하지만 신뢰도 낮음" 이라고 공식 문서가 명시.
  출처: https://docs.typesafe.ai/models
- **[확인]** 가격: 입력 $0.042 / 1M 토큰($42 / 1B), 출력 무료. 얼리 액세스 + 대기자 명단. 콘솔: https://console.typesafe.ai/
  출처: https://typesafe.ai/blog/introducing-system-one-models-and-jev , https://docs.typesafe.ai/models
- **[확인]** Vercel AI Gateway 에 `typesafe-ai/jev` 로 등록(2026-09-16), 가격 동일, 무료 티어 언급 없음.
  출처: https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway , https://vercel.com/ai-gateway/models/jev
- **[2차]** Requesty, OpenRouter, Cloudflare AI 에도 모델 페이지가 있다(검색 결과에 노출, 본문은 열람하지 않음).
  https://www.requesty.ai/model/typesafe/jev , https://openrouter.ai/typesafe , https://developers.cloudflare.com/ai/models/typesafe/jev/
- **무료 할당량**: 공식 출처에서는 **무료 티어를 확인하지 못했다.** flaviusapop/jev-router README 가 "무료 TypeSafe Jev API 키" 라고 쓰고, 비공식 가이드 사이트(jevaiguide.com)가 "카드 등록 필요, 무료 기간 종료일 있음" 이라고 쓰지만 둘 다 1차 출처가 아니다. → **확인 실패(미확정)** 로 취급.
- 주의: jevai.org, jevtypesafeai.com, jevaiguide.com 은 **공식 사이트가 아니다**(jevai.org 는 스스로 커뮤니티 사이트라고 밝힘). 공식은 typesafe.ai / docs.typesafe.ai / console.typesafe.ai.
  출처: https://www.jevai.org/
- 철자 변형(Zev / Jevv / Jevi / Jave) 으로 검색했으나 같은 용도의 별도 제품은 나오지 않았다. 모두 TypeSafe Jev 로 수렴.

### A-2. Jev 로 하는 "모델 라우팅" 의 실제 의미

Jev 자체에는 프록시/fallback/로드밸런싱 기능이 없다. 커뮤니티가 Jev 를 **분류기**로 써서 "이 턴은 어느 모델로 보낼까" 를 정하는 도구들을 만든 것이다.

| 도구 | 방식 | 라우팅 대상 | 상태 |
|---|---|---|---|
| gargpratyush/jev-router | `npm i -g jev-router`. 루프백 프록시가 `ANTHROPIC_BASE_URL` 로 끼어들어 `model` 필드만 바꿔 씀. 기존 구독 로그인 헤더는 그대로 통과 | Haiku / Sonnet / Opus / (옵션) Fable, Codex 는 GPT 계열 | MIT, 별 260, `JEV_API_KEY` 필요. **429 fallback·무료 모델 언급 없음** |
| flaviusapop/jev-router | 위 프로젝트의 포크(독립 개발). Claude Code/Codex/Grok/opencode | 동일하게 같은 공급자 안의 티어 | MIT, 별 0 |
| Jev Model Router (aitmpl.com, Daniel San) | Claude Code "Mod". `npx claude-code-templates@latest --mod productivity/jev-model-router` 후 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude`. Claude Code 2.1.259+ 필요 | Haiku / Sonnet / Opus + reasoning effort. 서브에이전트 모델 분류 포함 | 메인 모델을 세션 중간에 바꾸면 **프롬프트 캐시가 무효화**되므로 메인 라우팅은 기본 꺼짐 |
| prismhq/jev-router | LiteLLM 위에 얹은 라우터. pre-call hook 이 후보를 걸러 Jev(없으면 최저가 기준)로 선택 | OpenRouter 등 LiteLLM 지원 공급자 전부 | MIT, 별 3, 커밋 1개. **OpenAI 호환만 제공 → Claude Code 에 바로 못 붙임** |
| LiteLLM 내장 | v1.103.0 계열에 PR #41615 로 auto-router 의 `classifier_type: jev` + `jev_classifier_config` 병합. `TYPESAFE_API_KEY` 필요 | LiteLLM model_list 전체 | 아직 rc. Admin UI 미반영 버그(#41712) |

출처: https://github.com/gargpratyush/jev-router , https://github.com/flaviusapop/jev-router , https://aitmpl.com/component/mod/productivity/jev-model-router , https://x.com/dani_avila7/status/2101176629745561686 , https://github.com/prismhq/jev-router , https://github.com/BerriAI/litellm/issues/41712 , https://github.com/yibie/awesome-jev , https://enterprisedna.co/resources/ai-pulse/ai-pulse-2026-09-18-jev-router-auto-picks-the-cheapest-model-per-task/

알려진 문제:
- **[확인]** 사용자 프롬프트 텍스트가 TypeSafe 로 전송된다(gargpratyush README).
- **[확인]** 에이전트 팀/서브에이전트 메시지가 턴마다 라우팅되어 호출이 증폭된다(사용자 프롬프트 3개 → Jev 호출 21회). https://github.com/gargpratyush/jev-router/issues/29
- **[확인]** Bifrost 에도 Jev 라우터 기능 요청이 올라와 있다(아직 기능 아님). https://github.com/maximhq/bifrost/issues/7278

### A-3. 이번 목적(무료 모델로 Claude Code 돌리기)에 대한 판단

- **[추정]** Jev 는 "난이도에 따라 싼 모델/비싼 모델을 고르는" 품질 기반 라우팅용이다. 이번 과제의 핵심인 **429 시 자동 fallback, 여러 무료 제공처 한도 합산**은 Jev 가 해결해 주지 않는다. 그건 LiteLLM/CCR 같은 프록시 계층의 일이다.
- Jev 는 유료(입력 과금)이고 무료 티어는 미확인이므로 "무료로 돌린다" 는 목표와도 어긋난다. 필요해지면 나중에 LiteLLM 의 `classifier_type: jev` 로 얹을 수 있는 **선택적 추가 계층**으로 보는 것이 맞다.

---

## B. LiteLLM 프록시

### B-1. Claude Code 연동 (공식 문서)

- **[확인]** LiteLLM 은 Anthropic 형식 통합 엔드포인트 `/v1/messages` 를 제공하고 "모든 LiteLLM 지원 공급자" 에서 동작한다. 스트리밍·fallback·로드밸런싱·비용추적이 이 경로에서도 "지원 모델 간에 동작" 한다고 명시.
  https://docs.litellm.ai/docs/anthropic_unified/
- **[확인]** `/v1/messages/count_tokens` 지원 공급자: Anthropic, Vertex(Claude), Bedrock(Claude), Gemini, Vertex(Gemini), OpenAI. **OpenRouter/Groq/Cerebras/Mistral 은 목록에 없고**, 미지원 공급자일 때의 동작은 문서에 없다.
  https://docs.litellm.ai/docs/anthropic_count_tokens
- **[확인]** Claude Code 쪽은 count_tokens 가 없으면 오류 없이 **문자 수 기반 추정**으로 떨어진다(/context 수치가 근사치가 될 뿐).
  https://code.claude.com/docs/en/llm-gateway-protocol
- **[확인]** 비-Anthropic 모델 튜토리얼의 환경변수:
  ```bash
  export ANTHROPIC_BASE_URL="http://0.0.0.0:4000"
  export ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY"
  export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
  claude --model gemini-3.8-flash
  ```
  `/model` 피커에는 id 에 `claude` 또는 `anthropic` 이 들어간 모델만 나타난다. 컨텍스트 창은 `model_info.max_input_tokens` 로 선언, 표시 이름은 `model_info.display_name`.
  https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models
- **[확인] Anthropic 의 공식 입장**: "Anthropic 은 서드파티 게이트웨이를 보증·유지·감사하지 않으며, **어떤 게이트웨이를 통해서든 Claude Code 를 비-Claude 모델로 라우팅하는 것을 지원하지 않는다.**" 즉 전부 비지원 구성이다.
  https://code.claude.com/docs/en/llm-gateway

### B-2. model_list 등록과 prefix

| 공급자 | prefix | 키 환경변수 | 출처 |
|---|---|---|---|
| Gemini (AI Studio) | `gemini/` (prefix 없으면 Vertex 로 간주됨) | `GEMINI_API_KEY` | https://docs.litellm.ai/docs/providers/gemini |
| OpenRouter | `openrouter/` (예: `openrouter/<vendor>/<model>:free`) | `OPENROUTER_API_KEY` (+선택 `OPENROUTER_API_BASE`, `OR_SITE_URL`, `OR_APP_NAME`) | https://docs.litellm.ai/docs/providers/openrouter |
| Groq | `groq/` | `GROQ_API_KEY` | https://docs.litellm.ai/docs/providers/groq |
| Cerebras | `cerebras/` | `CEREBRAS_API_KEY` | https://docs.litellm.ai/docs/providers/cerebras |
| Mistral | `mistral/` / `MISTRAL_API_KEY` — **이번 조사에서 문서를 직접 열람하지 않음. 기존 지식 기반, 적용 전 확인 필요** | | https://docs.litellm.ai/docs/providers/mistral |
| 임의의 OpenAI 호환 | `openai/<model>` + `api_base` | 임의 | (2차) https://dev.to/sydasif78/running-claude-code-for-free-through-multiple-ai-providers-with-litellm-417d |

`:free` 모델 호출법은 LiteLLM OpenRouter 문서에 별도 설명이 없다. **[추정]** OpenRouter 모델 id 를 그대로 prefix 뒤에 붙이면 된다.

### B-3. 신뢰성/라우팅 설정

**[확인]** https://docs.litellm.ai/docs/proxy/reliability , https://docs.litellm.ai/docs/routing , https://docs.litellm.ai/docs/proxy/load_balancing

- `fallbacks: [{"A": ["B","C"]}]` — 429, 500 등 **모든 오류**에 적용되는 일반 fallback. `litellm_settings` 와 `router_settings` 양쪽에서 받는다.
- `context_window_fallbacks` — 컨텍스트 초과 시. `router_settings.enable_pre_call_checks: true` 필요.
- `content_policy_fallbacks`, `default_fallbacks: ["x"]`(모든 그룹 공통 기본값).
- 순서: **같은 model_name 안에서 `num_retries` 만큼 재시도 → 그래도 실패하면 fallback 그룹으로.**
- 쿨다운: 기본 `allowed_fails: 3`(분당), `cooldown_time: 5`초. **429 는 실패 횟수와 무관하게 즉시 쿨다운**("Immediate on 429 response"). 배포 단위 override 는 `model_info.allowed_fails / cooldown_time`.
- retry-after 헤더를 해석하는지는 문서에 **명시 없음**.
- 로드밸런싱: **같은 `model_name` 을 가진 항목을 여러 개** 두면 한 그룹으로 묶여 분산된다. 각 항목 `litellm_params` 에 `rpm` / `tpm` 을 적는다.
- `routing_strategy`: `simple-shuffle`(기본, rpm/tpm 가중치로 선택, **프로덕션 권장**), `usage-based-routing-v2`(TPM 사용량 최저 배포로, **Redis 필요**), `latency-based-routing`, `least-busy`, `cost-based-routing`.
- `optional_pre_call_checks: [enforce_model_rate_limits]` — 설정한 rpm/tpm 에 도달하면 공급자에 보내기 전에 프록시가 429 로 차단(→ 그룹 내 다른 배포/ fallback 으로 넘어가는 트리거로 쓸 수 있음 **[추정]**).
- 프록시 요청에서 `mock_testing_fallbacks` 는 v1.85.0 부터 deprecated. 테스트는 실제 오류를 유발해서 하라고 안내.

### B-4. Claude 구독 OAuth 통과 + 429 시 무료 모델 fallback

- **[확인] 공식 가이드가 있다.** "Using Claude Code Max Subscription":
  ```yaml
  model_list:
    - model_name: anthropic-claude
      litellm_params:
        model: anthropic/claude-sonnet-5
  general_settings:
    master_key: os.environ/LITELLM_MASTER_KEY
    forward_client_headers_to_llm_api: true
  ```
  ```bash
  ANTHROPIC_BASE_URL=http://localhost:4000
  ANTHROPIC_MODEL="anthropic-claude"
  ANTHROPIC_CUSTOM_HEADERS="x-litellm-api-key: Bearer sk-..."
  ```
  LiteLLM 인증은 `x-litellm-api-key`, Anthropic 인증은 Claude Code 가 보내는 `Authorization: Bearer <oauth>` 를 그대로 전달. 모델 단위 제한은 `litellm_settings.model_group_settings.forward_client_headers_to_llm_api: [모델명...]`.
  https://docs.litellm.ai/docs/tutorials/claude_code_max_subscription , https://docs.litellm.ai/docs/proxy/forward_client_headers
- **[확인] Claude Code 쪽 조건**: `ANTHROPIC_BASE_URL` **만** 설정하고 게이트웨이 자격증명 변수(`ANTHROPIC_AUTH_TOKEN`, `apiKeyHelper`)를 두지 않아야 구독 로그인이 유지된다. 자격증명 변수를 넣는 순간 구독은 쓰이지 않는다. 게이트웨이는 `anthropic-beta` 를 그대로 전달해야 하며(OAuth capability 포함), 빼면 401.
  https://code.claude.com/docs/en/llm-gateway , https://code.claude.com/docs/en/llm-gateway-protocol
- **[상충 / 위험]** 이 구성이 현재 깨져 있다는 보고가 열려 있다.
  - #42170 (2026-09-20 기준 Open, LiteLLM 1.103.0rc1 + Claude Code 2.1.278): `forward_client_headers_to_llm_api` 가 `/v1/messages` 경로에서 **효과 없음**, "Missing Anthropic API Key" 401. 더미 키를 넣으면 그 키가 업스트림으로 감. 환경에 `ANTHROPIC_API_KEY` 가 있으면 조용히 그 키로 과금됨. https://github.com/BerriAI/litellm/issues/42170
  - #29572: LiteLLM 이 `x-anthropic-billing-header` 시스템 블록을 제거해 OAuth 요청이 429 로 거절됨. https://github.com/BerriAI/litellm/issues/29572
  - #30365: auto 모드의 Bash 안전 분류기 호출이 OAuth 통과 프록시에서 429 → Bash 가 막힘. https://github.com/BerriAI/litellm/issues/30365
  - forward_client_headers 문서는 "프록시의 Authorization 헤더는 절대 전달하지 않는다"(허용 목록은 `x-*`, `anthropic-beta` 등)고 쓰고, Max 가이드는 Authorization 이 전달된다고 쓴다. 문서 간 설명이 어긋난다.
  - 안정판(v1.101.0)에서 동작하는지는 **확인하지 못했다.**
- **"Anthropic 이 429 를 주면 무료 모델로 fallback 되는가"**:
  - **공식 문서에 이 조합을 다룬 내용은 없다.** Max 가이드도, 관련 토론(#20072)도 fallback 을 언급하지 않는다. https://github.com/BerriAI/litellm/discussions/20072
  - **[추정]** 일반 fallback 은 429 를 포함한 모든 오류에 적용되고 `/v1/messages` 에서도 동작한다고 문서가 말하므로, `fallbacks: [{"anthropic-claude": ["free-pool"]}]` 는 원리상 동작해야 한다. 그러나 (1) 위 OAuth 통과 버그, (2) 같은 대화가 중간에 Claude → 타 모델로 바뀌면서 thinking 서명·tool 이력 변환이 깨질 가능성, (3) 구독 한도 429 는 몇 시간 지속되므로 `cooldown_time` 을 길게 잡지 않으면 매 요청마다 Anthropic 을 먼저 두드리게 된다는 점 때문에 **검증 없이 믿으면 안 된다.**
  - **[추정]** fallback 시 전달 헤더가 다른 공급자로 새는지 문서에 경고가 없다. 반드시 `model_group_settings` 로 전달 대상을 Anthropic 그룹에 한정할 것.
  - Anthropic 문서상 Claude Code 는 429 에서 `anthropic-ratelimit-unified-*` 헤더로 "플랜 한도" 와 "일시 스로틀" 을 구분하고, `retry-after` 가 60초를 넘으면 재시도를 멈추고 즉시 오류를 보여 준다. 프록시가 fallback 에 성공하면 Claude Code 는 200 만 보게 된다 **[추정]**.
  - CCR·OmniRoute 에도 같은 시나리오의 버그 보고가 있다(C 절 참고).

### B-5. 비-Anthropic 변환 시 알려진 문제

- **cache_control**: `/v1/messages` 브리지가 비-Claude 대상에서 cache_control 을 전부 버려 Gemini 캐싱이 안 되던 문제 → PR #32366 / #41938 로 수정 진행. https://github.com/BerriAI/litellm/pull/41938
- Gemini 는 캐시 대상이 최소 토큰(1024) 미만이면 요청 자체를 거절("Cached content is too small"). https://github.com/BerriAI/litellm/issues/17696
- 대화 중간 `system` 메시지가 Gemini/Vertex 프롬프트 캐시 prefix 를 매 턴 바꿔 버림. https://github.com/BerriAI/litellm/issues/42104
- Claude Code + Gemini 종합 버그(#16962): 짧은 프롬프트 cache_control 거절, **web_search 도구 선언이 변환되지 않음**(검색을 못 하거나 환각), Gemini 토큰 카운터 `TypeError`. "Closed as not planned / stale" — 해결된 게 아니라 방치. https://github.com/BerriAI/litellm/issues/16962
- **thinking**: Claude Code 는 모르는 모델 id(게이트웨이 별칭)도 최신 Claude 로 간주해 `thinking: {"type":"adaptive"}`, effort, context_management 등을 **전부 보낸다.** 업스트림이 거절하면 thinking 필드는 Claude Code 가 자동 재시도하며 꺼 주지만, **context management / tool 스키마 필드 거절은 재시도하지 않고 400 이 그대로 노출**된다. 회피: `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`. https://code.claude.com/docs/en/llm-gateway-protocol
- 오류 본문을 프록시가 자체 envelope 로 감싸면 Claude Code 의 capability 거절 복구 로직(오류 문구 매칭)이 깨진다. 같은 문서.
- `drop_params: true`(`litellm_settings`) — 공급자가 지원하지 않는 파라미터를 버림. 모델별로는 `additional_drop_params: ["response_format"]`, JSONPath(`"tools[*].input_examples"`) 도 가능. https://docs.litellm.ai/docs/completion/drop_params
- `modify_params: true` — tool_calls 가 있는 assistant 메시지에 thinking_blocks 가 없으면 그 턴의 thinking 파라미터를 버리고, 고아 tool call/result·빈 content 를 정리. https://docs.litellm.ai/docs/completion/message_sanitization , https://docs.litellm.ai/docs/reasoning_content , https://github.com/BerriAI/litellm/pull/17106
- `use_chat_completions_url_for_anthropic_messages: true` — `/v1/messages` 요청을 chat-completions 경로로 변환. 무료 공급자용 실사용 예에서 쓰임. https://docs.litellm.ai/docs/anthropic_unified/messages_to_responses_mapping
- 모델 자체 thinking 을 꺼야 하는 경우(예: NIM Nemotron): `extra_body.chat_template_kwargs.thinking: false` **[2차]**.
- **[확인]** Bifrost 문서의 경고는 LiteLLM 에도 그대로 해당될 가능성이 높다: 비-Claude 모델은 `web_search` 같은 서버 측 도구가 없고, "OpenRouter 등 일부 공급자는 함수 인자를 제대로 스트리밍하지 못해 파일 작업이 실패" 한다. https://docs.getbifrost.ai/cli-agents/claude-code

### B-6. 2026년 보안 사고와 안전한 설치

- **[확인]** 2026-03-24, PyPI 의 `litellm` **v1.82.7 / v1.82.8** 에 악성 페이로드가 게시되었고 약 40분 뒤 격리. 원인은 CI/CD 의 Trivy 의존성 침해로 유출된 PyPI 게시 자격증명(위협 그룹 TeamPCP). 페이로드는 `.pth` 파일(`litellm_init.pth`)로 인터프리터 시작 시 자동 실행, 환경변수·SSH 키·클라우드 자격증명·K8s 토큰·DB 비밀번호 탈취.
  https://docs.litellm.ai/blog/security-update-march-2026 , https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-teampcp-supply-chain-campaign/ , https://snyk.io/blog/poisoned-security-scanner-backdooring-litellm/ , https://digital.nhs.uk/cyber-alerts/2026/cc-4761
- **[확인]** 영향 없음: 공식 Docker 이미지(`ghcr.io/berriai/litellm`, 의존성 고정), LiteLLM Cloud, v1.82.6 이하, GitHub 소스 설치. 이후 v1.83.0 부터 새 CI/CD v2, **모든 Docker 이미지 cosign 서명**.
- **[확인]** 안전한 설치(공식 Docker Image Security Guide):
  ```bash
  cosign verify \
    --key https://raw.githubusercontent.com/BerriAI/litellm/0112e53046018d726492c814b3644b7d376029d0/cosign.pub \
    ghcr.io/berriai/litellm:v1.101.0
  docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/berriai/litellm:v1.101.0
  # compose 에서는 image: ghcr.io/berriai/litellm@sha256:<digest>
  ```
  `latest` 금지, `main-stable` / `main-latest` 는 deprecated, `vX.Y.Z` 태그 또는 digest 고정.
  https://docs.litellm.ai/docs/proxy/docker_image_security
- **[확인]** 2026-09-21 기준 최신 안정판 v1.101.0(2026-09-15). v1.102/1.103 은 rc/dev. https://github.com/BerriAI/litellm/releases
- pip 로 설치한다면 **[추정/일반 원칙]** 정확한 버전 고정 + `--require-hashes`, 전용 venv, 설치 후 site-packages 에 `litellm_init.pth` 가 없는지 확인. 프록시에는 무료 API 키만 넣고 다른 비밀은 같은 환경에 두지 않는다.

### B-7. config.yaml 예시 (문서 기반 조립, 미실행)

아래는 위 문서들의 키를 조합한 것이다. **이 조사에서 실행해 보지 않았고, 모델 id 는 자리표시자다**(무료 모델 목록은 자주 바뀌므로 각 공급자 콘솔에서 확인).

```yaml
model_list:
  # --- 메인 풀: 같은 model_name 으로 묶어 한도 합산(로드밸런싱) ---
  - model_name: claude-free-main        # id 에 "claude" 포함 → /model 피커에 노출
    litellm_params:
      model: gemini/<GEMINI_MODEL_ID>
      api_key: os.environ/GEMINI_API_KEY
      rpm: 10                           # 실제 무료 한도에 맞출 것
    model_info:
      max_input_tokens: 1000000
      display_name: "Free pool (main)"
  - model_name: claude-free-main
    litellm_params:
      model: openrouter/<VENDOR>/<MODEL>:free
      api_key: os.environ/OPENROUTER_API_KEY
      rpm: 20
  - model_name: claude-free-main
    litellm_params:
      model: cerebras/<CEREBRAS_MODEL_ID>
      api_key: os.environ/CEREBRAS_API_KEY
      rpm: 30

  # --- 빠른 풀: 백그라운드/서브에이전트용 ---
  - model_name: claude-free-fast
    litellm_params:
      model: groq/<GROQ_MODEL_ID>
      api_key: os.environ/GROQ_API_KEY
      rpm: 30
  - model_name: claude-free-fast
    litellm_params:
      model: mistral/<MISTRAL_MODEL_ID>
      api_key: os.environ/MISTRAL_API_KEY
      rpm: 60

litellm_settings:
  drop_params: true
  modify_params: true
  # 공급자가 /v1/messages 변환에서 문제를 일으키면 시도:
  # use_chat_completions_url_for_anthropic_messages: true

router_settings:
  routing_strategy: simple-shuffle      # Redis 없이 rpm 가중 분산. usage-based-routing-v2 는 Redis 필요
  num_retries: 2
  allowed_fails: 1
  cooldown_time: 60                     # 429 는 즉시 쿨다운됨. 무료 한도는 분 단위이므로 60초
  enable_pre_call_checks: true
  optional_pre_call_checks:
    - enforce_model_rate_limits
  fallbacks:
    - claude-free-main: ["claude-free-fast"]
    - claude-free-fast: ["claude-free-main"]
  context_window_fallbacks:
    - claude-free-fast: ["claude-free-main"]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

Claude Code 쪽(별도 셸 함수/alias 로 두어 평소 구독 세션과 분리):

```bash
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY"
export ANTHROPIC_API_KEY=""
export ANTHROPIC_MODEL="claude-free-main"
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-free-main"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-free-main"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-free-fast"   # 백그라운드 작업
export CLAUDE_CODE_SUBAGENT_MODEL="claude-free-fast"      # 서브에이전트 기본값
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1           # beta 필드로 인한 400 회피
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

서브에이전트별 분리는 에이전트 정의 frontmatter 의 `model:` 에 **LiteLLM model_name 을 전체 이름으로** 적으면 된다(우선순위: 호출 시 지정/정의의 model > `CLAUDE_CODE_SUBAGENT_MODEL` > 세션 모델. 전부 강제하려면 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=true`).
출처: https://code.claude.com/docs/en/model-config

참고한 실사용 구성 **[2차]**: `model_name` 을 아예 `claude-sonnet-5`, `claude-haiku-4-5-20251001` 같은 실제 Claude id 로 지어 Claude Code 기본 요청이 그대로 무료 풀로 들어가게 하고, 같은 이름에 API 키 2개를 묶어 분산, `drop_params: true` + `use_chat_completions_url_for_anthropic_messages: true` 를 사용.
https://dev.to/sydasif78/running-claude-code-for-free-through-multiple-ai-providers-with-litellm-417d

---

## C. 대안 비교

### C-1. claude-code-router (musistudio, "CCR")

- **[확인]** MIT, 별 37.3k, 열린 이슈 941개. `npm install -g @musistudio/claude-code-router` 후 `ccr ui`(웹 UI http://127.0.0.1:3458). v3 에서 "모든 AI 에이전트용 로컬 컨트롤 플레인" 으로 개편: Profiles / Routing / Credentials / Tools / Logs, "retries, credential pools, key rotation, ordered fallback models".
  https://github.com/musistudio/claude-code-router
- **[2차]** 최신 v3.1.1 이 npm 에 "3일 전" 게시 → 유지보수 활발. https://www.npmjs.com/package/@musistudio/claude-code-router , https://github.com/musistudio/claude-code-router/releases/tag/v3.1.1
- **Router 설정**: 기존(v1/v2) 방식은 `~/.claude-code-router/config.json` 의 `Providers` 배열 + `Router` 객체(`default` / `background` / `think` / `longContext` / `webSearch` / `image`) **[2차, 검색 요약]**. **[확인]** 현재 v3 공식 라우팅 문서에는 이 프리셋 키가 나오지 않고, 내장 라우트(Claude Code / Codex) + 헤더·바디 조건 기반 **커스텀 규칙**(`==`, `contains`, `starts with`, Node 스크립트 규칙) 구조로 설명된다. 옛 블로그의 config.json 예시를 그대로 쓰면 맞지 않을 수 있다.
  https://ccrdesk.top/en/routing/ (musistudio.github.io 문서가 이 도메인으로 301 리다이렉트됨)
- **서브에이전트 모델 지정 [확인]**: 서브에이전트 프롬프트를 `<CCR-SUBAGENT-MODEL>provider/model</CCR-SUBAGENT-MODEL>` 로 시작하면 CCR 이 태그를 추출·제거하고 그 모델로 보낸다. v3 문서는 모델에 description 이 설정되어 있을 때 활성화된다고 설명. (옛 문서는 `provider,model` 쉼표 표기 — 버전에 따라 구분자가 다르니 확인 필요.)
- **fallback [확인]**: Retry 모드(같은 모델 N회, 트리거 408/409/429/5xx) + Fallback targets(순서대로 백업 모델, 트리거 모든 4xx/5xx). 전역 또는 규칙별 설정. 성공 시 `x-ccr-fallback-attempts / -failures / -model` 응답 헤더.
- **알려진 버그 [2차]**: 프로토콜이 다른 모델(anthropic_messages → openai_responses)로 fallback 할 때 본문 재변환을 하지 않아 HTTP 400. https://github.com/musistudio/claude-code-router/issues/1615
- transformer 목록은 이번 조사에서 1차 출처로 확인하지 못했다(v3 README 는 "Fusion vision, web search, MCP tools, ToolHub" 만 언급). **확인 실패.**

### C-2. 나머지

| 도구 | 무료 사용 | fallback | Claude Code 연결 | 비고 / 출처 |
|---|---|---|---|---|
| **y-router** | - | 없음 | - | **2026-01-11 아카이브.** README 가 OpenRouter 공식 연동을 쓰라고 안내. https://github.com/luohy15/y-router |
| **OpenRouter 직접 연결** | 무료 모델 다수(**[2차]** 39개), 계정 단위 한도 | 공식 Claude Code 가이드에는 fallback 배열/`openrouter/auto` 언급 없음 | `ANTHROPIC_BASE_URL=https://openrouter.ai/api`, `ANTHROPIC_AUTH_TOKEN=$OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY=""`, 모델은 `ANTHROPIC_DEFAULT_*_MODEL` / `CLAUDE_CODE_SUBAGENT_MODEL` | 프록시 설치 불필요. 공식 경고: "Claude Code 는 Anthropic 모델에 최적화, 다른 공급자에서는 제대로 동작하지 않을 수 있음". https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration |
| **Requesty** | **[2차]** 무료 계정 하루 200 요청, 카드 불필요, 무료 모델 한정 | 대시보드 routing policy → `model="policy/<name>"` (failover/로드밸런싱/지연 기반) | `ANTHROPIC_BASE_URL=https://router.requesty.ai`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL` | 호스티드. 한도 수치는 공식 문서 본문으로 재확인 필요. https://docs.requesty.ai/integrations/claude-code , https://www.requesty.ai/free-models |
| **Vercel AI Gateway** | 무료 티어는 이번 조사에서 미확인 | 게이트웨이 라우팅 기능(세부는 미열람) | `npx vercel ai-gateway setup --agent claude-code` 또는 `ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh/claude-code`. **Max 구독 통과 공식 지원**: `ANTHROPIC_CUSTOM_HEADERS="x-ai-gateway-api-key: Bearer ..."` | 구독 통과가 목적이면 가장 공식적인 경로. https://vercel.com/docs/ai-gateway/coding-agents/claude-code |
| **Portkey** | **[2차]** 호스티드 무료 티어(월 100K 트레이스), 게이트웨이는 오픈소스 | fallback(트리거 오류 코드 지정), 로드밸런싱 config | `npx portkey` → Setup Claude Code | 문서 예시는 Anthropic/Bedrock/Vertex 위주. https://portkey.ai/docs/integrations/libraries/claude-code , https://github.com/Portkey-ai/gateway |
| **Bifrost (Maxim)** | 오픈소스 셀프호스트 무료(Enterprise 는 14일 체험) | fallback 체인, 적응형 로드밸런서, 가상 키 | `ANTHROPIC_BASE_URL=http://localhost:8080/anthropic`, `ANTHROPIC_AUTH_TOKEN=<virtual key>`, `/model vertex/gemini-...` 처럼 공급자 prefix. Max 구독 자동 감지 **[2차, 벤더 글]** | 비-Claude 모델의 도구 호출 한계를 문서가 직접 경고. https://docs.getbifrost.ai/cli-agents/claude-code , https://github.com/maximhq/bifrost |
| **free-claude-code (FCC)** *(조사 중 발견)* | 목적 자체가 무료 공급자 묶음(53개) | "재시도 소진 후 다음 구성 모델로 자동 전환" | `MODEL_FABLE/OPUS/SONNET/HAIKU` 로 티어별 공급자 지정, 원라인 설치 | MIT, 별 55.5k. 공급망 신뢰성은 별도 검토 필요. https://github.com/alishahryar1/free-claude-code |
| **OmniRoute** *(조사 중 발견)* | MIT, 무료 공급자 150+ 표방, `npm i -g omniroute`, localhost:20128 | 한도 인지형 자동 fallback, 19개 전략, 서킷 브레이커 | README 요약상 OpenAI 호환 `/v1` — Claude Code 용 Anthropic 엔드포인트는 위키로 재확인 필요 | 별 68.6k. 구독 소진 시 fallback 이 안 되고 429 가 나는 버그 보고 있음. https://github.com/diegosouzapw/OmniRoute , https://github.com/diegosouzapw/OmniRoute/issues/2321 |

### C-3. 관점별 비교

| 관점 | LiteLLM | CCR v3 | OpenRouter 직결 | Requesty | Bifrost | FCC / OmniRoute |
|---|---|---|---|---|---|---|
| 설치 난이도 | 중(Docker + YAML) | 하(npm + 웹 UI) | 최하(환경변수만) | 최하(환경변수 + 대시보드) | 중 | 하 |
| 429 자동 fallback | 있음. 429 즉시 쿨다운, 문서화 잘 됨 | 있음. 이종 프로토콜 fallback 버그(#1615) | Claude Code 가이드에 없음 | 정책으로 있음 | 있음 | 있음(주장) |
| 서브에이전트별 모델 분리 | Claude Code 기능(`CLAUDE_CODE_SUBAGENT_MODEL`, frontmatter `model:`)으로 model_name 지정 | 전용 태그 `<CCR-SUBAGENT-MODEL>` + 조건 규칙. **가장 강함** | Claude Code 환경변수로만 | 환경변수로만 | 환경변수 + prefix | 티어 매핑 수준 |
| 여러 무료 제공처 한도 합산 | **가장 강함**(같은 model_name + rpm/tpm + 전략) | credential pool / key rotation | 불가(단일 계정) | 자체 풀 내에서만 | 가중 로드밸런싱 | 있음(주장) |
| 유지보수 활성도 | 매우 활발(주 단위 릴리스). 대신 2026-03 공급망 사고 이력 | 활발(v3.1.1 최근), 이슈 941 적체 | 공식 서비스 | 공식 서비스 | 활발 | 활발해 보이나 검증 부족 |

---

## 추천 구성

1. **기본 축은 LiteLLM(Docker, `v1.101.0` digest 고정 + cosign 검증).** "여러 무료 제공처 한도 합산 + 429 자동 fallback" 이 핵심 요구이고, 이 두 가지가 가장 명확히 문서화된 곳이 LiteLLM 이다. B-7 의 구성을 출발점으로 쓴다.
2. **구독(Anthropic) 트래픽은 프록시에 태우지 말고 분리한다.** 평소 `claude` 는 구독 직결, 무료 풀은 `claude-free` 같은 alias/셸 함수에서만 `ANTHROPIC_BASE_URL` 을 설정. OAuth 통과 + 무료 fallback 을 한 프록시에 합치는 구성은 공식 가이드는 있으나 현재 열린 버그(#42170, #29572, #30365)가 있고 fallback 조합은 어디에도 문서화되어 있지 않다. 꼭 합치고 싶다면 안정판에서 단독 검증 후, `model_group_settings` 로 헤더 전달을 Anthropic 그룹에 한정하고 `cooldown_time` 을 길게 잡을 것.
3. **서브에이전트 분리**는 1차로 Claude Code 기본 기능(`CLAUDE_CODE_SUBAGENT_MODEL`, 에이전트 frontmatter `model:`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`)으로 LiteLLM model_name 을 가리키게 한다. 요청 내용 기반의 더 세밀한 규칙이 필요해지면 그때 CCR v3 를 검토.
4. **가장 빨리 시험해 보려면** OpenRouter 직결(환경변수 4줄)로 무료 모델의 Claude Code 호환성(도구 호출, 파일 편집)을 먼저 확인한 뒤 LiteLLM 으로 옮긴다.
5. **Jev 는 이번 단계에서 제외.** 유료(무료 티어 미확인)이고 fallback/합산을 해결하지 않는다. 나중에 "쉬운 턴은 빠른 풀, 어려운 턴은 메인 풀" 식의 난이도 라우팅을 얹고 싶을 때 LiteLLM `classifier_type: jev`(v1.103 계열, 아직 rc)로 추가.
6. 공통 주의: Anthropic 은 Claude Code 의 비-Claude 모델 라우팅을 **지원하지 않는다.** web_search 같은 서버 도구 부재, 함수 인자 스트리밍 문제, thinking/beta 필드 400 은 어떤 프록시를 쓰든 남는다. `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, `drop_params`, `modify_params` 로 완화.

## 확인하지 못한 것(다음에 검증할 항목)

- TypeSafe Jev 의 공식 무료 할당량 유무.
- LiteLLM 안정판 v1.101.0 에서 Max 구독 OAuth 통과가 실제로 동작하는지, 그리고 Anthropic 429 → 무료 풀 fallback 이 대화 중간에 깨지지 않는지.
- LiteLLM 이 업스트림 `retry-after` 를 해석하는지, OpenRouter/Groq/Cerebras/Mistral 대상 `count_tokens` 요청이 어떻게 처리되는지.
- LiteLLM Mistral 공급자 문서(이번에 미열람).
- CCR v3 의 transformer 목록과 옛 `Router` 프리셋 키가 v3 에서 그대로 유효한지, 서브에이전트 태그 구분자(`,` vs `/`).
- Requesty 하루 200 요청, Portkey 100K 트레이스, OpenRouter 무료 모델 수 — 모두 2차 출처 수치.
- OmniRoute 의 Anthropic 형식 엔드포인트 유무, FCC/OmniRoute 의 공급망 신뢰성.
- B-7 config.yaml 전체(미실행).
