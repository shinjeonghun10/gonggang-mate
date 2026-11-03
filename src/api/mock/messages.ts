/** 가짜 채팅 메시지 (api/messages.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type MessageItem } from '@/api/types';
import { blockedUserIdsOf, requireMeId, requireMember, toMini } from '@/api/mock/helpers';
import { addMessageListener, copy, db, delay, emitMessage, newId, nowIso } from '@/api/mock/store';
import type { Message } from '@/types/db';

const BLOCKED_TEXT = '차단한 사용자의 메시지입니다';

function toItem(m: Message, meId: string): MessageItem {
  const blocked = m.sender_id !== null && blockedUserIdsOf(meId).includes(m.sender_id);
  return {
    ...m,
    body: blocked ? BLOCKED_TEXT : m.body,
    sender: m.sender_id ? toMini(m.sender_id) : null,
    is_mine: m.sender_id === meId,
  };
}

/** S12: 메시지 목록 (오래된 것부터). before를 주면 그보다 이전 메시지 (위로 스크롤해서 더 보기) */
export async function getMessages(roomId: string, options: { before?: string; limit?: number } = {}): Promise<MessageItem[]> {
  await delay(200);
  const meId = requireMeId();
  requireMember(roomId, meId);
  const all = db.messages.filter((m) => m.room_id === roomId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const end = options.before ? all.findIndex((m) => m.id === options.before) : all.length;
  const limit = options.limit ?? 50;
  return copy(all.slice(Math.max(0, end - limit), end).map((m) => toItem(m, meId)));
}

/** S12: 메시지 보내기 */
export async function sendMessage(roomId: string, body: string): Promise<MessageItem> {
  await delay(150);
  const meId = requireMeId();
  requireMember(roomId, meId);
  const text = body.trim();
  if (!text) throw new ApiError('메시지를 입력해 주세요', 'invalid_input');
  const message: Message = { id: newId('m'), room_id: roomId, sender_id: meId, type: 'text', body: text, payload: null, created_at: nowIso() };
  db.messages.push(message);
  emitMessage(message);
  return copy(toItem(message, meId));
}

/**
 * S12: 새 메시지 실시간 구독. 화면에서 이렇게 쓴다.
 *   useEffect(() => subscribeMessages(roomId, (m) => setMessages((prev) => [...prev, m])), [roomId]);
 * 내가 보낸 메시지도 이 구독으로 들어온다 (중복 추가하지 않게 id로 확인).
 */
export function subscribeMessages(roomId: string, onMessage: (message: MessageItem) => void): () => void {
  const meId = requireMeId();
  return addMessageListener(roomId, (m) => onMessage(toItem(m, meId)));
}

/** S12 진입·새 메시지 확인 시: 여기까지 읽음 표시 (S11 안 읽은 수 배지 계산용) */
export async function markRead(roomId: string): Promise<void> {
  const meId = requireMeId();
  const last = db.messages.filter((m) => m.room_id === roomId).sort((a, b) => a.created_at.localeCompare(b.created_at)).pop();
  const me = db.members.find((m) => m.room_id === roomId && m.user_id === meId);
  if (me && last) me.last_read_message_id = last.id;
}
