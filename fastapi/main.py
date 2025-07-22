import json
import os
import random
from datetime import datetime
from typing import Annotated, Any, Dict, List, Set, Union
from uuid import UUID

from bedrock import invoke_llm
from database import SessionLocal
from dotenv import load_dotenv
from models import CoordinateSnapshot, Game, Level, Message, Team, TeamLevel, User
from pydantic import BaseModel

from fastapi import Body, FastAPI, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()


class CreateGameRequest(BaseModel):
    name: str
    description: str
    level_count: int
    team_count: int
    team_names: Annotated[Union[list[str], None], Form()] = None
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

    # all games need at least 2 levels (start and end)
    if request.level_count < 2:
        raise HTTPException(status_code=400, detail="Level count must be at least 2.")

    db = SessionLocal()
    try:
        new_game = Game(
            name=request.name,
            description=request.description,
        )
        db.add(new_game)
        db.flush()

        levels: List[Level] = [
            Level(game_id=new_game.id) for _ in range(request.level_count)
        ]

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

        os.makedirs(f"./games/{new_game.id}/levels")
        with open(f"./games/{new_game.id}/game.json", "w") as gameFile:
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

    """
    TODO: add a route to upload a json file for each level
    save file to disk at ./levels/{game_id}/{level_id}.json
    {
    "id": UUID,
    "locationName": string,
    "locationInformation": string[],
    "hints": string[],
    "persona": string,
    "systemPrompt": string
    }
    """


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
            with open(f"./games/{team.game_id}/config.json", "r") as config_file:
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


def build_system_prompt(level_data: dict[str, Any]) -> str:
    """Build system prompt from structured level data"""
    character = level_data["character"]
    location = level_data["location"]
    clues = level_data["clues"]
    rules = level_data["rules"]

    catchphrases_text = ", ".join(
        [f"'{phrase}'" for phrase in character["catchphrases"]]
    )
    traits_text = "\n".join([f"- {trait}" for trait in character["traits"]])
    location_details = " ".join(location["details"])
    clues_text = "\n".join([f"• {clue}" for clue in clues])
    rules_text = "\n".join([f"- {rule}" for rule in rules])
    system_prompt = f"""You are {character["name"]}! {character["personality"]}

You're helping students find a specific location - {location["description"]}. {location_details}

CHARACTER TRAITS:
{traits_text}

USE THESE CATCHPHRASES: {catchphrases_text}

AVAILABLE CLUES TO GIVE:
{clues_text}

RULES:
{rules_text}

Help them discover this location through conversation while staying in character!"""

    return system_prompt


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
        level_info = open(
            f"./games/{team.game_id}/levels/{team_level.level_id}.json", "r"
        )
        if not level_info:
            raise HTTPException(status_code=404, detail="Level information not found.")
        level_info_json: Dict[str, Union[str, List[str]]] = json.load(level_info)
        system_prompt = build_system_prompt(level_info_json)

        # call bedrock
        llm_response: str = invoke_llm(
            json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "messages": history,
                    "max_tokens": level_info_json.get("maxTokens", 512),
                    "system": system_prompt,
                }
            )
        )

        llm_response_body: Dict[str, Union[str, List[Dict[str, str]]]] = json.loads(
            llm_response["body"].read()  # type: ignore
        )
        llm_response_text: str = llm_response_body["content"][0]["text"]  # type: ignore

        if not llm_response:
            raise HTTPException(
                status_code=500, detail="Failed to get response from LLM."
            )

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
