// 웹 푸시 알림 수신용 서비스 워커 (아이폰은 "홈 화면에 추가"한 웹앱에서만 동작)
// Firebase SDK 없이 표준 Push API로 FCM 메시지를 받아 알림을 띄웁니다.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {}
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || '우리 가족 앨범';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body || '',
      icon: n.icon || 'icons/Icon-192.png',
      badge: 'icons/Icon-192.png',
      tag: n.tag || data.postId || undefined,
      data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL('./', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(url) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
