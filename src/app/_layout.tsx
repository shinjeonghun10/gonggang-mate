import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '@/constants/theme';

/**
 * 앱 전체 이동 틀 (PRD 5장)
 * - (tabs): 하단 네비가 있는 화면 4개 (혼자 / 홈 / 채팅 / 약속카드)
 * - 나머지: 하단 네비 없이 위에 쌓이는 화면
 */
export default function RootLayout() {
  return (
    // 드래그(TimeGrid 등)를 쓰려면 앱 전체를 GestureHandlerRootView로 감싼다
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="free-time" />
        <Stack.Screen name="board/[category]" />
        {/* 모달을 아래로 끌어 닫는 동작이 TimeGrid 드래그와 겹치지 않게 끈다 (닫기는 X 버튼) */}
        <Stack.Screen name="post/new" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="chat/[roomId]" />
        <Stack.Screen name="game/[roomId]" />
        <Stack.Screen name="review/[appointmentId]" />
      </Stack>
    </GestureHandlerRootView>
  );
}
