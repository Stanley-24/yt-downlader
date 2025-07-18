#!/usr/bin/env python3
"""
YouTube Cookies Export Script
============================

This script helps you export YouTube cookies for production deployment.

Instructions:
1. Install the required browser extension:
   - Chrome: "Get cookies.txt LOCALLY" extension
   - Firefox: "cookies.txt" extension

2. Go to YouTube and make sure you're logged in

3. Use the extension to export cookies to a file

4. Run this script to convert the file to environment variable format
"""

import os
import sys

def convert_cookies_to_env(cookies_file_path):
    """Convert cookies.txt file to environment variable format"""
    try:
        with open(cookies_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Escape newlines and quotes for environment variable
        escaped_content = content.replace('\n', '\\n').replace('"', '\\"')
        
        print("=" * 60)
        print("YOUTUBE_COOKIES Environment Variable")
        print("=" * 60)
        print(f'YOUTUBE_COOKIES="{escaped_content}"')
        print("=" * 60)
        print("\nInstructions:")
        print("1. Copy the above YOUTUBE_COOKIES value")
        print("2. Go to your Render.com dashboard")
        print("3. Navigate to your app's Environment section")
        print("4. Add a new environment variable:")
        print("   - Key: YOUTUBE_COOKIES")
        print("   - Value: (paste the copied value)")
        print("5. Save and redeploy your app")
        print("\nNote: Keep your cookies secure and don't share them publicly!")
        
    except FileNotFoundError:
        print(f"❌ Error: File '{cookies_file_path}' not found")
        print("Please make sure the cookies.txt file exists in the current directory")
    except Exception as e:
        print(f"❌ Error: {e}")

def main():
    if len(sys.argv) > 1:
        cookies_file = sys.argv[1]
    else:
        cookies_file = "cookies.txt"
    
    print("🍪 YouTube Cookies Export Tool")
    print("=" * 40)
    
    if not os.path.exists(cookies_file):
        print(f"❌ Cookies file '{cookies_file}' not found!")
        print("\nTo get cookies:")
        print("1. Install 'Get cookies.txt LOCALLY' extension in Chrome")
        print("2. Go to YouTube and log in")
        print("3. Use the extension to export cookies to 'cookies.txt'")
        print("4. Run this script again")
        return
    
    convert_cookies_to_env(cookies_file)

if __name__ == "__main__":
    main() 