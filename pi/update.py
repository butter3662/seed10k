#!/usr/bin/env python3
"""SEED 10K 라즈베리파이 자동 업데이트 (cron으로 1분마다 실행)

하는 일
  1. GitHub 저장소에 새 커밋이 있으면 받아 온다 (git pull --ff-only).
  2. 바뀐 파일을 보고 필요한 것만 다시 켠다.
       - 심판(seed10k-referee): pi/referee.ts, pi/mp_core.js, pi/bm_engine.js, pi/bs_engine.js
       - 시세 수집기(seed10k-quotes): pi/runner.ts, supabase/functions/ 아래
       - docker-compose.yml이 바뀌면 둘 다 새 설정으로 (docker compose up -d)
  3. 관리 탭의 '서버 업데이트' 버튼(seed10k_admin_cmds 표)에 들어온 요청을 처리하고 결과를 적는다.
     버튼은 바뀐 것이 없어도 심판을 다시 켠다.

비밀 키는 pi/.env(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)에서 읽는다. 밖에서 들어오는 연결은 없다 (나가는 요청만).

설치 (한 번만):
  (crontab -l 2>/dev/null; echo '* * * * * /usr/bin/python3 /home/butter3662/seed10k/pi/update.py >> /home/butter3662/seed10k-update.log 2>&1') | crontab -
"""
import fcntl, json, os, shutil, subprocess, sys, time, urllib.request
from datetime import datetime, timezone, timedelta

PI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(PI)
KST = timezone(timedelta(hours=9))
os.environ["PATH"] = os.environ.get("PATH", "") + ":/usr/local/bin:/usr/bin:/bin"

REFEREE = ("pi/referee.ts", "pi/mp_core.js", "pi/bm_engine.js", "pi/bs_engine.js")
QUOTES = ("pi/runner.ts", "supabase/functions/")


def log(*a):
    print(datetime.now(KST).strftime("%y/%m/%d %H:%M:%S"), *a, flush=True)


def env():
    e = {}
    try:
        for line in open(os.path.join(PI, ".env"), encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                e[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return e


def run(*cmd, cwd=REPO):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
    return r.returncode, (r.stdout + r.stderr).strip()


class Rest:
    def __init__(self, e):
        self.base = (e.get("SUPABASE_URL") or "").rstrip("/")
        key = e.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        self.h = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):
            self.h["Authorization"] = "Bearer " + key
        self.ok = bool(self.base and key)

    def call(self, method, path, body=None, prefer=None):
        h = dict(self.h)
        if prefer:
            h["Prefer"] = prefer
        req = urllib.request.Request(f"{self.base}/rest/v1/{path}", method=method, headers=h,
                                     data=None if body is None else json.dumps(body).encode())
        with urllib.request.urlopen(req, timeout=15) as r:
            t = r.read().decode()
            return json.loads(t) if t else None


def main():
    lock = open("/tmp/seed10k-update.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)   # 앞의 실행이 아직 끝나지 않았으면 이번은 건너뛴다
    except OSError:
        return
    rest = Rest(env())

    # 관리 탭 버튼 요청
    cmds = []
    if rest.ok:
        try:
            cmds = rest.call("GET", "seed10k_admin_cmds?done=eq.false&order=id.asc&select=id,kind") or []
        except Exception as ex:   # 표가 아직 없으면(SQL 실행 전) 버튼만 못 쓰고 자동 업데이트는 그대로
            if "404" not in str(ex):
                log("요청 확인 실패:", ex)

    # 새 커밋 받기
    code, out = run("git", "fetch", "--quiet", "origin", "main")
    if code:
        msg = f"git fetch 실패: {out[-300:]}"
        log(msg)
        finish(rest, cmds, False, msg)
        return
    _, old = run("git", "rev-parse", "HEAD")
    _, new = run("git", "rev-parse", "origin/main")
    changed = []
    if old != new:
        code, out = run("git", "pull", "--ff-only", "--quiet", "origin", "main")
        if code:
            msg = f"git pull 실패 (파이에서 직접 고친 파일이 있으면 생깁니다): {out[-300:]}"
            log(msg)
            finish(rest, cmds, False, msg)
            return
        _, diff = run("git", "diff", "--name-only", old, new)
        changed = [x for x in diff.splitlines() if x]
        log(f"받음 {old[:7]} → {new[:7]}: {len(changed)}개 파일")
    if not changed and not cmds:
        return

    docker = shutil.which("docker")
    did, notes = [], []
    compose = lambda *a: run(docker, "compose", *a, cwd=PI) if docker else (1, "docker를 찾지 못했습니다")
    if "pi/docker-compose.yml" in changed:
        c, o = compose("up", "-d")
        did.append("docker compose up -d" if not c else f"compose 실패: {o[-200:]}")
    else:
        ref = cmds or any(x in REFEREE for x in changed)
        quo = any(x == "pi/runner.ts" or x.startswith("supabase/functions/") for x in changed)
        if ref:
            c, o = compose("restart", "seed10k-referee")
            did.append("심판 재시작" if not c else f"심판 재시작 실패: {o[-200:]}")
        if quo:
            c, o = compose("restart", "seed10k-quotes")
            did.append("시세 수집기 재시작" if not c else f"시세 수집기 재시작 실패: {o[-200:]}")
    _, head = run("git", "log", "-1", "--format=%h %s")
    if changed:
        notes.append(f"새 커밋 {old[:7]} → {new[:7]} ({len(changed)}개 파일)")
    else:
        notes.append("새 커밋 없음")
    msg = " · ".join(notes + did) + f" · 지금 {head[:80]}"
    log(msg)
    finish(rest, cmds, not any("실패" in d for d in did), msg)


def finish(rest, cmds, ok, msg):
    for c in cmds:
        try:
            rest.call("PATCH", f"seed10k_admin_cmds?id=eq.{c['id']}",
                      {"done": True, "ok": ok, "result": msg[:900], "done_at": datetime.now(timezone.utc).isoformat()}, "return=minimal")
        except Exception as ex:
            log("결과 기록 실패:", ex)


if __name__ == "__main__":
    try:
        main()
    except Exception as ex:
        log("업데이트 오류:", ex)
        sys.exit(1)
