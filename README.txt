CM-ITA Information Technology Announcement System (BSIT)

1. Logo:     replace frontend/public/logo.png with your own picture (PNG, square works best)
2. Backend:  cd backend
             npm install
             npm run hash -- "your-admin-password"
             -> paste the printed ADMIN_PASSWORD_HASH='...' line into backend/.env (replace the paste-the-hash-here line)
             npm run dev
3. Frontend: (second terminal) cd frontend
             npm install
             npm run dev
4. Open http://localhost:5173   (Ollama app must be running for AI; model: ollama pull llama3.2:3b)

--- Update notes ---
* Categories are now: Event, Deadline, General (Academic removed). Old "academic" posts become "general" automatically on the next backend start.
* Each post shows the date it was posted. A post can have a Deadline date (shows "x days left" / "Passed"), a Link, and a PDF (5 MB max).
* The AI Draft also fills in the deadline and any link in your notes. The chat assistant tells students the posted date and deadline.
* Website colors are read from frontend/public/logo.png (green + maroon for the current logo). Replace the logo and the colors follow.

--- Admin accounts (database only) ---
* The website has NO sign-up. Accounts exist only in the PostgreSQL table "admins".
* On first start, the old admin from .env is copied into the database automatically (you can then ignore ADMIN_* in .env).
* Add an account:   cd backend  then  npm run admin -- add juan "Strong-Password1" "Juan Dela Cruz"
  Other commands:   passwd, disable, enable, remove, list   (run: npm run admin)
* Or do it in pgAdmin: open backend/sql/admins.sql, paste a block into the Query Tool, press F5.
* Who posted what: in pgAdmin open Views > announcement_log > View/Edit Data > All Rows
  (every announcement with poster name, date posted, deadline, and who last edited it).
