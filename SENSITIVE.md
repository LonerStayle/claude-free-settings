# 민감 정보 보호 설계

작성일: 2026-09-21
상위 문서: `DESIGN.md`
상태: 설계안. 스크립트와 설정은 아직 실행해 보지 않았다.

---

## 1. 결론

1. 민감도를 3등급으로 나눈다. A는 어떤 모델에도 보내지 않는다. B는 학습·로깅하는 무료 제공처에 보내지 않는다. C는 제한 없다.
2. 방어는 두 곳에 둔다. 1차는 Claude Code CLI 프로그램의 로컬 기능(`permissions.deny`, hook 스크립트)으로 경로 기준 차단을 한다. 2차는 LiteLLM에서 요청 내용 기준으로 막는다.
   - 1차는 내 컴퓨터에서만 실행되고 어떤 모델도 호출하지 않는다. Claude 토큰이 소진된 상태에서도 동작한다.
   - 이 문서에서 "Claude Code"는 CLI 프로그램을 뜻한다. Claude 모델을 뜻하지 않는다.
3. 경로 기준만으로는 부족하다. 파일을 한 번 읽으면 내용이 대화에 남아 이후 모든 요청에 실려 나간다. `cat`, `grep`, 명령 출력으로도 들어온다.
4. B등급을 만났을 때 기본 동작은 차단이다. 비공개 그룹(학습하지 않는 제공처)이 준비된 경우에만 그쪽으로 전환한다.
5. 무료 세션에서는 배포·인프라 변경 명령을 실행하지 못하게 한다. 데이터 유출과 별개의 위험이다.

---

## 2. 위험 요소

### 2.1 유출 경로

| 경로 | 설명 |
|---|---|
| 파일 읽기 | Read, Edit, Write 도구로 민감 파일을 연다 |
| 검색 결과 | Grep, Glob 결과에 민감 파일의 줄이 섞여 나온다 |
| 명령 출력 | `cat .env`, `env`, `printenv`, `docker compose config`, `kubectl get secret -o yaml`, `terraform show`, `git log -p`, CI 로그 |
| 세션 이어가기 | 구독 세션에서 민감 파일을 다룬 뒤 `claude-free --continue`를 하면 이전 대화 전체가 무료 제공처로 전송된다 |
| 요약 | `/compact` 요약문에 민감 내용이 남을 수 있다 |
| 자동 로드 파일 | `CLAUDE.md`, 메모리 파일은 모든 요청에 포함된다 |
| MCP 결과 | Supabase, Notion, Gmail, Drive 등 연결된 MCP의 응답(DB 행, 메일 본문)이 대화에 들어온다 |
| 프록시 로그 | LiteLLM이 요청 본문을 로그나 DB에 남길 수 있다 |
| 서브에이전트 | 서브에이전트도 같은 프록시로 요청을 보낸다. 같은 규칙이 적용돼야 한다 |

### 2.2 유출 외 위험

| 위험 | 설명 |
|---|---|
| 약한 모델의 오동작 | 무료 모델은 지시를 잘못 해석하거나 도구 호출을 틀리게 할 가능성이 높다. 인프라·배포 파일에서 그 결과가 크다 |
| 프롬프트 인젝션 | 웹 페이지, 이슈 본문 등에 섞인 지시를 따를 가능성이 Claude보다 높다 |
| 이 프로젝트의 `.env` | 제공처 API 키 6개와 LiteLLM 마스터 키가 들어 있다 |

---

## 3. 등급

### A등급: 어떤 모델에도 보내지 않는다 (구독 세션 포함)

| 분류 | 패턴 |
|---|---|
| 환경변수 파일 | `.env`, `.env.*` (`.env.example` 제외) |
| 키·인증서 | `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `id_rsa*`, `id_ed25519*` |
| 자격증명 파일 | `credentials*.json`, 서비스 계정 JSON, `.git-credentials`, `.netrc`, `.npmrc`, `.pypirc` |
| 홈 디렉터리 | `~/.ssh/`, `~/.aws/`, `~/.kube/`, `~/.config/gcloud/` |
| Terraform | `*.tfstate`, `*.tfstate.backup`, `*.tfvars` (state 파일에는 비밀값이 평문으로 들어 있다) |
| 시크릿 디렉터리 | `secrets/`, `.secrets/` |
| 모바일 | `local.properties`, 서명 키스토어 |
| 데이터 덤프 | `*.dump`, `*.sql.gz`, 운영 DB 백업 |

### B등급: 학습·로깅하는 무료 제공처에 보내지 않는다

| 분류 | 패턴 |
|---|---|
| 인프라 코드 | `infra/`, `terraform/`, `pulumi/`, `ansible/`, `k8s/`, `helm/`, `charts/` |
| 배포 | `deploy/`, `.github/workflows/`, `.gitlab-ci.yml`, `docker-compose*.yml` |
| 네트워크·보안 설정 | nginx, 방화벽, VPN 설정. 내부 호스트명과 IP가 들어 있다 |
| 인증·결제 코드 | `auth/`, `payment/`, `billing/` (프로젝트별로 지정) |
| 실제 고객 데이터 | 운영 데이터로 만든 fixture, 로그 파일 |
| 저장소 전체 | 외주·NDA 저장소. 저장소 단위로 B등급 지정 (5.4절) |

### C등급: 제한 없음

위에 해당하지 않는 일반 코드.

프로젝트별 추가 패턴은 저장소 루트의 `.claude/sensitive-paths.txt`에 한 줄에 하나씩 적는다.

---

## 4. 구조

```
claude-free 세션
  │
  ├─ [1차] 로컬 hook·권한 설정 (모델 호출 없음): 경로 기준
  │    ├─ A등급 경로        → 차단 (모든 세션)
  │    ├─ B등급 경로        → 차단 또는 비공개 그룹 전환 표시
  │    └─ 배포·인프라 명령   → 차단
  │
  └─ 요청 전송 ─▶ LiteLLM
                   │
                   [2차] 요청 내용 기준
                    ├─ 비밀값 패턴 발견    → 요청 거절
                    ├─ B등급 경로 흔적 발견 → 비공개 그룹으로 변경, 세션 고정
                    └─ 해당 없음          → 일반 무료 그룹
```

2차가 필요한 이유: 1차는 도구 호출 시점의 경로와 명령 문자열만 본다. 2.1절의 명령 출력, 세션 이어가기, MCP 결과는 1차를 지나간다. 2차는 실제로 전송되는 요청 전체를 본다.

세션 고정: B등급 내용이 한 번 대화에 들어오면 이후 요청에도 계속 실린다. 그래서 한 번 전환된 세션은 끝까지 비공개 그룹을 쓴다. Claude Code가 보내는 `x-claude-code-session-id` 헤더로 세션을 구분한다 [확인: 헤더 존재. 미확인: LiteLLM hook에서의 접근 방법].

---

## 5. 구현

### 5.1 A등급 차단 (모든 세션)

`~/.claude/settings.json`에 추가한다. 구독 세션에도 적용된다.

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./**/*.pem)",
      "Read(./**/*.key)",
      "Read(./**/*.tfstate*)",
      "Read(./**/*.tfvars)",
      "Read(./secrets/**)",
      "Read(~/.ssh/**)",
      "Read(~/.aws/**)",
      "Read(~/.kube/**)"
    ]
  }
}
```

`.env.example`을 읽어야 하면 해당 프로젝트 설정의 `allow`에 따로 넣는다.

### 5.2 무료 세션 전용 설정

`claude-free` 함수에서 `--settings`로 별도 파일을 읽게 한다. 구독 세션에는 영향이 없다.

```zsh
claude-free() {
  ...기존 환경변수... \
  claude --settings ~/.claude/free-session.settings.json "$@"
}
```

`~/.claude/free-session.settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Bash(git push:*)",
      "Bash(terraform apply:*)",
      "Bash(terraform destroy:*)",
      "Bash(kubectl apply:*)",
      "Bash(kubectl delete:*)",
      "Bash(helm upgrade:*)",
      "Bash(vercel --prod:*)",
      "Bash(vercel deploy:*)",
      "Bash(supabase db push:*)",
      "Bash(docker push:*)",
      "Bash(env)",
      "Bash(printenv:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Edit|Write|NotebookEdit|Grep|Glob|Bash",
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/sensitive-guard.sh" }
        ]
      }
    ]
  }
}
```

무료 세션에서는 권한 확인을 건너뛰는 모드(`--dangerously-skip-permissions`)를 쓰지 않는다.

### 5.3 경로 검사 스크립트

`~/.claude/hooks/sensitive-guard.sh`. 종료 코드 2는 도구 호출을 막고 stderr 내용을 모델에 전달한다.

```bash
#!/bin/bash
input=$(cat)
target=$(echo "$input" | jq -r '[.tool_input.file_path, .tool_input.path, .tool_input.pattern, .tool_input.command] | map(select(. != null)) | join(" ")')

B='(^|/)(infra|terraform|pulumi|ansible|k8s|helm|charts|deploy)(/|$)|\.github/workflows|\.gitlab-ci\.yml|docker-compose[^/]*\.ya?ml'

extra="$CLAUDE_PROJECT_DIR/.claude/sensitive-paths.txt"
if [ -f "$extra" ]; then
  while IFS= read -r p; do [ -n "$p" ] && B="$B|$p"; done < "$extra"
fi

if echo "$target" | grep -qE "$B"; then
  echo "B등급 경로입니다. 무료 세션에서는 다루지 않습니다. 구독 세션에서 작업하세요." >&2
  exit 2
fi
exit 0
```

Bash 명령은 문자열 검사라 우회가 가능하다(변수, 와일드카드, 스크립트 파일 경유). 완전한 차단이 아니다. 그래서 5.5절의 2차 검사가 필요하다.

### 5.4 저장소 단위 지정

외주·NDA 저장소는 루트에 `.claude/private-repo` 파일을 둔다. `claude-free`가 이 파일을 보면 실행을 거절한다.

```zsh
claude-free() {
  if [ -f .claude/private-repo ]; then
    echo "이 저장소는 무료 세션 사용이 금지되어 있습니다."; return 1
  fi
  ...
}
```

비공개 그룹을 갖춘 경우에는 거절 대신 `ANTHROPIC_MODEL=claude-free-private`로 시작하도록 바꾼다.

### 5.5 LiteLLM 요청 내용 검사 (2차)

LiteLLM의 custom callback으로 전송 직전 요청을 검사한다.

`custom_callbacks.py`:

```python
import re
from fastapi import HTTPException
from litellm.integrations.custom_logger import CustomLogger

SECRET = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----"
    r"|AKIA[0-9A-Z]{16}"
    r"|sk-[A-Za-z0-9_-]{20,}"
    r"|ghp_[A-Za-z0-9]{36}"
    r"|AIza[0-9A-Za-z_-]{35}"
    r"|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"
)
B_PATH = re.compile(
    r"(^|/)(infra|terraform|pulumi|ansible|k8s|helm|charts|deploy)/"
    r"|\.github/workflows|docker-compose|\.tfvars|\.tfstate"
)
PRIVATE_GROUP = "claude-free-private"
pinned_sessions = set()

class SensitiveRouter(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        body = str(data.get("messages", "")) + str(data.get("system", ""))
        if SECRET.search(body):
            raise HTTPException(status_code=400, detail="비밀값 패턴이 요청에 포함되어 전송을 거절했습니다.")
        headers = (data.get("proxy_server_request") or {}).get("headers") or {}
        session = headers.get("x-claude-code-session-id")
        if session in pinned_sessions or B_PATH.search(body):
            if session:
                pinned_sessions.add(session)
            data["model"] = PRIVATE_GROUP
        return data

proxy_handler_instance = SensitiveRouter()
```

`config.yaml`에 추가:

```yaml
litellm_settings:
  callbacks: custom_callbacks.proxy_handler_instance
  turn_off_message_logging: true     # 요청 본문을 로그에 남기지 않는다
```

Docker 실행 시 `-v "$PWD/custom_callbacks.py:/app/custom_callbacks.py:ro"`를 추가한다.

### 검증 결과 (2026-09-23)

| 항목 | 결과 |
|---|---|
| `/v1/messages`에서 `async_pre_call_hook` 호출 | 동작. `call_type=anthropic_messages` |
| 비밀값 패턴 차단 | 동작. 가짜 AWS 키, private key 모두 400 |
| B등급 경로 차단 | 동작. 단 오탐이 커서 기본 꺼짐으로 바꿈 (아래) |
| 일반 요청 통과 | 동작. `src/app.ts`, `infrastructure/` 모두 통과 |

**B등급 경로 검사를 기본 꺼짐으로 바꾼 이유**: 이 검사는 경로 "언급"만으로 막는다. Claude Code는 시스템 프롬프트에 프로젝트 파일 목록을 넣으므로, `infra/` 폴더가 있는 프로젝트는 첫 요청부터 전부 막힌다. 1차 hook이 이미 B등급 파일 읽기와 `cat` 우회를 막으므로, 2차에서는 비밀값 패턴만 본다. 켜려면 `docker-compose.yml`의 `GUARD_BLOCK_B_PATHS`를 `1`로 둔다.

초기 정규식은 `(^|/)infra/` 라 문장 중간의 `look at infra/main.tf`를 놓쳤다. `\binfra/`로 고쳤다.

미확인 항목:

- hook에서 요청 헤더(`x-claude-code-session-id`)를 읽는 정확한 위치. B등급 검사를 켤 때만 필요하다.
- 비밀값 패턴은 오탐이 있다. 테스트 코드의 예시 토큰에도 걸린다. 운영하면서 조정한다.
- `pinned_sessions`는 메모리에만 있다. LiteLLM을 재시작하면 사라진다.

비밀값이 걸려 요청이 거절되면 그 세션은 계속 거절된다. 비밀값이 대화에 남아 있기 때문이다. 새 세션으로 시작하고, 노출된 키는 교체한다.

### 5.6 비공개 그룹 (선택)

| 후보 | 데이터 정책 | 한도 | 판단 |
|---|---|---|---|
| Ollama 로컬 | 외부 전송 없음 | 하드웨어에 따름 | 가장 확실. 64K 이상 컨텍스트를 돌릴 메모리가 필요 |
| Ollama Cloud Free | 학습에 쓰지 않음 [확인] | 수치 비공개, 동시 1건 | 보조 |
| OpenRouter + `data_collection: deny` | 데이터를 수집하지 않는 제공자로만 라우팅 [확인: 옵션 존재] | `:free` 모델 중 조건을 통과하는 제공자가 있는지 [미확인] | 시험 필요. 없으면 소액 유료 모델 사용이 된다 |
| Groq | 저장하지 않음 [2차] | 8K TPM | 부적합 |

```yaml
  - model_name: claude-free-private
    litellm_params:
      model: ollama_chat/<로컬 모델>
      api_base: http://host.docker.internal:11434
```

비공개 그룹에는 `fallbacks`를 걸지 않는다. 실패했을 때 일반 무료 그룹으로 넘어가면 보호가 무효가 된다.

비공개 그룹을 구성하지 않은 경우: 5.5절 코드에서 `data["model"] = PRIVATE_GROUP` 대신 요청을 거절한다. 무료로 쓸 수 있는 비공개 제공처가 적으므로 이것이 기본값이다.

### 5.7 그 외 설정

| 항목 | 설정 |
|---|---|
| MCP | 무료 세션은 `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`로 MCP 없이 시작한다. 필요한 서버만 별도 파일에 적어 연다. claude.ai 커넥터(Gmail, Drive, Notion)는 `ANTHROPIC_AUTH_TOKEN`이 설정되면 비활성화된다 [확인, 2026-09-22 실행 메시지] |
| 세션 이어가기 | 구독 세션에서 A·B등급을 다뤘다면 `claude-free --continue`를 쓰지 않고 새 세션으로 시작한다. 2차 검사가 흔적을 잡지만 1차 방어는 사용자 판단이다 |
| `CLAUDE.md`·메모리 | 내부 호스트명, 계정 정보, 고객명을 적지 않는다 |
| 이 프로젝트의 `.env` | `.gitignore` 등록, 파일 권한 `600` |
| OpenRouter | 프라이버시 설정에서 학습 허용 제공자를 제외한다. 제외 후 `:free` 모델 가용 여부를 확인한다 |

---

## 6. 검증

| 단계 | 할 일 | 통과 기준 |
|---|---|---|
| 1 | 구독 세션에서 `.env` 읽기 요청 | 거절된다 |
| 2 | `claude-free`에서 `infra/` 아래 파일 읽기 요청 | hook이 막고 안내 문구가 나온다 |
| 3 | `claude-free`에서 `git push` 요청 | 거절된다 |
| 4 | `claude-free`에서 `cat infra/main.tf`를 Bash로 실행 요청 | hook이 막는다 |
| 5 | 가짜 AWS 키(`AKIA` + 16자)를 넣은 파일을 읽게 한다 | LiteLLM이 400을 반환한다 |
| 6 | 대화에 `deploy/` 경로가 포함된 상태로 요청 | LiteLLM 로그의 모델이 `claude-free-private`이거나 요청이 거절된다 |
| 7 | 6번 뒤 같은 세션에서 일반 요청 | 계속 같은 처리가 된다 (세션 고정) |
| 8 | LiteLLM 로그 확인 | 요청 본문이 남아 있지 않다 |

---

## 7. 한계

- 경로 패턴과 비밀값 정규식은 목록에 있는 것만 잡는다. 파일 이름이 평범한 민감 파일은 지나간다.
- Bash 문자열 검사는 우회가 가능하다.
- 2차 검사는 전송 직전에 막는다. 이미 읽은 내용은 로컬 세션 기록에 남는다.
- 비공개 그룹의 무료 후보가 적다. B등급 작업은 구독 한도가 복구된 뒤 구독 세션에서 하는 것이 기본이다.
