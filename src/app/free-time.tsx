/**
 * S06 공강 설정 — 담당: A
 * PRD: TimeGrid(mode="multi")로 매주 반복되는 공강을 칠한다. 한 칸 = 30분.
 * - '설정 완료' 시 저장 후 S05로 돌아간다.
 * - 저장하지 않고 뒤로 가면 "변경 사항을 저장하지 않을까요?" 확인.
 * 디자인은 나중에 피그마 반영 예정 (지금은 기능 위주).
 */
import { router, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api';
import { Button } from '@/components/Button';
import { TimeGrid, type TimeRange } from '@/components/TimeGrid';
import { colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';
import { formatDuration, totalMinutes } from '@/lib/time';

export default function FreeTimeScreen() {
  const [ranges, setRanges] = useState<TimeRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.freeSlots
      .getMyFreeRanges()
      .then(setRanges)
      .catch((e) => Alert.alert(e instanceof ApiError ? e.message : '공강을 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, []);

  // 저장하지 않고 나가려 하면 확인 (뒤로가기 버튼, 안드로이드 뒤로 키, 밀어서 뒤로가기 모두)
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('변경 사항을 저장하지 않을까요?', undefined, [
      { text: '계속 편집', style: 'cancel' },
      {
        text: '저장 안 함',
        style: 'destructive',
        onPress: () => {
          setDirty(false);
          repeat();
        },
      },
    ]);
  });

  const onChange = (next: TimeRange[]) => {
    setRanges(next);
    setDirty(true);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await api.freeSlots.saveMyFreeRanges(ranges);
      setDirty(false);
      disablePrevention();
      if (router.canGoBack()) router.back();
      else router.replace('/home');
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };

  const total = totalMinutes(ranges);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={8}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>공강 설정</Text>
        <View style={styles.back} />
      </View>
      <Text style={styles.guide}>수업이 없는 시간을 드래그해서 칠해 주세요. 매주 반복돼요.</Text>

      <View style={styles.gridArea}>
        {loading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <TimeGrid mode="multi" value={ranges} onChange={onChange} />}
      </View>

      <View style={styles.bottom}>
        <Text style={styles.total} accessibilityLiveRegion="polite">
          {total > 0 ? `공강 ${formatDuration(total)} 선택됨` : '아직 선택한 공강이 없어요'}
        </Text>
        <Button label={saving ? '저장 중…' : '설정 완료'} onPress={onSave} disabled={loading || saving} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, color: colors.ink },
  title: { fontSize: 18, fontWeight: '900', color: colors.ink },
  guide: { color: colors.sub, fontSize: fontSize.caption, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  gridArea: { flex: 1, paddingHorizontal: spacing.sm },
  loading: { marginTop: spacing.lg },
  bottom: { padding: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  total: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700', textAlign: 'center' },
});
