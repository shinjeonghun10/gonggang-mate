/**
 * 채팅방과 채팅 요청 (S07 말풍선 버튼, S11 채팅 목록, S12 채팅방) — 10/31 회의 결정
 * 말풍선 버튼 → 방장에게 채팅 요청 → 방장이 수락하면 입장. 최대 20명(방장 포함).
 *
 * TODO(C): chat_rooms, chat_members, join_requests 테이블
 * - 수락 시 인원 확인 + 참여 추가를 한 번에 (동시에 수락해도 20명 넘지 않게)
 * - 채팅·약속 데이터는 해당 방 참여자만 읽기/쓰기 (접근 권한 규칙)
 */
import { ApiError, type JoinRequestItem, type MyRequestStatus, type RoomDetail, type RoomListItem } from '@/api/types';
import { blockedUserIdsOf, findRoom, findUser, requireMeId, requireMember, roomMemberIds, toMini } from '@/api/mock/helpers';
import { addSystemMessage, copy, db, delay, newId, nowIso } from '@/api/mock/store';
import { MAX_ROOM_MEMBERS } from '@/constants/config';
import type { Category } from '@/types/db';

/** S07 말풍선 버튼: 방장에게 채팅 요청 보내기 */
export async function requestJoin(postId: string): Promise<MyRequestStatus> {
  await delay();
  const meId = requireMeId();
  const post = db.posts.find((p) => p.id === postId);
  if (!post || post.status !== 'open') throw new ApiError('이미 마감된 약속이에요', 'not_allowed');
  if (blockedUserIdsOf(meId).includes(post.author_id)) throw new ApiError('요청을 보낼 수 없어요', 'not_allowed');
  const room = db.rooms.find((r) => r.post_id === postId)!;
  if (roomMemberIds(room.id).includes(meId)) return 'accepted';
  if (roomMemberIds(room.id).length >= MAX_ROOM_MEMBERS) throw new ApiError('인원이 가득 찼어요', 'room_full');
  const existing = db.joinRequests.find((j) => j.room_id === room.id && j.requester_id === meId && j.status === 'pending');
  if (existing) return 'pending';
  db.joinRequests.push({ id: newId('jr'), room_id: room.id, requester_id: meId, status: 'pending', created_at: nowIso(), decided_at: null });
  return 'pending';
}

/** 보낸 채팅 요청 취소 */
export async function cancelJoinRequest(postId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  const room = db.rooms.find((r) => r.post_id === postId);
  db.joinRequests = db.joinRequests.filter((j) => !(j.room_id === room?.id && j.requester_id === meId && j.status === 'pending'));
}

/** S12 (방장만): 대기 중인 채팅 요청 목록 */
export async function getJoinRequests(roomId: string): Promise<JoinRequestItem[]> {
  await delay(200);
  const meId = requireMeId();
  const room = findRoom(roomId);
  if (room.host_id !== meId) return [];
  return copy(
    db.joinRequests
      .filter((j) => j.room_id === roomId && j.status === 'pending')
      .map((j) => ({ id: j.id, user: toMini(j.requester_id), created_at: j.created_at })),
  );
}

/** S12 (방장만): 채팅 요청 수락/거절. 수락하면 입장 + 시스템 메시지 */
export async function respondJoinRequest(requestId: string, accept: boolean): Promise<void> {
  await delay();
  const meId = requireMeId();
  const req = db.joinRequests.find((j) => j.id === requestId);
  if (!req || req.status !== 'pending') throw new ApiError('이미 처리된 요청이에요', 'not_found');
  const room = findRoom(req.room_id);
  if (room.host_id !== meId) throw new ApiError('방장만 수락할 수 있어요', 'not_allowed');
  if (accept && roomMemberIds(room.id).length >= MAX_ROOM_MEMBERS) throw new ApiError('인원이 가득 찼어요', 'room_full');
  req.status = accept ? 'accepted' : 'rejected';
  req.decided_at = nowIso();
  if (accept) {
    db.members.push({ room_id: room.id, user_id: req.requester_id, joined_at: nowIso(), last_read_message_id: null });
    addSystemMessage(room.id, `${findUser(req.requester_id).nickname}님이 채팅방에 들어왔어요`);
  }
}

/** S11: 내 채팅방 목록 (카테고리별, 최근 메시지 순) */
export async function getMyRooms(category?: Category): Promise<RoomListItem[]> {
  await delay();
  const meId = requireMeId();
  const myRoomIds = db.members.filter((m) => m.user_id === meId).map((m) => m.room_id);
  const items = myRoomIds
    .map((roomId) => {
      const room = findRoom(roomId);
      const post = db.posts.find((p) => p.id === room.post_id)!;
      if (post.status === 'deleted' || post.status === 'closed') return null;
      const messages = db.messages.filter((m) => m.room_id === roomId).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = messages[messages.length - 1];
      const me = db.members.find((m) => m.room_id === roomId && m.user_id === meId)!;
      const lastReadIndex = me.last_read_message_id ? messages.findIndex((m) => m.id === me.last_read_message_id) : -1;
      const memberIds = roomMemberIds(roomId);
      const item: RoomListItem = {
        id: roomId,
        post_id: post.id,
        category: post.category,
        title: post.title,
        members: memberIds.map(toMini),
        member_count: memberIds.length,
        last_message: last
          ? { sender_nickname: last.sender_id ? findUser(last.sender_id).nickname : null, body: last.type === 'game_result' ? '게임 결과를 공유했어요' : last.body, created_at: last.created_at }
          : null,
        unread_count: messages.slice(lastReadIndex + 1).filter((m) => m.sender_id !== meId).length,
        is_host: room.host_id === meId,
        pending_request_count: room.host_id === meId ? db.joinRequests.filter((j) => j.room_id === roomId && j.status === 'pending').length : 0,
      };
      return item;
    })
    .filter((x): x is RoomListItem => x !== null && (!category || x.category === category))
    .sort((a, b) => (b.last_message?.created_at ?? '').localeCompare(a.last_message?.created_at ?? ''));
  return copy(items);
}

/** S12: 채팅방 상단 정보 */
export async function getRoom(roomId: string): Promise<RoomDetail> {
  await delay(200);
  const meId = requireMeId();
  requireMember(roomId, meId);
  const room = findRoom(roomId);
  const post = db.posts.find((p) => p.id === room.post_id)!;
  const appointment = db.appointments.find((a) => a.room_id === roomId && a.status !== 'canceled');
  return copy({
    id: room.id,
    post: {
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      range: { weekday: post.weekday, start: post.start_time, end: post.end_time },
      start_at: post.start_at,
      end_at: post.end_at,
    },
    host: toMini(room.host_id),
    members: roomMemberIds(roomId).map(toMini),
    max_members: MAX_ROOM_MEMBERS,
    is_host: room.host_id === meId,
    appointment_id: appointment?.id ?? null,
  });
}

/** S12 메뉴 '나가기' (방장은 못 나감 → 게시물 삭제로 대신) */
export async function leaveRoom(roomId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  const room = findRoom(roomId);
  if (room.host_id === meId) throw new ApiError('방장은 나갈 수 없어요. 게시물을 삭제해 주세요', 'not_allowed');
  requireMember(roomId, meId);
  db.members = db.members.filter((m) => !(m.room_id === roomId && m.user_id === meId));
  addSystemMessage(roomId, `${findUser(meId).nickname}님이 나갔어요`);
}
