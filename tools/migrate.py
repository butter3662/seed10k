#!/usr/bin/env python3
"""supabase/migrate.txt에 적힌 SQL 파일을 Supabase 데이터베이스에 실행한다 (GitHub Actions에서).
연결 주소는 저장소 비밀값 SUPABASE_DB_URL (Supabase 대시보드 → Connect → Session pooler 주소, 비밀번호 포함).
- 처음 보는 파일, 내용이 바뀐 파일만 실행한다. 실행 기록: public.seed10k_migrations (정책 없음 = 서버 비밀 키·DB 접속만)
- 파일마다 한 묶음(트랜잭션)으로 실행해, 중간에 실패하면 그 파일은 하나도 적용되지 않는다. 실패하면 거기서 멈춘다."""
import hashlib, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get("SUPABASE_DB_URL", "").strip()


def psql(*args, sql=None):
    cmd = ["psql", URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", *args]
    return subprocess.run(cmd, input=sql, capture_output=True, text=True)


def main():
    if not URL:
        print("::warning::SUPABASE_DB_URL 비밀값이 없어 SQL을 실행하지 않았습니다 (Settings → Secrets and variables → Actions)")
        return 0
    r = psql("-c", "create table if not exists public.seed10k_migrations (name text primary key, sha text not null, at timestamptz not null default now());"
                   "alter table public.seed10k_migrations enable row level security;")
    if r.returncode:
        print("::error::데이터베이스에 접속하지 못했습니다:", r.stderr.strip()[-500:])
        return 1
    r = psql("-A", "-t", "-F", "\t", "-c", "select name, sha from public.seed10k_migrations")
    done = dict(line.split("\t", 1) for line in r.stdout.splitlines() if "\t" in line)
    names = [l.strip() for l in open(os.path.join(ROOT, "supabase", "migrate.txt"), encoding="utf-8") if l.strip() and not l.strip().startswith("#")]
    ran = 0
    for name in names:
        path = os.path.join(ROOT, "supabase", name)
        body = open(path, encoding="utf-8").read()
        sha = hashlib.sha256(body.encode()).hexdigest()
        if done.get(name) == sha:
            print(f"그대로: {name}")
            continue
        r = psql("-1", "-f", path)
        if r.returncode:
            print(f"::error::{name} 실행 실패 (이 파일은 적용되지 않았습니다): {r.stderr.strip()[-800:]}")
            return 1
        rec = psql("-c", f"insert into public.seed10k_migrations (name, sha) values ('{name}', '{sha}') on conflict (name) do update set sha = excluded.sha, at = now();")
        if rec.returncode:
            print(f"::error::{name}은 실행했지만 기록하지 못했습니다: {rec.stderr.strip()[-300:]}")
            return 1
        print(f"실행함: {name} ({'처음' if name not in done else '내용 바뀜'})")
        ran += 1
    print(f"끝: {ran}개 실행, {len(names) - ran}개 그대로")
    return 0


if __name__ == "__main__":
    sys.exit(main())
