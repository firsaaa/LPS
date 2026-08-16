# Ringkasan Naratif Pengujian — LPS EDMS

Pengujian dijalankan dalam tiga lapisan: **API** (siapa boleh mengakses/melakukan apa), **Basis Data** (apakah data tersimpan dan terhubung dengan benar), dan **Performa** (apakah sistem tetap cepat dan tahan saat data serta penggunanya bertambah). Seluruhnya dijalankan di lingkungan basis data terpisah, bukan di data asli maupun di sistem yang sedang dipakai publik.

**Perkembangan skor**: 39/53 (putaran pertama) → 51/53 (setelah 7 perbaikan kode) → 52/53 (setelah fitur penautan dokumen dibangun) → **53/53 (setelah indeks pencarian ditambahkan)**.

## Semua perbaikan yang diterapkan, diverifikasi ulang (bukan cuma diklaim):

1. **Batas unggah 200MB tercapai**, dengan pemakaian memori server yang wajar untuk berkas besar.
2. **Menghapus proyek yang berisi dokumen ditolak** — mencegah kehilangan dokumen permanen tidak sengaja.
3. **Dua celah kewenangan ditutup** (backdoor approval Inspector; bypass upload Superadmin).
4. **Permintaan API tanpa login dijawab jelas** (401), bukan dialihkan diam-diam.
5. **Tiga kode status HTTP yang keliru dirapikan** jadi konsisten dengan penolakan kewenangan lain.
6. **Fitur penautan dokumen antar-fase (Bab VI.1.5 naskah) dibangun** — model data, panel di halaman detail dokumen, dan perhitungan metrik cakupan penelusuran per proyek.
7. **Pencarian judul/kode dokumen dipercepat** lewat indeks trigram (pg_trgm) — dari memindai seluruh tabel jadi memakai indeks, tanpa mengubah cara kerja pencarian bagi pengguna.

## Dua catatan penting yang wajib dibaca penulis sebelum sidang:

**Soal fitur penautan dokumen (poin 6):** definisi dua metrik yang dihitung sistem (persentase dokumen yang sudah tertaut, dan persentase pasangan fase yang saling terhubung) adalah **interpretasi wajar dari nama metriknya**, dibuat tanpa akses ke rumus persis di Bab III/VI naskah skripsi. Penulis **wajib mencocokkan sendiri** definisi ini ke naskah sebelum dipakai sebagai bukti pencapaian tujuan penelitian. Fitur ini juga baru dibangun — belum ada data pemakaian sungguhan, jadi kedua angka metrik akan menunjukkan 0% sampai pengguna proyek mulai menautkan dokumen sungguhan.

**Soal beban bersamaan** (bukan bagian dari 53 titik ini, tapi relevan): pola timeout pada 10-20 pengguna bersamaan tidak lagi muncul di pengujian ulang setelah perbaikan kode, tapi karena tidak ada perbaikan yang secara langsung menyasar penyebab dugaannya (batas sambungan basis data default), hasil bersih ini kemungkinan besar variasi antar-percobaan, bukan bukti pasti masalahnya tuntas. Menaikkan batas sambungan basis data tetap disarankan untuk kepastian jangka panjang — belum diterapkan karena butuh perubahan konfigurasi production, bukan migrasi/kode.
