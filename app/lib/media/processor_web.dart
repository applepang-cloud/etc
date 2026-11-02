import 'dart:async';
import 'dart:js_interop';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';
import 'package:web/web.dart' as web;

import 'prepared.dart';

/// 웹(아이폰 Safari 등): 브라우저 기능으로 썸네일만 만들고 원본을 그대로 올립니다.
/// 아이폰 Safari는 사진을 고를 때 HEIC를 JPEG로 자동 변환해 줍니다.
Future<PreparedMedia?> prepareMedia(XFile file, StatusCallback onStatus) async {
  final type = detectType(file.name, file.mimeType);
  if (type == null) return null;

  Uint8List? thumb;
  Uint8List? preview;
  int? durationMs;
  try {
    final r = type.kind == 'photo' ? await _photoFrames(file.path) : await _videoFrames(file.path);
    thumb = r.thumb;
    preview = r.preview;
    durationMs = r.durationMs;
  } catch (_) {
    // 썸네일을 못 만들어도 업로드는 계속합니다 (목록에 아이콘으로 표시).
  }

  return PreparedMedia(
    kind: type.kind,
    contentType: type.contentType,
    length: await file.length(),
    openRead: file.openRead,
    thumbnail: thumb,
    preview: preview,
    durationMs: durationMs,
  );
}

typedef _Frames = ({Uint8List? thumb, Uint8List? preview, int? durationMs});

Future<_Frames> _photoFrames(String src) async {
  final img = web.HTMLImageElement()..src = src;
  await img.decode().toDart.timeout(const Duration(seconds: 20));
  final w = img.naturalWidth;
  final h = img.naturalHeight;
  return (
    thumb: await _drawJpeg(img, w, h, thumbShortSide, 0.75),
    preview: await _drawJpeg(img, w, h, previewShortSide, 0.82),
    durationMs: null,
  );
}

Future<_Frames> _videoFrames(String src) async {
  final video = web.HTMLVideoElement()
    ..muted = true
    ..preload = 'auto'
    ..playsInline = true
    ..src = src;
  const timeout = Duration(seconds: 10);
  final metadata = web.EventStreamProviders.loadedMetadataEvent.forTarget(video).first;
  video.load();
  await metadata.timeout(timeout);

  final duration = video.duration;
  final durationMs = duration.isFinite ? (duration * 1000).round() : null;

  final seeked = web.EventStreamProviders.seekedEvent.forTarget(video).first;
  video.currentTime = duration.isFinite ? math.min(0.5, duration / 2) : 0;
  await seeked.timeout(timeout);

  final w = video.videoWidth;
  final h = video.videoHeight;
  final frames = (
    thumb: await _drawJpeg(video, w, h, thumbShortSide, 0.75),
    preview: await _drawJpeg(video, w, h, previewShortSide, 0.82),
    durationMs: durationMs,
  );
  video
    ..removeAttribute('src')
    ..load();
  return frames;
}

Future<Uint8List?> _drawJpeg(web.CanvasImageSource source, int w, int h, int shortSide, double quality) async {
  if (w == 0 || h == 0) return null;
  final scale = math.min(1.0, math.min(shortSide / math.min(w, h), previewMaxLongSide / math.max(w, h)));
  final cw = (w * scale).round();
  final ch = (h * scale).round();
  final canvas = web.HTMLCanvasElement()
    ..width = cw
    ..height = ch;
  final ctx = canvas.getContext('2d') as web.CanvasRenderingContext2D;
  ctx.drawImage(source, 0, 0, cw, ch);

  final completer = Completer<web.Blob?>();
  canvas.toBlob(((web.Blob? b) => completer.complete(b)).toJS, 'image/jpeg', quality.toJS);
  final blob = await completer.future;
  if (blob == null) return null;
  final buffer = await blob.arrayBuffer().toDart;
  return buffer.toDart.asUint8List();
}
