/**
 * 혼자 지도 장소 (S09 혼자, S10 핀포인트 팝업)
 *
 * TODO(C): places 테이블. 장소 데이터 출처는 '나중에 논의' (10/31 회의)
 */
import type { Place } from '@/api/types';
import { copy, db, delay } from '@/api/mock/store';

export async function getPlaces(category: 'meal' | 'cafe'): Promise<Place[]> {
  await delay(200);
  return copy(db.places.filter((p) => p.category === category && p.is_active));
}
