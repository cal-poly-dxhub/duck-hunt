import os, requests, pandas as pd, streamlit as st
from dotenv import load_dotenv
import folium
from streamlit_folium import st_folium
import hashlib, colorsys

CAMPUS_LAT, CAMPUS_LON = 35.300, -120.662      # approx centre of campus :contentReference[oaicite:1]{index=1}

def team_colour(team_id: str) -> str:
    """Stable hex colour derived from team UUID – identical on every refresh."""
    h = int(hashlib.md5(team_id.encode()).hexdigest()[:6], 16)   # hash to 24 bits
    # convert to nicer pastel-ish colours by fixing saturation/value
    r, g, b = colorsys.hsv_to_rgb((h % 360)/360, 0.6, 0.9)
    return "#{:02x}{:02x}{:02x}".format(int(r*255), int(g*255), int(b*255))  # idea adapted :contentReference[oaicite:2]{index=2}

load_dotenv()
API = os.getenv("API_BASE_URL", "http://localhost:8000")
HEADERS = {"ADMIN_API_KEY": os.getenv("ADMIN_API_KEY")} if os.getenv("ADMIN_API_KEY") else {}

st.set_page_config(page_title="Duck Hunt Admin", layout="wide")
st.title("Duck Hunt Admin Dashboard")

@st.cache_data(ttl=5)
def get_json(path):                       # small wrapper to keep code DRY
    return requests.get(f"{API}{path}", headers=HEADERS, timeout=5).json()

@st.cache_data(ttl=5)
def teams():          return get_json("/teams")
@st.cache_data(ttl=5)
def users(t):         return get_json(f"/teams/{t}/users")
@st.cache_data(ttl=5)
def progress(t):      return get_json(f"/teams/{t}/progress")
@st.cache_data(ttl=5)
def coords(t):        return get_json(f"/teams/{t}/coords")


team_df = pd.DataFrame(teams())
picked   = st.multiselect("Visible teams", team_df["name"], default=team_df["name"])

tab1, tab2 = st.tabs(["Coordinates", "Progress"])

with tab1:
    full_df = []
    for _, row in team_df[team_df["name"].isin(picked)].iterrows():
        d = pd.DataFrame(coords(row["id"]))
        if not d.empty:
            d["team_id"] = row["id"]
            d["team"] = row["name"]
            full_df.append(d)

    if full_df:
        df = pd.concat(full_df, ignore_index=True)

        # folium map centred on campus
        fmap = folium.Map(location=[CAMPUS_LAT, CAMPUS_LON], zoom_start=16, tiles="OpenStreetMap")  # tiles doc :contentReference[oaicite:3]{index=3}

        # add pins
        for r in df.itertuples():
            folium.CircleMarker(
                [r.lat, r.lon],
                radius=8,                                                  
                color=team_colour(r.team_id),
                fill=True, fill_opacity=0.9,
                tooltip=f"{r.team} – {r.user_id[:8]}",
            ).add_to(fmap)

        # draw map in Streamlit
        st_folium(fmap, width="100%", height=600)                        
    else:
        st.info("No coordinate snapshots yet for the selected team(s).")

with tab2:
    rows = [
        {"team": r["name"], **progress(r["id"])}
        for _, r in team_df[team_df["name"].isin(picked)].iterrows()
    ]
    progress_df = pd.DataFrame(rows)
    if progress_df.empty:
        st.info("No progress data yet.")
    else:
        progress_df["pct"] = progress_df["done"] / progress_df["total"].replace(0, 1)
        col1, col2 = st.columns([2, 1])                                
        with col1:
            st.subheader("Progress")
            for r in progress_df.itertuples():
                st.progress(r.pct, text=f"{r.team}: {r.done}/{r.total}")  
        with col2:
            st.dataframe(progress_df.drop(columns=["pct"]), use_container_width=True)
