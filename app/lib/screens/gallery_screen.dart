import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../format.dart';
import '../upload_service.dart';
import 'thumb.dart';
import 'viewer_screen.dart';

class GalleryScreen extends StatefulWidget {
  const GalleryScreen({super.key, required this.api, required this.onLoggedOut});

  final Api api;
  final VoidCallback onLoggedOut;

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  late final _uploads = UploadService(widget.api);
  final _scroll = ScrollController();
  final _items = <MediaItem>[];
  String? _cursor;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 800) _loadMore();
    });
    _reload();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _cursor = null;
    _hasMore = true;
    await _loadMore(reset: true);
  }

  Future<void> _loadMore({bool reset = false}) async {
    if (_loading || (!_hasMore && !reset)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await widget.api.listMedia(cursor: reset ? null : _cursor);
      setState(() {
        if (reset) _items.clear();
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _hasMore = page.nextCursor != null;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickAndUpload() async {
    if (_uploads.state.value.active) return;
    final files = await ImagePicker().pickMultipleMedia();
    if (files.isEmpty) return;
    await _uploads.uploadAll(
      files,
      onUploaded: (item) {
        if (mounted) setState(() => _items.insert(0, item));
      },
    );
    if (!mounted) return;
    final s = _uploads.state.value;
    final messenger = ScaffoldMessenger.of(context);
    if (s.failed == 0) {
      messenger.showSnackBar(SnackBar(content: Text('${s.total}개를 올렸습니다.')));
    } else {
      messenger.showSnackBar(
        SnackBar(
          content: Text('${s.total - s.failed}개 성공, ${s.failed}개 실패'),
          duration: const Duration(seconds: 6),
          action: SnackBarAction(label: '자세히', onPressed: _showUploadErrors),
        ),
      );
    }
  }

  void _showUploadErrors() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('업로드 실패'),
        content: SingleChildScrollView(child: Text(_uploads.errors.join('\n\n'))),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('닫기'))],
      ),
    );
  }

  Future<void> _open(MediaItem item) async {
    final deleted = await Navigator.of(context).push<Set<String>>(
      MaterialPageRoute(
        builder: (_) => ViewerScreen(api: widget.api, items: List.of(_items), initialIndex: _items.indexOf(item)),
      ),
    );
    if (deleted != null && deleted.isNotEmpty) {
      setState(() => _items.removeWhere((i) => deleted.contains(i.id)));
    }
  }

  Future<void> _logout() async {
    await widget.api.logout();
    widget.onLoggedOut();
  }

  Future<void> _changePassword() async {
    final current = TextEditingController();
    final next = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('비밀번호 변경'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: current,
              obscureText: true,
              decoration: const InputDecoration(labelText: '현재 비밀번호'),
            ),
            TextField(
              controller: next,
              obscureText: true,
              decoration: const InputDecoration(labelText: '새 비밀번호 (8자 이상)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('변경')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.changePassword(current.text, next.text);
      messenger.showSnackBar(const SnackBar(content: Text('비밀번호를 변경했습니다. 다른 기기에서는 다시 로그인해야 합니다.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  /// 날짜별로 묶어서 보여줍니다.
  List<Widget> _buildSections() {
    final slivers = <Widget>[];
    var start = 0;
    while (start < _items.length) {
      final day = _items[start].createdAt;
      var end = start;
      while (end < _items.length && DateUtils.isSameDay(_items[end].createdAt, day)) {
        end++;
      }
      final group = _items.sublist(start, end);
      slivers
        ..add(
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
              child: Text(formatDay(day), style: Theme.of(context).textTheme.titleSmall),
            ),
          ),
        )
        ..add(
          SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 160,
              mainAxisSpacing: 2,
              crossAxisSpacing: 2,
            ),
            itemCount: group.length,
            itemBuilder: (_, i) => MediaThumb(item: group[i], onTap: () => _open(group[i])),
          ),
        );
      start = end;
    }
    return slivers;
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.api.user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('우리 가족 앨범'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.account_circle_outlined),
            onSelected: (v) => v == 'logout' ? _logout() : _changePassword(),
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Text('${user?.displayName ?? ''} (${user?.username ?? ''})')),
              const PopupMenuItem(value: 'password', child: Text('비밀번호 변경')),
              const PopupMenuItem(value: 'logout', child: Text('로그아웃')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: CustomScrollView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            ..._buildSections(),
            SliverToBoxAdapter(child: _footer()),
          ],
        ),
      ),
      bottomNavigationBar: ValueListenableBuilder(
        valueListenable: _uploads.state,
        builder: (context, s, _) => s.active ? _UploadBar(state: s) : const SizedBox.shrink(),
      ),
      floatingActionButton: ValueListenableBuilder(
        valueListenable: _uploads.state,
        builder: (context, s, _) => FloatingActionButton.extended(
          onPressed: s.active ? null : _pickAndUpload,
          icon: const Icon(Icons.add_photo_alternate_outlined),
          label: const Text('올리기'),
        ),
      ),
    );
  }

  Widget _footer() {
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Text(_error!, textAlign: TextAlign.center),
            TextButton(onPressed: _items.isEmpty ? _reload : _loadMore, child: const Text('다시 시도')),
          ],
        ),
      );
    }
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_items.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 120, horizontal: 24),
        child: Text('아직 올린 사진이 없어요.\n아래 [올리기] 버튼으로 첫 사진을 올려보세요!', textAlign: TextAlign.center),
      );
    }
    return const SizedBox(height: 96);
  }
}

class _UploadBar extends StatelessWidget {
  const _UploadBar({required this.state});

  final UploadState state;

  @override
  Widget build(BuildContext context) {
    final percent = state.progress == null ? '' : ' ${(state.progress! * 100).round()}%';
    return SafeArea(
      child: Material(
        color: Theme.of(context).colorScheme.surfaceContainer,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${state.done + 1} / ${state.total}  ${state.status}$percent'),
              const SizedBox(height: 6),
              LinearProgressIndicator(value: state.progress),
              const SizedBox(height: 4),
              Text('업로드가 끝날 때까지 앱을 닫지 마세요.', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}
