import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';

/// 앨범 목록의 정사각형 썸네일 한 칸.
class MediaThumb extends StatelessWidget {
  const MediaThumb({super.key, required this.item, required this.onTap});

  final MediaItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = ColoredBox(
      color: scheme.surfaceContainerHighest,
      child: Icon(item.isVideo ? Icons.movie_outlined : Icons.image_outlined, color: scheme.onSurfaceVariant),
    );
    return GestureDetector(
      onTap: onTap,
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (item.thumbUrl == null)
              placeholder
            else
              CachedNetworkImage(
                imageUrl: item.thumbUrl!,
                cacheKey: 'thumb_${item.id}',
                fit: BoxFit.cover,
                placeholder: (_, _) => ColoredBox(color: scheme.surfaceContainerHighest),
                errorWidget: (_, _, _) => placeholder,
              ),
            if (item.isVideo)
              Positioned(
                right: 4,
                bottom: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(4)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.play_arrow_rounded, size: 14, color: Colors.white),
                      if (item.durationMs != null)
                        Text(
                          formatDuration(item.durationMs!),
                          style: const TextStyle(color: Colors.white, fontSize: 11),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
