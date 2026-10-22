/**
 * The Turkish dictionary: the source of the keys (FND-08 rule 1).
 *
 * `en.ts` takes its type from this file, so a key that is here and not in
 * `en.ts` fails `pnpm run typecheck` (FND-08.AC1). The text of a failure
 * follows DEC-122 and is added with the pages that show it.
 *
 * Stage B0 holds the keys of the contract and the text of a failed language
 * change (`common.language.failure`, `common.errorCode`, `common.errors`,
 * `common.callFailed`, DEC-122). Stage B1 adds the groups `signIn`,
 * `invitation`, `passwordReset`, `backoffice`, `users`, `roles` and `noArea`,
 * and `common.signOut`.
 *
 * `common.errors` is keyed by code. A page group may hold its own `errors` map
 * for a code that needs another sentence in that page (for example `AUTH-4101`
 * on the sign-in page); the page merges it over `common.errors`. A code with no
 * entry shows the sentence of `SYS-5000`. `common.fieldIssues` is keyed by the
 * fixed phrase that the server puts in `details` for a field (DEC-122), and
 * `common.passwordRules` by the password rule (ACC-10.AC5). `common.errorCode`
 * is a template: the component fills `{code}` with `fmt`.
 */
export const tr = {
  common: {
    language: {
      tr: "Türkçe",
      en: "English",
      switch: "Dil",
      failure: "Dil değiştirilemedi.",
    },
    errorCode: "Hata kodu: {code}",
    errors: {
      "AUTH-4100": "Oturumunuz bulunamadı. Yeniden oturum açın.",
      "AUTH-4101": "Kimlik bilgileri geçersiz.",
      "AUTH-4102": "Bağlantının süresi dolmuş.",
      "PERM-4150": "Bu işlem için yetkiniz yok.",
      "VAL-4001": "Gerekli bir değer eksik.",
      "VAL-4002": "Seçilen değer desteklenmiyor.",
      "VAL-4006": "Bir veya daha fazla değer geçersiz.",
      "VAL-4007": "İstek tanınmayan bir alan içeriyor.",
      "RES-4200": "Kayıt bulunamadı.",
      "RES-4300": "Bu kayıt zaten var.",
      "RES-4302": "Bu işlem kaydın şu anki durumunda yapılamaz.",
      "RATE-4400": "Çok fazla deneme yapıldı. Biraz bekleyip yeniden deneyin.",
      "SYS-5000": "Beklenmeyen bir hata oluştu.",
      "SYS-5500": "Hizmet şu anda hazır değil. Biraz sonra yeniden deneyin.",
    },
    callFailed: "İşlem tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.",
    fieldInvalid: "Değer geçerli değil.",
    fieldIssues: {
      "is required": "Bu alan zorunludur.",
      "is out of range": "Değer izin verilen aralığın dışında.",
      "has the wrong format": "Değerin biçimi geçersiz.",
      "is not one of the allowed values": "Seçilen değer desteklenmiyor.",
    },
    passwordRules: {
      tooShort: "En az 15 karakter olmalı.",
      tooLong: "En çok 128 karakter olabilir.",
      holdsEmail: "E-posta adresinizi içermemeli.",
      common: "Sık kullanılan parolalar listesinde yer almamalı.",
      current: "Mevcut parolanızdan farklı olmalı.",
    },
    signOut: "Çıkış yap",
    saving: "Kaydediliyor…",
    breadcrumbs: "Sayfa yolu",
  },
  home: {
    title: "Bioeksen Portal",
    intro: "Kullanım talimatlarına ve yönetim alanına buradan ulaşırsınız.",
    signInTitle: "Yönetim alanı",
    signInDescription: "Bioeksen çalışanları ve yetkili kullanıcılar hesaplarıyla oturum açar.",
    signIn: "Oturum aç",
  },
  signIn: {
    title: "Oturum aç",
    description: "Bioeksen Portal hesabınızla oturum açın.",
    email: "E-posta adresi",
    password: "Parola",
    submit: "Oturum aç",
    submitting: "Oturum açılıyor…",
    forgotPassword: "Parolamı unuttum",
    errors: {
      "AUTH-4101": "E-posta adresi veya parola hatalı.",
    },
  },
  invitation: {
    title: "Parolanızı belirleyin",
    description: "Hesabınızı açmak için bir parola belirleyin.",
    password: "Yeni parola",
    passwordHint: "En az 15 karakter. E-posta adresinizi içermemeli.",
    submit: "Parolayı kaydet",
    doneTitle: "Parolanız kaydedildi",
    doneBody: "Şimdi oturum açabilirsiniz.",
    signIn: "Oturum aç sayfasına git",
    errors: {
      "AUTH-4101": "Bu davet bağlantısı kullanılmış veya geçersiz.",
      "AUTH-4102": "Bu davet bağlantısının süresi dolmuş. Yöneticinizden yeni bir davet isteyin.",
    },
  },
  passwordReset: {
    request: {
      title: "Parola sıfırlama",
      description: "E-posta adresinizi girin. Hesabınız etkinse, parolayı sıfırlamak için bir bağlantı gönderilir.",
      email: "E-posta adresi",
      submit: "Sıfırlama bağlantısı iste",
      doneTitle: "İstek alındı",
      doneBody: "Bu e-posta adresi etkin bir hesaba aitse, parolayı sıfırlamak için bir bağlantı gönderildi.",
    },
    backToSignIn: "Oturum aç sayfasına dön",
    complete: {
      title: "Yeni parola belirleyin",
      description: "Hesabınız için yeni bir parola belirleyin.",
      password: "Yeni parola",
      passwordHint: "En az 15 karakter. Mevcut parolanızdan farklı olmalı.",
      submit: "Parolayı değiştir",
      doneTitle: "Parolanız değiştirildi",
      doneBody: "Şimdi yeni parolanızla oturum açabilirsiniz.",
      signIn: "Oturum aç sayfasına git",
      errors: {
        "AUTH-4101": "Bu sıfırlama bağlantısı kullanılmış veya geçersiz.",
        "AUTH-4102": "Bu sıfırlama bağlantısının süresi dolmuş. Yeni bir bağlantı isteyin.",
      },
    },
  },
  backoffice: {
    title: "Başlangıç",
    brandArea: "Yönetim",
    skipToContent: "Ana içeriğe geç",
    nav: {
      label: "Ana gezinme",
      home: "Başlangıç",
      users: "Kullanıcılar",
      groups: {
        identity: "Kimlik ve erişim",
      },
    },
    userMenu: {
      label: "Hesap menüsü",
      trigger: "Hesap menüsü: {name}",
    },
    welcome: "Hoş geldiniz, {name}",
    intro: "Çalışmak istediğiniz alanı seçin.",
    areasTitle: "Erişebildiğiniz alanlar",
    areaPending: "Bu alan sonraki aşamada açılacak.",
    areas: {
      users: {
        title: "Kullanıcılar",
        description: "Kullanıcıları davet edin, durumlarını ve rollerini yönetin.",
      },
      catalog: {
        title: "Ürün kataloğu",
        description: "Ürünleri, katalog numaralarını ve LOT kayıtlarını yönetin.",
      },
      documents: {
        title: "Kullanım talimatları",
        description: "Kullanım talimatı belgelerini ve sürümlerini yönetin.",
      },
      reports: {
        title: "Erişim raporu",
        description: "Kullanım talimatı erişimlerinin özetini görüntüleyin.",
      },
    },
  },
  users: {
    title: "Kullanıcılar",
    summary: "Kullanıcı sayısı: {count}",
    newUser: "Yeni kullanıcı",
    table: "Kullanıcı listesi",
    columns: {
      name: "Ad soyad",
      email: "E-posta adresi",
      language: "Dil",
      status: "Durum",
      created: "Oluşturulma",
    },
    status: {
      active: "Etkin",
      inactive: "Pasif",
    },
    empty: "Henüz kullanıcı yok.",
    pagination: {
      label: "Sayfalama",
      previous: "Önceki sayfa",
      next: "Sonraki sayfa",
      page: "Sayfa {page}",
    },
    forbidden: {
      title: "Bu sayfaya erişim yetkiniz yok",
      body: "Bu sayfayı görüntülemek için gereken izne sahip değilsiniz.",
    },
    errors: {
      "RES-4300": "Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.",
      "RES-4200": "Kullanıcı bulunamadı.",
      "RES-4302": "Bu işlem kullanıcının şu anki durumunda yapılamaz.",
    },
    create: {
      title: "Yeni kullanıcı",
      description: "Kullanıcıya hesabını açması için bir davet e-postası gönderilir.",
      email: "E-posta adresi",
      firstName: "Ad",
      lastName: "Soyad",
      preferredLanguage: "Tercih edilen dil",
      languagePlaceholder: "Bir dil seçin",
      submit: "Kullanıcıyı oluştur ve davet et",
      cancel: "Vazgeç",
    },
    detail: {
      title: "Kullanıcı ayrıntıları",
      email: "E-posta adresi",
      language: "Tercih edilen dil",
      status: "Durum",
      password: "Parola",
      passwordSet: "Belirlendi",
      passwordNotSet: "Henüz belirlenmedi, davet bekleniyor",
      created: "Oluşturulma",
      updated: "Son değişiklik",
      actionsTitle: "Hesap işlemleri",
      noActions: "Bu kullanıcı için yapılabilecek bir hesap işlemi yok.",
      ownAccount: "Bu sizin hesabınız. Kendi hesabınızı pasifleştiremez ve kendinize rol veremezsiniz.",
      reinvite: {
        button: "Daveti yeniden gönder",
        done: "Yeni davet gönderildi. Önceki bağlantı artık çalışmaz.",
      },
      deactivate: {
        button: "Hesabı pasifleştir",
        confirmTitle: "Hesap pasifleştirilsin mi?",
        confirmBody: "Kullanıcının tüm oturumları sona erer ve kullanıcı oturum açamaz. Kayıt silinmez.",
        confirm: "Pasifleştir",
        cancel: "Vazgeç",
        done: "Hesap pasifleştirildi.",
      },
    },
  },
  roles: {
    title: "Roller",
    list: "Etkin roller",
    none: "Bu kullanıcının etkin bir rolü yok.",
    grantedAt: "Verilme zamanı: {date}",
    revoke: "Geri al",
    revokeLabel: "{role} rolünü geri al",
    revokeDone: "Rol geri alındı.",
    grant: {
      label: "Rol",
      placeholder: "Bir rol seçin",
      submit: "Rolü ver",
      nothingToGrant: "Verilebilecek başka rol yok.",
      done: "Rol verildi.",
    },
    errors: {
      "PERM-4150": "Bu rol işlemi için yetkiniz yok. Kendi hesabınıza rol veremezsiniz.",
      "RES-4300": "Kullanıcı bu role zaten sahip.",
      "RES-4200": "Kullanıcı veya rol ataması bulunamadı.",
      "RES-4302": "Pasif bir kullanıcıya rol verilemez.",
    },
  },
  noArea: {
    title: "Hesabınıza henüz bir alan tanımlanmadı",
    body: "Hesabınız etkin, ancak henüz erişebileceğiniz bir alan yok. Yöneticinizden hesabınıza bir rol vermesini isteyin.",
  },
};

/** The shape of a dictionary: the keys of `tr`, with text values. */
export type Dictionary = DeepText<typeof tr>;

type DeepText<TSource> = {
  [TKey in keyof TSource]: TSource[TKey] extends string ? string : DeepText<TSource[TKey]>;
};
