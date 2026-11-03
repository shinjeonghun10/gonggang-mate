/**
 * 내 공강 (S05 메인, S06 공강 설정, S08 격자 미리보기)
 * 화면에서는 항상 TimeRange[] (연속 칸을 합친 구간)로 주고받는다.
 * DB free_slots는 30분 칸 하나당 한 행. 저장은 '전체 교체' 방식(save_free_slots RPC)
 */
import * as mock from '@/api/mock/freeSlots';
import { requireAuthUser, sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import { rangesToSlots, slotsToRanges } from '@/lib/time';
import type { TimeRange, Weekday } from '@/types/db';

/** 내 공강 구간 목록. 예: [{ weekday: 0, start: '12:00', end: '14:00' }] */
export async function getMyFreeRanges(): Promise<TimeRange[]> {
  if (USE_MOCK_API) return mock.getMyFreeRanges();
  const user = await requireAuthUser();
  const { data, error } = await sb().from('free_slots').select('weekday, slot_start').eq('user_id', user.id);
  if (error) throw toApiError(error, '공강시간을 불러오지 못했어요');
  // DB 시각은 '12:30:00' 모양이라 'HH:mm'으로 자른다
  return slotsToRanges((data as { weekday: Weekday; slot_start: string }[]).map((s) => ({ weekday: s.weekday, slot_start: s.slot_start.slice(0, 5) })));
}

/** S06 '설정 완료': 내 공강을 통째로 바꿔 저장. 저장 후 게시판 노출이 바로 다시 계산된다 */
export async function saveMyFreeRanges(ranges: TimeRange[]): Promise<TimeRange[]> {
  if (USE_MOCK_API) return mock.saveMyFreeRanges(ranges);
  const { error } = await sb().rpc('save_free_slots', { p_slots: rangesToSlots(ranges) });
  if (error) throw toApiError(error, '공강시간을 저장하지 못했어요');
  return getMyFreeRanges();
}
