import 'package:flutter/material.dart';

import '../api.dart';
import '../app_scope.dart';
import '../format.dart';
import 'post_detail_screen.dart';
import 'widgets.dart';

/// 근황: 가족이 올린 소식 (누가, 언제, 몇 장)
class ActivityTab extends StatefulWidget {
  const ActivityTab({super.key, required this.scope, required this.onInvite});

  final AppScope scope;
  final VoidCallback onInvite;

  @override
  State<ActivityTab> createState() => _ActivityTabState();
}

class _ActivityTabState extends State<ActivityTab> {
  final _posts = <Post>[];
  String? _cursor;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.scope.version.addListener(_reload);
    _reload();
  }

  @override
  void dispose() {
    widget.scope.version.removeListener(_reload);
    super.dispose();
  }

  Future<void> _reload() => _load(reset: true);

  Future<void> _load({bool reset = false}) async {
    if (_loading || (!reset && !_hasMore)) return;
    setState(() => _loading = true);
    try {
      final page = await widget.scope.api.listPosts(cursor: reset ? null : _cursor);
      if (!mounted) return;
      setState(() {
        if (reset) _posts.clear();
        _posts.addAll(page.items);
        _cursor = page.nextCursor;
        _hasMore = page.nextCursor != null;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(Post p) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PostDetailScreen(scope: widget.scope, postId: p.id, summary: p),
      ),
    );
    if (changed == true) {
      widget.scope.changed();
    } else {
      setState(() {}); // 좋아요/댓글 수 반영
    }
  }

  Future<void> _toggleLike(Post p) async {
    final liked = !p.likedByMe;
    setState(() {
      p.likedByMe = liked;
      p.likeCount += liked ? 1 : -1;
    });
    try {
      await widget.scope.api.setLike(p.id, liked);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        p.likedByMe = !liked;
        p.likeCount += liked ? -1 : 1;
      });
      toast(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final members = widget.scope.family.value?.members.length ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('근황', style: TextStyle(fontWeight: FontWeight.w700)),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.extentAfter < 600) _load();
            return false;
          },
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 100),
            itemCount: _posts.length + 2,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              if (i == 0) return _InviteBanner(onInvite: widget.onInvite, memberCount: members);
              if (i == _posts.length + 1) return _footer();
              final p = _posts[i - 1];
              return _PostItem(post: p, child: widget.scope.child, onTap: () => _open(p), onLike: () => _toggleLike(p));
            },
          ),
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
            Text(_error!),
            TextButton(onPressed: () => _load(), child: const Text('다시 시도')),
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
    if (_posts.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 80, horizontal: 24),
        child: Text('아직 소식이 없어요.\n[추가] 버튼으로 사진과 영상을 올려보세요!', textAlign: TextAlign.center),
      );
    }
    return const SizedBox.shrink();
  }
}

class _InviteBanner extends StatelessWidget {
  const _InviteBanner({required this.onInvite, required this.memberCount});

  final VoidCallback onInvite;
  final int memberCount;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.primaryContainer.withValues(alpha: 0.35),
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('가족을 초대해서\n사진과 영상을 함께 보세요!', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                if (memberCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '지금 $memberCount명이 함께하고 있어요',
                      style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                    ),
                  ),
              ],
            ),
          ),
          OutlinedButton(onPressed: onInvite, child: const Text('초대하기')),
        ],
      ),
    );
  }
}

class _PostItem extends StatelessWidget {
  const _PostItem({required this.post, required this.child, required this.onTap, required this.onLike});

  final Post post;
  final Child? child;
  final VoidCallback onTap;
  final VoidCallback onLike;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final p = post;
    final what = p.mediaCount == 0 ? ' 님이 글을 남겼어요.' : ' 님이 사진·동영상을 ${p.mediaCount}개 추가했어요.';
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Avatar(user: p.author, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: p.author.displayName,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        TextSpan(text: what),
                      ],
                    ),
                    style: const TextStyle(fontSize: 15, height: 1.35),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: formatRelative(p.postedAt)),
                          if (child != null)
                            TextSpan(
                              text: '  ·  ${child!.name} ${ageLong(child!.birthDate, p.postedAt)}',
                              style: TextStyle(color: theme.colorScheme.primary),
                            ),
                        ],
                      ),
                      style: TextStyle(color: muted, fontSize: 13),
                    ),
                  ),
                  if (p.body.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        p.body,
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(height: 1.4),
                      ),
                    ),
                  if (p.media.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: _Collage(post: p, onTap: onTap),
                    ),
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: onLike,
                        style: TextButton.styleFrom(foregroundColor: p.likedByMe ? Colors.redAccent : muted),
                        icon: Icon(p.likedByMe ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 20),
                        label: Text(p.likeCount > 0 ? '${p.likeCount}' : '좋아요'),
                      ),
                      TextButton.icon(
                        onPressed: onTap,
                        style: TextButton.styleFrom(foregroundColor: muted),
                        icon: const Icon(Icons.chat_bubble_outline_rounded, size: 19),
                        label: Text(p.commentCount > 0 ? '${p.commentCount}' : '댓글'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 소식 카드의 사진 묶음: 1장은 크게, 2장은 반반, 3장 이상은 3칸 (+N)
class _Collage extends StatelessWidget {
  const _Collage({required this.post, required this.onTap});

  final Post post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final media = post.media;
    final Widget content;
    if (media.length == 1) {
      content = AspectRatio(
        aspectRatio: media.first.aspectRatio.clamp(0.8, 1.8),
        child: MediaTile(item: media.first, preview: true, onTap: onTap),
      );
    } else {
      final shown = media.take(3).toList();
      final extra = post.mediaCount - shown.length;
      content = AspectRatio(
        aspectRatio: shown.length.toDouble(),
        child: Row(
          children: [
            for (var i = 0; i < shown.length; i++) ...[
              if (i > 0) const SizedBox(width: 3),
              Expanded(
                child: MediaTile(
                  item: shown[i],
                  preview: shown.length == 2,
                  onTap: onTap,
                  overlay: i == shown.length - 1 && extra > 0
                      ? IgnorePointer(
                          child: ColoredBox(
                            color: Colors.black45,
                            child: Center(
                              child: Text(
                                '+$extra',
                                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ),
                        )
                      : null,
                ),
              ),
            ],
          ],
        ),
      );
    }
    return ClipRRect(borderRadius: BorderRadius.circular(12), child: content);
  }
}
