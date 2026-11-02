import 'dart:io';

import 'package:flutter/widgets.dart';

/// 기기에 있는 사진 파일 미리보기
Widget localImage(String path) => Image.file(File(path), fit: BoxFit.cover, cacheWidth: 300);
