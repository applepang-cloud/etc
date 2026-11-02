import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'media/prepared.dart';
import 'media/processor.dart';

class UploadState {
  const UploadState({this.total = 0, this.done = 0, this.status = '', this.progress, this.failed = 0});

  final int total;
  final int done;
  final String status;
  final double? progress;
  final int failed;

  bool get active => done < total;
}

/// 고른 파일들을 하나씩 처리합니다: 압축/썸네일 → 업로드 URL 발급 → R2 업로드 → 완료 처리.
class UploadService {
  UploadService(this.api);

  final Api api;
  final state = ValueNotifier(const UploadState());
  final errors = <String>[];

  Future<List<MediaItem>> uploadAll(List<XFile> files, {void Function(MediaItem item)? onUploaded}) async {
    errors.clear();
    final uploaded = <MediaItem>[];
    var failed = 0;
    for (var i = 0; i < files.length; i++) {
      void report(String status, double? progress) =>
          state.value = UploadState(total: files.length, done: i, status: status, progress: progress, failed: failed);

      try {
        final item = await _uploadOne(files[i], report);
        uploaded.add(item);
        onUploaded?.call(item);
      } catch (e) {
        failed++;
        errors.add('${files[i].name}: $e');
      }
    }
    state.value = UploadState(total: files.length, done: files.length, failed: failed);
    return uploaded;
  }

  Future<MediaItem> _uploadOne(XFile file, StatusCallback report) async {
    report('준비 중', null);
    final prepared = await prepareMedia(file, report);
    if (prepared == null) throw '지원하지 않는 파일 형식입니다.';
    try {
      final ticket = await api.createUpload(
        kind: prepared.kind,
        contentType: prepared.contentType,
        hasThumb: prepared.thumbnail != null,
      );
      if (ticket.thumbUploadUrl != null && prepared.thumbnail != null) {
        await api.putObject(
          ticket.thumbUploadUrl!,
          data: Stream.value(prepared.thumbnail!),
          length: prepared.thumbnail!.length,
          contentType: 'image/jpeg',
        );
      }
      report('업로드 중', 0);
      await api.putObject(
        ticket.uploadUrl,
        data: prepared.openRead(),
        length: prepared.length,
        contentType: prepared.contentType,
        onProgress: (p) => report('업로드 중', p),
      );
      return await api.completeUpload(ticket.id, durationMs: prepared.durationMs);
    } finally {
      await prepared.cleanup?.call();
    }
  }
}
