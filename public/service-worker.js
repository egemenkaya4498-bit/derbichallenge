// public/service-worker.js
self.addEventListener('push', event => {
    // Bildirim verisi geldiğinde çalışır
    const data = event.data.json();
    console.log('Push Bildirimi Alındı', data);

    const options = {
        body: data.body,
        icon: 'https://placehold.co/192x192/0056b3/ffffff?text=M', // Basit bir ikon URL'si
        vibrate: [100, 50, 100],
        data: {
            url: 'http://localhost:3000/' 
        }
    };

    // Bildirimi kullanıcıya göster
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Bildirime tıklama olayını yönet
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        // Bildirime tıklanınca ana sayfayı aç
        clients.openWindow(event.notification.data.url)
    );
});
