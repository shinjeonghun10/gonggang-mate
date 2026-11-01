/**
 * 화면에서 서버 데이터가 필요하면 여기 함수만 쓴다. Supabase를 화면에서 직접 부르지 않는다.
 *
 *   import { api } from '@/api';
 *   const list = await api.posts.getMatchingList('meal');
 *
 * 지금은 가짜 데이터(src/api/mock)로 동작한다. C(DB 담당)가 함수 안쪽을 Supabase로 바꾸면
 * 화면 코드는 그대로 실제 데이터로 동작한다. 함수 이름·입력·출력 모양을 바꿀 때는 단톡방에 먼저 알린다.
 */
import * as appointments from '@/api/appointments';
import * as auth from '@/api/auth';
import * as blocks from '@/api/blocks';
import * as freeSlots from '@/api/freeSlots';
import * as games from '@/api/games';
import * as messages from '@/api/messages';
import * as places from '@/api/places';
import * as posts from '@/api/posts';
import * as reviews from '@/api/reviews';
import * as rooms from '@/api/rooms';
import * as users from '@/api/users';

export const api = { auth, users, freeSlots, posts, rooms, messages, appointments, reviews, blocks, places, games };

export * from '@/api/types';
