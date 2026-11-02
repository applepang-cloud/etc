import 'package:flutter/material.dart';

import 'api.dart';
import 'app_scope.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await Api.create();
  runApp(FamilyPhotosApp(api: api));
}

/// 앱 색상: 따뜻한 살구색 계열
const _seed = Color(0xFFEF8354);

ThemeData _theme(Brightness b) {
  final scheme = ColorScheme.fromSeed(
    seedColor: _seed,
    brightness: b,
    dynamicSchemeVariant: DynamicSchemeVariant.fidelity,
  );
  final light = b == Brightness.light;
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: light ? Colors.white : scheme.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: light ? Colors.white : scheme.surface,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0.5,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: light ? Colors.white : scheme.surfaceContainer,
      indicatorColor: scheme.primaryContainer,
      height: 68,
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: scheme.primary,
      foregroundColor: scheme.onPrimary,
      shape: const StadiumBorder(),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: scheme.primary,
      unselectedLabelColor: scheme.onSurfaceVariant,
      indicatorColor: scheme.primary,
      dividerColor: Colors.transparent,
    ),
  );
}

class FamilyPhotosApp extends StatefulWidget {
  const FamilyPhotosApp({super.key, required this.api});

  final Api api;

  @override
  State<FamilyPhotosApp> createState() => _FamilyPhotosAppState();
}

class _FamilyPhotosAppState extends State<FamilyPhotosApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  late AppScope _scope = AppScope(widget.api);

  @override
  void initState() {
    super.initState();
    widget.api.onUnauthorized = _refresh;
  }

  void _refresh() {
    // 로그인 상태가 바뀌면 열려 있던 화면을 모두 닫고 처음 화면으로 돌아갑니다.
    _navigatorKey.currentState?.popUntil((r) => r.isFirst);
    setState(() => _scope = AppScope(widget.api));
  }

  @override
  Widget build(BuildContext context) {
    final api = widget.api;
    return MaterialApp(
      title: '우리 가족 앨범',
      navigatorKey: _navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: _theme(Brightness.light),
      darkTheme: _theme(Brightness.dark),
      home: api.user == null
          ? LoginScreen(api: api, onLoggedIn: _refresh)
          : HomeShell(key: ValueKey(api.user!.id), scope: _scope, onLoggedOut: _refresh),
    );
  }
}
