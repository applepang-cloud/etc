import 'package:flutter/foundation.dart';

import 'api.dart';

/// 화면들이 함께 쓰는 상태: API, 가족 정보, 데이터 변경 알림.
class AppScope {
  AppScope(this.api);

  final Api api;
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
}
