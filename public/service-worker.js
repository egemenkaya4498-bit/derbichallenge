// public/service-worker.js
self.addEventListener('push', event => {
    // Bildirim verisi geldiğinde çalışır
    const data = event.data.json();
    console.log('Push Bildirimi Alındı', data);

    // Service Worker'ın yüklendiği ana adresi alıyoruz (Render URL'in)
    const baseUrl = self.location.origin;

    const options = {
        body: data.body,
        icon: '${baseUrl}/img/noti.png', 
        vibrate: [100, 50, 100],
        // YENİ ÖZEL SES ALANI: Ses dosyasının tam yolu
        // public/sound/noti.mp3 dosyasını projenin ana klasörüne yüklemelisin.
        sound: `${baseUrl}/sound/noti.mp3`, 
        data: {
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
        clients.openWindow(event.notification.data.url)
    );
});