String two(int n) => n.toString().padLeft(2, '0');

String formatDay(DateTime d) {
  const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
  return '${d.year}년 ${d.month}월 ${d.day}일 (${weekdays[d.weekday - 1]})';
}

String formatDateTime(DateTime d) => '${d.year}.${two(d.month)}.${two(d.day)} ${two(d.hour)}:${two(d.minute)}';

String formatDuration(int ms) {
  final s = (ms / 1000).round();
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  return h > 0 ? '$h:${two(m)}:${two(s % 60)}' : '$m:${two(s % 60)}';
}
