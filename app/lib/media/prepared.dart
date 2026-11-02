import 'dart:typed_data';

/// 업로드할 준비가 끝난 파일 (압축/썸네일 생성 완료).
class PreparedMedia {
  PreparedMedia({
    required this.kind,
    required this.contentType,
    required this.length,
    required this.openRead,
    this.thumbnail,
    this.durationMs,
    this.cleanup,
  });

  final String kind; // 'photo' | 'video'
  final String contentType;
  final int length;
  final Stream<List<int>> Function() openRead;
  final Uint8List? thumbnail; // JPEG
  final int? durationMs;
  final Future<void> Function()? cleanup;
}

typedef StatusCallback = void Function(String status, double? progress);

const _photoTypes = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'heic': 'image/heic',
  'heif': 'image/heif',
};
const _videoTypes = {'mp4': 'video/mp4', 'm4v': 'video/mp4', 'mov': 'video/quicktime', 'webm': 'video/webm'};

/// 파일 이름/MIME 타입으로 사진인지 영상인지 판단합니다. 지원하지 않으면 null.
({String kind, String contentType})? detectType(String name, String? mimeType) {
  final mime = mimeType?.toLowerCase();
  if (mime != null) {
    if (_photoTypes.containsValue(mime)) return (kind: 'photo', contentType: mime);
    if (_videoTypes.containsValue(mime)) return (kind: 'video', contentType: mime);
  }
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  if (_photoTypes[ext] case final t?) return (kind: 'photo', contentType: t);
  if (_videoTypes[ext] case final t?) return (kind: 'video', contentType: t);
  return null;
}
