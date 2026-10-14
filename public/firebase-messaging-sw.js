/* GG_MEMBER_FCM_PUSH_V1 */
importScripts(
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: 'AIzaSyCqub_p5koak894EwApEexlUGVMoGAkg3E',
  authDomain: 'guanguan-cbbe7.firebaseapp.com',
  projectId: 'guanguan-cbbe7',
  storageBucket: 'guanguan-cbbe7.firebasestorage.app',
  messagingSenderId: '373321059260',
  appId: '1:373321059260:web:253d8f1d7a53adce2bf9b9',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};

  const title =
    data.title || 'GuanGuan Badminton';

  const options = {
    body: data.body || 'มีการอัปเดตคิวของคุณ',
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/favicon-64x64.png',
    tag: data.tag || 'guanguan-queue',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/',
    },
  };

  return self.registration.showNotification(
    title,
    options
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl);
    })
  );
});
