#!/bin/bash
# config.yaml 에 등록된 모델이 아직 제공처에 있고 무료·도구 호출 가능한지 확인한다.
# 사용: scripts/check-models.sh              등록 모델 점검
#       scripts/check-models.sh --candidates 등록되지 않은 OpenRouter 무료 도구 호출 모델도 출력
# 키는 이 저장소의 .env 에서 읽고 화면에 출력하지 않는다. 필요한 것: curl, jq

cd "$(dirname "$0")/.." || exit 1
[ -f .env ] && { set -a; . ./.env; set +a; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# 제공처 모델 목록. 실패하면 빈 파일로 두고 해당 제공처는 "조회 실패"로 표시한다.
fetch() { # 이름 URL [키]
  local auth=()
  [ -n "$3" ] && auth=(-H "Authorization: Bearer $3")
  curl -sf --max-time 20 "${auth[@]}" "$2" > "$tmp/$1.json" || : > "$tmp/$1.json"
}
fetch openrouter https://openrouter.ai/api/v1/models
[ -n "$REQUESTY_API_KEY" ] && fetch requesty https://router.requesty.ai/v1/models "$REQUESTY_API_KEY"
[ -n "$GROQ_API_KEY" ] && fetch groq https://api.groq.com/openai/v1/models "$GROQ_API_KEY"
[ -n "$MISTRAL_API_KEY" ] && fetch mistral https://api.mistral.ai/v1/models "$MISTRAL_API_KEY"
[ -n "$GEMINI_API_KEY" ] && curl -sf --max-time 20 \
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=$GEMINI_API_KEY" \
  > "$tmp/gemini.json" 2>/dev/null

# config.yaml 에서 주석이 아닌 배포를 "그룹 모델 api_base" 로 뽑는다.
awk '
  function flush() { if (model != "") print group, model, (base == "" ? "-" : base); model = ""; base = "" }
  /^[[:space:]]*#/ { next }
  /- model_name:/ { flush(); group = $3 }
  /^[[:space:]]+model:/ { model = $2 }
  /^[[:space:]]+api_base:/ { base = $2 }
  /^[a-z_]+:/ && !/^model_list:/ { flush() }
  END { flush() }
' config.yaml > "$tmp/deployments"

bad=0
printf '%-17s %-58s %s\n' 그룹 모델 결과
while read -r group model base; do
  id=${model#*/}
  case "$model" in
    openrouter/*) src=openrouter
      q='.data[] | select(.id == $id) | if (.supported_parameters | index("tools")) | not then "도구 호출 미지원"
         elif (.id | endswith(":free")) | not then "무료 아님" else "ok" end' ;;
    openai/*)
      case "$base" in *requesty*) src=requesty ;; *) src=unknown ;; esac
      q='.data[] | select(.id == $id) | if .supports_tool_calling != true then "도구 호출 미지원"
         elif (.input_price != 0 or .output_price != 0) then "무료 아님" else "ok" end' ;;
    groq/*)    src=groq;    q='.data[] | select(.id == $id) | "ok"' ;;
    mistral/*) src=mistral; q='.data[] | select(.id == $id) | if .capabilities.function_calling then "ok" else "도구 호출 미지원" end' ;;
    gemini/*)  src=gemini;  q='.models[] | select(.name == "models/" + $id) | "ok"' ;;
    *) src=unknown ;;
  esac

  if [ "$src" = unknown ]; then
    result="점검 대상 아님"
  elif [ ! -s "$tmp/$src.json" ]; then
    result="조회 실패 ($src, 키 확인)"; bad=1
  else
    result=$(jq -r --arg id "$id" "$q" "$tmp/$src.json" | head -1)
    [ -z "$result" ] && result="목록에 없음"
    [ "$result" != ok ] && bad=1
  fi
  printf '%-17s %-58s %s\n' "$group" "$model" "$result"
done < "$tmp/deployments"

if [ "$1" = --candidates ]; then
  echo
  echo "등록되지 않은 OpenRouter 무료 도구 호출 모델 (컨텍스트 큰 순):"
  jq -r '.data[] | select(.id | endswith(":free")) | select(.supported_parameters | index("tools"))
         | "\(.context_length)\t\(.id)"' "$tmp/openrouter.json" | sort -rn |
    while IFS=$'\t' read -r ctx id; do
      grep -q "openrouter/$id" "$tmp/deployments" || printf '  %8s  %s\n' "$ctx" "$id"
    done
fi

exit $bad
