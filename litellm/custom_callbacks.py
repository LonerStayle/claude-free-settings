# LiteLLM 요청 내용 검사 (1.5단계). 설계: SENSITIVE.md 5.5절
# config.yaml 의 litellm_settings.callbacks 주석을 해제해야 동작한다.
# 미확인: /v1/messages 경로에서 이 hook 이 호출되는지, data["model"] 변경이 라우팅에 반영되는지.
import os
import re

from fastapi import HTTPException
from litellm.integrations.custom_logger import CustomLogger

SECRET = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----"
    r"|AKIA[0-9A-Z]{16}"
    r"|sk-[A-Za-z0-9_-]{20,}"
    r"|ghp_[A-Za-z0-9]{36}"
    r"|AIza[0-9A-Za-z_-]{35}"
)
B_PATH = re.compile(
    # \b 로 시작해야 문장 중간의 "look at infra/main.tf" 도 잡힌다.
    r"\b(infra|terraform|pulumi|ansible|k8s|helm|charts|deploy|secrets)/"
    r"|\.github/workflows|docker-compose|\.tfvars|\.tfstate|\.env\b"
)

# 비공개 그룹을 구성하면 그 그룹 이름을 적는다. None 이면 B등급 요청을 거절한다.
PRIVATE_GROUP = None

# B등급 경로 검사는 기본 꺼짐. 경로 "언급"만으로 막기 때문에 오탐이 크다.
# Claude Code 는 시스템 프롬프트에 프로젝트 파일 목록을 넣으므로, infra/ 폴더가 있는
# 프로젝트는 모든 요청이 막힌다. 1차 hook 이 이미 B등급 파일 읽기와 cat 을 막으므로
# 여기서는 비밀값 패턴만 본다. 켜려면 docker-compose 에 GUARD_BLOCK_B_PATHS=1 을 준다.
BLOCK_B_PATHS = os.environ.get("GUARD_BLOCK_B_PATHS") == "1"

pinned_sessions = set()


class SensitiveRouter(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        # 어느 그룹으로 들어온 요청인지만 남긴다. 본문은 남기지 않는다.
        print(f"[guard] group={data.get('model')} call_type={call_type}", flush=True)

        body = str(data.get("messages", "")) + str(data.get("system", ""))

        if SECRET.search(body):
            raise HTTPException(
                status_code=400,
                detail="비밀값 패턴이 요청에 포함되어 전송을 거절했습니다. 새 세션으로 시작하고 노출된 키를 교체하세요.",
            )

        headers = (data.get("proxy_server_request") or {}).get("headers") or {}
        session = headers.get("x-claude-code-session-id")

        if not BLOCK_B_PATHS:
            return data

        if session in pinned_sessions or B_PATH.search(body):
            if PRIVATE_GROUP is None:
                raise HTTPException(
                    status_code=400,
                    detail="B등급 경로가 대화에 포함되어 전송을 거절했습니다. 구독 세션에서 작업하세요.",
                )
            if session:
                pinned_sessions.add(session)
            data["model"] = PRIVATE_GROUP

        return data


proxy_handler_instance = SensitiveRouter()
