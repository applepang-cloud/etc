import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';
import 'platform/web_info.dart';

enum PushStatus {
  /// 서버에 Firebase 설정이 없음
  notConfigured,

  /// 이 브라우저에서는 사용할 수 없음
  unsupported,

  /// 알림 준비 중 오류 (네트워크 등)
  error,

  /// 아이폰: 홈 화면에 추가해야 함
  needsHomeScreen,

  /// 사용자가 알림 권한을 거부함 (설정에서 다시 허용해야 함)
  denied,

  /// 아직 켜지 않음
  off,

  /// 이 기기에서 알림 받는 중
  on,
}

/// 푸시 알림: Firebase 설정은 서버(/api/push/config)에서 받아오므로 빌드할 때 따로 넣을 필요가 없습니다.
class PushService {
  PushService(this.api);

  final Api api;
  final status = ValueNotifier<PushStatus>(PushStatus.notConfigured);

  /// 앱을 보고 있는 중에 알림이 오면 호출됩니다.
  void Function(String title, String body)? onForegroundMessage;

  Map<String, dynamic>? _config;
  String? _token;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _messageSub;

  static const _enabledKey = 'push_enabled';

  Future<void> init() async {
    try {
      final cfg = await api.pushConfig();
      if (cfg == null) return;
      if (!browserSupportsPush) {
        status.value = isIosBrowserNotInstalled ? PushStatus.needsHomeScreen : PushStatus.unsupported;
        return;
      }
      _config = cfg;
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: _options(cfg)).timeout(const Duration(seconds: 20));
      }

      _messageSub = FirebaseMessaging.onMessage.listen((m) {
        final n = m.notification;
        if (n != null) onForegroundMessage?.call(n.title ?? '', n.body ?? '');
      });

      final settings = await FirebaseMessaging.instance.getNotificationSettings();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        status.value = PushStatus.denied;
      } else if (api.prefs.getBool(_enabledKey) == true &&
          settings.authorizationStatus == AuthorizationStatus.authorized) {
        await _register();
      } else {
        status.value = PushStatus.off;
      }
    } catch (e) {
      debugPrint('푸시 초기화 실패: $e');
      status.value = isIosBrowserNotInstalled ? PushStatus.needsHomeScreen : PushStatus.error;
    }
  }

  FirebaseOptions _options(Map<String, dynamic> c) => FirebaseOptions(
    apiKey: (!kIsWeb ? c['androidApiKey'] : null) as String? ?? c['apiKey'] as String,
    appId: (kIsWeb ? c['webAppId'] : c['androidAppId']) as String,
    messagingSenderId: c['messagingSenderId'] as String,
    projectId: c['projectId'] as String,
    authDomain: c['authDomain'] as String?,
    storageBucket: c['storageBucket'] as String?,
  );

  /// 알림 켜기. 반드시 버튼을 누른 직후에 호출해야 합니다 (아이폰 Safari 제한).
  Future<PushStatus> enable() async {
    if (_config == null) return status.value;
    final s = await FirebaseMessaging.instance.requestPermission();
    if (s.authorizationStatus == AuthorizationStatus.denied) {
      return status.value = PushStatus.denied;
    }
    if (s.authorizationStatus != AuthorizationStatus.authorized &&
        s.authorizationStatus != AuthorizationStatus.provisional) {
      return status.value = PushStatus.off;
    }
    await _register();
    await api.prefs.setBool(_enabledKey, true);
    return status.value;
  }

  Future<void> _register() async {
    // ignore: deprecated_member_use
    final token = await FirebaseMessaging.instance.getToken(
      vapidKey: kIsWeb ? _config!['vapidKey'] as String? : null,
      serviceWorkerScriptPath: kIsWeb ? 'firebase-messaging-sw.js' : null,
    );
    if (token == null) {
      status.value = PushStatus.off;
      return;
    }
    _token = token;
    await api.registerPushToken(token, kIsWeb ? 'web' : 'android');
    _refreshSub ??=
        // ignore: deprecated_member_use
        FirebaseMessaging.instance.onTokenRefresh.listen((t) async {
          _token = t;
          await api.registerPushToken(t, kIsWeb ? 'web' : 'android');
        });
    status.value = PushStatus.on;
  }

  /// 이 기기에서 알림 끄기 (로그아웃할 때도 호출)
  Future<void> disable() async {
    await api.prefs.setBool(_enabledKey, false);
    final t = _token;
    _token = null;
    if (t != null) {
      try {
        await api.unregisterPushToken(t);
      } catch (_) {}
    }
    if (status.value == PushStatus.on) status.value = PushStatus.off;
  }

  void dispose() {
    _refreshSub?.cancel();
    _messageSub?.cancel();
  }
}
