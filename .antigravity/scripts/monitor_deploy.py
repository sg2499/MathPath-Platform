import json
import os
import sys
import time
import urllib.request
from urllib.error import URLError, HTTPError

def load_config():
    config_path = os.path.join(os.path.dirname(__file__), "..", "deployment_config.json")
    try:
        with open(config_path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"[-] Failed to load deployment config: {e}")
        sys.exit(1)

def check_url(url, expected_status=200):
    try:
        req = urllib.request.Request(
            url, 
            headers={"User-Agent": "MathPath-Deploy-Monitor/1.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.getcode()
            if status == expected_status:
                return True
            else:
                print(f"[*] {url} returned status {status} (expected {expected_status})")
                return False
    except HTTPError as e:
        print(f"[*] {url} HTTP Error: {e.code}")
        return False
    except URLError as e:
        print(f"[*] {url} Connection Error: {e.reason}")
        return False
    except Exception as e:
        print(f"[*] {url} Error: {e}")
        return False

def main():
    config = load_config()
    frontend_url = config.get("vercel_frontend_url")
    backend_url = config.get("render_backend_url")

    if not frontend_url or not backend_url:
        print("[-] Missing URLs in configuration.")
        sys.exit(1)

    backend_health = f"{backend_url.rstrip('/')}/api/health"
    
    print("==================================================")
    print("        MATHPATH DEPLOYMENT MONITOR")
    print("==================================================")
    print(f"[*] Frontend URL: {frontend_url}")
    print(f"[*] Backend Health: {backend_health}")
    print("[*] Starting polling (timeout 360 seconds)...")
    
    start_time = time.time()
    timeout = 360
    poll_interval = 15
    
    backend_ok = False
    frontend_ok = False
    
    while time.time() - start_time < timeout:
        elapsed = int(time.time() - start_time)
        print(f"\n[*] Checking status (Elapsed: {elapsed}s)...")
        
        if not backend_ok:
            print(f"[*] Pinging Backend Health...")
            if check_url(backend_health):
                print("[+] Backend Health is ONLINE and OK!")
                backend_ok = True
            else:
                print("[-] Backend Health is still deploying/offline.")
                
        if not frontend_ok:
            print(f"[*] Pinging Frontend...")
            if check_url(frontend_url):
                print("[+] Frontend is ONLINE and OK!")
                frontend_ok = True
            else:
                print("[-] Frontend is still deploying/offline.")
                
        if backend_ok and frontend_ok:
            print("\n==================================================")
            print("[+] SUCCESS: All services are ONLINE and HEALTHY!")
            print("==================================================")
            sys.exit(0)
            
        time.sleep(poll_interval)
        
    print("\n[-] TIMEOUT: Deployment monitoring timed out after 360 seconds.")
    print("[-] Please check the Render/Vercel dashboards manually.")
    sys.exit(1)

if __name__ == "__main__":
    main()
