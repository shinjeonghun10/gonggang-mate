/**
 * 차단 (S17 후기작성 하단, S13 메이트 정보) — PRD 8.2. 신고 기능은 10/31 회의에서 삭제
 * A가 B를 차단하면: 서로의 게시물이 안 보이고, 서로의 채팅방에 못 들어가고,
 * 이미 같이 있는 채팅방에서는 서로의 메시지가 가려진다. B에게는 알리지 않는다.
 *
 * TODO(C): blocks 테이블. 차단 관계는 서버에서 항상 걸러낸다 (화면 필터에만 의존하지 않음)
 */
import { ApiError, type MiniUser } from '@/api/types';
import { requireMeId, toMini } from '@/api/mock/helpers';
import { copy, db, delay, nowIso } from '@/api/mock/store';

export async function blockUser(userId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  if (userId === meId) throw new ApiError('자기 자신은 차단할 수 없어요', 'invalid_input');
  if (!db.blocks.some((b) => b.blocker_id === meId && b.blocked_id === userId)) {
    db.blocks.push({ blocker_id: meId, blocked_id: userId, created_at: nowIso() });
  }
}

export async function unblockUser(userId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  db.blocks = db.blocks.filter((b) => !(b.blocker_id === meId && b.blocked_id === userId));
}

/** S04 설정: 내가 차단한 사용자 목록 (해제용) */
export async function getBlockedUsers(): Promise<MiniUser[]> {
  await delay(200);
  const meId = requireMeId();
  return copy(db.blocks.filter((b) => b.blocker_id === meId).map((b) => toMini(b.blocked_id)));
}
