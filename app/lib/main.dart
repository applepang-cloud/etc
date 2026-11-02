import 'package:flutter/material.dart';

import 'api.dart';
import 'screens/gallery_screen.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await Api.create();
  runApp(FamilyPhotosApp(api: api));
}

class FamilyPhotosApp extends StatefulWidget {
  const FamilyPhotosApp({super.key, required this.api});

  final Api api;

  @override
  State<FamilyPhotosApp> createState() => _FamilyPhotosAppState();
}

class _FamilyPhotosAppState extends State<FamilyPhotosApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    widget.api.onUnauthorized = _refresh;
  }

  void _refresh() {
    // 로그인 상태가 바뀌면 열려 있던 화면을 모두 닫고 처음 화면으로 돌아갑니다.
    _navigatorKey.currentState?.popUntil((r) => r.isFirst);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final api = widget.api;
    return MaterialApp(
      title: '우리 가족 앨범',
      navigatorKey: _navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal), useMaterial3: true),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal, brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: api.user == null
          ? LoginScreen(api: api, onLoggedIn: _refresh)
          : GalleryScreen(key: ValueKey(api.user!.id), api: api, onLoggedOut: _refresh),
    );
  }
}
