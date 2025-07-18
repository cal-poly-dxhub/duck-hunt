# Duck Hunt - AI Scavenger Hunt - An Impossible Game That Teaches Prompt Injection and Teamwork

## you may ask: why a monolith?

- because it doesnt need to be scalable this is like 50 ppl max ata

## setup python

1. install postgres on your machine

### macos:

```bash
brew install postgresql@17
```

2. start postgres

```bash
brew services start postgresql@17
```

3. create the database for duck hunt

```bash
createdb duck_hunt
```

4. create and activate virtual environment

```bash
cd fastapi
python3.9 -m venv .venv
source .venv/bin/activate
```

5. create environment file

```bash
cp .env.example .env
```

Then edit the `.env` file and update the database URL with your username:

```env
DATABASE_URL=postgresql://your_username@localhost:5432/duck_hunt
```

(Replace `your_username` with your actual macOS username. You can find it by running `whoami` in the terminal)

6. install dependencies

```bash
pip install -r requirements.txt
```

7. setup alembic

```bash
# Make sure you're in the fastapi directory
cd fastapi
alembic revision --autogenerate -m "initial migration"
alembic upgrade head
cd ..
```

8. start the api

```bash
fastapi run main.py
```

### setup nextjs app

1. in a new terminal, install dependencies

```bash
cd next-app
yarn install
```

2. run the nextjs app

```bash
yarn dev
```
