# Duck Hunt - AI Scavenger Hunt - An Impossible Game That Teaches Prompt Injection and Teamwork

## you may ask: why a monolith?

- because it doesnt need to be scalable this is like 150 ppl max atm

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
python3.9 -m venv .venv
source .venv/bin/activate
pip install -r fastapi/requirements.txt
```

5. create environment file

```bash
cd fastapi
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
alembic init alembic
```

8. update `alembic.ini` to point to your database

change the line in `alembic.ini`:

```ini
sqlalchemy.url = postgresql://your_username@localhost:5432/duck_hunt
```

(Again replace `your_username` with your actual macOS username.)

9. update `alembic/env.py` to import your models

```python
# target_metadata = None # comment this line
from models import Base  # import your models here
target_metadata = Base.metadata
```

10. create the initial migration

```bash
alembic revision --autogenerate -m "initial migration"
alembic upgrade head
cd ..
```

11. start the api

```bash
fastapi run main.py
```

### setup nextjs app

1. in a new terminal, create an .env file:

```bash
cp .env.example .env
```

2. add the api endpoint to `env`:

```bash
NEXT_PUBLIC_API_BASE_URL="http://localhost:8000/api"
```

4. in a new terminal, install dependencies

```bash
cd next-app
yarn install
```

5. run the nextjs app

```bash
yarn dev
```

### create a game

1. make a `POST` request to the api endpoint

```bash
curl -H "Content-Type: application/json"
    -H "api-key: your-api-key"
    -D "{}"
    "http://localhost:8000/api/create-game"
    --
```
