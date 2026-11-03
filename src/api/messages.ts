/**
 * 채팅 메시지 (S12 채팅방) — 실시간 (Supabase Realtime)
 *
 * - 읽기·보내기 권한은 DB(RLS)가 확인한다: 방 참여자만, 직접 보낼 수 있는 건 내 이름의 일반 메시지뿐
 * - subscribeMessages는 새 메시지가 오면 onMessage를 부르고, 화면을 떠날 때 부를 '구독 해제' 함수를 돌려준다
 * - 차단 관계인 사용자의 메시지는 body를 가려서 준다 ("차단한 사용자의 메시지입니다")
 */
import * as mock from '@/api/mock/messages';
import { requireAuthUser, sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import { ApiError, type MessageItem, type MiniUser } from '@/api/types';
import type { Message } from '@/types/db';

const BLOCKED_TEXT = '차단한 사용자의 메시지입니다';
const MESSAGE_COLUMNS = 'id, room_id, sender_id, type, body, payload, created_at, sender:users!sender_id(id, nickname, photo_url)';

type MessageRow = Message & { sender: MiniUser | null };

function toItem(m: MessageRow, meId: string, blockedIds: string[]): MessageItem {
  const blocked = m.sender_id !== null && blockedIds.includes(m.sender_id);
  return { ...m, body: blocked ? BLOCKED_TEXT : m.body, is_mine: m.sender_id === meId };
}

async function getBlockedUserIds(): Promise<string[]> {
  const { data, error } = await sb().rpc('get_blocked_user_ids');
  if (error) throw toApiError(error, '메시지를 불러오지 못했어요');
  return data as string[];
}

/** S12: 메시지 목록 (오래된 것부터). before를 주면 그보다 이전 메시지 (위로 스크롤해서 더 보기) */
export async function getMessages(roomId: string, options: { before?: string; limit?: number } = {}): Promise<MessageItem[]> {
  if (USE_MOCK_API) return mock.getMessages(roomId, options);
  const user = await requireAuthUser();
  let query = sb()
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);
  if (options.before) {
    const before = await sb().from('messages').select('created_at').eq('id', options.before).maybeSingle();
    if (before.data) query = query.lt('created_at', before.data.created_at);
  }
  const [{ data, error }, blockedIds] = await Promise.all([query, getBlockedUserIds()]);
  if (error) throw toApiError(error, '메시지를 불러오지 못했어요');
  return (data as unknown as MessageRow[]).reverse().map((m) => toItem(m, user.id, blockedIds));
}

/** S12: 메시지 보내기 */
export async function sendMessage(roomId: string, body: string): Promise<MessageItem> {
  if (USE_MOCK_API) return mock.sendMessage(roomId, body);
  const text = body.trim();
  if (!text) throw new ApiError('메시지를 입력해 주세요', 'invalid_input');
  const user = await requireAuthUser();
  const { data, error } = await sb().from('messages').insert({ room_id: roomId, body: text }).select(MESSAGE_COLUMNS).single();
  if (error) {
    if (error.code === '42501') throw new ApiError('이 채팅방 참여자가 아니에요', 'not_allowed');
    throw toApiError(error, '메시지를 보내지 못했어요');
  }
  return toItem(data as unknown as MessageRow, user.id, []);
}

/**
 * S12: 새 메시지 실시간 구독. 화면에서 이렇게 쓴다.
 *   useEffect(() => subscribeMessages(roomId, (m) => setMessages((prev) => [...prev, m])), [roomId]);
 * 내가 보낸 메시지도 이 구독으로 들어온다 (중복 추가하지 않게 id로 확인).
 * 구독 직후 1초쯤은 서버 연결 준비 중이라 그 사이 메시지를 놓칠 수 있다.
 * 그래서 구독을 먼저 시작하고 getMessages로 목록을 불러와 id로 합친다.
 */
export function subscribeMessages(roomId: string, onMessage: (message: MessageItem) => void): () => void {
  if (USE_MOCK_API) return mock.subscribeMessages(roomId, onMessage);
  let active = true;
  const senders = new Map<string, MiniUser>();

  const channel = sb()
    .channel(`room-messages:${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
      const m = payload.new as Message;
      try {
        const [user, blockedIds] = await Promise.all([requireAuthUser(), getBlockedUserIds()]);
        let sender: MiniUser | null = null;
        if (m.sender_id) {
          sender = senders.get(m.sender_id) ?? null;
          if (!sender) {
            const { data } = await sb().from('users').select('id, nickname, photo_url').eq('id', m.sender_id).maybeSingle();
            sender = (data as MiniUser | null) ?? null;
            if (sender) senders.set(sender.id, sender);
          }
        }
        if (active) onMessage(toItem({ ...m, sender }, user.id, blockedIds));
      } catch (e) {
        if (__DEV__) console.warn('[subscribeMessages]', e);
      }
    })
    .subscribe();

  return () => {
    active = false;
    sb().removeChannel(channel);
  };
}

/** S12 진입·새 메시지 확인 시: 여기까지 읽음 표시 (S11 안 읽은 수 배지 계산용) */
export async function markRead(roomId: string): Promise<void> {
  if (USE_MOCK_API) return mock.markRead(roomId);
  const user = await requireAuthUser();
  const last = await sb().from('messages').select('id').eq('room_id', roomId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (last.error || !last.data) return;
  await sb().from('chat_members').update({ last_read_message_id: last.data.id }).eq('room_id', roomId).eq('user_id', user.id);
}
