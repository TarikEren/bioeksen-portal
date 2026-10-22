/**
 * The Turkish text of the group `lookup` (stage B4, IFU-50, IFU-51, IFU-60,
 * IFU-62, IFU-70, DEC-074, DEC-098, DEC-122).
 *
 * `tr.ts` includes this object as `lookup`, and `lookup-en.ts` is typed against
 * it. Three maps are typed against the code of the lookup, so that a new member
 * fails the type check here:
 *
 * - `issues` has one sentence for each phrase of `LOOKUP_ISSUES`
 *   (`src/lib/schemas/lookup.ts`). The page builds the map by phrase from it
 *   (`lookup-failure.ts`), and the dictionary never copies a phrase.
 * - `outcomes` has a title and a text for each outcome other than `RESOLVED`
 *   (IFU-70 rule 5).
 * - `errors` holds the sentence of each failure code, by step: a code can mean
 *   another rule in the code step than in the verification step (`VAL-4006`).
 *
 * `notice` is the draft consent text of the owner's mockup (DEC-098). The legal
 * function writes the final text (DEC-074). A change of the text changes
 * `EIFU_LEGAL_NOTICE_VERSION`.
 */
import type { LOOKUP_ISSUES, UnresolvedOutcome } from "@/lib/schemas/lookup";

/** One sentence for each phrase of `LOOKUP_ISSUES`. A missing or an extra key fails the type check. */
type IssueTexts = Readonly<Record<keyof typeof LOOKUP_ISSUES, string>>;

/** A title and a text for each outcome other than `RESOLVED`. */
type OutcomeTexts = Readonly<Record<UnresolvedOutcome, { readonly title: string; readonly body: string }>>;

const issues = {
  required: "Bu alan zorunludur.",
  outOfRange: "Değer çok uzun.",
  noticeNotAccepted: "Devam etmek için açık rızayı onaylayın.",
  noticeVersionNotCurrent: "Bilgilendirme metni değişti. Sayfayı yenileyin, yeni metni okuyun ve yeniden onaylayın.",
  codeWrong: "Kod doğru değil.",
  verificationNotFound: "Bu doğrulama bulunamadı. Baştan başlayın.",
} as const satisfies IssueTexts;

const outcomes = {
  CATALOG_NUMBER_NOT_FOUND: {
    title: "Katalog numarası bulunamadı",
    body: "Bu katalog numarası kayıtlarımızda yok. Numarayı ürünün kutusunda yazdığı gibi girdiğinizi kontrol edin.",
  },
  LOT_NOT_FOUND: {
    title: "LOT numarası bulunamadı",
    body: "Bu katalog numarası için bu LOT numarası kayıtlarımızda yok. LOT numarasını, büyük ve küçük harfler dahil, kutuda yazdığı gibi girin.",
  },
  LOT_CATALOG_MISMATCH: {
    title: "LOT numarası başka bir katalog numarasına ait",
    body: "Bu LOT numarası, girdiğiniz katalog numarasına ait değil. Katalog numarasını ve LOT numarasını kutudan yeniden kontrol edin.",
  },
  LOT_DATE_CONFLICT: {
    title: "LOT'un üretim tarihi doğrulanamadı",
    body: "Bu LOT'un üretim tarihi kayıtlarımızda doğrulanamadı. Doğru kullanım talimatını şimdi veremiyoruz. Bioeksen ile iletişime geçin.",
  },
  NO_APPLICABLE_VERSION: {
    title: "Bu LOT için geçerli bir kullanım talimatı yok",
    body: "Bu LOT'un üretim tarihinde yürürlükte olan bir kullanım talimatı sürümü bulunamadı. Bioeksen ile iletişime geçin.",
  },
  AMBIGUOUS_APPLICABILITY: {
    title: "Birden fazla kullanım talimatı sürümü geçerli görünüyor",
    body: "Bu LOT için hangi sürümün geçerli olduğunu şimdi belirleyemiyoruz. Bioeksen ile iletişime geçin.",
  },
  NO_FILE_FOR_VERSION: {
    title: "Kullanım talimatı dosyası yok",
    body: "Bu LOT için geçerli sürüm belirlendi, ancak bu sürümün indirilebilir bir dosyası yok. Bioeksen ile iletişime geçin.",
  },
  OVERRIDE_TARGET_NOT_PUBLISHED: {
    title: "Bu LOT için seçilen sürüm yayında değil",
    body: "Bu LOT için belirlenen kullanım talimatı sürümü şu anda yayında değil. Bioeksen ile iletişime geçin.",
  },
} as const satisfies OutcomeTexts;

export const lookupTr = {
  title: "Kullanım talimatını bulun",
  intro:
    "Ürünün katalog numarasını ve LOT numarasını girin. Size o LOT için geçerli olan kullanım talimatı sürümünü gösteririz: en yeni sürümü değil, LOT'un üretildiği tarihte geçerli olan sürümü.",
  verify: {
    title: "Ürünü ve e-posta adresinizi girin",
    catalogNumber: "Katalog numarası",
    catalogNumberHint: "Kutunun üzerinde yazar. Örnek: BS-GHPV-L-100",
    lotNumber: "LOT numarası",
    lotNumberHint: "Kutunun üzerinde yazar. Büyük ve küçük harfleri yazıldığı gibi girin.",
    email: "E-posta adresi",
    emailHint: "Doğrulama kodu bu adrese gelir. Erişim kaydı için gereklidir. Size pazarlama iletisi gönderilmez.",
    consent: "Bu metni okudum ve kişisel verilerimin burada belirtilen amaçlarla işlenmesine açık rıza veriyorum.",
    submit: "Doğrulama kodu gönder",
    submitting: "Kod gönderiliyor…",
  },
  notice: {
    title: "Kişisel verilerin işlenmesi hakkında bilgilendirme ve açık rıza",
    version: "Metin sürümü {version}",
    draft: "Bu metin taslaktır ve Bioeksen hukuk biriminin onayını beklemektedir.",
    intro:
      "Kullanım talimatına erişmeden önce e-posta adresinizi doğrularız. Aşağıda hangi verinin neden işlendiği, ne kadar saklandığı ve haklarınızın ne olduğu yazılıdır.",
    collected: {
      title: "İşlenen veriler",
      body: "E-posta adresiniz, IP adresiniz, sorguladığınız katalog ve LOT numarası, size sunulan kullanım talimatı sürümü ve işlemin zamanı. Adınızı ve soyadınızı isterseniz verirsiniz; zorunlu değildir.",
    },
    purpose: {
      title: "İşleme amacı ve hukuki sebep",
      body: "Veriler iki sebeple işlenir: (1) in vitro tanı ürünleri mevzuatının gerektirdiği izlenebilirlik — hangi kullanım talimatı sürümünün kime sunulduğunun gösterilebilmesi ve gerektiğinde saha güvenlik bildirimi yapılabilmesi; (2) bu metinle verdiğiniz açık rızanız. Size pazarlama iletisi gönderilmez.",
    },
    retention: {
      title: "Saklama süresi",
      body: "Sizi tanımlayan alanlar 10 yıl saklanır ve süre dolduğunda geri döndürülemez biçimde silinir. Erişim kaydının kendisi — hangi ürün, hangi LOT, hangi sürüm, ne zaman — kimlik bilgisi olmadan saklanmaya devam eder. Tanımlayıcı alanlar veritabanında şifreli tutulur ve yalnızca yetkili bir kişi tarafından, gerekçesi kayda geçirilerek görüntülenebilir.",
    },
    rights: {
      title: "Haklarınız",
      body: "KVKK md. 11 uyarınca verilerinize erişme, düzeltilmesini ve silinmesini isteme hakkınız vardır. Talebinizi kvkk@bioeksen.com.tr adresine iletebilirsiniz. Silme talebiniz üzerine sizi tanımlayan alanlar temizlenir; izlenebilirlik yükümlülüğü sebebiyle erişim kaydının kendisi kimliksiz olarak kalır.",
    },
    withdraw: {
      title: "Rızanın geri alınması",
      body: "Açık rızanızı istediğiniz zaman aynı adresten geri alabilirsiniz. Geri alma ileriye etkilidir; mevzuatın saklamayı zorunlu kıldığı hâllerde ilgili kayıt kimliksiz olarak saklanmaya devam eder.",
    },
  },
  code: {
    title: "E-posta adresinizi doğrulayın",
    sent: "{email} adresine altı haneli bir kod gönderdik. Kod 10 dakika geçerlidir.",
    label: "Doğrulama kodu",
    hint: "Kodu, kullanım talimatını kimin aldığını güvenilir biçimde kaydedebilmek için istiyoruz.",
    submit: "Doğrula ve talimatı getir",
    submitting: "Doğrulanıyor…",
    restart: "Baştan başla",
    attempts: "Kalan deneme hakkı: {count}",
    exhausted: "Deneme hakkınız bitti. Baştan başlayın.",
  },
  result: {
    title: "Sonuç",
    catalogNumber: "Katalog numarası",
    lotNumber: "LOT numarası",
    manufacturingDate: "Üretim tarihi",
    productName: "Ürün",
    documentTitle: "Belge",
    documentNumber: "Belge numarası",
    revision: "Revizyon",
    overrideNote: "Bu LOT için yetkili bir kullanıcı belirli bir belge sürümü tanımlamıştır.",
    files: "İndirilebilir dosyalar",
    documentType: "Kullanım talimatı",
    fileLink: "{type}, {language}, PDF",
    newLookup: "Başka bir LOT sorgula",
  },
  languages: {
    tr: "Türkçe",
    en: "İngilizce",
    de: "Almanca",
    fr: "Fransızca",
    es: "İspanyolca",
  },
  outcomeCode: "Sonuç kodu: {code}",
  outcomes,
  issues,
  errors: {
    verify: {
      "VAL-4001": "Katalog numarası, LOT numarası veya e-posta adresi eksik.",
      "VAL-4006": "Bir veya daha fazla değer geçersiz. Alanların altındaki açıklamalara bakın.",
      "UP-5500": "Doğrulama kodu e-postası gönderilemedi: posta hizmeti şu anda yanıt vermiyor. Biraz sonra yeniden deneyin.",
      "UP-5501": "Doğrulama kodu e-postası gönderilemedi: posta hizmeti zamanında yanıt vermedi. Biraz sonra yeniden deneyin.",
      "UP-5000": "Doğrulama kodu e-postası gönderilemedi: posta hizmeti iletiyi kabul etmedi. E-posta adresini kontrol edin.",
    },
    code: {
      "VAL-4006": "Doğrulama kodu geçersiz.",
      "RES-4302":
        "Bu doğrulama artık kullanılamaz. Kod kullanılmış, süresi dolmuş veya deneme hakkı bitmiş olabilir. Kod e-postası gönderilememiş de olabilir. Baştan başlayın.",
      "DB-5001": "Erişim kaydı yazılamadığı için kullanım talimatı verilmedi. Yeniden deneyin.",
    },
  },
};
