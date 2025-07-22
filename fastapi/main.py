import json
import os
import random
from datetime import datetime
from typing import Annotated, Any, Dict, List, Set, Union, Optional
from uuid import UUID

from bedrock import invoke_llm, verify_location_leak
from database import SessionLocal
from dotenv import load_dotenv
from models import CoordinateSnapshot, Game, Level, Message, Team, TeamLevel, User
from prompts import DIFFICULTY_PROMPTS, DIFFICULTY_MODEL_IDS
from pydantic import BaseModel

from fastapi import Body, FastAPI, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()


class CreateGameRequest(BaseModel):
    name: str
    description: str
    team_count: int
    level_count: int = 0  # Now optional, will be derived from config if provided
    team_names: Annotated[Union[list[str], None], Form()] = None
    config_file: Optional[str] = None
    # team_levels: Annotated[Union[list[int], None], Form()] = None

    """
    {
        "name": "test game 3",
        "description": "clambamwham",
        "level_count": 5,
        "team_count": 5
    }
    """


class MessageRequest(BaseModel):
    prompt: str

    """
    {
        "prompt": "what is the name of the location"
    }
    """


class PingCoordinatesRequest(BaseModel):
    latitude: float
    longitude: float

    """
    {
        "latitude": 37.7749,
        "longitude": -122.4194
    }
    """


class LevelData(BaseModel):
    character: dict[str, Any]
    location: dict[str, Union[str, float]]
    clues: dict[str, list[str]]
    max_tokens: int = 512


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ADMIN ROUTES


# level count includes starting point and ending point
@app.post("/api/create-game")
def create_game(
    request: CreateGameRequest, api_key: Annotated[Union[str, None], Header()] = None
) -> JSONResponse:
    if api_key != str(os.getenv("ADMIN_API_KEY")):
        raise HTTPException(status_code=401, detail="Invalid API key")

    db = SessionLocal()
    try:
        game_config = None
        if request.config_file:
            config_path = f"./fastapi/game_configs/{request.config_file}"
            if not os.path.exists(config_path):
                raise HTTPException(status_code=404, detail=f"Config file not found: {request.config_file}")
            with open(config_path, "r") as f:
                game_config = json.load(f)
            request.level_count = len(game_config)

        if request.level_count < 1:
            raise HTTPException(status_code=400, detail="A game must have at least one level.")

        new_game = Game(
            name=request.name,
            description=request.description,
        )
        db.add(new_game)
        db.flush()

        levels: List[Level] = [
            Level(game_id=new_game.id) for _ in range(request.level_count)
        ]
        
        if game_config:
            level_data_map = {}
            for i, (level_key, level_data) in enumerate(game_config.items()):
                level_id = levels[i].id
                level_data_map[level_id] = level_data
                level_dir = f"./fastapi/games/{new_game.id}/levels"
                os.makedirs(level_dir, exist_ok=True)
                file_path = f"{level_dir}/{level_id}.json"
                with open(file_path, "w") as f:
                    json.dump(level_data, f, indent=4)

        # handle custom team names
        if request.team_names and len(request.team_names) == request.team_count:
            teams: List[Team] = [
                Team(game_id=new_game.id, name=name)
                for name in request.team_names[: request.team_count]
            ]
        else:
            teams: List[Team] = [
                Team(game_id=new_game.id, name=f"Team {i + 1}")
                for i in range(request.team_count)
            ]

        # add levels and teams to db
        for level in levels:
            db.add(level)
        for team in teams:
            db.add(team)

        db.flush()

        # separate first, middle, and last levels
        first_level: Level = levels[0]
        last_level: Level = levels[-1]
        middle_levels: List[Level] = levels[1:-1] if len(levels) > 2 else []

        used_levels_by_index: Dict[int, Set[str]] = {
            i: set() for i in range(len(middle_levels))
        }

        # set team levels, prioritizing uniqueness in order per team
        # first and last levels are the same for all teams
        team_levels: List[TeamLevel] = []
        for team in teams:
            assigned_levels: List[Level] = [
                first_level
            ]  # all teams start with same level
            used_levels_for_this_team: Set[str] = {str(first_level.id)}

            # assign middle levels (scrambled per team)
            for position_index in range(len(middle_levels)):
                # find levels not yet used at this position AND not used by this team
                available_levels: List[Level] = [
                    level
                    for level in middle_levels
                    if (
                        str(level.id) not in used_levels_by_index[position_index]
                        and str(level.id) not in used_levels_for_this_team
                    )
                ]

                # if no levels available with both constraints, prioritize team uniqueness
                if not available_levels:
                    available_levels = [
                        level
                        for level in middle_levels
                        if str(level.id) not in used_levels_for_this_team
                    ]

                # if still no levels available, reset position constraint
                if not available_levels:
                    used_levels_by_index[position_index] = set()
                    available_levels = [
                        level
                        for level in middle_levels
                        if str(level.id) not in used_levels_for_this_team
                    ]
                if not available_levels:
                    available_levels = middle_levels
                    used_levels_for_this_team = {str(first_level.id)}

                selected_level: Level = random.choice(available_levels)
                assigned_levels.append(selected_level)

                used_levels_by_index[position_index].add(str(selected_level.id))
                used_levels_for_this_team.add(str(selected_level.id))

            # add last level (same for all teams)
            assigned_levels.append(last_level)

            # create team_level entries
            for i, level in enumerate(assigned_levels):
                team_level: TeamLevel = TeamLevel(
                    team_id=team.id,
                    level_id=level.id,
                    index=i,
                )
                team_levels.append(team_level)

        for team_level in team_levels:
            db.add(team_level)

        os.makedirs(f"./fastapi/games/{new_game.id}/levels", exist_ok=True)
        with open(f"./fastapi/games/{new_game.id}/game.json", "w") as gameFile:
            game_info: dict[str, Any] = {
                "id": new_game.id.__str__(),
                "name": new_game.name,
                "description": new_game.description,
                "teamLinks": [
                    f"{os.getenv('FRONTEND_URL')}?team-id={t.id}" for t in teams
                ],
                "levelLinks": [
                    f"{os.getenv('FRONTEND_URL')}?level-id={l.id}" for l in levels
                ],
            }
            json.dump(game_info, gameFile, indent=4)
        db.commit()

        return JSONResponse(
            content={
                "message": f"Game '{request.name}' with {request.level_count} levels and {request.team_count} teams created successfully.",
                "game_id": str(new_game.id),
            },
            media_type="application/json",
        )

    except Exception as e:
        db.rollback()
        print(f"Error creating game: {str(e)}")
        return JSONResponse(
            content={"error": str(e)},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()


@app.delete("/api/end-game/{game_id}")
def end_game(
    game_id: str, api_key: Annotated[Union[str, None], Header()] = None
) -> JSONResponse:
    if api_key != str(os.getenv("ADMIN_API_KEY")):
        raise HTTPException(status_code=401, detail="Invalid API key")

    db = SessionLocal()
    try:
        # soft delete the game
        game: Game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise HTTPException(status_code=404, detail="Game not found")
        game.deleted_at = datetime.now()
        db.add(game)

        # soft delete all levels and teams and messages
        db.query(Level).filter(Level.game_id == game_id).update(
            {"deleted_at": datetime.now()}
        )
        db.query(Team).filter(Team.game_id == game_id).update(
            {"deleted_at": datetime.now()}
        )
        db.query(TeamLevel).filter(TeamLevel.team.has(game_id=game_id)).update(
            {"deleted_at": datetime.now()}
        )
        db.query(Message).filter(Message.game_id == game_id).update(
            {"deleted_at": datetime.now()}
        )
        db.commit()
        return JSONResponse(
            content={
                "message": f"Game '{game_id}' ended successfully.",
            },
            media_type="application/json",
        )
    except Exception as e:
        db.rollback()
        print(f"Error ending game: {str(e)}")
        return JSONResponse(
            content={"error": str(e)},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()


@app.put("/api/level/{level_id}")
def upload_level_data(
    level_id: str,
    level_data: LevelData,
    api_key: Annotated[Union[str, None], Header()] = None,
) -> JSONResponse:
    if api_key != str(os.getenv("ADMIN_API_KEY")):
        raise HTTPException(status_code=401, detail="Invalid API key")

    db = SessionLocal()
    try:
        level: Level = db.query(Level).filter(Level.id == level_id).first()
        if not level:
            raise HTTPException(status_code=404, detail="Level not found")

        game_id = level.game_id
        level_dir = f"./fastapi/games/{game_id}/levels"
        os.makedirs(level_dir, exist_ok=True)

        file_path = f"{level_dir}/{level_id}.json"
        with open(file_path, "w") as f:
            json.dump(level_data.model_dump(), f, indent=4)

        return JSONResponse(
            content={"message": f"Level data for level {level_id} uploaded successfully."},
            media_type="application/json",
        )
    except Exception as e:
        print(f"Error uploading level data: {str(e)}")
        return JSONResponse(
            content={"error": str(e)},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()


# TEAM ROUTES


def fetch_user_messages(
    user_id: str, team_id: str, level_id: str
) -> list[dict[str, Any]]:
    db = SessionLocal()
    db_message_history = (
        db.query(Message)
        .filter(
            Message.user_id == user_id,
            Message.team_id == team_id,
            Message.level_id == level_id,
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    return [
        {
            "id": m.id.__str__(),
            "text": f"$ {m.text}" if m.role.__str__() == "user" else f"> {m.text}",
            "sender": m.role if m.role.__str__() == "user" else "system",
            "timestamp": m.created_at.__str__(),
        }
        for m in db_message_history
    ]


# route for a team to update their current level
@app.post("/api/at-level/{level_id}")
def at_level(
    level_id: str,
    user_id: Annotated[Union[str, None], Header()] = None,
    team_id: Annotated[Union[str, None], Header()] = None,
):
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user id")

    if not team_id:
        raise HTTPException(status_code=401, detail="Invalid team id")

    try:
        UUID(team_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid team id format")

    try:
        UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user id format")

    db = SessionLocal()
    try:
        team: Team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        # all team levels ordered by index
        all_team_levels: List[TeamLevel] = (
            db.query(TeamLevel)
            .filter(TeamLevel.team_id == team_id)
            .order_by(TeamLevel.index.asc())
            .all()
        )

        if not all_team_levels:
            raise HTTPException(status_code=404, detail="No levels found for team")

        # find the current level (first incomplete level)
        current_team_level = None
        for tl in all_team_levels:
            if not tl.completed_at:  # type: ignore
                current_team_level = tl
                break

        if not current_team_level:
            raise HTTPException(status_code=400, detail="All levels completed")

        # if no level_id provided, return current level
        if level_id == "current":
            return JSONResponse(
                content={
                    # TODO: do not show the actual level id
                    "message": f"You are at level {current_team_level.level_id}.",
                    "level_id": str(current_team_level.level_id),
                    "message_history": fetch_user_messages(user_id, team_id, level_id),
                },
                media_type="application/json",
            )

        # if level_id is not a valid UUID, raise error
        try:
            UUID(level_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid level ID format")

        current_index = current_team_level.index
        submitted_level_id = UUID(level_id)

        # check if submitted level is the current or a previous level
        current_and_previous_levels = [tl for tl in all_team_levels if tl.index <= current_index]  # type: ignore
        if any(tl.level_id == submitted_level_id for tl in current_and_previous_levels):
            return JSONResponse(
                content={
                    "message": f"You are at level {current_team_level.level_id}.",
                    "level_id": str(current_team_level.level_id),
                    "message_history": fetch_user_messages(user_id, team_id, level_id),
                },
                media_type="application/json",
            )

        # check if submitted level is the next level
        next_team_level = None
        for tl in all_team_levels:
            if tl.index == current_index + 1:  # type: ignore
                next_team_level = tl
                break

        if next_team_level and next_team_level.level_id == submitted_level_id:  # type: ignore
            # TODO: photo submission
            # mark current level as completed and advance
            db.query(TeamLevel).filter(TeamLevel.id == current_team_level.id).update(
                {"completed_at": datetime.now()}
            )
            db.commit()
            return JSONResponse(
                content={
                    "message": f"Congratulations. You are now at level {next_team_level.level_id}.",
                    "level_id": str(next_team_level.level_id),
                    "message_history": [],  # no messages if new level
                },
                media_type="application/json",
            )

        # wrong level
        raise HTTPException(
            status_code=400,
            detail="You are not at the correct level.",
        )

    except HTTPException as he:
        db.rollback()
        print(f"HTTP error: {str(he.detail)}")
        return JSONResponse(
            content={"error": he.detail},
            media_type="application/json",
            status_code=he.status_code,
        )

    except Exception as e:
        db.rollback()
        print(f"Error getting location: {str(e)}")
        return JSONResponse(
            content={"error": "Error getting location"},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()


# route for when team finishes all levels
@app.post("/api/finish-game/{end_sequence}")
def finish_game(
    end_sequence: str,
    team_id: Annotated[Union[str, None], Header()] = None,
):
    if not team_id:
        raise HTTPException(status_code=401, detail="Invalid team id")

    try:
        UUID(team_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid team id format")

    db = SessionLocal()
    try:
        team: Team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        # load game config to get end sequence
        try:
            with open(f"./fastapi/games/{team.game_id}/config.json", "r") as config_file:
                config_data = json.load(config_file)
                expected_end_sequence = config_data.get("endSequence")
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Game config not found")
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Invalid game config format")

        if not expected_end_sequence:
            raise HTTPException(
                status_code=500, detail="End sequence not configured for this game"
            )

        # validate end sequence
        if end_sequence != expected_end_sequence:
            raise HTTPException(status_code=400, detail="Invalid end sequence key")

        # get all team levels
        all_team_levels: List[TeamLevel] = (
            db.query(TeamLevel)
            .filter(TeamLevel.team_id == team_id)
            .order_by(TeamLevel.index.asc())
            .all()
        )

        if not all_team_levels:
            raise HTTPException(status_code=404, detail="No levels found for team")

        # check if all levels except the last one are completed
        if len(all_team_levels) < 2:
            raise HTTPException(
                status_code=400, detail="Game must have at least 2 levels"
            )

        last_level = all_team_levels[-1]
        all_except_last = all_team_levels[:-1]

        # check if all levels except last are completed
        if not all(tl.completed_at for tl in all_except_last):
            raise HTTPException(
                status_code=400,
                detail="You must complete all previous levels before finishing the game.",
            )

        # check if last level is already completed
        if last_level.completed_at:  # type: ignore
            return JSONResponse(
                content={
                    "message": "Congratulations! You have already completed all levels.",
                },
                media_type="application/json",
            )

        # Mark the last level as completed
        db.query(TeamLevel).filter(TeamLevel.id == last_level.id).update(
            {"completed_at": datetime.now()}
        )
        db.commit()

        return JSONResponse(
            content={
                "message": "Congratulations! You have completed all levels and finished the game!",
            },
            media_type="application/json",
        )

    except HTTPException as he:
        db.rollback()
        print(f"HTTP error: {str(he.detail)}")
        return JSONResponse(
            content={"error": he.detail},
            media_type="application/json",
            status_code=he.status_code,
        )

    except Exception as e:
        db.rollback()
        print(f"Error finishing game: {str(e)}")
        return JSONResponse(
            content={"error": "Error finishing game"},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()


def build_system_prompt(level_data: dict[str, Any], difficulty_level: int) -> str:
    """Build system prompt from structured level data and difficulty level."""
    
    # Select difficulty prompt, defaulting to the highest level if out of bounds
    max_difficulty = max(DIFFICULTY_PROMPTS.keys())
    difficulty = min(difficulty_level, max_difficulty)
    difficulty_prompt_data = DIFFICULTY_PROMPTS.get(difficulty, DIFFICULTY_PROMPTS[max_difficulty])
    difficulty_instructions = difficulty_prompt_data["system_prompt"]

    # Extract persona and level-specific details
    character = level_data.get("character", {})
    location = level_data.get("location", {})
    clues_by_difficulty = level_data.get("clues", {})
    
    # Select the appropriate set of clues based on difficulty
    difficulty_str = str(difficulty)
    if difficulty_str in clues_by_difficulty:
        selected_clues = clues_by_difficulty[difficulty_str]
    else:
        # Default to the hardest available clues if the current difficulty is not explicitly defined
        highest_defined_difficulty = max(clues_by_difficulty.keys(), key=int) if clues_by_difficulty else "0"
        selected_clues = clues_by_difficulty.get(highest_defined_difficulty, [])

    character_name = character.get("name", "A mysterious guide")
    character_personality = character.get("personality", "")
    location_description = location.get("description", "a secret place")

    # Format persona details into text blocks
    clues_text = "You have the following clues to guide them:\n" + "\n".join([f"• {clue}" for clue in selected_clues]) if selected_clues else "You have no clues to give for this location."

    # Combine all parts into the final system prompt
    system_prompt = f"""
{difficulty_instructions}

Here is the context for the current level:

Your Persona:
You are {character_name}.
{character_personality}

The Secret Location:
You are guiding players to '{location_description}'.

Available Clues:
{clues_text}
"""
    return system_prompt.strip()


# route for a team sending a message to llm
@app.post("/api/message")
def message(
    user_id: Annotated[Union[str, None], Header()] = None,
    team_id: Annotated[Union[str, None], Header()] = None,
    request: MessageRequest = Body(...),
):
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user id")

    if not team_id:
        raise HTTPException(status_code=401, detail="Invalid team id")

    try:
        UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user id format")

    try:
        UUID(team_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid team id format")

    db = SessionLocal()
    try:
        # get team
        team: Team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        # get or create user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            user = User(id=UUID(user_id), team_id=team.id)
            db.add(user)
            db.commit()

        # get current team level
        team_level: TeamLevel = (
            db.query(TeamLevel)
            .filter(TeamLevel.team_id == team_id, TeamLevel.completed_at.is_(None))
            .order_by(TeamLevel.index.asc())
            .first()
        )

        if not team_level:
            raise HTTPException(status_code=404, detail="Team level not found")

        # get all messages for current team and level
        user_level_messages: List[Message] = (
            db.query(Message)
            .filter(
                Message.user_id == user_id,
                Message.team_id == team_id,
                Message.level_id == team_level.level_id,
                Message.deleted_at == None,
            )
            .order_by(Message.created_at.asc())
            .all()
        )

        # if latest message is from assistant, user must wait for response
        if user_level_messages and user_level_messages[-1].role == "user":  # type: ignore
            raise HTTPException(
                status_code=400,
                detail="You must wait for the assistant's response before sending a new message.",
            )

        # user message
        user_message: Message = Message(
            user_id=UUID(user_id),
            team_id=team.id,
            game_id=team.game_id,
            level_id=team_level.level_id,
            role="user",
            text=request.prompt,
        )
        db.add(user_message)
        db.commit()

        # combine messages
        history: List[Dict[str, str]] = []
        for message in user_level_messages:
            history.append({"role": message.role, "content": message.text})  # type: ignore
        history.append({"role": "user", "content": request.prompt})

        # load level data and build system prompt
        with open(
            f"./fastapi/games/{team.game_id}/levels/{team_level.level_id}.json", "r"
        ) as level_info:
            if not level_info:
                raise HTTPException(
                    status_code=404, detail="Level information not found."
                )
            level_info_json = json.load(level_info)
            system_prompt = build_system_prompt(level_info_json, team.difficulty_level)

        # Select model based on difficulty
        max_difficulty_model = max(DIFFICULTY_MODEL_IDS.keys())
        model_id = DIFFICULTY_MODEL_IDS.get(team.difficulty_level, DIFFICULTY_MODEL_IDS[max_difficulty_model])

        # call bedrock
        llm_response: str = invoke_llm(
            request_body=json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "messages": history,
                    "max_tokens": level_info_json.get("max_tokens", 512),
                    "system": system_prompt,
                }
            ),
            model_id=model_id,
        )

        llm_response_body: Dict[str, Union[str, List[Dict[str, str]]]] = json.loads(
            llm_response["body"].read()  # type: ignore
        )
        llm_response_text: str = llm_response_body["content"][0]["text"]  # type: ignore

        if not llm_response:
            raise HTTPException(
                status_code=500, detail="Failed to get response from LLM."
            )
        
        # Verify if the location was leaked
        location_name = level_info_json.get("location", {}).get("description", "")
        if location_name and verify_location_leak(llm_response_text, location_name):
            team.difficulty_level += 1
            db.add(team)
            print(f"Team {team.id} difficulty increased to {team.difficulty_level}")

        # create assistant message
        assistant_message: Message = Message(
            user_id=UUID(user_id),
            team_id=team.id,
            game_id=team.game_id,
            level_id=team_level.level_id,
            role="assistant",
            text=llm_response_text,
        )

        db.add(assistant_message)
        db.commit()
        return JSONResponse(
            content={
                "message": "Message sent successfully.",
                "response": llm_response_text,
            },
            media_type="application/json",
        )

    except HTTPException as he:
        db.rollback()
        print(f"HTTP error: {str(he.detail)}")
        return JSONResponse(
            content={"error": he.detail},
            media_type="application/json",
            status_code=he.status_code,
        )

    except Exception as e:
        db.rollback()
        print(f"Error sending message: {str(e)}")
        return JSONResponse(
            content={"error": "Error sending message"},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()


# route for soft deleting current messages
@app.post("/api/clear-chat")
def clear_chat(
    user_id: Annotated[Union[str, None], Header()] = None,
    team_id: Annotated[Union[str, None], Header()] = None,
):

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user id")

    if not team_id:
        raise HTTPException(status_code=401, detail="Invalid team id")

    try:
        UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user id format")

    try:
        UUID(team_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid team id format")

    db = SessionLocal()
    try:
        # get team
        team: Team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        # get current team level
        team_level: TeamLevel = (
            db.query(TeamLevel)
            .filter(TeamLevel.team_id == team_id, TeamLevel.completed_at.is_(None))
            .order_by(TeamLevel.index.asc())
            .first()
        )

        if not team_level:
            raise HTTPException(status_code=404, detail="Team level not found")

        # soft delete previous messages for current user, team and level
        db.query(Message).filter(
            Message.user_id == user_id,
            Message.team_id == team_id,
            Message.level_id == team_level.level_id,
            Message.deleted_at == None,
        ).update({"deleted_at": datetime.now()})

        db.commit()
        return JSONResponse(
            content={
                "message": "Messages cleared successfully.",
            },
            media_type="application/json",
        )

    except HTTPException as he:
        db.rollback()
        print(f"HTTP error: {str(he.detail)}")
        return JSONResponse(
            content={"error": he.detail},
            media_type="application/json",
            status_code=he.status_code,
        )

    except Exception as e:
        db.rollback()
        print(f"Error sending message: {str(e)}")
        return JSONResponse(
            content={"error": "Error sending message"},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()


# route for getting user coordinates
@app.post("/api/ping-coordinates")
def ping_coordinates(
    user_id: Annotated[Union[str, None], Header()] = None,
    team_id: Annotated[Union[str, None], Header()] = None,
    request: PingCoordinatesRequest = Body(...),
):
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user id")

    if not team_id:
        raise HTTPException(status_code=401, detail="Invalid team id")

    try:
        UUID(user_id)
    except:
        raise HTTPException(status_code=401, detail="Invalid user id format")

    try:
        UUID(team_id)
    except:
        raise HTTPException(status_code=401, detail="Invalid team id format")

    db = SessionLocal()
    try:
        # get team
        team: Team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        user: User = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # create coordinate snapshot
        coordinate_snapshot: CoordinateSnapshot = CoordinateSnapshot(
            user_id=user.id,
            team_id=team.id,
            latitude=request.latitude,
            longitude=request.longitude,
        )

        db.add(coordinate_snapshot)
        db.commit()

        return JSONResponse(
            content={
                "message": "Coordinate snapshot created successfully.",
            },
            media_type="application/json",
        )

    except HTTPException as he:
        db.rollback()
        print(f"HTTP error: {str(he.detail)}")
        return JSONResponse(
            content={"error": he.detail},
            media_type="application/json",
            status_code=he.status_code,
        )

    except Exception as e:
        db.rollback()
        print(f"Error sending message: {str(e)}")
        return JSONResponse(
            content={"error": "Error sending message"},
            media_type="application/json",
            status_code=500,
        )
    finally:
        db.close()
