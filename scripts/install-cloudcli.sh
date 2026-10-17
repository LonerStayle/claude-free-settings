#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cloud_home="${CLAUDE_CLOUD_HOME:-$HOME/.local/share/claude-cloud}"
mkdir -p "$cloud_home/scripts" "$HOME/.local/bin" "$HOME/.config/claude-cloud"
chmod 700 "$HOME/.config/claude-cloud"
cp "$project_root/scripts/cloudcli.mjs" "$project_root/scripts/cloudcli-gateway.mjs" "$cloud_home/scripts/"
chmod +x "$cloud_home/scripts/cloudcli.mjs"
ln -sf "$cloud_home/scripts/cloudcli.mjs" "$HOME/.local/bin/claude-cloud"
if [ ! -f "$HOME/.config/claude-cloud/keys.env" ]; then
  umask 077
  cat > "$HOME/.config/claude-cloud/keys.env" <<'KEYS'
ANTHROPIC_1_API_KEY=
ANTHROPIC_2_API_KEY=
KEYS
fi
if [ ! -f "$cloud_home/cloudcli/node_modules/@cloudcli-ai/cloudcli/package.json" ]; then
  npm install --prefix "$cloud_home/cloudcli" --save-exact @cloudcli-ai/cloudcli@1.37.5 --cache "$cloud_home/npm-cache"
fi
printf 'CloudCLI: %s\n키 설정: %s\n' "$HOME/.local/bin/claude-cloud" "$HOME/.config/claude-cloud/keys.env"
