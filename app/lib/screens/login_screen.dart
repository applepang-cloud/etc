import 'package:flutter/material.dart';

import '../api.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLoggedIn});

  final Api api;
  final VoidCallback onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _invite = TextEditingController();
  final _username = TextEditingController();
  final _name = TextEditingController();
  final _password = TextEditingController();
  bool _signup = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_invite, _username, _name, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_signup) {
        await widget.api.signup(
          inviteCode: _invite.text.trim(),
          username: _username.text.trim(),
          displayName: _name.text.trim(),
          password: _password.text,
        );
      } else {
        await widget.api.login(_username.text.trim(), _password.text);
      }
      widget.onLoggedIn();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Form(
              key: _form,
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.photo_library_rounded, size: 64, color: theme.colorScheme.primary),
                    const SizedBox(height: 12),
                    Text('우리 가족 앨범', textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 24),
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: false, label: Text('로그인')),
                        ButtonSegment(value: true, label: Text('가입하기')),
                      ],
                      selected: {_signup},
                      onSelectionChanged: (s) => setState(() {
                        _signup = s.first;
                        _error = null;
                      }),
                    ),
                    const SizedBox(height: 16),
                    if (_signup) ...[
                      TextFormField(
                        controller: _invite,
                        decoration: const InputDecoration(labelText: '초대 코드', helperText: '가족에게 받은 코드를 입력하세요'),
                        validator: (v) => (v ?? '').trim().isEmpty ? '초대 코드를 입력하세요' : null,
                      ),
                      const SizedBox(height: 8),
                    ],
                    TextFormField(
                      controller: _username,
                      autofillHints: const [AutofillHints.username],
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: '아이디',
                        helperText: _signup ? '영문 소문자, 숫자, _ (3~20자)' : null,
                      ),
                      validator: (v) {
                        final s = (v ?? '').trim().toLowerCase();
                        if (s.isEmpty) return '아이디를 입력하세요';
                        if (_signup && !RegExp(r'^[a-z0-9_]{3,20}$').hasMatch(s)) {
                          return '영문 소문자, 숫자, _ 로 3~20자';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 8),
                    if (_signup) ...[
                      TextFormField(
                        controller: _name,
                        autofillHints: const [AutofillHints.nickname],
                        decoration: const InputDecoration(labelText: '이름', helperText: '앨범에 표시될 이름 (예: 엄마, 민수)'),
                        validator: (v) => (v ?? '').trim().isEmpty ? '이름을 입력하세요' : null,
                      ),
                      const SizedBox(height: 8),
                    ],
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      autofillHints: [_signup ? AutofillHints.newPassword : AutofillHints.password],
                      decoration: const InputDecoration(labelText: '비밀번호'),
                      onFieldSubmitted: (_) => _submit(),
                      validator: (v) {
                        if ((v ?? '').isEmpty) return '비밀번호를 입력하세요';
                        if (_signup && v!.length < 8) return '8자 이상 입력하세요';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(_signup ? '가입하기' : '로그인'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
