# mtv-etalimai — Google orqali bosh admin kirishi

Google Identity Services orqali saytning alohida parolisiz kirish tayyorlangan.
Ishga tushirish uchun ushbu saytga tegishli Google OAuth **Web Client ID** kerak.
Google paroli yoki Client Secret saytga berilmaydi.

## Sozlash

1. Google Cloud loyihasida Google Auth Platform → Clients → Create client.
2. Application type: Web application. Name: `mtv-etalimai-admin`.
3. Authorized JavaScript origins: `https://mtv.etalimai.uz`.
4. Sayt popup callback ishlatadi; redirect URI talab qilinmaydi.
5. Google consent sozlamasida faqat asosiy identity (openid, email, profile) kerak.
   Ilova Testing holatida bo‘lsa, ikki bosh adminni test users ro‘yxatiga kiriting.
6. Cloudflare `mtv-etalimai` Worker sozlamasida `GOOGLE_CLIENT_ID` qiymatini bering.
   Mavjud DATABASE_URL, AUTH_SESSION_SECRET va boshqa qiymatlarni o‘zgartirmang.
7. `/admin`ni ochib, Google tugmasida ruxsat etilgan akkauntni tanlang.

## Ruxsatlar

Faqat `ilxomovb2023@gmail.com` va `etalim@appsheet.uz` himoyalangan bosh admin hisoblanadi.
Server Google imzosini, issuer, audience, token muddati, tasdiqlangan e-mail va
shu brauzerga tegishli nonce qiymatini tekshiradi. Appsheet manzili uchun Google
Workspace `hd=appsheet.uz` tasdig‘i kerak. Oddiy e-mail matni admin sessiyasini yaratmaydi.

Google sozlanmaguncha mavjud parol usuli zaxira sifatida saqlanadi.
Haqiqiy Google akkaunti bilan yakuniy kirish sinovi Client ID ulangach bajariladi.

Manbalar:
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/reference/js-reference

## Mahalliy tekshiruv

`node --experimental-strip-types --test tests/mtv-etalimai-google-identity.test.mjs`

Sinovlar faqat sun’iy, vaqtinchalik kalitlar va test tokenlaridan foydalanadi.
Ishlab turgan bazaga hech qanday test yozuvi qo‘shilmaydi.
