import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../app_scope.dart';
import 'activity_tab.dart';
import 'album_tab.dart';
import 'composer_screen.dart';
import 'family_tab.dart';

/// 하단 탭: 앨범 / 근황 / 가족
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.scope, required this.onLoggedOut});

  final AppScope scope;
  final VoidCallback onLoggedOut;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    final scope = widget.scope;
    scope.reloadFamily();
    scope.checkNewPosts();
    scope.push.onForegroundMessage = (title, body) {
      scope.changed();
      scope.checkNewPosts();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(body.isEmpty ? title : '$title\n$body'),
          action: SnackBarAction(label: '보기', onPressed: () => _select(1)),
        ),
      );
    };
    scope.push.init();
    // 앱으로 돌아오면 새 소식을 확인합니다.
    _lifecycle = AppLifecycleListener(
      onResume: () {
        scope.checkNewPosts();
        if (_tab == 1) scope.changed();
      },
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    widget.scope.push.dispose();
    super.dispose();
  }

  void _select(int i) {
    setState(() => _tab = i);
    if (i == 1) widget.scope.markActivitySeen();
  }

  Future<void> _add() async {
    final files = await ImagePicker().pickMultipleMedia();
    if (files.isEmpty || !mounted) return;
    final posted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ComposerScreen(scope: widget.scope, initialFiles: files),
      ),
    );
    if (posted == true) {
      widget.scope.changed();
      _select(1); // 올린 소식을 근황에서 바로 보여줍니다.
    }
  }

  @override
  Widget build(BuildContext context) {
    final scope = widget.scope;
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          AlbumTab(scope: scope),
          ActivityTab(scope: scope, onInvite: () => _select(2)),
          FamilyTab(scope: scope, onLoggedOut: widget.onLoggedOut),
        ],
      ),
      floatingActionButton: _tab == 2
          ? null
          : FloatingActionButton.extended(
              onPressed: _add,
              icon: const Icon(Icons.add_rounded),
              label: const Text('추가', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: _select,
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.photo_library_outlined),
            selectedIcon: Icon(Icons.photo_library),
            label: '앨범',
          ),
          NavigationDestination(
            icon: ValueListenableBuilder(
              valueListenable: scope.newPosts,
              builder: (_, n, _) =>
                  Badge(isLabelVisible: n > 0, label: Text('$n'), child: const Icon(Icons.forum_outlined)),
            ),
            selectedIcon: const Icon(Icons.forum),
            label: '근황',
          ),
          const NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: '가족'),
        ],
      ),
    );
  }
}
