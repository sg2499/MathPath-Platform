import urllib.request
import json
import getpass

def clear_student_notifications():
    print("=== Wipe Student Notifications ===")
    
    env = input("Environment (1: Localhost, 2: Production) [1]: ").strip()
    if env == '2':
        base_url = 'https://mathpath-backend.onrender.com'
    else:
        base_url = 'http://localhost:8000'

    identifier = input("Admin Email: ")
    password = input("Admin Password (will be visible): ")

    print(f"\nLogging in to {base_url}...")
    login_url = f'{base_url}/api/auth/login'
    data = json.dumps({'identifier': identifier, 'password': password}).encode('utf-8')
    req = urllib.request.Request(login_url, data=data, headers={'Content-Type': 'application/json'})
    
    try:
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode('utf-8'))
        token = result.get('accessToken')
    except Exception as e:
        print("❌ Login failed! Check credentials or server status.")
        return

    student_name = input("\nEnter exact student name to wipe (e.g. Nishant Gantayet): ").strip()
    if not student_name:
        return
        
    print(f"\nLooking up user ID for: {student_name}...")
    students_url = f'{base_url}/api/admin/students'
    req = urllib.request.Request(students_url, headers={'Authorization': f'Bearer {token}'})
    try:
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode('utf-8'))
        
        students = result.get('live_students', [])
        if not students and 'students' in result:
            students = result['students']
            
        target_student = next((s for s in students if student_name.lower() in s.get('full_name', '').lower() or student_name.lower() in s.get('fullName', '').lower()), None)
        
        if not target_student:
            print(f"❌ Student '{student_name}' not found!")
            return
            
        student_id = target_student.get('userId') or target_student.get('id')
        actual_name = target_student.get('full_name', target_student.get('fullName', target_student.get('studentName')))
        print(f"✅ Found {actual_name} with ID: {student_id}")
        
    except Exception as e:
        print("❌ Failed to fetch students!", e)
        return

    print("\nExecuting Database Purge...")
    wipe_url = f'{base_url}/api/notifications/admin/clear/{student_id}'
    req = urllib.request.Request(wipe_url, data=b'', method='DELETE', headers={'Authorization': f'Bearer {token}'})
    
    try:
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode('utf-8'))
        deleted_count = result.get('deleted', 0)
        print(f"\n✅ Target Destroyed! Wiped {deleted_count} ghost notifications for {actual_name}.")
    except Exception as e:
        print("\n❌ Wipe failed!", e)

if __name__ == "__main__":
    clear_student_notifications()
