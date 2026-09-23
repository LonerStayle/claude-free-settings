# 무료 세션 실행 함수. 설계: DESIGN.md 4.4절, SENSITIVE.md 5.2·5.4절
# 사용: ~/.zshrc 에 아래 한 줄을 추가한다 (경로는 이 저장소를 받은 위치).
#   source /path/to/free-model-settings/shell/claude-free.zsh

# 이 파일의 위치에서 저장소 루트를 구한다. 경로를 고쳐 적을 필요가 없다.
FREE_MODEL_HOME="${${(%):-%x}:A:h:h}"

claude-free() {
  local home="$FREE_MODEL_HOME"

  if [ -f .claude/private-repo ]; then
    echo "이 저장소는 무료 세션 사용이 금지되어 있습니다 (.claude/private-repo)."
    return 1
  fi

  local key
  key=$(grep '^LITELLM_MASTER_KEY=' "$home/.env" 2>/dev/null | cut -d= -f2-)
  if [ -z "$key" ]; then
    echo "LITELLM_MASTER_KEY 가 $home/.env 에 없습니다."
    return 1
  fi

  if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:4000/health/liveliness; then
    echo "LiteLLM 이 응답하지 않습니다. 먼저 실행: (cd $home && docker compose up -d)"
    return 1
  fi

  # 설정 템플릿의 자리표시자를 실제 경로로 바꿔 둔다 (.local 은 git 추적 제외).
  local settings="$home/.local/free-session.settings.json"
  mkdir -p "$home/.local"
  sed "s|__FREE_MODEL_HOME__|$home|g" \
    "$home/claude/free-session.settings.template.json" > "$settings" || return 1

  # CLAUDE_CODE_SUBAGENT_MODEL_FORCE 가 없으면 내장 에이전트의 model: inherit 이
  # 환경변수보다 우선해서 서브에이전트도 claude-free-main 으로 간다.
  ANTHROPIC_BASE_URL="http://127.0.0.1:4000" \
  ANTHROPIC_AUTH_TOKEN="$key" \
  ANTHROPIC_API_KEY="" \
  ANTHROPIC_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_OPUS_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_SONNET_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_FABLE_MODEL="claude-free-main" \
  ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-free-fast" \
  CLAUDE_CODE_SUBAGENT_MODEL="claude-free-sub" \
  CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1 \
  claude \
    --settings "$settings" \
    --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    "$@"
}
