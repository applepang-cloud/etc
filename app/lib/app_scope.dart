import 'package:flutter/foundation.dart';

import 'api.dart';
import 'push.dart';

/// 화면들이 함께 쓰는 상태: API, 가족 정보, 데이터 변경 알림.
class AppScope {
  AppScope(this.api);

  final Api api;
  late final push = PushService(api);

  /// 근황 탭을 마지막으로 본 뒤 다른 가족이 올린 소식 수 (배지)
  final newPosts = ValueNotifier<int>(0);

  final family = ValueNotifier<FamilyInfo?>(null);

  /// 사진을 올리거나 지우면 1씩 올라갑니다. 목록 화면들은 이 값을 보고 새로고침합니다.
  final version = ValueNotifier<int>(0);

  void changed() => version.value++;

  Future<void> reloadFamily() async {
    try {
      family.value = await api.getFamily();
    } catch (_) {}
  }

  /// 나이를 표시할 아이 (선택한 아이, 없으면 첫째)
  Child? get child {
    final kids = family.value?.children ?? const <Child>[];
    if (kids.isEmpty) return null;
    final id = api.selectedChildId;
    return kids.firstWhere((c) => c.id == id, orElse: () => kids.first);
  }

  int? get myId => api.user?.id;

  Future<void> checkNewPosts() async {
    try {
      final page = await api.listPosts();
      final seen = api.lastSeenActivity;
      newPosts.value = page.items.where((p) => p.author.id != myId && p.createdAt.isAfter(seen)).length;
    } catch (_) {}
  }

  void markActivitySeen() {
    api.lastSeenActivity = DateTime.now();
    newPosts.value = 0;
  }

  Future<void> logout() async {
    await push.disable();
    await api.logout();
  }
}
