import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;

  @override
  String toString() => message;
}

class UserInfo {
  UserInfo({required this.id, required this.username, required this.displayName});

  factory UserInfo.fromJson(Map<String, dynamic> j) =>
      UserInfo(id: j['id'] as int, username: j['username'] as String, displayName: j['displayName'] as String);

  final int id;
  final String username;
  final String displayName;

  Map<String, dynamic> toJson() => {'id': id, 'username': username, 'displayName': displayName};
}

class MediaItem {
  MediaItem({
    required this.id,
    required this.kind,
    required this.contentType,
    required this.createdAt,
    required this.ownerId,
    required this.ownerName,
    this.thumbUrl,
    this.durationMs,
  });

  factory MediaItem.fromJson(Map<String, dynamic> j) {
    final owner = j['owner'] as Map<String, dynamic>;
    return MediaItem(
      id: j['id'] as String,
      kind: j['kind'] as String,
      contentType: j['contentType'] as String,
      createdAt: DateTime.fromMillisecondsSinceEpoch(j['createdAt'] as int),
      ownerId: owner['id'] as int,
      ownerName: owner['displayName'] as String,
      thumbUrl: j['thumbUrl'] as String?,
      durationMs: j['durationMs'] as int?,
    );
  }

  final String id;
  final String kind;
  final String contentType;
  final DateTime createdAt;
  final int ownerId;
  final String ownerName;
  final String? thumbUrl;
  final int? durationMs;

  bool get isVideo => kind == 'video';
}

class MediaPage {
  MediaPage(this.items, this.nextCursor);
  final List<MediaItem> items;
  final String? nextCursor;
}

class UploadTicket {
  UploadTicket(this.id, this.uploadUrl, this.thumbUploadUrl);
  final String id;
  final String uploadUrl;
  final String? thumbUploadUrl;
}

/// Worker API 클라이언트. 로그인 토큰은 기기에 저장해 두고 재사용합니다.
class Api {
  Api._(this._prefs);

  static Future<Api> create() async {
    final api = Api._(await SharedPreferences.getInstance());
    api._token = api._prefs.getString(_tokenKey);
    final userJson = api._prefs.getString(_userKey);
    if (userJson != null) api._user = UserInfo.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
    return api;
  }

  static const _tokenKey = 'auth_token';
  static const _userKey = 'auth_user';

  final SharedPreferences _prefs;
  final http.Client _http = http.Client();
  String? _token;
  UserInfo? _user;

  UserInfo? get user => _token == null ? null : _user;

  /// 로그인이 만료되면 호출됩니다 (화면을 로그인 페이지로 돌려보내는 용도).
  void Function()? onUnauthorized;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$apiBaseUrl/api$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> _send(String method, String path, {Object? body, Map<String, String>? query}) async {
    final req = http.Request(method, _uri(path, query));
    if (_token != null) req.headers['Authorization'] = 'Bearer $_token';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req));
    } catch (_) {
      throw ApiException(0, '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
    }
    Map<String, dynamic> data = {};
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {}
    if (res.statusCode >= 400) {
      if (res.statusCode == 401 && _token != null && !path.startsWith('/auth/')) {
        await _clearSession();
        onUnauthorized?.call();
      }
      throw ApiException(res.statusCode, data['error'] as String? ?? '요청에 실패했습니다. (${res.statusCode})');
    }
    return data;
  }

  Future<void> _saveSession(String token, UserInfo user) async {
    _token = token;
    _user = user;
    await _prefs.setString(_tokenKey, token);
    await _prefs.setString(_userKey, jsonEncode(user.toJson()));
  }

  Future<void> _clearSession() async {
    _token = null;
    _user = null;
    await _prefs.remove(_tokenKey);
    await _prefs.remove(_userKey);
  }

  Future<void> login(String username, String password) async {
    final d = await _send('POST', '/auth/login', body: {'username': username, 'password': password});
    await _saveSession(d['token'] as String, UserInfo.fromJson(d['user'] as Map<String, dynamic>));
  }

  Future<void> signup({
    required String inviteCode,
    required String username,
    required String displayName,
    required String password,
  }) async {
    final d = await _send(
      'POST',
      '/auth/signup',
      body: {'inviteCode': inviteCode, 'username': username, 'displayName': displayName, 'password': password},
    );
    await _saveSession(d['token'] as String, UserInfo.fromJson(d['user'] as Map<String, dynamic>));
  }

  Future<void> logout() async {
    try {
      await _send('POST', '/auth/logout');
    } catch (_) {}
    await _clearSession();
  }

  Future<void> changePassword(String current, String next) async {
    final d = await _send('POST', '/me/password', body: {'currentPassword': current, 'newPassword': next});
    await _saveSession(d['token'] as String, _user!);
  }

  Future<MediaPage> listMedia({String? cursor}) async {
    final d = await _send('GET', '/media', query: {'limit': '60', 'cursor': ?cursor});
    final items = (d['items'] as List).map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList();
    return MediaPage(items, d['nextCursor'] as String?);
  }

  Future<String> originalUrl(String id) async => (await _send('GET', '/media/$id/url'))['url'] as String;

  Future<void> deleteMedia(String id) => _send('DELETE', '/media/$id');

  Future<UploadTicket> createUpload({required String kind, required String contentType, required bool hasThumb}) async {
    final d = await _send('POST', '/media', body: {'kind': kind, 'contentType': contentType, 'hasThumb': hasThumb});
    return UploadTicket(d['id'] as String, d['uploadUrl'] as String, d['thumbUploadUrl'] as String?);
  }

  Future<MediaItem> completeUpload(String id, {int? durationMs}) async {
    final d = await _send('POST', '/media/$id/complete', body: {'durationMs': ?durationMs});
    return MediaItem.fromJson(d['item'] as Map<String, dynamic>);
  }

  /// 서명된 URL로 R2에 파일을 직접 올립니다.
  Future<void> putObject(
    String url, {
    required Stream<List<int>> data,
    required int length,
    required String contentType,
    void Function(double progress)? onProgress,
  }) async {
    final req = http.StreamedRequest('PUT', Uri.parse(url))
      ..headers['Content-Type'] = contentType
      ..contentLength = length;
    var sent = 0;
    final pipe = data.listen(
      (chunk) {
        req.sink.add(chunk);
        sent += chunk.length;
        onProgress?.call(length == 0 ? 1 : sent / length);
      },
      onDone: req.sink.close,
      onError: (Object e, StackTrace s) {
        req.sink.addError(e, s);
        req.sink.close();
      },
      cancelOnError: true,
    );
    final http.StreamedResponse res;
    try {
      res = await _http.send(req);
    } catch (_) {
      await pipe.cancel();
      throw ApiException(0, '파일 업로드 중 연결이 끊어졌습니다.');
    }
    await res.stream.drain<void>();
    if (res.statusCode >= 300) throw ApiException(res.statusCode, '파일 업로드에 실패했습니다. (${res.statusCode})');
  }
}
