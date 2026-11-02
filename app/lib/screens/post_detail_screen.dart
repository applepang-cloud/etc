import 'package:flutter/material.dart';

import '../api.dart';
import '../app_scope.dart';
import '../format.dart';
import 'composer_screen.dart';
import 'viewer_screen.dart';
import 'widgets.dart';

/// 소식 하나: 글, 사진 전체, 좋아요, 댓글.
/// 수정/삭제했으면 true 를 돌려줍니다.
class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({super.key, required this.scope, required this.postId, this.summary});

  final AppScope scope;
  final String postId;

  /// 목록에 있던 같은 게시물 (좋아요/댓글 수를 함께 갱신)
  final Post? summary;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  PostDetail? _detail;
  String? _error;
  bool _changed = false;
  bool _sending = false;
  final _comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await widget.scope.api.getPost(widget.postId);
      if (mounted) setState(() => _detail = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _syncSummary() {
    final s = widget.summary;
    final d = _detail;
    if (s == null || d == null) return;
    s
      ..likeCount = d.likers.length
      ..likedByMe = d.likers.any((u) => u.id == widget.scope.myId)
      ..commentCount = d.comments.length;
  }

  Future<void> _toggleLike() async {
    final d = _detail!;
    final me = widget.scope.api.user!;
    final liked = !d.likers.any((u) => u.id == me.id);
    setState(() => liked ? d.likers.add(UserRef(me.id, me.displayName)) : d.likers.removeWhere((u) => u.id == me.id));
    _syncSummary();
    try {
      await widget.scope.api.setLike(d.post.id, liked);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
      _load();
    }
  }

  Future<void> _send() async {
    final text = _comment.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final c = await widget.scope.api.addComment(widget.postId, text);
      _comment.clear();
      setState(() => _detail!.comments.add(c));
      _syncSummary();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _deleteComment(Comment c) async {
    if (!await confirm(context, '댓글 삭제', '이 댓글을 삭제할까요?', ok: '삭제')) return;
    try {
      await widget.scope.api.deleteComment(widget.postId, c.id);
      setState(() => _detail!.comments.remove(c));
      _syncSummary();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _edit() async {
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ComposerScreen(scope: widget.scope, editing: _detail!.post),
      ),
    );
    if (updated == true) {
      _changed = true;
      _load();
    }
  }

  Future<void> _delete() async {
    final n = _detail!.post.mediaCount;
    if (!await confirm(
      context,
      '소식 삭제',
      '이 소식${n > 0 ? '과 사진·동영상 $n개' : ''}를 삭제할까요?\n가족 모두에게서 사라지고 되돌릴 수 없습니다.',
      ok: '삭제',
    )) {
      return;
    }
    if (!mounted) return;
    final nav = Navigator.of(context);
    try {
      await widget.scope.api.deletePost(widget.postId);
      nav.pop(true);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _openViewer(int index) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            ViewerScreen(scope: widget.scope, items: List.of(_detail!.post.media), initialIndex: index, fromPost: true),
      ),
    );
    if (changed == true) {
      _changed = true;
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    final theme = Theme.of(context);
    final kid = widget.scope.child;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          centerTitle: true,
          title: d == null
              ? null
              : Column(
                  children: [
                    Text(
                      kid != null ? ageLong(kid.birthDate, d.post.postedAt) : formatDay(d.post.postedAt),
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    if (kid != null) Text(formatDay(d.post.postedAt), style: theme.textTheme.bodySmall),
                  ],
                ),
          actions: [
            if (d != null && d.post.author.id == widget.scope.myId)
              PopupMenuButton<String>(
                onSelected: (v) => v == 'edit' ? _edit() : _delete(),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'edit', child: Text('글 · 날짜 수정')),
                  PopupMenuItem(value: 'delete', child: Text('삭제')),
                ],
              ),
          ],
        ),
        body: d == null
            ? Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator())
            : Column(
                children: [
                  Expanded(child: _content(d)),
                  _commentInput(),
                ],
              ),
      ),
    );
  }

  Widget _content(PostDetail d) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final p = d.post;
    final myId = widget.scope.myId;
    final likedByMe = d.likers.any((u) => u.id == myId);
    return ListView(
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        ListTile(
          leading: Avatar(user: p.author),
          title: Text(p.author.displayName, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(formatDateTime(p.postedAt)),
        ),
        if (p.body.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: SelectableText(p.body, style: const TextStyle(fontSize: 16, height: 1.5)),
          ),
        if (p.media.length == 1)
          AspectRatio(
            aspectRatio: p.media.first.aspectRatio.clamp(0.6, 2),
            child: MediaTile(item: p.media.first, preview: true, onTap: () => _openViewer(0)),
          )
        else if (p.media.isNotEmpty)
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: p.media.length == 2 ? 2 : 3,
              mainAxisSpacing: 2,
              crossAxisSpacing: 2,
            ),
            itemCount: p.media.length,
            itemBuilder: (_, i) => MediaTile(item: p.media[i], onTap: () => _openViewer(i)),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 16, 0),
          child: Row(
            children: [
              IconButton(
                onPressed: _toggleLike,
                icon: Icon(
                  likedByMe ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  color: likedByMe ? Colors.redAccent : scheme.onSurfaceVariant,
                ),
              ),
              Expanded(
                child: Text(
                  d.likers.isEmpty
                      ? '첫 번째로 좋아요를 눌러보세요'
                      : d.likers.map((u) => u.id == myId ? '나' : u.displayName).join(', '),
                  style: TextStyle(
                    color: d.likers.isEmpty ? scheme.onSurfaceVariant : scheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        const Divider(indent: 16, endIndent: 16),
        if (d.comments.isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('아직 댓글이 없어요. 한마디 남겨주세요!', style: TextStyle(color: scheme.onSurfaceVariant)),
          ),
        for (final c in d.comments)
          InkWell(
            onLongPress: c.author.id == myId ? () => _deleteComment(c) : null,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        c.author.id == myId ? '나' : c.author.displayName,
                        style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(width: 8),
                      Text(formatRelative(c.createdAt), style: theme.textTheme.bodySmall),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(c.body, style: const TextStyle(fontSize: 15, height: 1.4)),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _commentInput() {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _comment,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: '댓글 달기',
                    isDense: true,
                    filled: true,
                    fillColor: scheme.surface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                  ),
                ),
              ),
              IconButton(
                onPressed: _sending ? null : _send,
                icon: Icon(Icons.send_rounded, color: scheme.primary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
