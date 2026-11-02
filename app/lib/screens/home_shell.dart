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

  @override
  void initState() {
    super.initState();
    widget.scope.reloadFamily();
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
      setState(() => _tab = 1); // 올린 소식을 근황에서 바로 보여줍니다.
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
          ActivityTab(scope: scope, onInvite: () => setState(() => _tab = 2)),
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
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.photo_library_outlined),
            selectedIcon: Icon(Icons.photo_library),
            label: '앨범',
          ),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: '근황'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: '가족'),
        ],
      ),
    );
  }
}
