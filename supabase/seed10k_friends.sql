-- 친구 기능은 v1.7.5에서 없앴다: 표와 함수를 지운다 (여러 번 실행해도 된다)
drop function if exists public.seed10k_friends_list();
drop function if exists public.seed10k_friend_remove(uuid);
drop function if exists public.seed10k_friend_respond(bigint, boolean);
drop function if exists public.seed10k_friend_request(text);
drop function if exists public.seed10k_nick_uid(text);
drop table if exists public.seed10k_friends;
