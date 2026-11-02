import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../api.dart';
import '../format.dart';

/// 사진/영상을 크게 보는 화면. 좌우로 넘기면 다음 항목을 봅니다.
/// 닫을 때 삭제한 항목 id 목록을 돌려줍니다.
class ViewerScreen extends StatefulWidget {
  const ViewerScreen({super.key, required this.api, required this.items, required this.initialIndex});

  final Api api;
  final List<MediaItem> items;
  final int initialIndex;

  @override
  State<ViewerScreen> createState() => _ViewerScreenState();
}

class _ViewerScreenState extends State<ViewerScreen> {
  late final PageController _pages = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  final _deleted = <String>{};

  MediaItem get _current => widget.items[_index];

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    final item = _current;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('삭제할까요?'),
        content: const Text('삭제하면 가족 모두의 앨범에서 사라지고 되돌릴 수 없습니다.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('삭제')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.deleteMedia(item.id);
      _deleted.add(item.id);
      setState(() => widget.items.removeAt(_index));
      if (widget.items.isEmpty) {
        navigator.pop(_deleted);
      } else if (_index >= widget.items.length) {
        setState(() => _index = widget.items.length - 1);
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = _current;
    final isMine = item.ownerId == widget.api.user?.id;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_deleted);
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.ownerName, style: const TextStyle(fontSize: 16)),
              Text(formatDateTime(item.createdAt), style: const TextStyle(fontSize: 12, color: Colors.white70)),
            ],
          ),
          actions: [if (isMine) IconButton(onPressed: _delete, icon: const Icon(Icons.delete_outline), tooltip: '삭제')],
        ),
        body: PageView.builder(
          controller: _pages,
          itemCount: widget.items.length,
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (_, i) {
            final it = widget.items[i];
            return it.isVideo
                ? _VideoPage(key: ValueKey(it.id), api: widget.api, item: it, active: i == _index)
                : _PhotoPage(key: ValueKey(it.id), api: widget.api, item: it);
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
    final thumbUrl = widget.item.thumbUrl;
    final thumb = thumbUrl == null
        ? const Center(child: CircularProgressIndicator())
        : CachedNetworkImage(imageUrl: thumbUrl, cacheKey: 'thumb_${widget.item.id}', fit: BoxFit.contain);
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
