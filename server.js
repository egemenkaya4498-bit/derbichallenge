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
app.use(express.static(path.join(__dirname, 'public')));
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
    console.error("❌ MONGODB_URI çevre değişkeni ayarlanmamış! Lütfen Render'da bu değişkeni tanımlayın.");
    // Eğer yerelde çalışıyorsak, burayı yerel URI ile değiştirebilirsin:
    mongoose.connect('mongodb+srv://kayanet_admin:5KRrAwwUBJzLn-v@kayanet.1irxrur.mongodb.net/?retryWrites=true&w=majority&appName=kayanet')
} else {
    mongoose.connect(mongoUri)  
    .then(() => console.log('✅ MongoDB Bağlantısı Başarılı.'))
    .catch(err => console.error('❌ MongoDB Bağlantı Hatası: Lütfen MONGODB_URI ve MongoDB Atlas Ağ Erişimi ayarlarınızı kontrol edin.', err));
}


const OlaySchema = new mongoose.Schema({
    macAdi: { type: String, required: true },
    dakika: { type: Number, required: true },
    oyuncu: { type: String, required: true },
    olayTuru: { type: String, required: true },
    takim: { type: String, required: true }, 
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
    process.env.VAPID_PUBLIC_KEY || 'BJf7f86K9hvKhUlLWJD7vYEKYz-L0bPoAk970Sq5vUbqGH7IBS3pohfD3yISoO0csGB7_V8AwRFiJwzI9G8C9cQ', 
    process.env.VAPID_PRIVATE_KEY || 'A6WEygRmhseSlza202UrI0qslh6gs19EZ9foLhvbbEs' 
);

// ----------------------------------------------------
// ROTLAR (Routes)
// ----------------------------------------------------

// ... (ROTALAR - Önceki kodun aynısı) ...
// 1. ANA SAYFA ROTASI
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

// 3. ADMIN PANELİ ROTASI
app.get('/admin/passwordEkEgemen123', async (req, res) => {
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
    try {
        const yeniOlay = new MacOlay({ dakika, oyuncu, olayTuru, macAdi, takim });
        await yeniOlay.save();
        const subscriptions = await PushSubscription.find({});
        
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

        const bildirimVaatleri = subscriptions.map(sub => 
            webpush.sendNotification(sub.toObject(), payload)
                .catch(err => {
                    if (err.statusCode === 410) {
                        return PushSubscription.deleteOne({ endpoint: sub.endpoint });
                    }
                    console.error('Bildirim gönderilemedi:', err.statusCode, sub.endpoint);
                    return null;
                })
        );

        await Promise.all(bildirimVaatleri);

        console.log(`🚀 Bildirim gönderildi: ${notificationTitle}`);
        res.redirect('/admin/passwordEkEgemen123');
        
    } catch (error) {
        console.error('Olay ekleme veya bildirim gönderme hatası:', error);
        res.status(500).send("Olay eklenirken hata oluştu.");
    }
});
// 5. TÜM MAÇ OLAYLARINI SIFIRLAMA API'SI
app.post('/api/sifirla', async (req, res) => {
    try {
        const result = await MacOlay.deleteMany({});
        console.log(`🗑️ Veritabanı Sıfırlandı! Silinen olay sayısı: ${result.deletedCount}`);
        res.status(200).json({ success: true, message: `${result.deletedCount} olay silindi.` });
    } catch (error) {
        console.error('Veritabanı sıfırlanırken hata oluştu:', error);
        res.status(500).json({ success: false, message: 'Veritabanı sıfırlanamadı.' });
    }
});

// Sunucuyu başlat (Artık dinamik PORT kullanıyoruz)
app.listen(PORT, () => {
    // Render'da portu yazdırır, yerelde localhost'u
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`);
    console.log(`🔑 Admin Paneli (Sadece Senin İçin): /admin`);
    console.log("----------------------------------------------------");

});



