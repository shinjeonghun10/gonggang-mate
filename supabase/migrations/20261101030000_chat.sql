-- 채팅 요청·수락, 채팅 목록, 채팅방 정보, 나가기 (src/api/rooms.ts, messages.ts) — PRD 7.2, 10/31 회의
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)
-- 에러는 raise exception '화면에 보여 줄 문장' using hint = 'ApiError code' 모양으로 낸다 (api/supabaseHelpers.ts toApiError)

-- 나와 차단 관계인 사용자 id (내가 차단했거나 나를 차단한 사람). 채팅방에서 메시지를 가릴 때 쓴다
create function public.get_blocked_user_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select b.blocked_id from public.blocks b where b.blocker_id = auth.uid()
  union
  select b.blocker_id from public.blocks b where b.blocked_id = auth.uid();
$$;

-- S07 말풍선 버튼: 방장에게 채팅 요청. 이미 참여 중이면 'accepted', 요청이 들어가면 'pending'
create function public.request_join(p_post_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts;
  v_room public.chat_rooms;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요' using hint = 'not_logged_in'; end if;
  select * into v_post from public.posts where id = p_post_id;
  select * into v_room from public.chat_rooms where post_id = p_post_id;
  if v_room.id is null then raise exception '게시물을 찾을 수 없어요' using hint = 'not_found'; end if;
  if exists (select 1 from public.chat_members where room_id = v_room.id and user_id = auth.uid()) then return 'accepted'; end if;
  if v_post.status <> 'open' or v_post.end_at <= now() then raise exception '이미 마감된 약속이에요' using hint = 'not_allowed'; end if;
  if public.is_blocked_with(v_post.author_id) then raise exception '요청을 보낼 수 없어요' using hint = 'not_allowed'; end if;
  -- MAX_ROOM_MEMBERS(20)
  if (select count(*) from public.chat_members where room_id = v_room.id) >= 20 then
    raise exception '인원이 가득 찼어요' using hint = 'room_full';
  end if;
  if exists (select 1 from public.join_requests where room_id = v_room.id and requester_id = auth.uid() and status = 'pending') then
    return 'pending';
  end if;

  insert into public.join_requests (room_id, requester_id) values (v_room.id, auth.uid());
  insert into public.notifications (user_id, type, ref_id) values (v_room.host_id, 'join_request', v_room.id);
  return 'pending';
end;
$$;

-- 보낸 채팅 요청 취소
create function public.cancel_join_request(p_post_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.join_requests j set status = 'canceled', decided_at = now()
  from public.chat_rooms r
  where j.room_id = r.id and r.post_id = p_post_id and j.requester_id = auth.uid() and j.status = 'pending';
$$;

-- S12 (방장만): 채팅 요청 수락/거절. 수락하면 입장 + 시스템 메시지 + 요청자에게 알림
create function public.respond_join_request(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.join_requests;
  v_room public.chat_rooms;
begin
  select * into v_req from public.join_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then raise exception '이미 처리된 요청이에요' using hint = 'not_found'; end if;
  select * into v_room from public.chat_rooms where id = v_req.room_id for update; -- 동시에 수락해도 20명을 넘지 않게 잠근다
  if v_room.host_id is distinct from auth.uid() then raise exception '방장만 수락할 수 있어요' using hint = 'not_allowed'; end if;

  if not p_accept then
    update public.join_requests set status = 'rejected', decided_at = now() where id = p_request_id;
    return;
  end if;

  if (select count(*) from public.chat_members where room_id = v_room.id) >= 20 then
    raise exception '인원이 가득 찼어요' using hint = 'room_full';
  end if;
  update public.join_requests set status = 'accepted', decided_at = now() where id = p_request_id;
  insert into public.chat_members (room_id, user_id) values (v_room.id, v_req.requester_id);
  insert into public.messages (room_id, sender_id, type, body)
  select v_room.id, null, 'system', u.nickname || '님이 채팅방에 들어왔어요' from public.users u where u.id = v_req.requester_id;
  insert into public.notifications (user_id, type, ref_id) values (v_req.requester_id, 'join_accepted', v_room.id);
end;
$$;

-- S11: 내 채팅방 목록 (카테고리별, 최근 메시지 순). 삭제·닫힌 게시물의 방은 빼고, 수락 전(요청만 보낸) 방은 원래 안 나온다
create function public.get_my_rooms(p_category text default null)
returns table (
  id uuid, post_id uuid, category text, title text, members jsonb, member_count int,
  last_message jsonb, unread_count int, is_host boolean, pending_request_count int
)
language sql stable security definer set search_path = '' as $$
  select
    r.id, p.id, p.category, p.title,
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url) order by m.joined_at), '[]'::jsonb)
      from public.chat_members m join public.users u on u.id = m.user_id
      where m.room_id = r.id
    ),
    (select count(*)::int from public.chat_members m where m.room_id = r.id),
    lm.msg,
    (
      select count(*)::int from public.messages x
      where x.room_id = r.id and x.sender_id is distinct from auth.uid()
        and x.created_at > coalesce((select y.created_at from public.messages y where y.id = me.last_read_message_id), '-infinity')
    ),
    r.host_id = auth.uid(),
    case when r.host_id = auth.uid()
      then (select count(*)::int from public.join_requests j where j.room_id = r.id and j.status = 'pending')
      else 0 end
  from public.chat_members me
  join public.chat_rooms r on r.id = me.room_id
  join public.posts p on p.id = r.post_id
  left join lateral (
    select
      jsonb_build_object(
        'sender_nickname', su.nickname,
        'body', case when x.type = 'game_result' then '게임 결과를 공유했어요' else x.body end,
        'created_at', x.created_at
      ) as msg,
      x.created_at
    from public.messages x left join public.users su on su.id = x.sender_id
    where x.room_id = r.id
    order by x.created_at desc
    limit 1
  ) lm on true
  where me.user_id = auth.uid()
    and p.status not in ('deleted', 'closed')
    and (p_category is null or p.category = p_category)
  order by lm.created_at desc nulls last;
$$;

-- S12: 채팅방 상단 정보 (참여자만)
create function public.get_room(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_room_member(p_room_id) then raise exception '이 채팅방 참여자가 아니에요' using hint = 'not_allowed'; end if;
  return (
    select jsonb_build_object(
      'id', r.id,
      'post', jsonb_build_object(
        'id', p.id, 'title', p.title, 'category', p.category, 'content', p.content,
        'range', jsonb_build_object('weekday', p.weekday, 'start', to_char(p.start_time, 'HH24:MI'), 'end', to_char(p.end_time, 'HH24:MI')),
        'start_at', p.start_at, 'end_at', p.end_at
      ),
      'host', (select jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url) from public.users u where u.id = r.host_id),
      'members', (
        select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url) order by m.joined_at), '[]'::jsonb)
        from public.chat_members m join public.users u on u.id = m.user_id
        where m.room_id = r.id
      ),
      'is_host', r.host_id = auth.uid(),
      'appointment_id', (select a.id from public.appointments a where a.room_id = r.id and a.status <> 'canceled' limit 1)
    )
    from public.chat_rooms r join public.posts p on p.id = r.post_id
    where r.id = p_room_id
  );
end;
$$;

-- S12 메뉴 '나가기' (방장은 못 나감 → 게시물 삭제로 대신)
create function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_nickname text;
begin
  if exists (select 1 from public.chat_rooms where id = p_room_id and host_id = auth.uid()) then
    raise exception '방장은 나갈 수 없어요. 게시물을 삭제해 주세요' using hint = 'not_allowed';
  end if;
  delete from public.chat_members where room_id = p_room_id and user_id = auth.uid();
  if not found then raise exception '이 채팅방 참여자가 아니에요' using hint = 'not_allowed'; end if;
  select nickname into v_nickname from public.users where id = auth.uid();
  insert into public.messages (room_id, sender_id, type, body) values (p_room_id, null, 'system', v_nickname || '님이 나갔어요');
end;
$$;

revoke execute on function public.get_blocked_user_ids() from public, anon;
revoke execute on function public.request_join(uuid) from public, anon;
revoke execute on function public.cancel_join_request(uuid) from public, anon;
revoke execute on function public.respond_join_request(uuid, boolean) from public, anon;
revoke execute on function public.get_my_rooms(text) from public, anon;
revoke execute on function public.get_room(uuid) from public, anon;
revoke execute on function public.leave_room(uuid) from public, anon;
grant execute on function public.get_blocked_user_ids() to authenticated;
grant execute on function public.request_join(uuid) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.respond_join_request(uuid, boolean) to authenticated;
grant execute on function public.get_my_rooms(text) to authenticated;
grant execute on function public.get_room(uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
