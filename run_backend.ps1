cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
if (!(Test-Path .env)) { copy .env.example .env }
python run.py
