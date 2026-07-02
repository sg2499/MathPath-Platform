import urllib.request
import json
import getpass

def login_and_sync():
    print("=== MathPath Production Gamification Sync ===")
    identifier = input("Admin Email: ")
    password = getpass.getpass("Admin Password: ")

    print("\nLogging in to Production Server...")
    login_url = 'https://mathpath-backend.onrender.com/api/auth/login'
    data = json.dumps({'identifier': identifier, 'password': password}).encode('utf-8')
    req = urllib.request.Request(login_url, data=data, headers={'Content-Type': 'application/json'})
    
    try:
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode('utf-8'))
        token = result.get('accessToken')
        if not token:
            print("❌ Failed: No token received.")
            return
    except Exception as e:
        print("❌ Login failed! Please check your credentials.", e)
        if hasattr(e, 'read'):
            print(e.read().decode('utf-8'))
        return

    print("✅ Logged in successfully!")
    print("\nTriggering Gamification Sync across all students on Production...")
    sync_url = 'https://mathpath-backend.onrender.com/api/admin/gamification/sync-all'
    req = urllib.request.Request(sync_url, data=b'', headers={'Authorization': f'Bearer {token}'})
    
    try:
        response = urllib.request.urlopen(req)
        result = response.read().decode('utf-8')
        print("\n✅ Sync Complete! Server Response:")
        print(result)
        print("\nAll missing badges and stats have been retroactively awarded.")
    except Exception as e:
        print("\n❌ Sync failed!", e)
        if hasattr(e, 'read'):
            print(e.read().decode('utf-8'))

if __name__ == "__main__":
    login_and_sync()
