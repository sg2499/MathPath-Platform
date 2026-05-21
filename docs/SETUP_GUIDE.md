# Setup Guide

## Backend

cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

## Database

psql -U postgres -d mathpath -f ../db/schema.sql
psql -U postgres -d mathpath -f ../db/seed_ylm_phase1.sql

## Frontend

cd frontend
npm install
npm run dev
