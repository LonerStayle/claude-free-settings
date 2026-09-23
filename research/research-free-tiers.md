# 무료 호출 가능 LLM API 조사 (Claude Code 백엔드 대체용)

- 조사일: 2026-09-21
- 목적: Claude 구독 한도 소진 시 Claude Code 에 물릴 "과금 없는" 백엔드 후보 선정
- 표기 규칙
  - **[공식]** = 제공처 공식 문서/공식 API 를 이번 조사에서 직접 조회한 값
  - **[2차]** = 블로그/집계 사이트 등 2차 출처 값 (공식 확인 불가, 참고용)
  - **[계산]** = 공식 수치로부터 직접 산술한 값 (추정 아님, 계산식 병기)
  - **미확인** = 이번 조사에서 확인하지 못함
- 주의: 공식 문서 조회는 WebFetch(소형 모델 요약) 경유라, 모델 ID 철자 등은 실제 적용 전 `/models` 엔드포인트로 재확인 권장. OpenRouter / Requesty / NVIDIA / Kilo 의 모델 목록은 공개 `/models` API 를 curl 로 직접 조회한 원본 값이다.

---

## 0. 핵심 요약 (먼저 읽기)

1. **최근 1년 사이 무료 티어가 크게 줄었다.** GitHub Models 완전 종료(2026-07-30), Cerebras 상시 무료 폐지→카드 필수 30일 트라이얼(2026-07), Chutes 무료 종료(2026-03-15), Qwen OAuth 무료 종료(2026-04-15), Gemini 무료 Pro 모델 제외(2026-04) 및 Flash 계열 약 20 RPD 로 축소, Groq 무료 목록에서 Kimi/Llama-70B 제외 및 TPM 8K.
2. **Claude Code 는 Anthropic `/v1/messages` 형식을 요구**한다. 이 형식을 프록시 없이 직접 제공하는 무료 후보: OpenRouter, Requesty, Kilo Gateway, Ollama(로컬/클라우드), Z.ai, LongCat, DeepSeek(무료분은 일회성). 나머지(Gemini, Groq, NVIDIA NIM, Mistral, Cloudflare, SambaNova 등)는 OpenAI 호환만 제공 → claude-code-router / LiteLLM 등 변환 프록시 필요.
3. **요청 1건당 수만 토큰** 조건에서 TPM ≤ 30K 또는 TPD ≤ 1M 인 곳(Groq 8K TPM, SambaNova 200K TPD·20 RPD, Cloudflare 약 30만 토큰/일, HF $0.10/월)은 메인 루프 불가.
4. 같은 무료 모델 풀(Nemotron 3 Ultra, Qwen3.8-27B, Laguna, Ling, North Mini Code 등)이 OpenRouter / Kilo / Requesty / OpenCode Zen 에 중복 노출된다. 즉 "게이트웨이별 일일 한도"를 여러 개 확보하는 방식으로 분산 가능.

---

## 1. 종합 비교표

| # | 제공처 | 무료 한도 (RPM / RPD / TPM / TPD) | 무료 최강 코딩·에이전트 모델 (ID, 컨텍스트) | Tool calling | API 형식 | 카드 | 무료 데이터 학습 활용 | 한도 초과 응답 | 실사용 분류 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **OpenRouter** | 20 RPM / 50 RPD (누적 $10 이상 충전 시 1,000 RPD) / TPM·TPD 자체 상한 없음(업스트림 의존) [공식] | `nvidia/nemotron-3-ultra-550b-a55b:free` (1M), `qwen/qwen3.8-27b:free` (262K), `cohere/north-mini-code:free` (256K), `poolside/laguna-s-2.1:free` (262K) [공식 API] | 위 모델 모두 `tools` 파라미터 지원 [공식 API]. Nemotron 3 Ultra 는 "에이전트 루프에서 도구 호출을 가끔 잊는다"는 평 [2차] | OpenAI 호환 + **Anthropic Messages 직접 제공** (`ANTHROPIC_BASE_URL=https://openrouter.ai/api`) [공식] | 불필요 | 업스트림별 상이. 프라이버시 설정에서 학습 허용 제공자 제외 가능 [2차] | 429 (+`X-RateLimit-*`, 때때로 `Retry-After`); 잔액 음수면 무료 모델도 402 [공식] | $10 1회 충전 시 **메인 루프 가능** / 무충전(50 RPD)은 **서브에이전트용** |
| 2 | **Kilo Gateway** | 익명: 200 req/시간/IP [공식]. 인증 사용자 한도 미확인. TPM/TPD 미확인 | `kilo-auto/free` (256K, 자동 라우팅), `nvidia/nemotron-3-ultra-550b-a55b:free` (1M), `qwen/qwen3.8-27b:free` (262K), `stepfun/step-3.7-flash:free` (262K) [공식 API] | 대부분 `tools` 지원 [공식 API]. 안정성 평판 미확인 | OpenAI 호환 (`https://api.kilo.ai/api/gateway/`) + Anthropic Messages 형식 지원 [공식 문서 요약] — Claude Code 직결 동작 여부는 미확인 | 불필요 (키 없이 익명 가능) [2차] | Auto Free 는 "프롬프트를 로깅·서비스 개선에 쓰는 제공자로 라우팅될 수 있음" [공식] | 미확인 (문서 미기재) | **메인 루프 가능(조건부)** — 시간당 200건이면 충분하나 직결 검증 필요 |
| 3 | **NVIDIA NIM (build.nvidia.com)** | 최대 40 RPM [2차·포럼]. RPD/TPM/TPD 비공개("모델·트래픽에 따라 다름") [공식 포럼]. 크레딧제 폐지됨 [2차] | `moonshotai/kimi-k3`, `z-ai/glm-5.3`, `deepseek-ai/deepseek-v4-flash-0731`, `nvidia/nemotron-3-ultra-550b-a55b` [공식 API 목록]. 컨텍스트 미확인 | 미확인 (모델별 상이) | OpenAI 호환만 (`https://integrate.api.nvidia.com/v1`) → 프록시 필요 | 불필요 [2차] | 평가/프로토타이핑 전용 약관. NVIDIA 무료 엔드포인트는 "보안 및 제품 개선 목적 로깅" [2차: OpenCode Zen 문서의 NVIDIA 고지] | 미확인 (포럼에 rate limit 언급만 있고 응답 코드는 미기재) | **메인 루프 가능(프록시 필요)** — 무료 중 모델 품질 최상급, 일일 상한 미공개가 리스크 |
| 4 | **Requesty** | 200 RPD [공식]. RPM/TPM/TPD 미기재 | `nvidia/nemotron-3-ultra-550b-a55b` (1M), `nvidia/nemotron-3-super-120b-a12b` (1M), `google/gemma-4-31b-it` (262K), `mistral/leanstral-1-5` (262K) — 가격 0 모델 [공식 API] | 위 모델 `supports_tool_calling=true` [공식 API] | OpenAI 호환 (`https://router.requesty.ai/v1`) + **Anthropic 직결** (`ANTHROPIC_BASE_URL=https://router.requesty.ai`) [공식] | 불필요 [공식] | 미확인 (EU 데이터 레지던시 제공 언급만) | 미확인 | **서브에이전트용** (200 RPD 는 메인 루프 1~2 세션 분량) |
| 5 | **Ollama Cloud** | 수치 비공개. 5시간 세션 한도 + 7일 주간 한도, 동시 1요청 [공식 pricing + 2차]. Free 는 "starter 모델"만 [공식] | `gemma4:31b` / `gemma4:cloud` 등 starter 모델 [공식]. 전체 starter 목록·컨텍스트 미확인 | 지원 모델 한정 [공식] | OpenAI 호환 + **Anthropic 호환 직결** (`ANTHROPIC_BASE_URL=https://ollama.com` + `OLLAMA_API_KEY`) [공식] | 불필요 | 학습에 사용하지 않음 [공식] | 미확인 | **서브에이전트용** (한도 미공개·동시 1건) |
| 6 | **Ollama 로컬** | 무제한 (하드웨어 한계) | 하드웨어 의존. 공식 권장: 컨텍스트 64K 이상 설정 [공식] | 지원 모델 한정 | **Anthropic 호환** (`ANTHROPIC_BASE_URL=http://localhost:11434`, `ollama launch claude`) [공식] | 불필요 | 로컬 (외부 전송 없음) | 해당 없음 | 하드웨어 충분 시 **메인 루프 가능**, 아니면 서브에이전트용 |
| 7 | **Google Gemini API (AI Studio)** | 공식 문서는 수치 미게시 → `aistudio.google.com/rate-limit` 에서 프로젝트별 확인 [공식]. [2차] Gemini 3.5~3.8 Flash 약 20 RPD, Flash-Lite(3.5/3.1) 500 RPD. 다른 2차 출처는 15 RPM/1,500 RPD 라고 주장 → **상충, RPM/TPM 미확인** | `gemini-3.8-flash` (입력 1,048,576) [공식 pricing + 2차]. 무료 제외: `gemini-3.1-pro-preview` [공식] | 지원 (안정성 평판은 이번 조사 미확인) | OpenAI 호환 엔드포인트 있음, Anthropic 형식 없음 → 프록시 필요 | 불필요 | **무료 티어는 제품 개선에 사용됨** [공식] (EU/UK/EEA 제외 [2차]) | 429 [2차] | 20 RPD 가 사실이면 Flash 는 **부적합**, Flash-Lite 500 RPD 는 **서브에이전트용** — 본인 계정 대시보드 확인 필수 |
| 8 | **Mistral (La Plateforme / AI Studio Experiment)** | 공식 수치 비공개(Admin Console → Limits) [2차]. 커뮤니티 관측: 전역 1 RPS; Standard 풀 50K TPM·월 4M 토큰; Medium 풀 375K TPM/25 RPM; Dev 풀 1M TPM/50 RPM·월 10M [2차, "가설" 명시] | `mistral-medium-3504` (Mistral Medium 3.5, 에이전트·코딩 최적화), `codestral-2508` [공식]. 컨텍스트 미확인. Devstral 계열은 폐기 예정 [공식] | 지원. 안정성 평판 미확인 | 자체 형식(OpenAI 유사), Anthropic 형식 없음 → 프록시 필요 | 불필요, **전화번호 인증 필요** [2차] | **기본 학습 활용, 콘솔에서 opt-out 가능** [2차, 공식 헬프센터 인용] | 429 [미확인] | **서브에이전트용** (월 토큰 상한이 풀별로 낮을 수 있음 — 계정에서 확인) |
| 9 | **Z.ai (GLM)** | 수치 비공개 (동시성은 콘솔 표시) [2차] | `glm-4.7-flash`, `glm-4.5-flash` 무료 [공식 pricing]. 컨텍스트 미확인 | 미확인 | OpenAI 호환 (`https://api.z.ai/api/paas/v4`) + Anthropic 엔드포인트 `https://api.z.ai/api/anthropic` [공식] — 단, 문서는 유료 GLM Coding Plan 기준이며 무료 Flash 모델로 동작하는지 **미확인** | 불필요 [2차] | 미확인 | 미확인 | **서브에이전트용** (소형 Flash 모델, 한도 미공개) |
| 10 | **Vercel AI Gateway** | 월 $5 무료 크레딧(첫 요청 시 시작), 무료 티어는 **일부 모델만** + 모델별 낮은 rate limit [공식]. 수치 미확인 | 무료 티어 모델 목록: `vercel.com/ai-gateway/models?freeTier=true` — 미확인 | 모델별 | OpenAI 호환. Anthropic 호환/Claude Code 연동 여부 미확인 | 불필요. **크레딧 구매 시 월 무료분 영구 소멸** [공식] | 백엔드 제공자별 | 429 [공식] | **서브에이전트용** ($5 = 저가 모델 기준 수백만 토큰) |
| 11 | **OpenCode Zen** | 미기재 [공식] | `big-pickle`, `mimo-v2.5-free`, `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `ling-3.0-flash-fin-free` [공식] | 미확인 | OpenAI 호환 `https://opencode.ai/zen/v1/chat/completions`. 무료 모델의 Anthropic messages 제공 여부 미확인 | 미확인 | **무료 기간 데이터는 모델 개선에 사용 가능** (Big Pickle, MiMo, Ling); NVIDIA 는 로깅 [공식] | 미확인 | **서브에이전트용** (프로모션성, 한도 미공개) |
| 12 | **LongCat (Meituan)** | 무료 쿼터 수치 상충: 100K/일 [2차], 5M/일 [2차], Flash-Lite 50M/일 예정 [공식 X 게시물, 2026-02] → **미확인** | `LongCat-2.0` (1M 컨텍스트, 출력 128K) [공식] | 미확인 | OpenAI `/v1/chat/completions` + **Anthropic `/v1/messages`** [공식] | 미확인 | 미확인 | 429 [공식] | 쿼터 확인 전까지 **미분류(후보)** |
| 13 | **Cloudflare Workers AI** | 10,000 Neurons/일 [공식]. [계산] gpt-oss-120b 입력 $0.35/M ÷ $0.011/1K neurons ≈ 31.8K neurons/M 토큰 → **하루 약 31만 입력 토큰** | `@cf/openai/gpt-oss-120b`, `kimi-k2.7-code`, `glm-5.3` 등 [공식 pricing, 정확한 @cf ID 미확인] | 모델별 | OpenAI 호환 엔드포인트, Anthropic 없음 | 불필요 | 학습 미사용 [2차] | Free 플랜은 초과 사용 불가(차단) [공식], 코드 미확인 | **부적합** (요청 10건 안팎이면 소진) |
| 14 | **Groq** | `openai/gpt-oss-120b`: 30 RPM / 1K RPD / **8K TPM** / 200K TPD. `qwen/qwen3.8-27b` 동일 [공식] | `openai/gpt-oss-120b` (131K), `qwen/qwen3.8-27b` (preview) [공식]. Kimi 는 카탈로그에서 빠짐, Llama 3.3 70B 는 무료 표에 없음 [공식] | 지원 | OpenAI 호환만 | 불필요 | 기본 미보관 [2차] | 429 + `retry-after` [공식] | **부적합** (8K TPM < 요청 1건 크기) |
| 15 | **Cerebras** | Free Trial: 5 RPM / 30K TPM(비캐시)·90K(총) / 1M TPH / 1M TPD [공식]. 무료 컨텍스트 65K(gpt-oss-120b), 64K(qwen-3.8-27b) [공식] | `gpt-oss-120b`, `qwen-3.8-27b` [공식] | 지원 | OpenAI 호환만 | **필수** — 2026-07-21 부로 상시 무료 폐지, 결제수단 등록 후 $5 크레딧(30일 만료) [2차 다수 + 공식 rate-limit 문서 인용] | 미확인 | 429 [공식] | **부적합** (카드 필수·30일 한정·컨텍스트 65K) |
| 16 | **SambaNova** | 20 RPM / **20 RPD** / 200K TPD (결제수단 미등록 시) [공식] | `DeepSeek-V3.2`(preview), `DeepSeek-V3.1`, `gpt-oss-120b` [공식] | 미확인 | OpenAI 호환만 | 불필요 [공식] | 미확인 | 429 + 잔여량 헤더 [공식] | **부적합** |
| 17 | **Hugging Face Inference Providers** | 월 $0.10 크레딧 (PRO $2) [공식] | 200+ 모델 라우팅 | 제공자별 | OpenAI 호환 (`https://router.huggingface.co/v1`) | 불필요 (초과분은 크레딧 구매 필요) [공식] | 제공자별 | 미확인 | **부적합** |
| 18 | **GitHub Models** | **2026-07-30 완전 종료** (6/16 신규 차단 → 7/16·7/23 브라운아웃 → 7/30 종료) [공식] | — | — | — | — | — | — | **부적합(서비스 종료)** |
| 19 | **Chutes** | 무료(200 RPD) 2026-03-15 완전 종료 [2차, 공식 공지 인용] | — | — | OpenAI 호환 | — | — | — | **부적합** |
| 20 | **Together AI** | 무료 트라이얼 없음, 최소 $5 구매 필요 [2차] | — | — | OpenAI 호환 | 필요 | — | — | **부적합** |
| 21 | **Fireworks AI** | 신규 $1 크레딧, 상시 무료 모델 없음 [2차] | — | — | OpenAI 호환 | 미확인 | — | — | **부적합** |
| 22 | **DeepSeek** | 상시 무료 없음. 신규 가입 5M 토큰(30일) [2차 — 공식 확인 못함]. 고정 RPM 없음, 동시성 한도(v4-pro 500, v4-flash 2500) [2차, 공식 문서 인용] | `deepseek-v4-pro`, `deepseek-v4-flash` | 지원 | OpenAI 호환 + **Anthropic 직결** `https://api.deepseek.com/anthropic` [공식] | 가입 시 불필요 [2차] | 미확인 | 부하 시 지연, 30분 초과 시 연결 종료 [2차] | 일회성 5M 토큰 = **단기 비상용** (Claude Code 로 100건 안팎) |
| 23 | **Moonshot (Kimi)** | 상시 무료 없음. 충전액 기반 Tier0($1)~Tier5 [2차]. ¥15+$5 체험/3 RPM 기록 있음 [2차, 상충] | — | — | OpenAI 호환 (`api.moonshot.ai/v1`), Anthropic 엔드포인트 미확인 | 필요(충전) | 미확인 | — | **부적합** |
| 24 | **Qwen (Alibaba)** | Qwen OAuth 무료(2,000→1,000→100 RPD) **2026-04-15 종료** [2차, 공식 GitHub 이슈 #3203]. Model Studio 신규: 모델당 1M 토큰, 90일 [공식] | `qwen3.6-plus` 등 | 지원 | OpenAI 호환 | 미확인 | 미확인 | — | **부적합** (일회성 1M 토큰) |
| 25 | **ModelScope API-Inference** | 2,000 호출/일 (전 모델 합산) [2차, 공식 X 게시물 인용]. TPM 등 미확인 | Qwen/DeepSeek/GLM/MiniMax 등 900+ [2차] | 미확인 | OpenAI 호환. Anthropic 미확인 | 미확인 (Alibaba Cloud 계정 연동 필요 여부 미확인) | 미확인 | 미확인 | **미분류(후보)** — 호출 수는 넉넉, 나머지 미확인 |
| 26 | **Cohere (trial key)** | 1,000 호출/월, 20 RPM [2차] | Command A | 지원 | 자체 + OpenAI 호환 | 불필요 | 미확인 | 429 | **부적합** (월 1,000건·비상업) |
| 27 | **LLM7 / Pollinations / OVH AI Endpoints** | 익명 접근. OVH 약 2 RPM/모델 [2차] | gpt-oss-20b 급 [2차] | 미확인 | OpenAI 호환 | 불필요 | 미확인 | 미확인 | **부적합** (소형 모델·저한도) |

---

## 2. 제공처별 상세 및 출처

### 2.1 OpenRouter
- 한도 [공식]: 누적 구매 $10 미만 → 20 RPM / 50 RPD, $10 이상 → 20 RPM / 1,000 RPD. "limit tier 는 누적 크레딧 구매액으로 결정". 429 시 `X-RateLimit-*`, 가끔 `Retry-After`. 잔액 음수면 무료 모델에도 402.
  - https://openrouter.ai/docs/api_reference/limits
- 일부 2차 출처(costgoat 등)는 "200 RPD"라고 적지만 공식 문서 값(50/1,000)과 상충 → 공식 값 채택.
  - https://costgoat.com/pricing/openrouter-free-models
- 무료 모델 목록 (2026-09-21 `GET https://openrouter.ai/api/v1/models` 직접 조회, 가격 0 인 것):
  - `nvidia/nemotron-3-ultra-550b-a55b:free` 1,000,000 / tools / max out 65,536
  - `nvidia/nemotron-3.5-lightning:free` 1,000,000 / tools
  - `nvidia/nemotron-3-super-120b-a12b:free` 262,144 / tools
  - `qwen/qwen3.8-27b:free` 262,144 / tools
  - `cohere/north-mini-code:free` 256,000 / tools
  - `poolside/laguna-s-2.1:free`, `poolside/laguna-xs-2.1:free` 262,144 / tools
  - `thinkingmachines/inkling:free`, `thinkingmachines/inkling-small:free` 1,048,576 / tools — [2차] "에이전트 하네스에서만 사용 가능(직접 호출 시 403)"
  - `nex-agi/nex-n2.5-pro:free`, `nex-agi/nex-n2.5-mini:free` 262,144 / tools
  - `inclusionai/ling-3.0-flash-fin:free` 외 Ling 계열 262,144 / tools
  - `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free` 262,144 / tools — [2차] 업스트림(Google AI Studio) 429 빈발
  - `z-ai/glm-5.2:free` 32,768 / **tools 미지원** → Claude Code 부적합
  - `openrouter/free` 200,000 (자동 라우터)
- Claude Code 직결 [공식]: `ANTHROPIC_BASE_URL=https://openrouter.ai/api`, `ANTHROPIC_AUTH_TOKEN=<키>`, `ANTHROPIC_API_KEY=""`(명시적 공백), 모델 오버라이드는 `ANTHROPIC_DEFAULT_OPUS_MODEL` / `_SONNET_MODEL` / `_HAIKU_MODEL` / `CLAUDE_CODE_SUBAGENT_MODEL`. 설정 후 `/logout` 필요. 문서는 `:free` 모델 사용 가능 여부를 명시하지 않음(미확인).
  - https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration
  - https://openrouter.ai/blog/tutorials/claude-code-openrouter/
- 평판 [2차]: Nemotron 3 Ultra 는 "작업은 완료하나 도구 기반 루프 안에 있다는 걸 가끔 잊음". Qwen 계열 무료 엔드포인트는 충전 사용자도 429 빈발. Qwen3 Coder 무료 엔드포인트는 2026 중반 소멸.
  - https://www.webbrain.one/blog/nemotron3-ultra-openrouter-planner-benchmark
  - https://klymentiev.com/blog/openrouter-free-tier (2026-09-19)
  - https://evolink.ai/blog/claude-code-with-openrouter-limits-errors-alternatives

### 2.2 Kilo Gateway
- 익명 200 req/시간/IP, 무료 모델은 인증·익명 모두 사용 가능, Base URL `https://api.kilo.ai/api/gateway/`, Anthropic messages 형식 예제 존재 [공식].
  - https://kilo.ai/docs/gateway/models-and-providers
  - https://kilo.ai/docs/getting-started/using-kilo-for-free (Auto Free 데이터 로깅 경고)
- 무료 모델 (2026-09-21 `GET https://api.kilo.ai/api/gateway/models` 직접 조회): OpenRouter 무료 목록과 거의 동일 + `kilo-auto/free`(256K), `stepfun/step-3.7-flash:free`(262K).

### 2.3 NVIDIA NIM
- "동일 티어에서 rate limit 을 올리는 공식 방법은 없다", 한도는 모델·용도·트래픽에 따라 다름 [공식 포럼 스태프].
  - https://forums.developer.nvidia.com/t/clarity-on-nim-api-free-tier-rate-limit-increases/369624
- 40 RPM, 크레딧제 폐지, 카드 불필요, 평가 전용 [2차].
  - https://decodethefuture.org/en/nvidia-nim-api-pricing-limits-guide/
  - https://yangmao.ai/en/providers/nvidia-build/
  - https://klymentiev.com/blog/free-llm-api (2026-09-12)
- 모델 목록 (2026-09-21 `GET https://integrate.api.nvidia.com/v1/models` 직접 조회, 82개): 코딩 유력 = `moonshotai/kimi-k3`, `moonshotai/kimi-k2.6`, `z-ai/glm-5.3`, `z-ai/glm-5.3-flash`, `deepseek-ai/deepseek-v4-flash-0731`, `nvidia/nemotron-3-ultra-550b-a55b`, `poolside/laguna-xs-2.1`, `openai/gpt-oss-20b`. 목록에 있다고 모두 무료 호출 가능한지는 **미확인**.

### 2.4 Requesty
- 200 RPD, 카드 불필요, Claude Code 용 `ANTHROPIC_BASE_URL=https://router.requesty.ai`, 무료 모델 목록은 수시 변동 [공식].
  - https://www.requesty.ai/free-models
- 가격 0 모델 (2026-09-21 `GET https://router.requesty.ai/v1/models` 직접 조회): `nvidia/nemotron-3-ultra-550b-a55b`(1,048,576), `nvidia/nemotron-3-super-120b-a12b`(1,048,576), `nvidia/nemotron-3.5-lightning-30b-a3b`(1,048,576), `google/gemma-4-31b-it`(262,144), `mistral/leanstral-1-5`(262,144), `novita/inclusionai/ling-3.0-tiny`(262,144), `nvidia/muse-glimmer-30b`(131,072) — 모두 tool calling true. `poolside/laguna-m.1`, `poolside/laguna-xs.2` 는 32K·tool calling false.
- 가입 크레딧: 공식 페이지에 언급 없음(미확인).

### 2.5 Ollama (로컬 / 클라우드)
- Claude Code 연동 [공식]: 로컬 `ANTHROPIC_AUTH_TOKEN=ollama`, `ANTHROPIC_BASE_URL=http://localhost:11434`, `ANTHROPIC_API_KEY=""`; 또는 `ollama launch claude`. 클라우드 직결 `ANTHROPIC_BASE_URL=https://ollama.com` + `OLLAMA_API_KEY`. 컨텍스트 64K 이상 권장.
  - https://docs.ollama.com/integrations/claude-code
- 클라우드 [공식]: API `https://ollama.com/api`, OpenAI/Anthropic 클라이언트는 "원본 API 의 부분집합" 지원, 프롬프트·응답을 학습에 쓰지 않음.
  - https://docs.ollama.com/cloud
- Free 플랜 [공식]: "Starter usage credits", "starter models 접근", 동시 1요청, 크레딧 추가 시 전체 모델 해제. 수치 미기재.
  - https://ollama.com/pricing
- 5시간 세션 + 7일 주간 리셋, 모델 무게(level 1~4)별 소모, Pro 는 Free 의 약 50배 [2차].
  - https://dev.to/amareswer/ollama-cloud-free-vs-pro-usage-limits-pricing-what-you-actually-get-2026-3ieo
  - https://devtoolhub.com/ollama-cloud-free-vs-pro-limits-pricing-2026/

### 2.6 Google Gemini API
- 공식 rate-limit 페이지(2026-09-02 갱신)는 수치를 싣지 않고 AI Studio 대시보드로 안내.
  - https://ai.google.dev/gemini-api/docs/rate-limits
  - https://aistudio.google.com/rate-limit (로그인 필요 — 본인 확인 필수)
- 무료 티어 존재 모델 [공식 pricing]: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, Gemma 4. 무료 없음: `gemini-3.1-pro-preview`. 무료 티어 데이터는 "제품 개선에 사용: 예".
  - https://ai.google.dev/gemini-api/docs/pricing
- [2차] 2026-09 AI Studio 표시값: 3.5~3.8 Flash 20 RPD, Flash-Lite 500 RPD. 2026-04 이후 Pro 는 사실상 무료에서 제외, 2026-09-11 `gemini-2.5-pro`·`2.5-flash-lite` 신규 사용자 차단. 2025-12-07 무료 쿼터 50~80% 삭감.
  - https://www.scriptbyai.com/gemini-api-free-tier-limits/
  - https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier
  - https://www.aifreeapi.com/en/posts/gemini-api-free-tier-rate-limits
- 상충 [2차]: freellm.net 등은 15 RPM / 1,500 RPD 로 기재 → 구버전 값일 가능성이 있으나 판단 근거 없음. **RPM/TPM 은 미확인**.
  - https://freellm.net/models/google-gemini/gemini-3-8-flash

### 2.7 Mistral
- 모델 [공식]: `mistral-medium-3504`("에이전트·코딩 최적화 프런티어급"), `codestral-2508`; Devstral 2 / Devstral Medium·Small 은 폐기 목록.
  - https://docs.mistral.ai/getting-started/models
- 한도: 공식 미게시. 커뮤니티 관측표(2026-03-07, "가설" 명시).
  - https://github.com/DrDavidHall/mistral-api-workshop/blob/main/docs/free-tier-experiment-plan.md
- 무료 Experiment 는 기본 학습 활용, Admin Console Privacy 에서 opt-out. 전화번호 인증 필요 [2차, 공식 헬프센터 인용].
  - https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training
  - https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls
- Codestral 전용 엔드포인트(codestral.mistral.ai)의 2026년 현재 한도: 미확인 (2차 출처 수치가 5 RPM ~ 500K TPM 으로 상충).

### 2.8 Groq
- 무료 표 [공식]: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` 모두 30 RPM / 1K RPD / 8K TPM / 200K TPD. 429 + `retry-after`.
  - https://console.groq.com/docs/rate-limits
- 카탈로그에 Kimi 없음, Llama 3.3 70B 는 Enterprise 표기 [공식].
  - https://console.groq.com/docs/models

### 2.9 Cerebras
- Free Trial 한도·컨텍스트 [공식].
  - https://inference-docs.cerebras.ai/support/rate-limits
  - https://inference-docs.cerebras.ai/models/overview
- 2026-07-21 상시 무료 폐지, 결제수단 등록 후 $5(30일) [2차]. 이전 값: 30 RPM / 60K TPM / 약 900 RPD, 카드 불필요 [2차].
  - https://github.com/diegosouzapw/OmniRoute/issues/11773
  - https://toolfreebie.com/cerebras-free-api/
  - https://benchlm.ai/free-tier/cerebras

### 2.10 그 외
- SambaNova [공식]: https://docs.sambanova.ai/docs/en/models/rate-limits
- Cloudflare Workers AI [공식]: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Hugging Face [공식]: https://huggingface.co/docs/inference-providers/pricing
- GitHub Models 종료 [공식]: https://github.blog/changelog/2026-07-30-github-models-is-now-retired/ , https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/ , https://github.blog/changelog/2026-06-16-github-models-is-no-longer-available-to-new-customers/
- Chutes 무료 종료: https://chutes.ai/news/community-announcement-february
- Together: https://docs.together.ai/docs/billing-credits , https://yangmao.ai/en/providers/together/free-tier/
- Fireworks: https://fireworks.ai/pricing , https://agentdeals.dev/vendor/fireworks-ai
- Z.ai [공식]: https://docs.z.ai/guides/overview/pricing , https://docs.z.ai/devpack/tool/claude
- DeepSeek: https://api-docs.deepseek.com/guides/anthropic_api/ , https://api-docs.deepseek.com/quick_start/rate_limit/ , https://yangmao.ai/en/deals/deepseek-new-user-free-tokens-2026/
- Moonshot: https://yangmao.ai/en/providers/kimi/free-tier/ , https://geotoolbox.ai/blog/kimi-api-pricing
- Qwen: https://github.com/QwenLM/qwen-code/issues/3203 , https://www.alibabacloud.com/help/en/model-studio/new-free-quota , https://inventivehq.com/blog/qwen-code-still-free-2026-shutdown
- Vercel AI Gateway [공식]: https://vercel.com/docs/ai-gateway/pricing
- OpenCode Zen [공식]: https://opencode.ai/docs/zen/
- LongCat: https://longcat.chat/platform/docs/ , https://x.com/Meituan_LongCat/status/2019773072849637725
- ModelScope: https://x.com/rohanpaul_ai/status/2029264237919649850 , https://itsfree.ai/provider/cloud-modelscope/
- 종합 비교 글: https://klymentiev.com/blog/free-llm-api (2026-09-12), https://wotai.co/blog/best-free-llm-apis (2026-07-06), https://openrouter.ai/blog/tutorials/free-llm-apis-compared/ (2026-06-15, 일부 구버전 정보 포함)

---

## 3. 최근 1년 무료 정책 축소/변경 타임라인

| 일자 | 제공처 | 변경 | 출처 |
|---|---|---|---|
| 2025-12-07 | Gemini | 무료 쿼터 50~80% 삭감 [2차] | https://www.aifreeapi.com/en/posts/gemini-api-free-tier-rate-limits |
| 2026-03-15 | Chutes | 무료 200 RPD 완전 종료 | https://chutes.ai/news/community-announcement-february |
| 2026-04 | Gemini | Pro 모델 무료 티어 사실상 제외 [2차] | https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier |
| 2026-04-15 | Qwen | OAuth 무료 티어 종료 (직전 1,000→100 RPD 축소) | https://github.com/QwenLM/qwen-code/issues/3203 |
| 2026 중반 | OpenRouter | Qwen3 Coder 무료 엔드포인트 소멸 [2차] | https://evolink.ai/blog/claude-code-with-openrouter-limits-errors-alternatives |
| 2026-06-16 ~ 07-30 | GitHub Models | 신규 차단 → 완전 종료 | https://github.blog/changelog/2026-07-30-github-models-is-now-retired/ |
| 2026-07-21 | Cerebras | 상시 무료 → 카드 필수 $5/30일 트라이얼 [2차] | https://toolfreebie.com/cerebras-free-api/ |
| 2026-09-11 | Gemini | `gemini-2.5-pro`, `2.5-flash-lite` 신규 사용자 차단 [2차] | https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier |
| 시점 미확인 | Groq | 무료 표가 gpt-oss / qwen3.8-27b 중심으로 축소, Kimi 제외 | https://console.groq.com/docs/rate-limits |
| 시점 미확인 | NVIDIA NIM | 크레딧제 → rate limit 제 전환 [2차] | https://yangmao.ai/en/providers/nvidia-build/ |

---

## 4. 분류 결과

### 메인 루프 가능
1. OpenRouter — 단 1회 $10 충전(1,000 RPD) 전제. 무충전이면 50 RPD 로 서브에이전트용.
2. Kilo Gateway — 시간당 200건(익명). Claude Code 직결 실측 필요.
3. NVIDIA NIM — 40 RPM, 상위 모델(Kimi K3, GLM-5.3, DeepSeek V4 Flash). OpenAI→Anthropic 프록시 필요, 일일 상한 비공개.
4. Ollama 로컬 — 하드웨어가 64K+ 컨텍스트의 30B급 이상을 돌릴 수 있을 때.

### 서브에이전트용
Requesty(200 RPD), Ollama Cloud Free, Gemini Flash-Lite(500 RPD, 2차 값), Mistral Experiment, Z.ai Flash, Vercel AI Gateway($5/월), OpenCode Zen, OpenRouter 무충전(50 RPD)

### 부적합
Groq(8K TPM), Cerebras(카드 필수), SambaNova(20 RPD), Cloudflare(약 31만 토큰/일), Hugging Face($0.10/월), GitHub Models(종료), Chutes(종료), Together, Fireworks, Moonshot, Qwen, Cohere, LLM7/Pollinations/OVH

### 일회성 비상용
DeepSeek 신규 5M 토큰(30일, 2차 출처) — Anthropic 엔드포인트 직결이라 설정은 가장 쉬움

### 미분류(추가 확인 필요)
LongCat(Anthropic 직결 + 1M 컨텍스트, 무료 쿼터 수치 상충), ModelScope(2,000 호출/일, 나머지 미확인)

---

## 5. 추천 우선순위 (상위 5)

1. **OpenRouter** — Anthropic 형식 직결, 공식 한도 명확, 무료 모델 다수가 tools 지원. $10 1회 충전으로 1,000 RPD. 1순위 모델 후보 `qwen/qwen3.8-27b:free` / `nvidia/nemotron-3-ultra-550b-a55b:free`, 서브에이전트 `cohere/north-mini-code:free`.
2. **NVIDIA NIM** — 무료 중 모델 품질 최상(`moonshotai/kimi-k3`, `z-ai/glm-5.3`), 40 RPM. 프록시(claude-code-router/LiteLLM) 필요, 약관상 평가 전용.
3. **Kilo Gateway** — 가입 없이 시간당 200건, OpenRouter 와 같은 무료 풀 + `kilo-auto/free`. OpenRouter 일일 한도 소진 시 2차 풀.
4. **Requesty** — Anthropic 직결, 200 RPD, tool calling 플래그가 API 로 확인됨. 서브에이전트/보조 풀.
5. **Ollama (로컬 + Cloud Free)** — Anthropic 직결, 학습 미사용, 네트워크 한도와 무관한 최후 보루. Cloud 무료분은 한도 비공개라 보조용.

### 적용 전 본인이 직접 확인해야 하는 항목
- Gemini: `aistudio.google.com/rate-limit` 에서 실제 RPM/TPM/RPD (2차 출처 상충)
- Mistral: Admin Console → Limits (공식 미게시)
- NVIDIA NIM: 상위 모델의 실제 무료 호출 가능 여부 및 tool calling 동작
- Kilo / OpenRouter: `:free` 모델로 Claude Code 도구 호출 루프가 실제로 안정적인지 (2차 평판은 "가끔 도구 호출 누락")
- LongCat: 콘솔에서 일일 무료 토큰 수치
