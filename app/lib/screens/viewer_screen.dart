import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../api.dart';
import '../app_scope.dart';
import '../format.dart';
import 'post_detail_screen.dart';
import 'widgets.dart';

/// 사진/영상을 크게 보는 화면. 좌우로 넘기면 다음 항목을 봅니다.
/// 무언가를 삭제했으면 true 를 돌려줍니다.
class ViewerScreen extends StatefulWidget {
  const ViewerScreen({
    super.key,
    required this.scope,
    required this.items,
    required this.initialIndex,
    this.fromPost = false,
  });

  final AppScope scope;
  final List<MediaItem> items;
  final int initialIndex;

  /// 소식 화면에서 열었으면 "소식 보기" 버튼을 숨깁니다.
  final bool fromPost;

  @override
  State<ViewerScreen> createState() => _ViewerScreenState();
}

class _ViewerScreenState extends State<ViewerScreen> {
  late final PageController _pages = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  bool _changed = false;

  MediaItem get _current => widget.items[_index];

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    final item = _current;
    if (!await confirm(context, '삭제할까요?', '가족 모두의 앨범에서 사라지고 되돌릴 수 없습니다.', ok: '삭제')) return;
    if (!mounted) return;
    final navigator = Navigator.of(context);
    try {
      await widget.scope.api.deletePostMedia(item.postId!, item.id);
      _changed = true;
      setState(() => widget.items.removeAt(_index));
      if (widget.items.isEmpty) {
        navigator.pop(true);
      } else if (_index >= widget.items.length) {
        setState(() => _index = widget.items.length - 1);
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _openPost() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PostDetailScreen(scope: widget.scope, postId: _current.postId!),
      ),
    );
    if (changed == true && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final item = _current;
    final isMine = item.ownerId != null && item.ownerId == widget.scope.myId;
    final date = item.sortAt ?? item.postedAt;
    final kid = widget.scope.child;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: date == null
              ? null
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(formatDay(date), style: const TextStyle(fontSize: 16)),
                    if (kid != null)
                      Text(
                        '${kid.name} ${ageLong(kid.birthDate, date)}',
                        style: const TextStyle(fontSize: 12, color: Colors.white70),
                      ),
                  ],
                ),
          actions: [
            if (!widget.fromPost && item.postId != null)
              IconButton(onPressed: _openPost, icon: const Icon(Icons.chat_bubble_outline_rounded), tooltip: '소식 · 댓글'),
            if (isMine && item.postId != null)
              IconButton(onPressed: _delete, icon: const Icon(Icons.delete_outline), tooltip: '삭제'),
          ],
        ),
        body: PageView.builder(
          controller: _pages,
          itemCount: widget.items.length,
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (_, i) {
            final it = widget.items[i];
            return it.isVideo
                ? _VideoPage(key: ValueKey(it.id), api: widget.scope.api, item: it, active: i == _index)
                : _PhotoPage(key: ValueKey(it.id), api: widget.scope.api, item: it);
          },
        ),
      ),
    );
  }
}

class _PhotoPage extends StatefulWidget {
  const _PhotoPage({super.key, required this.api, required this.item});

  final Api api;
  final MediaItem item;

  @override
  State<_PhotoPage> createState() => _PhotoPageState();
}

class _PhotoPageState extends State<_PhotoPage> {
  late final Future<String> _url = widget.api.originalUrl(widget.item.id);

  @override
  Widget build(BuildContext context) {
    final previewUrl = widget.item.previewUrl;
    final thumb = previewUrl == null
        ? const Center(child: CircularProgressIndicator())
        : NetImage(url: previewUrl, cacheKey: 'p_${widget.item.id}', fit: BoxFit.contain);
    return FutureBuilder(
      future: _url,
      builder: (context, snap) {
        if (snap.hasError) return _ErrorText('${snap.error}');
        if (!snap.hasData) return thumb;
        return InteractiveViewer(
          maxScale: 5,
          child: Center(
            child: CachedNetworkImage(
              imageUrl: snap.data!,
              cacheKey: 'orig_${widget.item.id}',
              fit: BoxFit.contain,
              placeholder: (_, _) => thumb,
              errorWidget: (_, _, _) => const _ErrorText('사진을 불러오지 못했습니다.'),
            ),
          ),
        );
      },
    );
  }
}

class _VideoPage extends StatefulWidget {
  const _VideoPage({super.key, required this.api, required this.item, required this.active});

  final Api api;
  final MediaItem item;
  final bool active;

  @override
  State<_VideoPage> createState() => _VideoPageState();
}

class _VideoPageState extends State<_VideoPage> {
  VideoPlayerController? _controller;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      final url = await widget.api.originalUrl(widget.item.id);
      final c = VideoPlayerController.networkUrl(Uri.parse(url));
      await c.initialize();
      if (!mounted) {
        await c.dispose();
        return;
      }
      c.addListener(() => setState(() {}));
      setState(() => _controller = c);
    } catch (e) {
      if (mounted) setState(() => _error = '영상을 재생할 수 없습니다.\n(이 기기에서 지원하지 않는 형식일 수 있습니다)');
    }
  }

  @override
  void didUpdateWidget(_VideoPage old) {
    super.didUpdateWidget(old);
    if (!widget.active) _controller?.pause();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return _ErrorText(_error!);
    final c = _controller;
    if (c == null) return const Center(child: CircularProgressIndicator());
    final playing = c.value.isPlaying;
    return GestureDetector(
      onTap: () => playing ? c.pause() : c.play(),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Center(
            child: AspectRatio(aspectRatio: c.value.aspectRatio, child: VideoPlayer(c)),
          ),
          if (!playing)
            const DecoratedBox(
              decoration: BoxDecoration(color: Colors.black45, shape: BoxShape.circle),
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Icon(Icons.play_arrow_rounded, size: 56, color: Colors.white),
              ),
            ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: SafeArea(
              child: Row(
                children: [
                  Text(formatDuration(c.value.position.inMilliseconds), style: const TextStyle(color: Colors.white)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: VideoProgressIndicator(
                      c,
                      allowScrubbing: true,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(formatDuration(c.value.duration.inMilliseconds), style: const TextStyle(color: Colors.white)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white70),
      ),
    ),
  );
}
