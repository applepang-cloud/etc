import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

bool get _isIos {
  final ua = web.window.navigator.userAgent;
  // 아이패드 Safari는 맥으로 표시되므로 터치 지원 여부로 구분합니다.
  return RegExp('iPhone|iPad|iPod').hasMatch(ua) ||
      (ua.contains('Macintosh') && web.window.navigator.maxTouchPoints > 1);
}

bool get _standalone {
  final nav = web.window.navigator as JSObject;
  final legacy = nav.getProperty<JSAny?>('standalone'.toJS);
  return web.window.matchMedia('(display-mode: standalone)').matches || (legacy?.dartify() == true);
}

/// 아이폰 Safari에서 "홈 화면에 추가"하지 않고 열었는지
bool get isIosBrowserNotInstalled => _isIos && !_standalone;

/// 브라우저가 웹 푸시를 지원하는지
bool get browserSupportsPush =>
    web.window.has('Notification') && web.window.navigator.has('serviceWorker') && web.window.has('PushManager');
