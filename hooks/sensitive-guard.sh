#!/bin/bash
# 무료 세션의 PreToolUse hook. 설계: SENSITIVE.md 5.3절
# 도구 호출의 경로·명령 문자열이 A·B등급 패턴에 맞으면 종료 코드 2로 막는다.
# 모델을 호출하지 않는다. 정규식 비교만 한다.

input=$(cat)
target=$(echo "$input" | jq -r '[.tool_input.file_path, .tool_input.path, .tool_input.pattern, .tool_input.command, .tool_input.notebook_path] | map(select(. != null)) | join(" ")')

A='(^|[/ ])\.env($|[. ])|\.pem($| )|\.key($| )|\.p12($| )|\.pfx($| )|\.jks($| )|\.keystore($| )|id_rsa|id_ed25519|\.tfstate|\.tfvars|(^|/)\.?secrets/|\.ssh/|\.aws/|\.kube/|\.git-credentials|\.netrc|\.npmrc|\.pypirc'
B='(^|[/ ])(infra|terraform|pulumi|ansible|k8s|helm|charts|deploy)(/|$| )|\.github/workflows|\.gitlab-ci\.yml|docker-compose[^/ ]*\.ya?ml'

extra="${CLAUDE_PROJECT_DIR:-.}/.claude/sensitive-paths.txt"
if [ -f "$extra" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] && B="$B|$p"
  done < "$extra"
fi

# .env.example 은 허용한다
cleaned=$(echo "$target" | sed 's/\.env\.example//g')

if echo "$cleaned" | grep -qE "$A"; then
  echo "A등급 경로입니다. 어떤 모델에도 보내지 않습니다." >&2
  exit 2
fi

if echo "$cleaned" | grep -qE "$B"; then
  echo "B등급 경로입니다. 무료 세션에서는 다루지 않습니다. 구독 세션에서 작업하세요." >&2
  exit 2
fi

exit 0
