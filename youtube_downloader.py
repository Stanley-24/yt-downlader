try:
    import yt_dlp
except ImportError:
    print("❌ Error: The 'yt_dlp' module is not installed. Please install it with 'pip install yt-dlp'.")
    exit(1)

import os

# To download age-restricted/private videos, export your YouTube cookies as cookies.txt and place it in the project root.
COOKIES_PATH = os.path.join(os.path.dirname(__file__), 'cookies.txt')

def download_youtube_video(url, download_dir):
    os.makedirs(download_dir, exist_ok=True)
    ydl_opts = {
        'format': 'bestvideo+bestaudio/best',
        'merge_output_format': 'mp4',
        'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
        'quiet': False,
        'noplaylist': True,
    }
    if os.path.exists(COOKIES_PATH):
        ydl_opts['cookiefile'] = COOKIES_PATH
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
