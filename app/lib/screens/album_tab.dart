import 'package:flutter/material.dart';

import '../api.dart';
import '../app_scope.dart';
import '../format.dart';
import 'viewer_screen.dart';
import 'widgets.dart';

/// 앨범: 연도 선택 + 월별 탭. 사진은 찍은 날짜 기준으로 정리됩니다.
class AlbumTab extends StatefulWidget {
  const AlbumTab({super.key, required this.scope});

  final AppScope scope;

  @override
  State<AlbumTab> createState() => _AlbumTabState();
}

class _AlbumTabState extends State<AlbumTab> {
  List<AlbumMonth>? _months;
  String? _error;
  int? _year;

  @override
  void initState() {
    super.initState();
    widget.scope.version.addListener(_load);
    _load();
  }

  @override
  void dispose() {
    widget.scope.version.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final months = await widget.scope.api.listMonths();
      if (!mounted) return;
      setState(() {
        _months = months;
        _error = null;
        if (_year == null || !months.any((m) => m.year == _year)) {
          _year = months.isEmpty ? DateTime.now().year : months.first.year;
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final months = _months;
    if (months == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('앨범')),
        body: Center(
          child: _error == null
              ? const CircularProgressIndicator()
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!),
                    TextButton(onPressed: _load, child: const Text('다시 시도')),
                  ],
                ),
        ),
      );
    }

    final year = _year!;
    final years = {for (final m in months) m.year}.toList()..sort((a, b) => b - a);
    final ofYear = months.where((m) => m.year == year).toList();
    final theme = Theme.of(context);

    return DefaultTabController(
      key: ValueKey('$year-${ofYear.map((m) => m.key).join()}'),
      length: ofYear.length + 1,
      initialIndex: ofYear.isEmpty ? 0 : 1,
      child: Builder(
        builder: (context) {
          return Scaffold(
            appBar: AppBar(
              titleSpacing: 20,
              title: PopupMenuButton<int>(
                tooltip: '연도 선택',
                enabled: years.length > 1,
                onSelected: (y) => setState(() => _year = y),
                itemBuilder: (_) => [for (final y in years) PopupMenuItem(value: y, child: Text('$y년'))],
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$year', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                    if (years.length > 1) const Icon(Icons.expand_more_rounded),
                  ],
                ),
              ),
              bottom: TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                labelStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                tabs: [
                  const Tab(icon: Icon(Icons.grid_view_rounded), iconMargin: EdgeInsets.zero),
                  for (final m in ofYear) Tab(text: '${m.month}월'),
                ],
              ),
            ),
            body: months.isEmpty
                ? const _Empty()
                : TabBarView(
                    children: [
                      _YearOverview(
                        months: ofYear,
                        child: widget.scope.child,
                        onOpen: (i) => DefaultTabController.of(context).animateTo(i + 1),
                      ),
                      for (final m in ofYear) _MonthPage(key: ValueKey(m.key), scope: widget.scope, month: m),
                    ],
                  ),
          );
        },
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.photo_camera_back_outlined, size: 64, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          const Text('아직 올린 사진이 없어요.\n아래 [추가] 버튼으로 첫 사진을 올려보세요!', textAlign: TextAlign.center),
        ],
      ),
    ),
  );
}

/// 한 해의 달별 표지 모아보기
class _YearOverview extends StatelessWidget {
  const _YearOverview({required this.months, required this.child, required this.onOpen});

  final List<AlbumMonth> months;
  final Child? child;
  final void Function(int index) onOpen;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 100),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 240,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
      ),
      itemCount: months.length,
      itemBuilder: (_, i) {
        final m = months[i];
        final kid = child;
        return ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (m.cover != null) MediaTile(item: m.cover!, preview: true, onTap: () => onOpen(i)),
              const _BottomShade(),
              Positioned(
                left: 12,
                bottom: 10,
                right: 12,
                child: IgnorePointer(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${m.month}월',
                        style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        [
                          '${m.count}장',
                          if (kid != null) ageShort(kid.birthDate, DateTime(m.year, m.month + 1, 0)),
                        ].join(' · '),
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _BottomShade extends StatelessWidget {
  const _BottomShade();

  @override
  Widget build(BuildContext context) => const IgnorePointer(
    child: DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: [0.5, 1],
          colors: [Colors.transparent, Colors.black54],
        ),
      ),
    ),
  );
}

/// 한 달: 큰 표지 사진 + 3열 목록
class _MonthPage extends StatefulWidget {
  const _MonthPage({super.key, required this.scope, required this.month});

  final AppScope scope;
  final AlbumMonth month;

  @override
  State<_MonthPage> createState() => _MonthPageState();
}

class _MonthPageState extends State<_MonthPage> with AutomaticKeepAliveClientMixin {
  final _items = <MediaItem>[];
  String? _cursor;
  bool _loading = false;
  bool _hasMore = true;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);
    try {
      final page = await widget.scope.api.listMedia(month: widget.month, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
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

  Future<void> _open(int index) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ViewerScreen(scope: widget.scope, items: List.of(_items), initialIndex: index),
      ),
    );
    if (changed == true) widget.scope.changed();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_items.isEmpty) {
      return Center(
        child: _error != null
            ? TextButton(
                onPressed: _loadMore,
                child: Text('$_error\n다시 시도', textAlign: TextAlign.center),
              )
            : const CircularProgressIndicator(),
      );
    }
    final m = widget.month;
    final kid = widget.scope.child;
    final cover = _items.first;
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 600) _loadMore();
        return false;
      },
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: AspectRatio(
              aspectRatio: 1.15,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  MediaTile(item: cover, preview: true, onTap: () => _open(0)),
                  const _BottomShade(),
                  Positioned(
                    left: 20,
                    right: 20,
                    bottom: 18,
                    child: IgnorePointer(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${m.month}월',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 44,
                              fontWeight: FontWeight.w800,
                              height: 1,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            [
                              '${m.year}년',
                              '${m.count}장',
                              if (kid != null)
                                '${kid.name} ${ageShort(kid.birthDate, cover.sortAt ?? DateTime(m.year, m.month))}',
                            ].join('  ·  '),
                            style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.only(top: 2),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 2,
                crossAxisSpacing: 2,
              ),
              itemCount: _items.length,
              itemBuilder: (_, i) => MediaTile(item: _items[i], onTap: () => _open(i)),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: 110, child: _loading ? const Center(child: CircularProgressIndicator()) : null),
          ),
        ],
      ),
    );
  }
}
