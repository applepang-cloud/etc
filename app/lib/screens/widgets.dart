import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';

const _avatarColors = [
  Color(0xFF5BC0A8),
  Color(0xFFF2A65A),
  Color(0xFF7DA7E8),
  Color(0xFFE88BA6),
  Color(0xFFA48BE0),
  Color(0xFF8CC265),
];

/// 이름 앞 두 글자를 넣은 동그란 프로필
class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.user, this.size = 40});

  final UserRef user;
  final double size;

  @override
  Widget build(BuildContext context) {
    final name = user.displayName.trim();
    final label = name.isEmpty ? '?' : name.characters.take(2).toString();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: _avatarColors[user.id % _avatarColors.length], shape: BoxShape.circle),
      child: Text(
        label,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w600,
          fontSize: size * (label.length > 1 ? 0.32 : 0.42),
        ),
      ),
    );
  }
}

/// 서명 URL은 매일 바뀌므로 파일 id로 캐시합니다.
class NetImage extends StatelessWidget {
  const NetImage({super.key, required this.url, required this.cacheKey, this.fit = BoxFit.cover, this.memWidth});

  final String? url;
  final String cacheKey;
  final BoxFit fit;
  final int? memWidth;

  @override
  Widget build(BuildContext context) {
    final bg = ColoredBox(color: Theme.of(context).colorScheme.surfaceContainerHighest);
    if (url == null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          bg,
          const Icon(Icons.image_outlined, color: Colors.black26),
        ],
      );
    }
    return CachedNetworkImage(
      imageUrl: url!,
      cacheKey: cacheKey,
      fit: fit,
      memCacheWidth: memWidth,
      fadeInDuration: const Duration(milliseconds: 150),
      placeholder: (_, _) => bg,
      errorWidget: (_, _, _) => Stack(
        fit: StackFit.expand,
        children: [
          bg,
          const Icon(Icons.broken_image_outlined, color: Colors.black26),
        ],
      ),
    );
  }
}

/// 정사각형 썸네일 한 칸 (영상이면 재생 표시)
class MediaTile extends StatelessWidget {
  const MediaTile({super.key, required this.item, this.onTap, this.preview = false, this.overlay});

  final MediaItem item;
  final VoidCallback? onTap;
  final bool preview; // true 면 큰 이미지를 사용
  final Widget? overlay;

  @override
  Widget build(BuildContext context) {
    final url = preview ? item.previewUrl : item.thumbUrl;
    return GestureDetector(
      onTap: onTap,
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            NetImage(url: url, cacheKey: '${preview ? 'p' : 't'}_${item.id}', memWidth: preview ? 1080 : 400),
            if (item.isVideo) const Positioned(left: 6, top: 6, child: _PlayBadge()),
            if (item.isVideo && item.durationMs != null)
              Positioned(
                right: 6,
                bottom: 6,
                child: Text(
                  formatDuration(item.durationMs!),
                  style: const TextStyle(color: Colors.white, fontSize: 11, shadows: [Shadow(blurRadius: 4)]),
                ),
              ),
            ?overlay,
          ],
        ),
      ),
    );
  }
}

class _PlayBadge extends StatelessWidget {
  const _PlayBadge();

  @override
  Widget build(BuildContext context) => Container(
    width: 24,
    height: 24,
    decoration: BoxDecoration(
      color: Colors.black38,
      shape: BoxShape.circle,
      border: Border.all(color: Colors.white, width: 1.5),
    ),
    child: const Icon(Icons.play_arrow_rounded, size: 16, color: Colors.white),
  );
}

/// 화면 하단에 짧게 메시지 표시
void toast(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

Future<bool> confirm(BuildContext context, String title, String message, {String ok = '확인'}) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ok)),
        ],
      ),
    ) ==
    true;
