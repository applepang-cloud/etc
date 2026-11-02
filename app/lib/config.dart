/// Worker API 주소.
///
/// - 웹(아이폰용): 비워 두면 웹앱이 열린 주소를 그대로 사용합니다.
/// - 안드로이드 APK: 빌드할 때 반드시 지정해야 합니다.
///   flutter build apk --dart-define=API_BASE_URL=https://family-photos.<계정>.workers.dev
const String _apiBaseUrl = String.fromEnvironment('API_BASE_URL');

String get apiBaseUrl {
  if (_apiBaseUrl.isNotEmpty) return _apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
  return Uri.base.origin;
}
