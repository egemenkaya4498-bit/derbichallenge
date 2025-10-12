// public/service-worker.js
self.addEventListener('push', event => {
    // Bildirim verisi geldiğinde çalışır
    const data = event.data.json();
    console.log('Push Bildirimi Alındı', data);

    const options = {
        body: data.body,
        // İkon URL'si: Canlı URL'nizi kullanmak en iyisidir, şimdilik placeholder.co'yu kullanmaya devam edebiliriz.
        icon: 'https://placehold.co/192x192/0056b3/ffffff?text=M', 
        vibrate: [100, 50, 100],
        data: {
            // DÜZELTME: Artık sabit bir localhost adresi yok. Tarayıcının ana sayfasını açmasını istiyoruz.
            url: self.location.origin // Service Worker'ın yüklendiği ana URL'yi kullan
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
        // clients.openWindow ile bildirime tıklandığında sayfayı aç
        clients.openWindow(event.notification.data.url)
    );
});