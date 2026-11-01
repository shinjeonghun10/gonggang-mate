-- 공강메이트 DB 구조와 권한 (PRD v5 9장, 10장 권한 규칙)
-- 실행: Supabase 대시보드 → SQL Editor에 이 파일 전체를 붙여넣고 Run (처음 한 번만)
--
-- 권한 원칙
-- - 앱은 로그인한 사용자(authenticated)로만 접근한다. 로그인 전(anon)은 아무 테이블도 못 본다.
-- - 모든 테이블에 RLS(행 단위 보안)를 켠다. 아래 policy에 적힌 경우만 읽기/쓰기 가능.
-- - 여러 테이블을 한 번에 바꾸는 동작(게시물+채팅방 생성, 채팅 요청 수락, 약속 확정, 후기+하트 등)은
--   테이블 직접 쓰기를 막고 서버 함수(RPC)로만 한다. RPC는 다음 마이그레이션에서 기능별로 추가한다.
-- - 20명 제한, 차단 관계, 학교 이메일은 화면이 아니라 DB에서 항상 확인한다.

-- ───────────────────────── 테이블 ─────────────────────────

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email_domain text not null unique
);

-- config.ts ALLOWED_EMAIL_DOMAINS와 같게 유지 (실제 학생 메일 도메인 확인 필요)
insert into public.schools (name, email_domain) values ('중앙대학교', 'cau.ac.kr');

-- 프로필. 가입(auth.users) 후 S04에서 처음 저장할 때 행이 생긴다. 비밀번호는 Supabase Auth가 관리
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  email text not null unique, -- 다른 사용자에게 노출 금지 (아래 권한에서 이 칸은 읽기 불가)
  nickname text not null unique check (char_length(nickname) between 2 and 10),
  gender text not null check (gender in ('male', 'female')),
  bio text check (char_length(bio) <= 40),
  photo_url text,
  heart_count int not null default 0,
  created_at timestamptz not null default now()
);

-- 주간 반복 공강. 30분 칸 하나당 한 행. weekday 0=월 … 6=일
create table public.free_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  slot_start time not null check (extract(minute from slot_start) in (0, 30) and extract(second from slot_start) = 0),
  unique (user_id, weekday, slot_start)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users (id) on delete cascade,
  category text not null check (category in ('meal', 'cafe', 'study', 'walk')),
  title text not null check (char_length(title) between 1 and 30),
  content text not null check (char_length(content) between 1 and 500),
  weekday smallint not null check (weekday between 0 and 6), -- 격자에서 고른 값
  start_time time not null,
  end_time time not null,
  start_at timestamptz not null, -- 계산된 실제 약속 일시
  end_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'closed', 'deleted')),
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (end_at > start_at)
);
create index posts_matching_idx on public.posts (category, status, end_at);
create index posts_author_idx on public.posts (author_id);

create table public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  url text not null,
  sort_order smallint not null default 0 check (sort_order between 0 and 4) -- 최대 5장
);
create index post_photos_post_idx on public.post_photos (post_id);

-- 게시물 1개 = 채팅방 1개
create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  host_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 채팅 요청 (말풍선 버튼 → 방장 수락)
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  requester_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- 한 사람은 한 방에 대기 중인 요청을 1건만
create unique index join_requests_one_pending_idx on public.join_requests (room_id, requester_id) where status = 'pending';
create index join_requests_requester_idx on public.join_requests (requester_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid default auth.uid() references public.users (id) on delete set null, -- null = 시스템 메시지
  type text not null default 'text' check (type in ('text', 'system', 'game_result')),
  body text not null check (char_length(body) between 1 and 1000),
  payload jsonb, -- game_result일 때 게임 종류·옵션·결과
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at);

-- 채팅방 참여자. 최대 20명(방장 포함)
create table public.chat_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_message_id uuid references public.messages (id) on delete set null,
  primary key (room_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

-- 약속카드
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  place text not null check (char_length(trim(place)) > 0),
  activity text not null default '',
  status text not null default 'confirmed' check (status in ('confirmed', 'canceled', 'done')),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
-- 한 채팅방에 살아 있는 약속은 1개
create unique index appointments_one_active_idx on public.appointments (room_id) where status <> 'canceled';

create table public.appointment_members (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  notified_at timestamptz, -- 30분 전 알림을 보낸 시각
  seen_at timestamptz, -- 약속카드 탭에서 확인한 시각 (배지)
  canceled_at timestamptz, -- 이 사용자가 약속을 취소한 시각
  primary key (appointment_id, user_id)
);
create index appointment_members_user_idx on public.appointment_members (user_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  target_id uuid not null references public.users (id) on delete cascade,
  on_time boolean not null default false,
  meet_again boolean not null default false,
  kind_manner boolean not null default false,
  profile_match boolean not null default false,
  kept_budget boolean not null default false,
  created_at timestamptz not null default now(),
  unique (appointment_id, reviewer_id, target_id),
  check (reviewer_id <> target_id)
);
create index reviews_target_idx on public.reviews (target_id);

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.game_runs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  run_by uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('ladder', 'draw', 'order', 'wheel', 'teams')),
  participants uuid[] not null,
  options jsonb not null default '{}',
  result jsonb not null,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index game_runs_room_idx on public.game_runs (room_id);

-- 혼자 지도 장소 (데이터 출처는 나중에 논의)
create table public.places (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('meal', 'cafe')),
  name text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  naver_map_url text not null,
  is_active boolean not null default true
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in (
    'new_message', 'join_request', 'join_accepted', 'new_member', 'appointment_confirmed',
    'appointment_soon', 'review_request', 'member_canceled', 'host_canceled'
  )), -- types/db.ts NotificationType과 같게 유지
  ref_id uuid not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read);

-- ───────────────────────── 규칙을 지키는 트리거 ─────────────────────────

-- 회원가입: 학교 도메인 이메일만 (화면 검사와 별개로 서버에서 막는다)
create function public.check_school_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.schools s where s.email_domain = lower(split_part(new.email, '@', 2))) then
    raise exception '중앙대 학교 이메일만 가입할 수 있어요';
  end if;
  return new;
end;
$$;
create trigger check_school_email before insert on auth.users
  for each row execute function public.check_school_email();

-- 프로필 첫 저장: id·이메일·학교는 로그인 정보로 채우고, 하트는 0에서 시작
create function public.fill_user_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := auth.uid();
  new.email := (select u.email from auth.users u where u.id = auth.uid());
  new.school_id := (select s.id from public.schools s where s.email_domain = lower(split_part(new.email, '@', 2)));
  new.heart_count := 0;
  return new;
end;
$$;
create trigger fill_user_row before insert on public.users
  for each row execute function public.fill_user_row();

-- 채팅방 최대 20명(방장 포함). config.ts MAX_ROOM_MEMBERS와 같게 유지
create function public.check_room_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 방 행을 잠가서 동시에 수락해도 20명을 넘지 않게 한다
  perform 1 from public.chat_rooms r where r.id = new.room_id for update;
  if (select count(*) from public.chat_members m where m.room_id = new.room_id) >= 20 then
    raise exception '인원이 가득 찼어요';
  end if;
  return new;
end;
$$;
create trigger check_room_capacity before insert on public.chat_members
  for each row execute function public.check_room_capacity();

-- 차단하면 두 사람 사이의 대기 중인 채팅 요청을 자동 거절 (PRD 8.2)
create function public.reject_requests_on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.join_requests j
  set status = 'rejected', decided_at = now()
  from public.chat_rooms r
  where j.room_id = r.id
    and j.status = 'pending'
    and ((j.requester_id = new.blocker_id and r.host_id = new.blocked_id)
      or (j.requester_id = new.blocked_id and r.host_id = new.blocker_id));
  return new;
end;
$$;
create trigger reject_requests_on_block after insert on public.blocks
  for each row execute function public.reject_requests_on_block();

-- ───────────────────────── 권한 확인용 함수 ─────────────────────────
-- policy 안에서 쓴다. security definer라서 policy끼리 서로를 다시 검사하며 무한 반복되는 일을 막는다.

create function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members m where m.room_id = p_room_id and m.user_id = auth.uid());
$$;

create function public.is_room_host(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_rooms r where r.id = p_room_id and r.host_id = auth.uid());
$$;

create function public.is_post_member(p_post_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_rooms r join public.chat_members m on m.room_id = r.id
    where r.post_id = p_post_id and m.user_id = auth.uid()
  );
$$;

create function public.is_appointment_member(p_appointment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointment_members m
    where m.appointment_id = p_appointment_id and m.user_id = auth.uid()
  );
$$;

-- 나와 상대 사이에 차단 관계가 있는지 (어느 쪽이 차단했든)
create function public.is_blocked_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_user_id)
       or (b.blocker_id = p_user_id and b.blocked_id = auth.uid())
  );
$$;

-- ───────────────────────── 권한 (GRANT) ─────────────────────────

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- users: 이메일은 아무도 읽지 못한다(내 이메일은 로그인 세션에서 얻는다). 하트·학교는 직접 못 바꾼다
revoke select, insert, update on public.users from authenticated;
grant select (id, school_id, nickname, gender, bio, photo_url, heart_count, created_at) on public.users to authenticated;
grant insert (nickname, gender, bio, photo_url) on public.users to authenticated;
grant update (nickname, gender, bio, photo_url) on public.users to authenticated;

-- 아래 표들은 정해진 한 칸만 직접 바꿀 수 있다
revoke update on public.chat_members from authenticated;
grant update (last_read_message_id) on public.chat_members to authenticated;
revoke update on public.appointment_members from authenticated;
grant update (seen_at) on public.appointment_members to authenticated;
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- ───────────────────────── RLS (행 단위 보안) ─────────────────────────

alter table public.schools enable row level security;
alter table public.users enable row level security;
alter table public.free_slots enable row level security;
alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.join_requests enable row level security;
alter table public.messages enable row level security;
alter table public.chat_members enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_members enable row level security;
alter table public.reviews enable row level security;
alter table public.blocks enable row level security;
alter table public.game_runs enable row level security;
alter table public.places enable row level security;
alter table public.notifications enable row level security;

create policy "학교 목록은 누구나 읽기" on public.schools for select to authenticated using (true);

create policy "프로필은 누구나 읽기" on public.users for select to authenticated using (true);
create policy "내 프로필만 만들기" on public.users for insert to authenticated with check (id = (select auth.uid()));
create policy "내 프로필만 고치기" on public.users for update to authenticated using (id = (select auth.uid()));

create policy "내 공강만 읽기" on public.free_slots for select to authenticated using (user_id = (select auth.uid()));
create policy "내 공강만 추가" on public.free_slots for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 공강만 삭제" on public.free_slots for delete to authenticated using (user_id = (select auth.uid()));

-- 게시물: 내 글, 내가 참여한 방의 글, 차단 관계가 없는 열린 글. (30분 겹침 필터는 매칭 목록 RPC에서)
-- 쓰기는 RPC로만 (게시물 + 채팅방 + 방장 참여를 한 번에 만들어야 해서)
create policy "볼 수 있는 게시물 읽기" on public.posts for select to authenticated using (
  author_id = (select auth.uid())
  or public.is_post_member(id)
  or (status = 'open' and not public.is_blocked_with(author_id))
);

create policy "볼 수 있는 게시물의 사진 읽기" on public.post_photos for select to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id)
);
create policy "내 게시물에 사진 추가" on public.post_photos for insert to authenticated with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
);
create policy "내 게시물 사진 삭제" on public.post_photos for delete to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
);

create policy "볼 수 있는 게시물의 채팅방 읽기" on public.chat_rooms for select to authenticated using (
  public.is_room_member(id) or exists (select 1 from public.posts p where p.id = post_id)
);

-- 채팅 요청: 보낸 사람과 방장만 읽기. 보내기·수락·거절·취소는 RPC로만
create policy "내 요청과 내 방의 요청 읽기" on public.join_requests for select to authenticated using (
  requester_id = (select auth.uid()) or public.is_room_host(room_id)
);

create policy "같은 방 참여자 목록 읽기" on public.chat_members for select to authenticated using (public.is_room_member(room_id));
create policy "내 읽음 위치만 고치기" on public.chat_members for update to authenticated using (user_id = (select auth.uid()));

-- 메시지: 방 참여자만. 직접 보낼 수 있는 건 내 이름의 일반 메시지뿐 (시스템·게임 결과는 RPC)
create policy "참여한 방 메시지 읽기" on public.messages for select to authenticated using (public.is_room_member(room_id));
create policy "참여한 방에 메시지 보내기" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and type = 'text' and payload is null and public.is_room_member(room_id)
);

-- 약속: 약속 참여자만 읽기. 확정·취소는 RPC로만
create policy "내 약속 읽기" on public.appointments for select to authenticated using (public.is_appointment_member(id));
create policy "같은 약속 참여자 읽기" on public.appointment_members for select to authenticated using (public.is_appointment_member(appointment_id));
create policy "내 확인 표시만 고치기" on public.appointment_members for update to authenticated using (user_id = (select auth.uid()));

-- 후기: 내가 쓴 것만 읽기 (받은 후기는 누가 썼는지 숨기고 합계만 RPC로). 쓰기는 RPC로만 (하트 처리)
create policy "내가 쓴 후기 읽기" on public.reviews for select to authenticated using (reviewer_id = (select auth.uid()));

create policy "내 차단 목록 읽기" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "차단하기" on public.blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "차단 해제" on public.blocks for delete to authenticated using (blocker_id = (select auth.uid()));

-- 게임: 방 참여자만 읽기. 결과는 서버가 정하므로 실행·공유는 RPC로만
create policy "참여한 방 게임 읽기" on public.game_runs for select to authenticated using (public.is_room_member(room_id));

create policy "사용 중인 장소 읽기" on public.places for select to authenticated using (is_active);

create policy "내 알림 읽기" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "내 알림 읽음 표시" on public.notifications for update to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────── 실시간(Realtime) ─────────────────────────
-- 채팅 메시지, 채팅 요청, 참여자 변화, 알림 배지를 실시간으로 받는다. RLS가 그대로 적용된다
alter publication supabase_realtime add table public.messages, public.join_requests, public.chat_members, public.notifications;
