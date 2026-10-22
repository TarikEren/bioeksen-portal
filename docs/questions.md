# Sorular

Bu dosya, `docs/specs/` içindeki kararların sahiplerine sorulan soruları
içerir. Her soru, cevap gelene kadar yürürlükte olan kuralı ve cevabın neden
önemli olduğunu belirtir. Bir sorunun numarası, bu dosya var olduğu sürece
değişmez. Bir cevap geldiğinde `docs/specs/README.md` içindeki **How to change
a decision** adımları uygulanır.

Her sorunun altındaki `**For:**` satırı ilgili kararları, `**Owner:**` satırı
soruyu cevaplayacak sahibi gösterir. Cevap `**Answer:**` satırına, tarih ve
cevaplayan kişiyle birlikte yazılır. Sahip kodları `docs/specs/README.md`
içindeki **Owners** listesindedir: `PO` ürün sahibi, `QA` kalite birimi, `LEG`
hukuk birimi, `PM` ürün yönetimi, `IT` altyapı ve operasyon ekibi, `SDS`
`bioeksen-sds` standartlarının sahibi BioEksen Ar-Ge.

## 1. Verilerin Türkiye'de tutulması ve KVKK

Proje sahipliği, 7 Eylül 2026'da tüm üretim verisinin Türkiye'de kaldığını ve
yurt dışına aktarım planlanmadığını onayladı. Yazılım ekibi yazılı bir hukuki
görüş görmedi. Verilerin Türkiye'de tutulması, e-IFU erişim kayıtları için
KVKK gerekliliklerini karşılıyor mu? Lütfen bunu yazılı olarak onaylayın.

Yürürlükteki kural: tüm üretim verisi Türkiye'dedir. Kişisel veri alan her
harici hizmet, kullanılmadan önce sizin onayınızı gerektirir.

**For:** DEC-006. **Owner:** LEG.

**Answer:**

## 2. Alan retleri ve sorgu sonuçları için hata kodları

`bioeksen-sds` kod kaydı kapalı bir listedir. Bu kaydın **Domain failures**
bölümüne göre, istemcinin birbirinden ayırması gereken bir ret, bir alan
önekiyle tanımlanmış kendi kodunu gerektirir. Kamuya açık sorgu sayfası
sonuçlarını birbirinden ayırmak zorundadır: bilinmeyen katalog numarası,
bilinmeyen LOT, başka bir katalog numarasına ait LOT, incelemedeki tarih,
uygulanabilir revizyonun olmaması. Arka ofis de bazı retleri ayırmak zorundadır:
açık geçerlilik dönemiyle çakışan bir başlangıç tarihi, taslak olmayan bir
revizyon gibi.

Üç soru:
1. Doğru kodla yapılan bir sorgunun, `outcome` alanıyla 200 dönmesini kabul
   ediyor musunuz? Gerekçe: sonuç, isteğin bir hatası değil, sorgunun
   kendisidir. Bu, `app-endpoints.md` içindeki **Methods** kuralından (bir POST
   bir şey oluşturuyorsa 201) ayrılır: sorgu bir erişim kaydı yazar, ancak
   istemci bu kayda erişemez.
2. Arka ofis retleri için `code-prefixes.md` listesine `EIFU` (ve `CAT`) öneki
   eklemek istiyor musunuz? Yoksa bu retler, kural `message` içinde olacak
   şekilde `RES-4302` ve `VAL-4006` olarak mı kalsın? Yürürlükteki kural,
   var olan ama koşulu sağlamayan bir kaydı gösteren alan için de (örneğin
   taslak bir revizyona yönlendirme) `VAL-4006` kullanır. Bu, seçim
   prosedürünün 19. adımını geniş yorumlar.
3. İş tarihlerinin (üretim tarihi, geçerlilik tarihi) saati ve saat dilimi
   yoktur. Bu tarihlerin JSON içinde `YYYY-MM-DD` biçiminde taşınmasını kabul
   ediyor musunuz? `standard-api-endpoints.md` içindeki tür tablosu her tarihe
   bir saat dilimi farkı verir.

Yürürlükteki kurallar: sorgular `outcome` ile 200 döner; arka ofis retleri,
kural `message` ve log kaydının son ekinde olacak şekilde `RES-4302` ve
`VAL-4006` kullanır; iş tarihleri `YYYY-MM-DD` biçimindedir.

**For:** DEC-013, DEC-039, DEC-073. **Owner:** SDS.

**Answer:**

## 3. Yazılım kimliği

`sds-commit`, uygulamanın yazılım kimliğini her `Change-Id:` satırına,
`sds-logging` ise her log kaydına koyar. Bu kimlik tahmin edilmez, tahsis
edilir. Bioeksen Portal'ın yazılım kimliği nedir?

Yürürlükteki kural: paket adı olan `bioeksen-portal`.

**For:** DEC-021. **Owner:** SDS.

**Answer:**

## 4. Bir ürün nedir

573 katalog numarası içeren katalog dökümü 322 ürüne gruplandı. Bir ürün,
boyut eki çıkarılmış katalog numarasıdır: `BS-STI-L-100` ve `BS-STI-L-25`,
`BS-STI-L` ürünüdür. Aynı kök kodun `IVD` ve `RUO` türevleri iki ayrı üründür.
Ürün yönetimi bu gruplamayı hiç onaylamadı. Gruplama doğru mu?

Yürürlükteki kural: yukarıdaki gruplama. Neden önemli: ürün, bir kullanım
talimatının (IFU) uygulandığı birimdir (bkz. 9. soru) ve bir eğitimin
kapsadığı birimdir.

**For:** DEC-040. **Owner:** PM.

**Answer:**

## 5. LOT numarasındaki tarih kuralı

Bir LOT numarası, baştaki `B` harfinden sonra üretim tarihini `YYAAGG`
biçiminde içerir: `B2603091224GHPVV`, 9 Mart 2026'da üretilmiştir. Bu kural,
Bioeksen'in tüm ürün grupları için bugün ve gelecekte geçerli mi? Beyan edilen
bir tarih LOT numarasındaki tarihten farklıysa, ikisinden hiçbirinin
geçerli sayılmaması ve bir kişi tarihi düzeltene kadar sorguların bu LOT'u
reddetmesi doğru mu?

Yürürlükteki kural: iki sorunun cevabı da evet. Kurala uymayan bir LOT
numarası reddedilir. İki farklı tarihi olan bir LOT, düzeltilene kadar
sorguda sonuç vermez.

**For:** DEC-044, DEC-046. **Owner:** QA.

**Answer:**

## 6. Kayıtlı bir LOT'un tarihiyle çelişen günlük içe aktarım

Günlük bir içe aktarım, kayıtlı bir LOT'u farklı bir tarihle getirebilir. İki
kural mümkündür:
1. İçe aktarım o satır için hiçbir şey yazmaz ve bir çakışma bildirir. Kayıtlı
   LOT, bir kişi işlem yapana kadar tarihini korur ve sorguda sonuç vermeye
   devam eder.
2. Kayıtlı LOT hemen işaretlenir ve bir kişi düzeltene kadar sorguda sonuç
   vermez.

2. kural yanlış bir tarihe karşı daha güvenlidir. 1. kural ise tek bir günlük
dosyadaki yazım hatasına karşı daha güvenlidir; aksi hâlde kullanımdaki bir
LOT erişilemez hâle gelir. Hangi kural doğru?

Yürürlükteki kural: 1. kural.

**For:** DEC-047. **Owner:** QA.

**Answer:**

## 7. Sonunda parti rakamları olan kit kodu

Kit kodu kontrolü, LOT numarasının sonunu beklenen kodla karşılaştırır.
Beklenen kod, ürünün kit kodu kökü ile formata ait bir harften oluşur. Gerçek
verilerde kodun arkasında parti rakamları vardır: `SYV49` ve `SYV1`,
`KKEV1V49` ve `KKEV1V`. Basit bir "ile biter" kontrolü bunları reddeder.
Yürürlükteki kural, beklenen kodun arkasında sıfır veya daha fazla rakama izin
verir. Bu kural, kökü bir rakamdan önce biten bir kodu da kabul eder (örneğin
`H` kökü ve `H5` ile biten LOT). Kural doğru mu? Lütfen 322 ürünün kit kodu
köklerini de gönderin ve eski ADR-0013'teki dört aykırı durumu
(`BS-SY-MX24T-25`, `BS-HSV-25R`, `CCHFVD01100` ve `GHS-CF03S`) teyit edin.

Yürürlükteki kural: beklenen kod ve arkasında sıfır veya daha fazla rakam. Kit
kodu kökü olmayan bir ürün kontrol edilmez.

**For:** DEC-048. **Owner:** PM.

**Answer:**

## 8. Tek LOT formunda kit kodu uyuşmazlığı

İçe aktarımda bir kit kodu uyuşmazlığı hiçbir kayıt yazmaz. Tek LOT formunda
ise bir kişi LOT'u yazar ve uyuşmazlığı görebilir. Bu kişinin uyuşmazlığı
onaylayıp LOT'u kaydedebilmesi, onayın da denetim kaydına yazılması doğru mu?
Yoksa form, içe aktarım gibi LOT'u reddetmeli mi?

Yürürlükteki kural: kişi onaylar ve LOT kaydedilir.

**For:** DEC-050. **Owner:** QA.

**Answer:**

## 9. Bir ürünün tüm katalog numaraları için tek kullanım talimatı

Bir kullanım talimatı bir ürüne uygulanır; bu yüzden bir ürünün tüm katalog
numaraları aynı kullanım talimatını alır. Ancak format, aynı ürün içinde
değişebilir: `BS-HP-25` vCAP, `BS-HP-25R` ise sıvı formattadır. Bioeksen her
formatın kendi kullanım talimatı olduğunu belirtti. Bir ürünün tüm katalog
numaraları aynı kullanım talimatını mı paylaşır? Paylaşmıyorsa, ürünler
formata göre mi ayrılmalı, yoksa kullanım talimatı katalog numarasına mı
uygulanmalı?

Yürürlükteki kural: her ürün için tek kullanım talimatı. Tekil bir istisnayı
LOT yönlendirmesi karşılar.

**For:** DEC-060. **Owner:** QA.

**Answer:**

## 10. Tarihi incelemede olan ve yönlendirmesi bulunan LOT

Tarihleri çelişen bir LOT, düzeltilene kadar sorguda sonuç vermez. Bir LOT
yönlendirmesi ise tarihine bakmadan bir LOT'u belirli bir revizyona gönderir.
Bir LOT'ta ikisi birden varsa, yürürlükteki kural sorguyu reddeder: LOT'un
kaydı incelemededir, bu yüzden kayda ait hiçbir bilgiye güvenilmez. Bu doğru
mu, yoksa yönlendirme mi geçerli olmalı?

Yürürlükteki kural: sorgu bu LOT'u reddeder.

**For:** DEC-067. **Owner:** QA.

**Answer:**

## 11. Portaldan önce üretilmiş LOT'lar

Bioeksen, portaldan önceki kullanım talimatlarını yüklememeye karar verdi.
Yayımlanmış ilk revizyondan önce üretilmiş bir LOT, "uygulanabilir revizyon
yok" cevabını alır. Bu, verideki gerçek bir boşlukla aynı cevaptır. Bu LOT'lar
için ayrı bir cevap istiyor musunuz? Örneğin: "Bu LOT, elektronik kullanım
talimatından öncedir; lütfen basılı prospektüse bakın."

Yürürlükteki kural: diğer boşluklarla aynı cevap.

**For:** DEC-068. **Owner:** PO.

**Answer:**

## 12. Aydınlatma metni

Sorgu, kodu göndermeden önce bir aydınlatma metni gösterir. Metin şunları
belirtmelidir: toplanan veriler, iki hukuki dayanak (açık rıza ve IVDR
izlenebilirliği), on yıllık saklama süresi, şifreleme, denetlenen erişim ve
silme talebinin nasıl yapılacağı. Mevcut metin bir taslaktır ve sayfa onu
taslak olarak işaretler. Lütfen nihai Türkçe ve İngilizce metni yazın veya
onaylayın. Onay, `EIFU_LEGAL_NOTICE_VERSION` değerini değiştirir. Taslağa
verilen onaylar, taslağın sürüm numarasıyla kayıtlı kalır.

Yürürlükteki kural: taslak olarak işaretlenmiş taslak metin.

**For:** DEC-074. **Owner:** LEG.

**Answer:**

## 13. Sorgunun ambalaja basılacak adresi

Sorgu sayfası `/eifu` yolundadır. Bu adres ambalaja basıldıktan sonra bir daha
değiştirilemez. Üretim ortamının alan adı nedir? Basılmadan önce tam adresi
onaylıyor musunuz?

Yürürlükteki kural: üretim alan adında `/eifu`.

**For:** DEC-075. **Owner:** PO.

**Answer:**

## 14. IVDR izlenebilirliği varken silme talebi

Bir erişim kaydının hukuki dayanağı hem açık rıza hem de IVDR
izlenebilirliğidir ve kişinin kimliği gereklidir. Açık rıza geri alınabilir;
yasal bir yükümlülük geri alınamaz. Bir kişi silme talep ettiğinde,
yürürlükteki kural kişinin kimlik bilgilerini tamamen siler. Bir kayıt için
geçerli dayanak IVDR yükümlülüğüyse, silme talebinin reddedilmesi gerekebilir.
Sistemde bir ret yolu yoktur. Lütfen iki hukuki dayanağı onaylayın ve bir
silme talebinin hiç reddedilip reddedilmeyeceğini belirtin.

Yürürlükteki kural: kimliği sistem dışında doğrulanan her silme talebi tamamen
uygulanır.

**For:** DEC-079, DEC-082. **Owner:** LEG.

**Answer:**

## 15. On yıllık saklama süresi

Bir erişim kaydındaki kişi kimliği on yıl saklanır, sonra sistem onu siler.
Erişim olayının kendisi saklanmaya devam eder. Lütfen on yıllık süreyi, IVDR
teknik dokümantasyon saklama süresine ve bir saha güvenlik bildiriminin bir
kişiye ulaşması için gereken süreye göre onaylayın.

Yürürlükteki kural: 3.653 gün olarak hesaplanan on yıl.

**For:** DEC-080. **Owner:** LEG.

**Answer:**

## 16. Anahtarların saklandığı yer

Kimlik anahtar halkası, sorgu biberi (pepper) ve yedek kimliği, kimlik
bilgilerinin ve yedeklerin şifresini çözer. Bunlar asla yedeklerin yanında
saklanmamalıdır. İki emanetçi kimdir, her kopya nerede saklanır ve
emanetçiler kopyalarını açabildiklerini ne sıklıkla doğrular?

Yürürlükteki kural: adı belirli iki emanetçi bu üç sırrı sunucu dışında
saklar. Bir anahtar, hiçbir kayıt onu göstermediğinde halkadan çıkar. Emanete
verilmiş kopyası, daha eski yedeklerin süresi dolana kadar saklanır
(DEC-088).

**For:** DEC-083. **Owner:** IT.

**Answer:**

## 17. Sayfa görüntüleme ve tıklama analitiği

Eski tasarım her sayfa görüntülemeyi ve her tıklamayı, bir tarayıcı
tanımlayıcısı ve şifreli istemci adresiyle birlikte kaydediyordu. Bu, daha
fazla kişisel veri demektir. Bunu 1. sürümde istiyor musunuz, yoksa toplu
sorgu raporu yeterli mi?

Yürürlükteki kural: 1. sürümde sayfa görüntüleme ve tıklama analitiği yok.

**For:** DEC-084. **Owner:** PO.

**Answer:**

## 18. Eğitimlere gömülü video

Bioeksen eğitim videolarını YouTube'da yayımlıyor. Bu videoları Akademi'ye
gömmek, oynat düğmesine basan bir öğrencinin IP adresini Türkiye dışındaki bir
sağlayıcıya gönderir. Sayfa bir kapak görseli gösterir ve sağlayıcıya yalnızca
oynatma anında bağlanır. Verilerin Türkiye'de tutulması kuralına getirilen bu
istisnayı kabul ediyor musunuz? Lütfen bunun için Akademi'nin aydınlatma
metnini yazın.

Yürürlükteki kural: açıklandığı şekilde, kapak arkasında gömülü video;
aydınlatma metni henüz yok.

**For:** DEC-108. **Owner:** LEG.

**Answer:**

## 19. Kendi sunucumuzda barındırılan video ve altyazılar

Eski belgeler çelişiyor: biri kendi sunucumuzda barındırılan bir video
bloğunu koruyor, diğeri bu bloğu reddediyor. Kendi sunucumuzdaki bir video
için altyazı zorunlu tutulabilir; gömülü bir video için tutulamaz. 2. sürümde
kendi sunucumuzda barındırılan bir video bloğu istiyor musunuz? İstemiyorsanız,
videoyu izleyemeyen bir öğrenci için iki dilde yazılmış bir özet yeterli mi?

Yürürlükteki kural: 2. sürümde kendi sunucumuzda barındırılan video bloğu yok;
her gömülü videonun iki dilde bir özeti vardır.

**For:** DEC-109. **Owner:** PO.

**Answer:**

## 20. Yedeklerin saklama süresi

Sunucu, gecelik yedeklerin 7 gününü saklar. Türkiye'deki sunucu dışı bir depo
ise 90 gününü saklar. Sunucu dışındaki yedekler ne kadar süre saklanmalı?

Yürürlükteki kural: 90 gün.

**For:** DEC-035. **Owner:** QA.

**Answer:**

## 21. Geri yükleme ve sonrasındaki silme talepleri

Bir geri yükleme, veritabanını yedeğin alındığı andaki hâline döndürür. O
andan sonra silinmiş bir kimlik bilgisi de geri gelir. Yürürlükteki kurala
göre, uygulama trafiğe açılmadan önce bu silme işlemlerinin her biri yeniden
uygulanır. Bunun için yöneticinin veritabanı dışında sakladığı talep
referansları kullanılır. Bu yeterli mi, yoksa sistem geri yüklemeden
etkilenmeyen bir silme kaydı mı tutmalı? Böyle bir kayıt, bir kişinin kamuya
açık sorguyu kullandığını kimsenin öğrenmesine izin vermemelidir.

Yürürlükteki kural: yönetici, saklanan referanslarla silme işlemlerini yeniden
uygular.

**For:** DEC-036. **Owner:** LEG.

**Answer:**

## 22. En büyük yazı boyutu

Oturum açmış bir kullanıcı daha büyük bir yazı boyutu seçebilir. WCAG'nin yazı
boyutunu değiştirme kriteri (1.4.4) yüzde 200 üzerine kuruludur. Eski tasarım
yüzde 150'de duruyordu. En büyük adımın yüzde 200 olmasını kabul ediyor
musunuz?

Yürürlükteki kural: yüzde 75, 87,5, 100, 112,5, 125, 150 ve 200 adımları.

**For:** DEC-037. **Owner:** PO.

**Answer:**

## 23. İzleme ve uyarılar

Başarısız bir e-posta gönderimi, kimsenin kullanım talimatına ulaşamaması
demektir; bu yüzden e-posta teslimi izlenmelidir. Türkiye içinde hangi izleme
altyapısını ve hangi uyarı kanalını kullanıyorsunuz? Uyarıyı kim alır?

Yürürlükteki kural: IT, uygulamayı sunucu dışından bir erişilebilirlik
kontrolüyle ve uygulamanın log kayıtlarıyla izler. Başarısız bir e-posta
gönderiminden sonraki 15 dakika içinde IT'ye uyarı gelir.

**For:** DEC-034. **Owner:** IT.

**Answer:**

## 24. Uygulama içi log kaydedici

`sds-logging`, TypeScript uygulamalarının log kayıtlarını `@bioeksen/sdk` ile
yazmasını ve kayıtları log toplayıcıya göndermesini ister. Bu paket şu anda bu
uygulama için kullanılamıyor. Uygulama bu yüzden kendi küçük log kaydedicisini
kullanır: kayıtları `log-record.md` biçiminde stdout'a ve yerel
`platform_log_record` tablosuna yazar, log toplayıcıya hiçbir şey göndermez.
Denetim kayıtları ayrıca `platform_audit_record` tablosuna yazılır. Bu
istisnayı kabul ediyor musunuz? `@bioeksen/sdk` bu uygulama için ne zaman
kullanılabilir olacak?

Yürürlükteki kural: uygulama içi log kaydedici; `@bioeksen/sdk` gelince
değiştirilir ve gönderilmemiş kayıtlar toplayıcıya gönderilir.

**For:** DEC-127. **Owner:** SDS.

**Answer:**

## 25. Dağıtım yöntemi

Eski şartnameye göre `main` dalına yapılan her birleştirme, uygulamayı test
ortamına dağıtıyordu. `sds-ci` ise dağıtımın bir sürüm etiketiyle ve IT'nin
dağıtım deposu üzerinden yapılmasını ister; uygulama deposunda dağıtım işi
bulunmaz. Test ortamına dağıtım için bu yöntemi uygulayacak mısınız? Test
ortamı ve dağıtım deposu ne zaman hazır olur?

Yürürlükteki kural: bir sürüm etiketi, IT'nin dağıtım deposu üzerinden
dağıtımı başlatır. `main` dalına birleştirme hiçbir şeyi dağıtmaz.

**For:** DEC-128. **Owner:** IT.

**Answer:**

## 26. Nesne deposunun genel adresi

Sorgu sonucu, kullanım talimatı dosyaları için 5 dakika geçerli imzalı
indirme bağlantıları verir. Bu bağlantılar nesne deposunun adresini içerir.
Uygulamanın kullandığı depo adresi yalnızca iç ağdan erişilebilirse,
ziyaretçiler dosyayı indiremez. Nesne deposunun internetten erişilebilen bir
adresi var mı? Varsa bu adres nedir?

Yürürlükteki kural: imzalı bağlantılar `S3_PUBLIC_ENDPOINT_URL` adresini
kullanır; bu ayar yoksa `S3_ENDPOINT_URL` kullanılır.

**For:** DEC-132. **Owner:** IT.

**Answer:**
