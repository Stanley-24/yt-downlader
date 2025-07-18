from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
from youtube_downloader import download_youtube_video
import yt_dlp
import asyncio
from typing import List
from fastapi.responses import FileResponse
from fastapi import Query
import urllib.parse
import tempfile
import shutil
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

# Cookie management
COOKIES_DIR = "cookies"
os.makedirs(COOKIES_DIR, exist_ok=True)

@app.post("/upload-cookies")
async def upload_cookies(cookies_file: UploadFile = File(...)):
    """Upload cookies file for YouTube authentication"""
    try:
        # Validate file type
        if not cookies_file.filename or not cookies_file.filename.endswith('.txt'):
            raise HTTPException(status_code=400, detail="Only .txt files are allowed")
        
        # Save cookies file
        cookies_path = os.path.join(COOKIES_DIR, "user_cookies.txt")
        
        with open(cookies_path, "wb") as buffer:
            shutil.copyfileobj(cookies_file.file, buffer)
        
        return {"message": "Cookies uploaded successfully", "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload cookies: {str(e)}")

@app.get("/cookies-status")
async def get_cookies_status():
    """Check if cookies file exists"""
    env_cookies = os.getenv('YOUTUBE_COOKIES')
    user_cookies = os.path.join(COOKIES_DIR, "user_cookies.txt")
    local_cookies = os.path.join(os.path.dirname(__file__), 'cookies.txt')
    
    has_env = bool(env_cookies)
    has_user = os.path.exists(user_cookies)
    has_local = os.path.exists(local_cookies)
    
    return {
        "cookies_available": has_env or has_user or has_local,
        "environment_cookies": has_env,
        "user_cookies": has_user,
        "local_cookies": has_local,
        "message": "Cookies are available" if (has_env or has_user or has_local) else "No cookies uploaded"
    }

def get_cookies_path():
    """Get cookies from environment variable, user upload, or local file"""
    # First try environment variable (production)
    cookies_env = os.getenv('YOUTUBE_COOKIES')
    if cookies_env:
        try:
            # Remove the YOUTUBE_COOKIES="..." wrapper if present
            if cookies_env.startswith('YOUTUBE_COOKIES="') and cookies_env.endswith('"'):
                cookies_env = cookies_env[16:-1]  # Remove YOUTUBE_COOKIES=" and trailing "
            
            # Unescape the content
            cookies_content = cookies_env.replace('\\n', '\n').replace('\\"', '"')
            
            # Create temporary file from environment variable
            temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
            temp_file.write(cookies_content)
            temp_file.close()
            return temp_file.name
        except Exception as e:
            print(f"Error processing environment cookies: {e}")
    
    # Second try user-uploaded cookies
    user_cookies = os.path.join(COOKIES_DIR, "user_cookies.txt")
    if os.path.exists(user_cookies):
        return user_cookies
    
    # Fallback to local file (development)
    from youtube_downloader import COOKIES_PATH
    if os.path.exists(COOKIES_PATH):
        return COOKIES_PATH
    
    return None

def handle_yt_dlp_error(error_msg):
    """Handle yt-dlp errors and return user-friendly messages"""
    error_lower = error_msg.lower()
    
    if "sign in to confirm you're not a bot" in error_lower:
        return "Sign-in required for this video. Please upload YouTube cookies to download age-restricted content."
    elif "sign in" in error_lower and "bot" in error_lower:
        return "Authentication required. Please upload YouTube cookies to access this video."
    elif "private" in error_lower:
        return "This video is private and requires authentication."
    elif "age restricted" in error_lower:
        return "This video is age-restricted. Please upload YouTube cookies to download it."
    elif "cookies" in error_lower and "netscape" in error_lower:
        return "Cookie format error. Please use the correct Netscape format cookies."
    elif "unavailable" in error_lower:
        return "This video is unavailable in your region or requires authentication."
    else:
        return f"Download failed: {error_msg}"

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
            cookies_path = get_cookies_path()
            if cookies_path:
                ydl_opts['cookiefile'] = cookies_path  # type: ignore
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        try:
            await asyncio.to_thread(download_with_hook, url, req.download_dir)
            # Find the merged .mp4 file in the download_dir
            mp4_files = []
            for fname in os.listdir(req.download_dir):
                if fname.endswith('.mp4'):
                    mp4_files.append(fname)
            
            # Sort by modification time (newest first) to get the most recent file
            mp4_files.sort(key=lambda x: os.path.getmtime(os.path.join(req.download_dir, x)), reverse=True)
            
            if mp4_files:
                # Use the most recent .mp4 file (should be the merged one)
                merged_file = mp4_files[0]
                results.append({
                    "url": url,
                    "status": "success",
                    "filename": merged_file,
                    "downloadDir": req.download_dir
                })
            else:
                results.append({"url": url, "status": "error", "reason": "Merged file not found"})
        except Exception as e:
            error_msg = str(e)
            friendly_error = handle_yt_dlp_error(error_msg)
            results.append({"url": url, "status": "error", "error": friendly_error})
    return {"status": "completed", "results": results}

@app.post("/metadata")
async def get_metadata(req: MetadataRequest):
    try:
        ydl_opts = {'quiet': True}
        cookies_path = get_cookies_path()
        if cookies_path:
            print(f"Using cookies from: {'environment variable' if os.getenv('YOUTUBE_COOKIES') else 'local file'}")  # Diagnostic log
            ydl_opts['cookiefile'] = cookies_path  # type: ignore
        else:
            print("No cookies available - some videos may not work")  # Diagnostic log
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
            if info is None:
                return {'title': '', 'thumbnail': ''}
            return {
                'title': info.get('title', ''),
                'thumbnail': info.get('thumbnail', '')
            }
    except Exception as e:
        error_msg = str(e)
        print(f"yt-dlp error: {error_msg}")  # Add this for extra debugging
        friendly_error = handle_yt_dlp_error(error_msg)
        raise HTTPException(status_code=500, detail=friendly_error)


DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def normalize_filename(filename: str):
    # Strip .fXXX formats from filename
    if '.f' in filename and filename.endswith('.mp4'):
        parts = filename.split('.f')
        return parts[0] + '.mp4'
    return filename

@app.get("/downloaded-file")
def get_downloaded_file(
    filename: str = Query(..., description="Name of the file to download"),
    download_dir: str = DOWNLOAD_DIR
):
    safe_filename = urllib.parse.unquote(filename)
    cleaned_filename = normalize_filename(safe_filename)
    file_path = os.path.join(download_dir, cleaned_filename)
    
    print(f"Looking for file: {file_path}")  # Server log for debugging
    
    if not os.path.exists(file_path):
        # Try to find similar files in case of format suffix issues
        base_name = cleaned_filename.replace('.mp4', '')
        for fname in os.listdir(download_dir):
            if fname.startswith(base_name) and fname.endswith('.mp4'):
                file_path = os.path.join(download_dir, fname)
                cleaned_filename = fname
                print(f"Found alternative file: {file_path}")
                break
        else:
            raise HTTPException(status_code=404, detail=f"File not found: {cleaned_filename}")

    return FileResponse(
        path=file_path,
        filename=cleaned_filename,
        media_type="application/octet-stream"
    )
