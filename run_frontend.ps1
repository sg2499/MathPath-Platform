cd frontend
npm install
if (!(Test-Path .env.local)) { copy .env.example .env.local }
npm run dev
