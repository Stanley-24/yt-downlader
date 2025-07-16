from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
from youtube_downloader import download_youtube_video
import yt_dlp
import asyncio
from typing import List
main_loop = asyncio.get_event_loop()

app = FastAPI()

# Allow CORS for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DownloadRequest(BaseModel):
    urls: List[str]
    download_dir: str

class MetadataRequest(BaseModel):
    url: str

# Store websocket connections
progress_connections = set()

@app.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    await websocket.accept()
    progress_connections.add(websocket)
    try:
        while True:
            await asyncio.sleep(1)  # Keep alive
    except WebSocketDisconnect:
        progress_connections.remove(websocket)

@app.get("/")
async def root():
    return {"Details": " App is running"}

@app.post("/download")
async def download_video(req: DownloadRequest):
    results = []
    for url in req.urls:
        async def progress_hook(d):
            if d['status'] == 'downloading':
                percent = d.get('downloaded_bytes', 0) / d.get('total_bytes', 1) * 100 if d.get('total_bytes') else 0
                msg = {
                    'status': d['status'],
                    'filename': d.get('filename', ''),
                    'percent': percent,
                    'speed': d.get('speed', 0),
                    'eta': d.get('eta', 0),
                    'downloaded_bytes': d.get('downloaded_bytes', 0),
                    'total_bytes': d.get('total_bytes', 0),
                    'url': url,
                }
                for ws in list(progress_connections):
                    try:
                        await ws.send_json(msg)
                    except Exception:
                        progress_connections.remove(ws)
            elif d['status'] == 'finished':
                msg = {'status': 'finished', 'filename': d.get('filename', ''), 'url': url}
                for ws in list(progress_connections):
                    try:
                        await ws.send_json(msg)
                    except Exception:
                        progress_connections.remove(ws)
        def sync_progress_hook(d):
            asyncio.run_coroutine_threadsafe(progress_hook(d), main_loop)
        def download_with_hook(url, download_dir):
            os.makedirs(download_dir, exist_ok=True)
            ydl_opts = {
                'format': 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
                'merge_output_format': 'mp4',
                'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
                'quiet': False,
                'noplaylist': True,
                'progress_hooks': [sync_progress_hook],
            }
            from youtube_downloader import COOKIES_PATH
            if os.path.exists(COOKIES_PATH):
                ydl_opts['cookiefile'] = COOKIES_PATH  # type: ignore
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        try:
            await asyncio.to_thread(download_with_hook, url, req.download_dir)
            results.append({"url": url, "status": "success"})
        except Exception as e:
            results.append({"url": url, "status": "error", "error": str(e)})
    return {"status": "completed", "results": results}

@app.post("/metadata")
async def get_metadata(req: MetadataRequest):
    try:
        import os
        from youtube_downloader import COOKIES_PATH
        ydl_opts = {'quiet': True}
        if os.path.exists(COOKIES_PATH):
            print(f"Using cookies file at: {COOKIES_PATH}")  # Diagnostic log
            ydl_opts['cookiefile'] = COOKIES_PATH  # type: ignore
        else:
            print(f"Cookies file not found at: {COOKIES_PATH}")  # Diagnostic log
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
            if info is None:
                return {'title': '', 'thumbnail': ''}
            return {
                'title': info.get('title', ''),
                'thumbnail': info.get('thumbnail', '')
            }
    except Exception as e:
        print(f"yt-dlp error: {e}")  # Add this for extra debugging
        raise HTTPException(status_code=500, detail=str(e)) 