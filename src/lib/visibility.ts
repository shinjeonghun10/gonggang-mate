/**
 * 게시물 노출 규칙 (PRD 7.1 + 10/31 회의 결정)
 * 노출 정책이 바뀌면 이 함수만 고친다. 서버(Supabase)에서도 같은 규칙으로 걸러야 한다.
 *
 * 사용자 U가 카테고리 게시판에 들어왔을 때, 게시물 P는 아래를 모두 만족하면 보인다.
 * 1. P.category == 게시판 카테고리 (목록을 불러올 때 이미 걸러짐)
 * 2. P.status == 'open' (약속 확정되면 매칭 목록에서 내려감)
 * 3. P.end_at > 지금 (약속시간이 지나지 않음)
 * 4. P의 약속시간과 U의 공강이 MIN_OVERLAP_MINUTES(30분) 이상 겹침
 * 5. U와 작성자 사이에 차단 관계가 없음 (어느 쪽이 차단했든)
 * 6. 작성자 본인은 자기 글을 항상 볼 수 있음 (4번 무시)
 */
import { MIN_OVERLAP_MINUTES } from '../constants/config';
import type { Post, TimeRange } from '../types/db';
import { overlapMinutes } from './time';

type VisibilityInput = {
  post: Pick<Post, 'author_id' | 'status' | 'end_at' | 'weekday' | 'start_time' | 'end_time'>;
  viewerId: string;
  viewerFreeRanges: TimeRange[];
  /** viewer가 차단했거나 viewer를 차단한 사용자 id 목록 */
  blockedUserIds: string[];
  now?: Date;
};

export function isPostVisibleTo({ post, viewerId, viewerFreeRanges, blockedUserIds, now = new Date() }: VisibilityInput): boolean {
  if (post.status !== 'open') return false;
  if (new Date(post.end_at).getTime() <= now.getTime()) return false;
  if (blockedUserIds.includes(post.author_id)) return false;
  if (post.author_id === viewerId) return true;
  const postRange: TimeRange = { weekday: post.weekday, start: post.start_time, end: post.end_time };
  return overlapMinutes(postRange, viewerFreeRanges) >= MIN_OVERLAP_MINUTES;
}
