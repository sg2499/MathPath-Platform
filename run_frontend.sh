#!/usr/bin/env bash
set -e
cd frontend
npm install
[ -f .env.local ] || cp .env.example .env.local
npm run dev
