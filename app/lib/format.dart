String two(int n) => n.toString().padLeft(2, '0');

const _weekdays = ['월', '화', '수', '목', '금', '토', '일'];

String formatDay(DateTime d) => '${d.year}.${two(d.month)}.${two(d.day)} (${_weekdays[d.weekday - 1]})';

String formatDateTime(DateTime d) => '${d.year}.${two(d.month)}.${two(d.day)} ${two(d.hour)}:${two(d.minute)}';

String formatDuration(int ms) {
  final s = (ms / 1000).round();
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  return h > 0 ? '$h:${two(m)}:${two(s % 60)}' : '$m:${two(s % 60)}';
}

/// "방금", "10분 전", "3시간 전", "2일 전", 그 이상은 날짜
String formatRelative(DateTime d, [DateTime? now]) {
  final diff = (now ?? DateTime.now()).difference(d);
  if (diff.inMinutes < 1) return '방금';
  if (diff.inHours < 1) return '${diff.inMinutes}분 전';
  if (diff.inDays < 1) return '${diff.inHours}시간 전';
  if (diff.inDays < 7) return '${diff.inDays}일 전';
  return '${d.year}.${two(d.month)}.${two(d.day)}';
}

/// 생일부터 [at] 까지의 년/개월/일
({int years, int months, int days, int totalDays}) ageParts(DateTime birth, DateTime at) {
  final b = DateTime(birth.year, birth.month, birth.day);
  final a = DateTime(at.year, at.month, at.day);
  var y = a.year - b.year;
  var m = a.month - b.month;
  var d = a.day - b.day;
  if (d < 0) {
    m--;
    d += DateTime(a.year, a.month, 0).day; // 지난달 일수
  }
  if (m < 0) {
    y--;
    m += 12;
  }
  return (years: y, months: m, days: d, totalDays: a.difference(b).inDays);
}

/// 짧은 나이: "생후 12일", "생후 5개월", "2살 4개월"
String ageShort(DateTime birth, DateTime at) {
  final a = ageParts(birth, at);
  if (a.totalDays < 0) return '태어나기 전';
  if (a.years == 0 && a.months == 0) return '생후 ${a.totalDays + 1}일';
  if (a.years == 0) return '생후 ${a.months}개월';
  return a.months == 0 ? '${a.years}살' : '${a.years}살 ${a.months}개월';
}

/// 긴 나이: "생후 12일", "생후 5개월 3일", "2살 4개월 24일"
String ageLong(DateTime birth, DateTime at) {
  final a = ageParts(birth, at);
  if (a.totalDays < 0) return '태어나기 ${-a.totalDays}일 전';
  if (a.years == 0 && a.months == 0) return '생후 ${a.totalDays + 1}일';
  if (a.years == 0) return '생후 ${a.months}개월 ${a.days}일';
  return '${a.years}살 ${a.months}개월 ${a.days}일';
}
