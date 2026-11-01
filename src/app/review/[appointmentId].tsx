/**
 * S17 후기작성 — 담당: (미정)
 * PRD: 체크 5문항(types/db.ts의 REVIEW_ITEMS). 4개 이상 체크하면 메이트 하트 +1 (HEART_THRESHOLD).
 * 하단 '후기 남기기' → S15, 그 아래 '차단' 버튼(PRD 8.2). 신고 기능은 삭제됨(10/31 회의).
 */
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export default function ReviewScreen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();

  return (
    <ScreenPlaceholder id="S17" title="후기작성" description={`약속 번호: ${appointmentId}`}>
      <Button label="후기 남기기 → S15" onPress={() => router.back()} />
      <Button label="차단" variant="danger" />
    </ScreenPlaceholder>
  );
}
