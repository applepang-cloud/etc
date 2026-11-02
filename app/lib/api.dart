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

class UserRef {
  UserRef(this.id, this.displayName);

  factory UserRef.fromJson(Map<String, dynamic> j) => UserRef(j['id'] as int, j['displayName'] as String);

  final int id;
  final String displayName;
}

class MediaItem {
  MediaItem({
    required this.id,
    required this.kind,
    required this.contentType,
    this.postId,
    this.ownerId,
    this.thumbUrl,
    this.previewUrl,
    this.width,
    this.height,
    this.durationMs,
    this.postedAt,
    this.sortAt,
  });

  factory MediaItem.fromJson(Map<String, dynamic> j) => MediaItem(
    id: j['id'] as String,
    postId: j['postId'] as String?,
    ownerId: j['ownerId'] as int?,
    kind: j['kind'] as String,
    contentType: j['contentType'] as String,
    thumbUrl: j['thumbUrl'] as String?,
    previewUrl: j['previewUrl'] as String?,
    width: j['width'] as int?,
    height: j['height'] as int?,
    durationMs: j['durationMs'] as int?,
    postedAt: _date(j['postedAt']),
    sortAt: _date(j['sortAt']),
  );

  static DateTime? _date(Object? v) => v == null ? null : DateTime.fromMillisecondsSinceEpoch(v as int);

  final String id;
  final String? postId;
  final int? ownerId;
  final String kind;
  final String contentType;
  final String? thumbUrl;
  final String? previewUrl;
  final int? width;
  final int? height;
  final int? durationMs;
  final DateTime? postedAt;

  /// 앨범 정렬 기준 날짜 (찍은 날짜, 없으면 게시 날짜)
  final DateTime? sortAt;

  bool get isVideo => kind == 'video';

  /// 가로/세로 비율 (모르면 4:3)
  double get aspectRatio => (width ?? 0) > 0 && (height ?? 0) > 0 ? width! / height! : 4 / 3;
}

class Post {
  Post({
    required this.id,
    required this.body,
    required this.postedAt,
    required this.createdAt,
    required this.author,
    required this.media,
    required this.mediaCount,
    required this.likeCount,
    required this.likedByMe,
    required this.commentCount,
  });

  factory Post.fromJson(Map<String, dynamic> j) => Post(
    id: j['id'] as String,
    body: j['body'] as String,
    postedAt: DateTime.fromMillisecondsSinceEpoch(j['postedAt'] as int),
    createdAt: DateTime.fromMillisecondsSinceEpoch(j['createdAt'] as int),
    author: UserRef.fromJson(j['author'] as Map<String, dynamic>),
    media: (j['media'] as List).map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList(),
    mediaCount: j['mediaCount'] as int,
    likeCount: j['likeCount'] as int,
    likedByMe: j['likedByMe'] as bool,
    commentCount: j['commentCount'] as int,
  );

  final String id;
  String body;
  DateTime postedAt;
  final DateTime createdAt;
  final UserRef author;
  List<MediaItem> media;
  int mediaCount;
  int likeCount;
  bool likedByMe;
  int commentCount;
}

class Comment {
  Comment({required this.id, required this.body, required this.createdAt, required this.author});

  factory Comment.fromJson(Map<String, dynamic> j) => Comment(
    id: j['id'] as int,
    body: j['body'] as String,
    createdAt: DateTime.fromMillisecondsSinceEpoch(j['createdAt'] as int),
    author: UserRef.fromJson(j['author'] as Map<String, dynamic>),
  );

  final int id;
  final String body;
  final DateTime createdAt;
  final UserRef author;
}

class PostDetail {
  PostDetail(this.post, this.comments, this.likers);
  final Post post;
  final List<Comment> comments;
  final List<UserRef> likers;
}

class Child {
  Child({required this.id, required this.name, required this.birthDate});

  factory Child.fromJson(Map<String, dynamic> j) =>
      Child(id: j['id'] as int, name: j['name'] as String, birthDate: DateTime.parse(j['birthDate'] as String));

  final int id;
  final String name;
  final DateTime birthDate;
}

class FamilyInfo {
  FamilyInfo({required this.name, required this.inviteCode, required this.members, required this.children});

  factory FamilyInfo.fromJson(Map<String, dynamic> j) => FamilyInfo(
    name: j['name'] as String,
    inviteCode: j['inviteCode'] as String? ?? '',
    members: (j['members'] as List).map((e) => UserRef.fromJson(e as Map<String, dynamic>)).toList(),
    children: (j['children'] as List).map((e) => Child.fromJson(e as Map<String, dynamic>)).toList(),
  );

  final String name;
  final String inviteCode;
  final List<UserRef> members;
  final List<Child> children;
}

class Page<T> {
  Page(this.items, this.nextCursor);
  final List<T> items;
  final String? nextCursor;
}

class AlbumMonth {
  AlbumMonth(this.year, this.month, this.count, [this.cover]);
  final int year;
  final int month;
  final int count;
  final MediaItem? cover;

  String get key => '$year-${month.toString().padLeft(2, '0')}';
}

class UploadTicket {
  UploadTicket(this.id, this.uploadUrl, this.thumbUploadUrl, this.previewUploadUrl);
  final String id;
  final String uploadUrl;
  final String? thumbUploadUrl;
  final String? previewUploadUrl;
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

  SharedPreferences get prefs => _prefs;
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

  // ---------- 타임라인 / 게시물 ----------

  Future<Page<Post>> listPosts({String? cursor, DateTime? before}) async {
    final d = await _send(
      'GET',
      '/posts',
      query: {'limit': '20', 'cursor': ?cursor, if (before != null) 'before': '${before.millisecondsSinceEpoch}'},
    );
    return Page(_list(d['items'], Post.fromJson), d['nextCursor'] as String?);
  }

  Future<PostDetail> getPost(String id) async {
    final d = await _send('GET', '/posts/$id');
    return PostDetail(
      Post.fromJson(d['post'] as Map<String, dynamic>),
      _list(d['comments'], Comment.fromJson),
      _list(d['likers'], UserRef.fromJson),
    );
  }

  Future<Post> createPost({required String body, required DateTime postedAt, required List<String> mediaIds}) async {
    final d = await _send(
      'POST',
      '/posts',
      body: {'body': body, 'postedAt': postedAt.millisecondsSinceEpoch, 'mediaIds': mediaIds},
    );
    return Post.fromJson(d['post'] as Map<String, dynamic>);
  }

  Future<Post> updatePost(String id, {required String body, required DateTime postedAt}) async {
    final d = await _send('PATCH', '/posts/$id', body: {'body': body, 'postedAt': postedAt.millisecondsSinceEpoch});
    return Post.fromJson(d['post'] as Map<String, dynamic>);
  }

  Future<void> deletePost(String id) => _send('DELETE', '/posts/$id');

  /// 게시물에서 사진/영상 하나를 뺍니다. 게시물까지 지워졌으면 true.
  Future<bool> deletePostMedia(String postId, String mediaId) async =>
      (await _send('DELETE', '/posts/$postId/media/$mediaId'))['postDeleted'] == true;

  Future<void> setLike(String postId, bool liked) => _send(liked ? 'PUT' : 'DELETE', '/posts/$postId/like');

  Future<Comment> addComment(String postId, String body) async {
    final d = await _send('POST', '/posts/$postId/comments', body: {'body': body});
    return Comment.fromJson(d['comment'] as Map<String, dynamic>);
  }

  Future<void> deleteComment(String postId, int commentId) => _send('DELETE', '/posts/$postId/comments/$commentId');

  // ---------- 사진 탭 / 파일 ----------

  static String get _tz => '${DateTime.now().timeZoneOffset.inMinutes}';

  Future<List<AlbumMonth>> listMonths() async {
    final d = await _send('GET', '/media/months', query: {'tz': _tz});
    return (d['months'] as List).map((e) {
      final m = e as Map<String, dynamic>;
      final parts = (m['month'] as String).split('-');
      final cover = m['cover'] == null ? null : MediaItem.fromJson(m['cover'] as Map<String, dynamic>);
      return AlbumMonth(int.parse(parts[0]), int.parse(parts[1]), m['count'] as int, cover);
    }).toList();
  }

  Future<Page<MediaItem>> listMedia({AlbumMonth? month, String? cursor, int limit = 120}) async {
    final d = await _send(
      'GET',
      '/media',
      query: {'limit': '$limit', 'tz': _tz, if (month != null) 'month': month.key, 'cursor': ?cursor},
    );
    return Page(_list(d['items'], MediaItem.fromJson), d['nextCursor'] as String?);
  }

  Future<String> originalUrl(String id) async => (await _send('GET', '/media/$id/url'))['url'] as String;

  Future<UploadTicket> createUpload({
    required String kind,
    required String contentType,
    required bool hasThumb,
    required bool hasPreview,
  }) async {
    final d = await _send(
      'POST',
      '/media',
      body: {'kind': kind, 'contentType': contentType, 'hasThumb': hasThumb, 'hasPreview': hasPreview},
    );
    return UploadTicket(
      d['id'] as String,
      d['uploadUrl'] as String,
      d['thumbUploadUrl'] as String?,
      d['previewUploadUrl'] as String?,
    );
  }

  Future<void> completeUpload(String id, {int? width, int? height, int? durationMs, DateTime? takenAt}) => _send(
    'POST',
    '/media/$id/complete',
    body: {
      'width': ?width,
      'height': ?height,
      'durationMs': ?durationMs,
      if (takenAt != null) 'takenAt': takenAt.millisecondsSinceEpoch,
    },
  );

  // ---------- 가족 ----------

  Future<FamilyInfo> getFamily() async => FamilyInfo.fromJson(await _send('GET', '/family'));

  Future<void> setFamilyName(String name) => _send('PUT', '/family', body: {'name': name});

  Future<void> saveChild({int? id, required String name, required DateTime birthDate}) {
    final b = {'name': name, 'birthDate': birthDate.toIso8601String().substring(0, 10)};
    return id == null ? _send('POST', '/children', body: b) : _send('PATCH', '/children/$id', body: b);
  }

  Future<void> deleteChild(int id) => _send('DELETE', '/children/$id');

  // ---------- 알림 ----------

  /// 서버에 Firebase 설정이 있으면 그 값, 없으면 null
  Future<Map<String, dynamic>?> pushConfig() async {
    final d = await _send('GET', '/push/config');
    return d['enabled'] == true ? d['firebase'] as Map<String, dynamic>? : null;
  }

  Future<void> registerPushToken(String token, String platform) =>
      _send('POST', '/push/tokens', body: {'token': token, 'platform': platform});

  Future<void> unregisterPushToken(String token) => _send('DELETE', '/push/tokens', body: {'token': token});

  Future<({bool posts, bool comments, bool likes})> notifySettings() async {
    final d = await _send('GET', '/me/notifications');
    return (posts: d['posts'] == true, comments: d['comments'] == true, likes: d['likes'] == true);
  }

  Future<void> setNotifySettings({required bool posts, required bool comments, required bool likes}) =>
      _send('PUT', '/me/notifications', body: {'posts': posts, 'comments': comments, 'likes': likes});

  /// 근황 탭을 마지막으로 본 시각 (새 소식 배지용, 기기에 저장)
  DateTime get lastSeenActivity {
    final v = _prefs.getInt('last_seen_activity');
    if (v != null) return DateTime.fromMillisecondsSinceEpoch(v);
    final now = DateTime.now();
    lastSeenActivity = now;
    return now;
  }

  set lastSeenActivity(DateTime t) => _prefs.setInt('last_seen_activity', t.millisecondsSinceEpoch);

  /// 나이를 표시할 아이 (기기에 저장)
  int? get selectedChildId => _prefs.getInt('selected_child');
  set selectedChildId(int? id) => id == null ? _prefs.remove('selected_child') : _prefs.setInt('selected_child', id);

  static List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) f) =>
      (v as List).map((e) => f(e as Map<String, dynamic>)).toList();

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
