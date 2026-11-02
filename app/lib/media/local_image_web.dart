import 'package:flutter/widgets.dart';

/// 웹에서 고른 파일(blob: 주소) 미리보기
Widget localImage(String path) => Image.network(path, fit: BoxFit.cover, cacheWidth: 300);
