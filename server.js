// Gerekli Kütüphaneler
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser'); 
const webpush = require('web-push');
const path = require('path');

// Port ayarı: Yerelde 3000, dışarıda Render'ın atadığı portu kullan
const PORT = process.env.PORT || 3000; 

const app = express();

// Middleware'ler
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'))); // client.js ve service-worker.js için

// ----------------------------------------------------
// VERİTABANI BAĞLANTISI VE ŞEMA (MODEL) TANIMLAMA
// ----------------------------------------------------
// MongoDB URI'sini ÇEVRE DEĞİŞKENLERİNDEN AL
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
    console.error("❌ MONGODB_URI çevre değişkeni ayarlanmamış! Lütfen Render'da bu değişkeni tanımlayın.");
} else {
    mongoose.connect(mongoUri)  
    .then(() => console.log('✅ MongoDB Bağlantısı Başarılı.'))
    .catch(err => console.error('❌ MongoDB Bağlantı Hatası: ', err));
}


const OlaySchema = new mongoose.Schema({
    macAdi: { type: String, required: true },
    dakika: { type: Number, required: true },
    oyuncu: { type: String, required: true },
    olayTuru: { type: String, required: true }, // "Gol", "Kirmizi Kart", "Kadrolar Açıklandı"
    takim: { type: String, required: true }, // "Fenerbahçe", "Trabzonspor" vb.
    createdAt: { type: Date, default: Date.now }
});
const MacOlay = mongoose.model('MacOlay', OlaySchema);

// Abonelikleri saklamak için Şema
const SubscriptionSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    keys: { type: Object, required: true }
});
const PushSubscription = mongoose.model('PushSubscription', SubscriptionSchema);


// ----------------------------------------------------
// WEB PUSH AYARLARI (Bildirimler İçin)
// ----------------------------------------------------
// VAPID KEY'leri ÇEVRE DEĞİŞKENLERİNDEN AL
webpush.setVapidDetails(
    'mailto:egemenkaya4498@gmail.com',
    process.env.VAPID_PUBLIC_KEY, 
    process.env.VAPID_PRIVATE_KEY 
);

// ----------------------------------------------------
// ROTLAR (Routes)
// ----------------------------------------------------

// 1. ANA SAYFA ROTASI (Kullanıcıların Gördüğü Yer)
app.get('/', async (req, res) => {
    try {
        const olaylar = await MacOlay.find({ macAdi: 'Fenerbahçe - Trabzonspor' }).sort({ dakika: 1 });
        res.render('index', { olaylar: olaylar }); 
    } catch (error) {
        console.error("Olaylar çekilemedi: ", error);
        res.status(500).send("Hata oluştu.");
    }
});

// 2. ABONE KAYIT API'SI
app.post('/api/subscribe', async (req, res) => {
    const subscription = req.body;
    try {
        const existingSub = await PushSubscription.findOne({ endpoint: subscription.endpoint });
        
        if (!existingSub) {
            const newSub = new PushSubscription(subscription);
            await newSub.save();
            console.log('🔔 Yeni kullanıcı abone oldu.');
            res.status(201).json({ success: true, message: 'Abone kaydedildi.' });
        } else {
            res.status(200).json({ success: true, message: 'Zaten abone.' });
        }
    } catch (error) {
        console.error('Abonelik kaydı hatası:', error);
        res.status(500).json({ success: false, message: 'Abonelik kaydedilemedi.' });
    }
});

// 3. ADMIN PANELİ ROTASI (Sana Özel Panel)
app.get('/admin', async (req, res) => {
    try {
        const subscriptionsCount = await PushSubscription.countDocuments();
        res.render('admin', { subscriptionsCount: subscriptionsCount });
    } catch (error) {
        console.error("Admin paneli hazırlanırken hata oluştu:", error);
        res.status(500).send("Hata oluştu.");
    }
});

// 4. OLAY EKLEME VE BİLDİRİM GÖNDERME API'SI
app.post('/api/olay-ekle', async (req, res) => {
    const { dakika, oyuncu, olayTuru, macAdi, takim } = req.body; 

    // 1. Olayı Veritabanına Kaydetme
    try {
        const yeniOlay = new MacOlay({ dakika, oyuncu, olayTuru, macAdi, takim });
        await yeniOlay.save();

        // 2. Tüm aboneleri DB'den çek
        const subscriptions = await PushSubscription.find({});
        
        // 3. BİLDİRİM İÇERİĞİNİ OLUŞTUR
        let notificationTitle = '';
        let notificationBody = '';

        if (olayTuru === 'Kadrolar Açıklandı') {
            notificationTitle = `${macAdi} - KADROLAR!`;
            notificationBody = "İlk 11'ler belli oldu! Hemen kontrol et.";
        } else {
            notificationTitle = `${takim} ${olayTuru}! (${macAdi})`;
            notificationBody = `${takim} | ${oyuncu} (${dakika}.dk): ${olayTuru}!`;
        }
        
        const payload = JSON.stringify({ title: notificationTitle, body: notificationBody });

        // 4. TÜM ABONELERE BİLDİRİM GÖNDER
        const bildirimVaatleri = subscriptions.map(sub => 
            webpush.sendNotification(sub.toObject(), payload)
                .catch(err => {
                    if (err.statusCode === 410) {
                        // Abonelik süresi dolmuş veya geçersizse DB'den sil
                        return PushSubscription.deleteOne({ endpoint: sub.endpoint });
                    }
                    console.error('Bildirim gönderilemedi:', err.statusCode, sub.endpoint);
                    return null;
                })
        );

        await Promise.all(bildirimVaatleri);

        console.log(`🚀 Bildirim gönderildi: ${notificationTitle}`);
        res.redirect('/admin');
        
    } catch (error) {
        console.error('Olay ekleme veya bildirim gönderme hatası:', error);
        res.status(500).send("Olay eklenirken hata oluştu.");
    }
});


// 5. TÜM MAÇ OLAYLARINI SIFIRLAMA API'SI
app.post('/api/sifirla', async (req, res) => {
    try {
        const result = await MacOlay.deleteMany({}); // Koleksiyondaki tüm belgeleri sil
        console.log(`🗑️ Veritabanı Sıfırlandı! Silinen olay sayısı: ${result.deletedCount}`);
        res.status(200).json({ success: true, message: `${result.deletedCount} olay silindi.` });
    } catch (error) {
        console.error('Veritabanı sıfırlanırken hata oluştu:', error);
        res.status(500).json({ success: false, message: 'Veritabanı sıfırlanamadı.' });
    }
});


// Sunucuyu başlat (Artık dinamik PORT kullanıyoruz)
app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`);
    console.log(`🔑 Admin Paneli (Sadece Senin İçin): /admin`);
    console.log("----------------------------------------------------");
});
