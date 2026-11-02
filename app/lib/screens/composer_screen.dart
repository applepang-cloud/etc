import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../app_scope.dart';
import '../format.dart';
import '../media/local_image.dart';
import '../media/prepared.dart';
import '../upload_service.dart';
import 'widgets.dart';

/// 사진·동영상 올리기 (한마디, 날짜 선택). [editing] 이 있으면 글/날짜만 수정합니다.
class ComposerScreen extends StatefulWidget {
  const ComposerScreen({super.key, required this.scope, this.initialFiles = const [], this.editing});

  final AppScope scope;
  final List<XFile> initialFiles;
  final Post? editing;

  @override
  State<ComposerScreen> createState() => _ComposerScreenState();
}

class _ComposerScreenState extends State<ComposerScreen> {
  late final _uploads = UploadService(widget.scope.api);
  late final _jobs = [for (final f in widget.initialFiles) UploadJob(f)];
  late final _body = TextEditingController(text: widget.editing?.body ?? '');
  late DateTime _date = widget.editing?.postedAt ?? DateTime.now();
  bool _busy = false;

  bool get _isEdit => widget.editing != null;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _addMore() async {
    final files = await ImagePicker().pickMultipleMedia();
    if (files.isNotEmpty) setState(() => _jobs.addAll(files.map(UploadJob.new)));
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _date.isAfter(now) ? now : _date,
      firstDate: DateTime(1990),
      lastDate: now,
      helpText: '날짜 선택',
    );
    if (d != null) setState(() => _date = DateTime(d.year, d.month, d.day, _date.hour, _date.minute));
  }

  Future<void> _submit() async {
    final api = widget.scope.api;
    final nav = Navigator.of(context);
    final body = _body.text.trim();
    if (_isEdit) {
      setState(() => _busy = true);
      try {
        await api.updatePost(widget.editing!.id, body: body, postedAt: _date);
        nav.pop(true);
      } on ApiException catch (e) {
        if (mounted) toast(context, e.message);
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      return;
    }
    if (_jobs.isEmpty && body.isEmpty) {
      toast(context, '사진이나 한마디를 넣어 주세요.');
      return;
    }

    setState(() => _busy = true);
    try {
      while (true) {
        await _uploads.run(_jobs);
        if (!mounted) return;
        final failed = _jobs.where((j) => !j.done).toList();
        if (failed.isEmpty) break;
        setState(() {});
        final choice = await _askOnFailure(failed);
        if (choice == 'retry') continue;
        if (choice != 'skip') return;
        setState(() => _jobs.removeWhere((j) => !j.done));
        break;
      }
      if (_jobs.isEmpty && body.isEmpty) return;
      await api.createPost(body: body, postedAt: _date, mediaIds: [for (final j in _jobs) j.mediaId!]);
      nav.pop(true);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _askOnFailure(List<UploadJob> failed) => showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('${failed.length}개를 올리지 못했어요'),
      content: SingleChildScrollView(child: Text(failed.map((j) => '• ${j.file.name}\n  ${j.error}').join('\n'))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('취소')),
        TextButton(onPressed: () => Navigator.pop(ctx, 'skip'), child: const Text('빼고 올리기')),
        FilledButton(onPressed: () => Navigator.pop(ctx, 'retry'), child: const Text('다시 시도')),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final kid = widget.scope.child;
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(
          title: Text(_isEdit ? '소식 수정' : '사진·동영상 추가'),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: FilledButton(onPressed: _busy ? null : _submit, child: Text(_isEdit ? '저장' : '올리기')),
            ),
          ],
        ),
        body: Column(
          children: [
            ValueListenableBuilder(
              valueListenable: _uploads.state,
              builder: (_, s, _) => s == null ? const SizedBox.shrink() : _ProgressBar(state: s),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  InkWell(
                    onTap: _busy ? null : _pickDate,
                    borderRadius: BorderRadius.circular(12),
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: '날짜',
                        border: const OutlineInputBorder(),
                        suffixIcon: const Icon(Icons.calendar_month_outlined),
                        helperText: kid != null ? '${kid.name} ${ageLong(kid.birthDate, _date)}' : null,
                      ),
                      child: Text(formatDay(_date)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _body,
                    enabled: !_busy,
                    minLines: 3,
                    maxLines: 8,
                    maxLength: 2000,
                    decoration: const InputDecoration(
                      labelText: '가족에게 한마디 (선택)',
                      alignLabelWithHint: true,
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (!_isEdit) ...[
                    const SizedBox(height: 8),
                    Text(
                      '사진은 찍은 날짜로 앨범에 정리돼요. 위 날짜는 근황에 표시됩니다.',
                      style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 16),
                    ValueListenableBuilder(
                      valueListenable: _uploads.state,
                      builder: (_, s, _) => GridView.count(
                        crossAxisCount: 3,
                        mainAxisSpacing: 4,
                        crossAxisSpacing: 4,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        children: [
                          for (var i = 0; i < _jobs.length; i++)
                            _JobTile(
                              job: _jobs[i],
                              active: s != null && s.index == i,
                              onRemove: _busy ? null : () => setState(() => _jobs.removeAt(i)),
                            ),
                          if (!_busy)
                            InkWell(
                              onTap: _addMore,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  border: Border.all(color: scheme.outlineVariant),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(Icons.add_photo_alternate_outlined, color: scheme.primary, size: 32),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.state});

  final UploadState state;

  @override
  Widget build(BuildContext context) {
    final percent = state.progress == null ? '' : ' ${(state.progress! * 100).round()}%';
    return Material(
      color: Theme.of(context).colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${state.index + 1} / ${state.total}  ${state.status}$percent'),
            const SizedBox(height: 6),
            LinearProgressIndicator(value: state.progress),
            const SizedBox(height: 4),
            Text('끝날 때까지 화면을 닫지 마세요.', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _JobTile extends StatelessWidget {
  const _JobTile({required this.job, required this.active, required this.onRemove});

  final UploadJob job;
  final bool active;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final isVideo = detectType(job.file.name, job.file.mimeType)?.kind == 'video';
    final scheme = Theme.of(context).colorScheme;
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (isVideo)
            ColoredBox(color: scheme.surfaceContainerHighest, child: const Icon(Icons.movie_outlined, size: 36))
          else
            localImage(job.file.path),
          if (active)
            const ColoredBox(
              color: Colors.black38,
              child: Center(child: CircularProgressIndicator()),
            ),
          if (job.done)
            const Positioned(right: 6, bottom: 6, child: Icon(Icons.check_circle, color: Colors.lightGreenAccent)),
          if (job.error != null)
            const Positioned(right: 6, bottom: 6, child: Icon(Icons.error, color: Colors.redAccent)),
          if (onRemove != null && !job.done)
            Positioned(
              right: 2,
              top: 2,
              child: IconButton.filledTonal(
                visualDensity: VisualDensity.compact,
                iconSize: 16,
                onPressed: onRemove,
                icon: const Icon(Icons.close),
              ),
            ),
        ],
      ),
    );
  }
}
