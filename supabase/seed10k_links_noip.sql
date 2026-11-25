-- 같은 네트워크(IP) 의심 검사를 없앤다 (학교·집 와이파이에서 같이 하는 사람이 많아서). 여러 번 실행해도 된다.
-- 1) 적어 둔 IP 해시를 지운다: 기기 ID만 남기고, 기기 ID 없이 IP만 있던 줄은 지운다
insert into public.seed10k_links (user_id, dev, iph, at)
  select user_id, dev, '', max(at) from public.seed10k_links where iph <> '' and dev <> '' group by user_id, dev
  on conflict (user_id, dev, iph) do update set at = greatest(public.seed10k_links.at, excluded.at);
delete from public.seed10k_links where iph <> '' or dev = '';
-- 2) 이미 뜬 '같은 네트워크' 알림은 관리 탭에서 숨긴다
update public.seed10k_alerts set hidden = true where kind = 'same_net' and not hidden;
