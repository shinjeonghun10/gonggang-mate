/** 가짜 공강 (api/freeSlots.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { requireMeId } from '@/api/mock/helpers';
import { copy, db, delay, newId } from '@/api/mock/store';
import { rangesToSlots, slotsToRanges } from '@/lib/time';
import type { TimeRange } from '@/types/db';

/** 내 공강 구간 목록. 예: [{ weekday: 0, start: '12:00', end: '14:00' }] */
export async function getMyFreeRanges(): Promise<TimeRange[]> {
  await delay(200);
  const meId = requireMeId();
  return copy(slotsToRanges(db.freeSlots.filter((s) => s.user_id === meId)));
}

/** S06 '설정 완료': 내 공강을 통째로 바꿔 저장. 저장 후 게시판 노출이 바로 다시 계산된다 */
export async function saveMyFreeRanges(ranges: TimeRange[]): Promise<TimeRange[]> {
  await delay();
  const meId = requireMeId();
  db.freeSlots = db.freeSlots.filter((s) => s.user_id !== meId);
  db.freeSlots.push(...rangesToSlots(ranges).map((s) => ({ id: newId('fs'), user_id: meId, ...s })));
  return copy(slotsToRanges(db.freeSlots.filter((s) => s.user_id === meId)));
}
