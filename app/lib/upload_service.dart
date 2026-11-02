import 'dart:typed_data';

import 'package:exif/exif.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'media/prepared.dart';
import 'media/processor.dart';

/// 업로드할 파일 하나. 성공하면 [mediaId] 가 채워져서, 다시 시도할 때 건너뜁니다.
class UploadJob {
  UploadJob(this.file);

  final XFile file;
  String? mediaId;
  String? error;

  bool get done => mediaId != null;
}

class UploadState {
  const UploadState({this.total = 0, this.index = 0, this.status = '', this.progress});

  final int total;
  final int index;
  final String status;
  final double? progress;
}

/// 파일마다: 압축/썸네일 → 업로드 URL 발급 → R2 업로드 → 완료 처리.
class UploadService {
  UploadService(this.api);

  final Api api;
  final state = ValueNotifier<UploadState?>(null);

  /// 모든 파일을 처리합니다. 실패한 파일은 [UploadJob.error] 에 이유가 남습니다.
  Future<void> run(List<UploadJob> jobs) async {
    try {
      for (var i = 0; i < jobs.length; i++) {
        final job = jobs[i];
        if (job.done) continue;
        void report(String status, double? progress) =>
            state.value = UploadState(total: jobs.length, index: i, status: status, progress: progress);
        try {
          job.error = null;
          job.mediaId = await _uploadOne(job.file, report);
        } catch (e) {
          job.error = e.toString();
        }
      }
    } finally {
      state.value = null;
    }
  }

  Future<String> _uploadOne(XFile file, StatusCallback report) async {
    report('준비 중', null);
    final prepared = await prepareMedia(file, report);
    if (prepared == null) throw '지원하지 않는 파일 형식입니다.';
    try {
      final takenAt = prepared.kind == 'photo' ? await _readTakenAt(file) : null;
      final size = await _imageSize(prepared.preview ?? prepared.thumbnail);
      final ticket = await api.createUpload(
        kind: prepared.kind,
        contentType: prepared.contentType,
        hasThumb: prepared.thumbnail != null,
        hasPreview: prepared.preview != null,
      );
      for (final (url, bytes) in [
        (ticket.thumbUploadUrl, prepared.thumbnail),
        (ticket.previewUploadUrl, prepared.preview),
      ]) {
        if (url != null && bytes != null) {
          await api.putObject(url, data: Stream.value(bytes), length: bytes.length, contentType: 'image/jpeg');
        }
      }
      report('업로드 중', 0);
      await api.putObject(
        ticket.uploadUrl,
        data: prepared.openRead(),
        length: prepared.length,
        contentType: prepared.contentType,
        onProgress: (p) => report('업로드 중', p),
      );
      await api.completeUpload(
        ticket.id,
        width: size?.$1,
        height: size?.$2,
        durationMs: prepared.durationMs,
        takenAt: takenAt,
      );
      return ticket.id;
    } finally {
      await prepared.cleanup?.call();
    }
  }
}

/// 미리보기 이미지 크기 (가로/세로 비율 계산용)
Future<(int, int)?> _imageSize(Uint8List? bytes) async {
  if (bytes == null) return null;
  try {
    final img = await decodeImageFromList(bytes);
    final size = (img.width, img.height);
    img.dispose();
    return size;
  } catch (_) {
    return null;
  }
}

/// 사진 정보(EXIF)에서 찍은 시각을 읽습니다. 앞부분 512KB만 읽어서 빠르게 처리합니다.
Future<DateTime?> _readTakenAt(XFile file) async {
  try {
    final builder = BytesBuilder(copy: false);
    await for (final chunk in file.openRead(0, 512 * 1024)) {
      builder.add(chunk);
    }
    final tags = await readExifFromBytes(builder.takeBytes());
    final raw = (tags['EXIF DateTimeOriginal'] ?? tags['Image DateTime'])?.printable ?? '';
    final m = RegExp(r'(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})').firstMatch(raw);
    if (m == null) return null;
    final v = [for (var i = 1; i <= 6; i++) int.parse(m.group(i)!)];
    final d = DateTime(v[0], v[1], v[2], v[3], v[4], v[5]);
    return d.year < 1990 || d.isAfter(DateTime.now().add(const Duration(days: 1))) ? null : d;
  } catch (_) {
    return null;
  }
}
