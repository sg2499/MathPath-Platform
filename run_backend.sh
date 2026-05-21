#!/usr/bin/env bash
set -e
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
[ -f .env ] || cp .env.example .env
python run.py
