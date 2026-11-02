import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:video_compress/video_compress.dart';

import 'prepared.dart';

/// 안드로이드: 사진은 썸네일 생성, 영상은 1080p로 압축한 뒤 썸네일을 만듭니다.
Future<PreparedMedia?> prepareMedia(XFile file, StatusCallback onStatus) async {
  final type = detectType(file.name, file.mimeType);
  if (type == null) return null;
  return type.kind == 'photo' ? _preparePhoto(file, type.contentType) : _prepareVideo(file, onStatus);
}

Future<PreparedMedia> _preparePhoto(XFile file, String contentType) async {
  final thumb = await FlutterImageCompress.compressWithFile(
    file.path,
    minWidth: thumbShortSide,
    minHeight: thumbShortSide,
    quality: 75,
  );
  final preview = await FlutterImageCompress.compressWithFile(
    file.path,
    minWidth: previewShortSide,
    minHeight: previewShortSide,
    quality: 82,
  );

  // HEIC는 안드로이드/웹 브라우저에서 안 보일 수 있어 JPEG로 바꿔서 올립니다 (크기는 그대로).
  if (contentType == 'image/heic' || contentType == 'image/heif') {
    final jpeg = await FlutterImageCompress.compressWithFile(
      file.path,
      minWidth: 100000, // 원본보다 크게 주면 축소하지 않습니다.
      minHeight: 100000,
      quality: 90,
      keepExif: true,
    );
    if (jpeg != null) {
      return PreparedMedia(
        kind: 'photo',
        contentType: 'image/jpeg',
        length: jpeg.length,
        openRead: () => Stream.value(jpeg),
        thumbnail: thumb,
        preview: preview,
      );
    }
  }

  return PreparedMedia(
    kind: 'photo',
    contentType: contentType,
    length: await file.length(),
    openRead: file.openRead,
    thumbnail: thumb,
    preview: preview,
  );
}

Future<PreparedMedia> _prepareVideo(XFile file, StatusCallback onStatus) async {
  onStatus('영상 압축 중', 0);
  final sub = VideoCompress.compressProgress$.subscribe((p) => onStatus('영상 압축 중', p / 100));
  MediaInfo? info;
  try {
    info = await VideoCompress.compressVideo(file.path, quality: VideoQuality.Res1920x1080Quality, includeAudio: true);
  } finally {
    sub.unsubscribe();
  }

  final originalSize = await file.length();
  final compressed = info?.file;
  final useCompressed = compressed != null && await compressed.length() < originalSize;
  final path = useCompressed ? compressed.path : file.path;
  final contentType = useCompressed ? 'video/mp4' : detectType(file.name, file.mimeType)!.contentType;

  var duration = info?.duration;
  if (duration == null) {
    try {
      duration = (await VideoCompress.getMediaInfo(file.path)).duration;
    } catch (_) {}
  }

  final frame = await VideoCompress.getByteThumbnail(path, quality: 80);
  final thumb = frame == null
      ? null
      : await FlutterImageCompress.compressWithList(
          frame,
          minWidth: thumbShortSide,
          minHeight: thumbShortSide,
          quality: 75,
        );
  final preview = frame == null
      ? null
      : await FlutterImageCompress.compressWithList(
          frame,
          minWidth: previewShortSide,
          minHeight: previewShortSide,
          quality: 82,
        );

  final source = File(path);
  return PreparedMedia(
    kind: 'video',
    contentType: contentType,
    length: await source.length(),
    openRead: source.openRead,
    thumbnail: thumb,
    preview: preview,
    durationMs: duration?.round(),
    cleanup: () async {
      await VideoCompress.deleteAllCache();
    },
  );
}
