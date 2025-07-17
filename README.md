# Duck Hunt - AI Scavenger Hunt - An Impossible Game That Teaches Prompt Injection and Teamwork

## you may ask: why a monolith?

- because it doesnt need to be scalable this is like 50 ppl max ata

## setup python

1. install postgres on your machine

### macos:

```bash
brew install postgresql
```

2. create and activate virtual environment

```bash
cd fastapi
python3.9 -m venv .venv
source .venv/bin/activate
```

3. install dependencies

```bash
pip install -r fastapi/requirements.txt
```

4. setup alembic

```bash
alembic init alembic
alembic revision --autogenerate -m "initial migration"
alembic upgrade head
cd ..
```

### setup nextjs app

1. install dependencies

```bash
cd next-app
yarn install
cd ..
```

### start api

```bash
fastapi run main.py
```
