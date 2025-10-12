// public/client.js

// ÖNEMLİ: Bu Public Key, server.js dosyasındaki VAPID Public Key ile BİREBİR aynı olmalı.
// LÜTFEN KENDİ ÜRETTİĞİN PUBLIC KEY'İ BURAYA YAPIŞTIR!
const VAPID_PUBLIC_KEY = 'BJf7f86K9hvKhUlLWJD7vYEKYz-L0bPoAk970Sq5vUbqGH7IBS3pohfD3yISoO0csGB7_V8AwRFiJwzI9G8C9cQ'; 

// Public Key'i Uint8Array formatına dönüştüren yardımcı fonksiyon
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// ----------------------------------------------------
// BİLDİRİM İZNİ VE ABONELİK YÖNETİMİ
// ----------------------------------------------------

let swRegistration = null; // Service Worker kaydını tutmak için

// 1. Service Worker Kaydını ve İlk Abonelik İsteğini Başlat
function initializePush() {
    if ('serviceWorker' in navigator) {
        // Sayfa yüklenmesini beklemeden hemen kaydı başlat
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => {
                console.log('Service Worker Kaydı Başarılı.', reg);
                swRegistration = reg; // Kaydı değişkene ata
                
                // Mevcut aboneliği kontrol et ve yoksa abone etmeyi dene
                checkSubscription(reg); 
            })
            .catch(err => console.error('Service Worker Kaydı Başarısız:', err));
    } else {
        console.warn("Bu tarayıcı Service Worker'ı desteklemiyor.");
    }
}

// 2. Mevcut Aboneliği Kontrol Et ve Durumu Güncelle
function checkSubscription(registration) {
    registration.pushManager.getSubscription()
        .then(subscription => {
            if (subscription) {
                console.log('Kullanıcı zaten abone.', subscription);
                updateButtonStatus(true);
                sendSubscriptionToServer(subscription); // Sunucuya gönder (DB'de olduğundan emin olmak için)
            } else {
                console.log('Kullanıcı abone değil, izin gerekiyor.');
                // İzin durumu "default" ise (hiç sorulmadıysa) izin iste
                if (Notification.permission === 'default') {
                    subscribeUser(registration); 
                } else if (Notification.permission === 'denied') {
                    updateButtonStatus(false, 'İzin Engellendi', '#ef4444');
                } else { // Granted (izin verildi) ama abonelik yoksa tekrar dene
                    subscribeUser(registration);
                }
            }
        });
}


// 3. Kullanıcıyı Bildirime Abone Et ve Sunucuya Kaydet
function subscribeUser(registration) {
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    
    registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
    })
    .then(subscription => {
        console.log('Kullanıcı Abone Edildi:', subscription);
        sendSubscriptionToServer(subscription); 
        updateButtonStatus(true);
    })
    .catch(err => {
        console.error('Kullanıcı Abone Edilemedi (İzin Gerekli/Reddedildi):', err);
        updateButtonStatus(false, 'Bildirim İzni Verilmedi', '#ef4444');
    });
}

// 4. Abonelik Bilgisini Sunucuya Gönder (Node.js'e)
function sendSubscriptionToServer(subscription) {
    fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
    })
    .then(response => response.json())
    .then(data => console.log('Abonelik sunucuya kaydedildi:', data))
    .catch(error => console.error('Abonelik kaydı hatası:', error));
}

// 5. Buton Durumunu Güncelle
function updateButtonStatus(isSubscribed, text = '🔔 Bildirimler Açık', color = '#10b981') {
    const btn = document.getElementById('subscribeBtn');
    if (btn) {
        btn.textContent = text;
        btn.style.backgroundColor = color;
        // Eğer abone değilse butona tıklama olayı ekle
        if (!isSubscribed) {
             btn.onclick = () => {
                if (swRegistration) {
                     // Butona tıklandığında tekrar izin iste
                    subscribeUser(swRegistration); 
                }
            };
        } else {
            btn.onclick = null; // Abone ise butona tıklama olayını kaldır
        }
    }
}


// Sayfa yüklendiğinde başlat (load yerine DOMContentLoaded de kullanılabilir)
document.addEventListener('DOMContentLoaded', initializePush);