-- 공강 저장, 게시물 작성·삭제, 매칭 목록 (src/api/freeSlots.ts, posts.ts)
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)

-- S06 '설정 완료': 내 공강을 통째로 바꿔 저장 (지우기 + 넣기를 한 번에)
-- p_slots 예: [{"weekday": 0, "slot_start": "12:00"}, {"weekday": 0, "slot_start": "12:30"}]
create function public.save_free_slots(p_slots jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  delete from public.free_slots where user_id = auth.uid();
  insert into public.free_slots (user_id, weekday, slot_start)
  select distinct auth.uid(), (s ->> 'weekday')::smallint, (s ->> 'slot_start')::time
  from jsonb_array_elements(p_slots) s;
end;
$$;

-- S07 매칭 목록. 노출 규칙은 src/lib/visibility.ts(isPostVisibleTo)와 같다 (PRD 7.1, 10/31 회의)
-- 1 카테고리 2 열린 글 3 약속시간 안 지남 4 내 공강과 30분 이상 겹침 5 차단 관계 없음 6 내 글은 항상
-- 겹침 = 게시물 [시작, 끝) 안의 30분 칸 중 내 공강 칸 수 × 30분 ≥ MIN_OVERLAP_MINUTES(30)
create function public.get_matching_posts(p_category text)
returns table (
  id uuid, room_id uuid, category text, title text, content_preview text,
  weekday smallint, start_time text, end_time text, start_at timestamptz, end_at timestamptz,
  thumbnail_url text, author_id uuid, author_nickname text, author_photo_url text,
  member_count int, is_mine boolean, my_request text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    p.id, r.id, p.category, p.title, left(p.content, 60),
    p.weekday, to_char(p.start_time, 'HH24:MI'), to_char(p.end_time, 'HH24:MI'), p.start_at, p.end_at,
    (select ph.url from public.post_photos ph where ph.post_id = p.id order by ph.sort_order limit 1),
    u.id, u.nickname, u.photo_url,
    (select count(*)::int from public.chat_members m where m.room_id = r.id),
    p.author_id = auth.uid(),
    case
      when exists (select 1 from public.chat_members m where m.room_id = r.id and m.user_id = auth.uid()) then 'accepted'
      else coalesce((
        select case j.status when 'pending' then 'pending' when 'rejected' then 'rejected' else 'none' end
        from public.join_requests j
        where j.room_id = r.id and j.requester_id = auth.uid()
        order by j.created_at desc limit 1
      ), 'none')
    end,
    p.created_at
  from public.posts p
  join public.chat_rooms r on r.post_id = p.id
  join public.users u on u.id = p.author_id
  where p.category = p_category
    and p.status = 'open'
    and p.end_at > now()
    and not public.is_blocked_with(p.author_id)
    and (
      p.author_id = auth.uid()
      or (
        select count(*) from public.free_slots f
        where f.user_id = auth.uid() and f.weekday = p.weekday
          and f.slot_start >= p.start_time and f.slot_start < p.end_time
      ) * 30 >= 30
    )
  order by p.created_at desc;
$$;

-- S08 '게시': 게시물 + 채팅방 + 방장 참여를 한 번에. 약속 일시(start_at, end_at)는 앱이 lib/time.ts nextOccurrence로 계산해 보낸다
create function public.create_post(
  p_category text, p_title text, p_content text,
  p_weekday smallint, p_start_time time, p_end_time time,
  p_start_at timestamptz, p_end_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_post_id uuid;
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if not exists (select 1 from public.users where id = auth.uid()) then raise exception '프로필을 먼저 저장해 주세요'; end if;
  if extract(minute from p_start_time)::int % 30 <> 0 or extract(minute from p_end_time)::int % 30 <> 0 then
    raise exception '약속시간은 30분 단위여야 해요';
  end if;
  -- 앱이 계산한 날짜가 고른 요일·시각과 맞는지, 아직 지나지 않았는지 확인
  if p_end_at <= now()
    or (extract(isodow from p_start_at at time zone 'Asia/Seoul')::int - 1) <> p_weekday
    or (p_start_at at time zone 'Asia/Seoul')::time <> p_start_time
    or (p_end_at at time zone 'Asia/Seoul')::time <> p_end_time then
    raise exception '약속 날짜가 올바르지 않아요';
  end if;

  insert into public.posts (author_id, category, title, content, weekday, start_time, end_time, start_at, end_at)
  values (auth.uid(), p_category, trim(p_title), trim(p_content), p_weekday, p_start_time, p_end_time, p_start_at, p_end_at)
  returning id into v_post_id;
  insert into public.chat_rooms (post_id, host_id) values (v_post_id, auth.uid()) returning id into v_room_id;
  insert into public.chat_members (room_id, user_id) values (v_room_id, auth.uid());
  return v_post_id;
end;
$$;

-- 내 게시물 삭제 (약속 확정 전에만. 확정 후에는 약속 취소). 대기 중인 채팅 요청은 거절 처리
create function public.delete_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts set status = 'deleted'
  where id = p_post_id and author_id = auth.uid() and status = 'open';
  if not found then raise exception '삭제할 수 없는 게시물이에요'; end if;
  update public.join_requests j set status = 'rejected', decided_at = now()
  from public.chat_rooms r
  where j.room_id = r.id and r.post_id = p_post_id and j.status = 'pending';
end;
$$;

revoke execute on function public.save_free_slots(jsonb) from public, anon;
revoke execute on function public.get_matching_posts(text) from public, anon;
revoke execute on function public.create_post(text, text, text, smallint, time, time, timestamptz, timestamptz) from public, anon;
revoke execute on function public.delete_post(uuid) from public, anon;
grant execute on function public.save_free_slots(jsonb) to authenticated;
grant execute on function public.get_matching_posts(text) to authenticated;
grant execute on function public.create_post(text, text, text, smallint, time, time, timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_post(uuid) to authenticated;
