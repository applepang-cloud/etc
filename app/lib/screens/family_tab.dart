import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../app_scope.dart';
import '../config.dart';
import '../format.dart';
import 'widgets.dart';

/// 가족 설정: 초대, 가족 이름, 아이, 구성원, 내 계정
class FamilyTab extends StatelessWidget {
  const FamilyTab({super.key, required this.scope, required this.onLoggedOut});

  final AppScope scope;
  final VoidCallback onLoggedOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('가족 설정', style: TextStyle(fontWeight: FontWeight.w700)),
        centerTitle: true,
      ),
      body: ValueListenableBuilder(
        valueListenable: scope.family,
        builder: (context, family, _) {
          if (family == null) return const Center(child: CircularProgressIndicator());
          return RefreshIndicator(
            onRefresh: scope.reloadFamily,
            child: ListView(
              children: [
                _InviteCard(family: family),
                const Divider(height: 1),
                _Section('우리 가족'),
                ListTile(
                  leading: const Icon(Icons.home_outlined),
                  title: const Text('가족 이름'),
                  subtitle: Text(family.name.isEmpty ? '정하지 않음' : family.name),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _editFamilyName(context, family.name),
                ),
                _Section(
                  '아이',
                  action: TextButton.icon(
                    onPressed: () => _editChild(context, null),
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('등록'),
                  ),
                ),
                if (family.children.isEmpty)
                  const ListTile(leading: Icon(Icons.child_care_outlined), title: Text('아이를 등록하면 사진마다 나이가 표시돼요')),
                for (final c in family.children)
                  ListTile(
                    leading: Icon(
                      scope.child?.id == c.id ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    title: Text(c.name),
                    subtitle: Text('${formatDay(c.birthDate)} 출생 · 지금 ${ageShort(c.birthDate, DateTime.now())}'),
                    trailing: IconButton(
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () => _editChild(context, c),
                    ),
                    onTap: () {
                      scope.api.selectedChildId = c.id;
                      scope.family.value = family; // 화면 갱신
                      scope.changed();
                      toast(context, '${c.name}의 나이로 표시합니다.');
                    },
                  ),
                if (family.children.length > 1)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Text('누르면 그 아이 기준으로 나이가 표시돼요.', style: TextStyle(fontSize: 12)),
                  ),
                _Section('구성원 ${family.members.length}명'),
                for (final m in family.members)
                  ListTile(
                    leading: Avatar(user: m, size: 36),
                    title: Text(m.id == scope.myId ? '${m.displayName} (나)' : m.displayName),
                  ),
                _Section('내 계정'),
                ListTile(
                  leading: const Icon(Icons.badge_outlined),
                  title: Text(scope.api.user?.displayName ?? ''),
                  subtitle: Text('아이디: ${scope.api.user?.username ?? ''}'),
                ),
                ListTile(
                  leading: const Icon(Icons.lock_outline),
                  title: const Text('비밀번호 변경'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _changePassword(context),
                ),
                ListTile(
                  leading: const Icon(Icons.logout),
                  title: const Text('로그아웃'),
                  onTap: () async {
                    if (!await confirm(context, '로그아웃', '로그아웃할까요?', ok: '로그아웃')) return;
                    await scope.api.logout();
                    onLoggedOut();
                  },
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _editFamilyName(BuildContext context, String current) async {
    final ctl = TextEditingController(text: current);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('가족 이름'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          maxLength: 30,
          decoration: const InputDecoration(hintText: '예: 서아네 가족'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('저장')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await scope.api.setFamilyName(ctl.text.trim());
      await scope.reloadFamily();
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.message);
    }
  }

  Future<void> _editChild(BuildContext context, Child? child) async {
    final name = TextEditingController(text: child?.name ?? '');
    DateTime? birth = child?.birthDate;
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text(child == null ? '아이 등록' : '아이 정보 수정'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                autofocus: child == null,
                decoration: const InputDecoration(labelText: '이름'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () async {
                  final d = await showDatePicker(
                    context: ctx,
                    initialDate: birth ?? DateTime.now(),
                    firstDate: DateTime(1950),
                    lastDate: DateTime.now().add(const Duration(days: 300)),
                    helpText: '생일 선택',
                  );
                  if (d != null) setState(() => birth = d);
                },
                icon: const Icon(Icons.cake_outlined),
                label: Text(birth == null ? '생일 선택' : formatDay(birth!)),
              ),
            ],
          ),
          actions: [
            if (child != null) TextButton(onPressed: () => Navigator.pop(ctx, 'delete'), child: const Text('삭제')),
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('취소')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, name.text.trim().isEmpty || birth == null ? null : 'save'),
              child: const Text('저장'),
            ),
          ],
        ),
      ),
    );
    try {
      if (result == 'save') {
        await scope.api.saveChild(id: child?.id, name: name.text.trim(), birthDate: birth!);
      } else if (result == 'delete') {
        if (!context.mounted || !await confirm(context, '삭제', '${child!.name}의 정보를 삭제할까요? 사진은 지워지지 않아요.', ok: '삭제')) {
          return;
        }
        await scope.api.deleteChild(child.id);
      } else {
        return;
      }
      await scope.reloadFamily();
      scope.changed();
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.message);
    }
  }

  Future<void> _changePassword(BuildContext context) async {
    final current = TextEditingController();
    final next = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('비밀번호 변경'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: current,
              obscureText: true,
              decoration: const InputDecoration(labelText: '현재 비밀번호'),
            ),
            TextField(
              controller: next,
              obscureText: true,
              decoration: const InputDecoration(labelText: '새 비밀번호 (8자 이상)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('변경')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await scope.api.changePassword(current.text, next.text);
      if (context.mounted) toast(context, '비밀번호를 변경했습니다. 다른 기기에서는 다시 로그인해야 합니다.');
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.message);
    }
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title, {this.action});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 8, 4),
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Theme.of(context).colorScheme.primary),
          ),
        ),
        ?action,
      ],
    ),
  );
}

class _InviteCard extends StatelessWidget {
  const _InviteCard({required this.family});

  final FamilyInfo family;

  String get _message => [
    '우리 가족 앨범에 초대합니다!',
    '',
    '1. 아래 주소를 열어 주세요 (아이폰은 Safari → 공유 → "홈 화면에 추가")',
    apiBaseUrl,
    '2. [가입하기]에서 초대 코드를 입력하세요',
    '초대 코드: ${family.inviteCode}',
  ].join('\n');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      color: scheme.primaryContainer.withValues(alpha: 0.35),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('가족을 초대하세요!', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('초대 코드를 받은 가족만 가입할 수 있어요.', style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Text('초대 코드', style: TextStyle(color: scheme.onSurfaceVariant)),
                const SizedBox(width: 12),
                Expanded(
                  child: SelectableText(
                    family.inviteCode,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: 1),
                  ),
                ),
                IconButton(
                  tooltip: '복사',
                  icon: const Icon(Icons.copy_rounded),
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: family.inviteCode));
                    if (context.mounted) toast(context, '초대 코드를 복사했습니다.');
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () async {
                try {
                  await SharePlus.instance.share(ShareParams(text: _message, subject: '우리 가족 앨범 초대'));
                } catch (_) {
                  await Clipboard.setData(ClipboardData(text: _message));
                  if (context.mounted) toast(context, '초대 메시지를 복사했습니다. 카카오톡 등에 붙여넣어 보내세요.');
                }
              },
              icon: const Icon(Icons.send_rounded),
              label: const Text('초대 메시지 보내기'),
            ),
          ),
        ],
      ),
    );
  }
}
