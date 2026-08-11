# Deploy LPS EDMS

## Kenapa Railway

Aplikasi ini menyimpan file yang diupload (dokumen, notulen) di **disk lokal**, bukan cloud storage — jadi host serverless murni seperti Vercel tidak cocok (disk-nya sementara, file yang diupload bisa hilang setiap kali redeploy). Butuh platform dengan **disk persisten**.

**Railway** dipilih karena:
- Deploy langsung dari GitHub, auto-build (tidak perlu setup Nginx/systemd/certbot manual seperti VPS).
- Volume persisten untuk folder upload.
- Postgres managed tinggal tambah dari dashboard, tidak perlu install & maintain sendiri.
- Tidak sleep/cold-start seperti tier gratis Render — penting supaya tidak mengganggu saat blackbox testing atau user testing.
- Biaya kecil & terprediksi (~$5/bulan plan Hobby setelah trial credit habis).

Kalau kamu punya GitHub Student Developer Pack, cek juga kredit gratis DigitalOcean/lainnya — tapi itu berarti setup manual VPS (lebih banyak langkah, lihat catatan di bagian bawah).

## Langkah Deploy

### 1. Push ke GitHub
Repo ini sudah punya git history & `.gitignore` yang benar (`.env` tidak ikut ter-commit). Tinggal:
```bash
git remote add origin <url-repo-github-kamu>
git add .
git commit -m "Prepare for deployment"
git push -u origin main
```

### 2. Buat project di Railway
1. Daftar/login di [railway.app](https://railway.app) (bisa pakai akun GitHub).
2. **New Project → Deploy from GitHub repo** → pilih repo ini.
3. Railway otomatis mendeteksi ini project Next.js dan akan build dengan Nixpacks.

### 3. Tambah Postgres
1. Di project yang sama, klik **New → Database → Add PostgreSQL**.
2. Railway otomatis membuat `DATABASE_URL` dan menyediakannya sebagai variable — nanti tinggal di-reference di service utama (langkah 5).

### 4. Tambah Volume untuk upload
1. Buka service aplikasi (bukan Postgres) → tab **Volumes** → **New Volume**.
2. Mount path: `/app/uploads`.
3. Ini memastikan file yang diupload tidak hilang saat redeploy.

### 5. Set Environment Variables
Di tab **Variables** service aplikasi, isi (lihat `.env.example` untuk penjelasan tiap variable):

| Variable | Nilai |
|---|---|
| `DATABASE_URL` | Reference ke Postgres plugin (Railway biasanya menawarkan ini otomatis — pilih "Add Reference" ke service Postgres) |
| `NEXTAUTH_SECRET` | Generate baru, **jangan pakai yang di `.env` lokal**. Jalankan `openssl rand -base64 32` di terminal, salin hasilnya |
| `NEXTAUTH_URL` | URL yang Railway kasih ke service ini, mis. `https://lps-edms-production.up.railway.app` (bisa dicek/diubah setelah deploy pertama, lalu redeploy) |
| `UPLOAD_DIR` | `/app/uploads` (harus sama persis dengan mount path volume di langkah 4) |
| `NODE_ENV` | `production` |

### 6. Set Start Command
Di tab **Settings** service aplikasi → **Deploy** → **Custom Start Command**, isi:
```
npm run start:prod
```
Ini menjalankan `prisma migrate deploy` otomatis setiap kali deploy (memastikan skema database selalu sinkron) sebelum menyalakan server — kamu tidak perlu menjalankan migrasi manual.

### 7. Deploy
Railway otomatis build & jalankan setelah semua variable diisi. Pantau tab **Deployments** untuk log build/start.

### 8. Buat akun awal
Database production **kosong** — seed script sengaja diblokir jalan otomatis di production (isinya password demo yang lemah, lihat `prisma/seed.ts`). Untuk akun pertama, ada dua opsi:
- **Opsi A (disarankan):** dari Railway dashboard, buka tab **Postgres → Data**, jalankan query manual untuk insert 1 user Super Admin (hash password dengan bcrypt dulu), lalu masuk sebagai dia dan buat user lain lewat Manajemen User di web.
- **Opsi B (kalau perlu data contoh untuk demo/testing):** jalankan `railway run --service <nama-service> npm run db:seed -- ALLOW_PROD_SEED=1` dari CLI Railway (`npm i -g @railway/cli` dulu) — ini akan membuat akun-akun demo (Team Leader/Engineer/Inspector/Client) dengan password bawaan. **Ganti password akun-akun ini sebelum user testing sungguhan**, karena passwordnya publik (tercantum di kode).

## Checklist sebelum blackbox/user testing

- [ ] `NEXTAUTH_SECRET` production BEDA dari yang di `.env` lokal
- [ ] Tidak ada akun dengan password bawaan seed (`admin123`, `password123`) yang masih aktif — atau kalau dipakai untuk demo, tester tahu itu sementara
- [ ] Volume upload sudah ter-mount (test: upload 1 dokumen, redeploy service, cek dokumennya masih ada)
- [ ] `NEXTAUTH_URL` sudah sesuai domain final (kalau nanti pakai custom domain, update ini lalu redeploy)
- [ ] Coba login dari HP/browser lain (bukan cuma localhost) untuk pastikan aksesnya benar-benar publik

## Alternatif: VPS sendiri

Kalau lebih suka kontrol penuh (atau punya kredit VPS gratis dari GitHub Student Pack): sewa VPS (DigitalOcean/Vultr, ~$5-6/bulan), install Node.js + PostgreSQL + Nginx + PM2 (buat menjaga proses tetap jalan) + Certbot (SSL gratis dari Let's Encrypt), lalu `git clone` repo ini, `npm install && npm run build`, jalankan dengan PM2, dan reverse-proxy lewat Nginx. Jauh lebih banyak langkah manual dan jadi tanggung jawab sendiri untuk update keamanan server — baru worth it kalau memang butuh kontrol penuh di luar kebutuhan testing TA.
