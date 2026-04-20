# Guitar Config Manager

Simple Tkinter app to manage Artists -> Songs -> Tunings with PostgreSQL backend.

Quick start (run DB in Docker, run app locally):

1. Start Postgres in Docker:

```bash
docker compose up -d db
```

2. Install Python deps and run locally:

```bash
python -m pip install -r requirements.txt
python run_app.py
```

Or run the app in Docker (GUI may need X forwarding):

```bash
docker compose up --build app
```
